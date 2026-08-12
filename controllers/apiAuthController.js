import {
  matchedData,
  validationResult
} from "express-validator";

import { getActiveBusinessMembership } from "../db/businessQueries.js";
import {
  serializeActiveBusiness,
  serializeMembership,
  sessionPermissions
} from "./apiSessionController.js";
import { authenticateLogin } from "../services/authenticationService.js";

function validationFields(errors) {
  return errors.map((error) => ({
    field: error.path,
    message: error.msg
  }));
}

export async function login(req, res, next) {
  const validationErrors = validationResult(req);

  if (!validationErrors.isEmpty()) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Revisa los campos enviados.",
        fields: validationFields(validationErrors.array())
      }
    });
  }

  const { identifier, password } = matchedData(req);

  try {
    const result = await authenticateLogin(req, { identifier, password });

    if (!result) {
      return res.status(401).json({
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Usuario, correo o contraseña incorrectos."
        }
      });
    }

    let activeBusiness = null;
    let membership = null;

    if (result.activeBusinessId) {
      const activeMembership = await getActiveBusinessMembership(
        result.user.id,
        result.activeBusinessId
      );

      if (activeMembership) {
        activeBusiness = serializeActiveBusiness(activeMembership);
        membership = serializeMembership(activeMembership);
      }
    }

    return res.status(200).json({
      data: {
        user: result.user,
        businesses: result.businesses.map((business) => ({
          id: business.id,
          name: business.name,
          slug: business.slug,
          role: business.role,
          membershipStatus: business.membership_status
        })),
        activeBusiness,
        membership,
        permissions: sessionPermissions(membership, result.user.platformRole),
        requiresBusinessSelection: result.requiresBusinessSelection
      }
    });
  } catch (error) {
    return next(error);
  }
}

export function logout(req, res, next) {
  req.session.destroy((error) => {
    if (error) {
      return next(error);
    }

    res.clearCookie("boxing_inventory_session", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production"
    });

    return res.status(204).send();
  });
}

import {
  matchedData,
  validationResult
} from "express-validator";

import { getActiveBusinessMembership } from "../db/businessQueries.js";
import { authenticateLogin } from "../services/authenticationService.js";

function permissions(membership, platformRole) {
  return {
    canManageInventory: ["owner", "manager"].includes(membership?.role),
    canDeleteInventory: membership?.role === "owner",
    isSuperAdmin: platformRole === "super_admin"
  };
}

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
        activeBusiness = {
          id: activeMembership.id,
          name: activeMembership.name,
          slug: activeMembership.slug,
          currency: activeMembership.currency,
          timezone: activeMembership.timezone,
          status: activeMembership.status
        };
        membership = {
          role: activeMembership.role,
          status: activeMembership.membership_status
        };
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
        permissions: permissions(membership, result.user.platformRole),
        requiresBusinessSelection: result.requiresBusinessSelection
      }
    });
  } catch (error) {
    return next(error);
  }
}

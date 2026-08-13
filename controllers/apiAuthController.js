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
import {
  authenticateLogin,
  establishAuthenticatedSession,
  registerAccount
} from "../services/authenticationService.js";

function validationFields(errors) {
  return errors.map((error) => ({
    field: error.path,
    message: error.msg
  }));
}

function registrationConflict(res, conflicts) {
  const fields = conflicts.map((conflict) => ({
    field: conflict.field,
    message: conflict.message
  }));
  const codes = new Set(fields.map((field) => field.field));
  const code = codes.size === 1 && codes.has("username")
    ? "USERNAME_ALREADY_EXISTS"
    : codes.size === 1 && codes.has("email")
      ? "EMAIL_ALREADY_EXISTS"
      : "REGISTRATION_CONFLICT";
  return res.status(409).json({
    error: {
      code,
      message: "El usuario o correo ya está registrado.",
      fields
    }
  });
}

export async function register(req, res, next) {
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

  const { username, email, password } = matchedData(req);
  try {
    const registration = await registerAccount({ username, email, password });
    if (registration.conflicts) return registrationConflict(res, registration.conflicts);

    const user = await establishAuthenticatedSession(req, registration.user);
    return res.status(201).json({
      data: {
        user,
        businesses: [],
        activeBusiness: null,
        membership: null,
        permissions: sessionPermissions(null, user.platformRole),
        requiresBusinessSelection: false
      }
    });
  } catch (error) {
    return next(error);
  }
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

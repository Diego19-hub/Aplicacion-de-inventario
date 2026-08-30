import {
  getActiveBusinessesForUser,
  getActiveBusinessMembership
} from "../db/businessQueries.js";
import {
  serializeActiveBusiness,
  serializeMembership,
  sessionPermissions
} from "./apiSessionController.js";

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function serializeBusiness(business) {
  return {
    id: business.id,
    name: business.name,
    slug: business.slug,
    currency: business.currency,
    timezone: business.timezone,
    role: business.role
  };
}

export async function listBusinesses(req, res, next) {
  try {
    const businesses = await getActiveBusinessesForUser(req.session.user.id);

    if (process.env.NODE_ENV !== "production") {
      console.info("[INVITATION BUSINESSES]", {
        authenticatedUserId: req.session.user.id,
        businessesFound: businesses.map((business) => business.id),
        activeBusinessId: req.session.activeBusinessId ?? null,
        redirectPath: businesses.length === 1 ? "/app" : "/select-business"
      });
    }

    return res.status(200).json({
      data: businesses.map(serializeBusiness)
    });
  } catch (error) {
    return next(error);
  }
}

export async function selectActiveBusiness(req, res, next) {
  const { businessId } = req.body;

  if (!Number.isInteger(businessId) || businessId < 1) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Revisa los campos enviados.",
        fields: [
          {
            field: "businessId",
            message: "Selecciona un negocio válido."
          }
        ]
      }
    });
  }

  try {
    const activeMembership = await getActiveBusinessMembership(
      req.session.user.id,
      businessId
    );

    if (!activeMembership) {
      return res.status(404).json({
        error: {
          code: "BUSINESS_NOT_FOUND",
          message: "No se encontró el negocio solicitado."
        }
      });
    }

    req.session.activeBusinessId = activeMembership.id;
    await saveSession(req);

    const membership = serializeMembership(activeMembership);

    return res.status(200).json({
      data: {
        activeBusiness: serializeActiveBusiness(activeMembership),
        membership,
        permissions: sessionPermissions(membership, req.session.user.platformRole)
      }
    });
  } catch (error) {
    return next(error);
  }
}

import { getActiveBusinessMembership } from "../db/businessQueries.js";
import {
  serializeActiveBusiness,
  serializeMembership
} from "../controllers/apiSessionController.js";

export async function requireApiActiveBusiness(req, res, next) {
  const businessId = Number(req.session.activeBusinessId);

  if (!Number.isInteger(businessId) || businessId < 1) {
    return res.status(409).json({
      error: {
        code: "ACTIVE_BUSINESS_REQUIRED",
        message: "Selecciona un negocio activo para continuar."
      }
    });
  }

  try {
    const activeMembership = await getActiveBusinessMembership(req.session.user.id, businessId);

    if (!activeMembership) {
      return res.status(409).json({
        error: {
          code: "ACTIVE_BUSINESS_REQUIRED",
          message: "Selecciona un negocio activo para continuar."
        }
      });
    }

    req.business = serializeActiveBusiness(activeMembership);
    req.membership = serializeMembership(activeMembership);
    return next();
  } catch (error) {
    return next(error);
  }
}

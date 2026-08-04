import AppError from "../utils/AppError.js";
import { getActiveBusinessMembership } from "../db/businessQueries.js";

export function requireAuth(req, res, next) {
  if (req.session.user) {
    return next();
  }

  // Solo guardamos rutas GET para evitar redirigir después a un endpoint POST.
  req.session.returnTo =
    req.method === "GET" ? req.originalUrl : "/";

  req.session.save((error) => {
    if (error) {
      return next(error);
    }

    res.redirect("/auth/login");
  });
}

export function requireSuperAdmin(req, res, next) {
  if (req.session.user?.platformRole === "super_admin") {
    return next();
  }

  return next(new AppError("No tienes permisos de superadministración.", 403));
}

export async function requireActiveBusiness(req, res, next) {
  if (!req.session.user) {
    return requireAuth(req, res, next);
  }

  const businessId = Number(req.session.activeBusinessId);

  if (!Number.isInteger(businessId) || businessId < 1) {
    return res.redirect("/businesses/select");
  }

  try {
    const membership = await getActiveBusinessMembership(
      req.session.user.id,
      businessId
    );

    if (!membership) {
      delete req.session.activeBusinessId;
      return req.session.save((error) => {
        if (error) return next(error);
        res.redirect("/businesses/select");
      });
    }

    req.business = {
      id: membership.id,
      name: membership.name,
      slug: membership.slug,
      currency: membership.currency,
      timezone: membership.timezone,
      status: membership.status
    };
    req.membership = {
      id: membership.membership_id,
      role: membership.role,
      status: membership.membership_status
    };
    res.locals.currentBusiness = req.business;
    res.locals.currentMembership = req.membership;
    res.locals.canManageInventory = ["owner", "manager"].includes(
      req.membership.role
    );
    res.locals.canDeleteInventory = ["owner"].includes(
      req.membership.role
    );

    next();
  } catch (error) {
    next(error);
  }
}

export function requireBusinessRole(...roles) {
  return (req, res, next) => {
    if (!req.membership) {
      return next(new AppError("Selecciona un negocio activo antes de continuar.", 403));
    }

    if (!roles.includes(req.membership.role)) {
      return next(new AppError("No tienes permisos para realizar esta acción.", 403));
    }

    next();
  };
}

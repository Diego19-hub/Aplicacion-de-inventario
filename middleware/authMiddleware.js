import AppError from "../utils/AppError.js";

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

export function requireAdmin(req, res, next) {
  if (!req.session.user) {
    return requireAuth(req, res, next);
  }

  if (req.session.user.role !== "admin") {
    return next(
      new AppError(
        "No tienes permisos para realizar esta acción.",
        403
      )
    );
  }

  next();
}
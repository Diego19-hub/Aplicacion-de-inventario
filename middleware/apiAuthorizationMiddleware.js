export function requireApiBusinessRole(...roles) {
  return (req, res, next) => {
    if (req.membership && roles.includes(req.membership.role)) {
      return next();
    }

    return res.status(403).json({
      error: {
        code: "FORBIDDEN",
        message: "No tienes permisos para realizar esta acción."
      }
    });
  };
}

export function requireApiSuperAdmin(req, res, next) {
  if (req.session.user?.platformRole === "super_admin") return next();
  return res.status(403).json({ error: { code: "SUPER_ADMIN_REQUIRED", message: "No tienes permisos de superadministración." } });
}

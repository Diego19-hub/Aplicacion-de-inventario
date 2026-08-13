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

export function requireApiAuth(req, res, next) {
  if (req.session.user) {
    return next();
  }

  return res.status(401).json({
    error: {
      code: "AUTH_REQUIRED",
      message: "Inicia sesión para continuar."
    }
  });
}

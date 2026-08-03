import AppError from "../utils/AppError.js";

export function notFoundHandler(req, res, next) {
  next(
    new AppError(
      `No se encontró la ruta ${req.method} ${req.originalUrl}`,
      404
    )
  );
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  const statusCode = error.statusCode || 500;

  console.error(error);

  if (statusCode === 404) {
    return res.status(404).render("404", {
      title: "Página no encontrada",
      message: error.message
    });
  }

  res.status(statusCode).render("error", {
    title: "Error",
    statusCode,
    message:
      statusCode === 500
        ? "Ocurrió un error interno. Inténtalo nuevamente."
        : error.message
  });
}
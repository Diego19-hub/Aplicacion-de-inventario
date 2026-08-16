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

  const codeByStatus = {
    400: "VALIDATION_ERROR",
    401: "AUTH_REQUIRED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "CONFLICT",
    429: "RATE_LIMITED"
  };

  return res.status(statusCode).json({
    error: {
      code: codeByStatus[statusCode] ?? "INTERNAL_ERROR",
      message:
        statusCode === 500
          ? "Ocurrió un error interno."
          : error.message
    }
  });
}

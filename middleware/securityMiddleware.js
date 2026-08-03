import { rateLimit } from "express-rate-limit";
import AppError from "../utils/AppError.js";

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,

  standardHeaders: "draft-8",
  legacyHeaders: false,

  // Los intentos exitosos no cuentan para bloquear al usuario.
  skipSuccessfulRequests: true,

  handler(req, res, next) {
    next(
      new AppError(
        "Demasiados intentos. Espera 15 minutos antes de volver a intentarlo.",
        429
      )
    );
  }
});
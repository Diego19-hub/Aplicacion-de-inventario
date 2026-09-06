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

export const invitationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler(req, res, next) {
    next(new AppError("Demasiadas solicitudes de invitación. Inténtalo más tarde.", 429));
  }
});

export function createScopedLimiter(limit, message) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler(req, res, next) {
      next(new AppError(message, 429));
    }
  });
}

// Límites deliberadamente amplios para proteger ráfagas anómalas sin impedir
// una jornada normal de ventas o captura de inventario.
export const salesLimiter = createScopedLimiter(
  120,
  "Demasiadas ventas en poco tiempo. Espera unos minutos antes de continuar."
);

export const inventoryMutationLimiter = createScopedLimiter(
  180,
  "Demasiados movimientos de inventario en poco tiempo. Espera unos minutos antes de continuar."
);

export const reportLimiter = createScopedLimiter(
  120,
  "Demasiadas consultas de reportes en poco tiempo. Espera unos minutos antes de continuar."
);

export const adminMutationLimiter = createScopedLimiter(
  60,
  "Demasiadas operaciones administrativas en poco tiempo. Espera unos minutos antes de continuar."
);

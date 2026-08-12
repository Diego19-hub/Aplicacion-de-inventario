import { Router } from "express";

import {
  getCsrfToken,
  getSession
} from "../controllers/apiSessionController.js";
import { login } from "../controllers/apiAuthController.js";
import { loginValidation } from "../middleware/authValidation.js";
import { authLimiter } from "../middleware/securityMiddleware.js";

const apiRouter = Router();

apiRouter.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

apiRouter.get("/csrf-token", getCsrfToken);
apiRouter.get("/session", getSession);
apiRouter.post("/auth/login", loginValidation, authLimiter, login);

apiRouter.use((req, res) => {
  res.status(404).json({
    error: {
      code: "RESOURCE_NOT_FOUND",
      message: "Recurso no encontrado."
    }
  });
});

apiRouter.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  if (error.code === "EBADCSRFTOKEN") {
    return res.status(403).json({
      error: {
        code: "CSRF_INVALID",
        message: "El token CSRF es inválido."
      }
    });
  }

  if (error.statusCode === 429) {
    return res.status(429).json({
      error: {
        code: "RATE_LIMITED",
        message: "Demasiados intentos. Espera 15 minutos antes de volver a intentarlo."
      }
    });
  }

  return res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Ocurrió un error interno."
    }
  });
});

export default apiRouter;

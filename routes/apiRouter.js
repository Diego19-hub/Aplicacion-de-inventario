import { Router } from "express";

import {
  getCsrfToken,
  getSession
} from "../controllers/apiSessionController.js";

const apiRouter = Router();

apiRouter.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

apiRouter.get("/csrf-token", getCsrfToken);
apiRouter.get("/session", getSession);

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

  return res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Ocurrió un error interno."
    }
  });
});

export default apiRouter;

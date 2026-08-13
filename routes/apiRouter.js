import { Router } from "express";

import {
  getCsrfToken,
  getSession
} from "../controllers/apiSessionController.js";
import {
  login,
  logout
} from "../controllers/apiAuthController.js";
import {
  listBusinesses,
  selectActiveBusiness
} from "../controllers/apiBusinessController.js";
import { getDashboard } from "../controllers/apiDashboardController.js";
import {
  archiveProduct,
  createProduct,
  getProductForEdit,
  getProductFormOptions,
  listProducts,
  updateProduct
} from "../controllers/apiProductsController.js";
import { getProductDetails } from "../controllers/apiProductDetailsController.js";
import { getProductMovements } from "../controllers/apiProductMovementsController.js";
import {
  getArchivedProductDetails,
  listArchivedProducts,
  restoreArchivedProduct
} from "../controllers/apiArchivedProductsController.js";
import { loginValidation } from "../middleware/authValidation.js";
import { requireApiAuth } from "../middleware/apiAuthMiddleware.js";
import { requireApiActiveBusiness } from "../middleware/apiActiveBusinessMiddleware.js";
import { requireApiBusinessRole } from "../middleware/apiAuthorizationMiddleware.js";
import {
  apiArchiveItemValidation,
  apiItemUpdateValidation,
  apiItemValidation
} from "../middleware/itemValidation.js";
import { authLimiter } from "../middleware/securityMiddleware.js";

const apiRouter = Router();

apiRouter.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

apiRouter.get("/csrf-token", getCsrfToken);
apiRouter.get("/session", getSession);
apiRouter.post("/auth/login", loginValidation, authLimiter, login);
apiRouter.post("/auth/logout", logout);
apiRouter.get("/businesses", requireApiAuth, listBusinesses);
apiRouter.put("/session/active-business", requireApiAuth, selectActiveBusiness);
apiRouter.get("/dashboard", requireApiAuth, requireApiActiveBusiness, getDashboard);
apiRouter.get("/products", requireApiAuth, requireApiActiveBusiness, listProducts);
apiRouter.get(
  "/products/archived",
  requireApiAuth,
  requireApiActiveBusiness,
  requireApiBusinessRole("owner"),
  listArchivedProducts
);
apiRouter.get(
  "/products/form-options",
  requireApiAuth,
  requireApiActiveBusiness,
  requireApiBusinessRole("owner", "manager"),
  getProductFormOptions
);
apiRouter.post(
  "/products",
  requireApiAuth,
  requireApiActiveBusiness,
  requireApiBusinessRole("owner", "manager"),
  apiItemValidation,
  createProduct
);
apiRouter.get(
  "/products/:productId/edit",
  requireApiAuth,
  requireApiActiveBusiness,
  requireApiBusinessRole("owner", "manager"),
  getProductForEdit
);
apiRouter.put(
  "/products/:productId",
  requireApiAuth,
  requireApiActiveBusiness,
  requireApiBusinessRole("owner", "manager"),
  apiItemUpdateValidation,
  updateProduct
);
apiRouter.post(
  "/products/:productId/archive",
  requireApiAuth,
  requireApiActiveBusiness,
  requireApiBusinessRole("owner"),
  apiArchiveItemValidation,
  archiveProduct
);
apiRouter.get(
  "/products/:productId/archived",
  requireApiAuth,
  requireApiActiveBusiness,
  requireApiBusinessRole("owner"),
  getArchivedProductDetails
);
apiRouter.post(
  "/products/:productId/restore",
  requireApiAuth,
  requireApiActiveBusiness,
  requireApiBusinessRole("owner"),
  restoreArchivedProduct
);
apiRouter.get(
  "/products/:productId/movements",
  requireApiAuth,
  requireApiActiveBusiness,
  requireApiBusinessRole("owner", "manager", "viewer"),
  getProductMovements
);
apiRouter.get("/products/:productId", requireApiAuth, requireApiActiveBusiness, getProductDetails);

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

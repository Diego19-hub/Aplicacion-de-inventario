import { Router } from "express";

import {
  requireAuth,
  requireActiveBusiness,
  requireBusinessRole
} from "../middleware/authMiddleware.js";

import {
  supplierValidation
} from "../middleware/supplierValidation.js";

import * as suppliersController from "../controllers/suppliersController.js";

const suppliersRouter = Router();

function setSupplierAction(action) {
  return (req, res, next) => {
    req.params.action = action;
    next();
  };
}

suppliersRouter.use(
  requireAuth,
  requireActiveBusiness
);

suppliersRouter.get(
  "/",
  suppliersController.showSuppliers
);

suppliersRouter.get(
  "/new",
  requireBusinessRole("owner", "manager"),
  suppliersController.showNew
);

suppliersRouter.post(
  "/new",
  requireBusinessRole("owner", "manager"),
  supplierValidation,
  suppliersController.addSupplier
);

suppliersRouter.get(
  "/:id/edit",
  requireBusinessRole("owner", "manager"),
  suppliersController.showEdit
);

suppliersRouter.post(
  "/:id/edit",
  requireBusinessRole("owner", "manager"),
  supplierValidation,
  suppliersController.editSupplier
);

suppliersRouter.get(
  "/:id/deactivate",
  requireBusinessRole("owner", "manager"),
  setSupplierAction("deactivate"),
  suppliersController.showStatus
);

suppliersRouter.post(
  "/:id/deactivate",
  requireBusinessRole("owner", "manager"),
  setSupplierAction("deactivate"),
  suppliersController.setStatus
);

suppliersRouter.get(
  "/:id/reactivate",
  requireBusinessRole("owner", "manager"),
  setSupplierAction("reactivate"),
  suppliersController.showStatus
);

suppliersRouter.post(
  "/:id/reactivate",
  requireBusinessRole("owner", "manager"),
  setSupplierAction("reactivate"),
  suppliersController.setStatus
);

suppliersRouter.get(
  "/:id",
  suppliersController.showSupplier
);

export default suppliersRouter;
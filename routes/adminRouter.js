import { Router } from "express";
import {
  changeBusinessStatus,
  createBusiness,
  editBusiness,
  showAdminDashboard,
  showBusinesses,
  showBusinessDetails,
  showCreateBusinessForm,
  showEditBusinessForm,
  showStatusConfirmation
} from "../controllers/adminController.js";
import {
  createBusinessValidation,
  editBusinessValidation
} from "../middleware/adminValidation.js";
import {
  requireAuth,
  requireSuperAdmin
} from "../middleware/authMiddleware.js";

const adminRouter = Router();

adminRouter.use(requireAuth, requireSuperAdmin);

adminRouter.get("/", showAdminDashboard);
adminRouter.get("/businesses", showBusinesses);
adminRouter.get("/businesses/new", showCreateBusinessForm);
adminRouter.post("/businesses/new", createBusinessValidation, createBusiness);
adminRouter.get("/businesses/:id/edit", showEditBusinessForm);
adminRouter.post("/businesses/:id/edit", editBusinessValidation, editBusiness);
adminRouter.get("/businesses/:id/suspend", (req, res, next) => {
  req.params.action = "suspend";
  showStatusConfirmation(req, res, next);
});
adminRouter.post("/businesses/:id/suspend", (req, res, next) => {
  req.params.action = "suspend";
  changeBusinessStatus(req, res, next);
});
adminRouter.get("/businesses/:id/reactivate", (req, res, next) => {
  req.params.action = "reactivate";
  showStatusConfirmation(req, res, next);
});
adminRouter.post("/businesses/:id/reactivate", (req, res, next) => {
  req.params.action = "reactivate";
  changeBusinessStatus(req, res, next);
});
adminRouter.get("/businesses/:id", showBusinessDetails);

export default adminRouter;

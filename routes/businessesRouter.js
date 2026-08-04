import { Router } from "express";
import {
  showBusinessSelector,
  selectBusiness,
  showNoBusinessAccess
} from "../controllers/businessesController.js";
import { requireAuth } from "../middleware/authMiddleware.js";

const businessesRouter = Router();

businessesRouter.use(requireAuth);
businessesRouter.get("/select", showBusinessSelector);
businessesRouter.post("/select", selectBusiness);
businessesRouter.get("/no-access", showNoBusinessAccess);

export default businessesRouter;

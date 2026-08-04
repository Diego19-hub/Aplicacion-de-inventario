import { Router } from "express";
import { showHomePage } from "../controllers/indexController.js";
import {
  requireAuth,
  requireActiveBusiness
} from "../middleware/authMiddleware.js";


const indexRouter = Router();

indexRouter.get("/", requireAuth, requireActiveBusiness, showHomePage);

export default indexRouter;

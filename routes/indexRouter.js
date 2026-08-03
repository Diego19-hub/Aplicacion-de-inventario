import { Router } from "express";
import { showHomePage } from "../controllers/indexController.js";
import {
  requireAdmin
} from "../middleware/authMiddleware.js";


const indexRouter = Router();

indexRouter.get("/", showHomePage);

export default indexRouter;
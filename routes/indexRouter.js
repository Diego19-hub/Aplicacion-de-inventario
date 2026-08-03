import { Router } from "express";
import { showHomePage } from "../controllers/indexController.js";

const indexRouter = Router();

indexRouter.get("/", showHomePage);

export default indexRouter;
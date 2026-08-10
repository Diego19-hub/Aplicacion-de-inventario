import { Router } from "express";
import { requireAuth, requireActiveBusiness, requireBusinessRole } from "../middleware/authMiddleware.js";
import { dashboard, inventory, inventoryCsv, movements, movementsCsv } from "../controllers/reportsController.js";

const router = Router();
router.use(requireAuth, requireActiveBusiness, requireBusinessRole("owner", "manager", "viewer"));
router.get("/", dashboard);
router.get("/inventory", inventory);
router.get("/inventory.csv", inventoryCsv);
router.get("/movements", movements);
router.get("/movements.csv", movementsCsv);
export default router;

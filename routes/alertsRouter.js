import { Router } from "express";
import { requireActiveBusiness, requireAuth, requireBusinessRole } from "../middleware/authMiddleware.js";
import { stockThresholdValidation } from "../middleware/alertValidation.js";
import { removeStockThreshold, saveStockThreshold, showStockAlerts, showThresholdConfiguration } from "../controllers/alertsController.js";

const router = Router();
router.use(requireAuth, requireActiveBusiness);
router.get("/stock", requireBusinessRole("owner", "manager", "viewer"), showStockAlerts);
router.get("/products/:itemId/thresholds", requireBusinessRole("owner", "manager"), showThresholdConfiguration);
router.post("/products/:itemId/thresholds", requireBusinessRole("owner", "manager"), stockThresholdValidation, saveStockThreshold);
router.post("/products/:itemId/thresholds/:locationId/delete", requireBusinessRole("owner", "manager"), removeStockThreshold);
export default router;

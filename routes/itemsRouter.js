import { Router } from "express";

import {
  showItems,
  showItem,
  showCreateItemForm,
  addItem,
  showEditItemForm,
  editItem,
  showDeleteItemPage,
  removeItem
} from "../controllers/itemsController.js";

import { itemValidation } from "../middleware/itemValidation.js";

import {
  requireAuth,
  requireActiveBusiness,
  requireBusinessRole
} from "../middleware/authMiddleware.js";

const itemsRouter = Router();

itemsRouter.use(requireAuth, requireActiveBusiness);

itemsRouter.get(
  "/new",
  requireBusinessRole("owner", "admin", "manager"),
  showCreateItemForm
);

itemsRouter.post(
  "/new",
  requireBusinessRole("owner", "admin", "manager"),
  itemValidation,
  addItem
);

itemsRouter.get(
  "/:id/edit",
  requireBusinessRole("owner", "admin", "manager"),
  showEditItemForm
);

itemsRouter.post(
  "/:id/edit",
  requireBusinessRole("owner", "admin", "manager"),
  itemValidation,
  editItem
);

itemsRouter.get(
  "/:id/delete",
  requireBusinessRole("owner", "admin"),
  showDeleteItemPage
);

itemsRouter.post(
  "/:id/delete",
  requireBusinessRole("owner", "admin"),
  removeItem
);

itemsRouter.get("/", showItems);

itemsRouter.get("/:id", showItem);

export default itemsRouter;

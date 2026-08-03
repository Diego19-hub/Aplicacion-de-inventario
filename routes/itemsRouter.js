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
  requireAdmin
} from "../middleware/authMiddleware.js";

const itemsRouter = Router();


itemsRouter.get(
  "/new",
  requireAdmin,
  showCreateItemForm
);

itemsRouter.post(
  "/new",
  requireAdmin,
  itemValidation,
  addItem
);

itemsRouter.get(
  "/:id/edit",
  requireAdmin,
  showEditItemForm
);

itemsRouter.post(
  "/:id/edit",
  requireAdmin,
  itemValidation,
  editItem
);

itemsRouter.get(
  "/:id/delete",
  requireAdmin,
  showDeleteItemPage
);

itemsRouter.post(
  "/:id/delete",
  requireAdmin,
  removeItem
);

itemsRouter.get("/", showItems);

itemsRouter.get("/:id", showItem);

export default itemsRouter;

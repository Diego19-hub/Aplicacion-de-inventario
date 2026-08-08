import { Router } from "express";

import {
  showItems,
  showItem,
  showCreateItemForm,
  addItem,
  showEditItemForm,
  editItem,
  showDeleteItemPage,
  showArchiveItemPage,
  archiveExistingItem,
  showArchivedItems,
  showArchivedItem,
  showRestoreItemPage,
  restoreArchivedItem
} from "../controllers/itemsController.js";

import { archiveItemValidation, itemValidation } from "../middleware/itemValidation.js";

import {
  requireAuth,
  requireActiveBusiness,
  requireBusinessRole
} from "../middleware/authMiddleware.js";

const itemsRouter = Router();

itemsRouter.use(requireAuth, requireActiveBusiness);

itemsRouter.get(
  "/new",
  requireBusinessRole("owner", "manager"),
  showCreateItemForm
);

itemsRouter.post(
  "/new",
  requireBusinessRole("owner", "manager"),
  itemValidation,
  addItem
);

itemsRouter.get(
  "/archived",
  requireBusinessRole("owner"),
  showArchivedItems
);

itemsRouter.get(
  "/:id/archived",
  requireBusinessRole("owner"),
  showArchivedItem
);

itemsRouter.get(
  "/:id/archive",
  requireBusinessRole("owner"),
  showArchiveItemPage
);

itemsRouter.post(
  "/:id/archive",
  requireBusinessRole("owner"),
  archiveItemValidation,
  archiveExistingItem
);

itemsRouter.get(
  "/:id/restore",
  requireBusinessRole("owner"),
  showRestoreItemPage
);

itemsRouter.post(
  "/:id/restore",
  requireBusinessRole("owner"),
  restoreArchivedItem
);

itemsRouter.get(
  "/:id/edit",
  requireBusinessRole("owner", "manager"),
  showEditItemForm
);

itemsRouter.post(
  "/:id/edit",
  requireBusinessRole("owner", "manager"),
  itemValidation,
  editItem
);

itemsRouter.get(
  "/:id/delete",
  requireBusinessRole("owner"),
  showDeleteItemPage
);

itemsRouter.get("/", showItems);

itemsRouter.get("/:id", showItem);

export default itemsRouter;

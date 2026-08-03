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

const itemsRouter = Router();

itemsRouter.get("/", showItems);

itemsRouter.get("/new", showCreateItemForm);
itemsRouter.post("/new", itemValidation, addItem);

itemsRouter.get("/:id/edit", showEditItemForm);
itemsRouter.post("/:id/edit", itemValidation, editItem);

itemsRouter.get("/:id/delete", showDeleteItemPage);
itemsRouter.post("/:id/delete", removeItem);

itemsRouter.get("/:id", showItem);

export default itemsRouter;
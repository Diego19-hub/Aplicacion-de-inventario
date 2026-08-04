import { Router } from "express";

import {
  showCategories,
  showCategory,
  showCreateCategoryForm,
  addCategory,
  showEditCategoryForm,
  editCategory,
  showDeleteCategoryPage,
  removeCategory
} from "../controllers/categoriesController.js";

import {
  categoryValidation
} from "../middleware/categoryValidation.js";

import {
  requireAdmin
} from "../middleware/authMiddleware.js";

const categoriesRouter = Router();

categoriesRouter.get("/", showCategories);

categoriesRouter.get(
  "/new",
  requireAdmin,
  showCreateCategoryForm
);

categoriesRouter.post(
  "/new",
  requireAdmin,
  categoryValidation,
  addCategory
);

categoriesRouter.get(
  "/:id/edit",
  requireAdmin,
  showEditCategoryForm
);

categoriesRouter.post(
  "/:id/edit",
  requireAdmin,
  categoryValidation,
  editCategory
);

categoriesRouter.get(
  "/:id/delete",
  requireAdmin,
  showDeleteCategoryPage
);

categoriesRouter.post(
  "/:id/delete",
  requireAdmin,
  removeCategory
);

categoriesRouter.get("/:id", showCategory);

export default categoriesRouter;
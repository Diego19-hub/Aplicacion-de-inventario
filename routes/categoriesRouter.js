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
  requireAuth,
  requireActiveBusiness,
  requireBusinessRole
} from "../middleware/authMiddleware.js";

const categoriesRouter = Router();

categoriesRouter.use(requireAuth, requireActiveBusiness);

categoriesRouter.get("/", showCategories);

categoriesRouter.get(
  "/new",
  requireBusinessRole("owner", "admin", "manager"),
  showCreateCategoryForm
);

categoriesRouter.post(
  "/new",
  requireBusinessRole("owner", "admin", "manager"),
  categoryValidation,
  addCategory
);

categoriesRouter.get(
  "/:id/edit",
  requireBusinessRole("owner", "admin", "manager"),
  showEditCategoryForm
);

categoriesRouter.post(
  "/:id/edit",
  requireBusinessRole("owner", "admin", "manager"),
  categoryValidation,
  editCategory
);

categoriesRouter.get(
  "/:id/delete",
  requireBusinessRole("owner", "admin"),
  showDeleteCategoryPage
);

categoriesRouter.post(
  "/:id/delete",
  requireBusinessRole("owner", "admin"),
  removeCategory
);

categoriesRouter.get("/:id", showCategory);

export default categoriesRouter;

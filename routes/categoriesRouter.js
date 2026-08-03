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

import { categoryValidation } from "../middleware/categoryValidation.js";

const categoriesRouter = Router();

categoriesRouter.get("/", showCategories);

categoriesRouter.get("/new", showCreateCategoryForm);
categoriesRouter.post("/new", categoryValidation, addCategory);

categoriesRouter.get("/:id/edit", showEditCategoryForm);
categoriesRouter.post("/:id/edit", categoryValidation, editCategory);

categoriesRouter.get("/:id/delete", showDeleteCategoryPage);
categoriesRouter.post("/:id/delete", removeCategory);

categoriesRouter.get("/:id", showCategory);

export default categoriesRouter;
import { validationResult, matchedData } from "express-validator";
import AppError from "../utils/AppError.js";

import {
  getAllCategories,
  getCategoryById,
  getItemsByCategoryId,
  createCategory,
  updateCategory,
  deleteCategory
} from "../db/queries.js";

export async function showCategories(req, res, next) {
  try {
    const categories = await getAllCategories();

    res.render("categories/index", {
      title: "Categorías",
      categories
    });
  } catch (error) {
    next(error);
  }
}

export async function showCategory(req, res, next) {
  try {
    const categoryId = Number(req.params.id);

    if (!Number.isInteger(categoryId) || categoryId < 1) {
      return next(new AppError("Categoría no encontrada", 404));
    }

    const [category, items] = await Promise.all([
      getCategoryById(categoryId),
      getItemsByCategoryId(categoryId)
    ]);

    if (!category) {
      return next(new AppError("Categoría no encontrada", 404));
    }

    res.render("categories/details", {
      title: category.name,
      category,
      items
    });
  } catch (error) {
    next(error);
  }
}

export function showCreateCategoryForm(req, res) {
  res.render("categories/form", {
    title: "Crear categoría",
    category: {
      name: "",
      description: ""
    },
    errors: []
  });
}

export async function addCategory(req, res, next) {
  const validationErrors = validationResult(req);

  if (!validationErrors.isEmpty()) {
    return res.status(400).render("categories/form", {
      title: "Crear categoría",
      category: {
        name: req.body.name ?? "",
        description: req.body.description ?? ""
      },
      errors: validationErrors.array()
    });
  }

  const { name, description } = matchedData(req);

  try {
    const category = await createCategory(name, description);

    res.redirect(`/categories/${category.id}`);
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).render("categories/form", {
        title: "Crear categoría",
        category: { name, description },
        errors: [
          {
            path: "name",
            msg: "Ya existe una categoría con ese nombre."
          }
        ]
      });
    }

    next(error);
  }
}

export async function showEditCategoryForm(req, res, next) {
  try {
    const categoryId = Number(req.params.id);

    if (!Number.isInteger(categoryId) || categoryId < 1) {
      return next(new AppError("Categoría no encontrada", 404));
    }

    const category = await getCategoryById(categoryId);

    if (!category) {
      return next(new AppError("Categoría no encontrada", 404));
    }

    res.render("categories/form", {
      title: "Editar categoría",
      category,
      errors: []
    });
  } catch (error) {
    next(error);
  }
}

export async function editCategory(req, res, next) {
  const categoryId = Number(req.params.id);

  if (!Number.isInteger(categoryId) || categoryId < 1) {
    return next(new AppError("Categoría no encontrada", 404));
  }

  const validationErrors = validationResult(req);

  if (!validationErrors.isEmpty()) {
    return res.status(400).render("categories/form", {
      title: "Editar categoría",
      category: {
        id: categoryId,
        name: req.body.name ?? "",
        description: req.body.description ?? ""
      },
      errors: validationErrors.array()
    });
  }

  const { name, description } = matchedData(req);

  try {
    const category = await updateCategory(
      categoryId,
      name,
      description
    );

    if (!category) {
      return next(new AppError("Categoría no encontrada", 404));
    }

    res.redirect(`/categories/${category.id}`);
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).render("categories/form", {
        title: "Editar categoría",
        category: {
          id: categoryId,
          name,
          description
        },
        errors: [
          {
            path: "name",
            msg: "Ya existe otra categoría con ese nombre."
          }
        ]
      });
    }

    next(error);
  }
}

export async function showDeleteCategoryPage(req, res, next) {
  try {
    const categoryId = Number(req.params.id);

    if (!Number.isInteger(categoryId) || categoryId < 1) {
      return next(new AppError("Categoría no encontrada", 404));
    }

    const category = await getCategoryById(categoryId);

    if (!category) {
      return next(new AppError("Categoría no encontrada", 404));
    }

    res.render("categories/delete", {
      title: "Eliminar categoría",
      category,
      error: null
    });
  } catch (error) {
    next(error);
  }
}

export async function removeCategory(req, res, next) {
  const categoryId = Number(req.params.id);

  if (!Number.isInteger(categoryId) || categoryId < 1) {
    return next(new AppError("Categoría no encontrada", 404));
  }

  try {
    const category = await getCategoryById(categoryId);

    if (!category) {
      return next(new AppError("Categoría no encontrada", 404));
    }

    if (category.item_count > 0) {
      return res.status(409).render("categories/delete", {
        title: "Eliminar categoría",
        category,
        error:
          "No puedes eliminar esta categoría porque todavía contiene productos."
      });
    }

    const deletedCategory = await deleteCategory(categoryId);

    if (!deletedCategory) {
      return next(new AppError("Categoría no encontrada", 404));
    }

    res.redirect("/categories");
  } catch (error) {
    // PostgreSQL: foreign_key_violation
    if (error.code === "23503") {
      const category = await getCategoryById(categoryId);

      return res.status(409).render("categories/delete", {
        title: "Eliminar categoría",
        category,
        error:
          "La categoría no puede eliminarse porque tiene productos asociados."
      });
    }

    next(error);
  }
}

import {
  countApiCategories,
  createApiCategory,
  deleteApiCategory,
  getApiActiveCategoryProducts,
  getApiCategories,
  getApiCategoryById,
  updateApiCategory
} from "../db/apiCategoryQueries.js";
import { matchedData, validationResult } from "express-validator";

const PAGE_SIZE = 20;

function positiveInteger(value) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function serializeCategory(category) {
  return {
    id: Number(category.id),
    name: category.name,
    description: category.description,
    activeProductCount: Number(category.active_product_count),
    archivedProductCount: Number(category.archived_product_count),
    totalStock: Number(category.total_stock),
    isDefault: Boolean(category.is_default)
  };
}

function serializeEditableCategory(category) {
  return {
    id: Number(category.id),
    name: category.name,
    description: category.description,
    isDefault: Boolean(category.is_default)
  };
}

function validationError(res, errors) {
  return res.status(400).json({
    error: {
      code: "VALIDATION_ERROR",
      message: "Revisa los campos enviados.",
      fields: errors.map((error) => ({ field: error.path, message: error.msg }))
    }
  });
}

function categoryNotFound(res) {
  return res.status(404).json({
    error: { code: "CATEGORY_NOT_FOUND", message: "No se encontró la categoría solicitada." }
  });
}

export async function listCategories(req, res, next) {
  const query = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
  const filters = { businessId: req.business.id, query };
  const requestedPage = positiveInteger(req.query.page) ?? 1;

  try {
    const totalItems = await countApiCategories(filters);
    const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
    const page = Math.min(requestedPage, totalPages);
    const categories = await getApiCategories({
      ...filters,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE
    });

    return res.status(200).json({
      data: {
        categories: categories.map(serializeCategory),
        filters: { q: query },
        pagination: { page, pageSize: PAGE_SIZE, totalItems: Number(totalItems), totalPages }
      }
    });
  } catch (error) {
    return next(error);
  }
}

export async function getCategoryDetails(req, res, next) {
  const categoryId = positiveInteger(req.params.categoryId);
  if (!categoryId) {
    return validationError(res, [{ path: "categoryId", msg: "La categoría debe ser un entero positivo." }]);
  }

  try {
    const category = await getApiCategoryById(req.business.id, categoryId);
    if (!category) {
      return categoryNotFound(res);
    }
    const products = await getApiActiveCategoryProducts(req.business.id, categoryId);

    return res.status(200).json({
      data: {
        category: serializeCategory(category),
        products: products.map((product) => ({
          id: Number(product.id),
          name: product.name,
          sku: product.sku,
          brand: product.brand,
          price: Number(product.price),
          stock: Number(product.stock)
        }))
      }
    });
  } catch (error) {
    return next(error);
  }
}

export async function createCategory(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return validationError(res, errors.array());

  const data = matchedData(req);
  try {
    const category = await createApiCategory(req.business.id, {
      name: data.name,
      description: data.description ?? ""
    });
    return res.status(201).json({ data: { category: serializeEditableCategory(category) } });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        error: {
          code: "CATEGORY_ALREADY_EXISTS",
          message: "Ya existe una categoría con ese nombre.",
          fields: [{ field: "name", message: "Ya existe una categoría con ese nombre." }]
        }
      });
    }
    return next(error);
  }
}

export async function getCategoryForEdit(req, res, next) {
  const categoryId = positiveInteger(req.params.categoryId);
  if (!categoryId) {
    return validationError(res, [{ path: "categoryId", msg: "La categoría debe ser un entero positivo." }]);
  }

  try {
    const category = await getApiCategoryById(req.business.id, categoryId);
    if (!category) return categoryNotFound(res);
    return res.status(200).json({ data: { category: serializeEditableCategory(category) } });
  } catch (error) {
    return next(error);
  }
}

export async function updateCategory(req, res, next) {
  const categoryId = positiveInteger(req.params.categoryId);
  if (!categoryId) {
    return validationError(res, [{ path: "categoryId", msg: "La categoría debe ser un entero positivo." }]);
  }
  const errors = validationResult(req);
  if (!errors.isEmpty()) return validationError(res, errors.array());

  const data = matchedData(req);
  try {
    const category = await updateApiCategory(req.business.id, categoryId, {
      name: data.name,
      description: data.description ?? ""
    });
    if (!category) return categoryNotFound(res);
    return res.status(200).json({ data: { category: serializeEditableCategory(category) } });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        error: {
          code: "CATEGORY_ALREADY_EXISTS",
          message: "Ya existe una categoría con ese nombre.",
          fields: [{ field: "name", message: "Ya existe una categoría con ese nombre." }]
        }
      });
    }
    return next(error);
  }
}

export async function removeCategory(req, res, next) {
  const categoryId = positiveInteger(req.params.categoryId);
  if (!categoryId) {
    return validationError(res, [{ path: "categoryId", msg: "La categoría debe ser un entero positivo." }]);
  }

  try {
    const category = await getApiCategoryById(req.business.id, categoryId);
    if (!category) return categoryNotFound(res);

    if (category.is_default) {
      return res.status(409).json({
        error: {
          code: "DEFAULT_CATEGORY_PROTECTED",
          message: "No puedes eliminar la categoría predeterminada del negocio."
        }
      });
    }

    if (Number(category.active_product_count) + Number(category.archived_product_count) > 0) {
      return res.status(409).json({
        error: {
          code: "CATEGORY_IN_USE",
          message: "No puedes eliminar una categoría que todavía contiene productos."
        }
      });
    }

    const deletedCategory = await deleteApiCategory(req.business.id, categoryId);
    if (!deletedCategory) return categoryNotFound(res);
    return res.status(204).send();
  } catch (error) {
    if (error.code === "23503") {
      return res.status(409).json({
        error: {
          code: "CATEGORY_IN_USE",
          message: "No puedes eliminar una categoría que todavía contiene productos."
        }
      });
    }
    return next(error);
  }
}

import {
  countApiProducts,
  getApiProductCategories,
  getApiProducts
} from "../db/apiProductQueries.js";
import { createItem } from "../db/queries.js";
import { matchedData, validationResult } from "express-validator";

const PAGE_SIZE = 12;

function positiveInteger(value) {
  return typeof value === "string" && /^[1-9]\d*$/.test(value)
    ? Number(value)
    : null;
}

function readFilters(query, categories) {
  const q = typeof query.q === "string" ? query.q.trim().slice(0, 100) : "";
  const requestedCategoryId = positiveInteger(query.category);
  const categoryId = query.category === undefined || query.category === ""
    ? null
    : categories.some((category) => category.id === requestedCategoryId)
      ? requestedCategoryId
      : -1;
  const requestedPage = positiveInteger(query.page) ?? 1;

  return { q, categoryId, requestedPage };
}

export async function listProducts(req, res, next) {
  try {
    const categories = await getApiProductCategories(req.business.id);
    const filters = readFilters(req.query, categories);
    const totalItems = await countApiProducts({
      businessId: req.business.id,
      query: filters.q,
      categoryId: filters.categoryId
    });
    const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
    const page = Math.min(filters.requestedPage, totalPages);
    const products = await getApiProducts({
      businessId: req.business.id,
      query: filters.q,
      categoryId: filters.categoryId,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE
    });

    return res.status(200).json({
      data: {
        products: products.map((product) => ({
          id: product.id,
          name: product.name,
          sku: product.sku,
          brand: product.brand,
          price: Number(product.price),
          stock: Number(product.stock),
          category: {
            id: product.category_id,
            name: product.category_name
          }
        })),
        categories,
        filters: {
          q: filters.q,
          categoryId: filters.categoryId > 0 ? filters.categoryId : null
        },
        pagination: {
          page,
          pageSize: PAGE_SIZE,
          totalItems: Number(totalItems),
          totalPages
        }
      }
    });
  } catch (error) {
    return next(error);
  }
}

function validationFields(errors) {
  return errors.map((error) => ({ field: error.path, message: error.msg }));
}

export async function getProductFormOptions(req, res, next) {
  try {
    const categories = await getApiProductCategories(req.business.id);

    return res.status(200).json({
      data: {
        categories,
        sku: {
          automatic: true,
          editable: true,
          example: "CAT-0001"
        }
      }
    });
  } catch (error) {
    return next(error);
  }
}

export async function createProduct(req, res, next) {
  const validationErrors = validationResult(req);

  if (!validationErrors.isEmpty()) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Revisa los campos enviados.",
        fields: validationFields(validationErrors.array())
      }
    });
  }

  try {
    const product = await createItem(matchedData(req), req.business.id);

    if (!product) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Revisa los campos enviados.",
          fields: [{ field: "categoryId", message: "Selecciona una categoría válida." }]
        }
      });
    }

    return res.status(201).json({
      data: {
        product: {
          id: product.id,
          name: product.name,
          sku: product.sku,
          description: product.description,
          brand: product.brand,
          price: Number(product.price),
          stock: Number(product.stock),
          category: { id: product.category_id, name: product.category_name }
        }
      }
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        error: {
          code: "SKU_ALREADY_EXISTS",
          message: "Ese SKU ya existe en este negocio.",
          fields: [{ field: "sku", message: "Ese SKU ya existe en este negocio." }]
        }
      });
    }

    return next(error);
  }
}

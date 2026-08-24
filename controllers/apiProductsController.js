import {
  countApiProducts,
  getApiProductCategories,
  getApiProductById,
  getApiProducts
} from "../db/apiProductQueries.js";
import { archiveItem, createItem, updateItem } from "../db/queries.js";
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
          barcode: product.barcode,
          brand: product.brand,
          price: Number(product.price),
          costPrice: product.cost_price === null ? null : Number(product.cost_price),
          stock: Number(product.stock),
          category: {
            id: product.category_id,
            name: product.category_name
          }
        })),
        categories: categories.map(serializeCategory),
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

function serializeCategory(category) {
  return {
    id: Number(category.id),
    name: category.name,
    isDefault: Boolean(category.is_default)
  };
}

function productIdFromRequest(value) {
  if (!/^[1-9]\d*$/.test(value)) return null;

  const productId = Number(value);
  return Number.isSafeInteger(productId) ? productId : null;
}

function serializeProduct(product, categoryName = product.category_name) {
  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    barcode: product.barcode,
    description: product.description,
    brand: product.brand,
    price: Number(product.price),
    costPrice: product.cost_price === null ? null : Number(product.cost_price),
    stock: Number(product.stock),
    category: { id: product.category_id, name: categoryName }
  };
}

export async function getProductFormOptions(req, res, next) {
  try {
    const categories = await getApiProductCategories(req.business.id);

    return res.status(200).json({
      data: {
        categories: categories.map(serializeCategory),
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
        product: serializeProduct(product)
      }
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        error: {
          code: error.constraint?.includes("barcode") ? "BARCODE_ALREADY_EXISTS" : "SKU_ALREADY_EXISTS",
          message: error.constraint?.includes("barcode") ? "Ese código de barras ya existe en este negocio." : "Ese SKU ya existe en este negocio.",
          fields: [{ field: error.constraint?.includes("barcode") ? "barcode" : "sku", message: error.constraint?.includes("barcode") ? "Ese código de barras ya existe en este negocio." : "Ese SKU ya existe en este negocio." }]
        }
      });
    }

    return next(error);
  }
}

export async function getProductForEdit(req, res, next) {
  const productId = productIdFromRequest(req.params.productId);

  if (!productId) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Revisa los campos enviados.",
        fields: [{ field: "productId", message: "El producto debe ser un entero positivo." }]
      }
    });
  }

  try {
    const [product, categories] = await Promise.all([
      getApiProductById(req.business.id, productId),
      getApiProductCategories(req.business.id)
    ]);

    if (!product) {
      return res.status(404).json({
        error: {
          code: "PRODUCT_NOT_FOUND",
          message: "No se encontró el producto solicitado."
        }
      });
    }

    return res.status(200).json({
      data: {
        product: {
          id: product.id,
          name: product.name,
          description: product.description,
          brand: product.brand,
          price: Number(product.price),
          costPrice: product.cost_price === null ? null : Number(product.cost_price),
          sku: product.sku,
          barcode: product.barcode,
          categoryId: product.category_id
        },
        categories: categories.map(serializeCategory)
      }
    });
  } catch (error) {
    return next(error);
  }
}

export async function updateProduct(req, res, next) {
  const productId = productIdFromRequest(req.params.productId);

  if (!productId) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Revisa los campos enviados.",
        fields: [{ field: "productId", message: "El producto debe ser un entero positivo." }]
      }
    });
  }

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
    const categories = await getApiProductCategories(req.business.id);
    const data = matchedData(req);
    const category = data.categoryId
      ? categories.find((candidate) => candidate.id === data.categoryId)
      : categories.find((candidate) => candidate.is_default);

    if (!category) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Revisa los campos enviados.",
          fields: [{ field: "categoryId", message: "Selecciona una categoría válida." }]
        }
      });
    }

    const product = await updateItem(productId, req.business.id, {
      ...data,
      description: data.description ?? ""
    });

    if (!product) {
      return res.status(404).json({
        error: {
          code: "PRODUCT_NOT_FOUND",
          message: "No se encontró el producto solicitado."
        }
      });
    }

    return res.status(200).json({ data: { product: serializeProduct(product, category.name) } });
  } catch (error) {
    if (error.code === "23503") {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Revisa los campos enviados.",
          fields: [{ field: "categoryId", message: "Selecciona una categoría válida." }]
        }
      });
    }

    if (error.code === "23505") {
      return res.status(409).json({
        error: {
          code: error.constraint?.includes("barcode") ? "BARCODE_ALREADY_EXISTS" : "SKU_ALREADY_EXISTS",
          message: error.constraint?.includes("barcode") ? "Ese código de barras ya existe en este negocio." : "Ese SKU ya existe en este negocio.",
          fields: [{ field: error.constraint?.includes("barcode") ? "barcode" : "sku", message: error.constraint?.includes("barcode") ? "Ese código de barras ya existe en este negocio." : "Ese SKU ya existe en este negocio." }]
        }
      });
    }

    return next(error);
  }
}

export async function archiveProduct(req, res, next) {
  const productId = productIdFromRequest(req.params.productId);

  if (!productId) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Revisa los campos enviados.",
        fields: [{ field: "productId", message: "El producto debe ser un entero positivo." }]
      }
    });
  }

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
    const { reason } = matchedData(req);
    const product = await archiveItem(
      productId,
      req.business.id,
      req.session.user.id,
      reason
    );

    if (!product) {
      return res.status(404).json({
        error: {
          code: "PRODUCT_NOT_FOUND",
          message: "No se encontró el producto solicitado."
        }
      });
    }

    return res.status(200).json({
      data: {
        product: {
          id: product.id,
          status: product.status,
          archivedAt: product.archived_at
        }
      }
    });
  } catch (error) {
    return next(error);
  }
}

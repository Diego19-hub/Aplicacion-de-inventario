import {
  countApiCategories,
  getApiActiveCategoryProducts,
  getApiCategories,
  getApiCategoryById
} from "../db/apiCategoryQueries.js";

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
    totalStock: Number(category.total_stock)
  };
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
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Revisa los campos enviados.",
        fields: [{ field: "categoryId", message: "La categoría debe ser un entero positivo." }]
      }
    });
  }

  try {
    const category = await getApiCategoryById(req.business.id, categoryId);
    if (!category) {
      return res.status(404).json({
        error: { code: "CATEGORY_NOT_FOUND", message: "No se encontró la categoría solicitada." }
      });
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

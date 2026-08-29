import {
  countApiArchivedProducts,
  getApiArchivedProductById,
  getApiArchivedProducts,
  getApiProductBalances,
  getApiProductCategories,
  getApiProductRecentMovements
} from "../db/apiProductQueries.js";
import { restoreItem } from "../db/queries.js";

const PAGE_SIZE = 12;

function productId(value) {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

function jsonValidation(res, field, message) {
  return res.status(400).json({
    error: { code: "VALIDATION_ERROR", message: "Revisa los campos enviados.", fields: [{ field, message }] }
  });
}

function filters(query, categories) {
  const q = typeof query.q === "string" ? query.q.trim().slice(0, 100) : "";
  const categoryValue = typeof query.category === "string" ? query.category : "";
  const requestedCategoryId = /^[1-9]\d*$/.test(categoryValue) ? Number(categoryValue) : null;
  const categoryId = categoryValue === "" || query.category === undefined
    ? null
    : categories.some((category) => category.id === requestedCategoryId) ? requestedCategoryId : -1;
  const requestedPage = typeof query.page === "string" && /^[1-9]\d*$/.test(query.page)
    ? Number(query.page) : 1;
  return { q, categoryId, requestedPage };
}

function notFound(res) {
  return res.status(404).json({ error: { code: "PRODUCT_NOT_FOUND", message: "No se encontró el producto solicitado." } });
}

function serializeBalances(balances) {
  return balances.map((balance) => ({
    location: { id: balance.location_id, name: balance.location_name, code: balance.location_code, status: balance.location_status, isDefault: balance.is_default },
    stock: Number(balance.stock),
    minimumStock: balance.minimum_stock === null ? null : Number(balance.minimum_stock)
  }));
}

function serializeMovements(movements) {
  return movements.map((movement) => ({
    id: movement.id, createdAt: movement.created_at, type: movement.movement_type,
    quantityDelta: Number(movement.quantity_delta), previousStock: Number(movement.previous_stock), resultingStock: Number(movement.resulting_stock),
    reason: movement.reason, reference: movement.reference,
    location: { id: movement.location_id, name: movement.location_name, code: movement.location_code },
    createdBy: { id: movement.created_by_id, username: movement.username },
    transferId: movement.transfer_id === null ? null : Number(movement.transfer_id)
  }));
}

export async function listArchivedProducts(req, res, next) {
  try {
    const categories = await getApiProductCategories(req.business.id);
    const currentFilters = filters(req.query, categories);
    const totalItems = await countApiArchivedProducts({ businessId: req.business.id, query: currentFilters.q, categoryId: currentFilters.categoryId });
    const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
    const page = Math.min(currentFilters.requestedPage, totalPages);
    const products = await getApiArchivedProducts({ businessId: req.business.id, query: currentFilters.q, categoryId: currentFilters.categoryId, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
    return res.status(200).json({ data: {
      products: products.map((product) => ({ id: product.id, name: product.name, sku: product.sku, brand: product.brand, stock: Number(product.stock), archivedAt: product.archived_at, reason: product.archive_reason, category: { id: product.category_id, name: product.category_name } })),
      categories, filters: { q: currentFilters.q, categoryId: currentFilters.categoryId > 0 ? currentFilters.categoryId : null },
      pagination: { page, pageSize: PAGE_SIZE, totalItems: Number(totalItems), totalPages }
    } });
  } catch (error) { return next(error); }
}

export async function getArchivedProductDetails(req, res, next) {
  const id = productId(req.params.productId);
  if (!id) return jsonValidation(res, "productId", "El producto debe ser un entero positivo.");
  try {
    const product = await getApiArchivedProductById(req.business.id, id);
    if (!product) return notFound(res);
    const [balances, movements] = await Promise.all([getApiProductBalances(req.business.id, id), getApiProductRecentMovements(req.business.id, id)]);
    return res.status(200).json({ data: { product: {
      id: product.id, name: product.name, sku: product.sku, description: product.description, brand: product.brand, price: Number(product.price), stock: Number(product.stock), createdAt: product.created_at,
      archivedAt: product.archived_at, archiveReason: product.archive_reason, archivedByUsername: product.archived_by_username,
      category: { id: product.category_id, name: product.category_name }
    }, balances: serializeBalances(balances), recentMovements: serializeMovements(movements) } });
  } catch (error) { return next(error); }
}

export async function restoreArchivedProduct(req, res, next) {
  const id = productId(req.params.productId);
  if (!id) return jsonValidation(res, "productId", "El producto debe ser un entero positivo.");
  try {
    const product = await restoreItem(id, req.business.id, req.session.user.id);
    if (!product) return notFound(res);
    return res.status(200).json({ data: { product: { id: product.id, status: "active" } } });
  } catch (error) { return next(error); }
}

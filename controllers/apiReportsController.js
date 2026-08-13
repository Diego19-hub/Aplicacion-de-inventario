import { inventoryOptions, inventoryReport } from "../db/reportQueries.js";

const id = (value) => /^[1-9]\d*$/.test(String(value)) ? Number(value) : null;

export async function inventoryReportApi(req, res, next) {
  try {
    const owner = req.membership.role === "owner";
    const options = await inventoryOptions(req.business.id);
    const categoryId = id(req.query.category);
    const locationId = id(req.query.location);
    const filters = {
      businessId: req.business.id,
      q: typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "",
      categoryId: !categoryId || options.categories.some((category) => Number(category.id) === categoryId) ? categoryId : -1,
      locationId: !locationId || options.locations.some((location) => Number(location.id) === locationId) ? locationId : -1,
      status: owner && ["active", "archived", "all"].includes(req.query.productStatus) ? req.query.productStatus : "active",
      stockRows: ["positive", "all"].includes(req.query.stockRows) ? req.query.stockRows : "positive",
      limit: 25,
      offset: 0
    };
    const initial = await inventoryReport(filters);
    const totalPages = Math.max(1, Math.ceil(initial.count / filters.limit));
    const requested = /^[1-9]\d*$/.test(req.query.page) ? Number(req.query.page) : 1;
    const page = Math.min(requested, totalPages);
    const result = await inventoryReport({ ...filters, offset: (page - 1) * filters.limit });
    return res.status(200).json({ data: { rows: result.rows.map((row) => ({ product: { id: Number(row.id), name: row.name, sku: row.sku, status: row.product_status, category: { id: Number(row.category_id), name: row.category_name } }, location: { id: Number(row.location_id), name: row.location_name, code: row.code, type: row.location_type, status: row.location_status }, localStock: Number(row.local_stock), totalStock: Number(row.total_stock) })), categories: options.categories.map((category) => ({ id: Number(category.id), name: category.name })), locations: options.locations.map((location) => ({ id: Number(location.id), name: location.name, code: location.code })), filters: { q: filters.q, categoryId: filters.categoryId, locationId: filters.locationId, productStatus: filters.status, stockRows: filters.stockRows }, pagination: { page, pageSize: 25, totalItems: Number(result.count), totalPages }, permissions: { canViewArchived: owner } } });
  } catch (error) { return next(error); }
}

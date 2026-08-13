import { getStockAlertOptions, getStockAlerts } from "../db/alertQueries.js";

const pageSize = 20;
const positiveId = (value) => typeof value === "string" && /^[1-9]\d*$/.test(value) ? Number(value) : null;
const pageValue = (value) => typeof value === "string" && /^[1-9]\d*$/.test(value) ? Number(value) : 1;

function serializeAlert(row) {
  return {
    thresholdId: Number(row.threshold_id),
    product: { id: Number(row.item_id), name: row.item_name, sku: row.sku, category: { id: Number(row.category_id), name: row.category_name } },
    location: { id: Number(row.location_id), name: row.location_name, code: row.location_code },
    stock: Number(row.current_stock),
    minimumStock: Number(row.minimum_stock),
    status: row.alert_status
  };
}

export async function listStockAlerts(req, res, next) {
  try {
    const options = await getStockAlertOptions(req.business.id);
    const categoryId = positiveId(req.query.category);
    const locationId = positiveId(req.query.location);
    const filters = {
      businessId: req.business.id,
      q: typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "",
      categoryId: !categoryId || options.categories.some((category) => Number(category.id) === categoryId) ? categoryId : -1,
      locationId: !locationId || options.locations.some((location) => Number(location.id) === locationId) ? locationId : -1,
      alertStatus: ["all", "out_of_stock", "low_stock"].includes(req.query.status) ? req.query.status : "all",
      limit: pageSize,
      offset: 0
    };
    const initial = await getStockAlerts(filters);
    const totalPages = Math.max(1, Math.ceil(initial.count / pageSize));
    const page = Math.min(pageValue(req.query.page), totalPages);
    const result = await getStockAlerts({ ...filters, offset: (page - 1) * pageSize });
    return res.status(200).json({
      data: {
        alerts: result.rows.map(serializeAlert),
        categories: options.categories.map((category) => ({ id: Number(category.id), name: category.name })),
        locations: options.locations.map((location) => ({ id: Number(location.id), name: location.name, code: location.code })),
        filters: { q: filters.q, categoryId: filters.categoryId, locationId: filters.locationId, status: filters.alertStatus },
        pagination: { page, pageSize, totalItems: Number(result.count), totalPages },
        permissions: { canManageThresholds: ["owner", "manager"].includes(req.membership.role) }
      }
    });
  } catch (error) { return next(error); }
}

import { getStockAlertOptions, getStockAlerts, markStockAlertReviewed } from "../db/alertQueries.js";

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
    maximumStock: row.maximum_stock == null ? null : Number(row.maximum_stock),
    suggestedQuantity: Math.max(0, Number(row.suggested_quantity || 0)),
    supplier: row.preferred_supplier_id ? { id: Number(row.preferred_supplier_id), name: row.supplier_name } : null,
    overstockQuantity: row.overstock_quantity == null ? 0 : Math.max(0, Number(row.overstock_quantity)),
    message: row.alert_status === "overstock" ? "Stock excedente" : row.alert_status === "out_of_stock" ? "Producto agotado" : "Stock bajo",
    priority: Number(row.current_stock) === 0 ? "urgent" : row.alert_status === "overstock" ? "medium" : "high",
    detectedAt: row.detected_at,
    status: row.alert_status
  };
}

export async function listStockAlerts(req, res, next) {
  try {
    const options = await getStockAlertOptions(req.business.id);
    const categoryId = positiveId(req.query.category);
    const locationId = positiveId(req.query.location);
    const supplierId = positiveId(req.query.supplier);
    const filters = {
      businessId: req.business.id,
      q: typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "",
      categoryId: !categoryId || options.categories.some((category) => Number(category.id) === categoryId) ? categoryId : -1,
      locationId: !locationId || options.locations.some((location) => Number(location.id) === locationId) ? locationId : -1,
      supplierId: !supplierId || options.suppliers.some((supplier) => Number(supplier.id) === supplierId) ? supplierId : -1,
      priority: ["all", "urgent", "high", "medium"].includes(req.query.priority) ? req.query.priority : "all",
      alertStatus: ["all", "out_of_stock", "low_stock", "overstock"].includes(req.query.status) ? req.query.status : "all",
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
        suppliers: options.suppliers.map((supplier) => ({ id: Number(supplier.id), name: supplier.name })),
        filters: { q: filters.q, categoryId: filters.categoryId, locationId: filters.locationId, supplierId: filters.supplierId, priority: filters.priority, status: filters.alertStatus },
        pagination: { page, pageSize, totalItems: Number(result.count), totalPages },
        permissions: { canManageThresholds: ["owner", "manager"].includes(req.membership.role) }
      }
    });
  } catch (error) { return next(error); }
}

export async function reviewStockAlert(req, res, next) {
  try {
    const thresholdId = positiveId(req.params.thresholdId);
    if (!thresholdId) return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "La alerta no es válida." } });
    const result = await markStockAlertReviewed(req.business.id, thresholdId, req.session.user.id);
    if (!result) return res.status(404).json({ error: { code: "ALERT_NOT_FOUND", message: "No se encontró la alerta." } });
    return res.status(200).json({ data: { reviewedAt: result.reviewed_at } });
  } catch (error) { return next(error); }
}

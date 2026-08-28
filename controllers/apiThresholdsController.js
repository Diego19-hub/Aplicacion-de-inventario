import { matchedData, validationResult } from "express-validator";
import { deleteStockThreshold, getActiveThresholdLocation, getItemThresholdConfiguration, getThresholdScope, upsertStockThreshold } from "../db/alertQueries.js";

const positiveId = (value) => /^[1-9]\d*$/.test(String(value)) ? Number(value) : null;
const validationError = (res, errors) => res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Revisa los campos enviados.", fields: errors.map((error) => ({ field: error.path, message: error.msg })) } });
const productNotFound = (res) => res.status(404).json({ error: { code: "PRODUCT_NOT_FOUND", message: "No se encontró el producto solicitado." } });

function serialize(configuration) {
  return { product: { id: Number(configuration.item.id), name: configuration.item.name, sku: configuration.item.sku, stock: Number(configuration.item.stock) }, suppliers: configuration.suppliers.map((supplier) => ({ id: Number(supplier.id), name: supplier.name })), locations: configuration.locations.map((location) => ({ id: Number(location.location_id), name: location.location_name, code: location.code, isDefault: location.is_default, stock: Number(location.current_stock), minimumStock: location.minimum_stock === null ? null : Number(location.minimum_stock), maximumStock: location.maximum_stock === null ? null : Number(location.maximum_stock), suggestedReplenishment: location.suggested_replenishment === null ? null : Number(location.suggested_replenishment), preferredSupplierId: location.preferred_supplier_id, preferredSupplierName: location.supplier_name, alertEnabled: location.alert_enabled !== false, alertStatus: location.alert_status, thresholdUpdatedAt: location.threshold_updated_at })) };
}

async function configuration(req) {
  const itemId = positiveId(req.params.productId);
  return itemId && getItemThresholdConfiguration(req.business.id, itemId);
}

export async function getThresholds(req, res, next) {
  const itemId = positiveId(req.params.productId);
  if (!itemId) return validationError(res, [{ path: "productId", msg: "El producto debe ser un entero positivo." }]);
  try { const result = await configuration(req); return result ? res.status(200).json({ data: serialize(result) }) : productNotFound(res); } catch (error) { return next(error); }
}

export async function saveThreshold(req, res, next) {
  const requestProductId = positiveId(req.params.productId); const requestLocationId = positiveId(req.params.locationId); const activeBusinessId = Number(req.business?.id);
  if (process.env.NODE_ENV !== "production") console.error("[STOCK THRESHOLD REQUEST]", { productId: requestProductId, locationId: requestLocationId, activeBusinessId });
  const errors = validationResult(req); if (!errors.isEmpty()) return validationError(res, errors.array());
  try {
    const itemId = requestProductId; const locationId = requestLocationId;
    if (!itemId || !locationId) return validationError(res, [{ path: !itemId ? "productId" : "locationId", msg: "El ID debe ser un entero positivo." }]);
    const current = await configuration(req); if (!current) return productNotFound(res);
    const scope = await getThresholdScope(current.item.id, locationId, req.business.id);
    if (process.env.NODE_ENV !== "production") console.error("[STOCK THRESHOLD SCOPE]", { productId: current.item.id, locationId, productBusinessId: scope.product_business_id, locationBusinessId: scope.location_business_id, locationStatus: scope.location_status, activeBusinessId: req.business.id });
    const location = await getActiveThresholdLocation(req.business.id, locationId);
    if (!location || Number(scope.product_business_id) !== Number(req.business.id)) {
      if (process.env.NODE_ENV !== "production") console.error("[STOCK THRESHOLD SCOPE]", { productId: current.item.id, locationId, productBusinessId: scope.product_business_id, locationBusinessId: scope.location_business_id, locationStatus: scope.location_status, activeBusinessId: req.business.id, locationCount: current.locations.length });
      return res.status(404).json({ error: { code: "LOCATION_NOT_FOUND", message: "La ubicación no pertenece al negocio activo o no está disponible." } });
    }
    const values = matchedData(req);
    const threshold = await upsertStockThreshold({ businessId: activeBusinessId, productId: current.item.id, locationId, minStock: values.minimumStock, maxStock: values.maximumStock ?? null, preferredSupplierId: values.preferredSupplierId ?? null, alertsEnabled: values.alertEnabled, suggestedReplenishment: values.suggestedReplenishment ?? null, createdBy: req.session.user.id });
    if (process.env.NODE_ENV !== "production") console.error("[STOCK THRESHOLD SAVE]", { productId: current.item.id, locationId, activeBusinessId, businessId: activeBusinessId, function: "saveThreshold", rowsAffected: threshold ? 1 : 0, result: threshold });
    if (!threshold) return res.status(500).json({ error: { code: "THRESHOLD_SAVE_FAILED", message: "No fue posible guardar el umbral después de validar la ubicación." } });
    const updated = await configuration(req); return res.status(200).json({ data: serialize(updated) });
  } catch (error) { return next(error); }
}

export async function removeThreshold(req, res, next) {
  const itemId = positiveId(req.params.productId); const locationId = positiveId(req.params.locationId);
  if (!itemId || !locationId) return validationError(res, [{ path: !itemId ? "productId" : "locationId", msg: "El ID debe ser un entero positivo." }]);
  try {
    const current = await configuration(req); if (!current) return productNotFound(res);
    const threshold = await deleteStockThreshold(req.business.id, itemId, locationId);
    if (!threshold) return res.status(404).json({ error: { code: "THRESHOLD_NOT_FOUND", message: "No se encontró la configuración solicitada." } });
    return res.status(204).end();
  } catch (error) { return next(error); }
}

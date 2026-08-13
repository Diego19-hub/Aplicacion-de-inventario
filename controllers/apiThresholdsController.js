import { matchedData, validationResult } from "express-validator";
import { deleteStockThreshold, getItemThresholdConfiguration, upsertStockThreshold } from "../db/alertQueries.js";

const positiveId = (value) => /^[1-9]\d*$/.test(String(value)) ? Number(value) : null;
const validationError = (res, errors) => res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Revisa los campos enviados.", fields: errors.map((error) => ({ field: error.path, message: error.msg })) } });
const productNotFound = (res) => res.status(404).json({ error: { code: "PRODUCT_NOT_FOUND", message: "No se encontró el producto solicitado." } });

function serialize(configuration) {
  return { product: { id: Number(configuration.item.id), name: configuration.item.name, sku: configuration.item.sku, stock: Number(configuration.item.stock) }, locations: configuration.locations.map((location) => ({ id: Number(location.location_id), name: location.location_name, code: location.code, isDefault: location.is_default, stock: Number(location.current_stock), minimumStock: location.minimum_stock === null ? null : Number(location.minimum_stock), alertStatus: location.alert_status, thresholdUpdatedAt: location.threshold_updated_at })) };
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
  const errors = validationResult(req); if (!errors.isEmpty()) return validationError(res, errors.array());
  try {
    const current = await configuration(req); if (!current) return productNotFound(res);
    const { minimumStock } = matchedData(req); const locationId = Number(req.params.locationId);
    const threshold = await upsertStockThreshold({ businessId: req.business.id, itemId: current.item.id, locationId, minimumStock, createdBy: req.session.user.id });
    if (!threshold) return res.status(404).json({ error: { code: "LOCATION_NOT_FOUND", message: "No se encontró la ubicación solicitada." } });
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

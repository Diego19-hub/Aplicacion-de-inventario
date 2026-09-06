import * as costLayerQueries from "../db/inventoryCostLayerQueries.js";

const SOURCE_OPERATION_TYPES = new Set(["opening_balance", "purchase_receipt", "manual_entry", "adjustment_in", "customer_return", "production_output", "transfer_in", "migration"]);
const CONSUMPTION_OPERATION_TYPES = new Set(["sale", "manual_exit", "damage_loss", "supplier_return", "production_consumption", "adjustment_out", "transfer_out", "other"]);
// Motivo auditable para una existencia cuyo costo de adquisición no se conoce.
// Las capas de saldo inicial migradas pueden conservar costo cero sin este motivo;
// los ajustes positivos nuevos deben declararlo explícitamente.
export const AUTHORIZED_ZERO_COST_ADJUSTMENT_REASON = "no_cost_known";

export class InventoryCostingError extends Error {
  constructor(code, message) { super(message); this.name = "InventoryCostingError"; this.code = code; }
}

function requireTransactionalClient(client) { if (!client || typeof client.query !== "function") throw new TypeError("Se requiere el cliente PostgreSQL de la transacción activa."); }
function positiveInteger(value, name) { if (!Number.isInteger(value) || value <= 0) throw new InventoryCostingError("INVALID_ARGUMENT", `${name} debe ser un entero positivo.`); }
function optionalPositiveInteger(value, name) { if (value !== null && value !== undefined) positiveInteger(value, name); }
function nonNegativeCost(value) {
  const text = String(value ?? "").trim();
  if (!/^\d+(?:\.\d+)?$/.test(text)) throw new InventoryCostingError("INVALID_ARGUMENT", "unitCost debe ser un costo no negativo.");
}
function assertSourceOperationType(value) { if (!SOURCE_OPERATION_TYPES.has(value)) throw new InventoryCostingError("INVALID_SOURCE_OPERATION", "El tipo de origen de la capa no es válido."); }
function assertConsumptionOperationType(value) { if (!CONSUMPTION_OPERATION_TYPES.has(value)) throw new InventoryCostingError("INVALID_CONSUMPTION_OPERATION", "El tipo de consumo de la capa no es válido."); }
function number(value) { return Number(value); }

async function lockSingleItem(client, { businessId, itemId }) {
  const items = await costLayerQueries.lockInventoryItemsForUpdate(client, { businessId, itemIds: [itemId] });
  if (items.length !== 1) throw new InventoryCostingError("ITEM_NOT_FOUND", "El producto no pertenece al negocio activo.");
}
async function ensureLocation(client, { businessId, locationId }) {
  const location = await costLayerQueries.lockBusinessLocationForShare(client, { businessId, locationId });
  if (!location) throw new InventoryCostingError("LOCATION_NOT_FOUND", "La ubicación no pertenece al negocio activo.");
}

export async function createCostLayer(client, data) {
  requireTransactionalClient(client);
  positiveInteger(data.businessId, "businessId"); positiveInteger(data.itemId, "itemId"); positiveInteger(data.locationId, "locationId");
  positiveInteger(data.quantity, "quantity"); nonNegativeCost(data.unitCost); assertSourceOperationType(data.sourceOperationType);
  optionalPositiveInteger(data.sourceOperationId, "sourceOperationId"); optionalPositiveInteger(data.sourceMovementId, "sourceMovementId");
  optionalPositiveInteger(data.sourceLayerId, "sourceLayerId"); optionalPositiveInteger(data.createdBy, "createdBy");
  await lockSingleItem(client, data); await ensureLocation(client, data);
  if (data.sourceLayerId) {
    const source = await costLayerQueries.lockSourceInventoryCostLayerForShare(client, { businessId: data.businessId, layerId: data.sourceLayerId });
    if (!source) throw new InventoryCostingError("SOURCE_LAYER_NOT_FOUND", "La capa de origen no pertenece al negocio activo.");
  }
  return costLayerQueries.createInventoryCostLayer(client, data);
}

export async function getAvailableCostLayers(client, filters) {
  requireTransactionalClient(client); positiveInteger(filters.businessId, "businessId"); positiveInteger(filters.itemId, "itemId"); positiveInteger(filters.locationId, "locationId");
  return costLayerQueries.getAvailableInventoryCostLayers(client, filters);
}
export async function lockAvailableCostLayers(client, filters) {
  requireTransactionalClient(client); positiveInteger(filters.businessId, "businessId"); positiveInteger(filters.itemId, "itemId"); positiveInteger(filters.locationId, "locationId");
  await lockSingleItem(client, filters);
  return costLayerQueries.lockAvailableInventoryCostLayersForUpdate(client, filters);
}

export async function consumeCostLayers(client, data) {
  requireTransactionalClient(client);
  positiveInteger(data.businessId, "businessId"); positiveInteger(data.itemId, "itemId"); positiveInteger(data.locationId, "locationId"); positiveInteger(data.quantity, "quantity");
  assertConsumptionOperationType(data.operationType); positiveInteger(data.operationId, "operationId"); optionalPositiveInteger(data.relatedMovementId, "relatedMovementId"); optionalPositiveInteger(data.createdBy, "createdBy");
  await lockSingleItem(client, data); await ensureLocation(client, data);
  const layers = await costLayerQueries.lockAvailableInventoryCostLayersForUpdate(client, data);
  if (layers.reduce((total, layer) => total + number(layer.quantity_available), 0) < data.quantity) {
    throw new InventoryCostingError("INSUFFICIENT_COST_LAYER_STOCK", "No hay existencias suficientes en las capas FIFO.");
  }
  let remaining = data.quantity; const consumptions = [];
  for (const layer of layers) {
    if (remaining === 0) break;
    const quantity = Math.min(number(layer.quantity_available), remaining);
    const updatedLayer = await costLayerQueries.updateInventoryCostLayerAvailability(client, { businessId: data.businessId, layerId: layer.id, quantityAvailable: number(layer.quantity_available) - quantity });
    if (!updatedLayer) throw new InventoryCostingError("LAYER_NOT_FOUND", "La capa FIFO dejó de estar disponible.");
    const consumption = await costLayerQueries.createInventoryLayerConsumption(client, {
      businessId: data.businessId, layerId: layer.id, relatedMovementId: data.relatedMovementId, operationType: data.operationType,
      operationId: data.operationId, operationReference: data.operationReference, quantity, unitCost: layer.unit_cost, createdBy: data.createdBy, consumedAt: data.consumedAt
    });
    consumptions.push({ layer, updatedLayer, consumption }); remaining -= quantity;
  }
  return consumptions;
}

export async function restoreCostLayerStock(client, { businessId, itemId, layerId, quantity }) {
  requireTransactionalClient(client); positiveInteger(businessId, "businessId"); positiveInteger(itemId, "itemId"); positiveInteger(layerId, "layerId"); positiveInteger(quantity, "quantity");
  await lockSingleItem(client, { businessId, itemId });
  const layer = await costLayerQueries.lockInventoryCostLayerForUpdate(client, { businessId, layerId });
  if (!layer || number(layer.item_id) !== itemId) throw new InventoryCostingError("LAYER_NOT_FOUND", "La capa FIFO no pertenece al producto del negocio activo.");
  const quantityAvailable = number(layer.quantity_available) + quantity;
  if (quantityAvailable > number(layer.quantity_original)) throw new InventoryCostingError("RESTORE_EXCEEDS_ORIGINAL", "La devolución excede la cantidad original de la capa.");
  return costLayerQueries.updateInventoryCostLayerAvailability(client, { businessId, layerId, quantityAvailable });
}

export async function createReturnCostLayer(client, data) {
  return createCostLayer(client, { ...data, sourceOperationType: "customer_return", sourceOperationId: data.returnOperationId });
}

export async function moveCostLayers(client, data) {
  const { businessId, itemId, fromLocationId, toLocationId, quantity, transferId, sourceMovementId = null, operationReference = null, createdBy = null, movedAt = null } = data;
  requireTransactionalClient(client); positiveInteger(businessId, "businessId"); positiveInteger(itemId, "itemId"); positiveInteger(fromLocationId, "fromLocationId"); positiveInteger(toLocationId, "toLocationId"); positiveInteger(quantity, "quantity"); positiveInteger(transferId, "transferId");
  if (fromLocationId === toLocationId) throw new InventoryCostingError("SAME_LOCATION", "El origen y destino de la transferencia deben ser distintos.");
  await lockSingleItem(client, { businessId, itemId }); await ensureLocation(client, { businessId, locationId: fromLocationId }); await ensureLocation(client, { businessId, locationId: toLocationId });
  const consumedLayers = await consumeCostLayers(client, { businessId, itemId, locationId: fromLocationId, quantity, operationType: "transfer_out", operationId: transferId, operationReference, relatedMovementId: sourceMovementId, createdBy, consumedAt: movedAt });
  const movedLayers = [];
  for (const { layer, consumption } of consumedLayers) {
    // pg devuelve BIGINT como texto; normalizarlo a número entero positivo
    // antes de pasar por la validación, sin convertir un identificador inválido
    // en null ni ocultar el error.
    const sourceLayerId = Number(layer.id);
    movedLayers.push(await createCostLayer(client, { businessId, itemId, locationId: toLocationId, quantity: number(consumption.quantity), unitCost: layer.unit_cost, sourceOperationType: "transfer_in", sourceOperationId: transferId, sourceMovementId, sourceLayerId, sourceReference: layer.source_reference || operationReference, createdBy, receivedAt: layer.received_at }));
  }
  return { consumedLayers, movedLayers };
}

export async function calculateAvailableCost(client, filters) { requireTransactionalClient(client); positiveInteger(filters.businessId, "businessId"); positiveInteger(filters.itemId, "itemId"); positiveInteger(filters.locationId, "locationId"); return costLayerQueries.getAvailableInventoryCostSummary(client, filters); }
export async function calculateOperationCost(client, filters) {
  requireTransactionalClient(client); positiveInteger(filters.businessId, "businessId"); positiveInteger(filters.operationId, "operationId");
  optionalPositiveInteger(filters.relatedMovementId, "relatedMovementId");
  return costLayerQueries.getInventoryLayerConsumptionCost(client, filters);
}
export async function calculateProductionCost(client, filters) {
  requireTransactionalClient(client);
  positiveInteger(filters.businessId, "businessId");
  if (!Array.isArray(filters.movementIds) || filters.movementIds.length === 0 || !filters.movementIds.every((id) => Number.isInteger(id) && id > 0)) throw new InventoryCostingError("INVALID_ARGUMENT", "movementIds debe contener identificadores válidos de producción.");
  positiveInteger(filters.producedQuantity, "producedQuantity");
  return costLayerQueries.getProductionCost(client, filters);
}
export async function calculateInventoryValue(client, { businessId, itemId = null, locationId = null }) { requireTransactionalClient(client); positiveInteger(businessId, "businessId"); optionalPositiveInteger(itemId, "itemId"); optionalPositiveInteger(locationId, "locationId"); return costLayerQueries.getInventoryCostValue(client, { businessId, itemId, locationId }); }
export async function getInventoryValuationMethod(client, { businessId }) { requireTransactionalClient(client); positiveInteger(businessId, "businessId"); return costLayerQueries.getBusinessInventoryValuationMethod(client, { businessId }); }

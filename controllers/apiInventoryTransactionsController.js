import { matchedData, validationResult } from "express-validator";
import { createInventoryAdjustment, createInventoryEntry, createInventoryExit } from "../db/inventoryTransactionQueries.js";
import { InventoryCostingError } from "../services/inventoryCostingService.js";
function validationError(res, errors) { return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Revisa los campos enviados.", fields: errors } }); }
function handle(req, res) { const errors = validationResult(req); return errors.isEmpty() ? null : validationError(res, errors.array().map((item) => ({ field: item.path, message: item.msg }))); }
async function create(req, res, next, creator) {
  const invalid = handle(req, res);
  if (invalid) return invalid;
  try {
    const result = await creator({ businessId: req.business.id, userId: req.session.user.id, ...matchedData(req) });
    if (result.error === "location_not_found") return validationError(res, [{ field: "locationId", message: "La ubicación no existe o está inactiva." }]);
    if (result.error === "product_not_found") return validationError(res, [{ field: "lines", message: "Uno de los productos no pertenece al negocio activo." }]);
    if (result.error === "product_inactive") return res.status(409).json({ error: { code: "PRODUCT_INACTIVE", message: "No puedes modificar un producto archivado." } });
    if (result.error === "insufficient_stock") return res.status(409).json({ error: { code: "INSUFFICIENT_STOCK", message: "La disminución supera el inventario disponible." } });
    if (result.error === "fifo_adjustment_cost_required") return res.status(422).json({ error: { code: "FIFO_ADJUSTMENT_COST_REQUIRED", message: "En FIFO, un ajuste positivo requiere costo unitario. Si no se conoce, registra costo 0 con el motivo autorizado de existencia sin costo conocido.", fields: [{ field: "lines", message: "Indica el costo unitario del ajuste positivo." }] } });
    if (result.error === "fifo_zero_cost_reason_required") return res.status(422).json({ error: { code: "FIFO_ZERO_COST_REASON_REQUIRED", message: "El costo cero solo está permitido con el motivo autorizado de existencia sin costo conocido; afectará la valuación del inventario y puede afectar la utilidad.", fields: [{ field: "lines", message: "Selecciona el motivo autorizado para costo cero." }] } });
    if (result.error === "fifo_zero_cost_reason_invalid") return res.status(422).json({ error: { code: "FIFO_ZERO_COST_REASON_INVALID", message: "El motivo de costo cero solo puede usarse cuando el costo unitario es 0.", fields: [{ field: "lines", message: "Quita el motivo o usa costo 0." }] } });
    return res.status(201).json({ data: { transaction: result } });
  } catch (error) {
    if (error instanceof InventoryCostingError && error.code === "INSUFFICIENT_COST_LAYER_STOCK") return res.status(409).json({ error: { code: "INSUFFICIENT_STOCK", message: "La disminución supera el inventario disponible." } });
    return next(error);
  }
}
export function createEntry(req, res, next) { return create(req, res, next, createInventoryEntry); }
export function createAdjustment(req, res, next) { return create(req, res, next, createInventoryAdjustment); }
export function createExit(req, res, next) { return create(req, res, next, createInventoryExit); }

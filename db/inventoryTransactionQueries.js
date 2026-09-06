import pool from "./pool.js";
import { auditService } from "../services/auditService.js";
import { notificationService } from "../services/notificationService.js";
import { AUTHORIZED_ZERO_COST_ADJUSTMENT_REASON, consumeCostLayers, createCostLayer, getInventoryValuationMethod } from "../services/inventoryCostingService.js";

function reference(prefix, supplied) { return supplied?.trim() || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`; }

export async function createInventoryEntry({ businessId, userId, date, reference: suppliedReference, supplier, notes, locationId, lines }) {
  return applyInventoryLines({ businessId, userId, date, reference: reference("RECEIPT", suppliedReference), locationId, lines, kind: "entry", supplier, notes });
}

export async function createInventoryAdjustment({ businessId, userId, date, reference: suppliedReference, notes, locationId, lines }) {
  return applyInventoryLines({ businessId, userId, date, reference: reference("ADJUSTMENT", suppliedReference), locationId, lines, kind: "adjustment", notes });
}

export async function createInventoryExit({ businessId, userId, date, reference: suppliedReference, reason, notes, locationId, lines }) {
  return applyInventoryLines({ businessId, userId, date, reference: reference("OUT", suppliedReference), locationId, lines, kind: "exit", reason, notes });
}

async function applyInventoryLines({ businessId, userId, date, reference, supplier, reason, notes, locationId, lines, kind }) {
  const client = await pool.connect();
  // created_at es la marca inmutable de registro. Una fecha de formulario sin hora
  // se interpreta a medianoche y puede enviar una operación nueva fuera de la primera página.
  try {
    await client.query("BEGIN");
    const valuationMethod = await getInventoryValuationMethod(client, { businessId });
    const location = (await client.query("SELECT id FROM business_locations WHERE business_id=$1 AND id=$2 AND status='active' FOR KEY SHARE", [businessId, locationId])).rows[0];
    if (!location) return rollback(client, { error: "location_not_found" });
    const ids = [...new Set(lines.map((line) => Number(line.itemId)))];
    const products = (await client.query("SELECT id,name,status,cost_price FROM items WHERE business_id=$1 AND id=ANY($2::INTEGER[]) ORDER BY id FOR UPDATE", [businessId, ids])).rows;
    if (products.length !== ids.length) return rollback(client, { error: "product_not_found" });
    if (products.some((product) => product.status !== "active")) return rollback(client, { error: "product_inactive" });
    const warnings = [];
    const isZeroCost = (value) => /^0(?:\.0+)?$/.test(String(value ?? "").trim());
    if (valuationMethod === "fifo" && kind === "adjustment") {
      for (const line of lines) {
        if (line.adjustmentType !== "increase") continue;
        const hasUnitCost = line.unitCost !== undefined && line.unitCost !== null && String(line.unitCost).trim() !== "";
        if (!hasUnitCost) return rollback(client, { error: "fifo_adjustment_cost_required", itemId: line.itemId });
        if (isZeroCost(line.unitCost) && line.zeroCostReason !== AUTHORIZED_ZERO_COST_ADJUSTMENT_REASON) {
          return rollback(client, { error: "fifo_zero_cost_reason_required", itemId: line.itemId });
        }
        if (!isZeroCost(line.unitCost) && line.zeroCostReason) {
          return rollback(client, { error: "fifo_zero_cost_reason_invalid", itemId: line.itemId });
        }
        if (isZeroCost(line.unitCost)) warnings.push("Este ajuste usa costo cero autorizado; afectará la valuación del inventario y puede afectar la utilidad.");
      }
    }
    await client.query("INSERT INTO inventory_balances (business_id,location_id,item_id,stock) SELECT $1,$2,x,0 FROM unnest($3::INTEGER[]) x ON CONFLICT DO NOTHING", [businessId, locationId, ids]);
    const balances = (await client.query("SELECT item_id,stock FROM inventory_balances WHERE business_id=$1 AND location_id=$2 AND item_id=ANY($3::INTEGER[]) FOR UPDATE", [businessId, locationId, ids])).rows;
    const stock = new Map(balances.map((row) => [Number(row.item_id), Number(row.stock)]));
    for (const line of lines) {
      const delta = kind === "entry" || (kind === "adjustment" && line.adjustmentType === "increase") ? Number(line.quantity) : -Number(line.quantity);
      const previous = stock.get(Number(line.itemId)) ?? 0; const resulting = previous + delta;
      if (resulting < 0) return rollback(client, { error: "insufficient_stock", itemId: line.itemId });
      const zeroCostReason = kind === "adjustment" && line.adjustmentType === "increase" && isZeroCost(line.unitCost) ? ` · Costo cero autorizado: ${line.zeroCostReason}` : "";
      const movementReason = `${kind === "entry" ? "Entrada de inventario" : kind === "exit" ? `Salida manual · ${reason}` : "Ajuste de inventario"}${supplier ? ` · Proveedor: ${supplier}` : ""}${notes ? ` · ${notes}` : ""}${zeroCostReason}`.slice(0, 500);
      const movement = (await client.query("INSERT INTO inventory_movements (business_id,location_id,item_id,movement_type,quantity_delta,previous_stock,resulting_stock,reason,reference,created_by,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,CURRENT_TIMESTAMP) RETURNING id", [businessId, locationId, line.itemId, kind, delta, previous, resulting, movementReason, reference, userId])).rows[0];
      await client.query("UPDATE inventory_balances SET stock=$1 WHERE business_id=$2 AND location_id=$3 AND item_id=$4", [resulting, businessId, locationId, line.itemId]);
      await client.query("UPDATE items SET stock=stock+$1, cost_price=CASE WHEN $2::BOOLEAN THEN $3 ELSE cost_price END WHERE business_id=$4 AND id=$5 AND status='active'", [delta, kind === "entry" && line.unitCost !== undefined, line.unitCost ?? null, businessId, line.itemId]);
      if (valuationMethod === "fifo") {
        const product = products.find((candidate) => Number(candidate.id) === Number(line.itemId));
        if (delta > 0) await createCostLayer(client, { businessId, itemId: Number(line.itemId), locationId: Number(locationId), quantity: delta, unitCost: kind === "entry" ? line.unitCost ?? product.cost_price ?? 0 : line.unitCost, sourceOperationType: kind === "entry" ? "manual_entry" : "adjustment_in", sourceOperationId: Number(movement.id), sourceMovementId: Number(movement.id), sourceReference: reference, createdBy: userId });
        else await consumeCostLayers(client, { businessId, itemId: Number(line.itemId), locationId: Number(locationId), quantity: -delta, operationType: kind === "exit" ? "manual_exit" : "adjustment_out", operationId: Number(movement.id), relatedMovementId: Number(movement.id), operationReference: reference, createdBy: userId });
      }
      stock.set(Number(line.itemId), resulting);
      await notificationService.notifyStockState({ client, businessId, itemId: line.itemId, locationId, stock: resulting });
    }
    await auditService.record({ client, businessId, userId, module: "inventory", action: kind === "adjustment" ? "edit" : "create", reference, description: kind === "entry" ? "Entrada de inventario registrada" : kind === "exit" ? "Salida manual de inventario registrada" : warnings.length ? "Ajuste de inventario registrado con costo cero autorizado (afecta valuación y utilidad)" : "Ajuste de inventario registrado", newValues: { locationId, lines, supplier, reason, notes, warnings } });
    await client.query("COMMIT");
    return { reference, locationId: Number(locationId), lines: lines.length, ...(warnings.length ? { warnings } : {}) };
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; } finally { client.release(); }
}

async function rollback(client, result) { await client.query("ROLLBACK"); return result; }

import pool from "./pool.js";
import { auditService } from "../services/auditService.js";
import { notificationService } from "../services/notificationService.js";

function reference(prefix, supplied) { return supplied?.trim() || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`; }

export async function createInventoryEntry({ businessId, userId, date, reference: suppliedReference, supplier, notes, locationId, lines }) {
  return applyInventoryLines({ businessId, userId, date, reference: reference("RECEIPT", suppliedReference), locationId, lines, kind: "entry", supplier, notes });
}

export async function createInventoryAdjustment({ businessId, userId, date, reference: suppliedReference, notes, locationId, lines }) {
  return applyInventoryLines({ businessId, userId, date, reference: reference("ADJUSTMENT", suppliedReference), locationId, lines, kind: "adjustment", notes });
}

async function applyInventoryLines({ businessId, userId, date, reference, supplier, notes, locationId, lines, kind }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const location = (await client.query("SELECT id FROM business_locations WHERE business_id=$1 AND id=$2 AND status='active' FOR KEY SHARE", [businessId, locationId])).rows[0];
    if (!location) return rollback(client, { error: "location_not_found" });
    const ids = [...new Set(lines.map((line) => Number(line.itemId)))];
    const products = (await client.query("SELECT id,name,status FROM items WHERE business_id=$1 AND id=ANY($2::INTEGER[]) ORDER BY id FOR UPDATE", [businessId, ids])).rows;
    if (products.length !== ids.length) return rollback(client, { error: "product_not_found" });
    if (products.some((product) => product.status !== "active")) return rollback(client, { error: "product_inactive" });
    await client.query("INSERT INTO inventory_balances (business_id,location_id,item_id,stock) SELECT $1,$2,x,0 FROM unnest($3::INTEGER[]) x ON CONFLICT DO NOTHING", [businessId, locationId, ids]);
    const balances = (await client.query("SELECT item_id,stock FROM inventory_balances WHERE business_id=$1 AND location_id=$2 AND item_id=ANY($3::INTEGER[]) FOR UPDATE", [businessId, locationId, ids])).rows;
    const stock = new Map(balances.map((row) => [Number(row.item_id), Number(row.stock)]));
    for (const line of lines) {
      const delta = kind === "entry" || line.adjustmentType === "increase" ? Number(line.quantity) : -Number(line.quantity);
      const previous = stock.get(Number(line.itemId)) ?? 0; const resulting = previous + delta;
      if (resulting < 0) return rollback(client, { error: "insufficient_stock", itemId: line.itemId });
      const reason = `${kind === "entry" ? "Entrada de inventario" : "Ajuste de inventario"}${supplier ? ` · Proveedor: ${supplier}` : ""}${notes ? ` · ${notes}` : ""}`.slice(0, 500);
      await client.query("INSERT INTO inventory_movements (business_id,location_id,item_id,movement_type,quantity_delta,previous_stock,resulting_stock,reason,reference,created_by,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)", [businessId, locationId, line.itemId, kind, delta, previous, resulting, reason, reference, userId, date]);
      await client.query("UPDATE inventory_balances SET stock=$1 WHERE business_id=$2 AND location_id=$3 AND item_id=$4", [resulting, businessId, locationId, line.itemId]);
      await client.query("UPDATE items SET stock=stock+$1, cost_price=CASE WHEN $2::BOOLEAN THEN $3 ELSE cost_price END WHERE business_id=$4 AND id=$5 AND status='active'", [delta, kind === "entry" && line.unitCost !== undefined, line.unitCost ?? null, businessId, line.itemId]);
      stock.set(Number(line.itemId), resulting);
      await notificationService.notifyStockState({ client, businessId, itemId: line.itemId, locationId, stock: resulting });
    }
    await auditService.record({ client, businessId, userId, module: "inventory", action: kind === "entry" ? "create" : "edit", reference, description: kind === "entry" ? "Entrada de inventario registrada" : "Ajuste de inventario registrado", newValues: { locationId, lines, supplier, notes } });
    await client.query("COMMIT");
    return { reference, locationId: Number(locationId), lines: lines.length };
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; } finally { client.release(); }
}

async function rollback(client, result) { await client.query("ROLLBACK"); return result; }

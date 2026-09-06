import pool from "./pool.js";
import { auditService } from "../services/auditService.js";

export const INVENTORY_VALUATION_METHODS = ["average", "fifo"];

export function valuationWarning(method) {
  return method === "fifo"
    ? "PEPS/FIFO consume primero las capas más antiguas. Los saldos existentes sin capa requieren inicialización manual; el cambio no crea capas ni altera movimientos históricos."
    : null;
}

export async function getBusinessValuationSettings(businessId) {
  const result = await pool.query(
    `SELECT id, inventory_valuation_method
     FROM businesses
     WHERE id = $1 AND status = 'active'`,
    [businessId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    businessId: Number(row.id),
    valuationMethod: row.inventory_valuation_method,
    warning: valuationWarning(row.inventory_valuation_method)
  };
}

export async function updateBusinessValuationMethod({ businessId, userId, valuationMethod }) {
  if (!INVENTORY_VALUATION_METHODS.includes(valuationMethod)) return { error: "invalid_method" };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = (await client.query(
      `SELECT id, inventory_valuation_method
       FROM businesses
       WHERE id = $1 AND status = 'active'
       FOR UPDATE`,
      [businessId]
    )).rows[0];
    if (!current) {
      await client.query("ROLLBACK");
      return { error: "business_not_found" };
    }
    const updated = (await client.query(
      `UPDATE businesses
       SET inventory_valuation_method = $1
       WHERE id = $2 AND status = 'active'
       RETURNING id, inventory_valuation_method`,
      [valuationMethod, businessId]
    )).rows[0];
    await auditService.record({
      client,
      businessId,
      userId,
      module: "business_settings",
      action: "edit",
      reference: `BUSINESS-VALUATION-${businessId}`,
      description: "Método de valuación del inventario actualizado",
      previousValues: {
        valuationMethod: current.inventory_valuation_method
      },
      newValues: {
        valuationMethod: updated.inventory_valuation_method,
        warning: valuationWarning(updated.inventory_valuation_method)
      }
    });
    await client.query("COMMIT");
    return {
      businessId: Number(updated.id),
      valuationMethod: updated.inventory_valuation_method,
      warning: valuationWarning(updated.inventory_valuation_method)
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

import assert from "node:assert/strict";
import test from "node:test";
import { localAssistantReply } from "../services/assistantService.js";

const context = {
  summary: { active_products: 2, total_units: 8 },
  products: [{ name: "Guantes", sku: "BOX-001", stock: 5 }],
  recentMovements: [{ movement_type: "entry", product_name: "Guantes", sku: "BOX-001", quantity_delta: 3, location_name: "Principal" }],
  salesLast30Days: { completed_sales: 4, revenue: "1000.00", inventory_cost: "400.00" }
};

test("el asistente local responde con datos autorizados del contexto", () => {
  assert.match(localAssistantReply("¿Cuánto stock hay de Guantes?", context), /5 unidades/);
  assert.match(localAssistantReply("¿Cómo van las ventas?", context), /4 ventas completadas/);
  assert.match(localAssistantReply("último movimiento", context), /Guantes/);
});

test("el asistente local no inventa acciones", () => {
  assert.match(localAssistantReply("haz una venta", context), /ventas completadas/);
});

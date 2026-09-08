import assert from "node:assert/strict";
import test from "node:test";
import { localAssistantReply, localAssistantResponse } from "../services/assistantService.js";
import { assistantKnowledge, getAssistantModule } from "../services/assistantKnowledge.js";

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

test("la base de conocimiento cubre los módulos y conserva rutas internas", () => {
  const names = assistantKnowledge.map((entry) => entry.name);
  for (const name of ["Dashboard", "Productos", "Caja", "Punto de venta", "Reportes", "PEPS/FIFO"]) assert.ok(names.includes(name));
  for (const entry of assistantKnowledge) {
    assert.ok(entry.path.startsWith("/app"));
    assert.ok(entry.purpose);
    assert.ok(entry.steps.length > 0);
    assert.ok(entry.allowedRoles);
    assert.ok(entry.warning);
  }
});

test("el respaldo local guía según la pantalla y ofrece navegación sin ejecutar acciones", () => {
  const answer = localAssistantResponse("¿Cómo funciona?", { ...context, pathname: "/app/cash", role: "manager" });
  assert.match(answer.message, /Estás en Caja/);
  assert.match(answer.message, /1\. En Caja, abre Movimiento manual/);
  assert.deepEqual(answer.links[0], { label: "Abrir Caja", to: "/app/cash" });
  assert.equal(getAssistantModule("/app/point-of-sale").name, "Punto de venta");
});

test("el respaldo local explica FIFO y limita a viewer a consulta", () => {
  const answer = localAssistantResponse("¿Qué es FIFO?", { ...context, pathname: "/app/products", role: "viewer" });
  assert.match(answer.message, /PEPS\/FIFO/);
  assert.match(answer.message, /rol viewer puedes consultar/);
});

test("el respaldo local cubre las preguntas guiadas principales", () => {
  assert.match(localAssistantResponse("¿Cómo registro una venta?", { ...context, pathname: "/app/point-of-sale" }).message, /Finalizar venta/);
  assert.match(localAssistantResponse("¿Cómo cierro caja?", { ...context, pathname: "/app/cash" }).message, /Efectivo esperado/);
  assert.match(localAssistantResponse("¿Cómo agrego un producto?", { ...context, pathname: "/app/products" }).message, /Crear producto/);
  assert.match(localAssistantResponse("¿Cómo veo reportes?", { ...context, pathname: "/app/reports" }).message, /Análisis > Reportes/);
});

test("el respaldo local rechaza preguntas ajenas a la aplicación", () => {
  assert.match(localAssistantResponse("¿Cuál es la capital de Francia?", context).message, /Puedo ayudarte a usar Inventario/);
});

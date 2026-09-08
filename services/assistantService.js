import { assistantKnowledge, localGuidance } from "./assistantKnowledge.js";

const DEFAULT_MODEL = "gemini-2.5-flash-lite";
const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

const n = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const money = (value) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n(value));
const asksForGuidance = (message) => /como|cómo|paso|funciona|registr|agreg|crear|cerr|finaliz|donde|dónde|qué es|que es|qué significa|que significa|fifo|peps/.test(message.toLocaleLowerCase("es-MX"))
  && !/como van|cómo van|cuanto|cuánto|ultimo|último/.test(message.toLocaleLowerCase("es-MX"));
const hasSensitiveContent = (value = "") => /[\w.+-]+@[\w.-]+\.[a-z]{2,}|contraseñ|password|sesion|session|token|cliente|tel[eé]fono/i.test(value);

export function localAssistantReply(message, context) {
  const text = message.toLocaleLowerCase("es-MX");
  const products = context.products ?? [];
  if (asksForGuidance(message)) {
    return localGuidance(message, context).message;
  }
  if (/venta|ingreso|utilidad/.test(text)) {
    const sales = context.salesLast30Days ?? {};
    return `En los últimos 30 días hay ${n(sales.completed_sales)} ventas completadas por ${money(sales.revenue)}. El costo de inventario registrado es ${money(sales.inventory_cost)}.`;
  }
  if (/movimiento|entrada|salida|ajuste|transfer/.test(text)) {
    const movement = context.recentMovements?.[0];
    return movement
      ? `El movimiento más reciente es ${movement.movement_type} de ${movement.product_name} (${movement.sku}), por ${n(movement.quantity_delta)} unidades en ${movement.location_name}.`
      : "No hay movimientos recientes en este negocio.";
  }
  const product = products.find((row) => text.includes(String(row.name).toLocaleLowerCase("es-MX")) || text.includes(String(row.sku).toLocaleLowerCase("es-MX")));
  if (product) return `${product.name} (${product.sku}) tiene ${n(product.stock)} unidades disponibles en total.`;
  if (/stock|inventario|producto/.test(text)) {
    return `El negocio tiene ${n(context.summary?.active_products)} productos activos y ${n(context.summary?.total_units)} unidades en inventario. Puedes preguntarme por el nombre o SKU de un producto.`;
  }
  return localGuidance(message, context).message;
}

export function localAssistantResponse(message, context) {
  const guidance = localGuidance(message, context);
  const isGuidance = asksForGuidance(message);
  return { message: isGuidance ? guidance.message : localAssistantReply(message, context), links: isGuidance ? guidance.links : [] };
}

export async function generateAssistantReply({ message, history = [], context, role, signal }) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || hasSensitiveContent(message) || history.some((item) => hasSensitiveContent(item.content))) {
    return { ...localAssistantResponse(message, context), source: "local" };
  }

  const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  const instruction = [
    "Eres el asistente en español de una aplicación de inventario.",
    "Tu función principal es enseñar a usar la aplicación paso a paso según la pantalla actual.",
    "Para preguntas de cómo usarla, da pasos numerados y usa exclusivamente la guía interna proporcionada.",
    "Responde breve y exclusivamente con el contexto autorizado.",
    "No inventes cifras, no generes SQL y no afirmes modificar datos.",
    "Solo consultas y explicaciones; nunca ejecutes ventas, movimientos o cambios.",
    `Rol: ${role}. Ruta actual: ${context.pathname}. Módulo actual: ${context.currentModule?.name}.`,
    `Guía interna: ${JSON.stringify(assistantKnowledge)}`,
    `Datos autorizados del negocio activo: ${JSON.stringify({ summary: context.summary, products: context.products, recentMovements: context.recentMovements, salesLast30Days: context.salesLast30Days })}`
  ].join("\n");

  try {
    const response = await fetch(`${GEMINI_ENDPOINT}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: instruction }] },
        contents: [...history.slice(-6).map((item) => ({ role: item.role === "assistant" ? "model" : "user", parts: [{ text: item.content }] })), { role: "user", parts: [{ text: message }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 500 }
      }),
      signal
    });
    if (!response.ok) {
      if (process.env.NODE_ENV === "development") console.warn("[assistant/gemini]", { status: response.status, message: "Gemini respondió con un estado no exitoso." });
      return { ...localAssistantResponse(message, context), source: "local" };
    }
    const payload = await response.json();
    const answer = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text).filter(Boolean).join("\n").trim();
    return answer ? { message: answer, links: localGuidance(message, context).links, source: "gemini" } : { ...localAssistantResponse(message, context), source: "local" };
  } catch (error) {
    if (error.name === "AbortError") throw error;
    if (process.env.NODE_ENV === "development") console.warn("[assistant/gemini]", { message: "No fue posible obtener una respuesta de Gemini." });
    return { ...localAssistantResponse(message, context), source: "local" };
  }
}

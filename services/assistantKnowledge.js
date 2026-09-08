const roles = "Owner y manager pueden realizar operaciones; viewer solo puede consultar la información disponible.";

function module(key, name, path, purpose, steps, links = [], faq = [], warning = "El asistente solo explica y consulta; no ejecuta esta acción.") {
  return { key, name, path, summary: `Guía de ${name}.`, purpose, steps, allowedRoles: roles, warning, faq, links };
}

export const assistantKnowledge = [
  module("dashboard", "Dashboard", "/app", "resume existencias, ventas y alertas para empezar el día.", ["Revisa los indicadores principales.", "Abre una tarjeta para ver el detalle.", "Usa el menú lateral para continuar con el módulo necesario."], [{ label: "Ver reportes", to: "/app/reports" }], ["¿Cómo interpreto las alertas?"]),
  module("products", "Productos", "/app/products", "crea y consulta el catálogo y sus existencias.", ["Ve a Inventario > Productos.", "Selecciona Crear producto.", "Completa nombre, SKU, categoría y datos requeridos.", "Guarda el producto.", "Registra existencias mediante una entrada, no editando el stock directamente."], [{ label: "Ver productos", to: "/app/products" }, { label: "Crear entrada", to: "/app/transactions/entries/new" }], ["¿Cómo agrego un producto?", "¿Qué son las capas FIFO?"]),
  module("categories", "Categorías", "/app/categories", "organiza productos para buscarlos y reportarlos mejor.", ["Ve a Inventario > Categorías.", "Selecciona Nueva categoría.", "Escribe el nombre y guarda."], [{ label: "Ver categorías", to: "/app/categories" }]),
  module("locations", "Ubicaciones", "/app/locations", "administra almacenes, sucursales o puntos donde se guarda stock.", ["Ve a Inventario > Ubicaciones.", "Selecciona Crear ubicación.", "Indica nombre, código y tipo.", "Guarda y úsala al registrar movimientos."], [{ label: "Ver ubicaciones", to: "/app/locations" }]),
  module("suppliers", "Proveedores", "/app/suppliers", "guarda los proveedores usados en compras y devoluciones.", ["Ve a Inventario > Proveedores.", "Selecciona Crear proveedor.", "Captura sus datos de contacto y guarda."], [{ label: "Ver proveedores", to: "/app/suppliers" }]),
  module("pos", "Punto de venta", "/app/point-of-sale", "registra ventas con productos disponibles en una ubicación.", ["Ve a Operaciones > Punto de venta.", "Selecciona la ubicación.", "Agrega productos disponibles y revisa las cantidades.", "Selecciona el método de pago.", "Indica el efectivo recibido si aplica.", "Presiona Finalizar venta."], [{ label: "Ir a Punto de venta", to: "/app/point-of-sale" }, { label: "Ver ventas", to: "/app/sales" }], ["¿Cómo finalizo una venta?", "¿Por qué no puedo vender más unidades?"], "Una venta completada afecta inventario y caja; verifica los datos antes de confirmarla."),
  module("cash", "Caja", "/app/cash", "controla aperturas, movimientos de efectivo y cortes de caja.", ["En Caja, abre Movimiento manual.", "Selecciona Entrada o salida de efectivo.", "Escribe el importe y el motivo.", "Confirma la operación."], [{ label: "Abrir Caja", to: "/app/cash" }, { label: "Ver historial de caja", to: "/app/cash/history" }], ["¿Cómo registro una entrada de efectivo?", "¿Cómo cierro caja?", "¿Qué significa efectivo esperado?"], "Los movimientos manuales de caja no modifican el inventario."),
  module("sales", "Ventas", "/app/sales", "consulta ventas ya registradas y sus detalles.", ["Ve a Operaciones > Ventas.", "Usa los filtros disponibles.", "Abre una venta para revisar artículos, pagos y totales."], [{ label: "Ver ventas", to: "/app/sales" }, { label: "Ir a Punto de venta", to: "/app/point-of-sale" }]),
  module("collections", "Cobranza", "/app/collections", "administra clientes, cargos pendientes y pagos.", ["Ve a Operaciones > Cobranza.", "Busca o crea el cliente.", "Registra un cargo o pago desde su estado de cuenta.", "Revisa el saldo actualizado."], [{ label: "Abrir Cobranza", to: "/app/collections" }]),
  module("purchases", "Compras", "/app/purchases", "registra compras y recepciones de mercancía.", ["Ve a Abastecimiento > Compras.", "Selecciona Nueva compra.", "Elige proveedor, ubicación y productos.", "Revisa cantidades y costos.", "Guarda o recibe la compra según el flujo mostrado."], [{ label: "Ver compras", to: "/app/purchases" }, { label: "Nueva compra", to: "/app/purchases/new" }]),
  module("returns", "Devoluciones", "/app/returns", "documenta devoluciones de clientes o hacia proveedores según el flujo disponible.", ["Ve a Abastecimiento > Devoluciones.", "Selecciona Nueva devolución.", "Elige la referencia y los productos.", "Revisa cantidades, motivo y ubicación.", "Confirma después de validar el impacto."], [{ label: "Ver devoluciones", to: "/app/returns" }]),
  module("entries", "Entradas de inventario", "/app/transactions/entries/new", "incrementa existencias con trazabilidad.", ["Ve a Operar inventario > Nueva entrada.", "Selecciona producto y ubicación.", "Indica cantidad, costo si corresponde y motivo.", "Revisa y confirma."], [{ label: "Crear entrada", to: "/app/transactions/entries/new" }, { label: "Ver transacciones", to: "/app/transactions" }]),
  module("exits", "Salidas de inventario", "/app/transactions/exits/new", "registra salidas distintas de una venta.", ["Ve a Operar inventario > Nueva salida.", "Selecciona producto y ubicación.", "Indica cantidad y motivo.", "Confirma tras comprobar que hay existencias."], [{ label: "Crear salida", to: "/app/transactions/exits/new" }]),
  module("adjustments", "Ajustes", "/app/transactions/adjustments/new", "corrige una diferencia física con un movimiento auditado.", ["Ve a Operar inventario > Nuevo ajuste.", "Selecciona producto y ubicación.", "Indica la diferencia y explica el motivo.", "Revisa el impacto y confirma."], [{ label: "Crear ajuste", to: "/app/transactions/adjustments/new" }], [], "Usa ajustes solo para diferencias reales; no para registrar operaciones normales."),
  module("transfers", "Transferencias", "/app/transfers", "mueve inventario entre ubicaciones sin cambiar el total del negocio.", ["Ve a Operar inventario > Transferir inventario.", "Selecciona origen, destino y producto.", "Indica la cantidad.", "Revisa el recorrido y confirma."], [{ label: "Ver transferencias", to: "/app/transfers" }]),
  module("recipes", "Producción y recetas", "/app/recipes", "define recetas y registra la transformación de insumos en productos.", ["Ve a Operar inventario > Producción.", "Crea o abre una receta.", "Define el producto resultante y sus insumos.", "Registra la producción cuando corresponda."], [{ label: "Abrir producción", to: "/app/recipes" }]),
  module("transactions", "Transacciones", "/app/transactions", "consulta el historial auditado de entradas, salidas, ajustes y transferencias.", ["Ve a Historial > Transacciones.", "Filtra por fecha, ubicación o tipo.", "Abre el registro para revisar su referencia."], [{ label: "Ver transacciones", to: "/app/transactions" }]),
  module("reports", "Reportes", "/app/reports", "analiza existencias y movimientos con filtros por periodo y ubicación.", ["Ve a Análisis > Reportes.", "Elige el reporte que necesitas.", "Aplica fecha, ubicación o filtros disponibles.", "Consulta o exporta solo si tienes permiso."], [{ label: "Consultar reportes", to: "/app/reports" }, { label: "Reporte de inventario", to: "/app/reports/inventory" }], ["¿Cómo filtro por sucursal?", "¿Qué reporte necesito?"]),
  module("costs", "Costos", "/app/costs", "consulta costos usados para analizar márgenes y valuación.", ["Ve a Análisis > Costos.", "Selecciona el periodo o producto disponible.", "Revisa el costo y su método de valuación."], [{ label: "Ver costos", to: "/app/costs" }]),
  module("breakEven", "Punto de equilibrio", "/app/break-even", "estima las ventas necesarias para cubrir costos fijos y variables.", ["Ve a Análisis > Punto de equilibrio.", "Revisa costos fijos, ventas y margen de contribución.", "Ajusta los datos permitidos en su módulo de origen.", "Interpreta el resultado como una meta de ventas."], [{ label: "Ver punto de equilibrio", to: "/app/break-even" }], ["¿Cómo se calcula?", "¿Qué significa margen de contribución?"]),
  module("alerts", "Alertas", "/app/alerts", "muestra productos que requieren atención, como existencias bajas.", ["Ve a Análisis > Alertas.", "Revisa el producto, ubicación y umbral.", "Abre el producto o crea una entrada si corresponde."], [{ label: "Ver alertas", to: "/app/alerts" }]),
  module("settings", "Configuración", "/app/settings", "administra las preferencias del negocio, incluido el método de valuación.", ["Ve a Administración > Configuración.", "Revisa la sección que necesitas.", "Guarda únicamente los cambios autorizados."], [{ label: "Abrir configuración", to: "/app/settings" }]),
  module("members", "Equipo y roles", "/app/members", "administra miembros y los roles owner, manager y viewer.", ["Ve a Administración > Equipo.", "Invita o selecciona un miembro.", "Asigna el rol adecuado y confirma."], [{ label: "Ver equipo", to: "/app/members" }], [], "Owner administra el negocio y el equipo; manager opera módulos autorizados; viewer solo consulta."),
  module("fifo", "PEPS/FIFO", "/app/products", "valúa salidas consumiendo primero las capas de inventario más antiguas.", ["Abre un producto para consultar sus capas FIFO.", "Registra entradas con costo para crear capas.", "Al registrar una salida, el sistema consume las capas más antiguas disponibles."], [{ label: "Ver productos", to: "/app/products" }, { label: "Crear entrada", to: "/app/transactions/entries/new" }], ["¿Qué es FIFO?", "¿Cómo funcionan las capas FIFO?"], "FIFO no permite inventario negativo y la configuración del método se gestiona desde Configuración.")
];

const normalized = (value = "") => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const byKey = new Map(assistantKnowledge.map((entry) => [entry.key, entry]));
const routeOrder = [...assistantKnowledge].sort((a, b) => b.path.length - a.path.length);

export function getAssistantModule(pathname) {
  const path = typeof pathname === "string" && pathname.startsWith("/app") ? pathname : "/app";
  return routeOrder.find((entry) => entry.path === "/app" ? path === "/app" : path.startsWith(entry.path)) ?? byKey.get("dashboard");
}

export function findAssistantModule(message, pathname) {
  const text = normalized(message);
  const aliases = [
    ["fifo", /fifo|peps|capas/], ["pos", /punto de venta|\bpos\b|registr.*venta|finaliz.*venta/], ["cash", /caja|efectivo|corte/], ["breakEven", /punto de equilibrio|margen de contribucion/], ["collections", /cobranza|cliente|cargo|pago/], ["purchases", /compra/], ["returns", /devolucion/], ["entries", /entrada.*inventario|inventario inicial/], ["exits", /salida.*inventario/], ["adjustments", /ajuste/], ["transfers", /transfer/], ["recipes", /produccion|receta/], ["reports", /reporte|informe|sucursal/], ["products", /producto|sku|stock/], ["categories", /categoria/], ["locations", /ubicacion|almacen|sucursal/], ["suppliers", /proveedor/], ["sales", /venta/], ["alerts", /alerta/], ["settings", /configuracion/], ["members", /equipo|roles?/], ["transactions", /transaccion|movimiento/]
  ];
  const matched = aliases.find(([, pattern]) => pattern.test(text));
  return matched ? byKey.get(matched[0]) : getAssistantModule(pathname);
}

export function localGuidance(message, { pathname, role } = {}) {
  const text = normalized(message);
  const current = getAssistantModule(pathname);
  const entry = findAssistantModule(message, pathname);
  const outOfScope = !/(puedes hacer|ayuda|funciona|registr|agreg|crear|ver|consult|cerr|finaliz|fifo|peps|stock|inventario|venta|caja|reporte|producto|movimiento|entrada|salida|ajuste|transfer|compra|devolucion|cobranza|costo|margen|equilibrio|alerta|configuracion|rol|equipo)/.test(text);
  if (outOfScope) return { message: "Puedo ayudarte a usar Inventario: productos, ventas, caja, reportes, FIFO y operaciones. ¿Sobre qué módulo necesitas ayuda?", links: [] };
  const askingHow = /como|paso|funciona|registr|agreg|crear|cerr|finaliz|donde|que es|que significa/.test(text);
  const intro = entry.key === current.key ? `Estás en ${entry.name}. ${entry.purpose}` : `${entry.name}: ${entry.purpose}`;
  const roleNote = role === "viewer" ? "\n\nCon tu rol viewer puedes consultar; una persona owner o manager debe realizar los cambios." : "";
  if (entry.key === "cash" && /cerr|cier/.test(text)) {
    const closeSteps = ["En Caja, revisa el Efectivo esperado.", "Cuenta el efectivo disponible físicamente.", "Escribe el importe contado en la sección Cerrar caja.", "Revisa la diferencia mostrada.", "Presiona Cerrar caja y confirma la operación."];
    return { message: `${intro}\n\n${closeSteps.map((step, index) => `${index + 1}. ${step}`).join("\n")}\n\n${entry.warning}${roleNote}`, links: entry.links };
  }
  if (askingHow) return { message: `${intro}\n\n${entry.steps.map((step, index) => `${index + 1}. ${step}`).join("\n")}\n\n${entry.warning}${roleNote}`, links: entry.links };
  return { message: `${intro}\n\nAcciones principales:\n${entry.steps.slice(0, 3).map((step, index) => `${index + 1}. ${step}`).join("\n")}\n\n${entry.allowedRoles}${roleNote}`, links: entry.links };
}

import pool from "../db/pool.js";

const allowedPriorities = new Set(["urgent", "high", "medium", "normal"]);

function normalize(value, max) {
  return String(value ?? "").trim().slice(0, max);
}

export async function createNotification({ client = pool, businessId, userId, type, title, message, priority = "normal", link = null, eventKey = null }) {
  if (!businessId || !userId || !type || !title || !message) throw new Error("Los datos de notificación están incompletos.");
  if (!allowedPriorities.has(priority)) throw new Error("La prioridad de la notificación no es válida.");
  const result = await client.query(
    `INSERT INTO notifications (business_id,user_id,type,title,message,priority,link,event_key)
     SELECT $1,$2,$3,$4,$5,$6,$7,$8
     WHERE EXISTS (SELECT 1 FROM business_members WHERE business_id=$1 AND user_id=$2 AND status='active')
     ON CONFLICT (business_id,user_id,event_key) WHERE event_key IS NOT NULL DO NOTHING
     RETURNING *`,
    [businessId, userId, normalize(type, 40), normalize(title, 160), normalize(message, 1000), priority, link ? normalize(link, 255) : null, eventKey ? normalize(eventKey, 180) : null]
  );
  return result.rows[0] ?? null;
}
// createNotification: Inserta la alerta en la tabla notifications. Cuenta con dos características clave:Filtro de membresía (WHERE EXISTS): Solo inserta la notificación si el usuario de destino pertenece al negocio y su estado es 'active'.Anti-Duplicidad (ON CONFLICT ... DO NOTHING): Utiliza una clave única (eventKey). Si el sistema intenta enviar exactamente la misma alerta en el mismo día por el mismo evento, la base de datos la ignora para no saturar al usuario con spam de alertas repetidas.
export async function notifyBusinessUsers({ client = pool, businessId, type, title, message, priority = "normal", link = null, eventKey }) {
  const users = await client.query("SELECT user_id FROM business_members WHERE business_id=$1 AND status='active'", [businessId]);
  const notifications = [];
  for (const user of users.rows) {
    const notification = await createNotification({ client, businessId, userId: user.user_id, type, title, message, priority, link, eventKey });
    if (notification) notifications.push(notification);
  }
  return notifications;
}
// notifyBusinessUsers: Recorre a todos los empleados activos de la empresa y les genera una copia de la notificación de manera masiva.

export async function notifyStockState({ client = pool, businessId, itemId, locationId, stock }) {
  return syncStockAlertNotifications({ client, businessId });
}

//

export async function syncStockAlertNotifications({ client = pool, businessId }) {
  const alerts = await client.query(
    `SELECT i.id AS product_id, i.name AS product_name, i.sku,
            l.id AS location_id, l.name AS location_name,
            COALESCE(b.stock,0)::INTEGER AS stock,
            t.minimum_stock, t.maximum_stock
     FROM inventory_stock_thresholds t
     INNER JOIN items i ON (i.business_id,i.id)=(t.business_id,t.item_id)
     INNER JOIN business_locations l ON (l.business_id,l.id)=(t.business_id,t.location_id)
     LEFT JOIN inventory_balances b ON (b.business_id,b.item_id,b.location_id)=(t.business_id,t.item_id,t.location_id)
     WHERE t.business_id=$1 AND t.alert_enabled=true AND i.status='active' AND l.status='active'
       AND (COALESCE(b.stock,0)=0 OR COALESCE(b.stock,0)<=t.minimum_stock
            OR (t.maximum_stock IS NOT NULL AND COALESCE(b.stock,0)>t.maximum_stock))`,
    [businessId]
  );
  const keys = [];
  for (const alert of alerts.rows) {
    const stock = Number(alert.stock); const minimum = Number(alert.minimum_stock); const maximum = alert.maximum_stock == null ? null : Number(alert.maximum_stock);
    const alertType = stock === 0 ? "out_of_stock" : maximum !== null && stock > maximum ? "overstock" : "low_stock";
    const title = alertType === "out_of_stock" ? "Producto agotado" : alertType === "overstock" ? "Stock excedente" : "Stock bajo";
    const detail = alertType === "out_of_stock" ? "Agotado" : alertType === "overstock" ? `Excedente: ${stock - maximum} unidades` : `Faltan ${Math.max(0, minimum - stock)} unidades para alcanzar el mínimo`;
    const eventKey = `stock:${businessId}:${alert.product_id}:${alert.location_id}:${alertType}:${stock}:${minimum}:${maximum ?? "null"}`;
    keys.push(eventKey);
    await notifyBusinessUsers({ client, businessId, type: "stock_alert", title, message: `Producto: ${alert.product_name} · SKU: ${alert.sku || "—"} · Ubicación: ${alert.location_name} · Stock actual: ${stock} · Mínimo: ${minimum} · Máximo: ${maximum ?? "—"} · ${detail}.`, priority: alertType === "out_of_stock" ? "urgent" : alertType === "overstock" ? "medium" : "high", link: `/app/alerts`, eventKey });
  }
  if (keys.length) await client.query("UPDATE notifications SET is_read=true,read_at=COALESCE(read_at,CURRENT_TIMESTAMP) WHERE business_id=$1 AND type='stock_alert' AND is_read=false AND NOT (event_key = ANY($2::TEXT[]))", [businessId, keys]);
  else await client.query("UPDATE notifications SET is_read=true,read_at=COALESCE(read_at,CURRENT_TIMESTAMP) WHERE business_id=$1 AND type='stock_alert' AND is_read=false", [businessId]);
}

//Este bloque cruza datos de tres tablas (inventory_stock_thresholds, items, inventory_balances) y genera alertas según tres situaciones:out_of_stock (Urgente): El producto tiene existencias en 0.low_stock (Alta): Las existencias son menores o iguales al mínimo configurado para esa sucursal.overstock (Media): Las existencias superan el límite máximo permitido.Autolimpieza de alertas: El código genera un eventKey dinámico con el stock exacto. Si el stock cambia o el problema se resuelve, el código ejecuta un UPDATE automático al final para marcar las alertas viejas de esa sucursal como leídas (is_read=true).

export async function syncCollectionNotifications({ client = pool, businessId }) {
  const charges = await client.query(
    `SELECT ch.id, ch.customer_id, c.name AS customer_name, ch.concept, ch.amount, ch.due_date,
            COALESCE(SUM(p.amount) FILTER (WHERE p.status='active'),0) AS paid
     FROM customer_charges ch
     INNER JOIN customers c ON (c.business_id,c.id)=(ch.business_id,ch.customer_id)
     LEFT JOIN customer_payments p ON (p.business_id,p.charge_id)=(ch.business_id,ch.id)
     WHERE ch.business_id=$1 AND ch.frequency='monthly' AND ch.status <> 'cancelled'
     GROUP BY ch.id,c.name HAVING ch.amount > COALESCE(SUM(p.amount) FILTER (WHERE p.status='active'),0)
        AND ch.due_date <= CURRENT_DATE + 7`,
    [businessId]
  );
  for (const charge of charges.rows) {
    const days = Math.ceil((new Date(`${charge.due_date}T00:00:00Z`).getTime() - Date.now()) / 86400000);
    const overdue = days < 0;
    await notifyBusinessUsers({ client, businessId, type: overdue ? "collection_overdue" : "collection_due", title: overdue ? "Pago mensual vencido" : "Pago mensual próximo a vencer", message: `${charge.customer_name}: ${charge.concept}. Saldo pendiente $${(Number(charge.amount) - Number(charge.paid)).toFixed(2)}.`, priority: overdue ? "urgent" : "high", link: `/app/collections/customers/${charge.customer_id}`, eventKey: `collection:${charge.id}:${overdue ? "overdue" : `due-${days}`}:${new Date().toISOString().slice(0, 10)}` });
  }
}
// Monitorea los cobros recurrentes de tus clientes (customer_charges) y calcula los días restantes para el vencimiento de facturas mensuales:Busca cuentas donde el monto cobrado sea mayor a lo pagado y falten 7 días o menos para la fecha límite (due_date <= CURRENT_DATE + 7).Si ya expiró (Días < 0): Envía una notificación urgente titulada "Pago mensual vencido".Si está por vencer (0 a 7 días): Envía una notificación de prioridad alta titulada "Pago mensual próximo a vencer", calculando el saldo restante pendiente.

export const notificationService = { create: createNotification, notifyBusinessUsers, notifyStockState, syncStockAlertNotifications, syncCollectionNotifications };

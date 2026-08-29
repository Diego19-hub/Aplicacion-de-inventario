import { listNotifications, markAllNotificationsRead, markNotificationRead, unreadNotificationCount } from "../db/notificationQueries.js";
import { notificationService } from "../services/notificationService.js";

const types = new Set(["stock_alert", "collection_overdue", "collection_due", "purchase_received", "return_registered", "inventory_damage", "team_invitation", "permission_change"]);
const priorities = new Set(["urgent", "high", "medium", "normal"]);

function id(value) { return /^[1-9]\d*$/.test(String(value)) ? Number(value) : null; }

export async function notificationsSummary(req, res, next) {
  try {
    await notificationService.syncCollectionNotifications({ businessId: req.business.id });
    await notificationService.syncStockAlertNotifications({ businessId: req.business.id });
    const count = await unreadNotificationCount(req.business.id, req.session.user.id);
    const result = await listNotifications({ businessId: req.business.id, userId: req.session.user.id, page: 1, limit: 8, status: "unread" });
    return res.json({ data: { unreadCount: count, notifications: result.rows } });
  } catch (error) { return next(error); }
}

export async function listNotificationsController(req, res, next) {
  try {
    await notificationService.syncStockAlertNotifications({ businessId: req.business.id });
    const page = Math.max(1, Number(req.query.page) || 1);
    const type = types.has(req.query.type) ? req.query.type : "";
    const priority = priorities.has(req.query.priority) ? req.query.priority : "";
    const status = ["read", "unread"].includes(req.query.status) ? req.query.status : "";
    const result = await listNotifications({ businessId: req.business.id, userId: req.session.user.id, type, priority, status, page, limit: 20 });
    return res.json({ data: { notifications: result.rows, filters: { type, priority, status }, pagination: { page, pageSize: 20, totalItems: result.total, totalPages: Math.max(1, Math.ceil(result.total / 20)) } } });
  } catch (error) { return next(error); }
}

export async function markNotificationReadController(req, res, next) {
  const notificationId = id(req.params.notificationId);
  if (!notificationId) return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "La notificación no es válida." } });
  try {
    const notification = await markNotificationRead({ businessId: req.business.id, userId: req.session.user.id, notificationId });
    if (!notification) return res.status(404).json({ error: { code: "NOTIFICATION_NOT_FOUND", message: "No se encontró la notificación." } });
    return res.json({ data: { notification } });
  } catch (error) { return next(error); }
}

export async function markAllNotificationsReadController(req, res, next) {
  try { return res.json({ data: { updated: await markAllNotificationsRead(req.business.id, req.session.user.id) } }); } catch (error) { return next(error); }
}

import { listAuditLog } from "../db/auditQueries.js";

const modules = ["sales", "purchases", "inventory", "transfers", "returns", "collections", "recipes", "alerts", "products", "members", "costs", "cash"];
const actions = ["create", "edit", "cancel", "delete", "receive", "register_payment", "change_status", "change_permissions"];

export async function getAuditLog(req, res, next) {
  try {
    const page = Number.isInteger(Number(req.query.page)) && Number(req.query.page) > 0 ? Number(req.query.page) : 1;
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const module = modules.includes(req.query.module) ? req.query.module : "";
    const action = actions.includes(req.query.action) ? req.query.action : "";
    const userId = /^\d+$/.test(String(req.query.userId || "")) ? req.query.userId : "";
    const reference = typeof req.query.reference === "string" ? req.query.reference.trim().slice(0, 160) : "";
    const dateFrom = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.dateFrom || "")) ? req.query.dateFrom : "";
    const dateTo = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.dateTo || "")) ? req.query.dateTo : "";
    const result = await listAuditLog({ businessId: req.business.id, page, limit, module, userId, action, reference, dateFrom, dateTo });
    return res.json({ data: { auditLog: result.rows, pagination: { page, limit, totalItems: result.count, totalPages: Math.ceil(result.count / limit) }, filters: { module, userId, action, reference, dateFrom, dateTo }, options: { modules, actions } } });
  } catch (error) { return next(error); }
}

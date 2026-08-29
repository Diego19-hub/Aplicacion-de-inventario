import pool from "./pool.js";

export async function listAuditLog({ businessId, page = 1, limit = 25, module = "", userId = "", action = "", reference = "", dateFrom = "", dateTo = "" }) {
  const values = [businessId];
  const where = ["a.business_id = $1"];
  const add = (value, clause) => { values.push(value); where.push(clause.replace("$N", `$${values.length}`)); };
  if (module) add(module, "a.module = $N");
  if (userId) add(Number(userId), "a.user_id = $N");
  if (action) add(action, "a.action = $N");
  if (reference) add(`%${reference}%`, "COALESCE(a.reference, '') ILIKE $N");
  if (dateFrom) add(dateFrom, "a.occurred_at >= $N::date");
  if (dateTo) add(dateTo, "a.occurred_at < ($N::date + INTERVAL '1 day')");
  const predicate = where.join(" AND ");
  const count = await pool.query(`SELECT COUNT(*)::INTEGER AS count FROM audit_log a WHERE ${predicate}`, values);
  const offset = (page - 1) * limit;
  const rows = await pool.query(`SELECT a.id,a.business_id,a.user_id,a.module,a.action,a.reference,a.occurred_at,a.description,a.previous_values,a.new_values,a.ip_address,u.username FROM audit_log a LEFT JOIN users u ON u.id=a.user_id WHERE ${predicate} ORDER BY a.occurred_at DESC,a.id DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, [...values, limit, offset]);
  return { rows: rows.rows, count: Number(count.rows[0].count) };
}

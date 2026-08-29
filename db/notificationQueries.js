import pool from "./pool.js";

function where({ businessId, userId, type, priority, status }) {
  const values = [businessId, userId];
  const clauses = ["n.business_id=$1", "n.user_id=$2"];
  if (type) { values.push(type); clauses.push(`n.type=$${values.length}`); }
  if (priority) { values.push(priority); clauses.push(`n.priority=$${values.length}`); }
  if (status === "unread") clauses.push("n.is_read=false");
  if (status === "read") clauses.push("n.is_read=true");
  return { values, clauses: clauses.join(" AND ") };
}

export async function listNotifications({ businessId, userId, type = "", priority = "", status = "", page = 1, limit = 20 }) {
  const filter = where({ businessId, userId, type, priority, status });
  const count = await pool.query(`SELECT COUNT(*)::INTEGER AS total FROM notifications n WHERE ${filter.clauses}`, filter.values);
  const values = [...filter.values, limit, (page - 1) * limit];
  const rows = await pool.query(`SELECT n.* FROM notifications n WHERE ${filter.clauses} ORDER BY n.created_at DESC,n.id DESC LIMIT $${values.length - 1} OFFSET $${values.length}`, values);
  return { rows: rows.rows, total: Number(count.rows[0]?.total ?? 0) };
}

export async function unreadNotificationCount(businessId, userId) {
  const result = await pool.query("SELECT COUNT(*)::INTEGER AS count FROM notifications WHERE business_id=$1 AND user_id=$2 AND is_read=false", [businessId, userId]);
  return Number(result.rows[0]?.count ?? 0);
}

export async function markNotificationRead({ businessId, userId, notificationId }) {
  const result = await pool.query("UPDATE notifications SET is_read=true,read_at=COALESCE(read_at,CURRENT_TIMESTAMP) WHERE business_id=$1 AND user_id=$2 AND id=$3 RETURNING *", [businessId, userId, notificationId]);
  return result.rows[0] ?? null;
}

export async function markAllNotificationsRead(businessId, userId) {
  const result = await pool.query("UPDATE notifications SET is_read=true,read_at=COALESCE(read_at,CURRENT_TIMESTAMP) WHERE business_id=$1 AND user_id=$2 AND is_read=false", [businessId, userId]);
  return result.rowCount;
}

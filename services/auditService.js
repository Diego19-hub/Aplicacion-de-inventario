import pool from "../db/pool.js";

const forbiddenKey = /(password|token|cookie|secret|authorization|csrf|session)/i;

function sanitize(value, depth = 0) {
  if (depth > 5 || value === null || value === undefined) return value ?? null;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitize(item, depth + 1));
  if (typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !forbiddenKey.test(key)).slice(0, 100).map(([key, item]) => [key, sanitize(item, depth + 1)]));
}

export async function recordAudit({ client = pool, businessId, userId = null, module, action, reference = null, description, previousValues = null, newValues = null, ipAddress = null }) {
  if (!businessId || !module || !action || !description) throw new Error("Los datos de auditoría están incompletos.");
  const result = await client.query(
    `INSERT INTO audit_log (business_id,user_id,module,action,reference,description,previous_values,new_values,ip_address)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::inet) RETURNING *`,
    [businessId, userId, module, action, reference, description, JSON.stringify(sanitize(previousValues)), JSON.stringify(sanitize(newValues)), ipAddress || null]
  );
  return result.rows[0];
}

export const auditService = { record: recordAudit };

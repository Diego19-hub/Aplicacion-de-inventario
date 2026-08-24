import pool from "./pool.js";

export class CashDomainError extends Error {
  constructor(code, message, statusCode = 400, fields = []) {
    super(message);
    this.name = "CashDomainError";
    this.code = code;
    this.statusCode = statusCode;
    this.fields = fields;
  }
}

function serializeRegister(row) {
  return {
    id: Number(row.id),
    name: row.name,
    status: row.status,
    location: {
      id: Number(row.location_id),
      name: row.location_name,
      code: row.location_code
    },
    openSession: row.session_id === null ? null : {
      id: Number(row.session_id),
      status: "open",
      openedAt: row.session_opened_at,
      openedBy: {
        id: Number(row.opened_by_id),
        username: row.opened_by_username
      },
      openingAmount: Number(row.session_opening_amount)
    }
  };
}

function serializeSession(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    status: row.status,
    register: {
      id: Number(row.register_id),
      name: row.register_name
    },
    location: {
      id: Number(row.location_id),
      name: row.location_name,
      code: row.location_code
    },
    openedBy: {
      id: Number(row.opened_by_id),
      username: row.opened_by_username
    },
    openingAmount: Number(row.opening_amount),
    openedAt: row.opened_at,
    totalCashIn: Number(row.total_cash_in),
    totalCashOut: Number(row.total_cash_out),
    cashSales: Number(row.cash_sales),
    expectedAmount: Number(row.expected_amount)
  };
}

export async function getCashRegisters(businessId) {
  const result = await pool.query(
    `SELECT
       r.id,
       r.name,
       r.status,
       l.id AS location_id,
       l.name AS location_name,
       l.code AS location_code,
       s.id AS session_id,
       s.opened_at AS session_opened_at,
       s.opening_amount AS session_opening_amount,
       s.opened_by AS opened_by_id,
       u.username AS opened_by_username
     FROM cash_registers r
     INNER JOIN business_locations l
       ON (l.business_id, l.id) = (r.business_id, r.location_id)
     LEFT JOIN cash_sessions s
       ON (s.business_id, s.register_id) = (r.business_id, r.id)
      AND s.status = 'open'
     LEFT JOIN users u ON u.id = s.opened_by
     WHERE r.business_id = $1
     ORDER BY LOWER(r.name), r.id`,
    [businessId]
  );
  return result.rows.map(serializeRegister);
}

async function getLocation(client, businessId, locationId) {
  const result = await client.query(
    `SELECT id, name, code, status
     FROM business_locations
     WHERE business_id = $1 AND id = $2
     FOR UPDATE`,
    [businessId, locationId]
  );
  return result.rows[0] ?? null;
}

export async function createCashRegister({ businessId, locationId, name }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const location = await getLocation(client, businessId, locationId);
    if (!location) {
      throw new CashDomainError("CASH_REGISTER_NOT_FOUND", "La ubicación no existe en el negocio activo.", 404, [{ field: "locationId", message: "La ubicación no existe en el negocio activo." }]);
    }
    if (location.status !== "active") {
      throw new CashDomainError("CASH_REGISTER_INACTIVE", "La ubicación seleccionada está inactiva.", 409, [{ field: "locationId", message: "La ubicación seleccionada está inactiva." }]);
    }

    const duplicate = await client.query(
      `SELECT id
       FROM cash_registers
       WHERE business_id = $1 AND location_id = $2 AND LOWER(name) = LOWER($3)
       LIMIT 1`,
      [businessId, locationId, name]
    );
    if (duplicate.rows[0]) {
      throw new CashDomainError("CASH_REGISTER_DUPLICATE", "Ya existe una caja con ese nombre en la ubicación.", 409, [{ field: "name", message: "Ya existe una caja con ese nombre en la ubicación." }]);
    }

    const result = await client.query(
      `INSERT INTO cash_registers (business_id, location_id, name)
       VALUES ($1, $2, $3)
       RETURNING id, name, status, location_id`,
      [businessId, locationId, name]
    );
    await client.query("COMMIT");
    return { ...result.rows[0], location };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (error.code === "23505") {
      throw new CashDomainError("CASH_REGISTER_DUPLICATE", "Ya existe una caja con ese nombre en la ubicación.", 409);
    }
    throw error;
  } finally {
    client.release();
  }
}

async function getOpenSessionForUpdate(client, businessId, sessionId) {
  const result = await client.query(
    `SELECT s.*, r.name AS register_name, l.id AS location_id, l.name AS location_name, l.code AS location_code
     FROM cash_sessions s
     INNER JOIN cash_registers r ON (r.business_id, r.id) = (s.business_id, s.register_id)
     INNER JOIN business_locations l ON (l.business_id, l.id) = (s.business_id, r.location_id)
     WHERE s.business_id = $1 AND s.id = $2
     FOR UPDATE`,
    [businessId, sessionId]
  );
  return result.rows[0] ?? null;
}

async function getSessionTotals(client, businessId, sessionId) {
  const result = await client.query(
    `SELECT
       s.id,
       s.status,
       s.register_id,
       r.name AS register_name,
       r.location_id,
       l.name AS location_name,
       l.code AS location_code,
       s.opened_by AS opened_by_id,
       opened_user.username AS opened_by_username,
       s.opening_amount,
       s.opened_at,
       COALESCE(SUM(cm.amount) FILTER (WHERE cm.movement_type = 'cash_in'), 0) AS total_cash_in,
       COALESCE(SUM(cm.amount) FILTER (WHERE cm.movement_type = 'cash_out'), 0) AS total_cash_out,
       COALESCE((
         SELECT SUM(sale.total)
         FROM sales sale
         WHERE sale.business_id = s.business_id
           AND sale.cash_session_id = s.id
           AND sale.payment_method = 'cash'
           AND sale.status = 'completed'
       ), 0) AS cash_sales,
       s.expected_amount
     FROM cash_sessions s
     INNER JOIN cash_registers r ON (r.business_id, r.id) = (s.business_id, s.register_id)
     INNER JOIN business_locations l ON (l.business_id, l.id) = (s.business_id, r.location_id)
     INNER JOIN users opened_user ON opened_user.id = s.opened_by
     LEFT JOIN cash_movements cm ON (cm.business_id, cm.session_id) = (s.business_id, s.id)
     WHERE s.business_id = $1 AND s.id = $2
     GROUP BY s.id, s.status, s.register_id, r.name, r.location_id, l.name, l.code,
              s.opened_by, opened_user.username, s.opening_amount, s.opened_at, s.expected_amount`,
    [businessId, sessionId]
  );
  return result.rows[0] ?? null;
}

async function calculateExpectedAmount(client, businessId, sessionId) {
  const result = await client.query(
     `SELECT
       s.opening_amount
       + COALESCE(SUM(cm.amount) FILTER (WHERE cm.movement_type = 'cash_in'), 0)
       - COALESCE(SUM(cm.amount) FILTER (WHERE cm.movement_type = 'cash_out'), 0)
       + COALESCE((
           SELECT SUM(sale.total)
           FROM sales sale
           WHERE sale.business_id = s.business_id
             AND sale.cash_session_id = s.id
             AND sale.payment_method = 'cash'
             AND sale.status = 'completed'
         ), 0) AS expected_amount
     FROM cash_sessions s
     LEFT JOIN cash_movements cm
       ON (cm.business_id, cm.session_id) = (s.business_id, s.id)
     WHERE s.business_id = $1 AND s.id = $2
     GROUP BY s.id, s.opening_amount`,
    [businessId, sessionId]
  );
  return Number(result.rows[0]?.expected_amount ?? 0);
}

export async function getCurrentCashSession(businessId) {
  const result = await pool.query(
    `SELECT s.id
     FROM cash_sessions s
     WHERE s.business_id = $1 AND s.status = 'open'
     ORDER BY s.opened_at DESC, s.id DESC
     LIMIT 1`,
    [businessId]
  );
  if (!result.rows[0]) return null;

  const client = await pool.connect();
  try {
    const session = await getSessionTotals(client, businessId, result.rows[0].id);
    if (!session) return null;
    session.expected_amount = await calculateExpectedAmount(client, businessId, result.rows[0].id);
    return serializeSession(session);
  } finally {
    client.release();
  }
}

function buildCashSessionHistoryWhere({ businessId, registerId = null, status = null, dateFrom = null, dateTo = null }) {
  const values = [businessId];
  const where = ["s.business_id = $1"];
  if (registerId !== null) { values.push(registerId); where.push(`s.register_id = $${values.length}`); }
  if (status !== null) { values.push(status); where.push(`s.status = $${values.length}`); }
  if (dateFrom !== null) { values.push(dateFrom); where.push(`s.opened_at >= $${values.length}::date`); }
  if (dateTo !== null) { values.push(dateTo); where.push(`s.opened_at < ($${values.length}::date + INTERVAL '1 day')`); }
  return { values, where: where.join(" AND ") };
}

export async function countCashSessions(filters) {
  const { values, where } = buildCashSessionHistoryWhere(filters);
  const result = await pool.query(`SELECT COUNT(*)::INTEGER AS total FROM cash_sessions s WHERE ${where}`, values);
  return Number(result.rows[0]?.total ?? 0);
}

export async function getCashSessions({ businessId, registerId = null, status = null, dateFrom = null, dateTo = null, limit, offset }) {
  const { values, where } = buildCashSessionHistoryWhere({ businessId, registerId, status, dateFrom, dateTo });
  values.push(limit, offset);
  const result = await pool.query(
    `SELECT
       s.id, s.status, s.register_id, r.name AS register_name,
       r.location_id, l.name AS location_name, l.code AS location_code,
       s.opened_by AS opened_by_id, opened_user.username AS opened_by_username,
       s.closed_by AS closed_by_id, closed_user.username AS closed_by_username,
       s.opening_amount, s.opened_at, s.closing_amount, s.closed_at, s.difference_amount,
       COALESCE((SELECT SUM(cm.amount) FROM cash_movements cm WHERE cm.business_id = s.business_id AND cm.session_id = s.id AND cm.movement_type = 'cash_in'), 0) AS total_cash_in,
       COALESCE((SELECT SUM(cm.amount) FROM cash_movements cm WHERE cm.business_id = s.business_id AND cm.session_id = s.id AND cm.movement_type = 'cash_out'), 0) AS total_cash_out,
       COALESCE((SELECT SUM(sale.total) FROM sales sale WHERE sale.business_id = s.business_id AND sale.cash_session_id = s.id AND sale.payment_method = 'cash' AND sale.status = 'completed'), 0) AS cash_sales,
       s.opening_amount
       + COALESCE((SELECT SUM(cm.amount) FROM cash_movements cm WHERE cm.business_id = s.business_id AND cm.session_id = s.id AND cm.movement_type = 'cash_in'), 0)
       - COALESCE((SELECT SUM(cm.amount) FROM cash_movements cm WHERE cm.business_id = s.business_id AND cm.session_id = s.id AND cm.movement_type = 'cash_out'), 0)
       + COALESCE((SELECT SUM(sale.total) FROM sales sale WHERE sale.business_id = s.business_id AND sale.cash_session_id = s.id AND sale.payment_method = 'cash' AND sale.status = 'completed'), 0) AS expected_amount
     FROM cash_sessions s
     INNER JOIN cash_registers r ON (r.business_id, r.id) = (s.business_id, s.register_id)
     INNER JOIN business_locations l ON (l.business_id, l.id) = (r.business_id, r.location_id)
     INNER JOIN users opened_user ON opened_user.id = s.opened_by
     LEFT JOIN users closed_user ON closed_user.id = s.closed_by
     WHERE ${where}
     ORDER BY s.opened_at DESC, s.id DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );
  return result.rows;
}

export async function getCashSessionMovements({ businessId, sessionId }) {
  const sessionResult = await pool.query(
    `SELECT id, status FROM cash_sessions WHERE business_id = $1 AND id = $2`,
    [businessId, sessionId]
  );
  if (!sessionResult.rows[0]) return null;
  const result = await pool.query(
    `SELECT cm.id, cm.movement_type, cm.amount, cm.reason, cm.created_at, cm.created_by, u.username
     FROM cash_movements cm
     INNER JOIN users u ON u.id = cm.created_by
     WHERE cm.business_id = $1 AND cm.session_id = $2
     ORDER BY cm.created_at ASC, cm.id ASC`,
    [businessId, sessionId]
  );
  return { session: sessionResult.rows[0], movements: result.rows };
}

export async function openCashSession({ businessId, registerId, userId, openingAmount }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const registerResult = await client.query(
      `SELECT r.id, r.name, r.status, r.location_id, l.status AS location_status
       FROM cash_registers r
       INNER JOIN business_locations l
         ON (l.business_id, l.id) = (r.business_id, r.location_id)
       WHERE r.business_id = $1 AND r.id = $2
       FOR UPDATE`,
      [businessId, registerId]
    );
    const register = registerResult.rows[0];
    if (!register) throw new CashDomainError("CASH_REGISTER_NOT_FOUND", "No se encontró la caja solicitada.", 404);
    if (register.status !== "active" || register.location_status !== "active") throw new CashDomainError("CASH_REGISTER_INACTIVE", "La caja o su ubicación están inactivas.", 409);

    const openResult = await client.query(
      `SELECT id FROM cash_sessions WHERE business_id = $1 AND register_id = $2 AND status = 'open' FOR UPDATE`,
      [businessId, registerId]
    );
    if (openResult.rows[0]) throw new CashDomainError("CASH_SESSION_ALREADY_OPEN", "La caja ya tiene una sesión abierta.", 409);

    const sessionResult = await client.query(
      `INSERT INTO cash_sessions (business_id, register_id, opened_by, opening_amount, expected_amount)
       VALUES ($1, $2, $3, $4, $4)
       RETURNING id, opened_at, opening_amount, status`,
      [businessId, registerId, userId, openingAmount]
    );
    const session = sessionResult.rows[0];
    if (openingAmount > 0) {
      await client.query(
        `INSERT INTO cash_movements (business_id, session_id, movement_type, amount, reason, created_by)
         VALUES ($1, $2, 'opening', $3, 'Fondo inicial de caja', $4)`,
        [businessId, session.id, openingAmount, userId]
      );
    }
    await client.query("COMMIT");
    return { session, register };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (error.code === "23505") throw new CashDomainError("CASH_SESSION_ALREADY_OPEN", "La caja ya tiene una sesión abierta.", 409);
    throw error;
  } finally {
    client.release();
  }
}

export async function createCashMovement({ businessId, sessionId, userId, movementType, amount, reason }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const session = await getOpenSessionForUpdate(client, businessId, sessionId);
    if (!session) throw new CashDomainError("CASH_SESSION_NOT_FOUND", "No se encontró la sesión solicitada.", 404);
    if (session.status !== "open") throw new CashDomainError("CASH_SESSION_ALREADY_CLOSED", "La sesión de Caja ya está cerrada.", 409);

    const expectedAmount = await calculateExpectedAmount(client, businessId, sessionId);
    if (movementType === "cash_out" && amount > expectedAmount) {
      throw new CashDomainError("CASH_INSUFFICIENT_FUNDS", "El retiro supera el efectivo esperado disponible.", 409);
    }

    const result = await client.query(
      `INSERT INTO cash_movements (business_id, session_id, movement_type, amount, reason, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, movement_type, amount, reason, created_at`,
      [businessId, sessionId, movementType, amount, reason, userId]
    );
    await client.query("COMMIT");
    return { movement: result.rows[0], expectedAmount };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function closeCashSession({ businessId, sessionId, userId, closingAmount }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const session = await getOpenSessionForUpdate(client, businessId, sessionId);
    if (!session) throw new CashDomainError("CASH_SESSION_NOT_FOUND", "No se encontró la sesión solicitada.", 404);
    if (session.status !== "open") throw new CashDomainError("CASH_SESSION_ALREADY_CLOSED", "La sesión de Caja ya está cerrada.", 409);

    const expectedAmount = await calculateExpectedAmount(client, businessId, sessionId);
    const differenceAmount = closingAmount - expectedAmount;
    const updateResult = await client.query(
      `UPDATE cash_sessions
       SET closing_amount = $1,
           expected_amount = $2,
           difference_amount = $3,
           closed_by = $4,
           closed_at = CURRENT_TIMESTAMP,
           status = 'closed'
       WHERE business_id = $5 AND id = $6
       RETURNING id, closing_amount, expected_amount, difference_amount, closed_at, status`,
      [closingAmount, expectedAmount, differenceAmount, userId, businessId, sessionId]
    );

    if (differenceAmount !== 0) {
      await client.query(
        `INSERT INTO cash_movements (business_id, session_id, movement_type, amount, reason, created_by)
         VALUES ($1, $2, 'closing_adjustment', $3, 'Ajuste de cierre de caja', $4)`,
        [businessId, sessionId, Math.abs(differenceAmount), userId]
      );
    }
    await client.query("COMMIT");
    return updateResult.rows[0];
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

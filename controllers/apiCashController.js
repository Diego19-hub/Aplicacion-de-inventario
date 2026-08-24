import { matchedData, validationResult } from "express-validator";

import {
  CashDomainError,
  closeCashSession,
  countCashSessions,
  createCashMovement,
  createCashRegister,
  getCashRegisters,
  getCashSessionMovements,
  getCashSessions,
  getCurrentCashSession,
  openCashSession
} from "../db/cashQueries.js";

function validationError(res, errors) {
  return res.status(400).json({
    error: {
      code: "VALIDATION_ERROR",
      message: "Revisa los campos enviados.",
      fields: errors.array().map((error) => ({ field: error.path, message: error.msg }))
    }
  });
}

function cashError(res, error) {
  return res.status(error.statusCode ?? 400).json({
    error: {
      code: error.code,
      message: error.message,
      ...(error.fields?.length ? { fields: error.fields } : {})
    }
  });
}

function handleValidation(req, res, codes = {}) {
  const errors = validationResult(req);
  if (errors.isEmpty()) return true;
  const prioritizedError = errors.array().find((error) => codes[error.path]);
  if (prioritizedError) {
    return cashError(res, new CashDomainError(codes[prioritizedError.path], prioritizedError.msg, 400, [{ field: prioritizedError.path, message: prioritizedError.msg }]));
  }
  validationError(res, errors);
  return false;
}

function registerResponse(register) {
  return {
    id: Number(register.id),
    name: register.name,
    status: register.status,
    location: {
      id: Number(register.location?.id ?? register.location_id),
      name: register.location?.name ?? register.location_name,
      code: register.location?.code ?? register.location_code
    }
  };
}

function positiveInteger(value, fallback = null) {
  if (value === undefined || value === null || value === "") return fallback;
  if (!/^[1-9]\d*$/.test(String(value))) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function historyValidationError(res, fields) {
  return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Revisa los filtros enviados.", fields } });
}

function serializeHistorySession(row) {
  return {
    id: Number(row.id),
    register: { id: Number(row.register_id), name: row.register_name },
    location: { id: Number(row.location_id), name: row.location_name, code: row.location_code },
    openedBy: { id: Number(row.opened_by_id), username: row.opened_by_username },
    closedBy: row.closed_by_id === null ? null : { id: Number(row.closed_by_id), username: row.closed_by_username },
    openingAmount: Number(row.opening_amount),
    cashSales: Number(row.cash_sales),
    totalCashIn: Number(row.total_cash_in),
    totalCashOut: Number(row.total_cash_out),
    expectedAmount: Number(row.expected_amount),
    closingAmount: row.closing_amount === null ? null : Number(row.closing_amount),
    differenceAmount: Number(row.difference_amount),
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    status: row.status
  };
}

export async function listCashSessions(req, res, next) {
  const registerValue = req.query.registerId;
  const registerId = registerValue === undefined || registerValue === "" ? null : positiveInteger(registerValue);
  const status = typeof req.query.status === "string" && req.query.status.trim() ? req.query.status.trim() : null;
  const dateFromValue = req.query.dateFrom ?? req.query.startDate;
  const dateToValue = req.query.dateTo ?? req.query.endDate;
  const dateFrom = typeof dateFromValue === "string" ? dateFromValue.trim() : "";
  const dateTo = typeof dateToValue === "string" ? dateToValue.trim() : "";
  const page = positiveInteger(req.query.page, 1);
  const requestedLimit = positiveInteger(req.query.limit, 25);
  const fields = [];
  if (registerValue !== undefined && registerValue !== "" && registerId === null) fields.push({ field: "registerId", message: "La caja debe ser un entero positivo." });
  if (status !== null && !["open", "closed"].includes(status)) fields.push({ field: "status", message: "El estado debe ser open o closed." });
  if (dateFrom && !validDate(dateFrom)) fields.push({ field: "dateFrom", message: "La fecha inicial debe tener formato YYYY-MM-DD." });
  if (dateTo && !validDate(dateTo)) fields.push({ field: "dateTo", message: "La fecha final debe tener formato YYYY-MM-DD." });
  if (dateFrom && dateTo && validDate(dateFrom) && validDate(dateTo) && dateFrom > dateTo) fields.push({ field: "dateTo", message: "La fecha final debe ser posterior o igual a la inicial." });
  if (page === null) fields.push({ field: "page", message: "La página debe ser un entero positivo." });
  if (requestedLimit === null) fields.push({ field: "limit", message: "El límite debe ser un entero positivo." });
  if (fields.length) return historyValidationError(res, fields);

  const pageSize = Math.min(requestedLimit, 50);
  try {
    const filters = { businessId: req.business.id, registerId, status, dateFrom: dateFrom || null, dateTo: dateTo || null };
    const totalItems = await countCashSessions(filters);
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const currentPage = Math.min(page, totalPages);
    const sessions = await getCashSessions({ ...filters, limit: pageSize, offset: (currentPage - 1) * pageSize });
    return res.status(200).json({
      data: {
        sessions: sessions.map(serializeHistorySession),
        filters: { registerId, status, dateFrom: dateFrom || null, dateTo: dateTo || null },
        pagination: { page: currentPage, pageSize, totalItems, totalPages }
      }
    });
  } catch (error) {
    return next(error);
  }
}

export async function listCashSessionMovements(req, res, next) {
  const sessionId = positiveInteger(req.params.sessionId);
  if (!sessionId) return historyValidationError(res, [{ field: "sessionId", message: "La sesión debe ser un entero positivo." }]);
  try {
    const result = await getCashSessionMovements({ businessId: req.business.id, sessionId });
    if (!result) return cashError(res, new CashDomainError("CASH_SESSION_NOT_FOUND", "No se encontró la sesión solicitada.", 404));
    return res.status(200).json({
      data: {
        session: { id: Number(result.session.id), status: result.session.status },
        movements: result.movements.map((movement) => ({
          id: Number(movement.id),
          type: movement.movement_type,
          movementType: movement.movement_type,
          amount: Number(movement.amount),
          reason: movement.reason,
          user: { id: Number(movement.created_by), username: movement.username },
          createdAt: movement.created_at
        }))
      }
    });
  } catch (error) {
    return next(error);
  }
}

export async function listCashRegisters(req, res, next) {
  try {
    return res.status(200).json({ data: { registers: await getCashRegisters(req.business.id) } });
  } catch (error) {
    return next(error);
  }
}

export async function createCashRegisterController(req, res, next) {
  if (!handleValidation(req, res)) return;
  const data = matchedData(req, { locations: ["body"] });
  try {
    const register = await createCashRegister({ businessId: req.business.id, locationId: data.locationId, name: data.name });
    return res.status(201).json({ data: { register: registerResponse(register) } });
  } catch (error) {
    if (error instanceof CashDomainError) return cashError(res, error);
    return next(error);
  }
}

export async function getCurrentCashSessionController(req, res, next) {
  try {
    return res.status(200).json({ data: { session: await getCurrentCashSession(req.business.id) } });
  } catch (error) {
    return next(error);
  }
}

export async function openCashSessionController(req, res, next) {
  if (!handleValidation(req, res, { openingAmount: "CASH_INVALID_AMOUNT" })) return;
  const data = matchedData(req, { locations: ["body"] });
  try {
    const result = await openCashSession({ businessId: req.business.id, registerId: data.registerId, userId: req.session.user.id, openingAmount: data.openingAmount });
    return res.status(201).json({
      data: {
        session: {
          id: Number(result.session.id),
          status: result.session.status,
          openingAmount: Number(result.session.opening_amount),
          openedAt: result.session.opened_at,
          register: { id: Number(result.register.id), name: result.register.name }
        }
      }
    });
  } catch (error) {
    if (error instanceof CashDomainError) return cashError(res, error);
    return next(error);
  }
}

export async function createCashMovementController(req, res, next) {
  if (!handleValidation(req, res, { movementType: "CASH_INVALID_MOVEMENT", amount: "CASH_INVALID_AMOUNT" })) return;
  const data = matchedData(req, { locations: ["params", "body"] });
  try {
    const result = await createCashMovement({ businessId: req.business.id, sessionId: data.sessionId, userId: req.session.user.id, movementType: data.movementType, amount: data.amount, reason: data.reason });
    return res.status(201).json({
      data: {
        movement: {
          id: Number(result.movement.id),
          movementType: result.movement.movement_type,
          amount: Number(result.movement.amount),
          reason: result.movement.reason,
          createdAt: result.movement.created_at
        },
        expectedAmount: result.expectedAmount
      }
    });
  } catch (error) {
    if (error instanceof CashDomainError) return cashError(res, error);
    return next(error);
  }
}

export async function closeCashSessionController(req, res, next) {
  if (!handleValidation(req, res, { closingAmount: "CASH_INVALID_CLOSING_AMOUNT" })) return;
  const data = matchedData(req, { locations: ["params", "body"] });
  try {
    const result = await closeCashSession({ businessId: req.business.id, sessionId: data.sessionId, userId: req.session.user.id, closingAmount: data.closingAmount });
    return res.status(200).json({
      data: {
        session: {
          id: Number(result.id),
          status: result.status,
          closingAmount: Number(result.closing_amount),
          expectedAmount: Number(result.expected_amount),
          differenceAmount: Number(result.difference_amount),
          closedAt: result.closed_at
        }
      }
    });
  } catch (error) {
    if (error instanceof CashDomainError) return cashError(res, error);
    return next(error);
  }
}

import { matchedData, validationResult } from "express-validator";

import {
  createBusinessCost,
  getBusinessCosts,
  updateBusinessCost,
  updateBusinessCostStatus
} from "../db/businessCostQueries.js";

function sendValidationError(res, errors) {
  return res.status(400).json({
    error: {
      code: "VALIDATION_ERROR",
      message: "Revisa los campos enviados.",
      fields: errors.array().map((error) => ({ field: error.path, message: error.msg }))
    }
  });
}

function positiveInteger(value) {
  if (!/^[1-9]\d*$/.test(String(value))) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function serializeCost(cost) {
  return {
    id: Number(cost.id),
    name: cost.name,
    description: cost.description,
    category: cost.category ?? "labor",
    customCategoryName: cost.custom_category_name,
    amount: Number(cost.amount),
    costType: cost.cost_type,
    frequency: cost.frequency,
    startDate: cost.start_date,
    endDate: cost.end_date,
    notes: cost.notes,
    isActive: Boolean(cost.is_active),
    createdBy: cost.created_by === undefined ? undefined : {
      id: Number(cost.created_by),
      username: cost.created_by_username
    },
    createdAt: cost.created_at,
    updatedAt: cost.updated_at
  };
}

function sendNotFound(res) {
  return res.status(404).json({
    error: {
      code: "BUSINESS_COST_NOT_FOUND",
      message: "No se encontró el costo solicitado."
    }
  });
}

function handleValidation(req, res) {
  const errors = validationResult(req);
  return errors.isEmpty() ? null : sendValidationError(res, errors);
}

export async function listBusinessCosts(req, res, next) {
  try {
    const costs = await getBusinessCosts(req.business.id);
    return res.status(200).json({ data: { costs: costs.map(serializeCost) } });
  } catch (error) {
    return next(error);
  }
}

export async function createBusinessCostController(req, res, next) {
  const validationResponse = handleValidation(req, res);
  if (validationResponse) return validationResponse;

  try {
    const cost = await createBusinessCost({
      ...matchedData(req, { locations: ["body"] }),
      businessId: req.business.id,
      createdBy: req.session.user.id
    });
    return res.status(201).json({ data: { cost: serializeCost(cost) } });
  } catch (error) {
    return next(error);
  }
}

export async function updateBusinessCostController(req, res, next) {
  const costId = positiveInteger(req.params.costId);
  if (!costId) return sendValidationError(res, { array: () => [{ path: "costId", msg: "El costo debe ser un entero positivo." }] });
  const validationResponse = handleValidation(req, res);
  if (validationResponse) return validationResponse;

  try {
    const cost = await updateBusinessCost({
      ...matchedData(req, { locations: ["body"] }),
      businessId: req.business.id,
      costId
    });
    if (!cost) return sendNotFound(res);
    return res.status(200).json({ data: { cost: serializeCost(cost) } });
  } catch (error) {
    return next(error);
  }
}

export async function updateBusinessCostStatusController(req, res, next) {
  const costId = positiveInteger(req.params.costId);
  if (!costId) return sendValidationError(res, { array: () => [{ path: "costId", msg: "El costo debe ser un entero positivo." }] });
  const validationResponse = handleValidation(req, res);
  if (validationResponse) return validationResponse;

  try {
    const { isActive } = matchedData(req, { locations: ["body"] });
    const cost = await updateBusinessCostStatus({ businessId: req.business.id, costId, isActive });
    if (!cost) return sendNotFound(res);
    return res.status(200).json({ data: { cost: serializeCost(cost) } });
  } catch (error) {
    return next(error);
  }
}

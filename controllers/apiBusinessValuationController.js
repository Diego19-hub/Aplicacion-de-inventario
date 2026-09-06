import { matchedData, validationResult } from "express-validator";
import {
  getBusinessValuationSettings,
  INVENTORY_VALUATION_METHODS,
  updateBusinessValuationMethod
} from "../db/businessValuationQueries.js";

function validationError(res, errors) {
  return res.status(400).json({
    error: {
      code: "VALIDATION_ERROR",
      message: "Revisa los campos enviados.",
      fields: errors.array().map((error) => ({ field: error.path, message: error.msg }))
    }
  });
}

export async function getValuationSettingsController(req, res, next) {
  try {
    const settings = await getBusinessValuationSettings(req.business.id);
    if (!settings) return res.status(404).json({ error: { code: "BUSINESS_NOT_FOUND", message: "No se encontró el negocio activo." } });
    return res.json({ data: settings });
  } catch (error) {
    return next(error);
  }
}

export async function updateValuationSettingsController(req, res, next) {
  const result = validationResult(req);
  if (!result.isEmpty()) return validationError(res, result);
  try {
    const { valuationMethod } = matchedData(req, { locations: ["body"] });
    const settings = await updateBusinessValuationMethod({
      businessId: req.business.id,
      userId: req.session.user.id,
      valuationMethod
    });
    if (settings.error === "invalid_method") {
      return res.status(400).json({ error: { code: "INVALID_VALUATION_METHOD", message: `El método debe ser uno de: ${INVENTORY_VALUATION_METHODS.join(", ")}.` } });
    }
    if (settings.error === "business_not_found") {
      return res.status(404).json({ error: { code: "BUSINESS_NOT_FOUND", message: "No se encontró el negocio activo." } });
    }
    return res.json({ data: settings });
  } catch (error) {
    return next(error);
  }
}

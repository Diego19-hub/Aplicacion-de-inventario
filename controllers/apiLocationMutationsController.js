import { matchedData, validationResult } from "express-validator";

import {
  createApiLocation,
  getApiLocationById,
  updateApiLocation
} from "../db/apiLocationQueries.js";

function positiveInteger(value) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function validationError(res, errors) {
  return res.status(400).json({
    error: {
      code: "VALIDATION_ERROR",
      message: "Revisa los campos enviados.",
      fields: errors.map((error) => ({ field: error.path, message: error.msg }))
    }
  });
}

function locationNotFound(res) {
  return res.status(404).json({
    error: {
      code: "LOCATION_NOT_FOUND",
      message: "No se encontró la ubicación solicitada."
    }
  });
}

function serializeEditableLocation(location) {
  return {
    id: Number(location.id),
    name: location.name,
    code: location.code,
    locationType: location.location_type,
    status: location.status,
    isDefault: location.is_default,
    address: location.address,
    phone: location.phone,
    notes: location.notes
  };
}

function duplicateLocationError(error) {
  const field = error.constraint?.includes("code") ? "code" : "name";
  const message = field === "code"
    ? "Ya existe una ubicación con ese código."
    : "Ya existe una ubicación con ese nombre.";
  return { field, message };
}

export async function createLocation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return validationError(res, errors.array());

  try {
    const location = await createApiLocation(req.business.id, matchedData(req));
    return res.status(201).json({ data: { location: serializeEditableLocation(location) } });
  } catch (error) {
    if (error.code === "23505") {
      const duplicate = duplicateLocationError(error);
      return res.status(409).json({
        error: {
          code: "LOCATION_ALREADY_EXISTS",
          message: duplicate.message,
          fields: [duplicate]
        }
      });
    }
    return next(error);
  }
}

export async function getLocationForEdit(req, res, next) {
  const locationId = positiveInteger(req.params.locationId);
  if (!locationId) {
    return validationError(res, [{ path: "locationId", msg: "La ubicación debe ser un entero positivo." }]);
  }

  try {
    const location = await getApiLocationById(req.business.id, locationId);
    if (!location) return locationNotFound(res);
    return res.status(200).json({ data: { location: serializeEditableLocation(location) } });
  } catch (error) {
    return next(error);
  }
}

export async function updateLocation(req, res, next) {
  const locationId = positiveInteger(req.params.locationId);
  if (!locationId) {
    return validationError(res, [{ path: "locationId", msg: "La ubicación debe ser un entero positivo." }]);
  }

  const errors = validationResult(req);
  if (!errors.isEmpty()) return validationError(res, errors.array());

  try {
    const location = await updateApiLocation(req.business.id, locationId, matchedData(req));
    if (!location) return locationNotFound(res);
    return res.status(200).json({ data: { location: serializeEditableLocation(location) } });
  } catch (error) {
    if (error.code === "23505") {
      const duplicate = duplicateLocationError(error);
      return res.status(409).json({
        error: {
          code: "LOCATION_ALREADY_EXISTS",
          message: duplicate.message,
          fields: [duplicate]
        }
      });
    }
    return next(error);
  }
}

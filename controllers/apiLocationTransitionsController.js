import {
  deactivateApiLocation,
  makeApiDefaultLocation,
  reactivateApiLocation
} from "../db/apiLocationQueries.js";

function positiveInteger(value) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function validationError(res) {
  return res.status(400).json({
    error: {
      code: "VALIDATION_ERROR",
      message: "Revisa los campos enviados.",
      fields: [{ field: "locationId", message: "La ubicación debe ser un entero positivo." }]
    }
  });
}

function locationNotFound(res) {
  return res.status(404).json({
    error: { code: "LOCATION_NOT_FOUND", message: "No se encontró la ubicación solicitada." }
  });
}

const transitionErrors = {
  inactive: ["LOCATION_INACTIVE", "No puedes convertir una ubicación inactiva en principal."],
  already_default: ["LOCATION_ALREADY_DEFAULT", "La ubicación ya es la principal."],
  default_required: ["DEFAULT_LOCATION_REQUIRED", "No puedes desactivar la ubicación principal."],
  has_stock: ["LOCATION_HAS_STOCK", "No puedes desactivar una ubicación que todavía tiene stock."],
  already_inactive: ["LOCATION_ALREADY_INACTIVE", "La ubicación ya está inactiva."],
  already_active: ["LOCATION_ALREADY_ACTIVE", "La ubicación ya está activa."]
};

function serializeLocation(location) {
  return {
    id: location.id,
    name: location.name,
    code: location.code,
    status: location.status,
    isDefault: location.is_default
  };
}

function transitionHandler(operation) {
  return async (req, res, next) => {
    const locationId = positiveInteger(req.params.locationId);
    if (!locationId) return validationError(res);

    try {
      const result = await operation(req.business.id, locationId);
      if (result.error === "not_found") return locationNotFound(res);
      if (result.error) {
        const [code, message] = transitionErrors[result.error];
        return res.status(409).json({ error: { code, message } });
      }
      return res.status(200).json({ data: { location: serializeLocation(result.location) } });
    } catch (error) {
      return next(error);
    }
  };
}

export const makeDefaultLocation = transitionHandler(makeApiDefaultLocation);
export const deactivateLocation = transitionHandler(deactivateApiLocation);
export const reactivateLocation = transitionHandler(reactivateApiLocation);

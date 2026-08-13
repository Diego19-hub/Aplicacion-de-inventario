import { getApiProductById } from "../db/apiProductQueries.js";
import {
  countApiProductMovements,
  getApiMovementFormLocations,
  getApiProductMovements
} from "../db/movementQueries.js";
import { getActiveLocations } from "../db/locationQueries.js";
import { matchedData, validationResult } from "express-validator";
import { recordMovement } from "../db/movementQueries.js";

const PAGE_SIZE = 20;
const movementTypes = new Set([
  "opening_balance", "entry", "exit", "adjustment", "transfer_out", "transfer_in"
]);

function productId(value) {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

function responseNotFound(res) {
  return res.status(404).json({
    error: { code: "PRODUCT_NOT_FOUND", message: "No se encontró el producto solicitado." }
  });
}

function serializeMovement(movement) {
  return {
    id: movement.id,
    createdAt: movement.created_at,
    type: movement.movement_type,
    quantityDelta: Number(movement.quantity_delta),
    previousStock: Number(movement.previous_stock),
    resultingStock: Number(movement.resulting_stock),
    reason: movement.reason,
    reference: movement.reference,
    location: { id: movement.location_id, name: movement.location_name, code: movement.location_code },
    createdBy: { id: movement.created_by_id, username: movement.username },
    transferId: movement.transfer_id === null ? null : Number(movement.transfer_id)
  };
}

export async function getProductMovements(req, res, next) {
  const id = productId(req.params.productId);
  if (!id) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Revisa los campos enviados.",
        fields: [{ field: "productId", message: "El producto debe ser un entero positivo." }]
      }
    });
  }

  try {
    const product = await getApiProductById(req.business.id, id);
    if (!product) return responseNotFound(res);

    const locations = await getActiveLocations(req.business.id);
    const rawLocationId = typeof req.query.location === "string" ? req.query.location : "";
    const requestedLocationId = /^[1-9]\d*$/.test(rawLocationId) ? Number(rawLocationId) : null;
    const locationId = rawLocationId === ""
      ? null
      : locations.some((location) => location.id === requestedLocationId) ? requestedLocationId : -1;
    const requestedType = typeof req.query.type === "string" ? req.query.type : "";
    const movementType = movementTypes.has(requestedType) ? requestedType : "";
    const requestedPage = typeof req.query.page === "string" && /^[1-9]\d*$/.test(req.query.page)
      ? Number(req.query.page) : 1;
    const filters = { businessId: req.business.id, itemId: id, locationId, movementType };
    const totalItems = await countApiProductMovements(filters);
    const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
    const page = Math.min(requestedPage, totalPages);
    const movements = await getApiProductMovements({
      ...filters,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE
    });

    return res.status(200).json({
      data: {
        product: { id: product.id, name: product.name, sku: product.sku, stock: Number(product.stock) },
        movements: movements.map(serializeMovement),
        locations: locations.map((location) => ({ id: location.id, name: location.name, code: location.code })),
        filters: { locationId: locationId > 0 ? locationId : null, type: movementType },
        pagination: { page, pageSize: PAGE_SIZE, totalItems: Number(totalItems), totalPages }
      }
    });
  } catch (error) {
    return next(error);
  }
}

function validationError(res, fields) {
  return res.status(400).json({
    error: { code: "VALIDATION_ERROR", message: "Revisa los campos enviados.", fields }
  });
}

export async function getProductMovementFormOptions(req, res, next) {
  const id = productId(req.params.productId);
  if (!id) return validationError(res, [{ field: "productId", message: "El producto debe ser un entero positivo." }]);

  try {
    const product = await getApiProductById(req.business.id, id);
    if (!product) return responseNotFound(res);
    const locations = await getApiMovementFormLocations(req.business.id, id);
    return res.status(200).json({
      data: {
        product: { id: product.id, name: product.name, sku: product.sku, stock: Number(product.stock) },
        locations: locations.map((location) => ({ id: location.id, name: location.name, code: location.code, isDefault: location.is_default, stock: Number(location.stock) })),
        movementTypes: [
          { value: "entry", label: "Entrada" },
          { value: "exit", label: "Salida" },
          { value: "adjustment", label: "Ajuste" }
        ]
      }
    });
  } catch (error) { return next(error); }
}

export async function createProductMovement(req, res, next) {
  const id = productId(req.params.productId);
  if (!id) return validationError(res, [{ field: "productId", message: "El producto debe ser un entero positivo." }]);
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return validationError(res, errors.array().map((error) => ({ field: error.path, message: error.msg })));
  }

  try {
    const product = await getApiProductById(req.business.id, id);
    if (!product) return responseNotFound(res);
    const data = matchedData(req);
    const locations = await getApiMovementFormLocations(req.business.id, id);
    const location = locations.find((candidate) => candidate.id === data.locationId);
    if (!location) return validationError(res, [{ field: "locationId", message: "Selecciona una ubicación válida." }]);
    const movement = await recordMovement({
      businessId: req.business.id,
      itemId: id,
      userId: req.session.user.id,
      locationId: data.locationId,
      movementType: data.movementType,
      quantity: data.quantity,
      reason: data.reason,
      reference: data.reference
    });
    if (movement.error === "not_found") return responseNotFound(res);
    if (movement.error === "location_not_found") return validationError(res, [{ field: "locationId", message: "Selecciona una ubicación válida." }]);
    if (movement.error === "negative_stock") {
      return res.status(409).json({ error: { code: "INSUFFICIENT_STOCK", message: "La salida no puede dejar existencias locales negativas.", fields: [{ field: "quantity", message: "No hay existencias locales suficientes." }] } });
    }
    if (movement.error === "same_stock") return validationError(res, [{ field: "quantity", message: "El ajuste coincide con el stock de la ubicación." }]);
    return res.status(201).json({ data: { movement: {
      id: movement.id, type: movement.movement_type, quantityDelta: Number(movement.quantity_delta), previousStock: Number(movement.previous_stock), resultingStock: Number(movement.resulting_stock), reason: movement.reason, reference: movement.reference, createdAt: movement.created_at,
      location: { id: location.id, name: location.name, code: location.code },
      createdBy: { id: req.session.user.id, username: req.session.user.username }
    }, product: { id, stock: Number(movement.item_stock) } } });
  } catch (error) { return next(error); }
}

import { matchedData, validationResult } from "express-validator";

import { createInventoryTransfer, getApiTransferFormOptions } from "../db/transferQueries.js";
import {
  countApiTransfers,
  getApiTransferById,
  getApiTransferLocations,
  getApiTransfers
} from "../db/apiTransferQueries.js";

const PAGE_SIZE = 20;

function positiveInteger(value) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function validationError(res, fields) {
  return res.status(400).json({
    error: {
      code: "VALIDATION_ERROR",
      message: "Revisa los campos enviados.",
      fields
    }
  });
}

function serializeTransfer(transfer, user) {
  return {
    id: Number(transfer.id),
    quantity: Number(transfer.quantity),
    reason: transfer.reason,
    reference: transfer.reference,
    createdAt: transfer.created_at,
    product: {
      id: Number(transfer.item.id),
      name: transfer.item.name,
      sku: transfer.item.sku
    },
    fromLocation: {
      id: Number(transfer.fromLocation.id),
      name: transfer.fromLocation.name,
      code: transfer.fromLocation.code
    },
    toLocation: {
      id: Number(transfer.toLocation.id),
      name: transfer.toLocation.name,
      code: transfer.toLocation.code
    },
    createdBy: {
      id: Number(user.id),
      username: user.username
    }
  };
}

function serializeTransferRow(transfer) {
  return {
    id: Number(transfer.id),
    quantity: Number(transfer.quantity),
    reason: transfer.reason,
    reference: transfer.reference,
    createdAt: transfer.created_at,
    product: {
      id: Number(transfer.product_id),
      name: transfer.product_name,
      sku: transfer.product_sku
    },
    fromLocation: {
      id: Number(transfer.from_location_id),
      name: transfer.from_location_name,
      code: transfer.from_location_code
    },
    toLocation: {
      id: Number(transfer.to_location_id),
      name: transfer.to_location_name,
      code: transfer.to_location_code
    },
    createdBy: {
      id: Number(transfer.created_by_id),
      username: transfer.username
    }
  };
}

function serializeMovement(movement) {
  return {
    id: Number(movement.id),
    type: movement.movement_type,
    quantityDelta: Number(movement.quantity_delta),
    previousStock: Number(movement.previous_stock),
    resultingStock: Number(movement.resulting_stock),
    createdAt: movement.created_at,
    location: {
      id: Number(movement.location_id),
      name: movement.location_name,
      code: movement.location_code
    }
  };
}

function requestedPage(value) {
  const page = positiveInteger(value);
  return page ?? 1;
}

export async function listTransfers(req, res, next) {
  try {
    const locations = await getApiTransferLocations(req.business.id);
    const rawLocation = typeof req.query.location === "string" ? req.query.location : "";
    const locationId = rawLocation === ""
      ? null
      : locations.some((location) => location.id === positiveInteger(rawLocation))
        ? positiveInteger(rawLocation)
        : -1;
    const query = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
    const filters = { businessId: req.business.id, query, locationId };
    const totalItems = await countApiTransfers(filters);
    const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
    const page = Math.min(requestedPage(req.query.page), totalPages);
    const transfers = await getApiTransfers({
      ...filters,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE
    });

    return res.status(200).json({
      data: {
        transfers: transfers.map(serializeTransferRow),
        locations: locations.map((location) => ({
          id: Number(location.id),
          name: location.name,
          code: location.code,
          isDefault: location.is_default
        })),
        filters: { q: query, locationId: locationId > 0 ? locationId : null },
        pagination: { page, pageSize: PAGE_SIZE, totalItems: Number(totalItems), totalPages }
      }
    });
  } catch (error) {
    return next(error);
  }
}

export async function getTransferDetails(req, res, next) {
  const transferId = positiveInteger(req.params.transferId);
  if (!transferId) {
    return validationError(res, [{ field: "transferId", message: "La transferencia debe ser un entero positivo." }]);
  }

  try {
    const result = await getApiTransferById(req.business.id, transferId);
    if (!result) {
      return res.status(404).json({
        error: { code: "TRANSFER_NOT_FOUND", message: "No se encontró la transferencia solicitada." }
      });
    }
    if (result.error) {
      console.error("Transferencia con movimientos inconsistentes", {
        transferId: result.transferId,
        businessId: req.business.id
      });
      return res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Ocurrió un error interno." }
      });
    }

    return res.status(200).json({
      data: {
        transfer: {
          ...serializeTransferRow(result.transfer),
          transferOut: serializeMovement(result.transferOut),
          transferIn: serializeMovement(result.transferIn)
        }
      }
    });
  } catch (error) {
    return next(error);
  }
}

export async function getTransferFormOptions(req, res, next) {
  try {
    const options = await getApiTransferFormOptions(req.business.id);
    const requestedProductId = positiveInteger(req.query.product);
    const selectedProductId = options.products.some((product) => product.id === requestedProductId)
      ? requestedProductId
      : null;

    return res.status(200).json({
      data: {
        products: options.products.map((product) => ({
          id: Number(product.id),
          name: product.name,
          sku: product.sku,
          stock: Number(product.stock)
        })),
        locations: options.locations.map((location) => ({
          id: Number(location.id),
          name: location.name,
          code: location.code,
          isDefault: location.is_default
        })),
        balances: options.balances.map((balance) => ({
          productId: Number(balance.item_id),
          locationId: Number(balance.location_id),
          stock: Number(balance.stock)
        })),
        selectedProductId
      }
    });
  } catch (error) {
    return next(error);
  }
}

export async function createTransfer(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return validationError(res, errors.array().map((error) => ({
      field: error.path,
      message: error.msg
    })));
  }

  const data = matchedData(req);
  try {
    const transfer = await createInventoryTransfer({
      businessId: req.business.id,
      itemId: data.productId,
      userId: req.session.user.id,
      fromLocationId: data.fromLocationId,
      toLocationId: data.toLocationId,
      quantity: data.quantity,
      reason: data.reason,
      reference: data.reference
    });

    if (transfer.error === "not_found") {
      return res.status(404).json({
        error: { code: "PRODUCT_NOT_FOUND", message: "No se encontró el producto solicitado." }
      });
    }
    if (transfer.error === "location_not_found") {
      return validationError(res, [{
        field: "fromLocationId",
        message: "Selecciona ubicaciones activas del negocio actual."
      }]);
    }
    if (transfer.error === "same_location") {
      return validationError(res, [{
        field: "toLocationId",
        message: "Origen y destino deben ser distintos."
      }]);
    }
    if (transfer.error === "insufficient_stock") {
      return res.status(409).json({
        error: {
          code: "INSUFFICIENT_STOCK",
          message: "No hay existencias locales suficientes en el origen.",
          fields: [{ field: "quantity", message: "No hay existencias locales suficientes." }]
        }
      });
    }

    return res.status(201).json({
      data: { transfer: serializeTransfer(transfer, req.session.user) }
    });
  } catch (error) {
    return next(error);
  }
}

import { matchedData, validationResult } from "express-validator";

import { createInventoryTransfer, getApiTransferFormOptions } from "../db/transferQueries.js";

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

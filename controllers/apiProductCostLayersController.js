import { getApiProductById } from "../db/apiProductQueries.js";
import { getApiProductCostLayerData } from "../db/apiInventoryCostLayerQueries.js";

function positiveInteger(value) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function validationError(res, field, message) {
  return res.status(400).json({
    error: {
      code: "VALIDATION_ERROR",
      message: "Revisa los campos enviados.",
      fields: [{ field, message }]
    }
  });
}

export async function getProductCostLayersController(req, res, next) {
  const productId = positiveInteger(req.params.productId);
  if (!productId) return validationError(res, "productId", "El producto debe ser un entero positivo.");

  const locationValue = req.query.locationId;
  const locationId = locationValue === undefined || locationValue === ""
    ? null
    : positiveInteger(locationValue);
  if (locationValue !== undefined && locationValue !== "" && !locationId) {
    return validationError(res, "locationId", "La ubicación debe ser un entero positivo.");
  }

  try {
    const product = await getApiProductById(req.business.id, productId);
    if (!product) {
      return res.status(404).json({ error: { code: "PRODUCT_NOT_FOUND", message: "No se encontró el producto solicitado." } });
    }

    const result = await getApiProductCostLayerData({
      businessId: req.business.id,
      itemId: productId,
      locationId
    });
    return res.status(200).json({
      data: {
        productId,
        valuationMethod: result.valuationMethod,
        layers: result.layers.map((layer) => ({
          id: Number(layer.id),
          receivedAt: layer.received_at,
          location: { id: Number(layer.location_id), name: layer.location_name, code: layer.location_code },
          quantityOriginal: Number(layer.quantity_original),
          quantityAvailable: Number(layer.quantity_available),
          quantityConsumed: Number(layer.quantity_consumed),
          unitCost: layer.unit_cost,
          availableValue: layer.available_value,
          reference: layer.source_reference,
          sourceOperationType: layer.source_operation_type,
          status: layer.layer_status
        })),
        consumptions: result.consumptions.map((consumption) => ({
          id: Number(consumption.id),
          layerId: Number(consumption.layer_id),
          consumedAt: consumption.consumed_at,
          quantity: Number(consumption.quantity),
          unitCost: consumption.unit_cost,
          totalCost: consumption.total_cost,
          operationType: consumption.operation_type,
          reference: consumption.operation_reference,
          location: { id: Number(consumption.location_id), name: consumption.location_name, code: consumption.location_code }
        }))
      }
    });
  } catch (error) {
    return next(error);
  }
}

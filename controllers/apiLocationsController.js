import {
  countApiLocations,
  getApiLocationById,
  getApiLocationProducts,
  getApiLocationRecentMovements,
  getApiLocations
} from "../db/apiLocationQueries.js";

const PAGE_SIZE = 20;
const LOCATION_STATUSES = new Set(["active", "inactive", "all"]);

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

function locationNotFound(res) {
  return res.status(404).json({
    error: {
      code: "LOCATION_NOT_FOUND",
      message: "No se encontró la ubicación solicitada."
    }
  });
}

function serializeLocation(location) {
  return {
    id: Number(location.id),
    name: location.name,
    code: location.code,
    type: location.location_type,
    status: location.status,
    isDefault: location.is_default,
    address: location.address,
    phone: location.phone,
    totalStock: Number(location.total_stock),
    positiveProductCount: Number(location.positive_product_count)
  };
}

export async function listLocations(req, res, next) {
  const query = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
  const requestedStatus = typeof req.query.status === "string" ? req.query.status : "active";
  const status = LOCATION_STATUSES.has(requestedStatus) ? requestedStatus : "active";
  const requestedPage = positiveInteger(req.query.page) ?? 1;
  const filters = { businessId: req.business.id, query, status };

  try {
    const totalItems = Number(await countApiLocations(filters));
    const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
    const page = Math.min(requestedPage, totalPages);
    const locations = await getApiLocations({
      ...filters,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE
    });

    return res.status(200).json({
      data: {
        locations: locations.map(serializeLocation),
        filters: { q: query, status },
        pagination: { page, pageSize: PAGE_SIZE, totalItems, totalPages }
      }
    });
  } catch (error) {
    return next(error);
  }
}

export async function getLocationDetails(req, res, next) {
  const locationId = positiveInteger(req.params.locationId);
  if (!locationId) {
    return validationError(res, "locationId", "La ubicación debe ser un entero positivo.");
  }

  try {
    const location = await getApiLocationById(req.business.id, locationId);
    if (!location) return locationNotFound(res);

    const [products, recentMovements] = await Promise.all([
      getApiLocationProducts(req.business.id, locationId),
      getApiLocationRecentMovements(req.business.id, locationId)
    ]);

    return res.status(200).json({
      data: {
        location: { ...serializeLocation(location), notes: location.notes },
        products: products.map((product) => ({
          id: Number(product.id),
          name: product.name,
          sku: product.sku,
          status: product.status,
          localStock: Number(product.local_stock),
          totalStock: Number(product.total_stock)
        })),
        recentMovements: recentMovements.map((movement) => ({
          id: Number(movement.id),
          createdAt: movement.created_at,
          type: movement.movement_type,
          quantityDelta: Number(movement.quantity_delta),
          product: { id: Number(movement.item_id), name: movement.item_name, sku: movement.sku },
          createdBy: { id: Number(movement.created_by_id), username: movement.username },
          transferId: movement.transfer_id === null ? null : Number(movement.transfer_id)
        }))
      }
    });
  } catch (error) {
    return next(error);
  }
}

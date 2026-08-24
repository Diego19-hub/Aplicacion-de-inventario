import { matchedData, validationResult } from "express-validator";

import {
  createPosSale,
  countSales,
  getPosFormOptions,
  getPosLocation,
  getPosProducts,
  getSaleDetails,
  getSales,
  SaleDomainError
} from "../db/apiSaleQueries.js";

const PAYMENT_METHODS = new Set(["cash", "card", "transfer"]);
const SALE_STATUSES = new Set(["completed", "cancelled"]);

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

function saleError(res, error) {
  return res.status(error.statusCode ?? 400).json({
    error: {
      code: error.code,
      message: error.message,
      ...(error.fields?.length ? { fields: error.fields } : {})
    }
  });
}

function optionalQueryValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function readSalesFilters(req, res) {
  const paymentMethod = optionalQueryValue(req.query.paymentMethod);
  const status = optionalQueryValue(req.query.status);
  const dateFrom = optionalQueryValue(req.query.dateFrom);
  const dateTo = optionalQueryValue(req.query.dateTo);
  const q = optionalQueryValue(req.query.q).slice(0, 100);
  const fields = [];

  if (paymentMethod && !PAYMENT_METHODS.has(paymentMethod)) {
    fields.push({ field: "paymentMethod", message: "El método de pago no es válido." });
  }
  if (status && !SALE_STATUSES.has(status)) {
    fields.push({ field: "status", message: "El estado de la venta no es válido." });
  }
  if (dateFrom && !validDate(dateFrom)) {
    fields.push({ field: "dateFrom", message: "La fecha inicial debe tener formato YYYY-MM-DD." });
  }
  if (dateTo && !validDate(dateTo)) {
    fields.push({ field: "dateTo", message: "La fecha final debe tener formato YYYY-MM-DD." });
  }
  if (dateFrom && dateTo && validDate(dateFrom) && validDate(dateTo) && dateFrom > dateTo) {
    fields.push({ field: "dateTo", message: "La fecha final debe ser posterior o igual a la inicial." });
  }
  if (fields.length) {
    validationError(res, fields);
    return null;
  }

  return { paymentMethod: paymentMethod || null, status: status || null, dateFrom: dateFrom || null, dateTo: dateTo || null, q };
}

export async function listSales(req, res, next) {
  const page = positiveInteger(optionalQueryValue(req.query.page)) ?? 1;
  const requestedLimit = positiveInteger(optionalQueryValue(req.query.limit)) ?? 25;
  const pageSize = Math.min(requestedLimit, 50);
  const filters = readSalesFilters(req, res);
  if (!filters) return;

  try {
    const totalItems = await countSales({ businessId: req.business.id, ...filters });
    const totalPages = Math.ceil(totalItems / pageSize);
    const currentPage = totalPages === 0 ? 1 : Math.min(page, totalPages);
    const sales = await getSales({
      businessId: req.business.id,
      ...filters,
      limit: pageSize,
      offset: (currentPage - 1) * pageSize
    });

    return res.status(200).json({
      data: {
        sales: sales.map((sale) => ({
          id: Number(sale.id),
          createdAt: sale.created_at,
          username: sale.username,
          location: {
            id: Number(sale.location_id),
            name: sale.location_name,
            code: sale.location_code
          },
          paymentMethod: sale.payment_method,
          subtotal: Number(sale.subtotal),
          total: Number(sale.total),
          amountReceived: Number(sale.amount_received),
          changeAmount: Number(sale.change_amount),
          status: sale.status,
          itemCount: Number(sale.item_count)
        })),
        filters: {
          paymentMethod: filters.paymentMethod,
          status: filters.status,
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
          q: filters.q
        },
        pagination: { page: currentPage, pageSize, totalItems, totalPages }
      }
    });
  } catch (error) {
    return next(error);
  }
}

export async function getSaleDetailsController(req, res, next) {
  const saleId = positiveInteger(req.params.saleId);
  if (!saleId) {
    return validationError(res, [{ field: "saleId", message: "La venta debe ser un entero positivo." }]);
  }

  try {
    const result = await getSaleDetails({ businessId: req.business.id, saleId });
    if (!result) {
      return res.status(404).json({
        error: { code: "SALE_NOT_FOUND", message: "No se encontró la venta solicitada." }
      });
    }

    return res.status(200).json({
      data: {
        sale: {
          id: Number(result.sale.id),
          createdAt: result.sale.created_at,
          username: result.sale.username,
          paymentMethod: result.sale.payment_method,
          subtotal: Number(result.sale.subtotal),
          total: Number(result.sale.total),
          amountReceived: Number(result.sale.amount_received),
          changeAmount: Number(result.sale.change_amount),
          status: result.sale.status,
          location: {
            id: Number(result.sale.location_id),
            name: result.sale.location_name,
            code: result.sale.location_code
          }
        },
        items: result.items.map((item) => ({
          itemId: Number(item.item_id),
          name: item.name,
          sku: item.sku,
          barcode: item.barcode,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unit_price),
          unitCost: item.unit_cost === null ? null : Number(item.unit_cost),
          costTotal: item.unit_cost === null ? null : Number((Number(item.unit_cost) * Number(item.quantity)).toFixed(2)),
          marginTotal: item.unit_cost === null ? null : Number((Number(item.line_total) - (Number(item.unit_cost) * Number(item.quantity))).toFixed(2)),
          lineTotal: Number(item.line_total)
        })),
        movements: result.movements.map((movement) => ({
          id: Number(movement.id),
          movementType: movement.movement_type,
          quantityDelta: Number(movement.quantity_delta),
          location: {
            id: Number(movement.location_id),
            name: movement.location_name,
            code: movement.location_code
          },
          createdAt: movement.created_at,
          reference: movement.reference
        }))
      }
    });
  } catch (error) {
    return next(error);
  }
}

export async function getPosProductsController(req, res, next) {
  const rawLocationId = typeof req.query.locationId === "string" ? req.query.locationId : "";
  const locationId = rawLocationId === "" ? null : positiveInteger(rawLocationId);
  if (rawLocationId !== "" && !locationId) {
    return validationError(res, [{ field: "locationId", message: "La ubicación debe ser un entero positivo." }]);
  }

  try {
    if (locationId !== null && !await getPosLocation(req.business.id, locationId)) {
      return saleError(res, new SaleDomainError("POS_LOCATION_REQUIRED", "Selecciona una ubicación activa.", 400, [{ field: "locationId", message: "Selecciona una ubicación activa." }]));
    }
    const query = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
    const products = await getPosProducts({ businessId: req.business.id, query, locationId, limit: 30 });
    return res.status(200).json({
      data: {
        products: products.map((product) => ({
          id: Number(product.id),
          name: product.name,
          sku: product.sku,
          barcode: product.barcode,
          brand: product.brand,
          price: Number(product.price),
          stock: Number(product.stock),
          locationId: Number(product.location_id)
        })),
        filters: { q: query, locationId }
      }
    });
  } catch (error) {
    return next(error);
  }
}

export async function getPosFormOptionsController(req, res, next) {
  try {
    const options = await getPosFormOptions(req.business.id);
    return res.status(200).json({
      data: {
        locations: options.locations.map((location) => ({
          id: Number(location.id),
          name: location.name,
          code: location.code,
          isDefault: Boolean(location.is_default)
        })),
        defaultLocationId: options.defaultLocationId === null ? null : Number(options.defaultLocationId),
        paymentMethods: options.paymentMethods
      }
    });
  } catch (error) {
    return next(error);
  }
}

export async function createSale(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorList = errors.array();
    if (errorList.some((error) => error.path === "paymentMethod")) {
      return saleError(res, new SaleDomainError("POS_INVALID_PAYMENT", "Selecciona un método de pago válido.", 400, [{ field: "paymentMethod", message: "Selecciona un método de pago válido." }]));
    }
    if (errorList.some((error) => error.path === "locationId")) {
      return saleError(res, new SaleDomainError("POS_LOCATION_REQUIRED", "Selecciona una ubicación activa.", 400, [{ field: "locationId", message: "Selecciona una ubicación activa." }]));
    }
    return validationError(res, errors.array().map((error) => ({ field: error.path, message: error.msg })));
  }

  const data = matchedData(req, { locations: ["body"] });
  const seen = new Set();
  for (const item of data.items) {
    if (seen.has(item.itemId)) {
      return saleError(res, new SaleDomainError("POS_DUPLICATE_ITEM", "No puedes agregar el mismo producto más de una vez.", 400, [{ field: "items", message: "Hay productos duplicados en la venta." }]));
    }
    seen.add(item.itemId);
  }
  if (!PAYMENT_METHODS.has(data.paymentMethod)) {
    return saleError(res, new SaleDomainError("POS_INVALID_PAYMENT", "Selecciona un método de pago válido."));
  }

  try {
    const result = await createPosSale({
      businessId: req.business.id,
      userId: req.session.user.id,
      locationId: data.locationId,
      paymentMethod: data.paymentMethod,
      amountReceived: data.amountReceived,
      items: data.items
    });

    return res.status(201).json({
      data: {
        sale: {
          id: Number(result.sale.id),
          paymentMethod: result.sale.payment_method,
          subtotal: Number(result.sale.subtotal),
          total: Number(result.sale.total),
          amountReceived: Number(result.sale.amount_received),
          changeAmount: Number(result.sale.change_amount),
          status: result.sale.status,
          createdAt: result.sale.created_at,
          location: {
            id: Number(result.location.id),
            name: result.location.name,
            code: result.location.code
          }
        },
        items: result.items
      }
    });
  } catch (error) {
    if (error instanceof SaleDomainError) return saleError(res, error);
    return next(error);
  }
}

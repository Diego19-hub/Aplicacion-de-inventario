import { inventoryOptions, inventoryReport, inventoryExport, movementOptions, movementReport, movementExport } from "../db/reportQueries.js";
import { createCsv } from "../utils/csv.js";

const id = (value) => /^[1-9]\d*$/.test(String(value)) ? Number(value) : null;

export async function inventoryReportApi(req, res, next) {
  try {
    const owner = req.membership.role === "owner";
    const options = await inventoryOptions(req.business.id);
    const categoryId = id(req.query.category);
    const locationId = id(req.query.location);
    const filters = {
      businessId: req.business.id,
      q: typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "",
      categoryId: !categoryId || options.categories.some((category) => Number(category.id) === categoryId) ? categoryId : -1,
      locationId: !locationId || options.locations.some((location) => Number(location.id) === locationId) ? locationId : -1,
      status: owner && ["active", "archived", "all"].includes(req.query.productStatus) ? req.query.productStatus : "active",
      stockRows: ["positive", "all"].includes(req.query.stockRows) ? req.query.stockRows : "positive",
      limit: 25,
      offset: 0
    };
    const initial = await inventoryReport(filters);
    const totalPages = Math.max(1, Math.ceil(initial.count / filters.limit));
    const requested = /^[1-9]\d*$/.test(req.query.page) ? Number(req.query.page) : 1;
    const page = Math.min(requested, totalPages);
    const result = await inventoryReport({ ...filters, offset: (page - 1) * filters.limit });
    return res.status(200).json({ data: { rows: result.rows.map((row) => ({ product: { id: Number(row.id), name: row.name, sku: row.sku, status: row.product_status, category: { id: Number(row.category_id), name: row.category_name } }, location: { id: Number(row.location_id), name: row.location_name, code: row.code, type: row.location_type, status: row.location_status }, localStock: Number(row.local_stock), totalStock: Number(row.total_stock) })), categories: options.categories.map((category) => ({ id: Number(category.id), name: category.name })), locations: options.locations.map((location) => ({ id: Number(location.id), name: location.name, code: location.code })), filters: { q: filters.q, categoryId: filters.categoryId, locationId: filters.locationId, productStatus: filters.status, stockRows: filters.stockRows }, pagination: { page, pageSize: 25, totalItems: Number(result.count), totalPages }, permissions: { canViewArchived: owner } } });
  } catch (error) { return next(error); }
}

export async function movementReportApi(req, res, next) {
  const validDate = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  const dateFrom = req.query.dateFrom || ""; const dateTo = req.query.dateTo || "";
  if ((dateFrom && !validDate(dateFrom)) || (dateTo && !validDate(dateTo)) || (dateFrom && dateTo && dateFrom > dateTo)) return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Revisa los campos enviados.", fields: [{ field: "dateFrom", message: "El rango de fechas no es válido." }] } });
  try {
    const options = await movementOptions(req.business.id); const locationId = id(req.query.location); const userId = id(req.query.user);
    const filters = { businessId: req.business.id, role: req.membership.role, q: typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "", locationId: !locationId ? null : options.locations.some((x) => Number(x.id) === locationId) ? locationId : -1, userId: !userId ? null : options.users.some((x) => Number(x.id) === userId) ? userId : -1, type: ["opening_balance", "entry", "exit", "adjustment", "transfer_out", "transfer_in"].includes(req.query.movementType) ? req.query.movementType : "", dateFrom, dateTo, limit: 25, offset: 0 };
    const initial = await movementReport(filters); const totalPages = Math.max(1, Math.ceil(initial.count / 25)); const requested = /^[1-9]\d*$/.test(req.query.page) ? Number(req.query.page) : 1; const page = Math.min(requested, totalPages); const result = await movementReport({ ...filters, offset: (page - 1) * 25 });
    return res.json({ data: { movements: result.rows.map((row) => ({ id: Number(row.id), createdAt: row.created_at, type: row.movement_type, quantityDelta: Number(row.quantity_delta), previousStock: Number(row.previous_stock), resultingStock: Number(row.resulting_stock), reason: row.reason, reference: row.reference, product: { id: Number(row.item_id), name: row.item_name, sku: row.sku, status: row.product_status }, location: { id: Number(row.location_id), name: row.location_name, code: row.code }, createdBy: { id: Number(row.created_by), username: row.username }, transferId: row.transfer_id === null ? null : Number(row.transfer_id) })), locations: options.locations.map((x) => ({ id: Number(x.id), name: x.name, code: x.code })), users: options.users.map((x) => ({ id: Number(x.id), username: x.username })), filters: { q: filters.q, dateFrom, dateTo, locationId: filters.locationId, userId: filters.userId, movementType: filters.type }, pagination: { page, pageSize: 25, totalItems: Number(result.count), totalPages }, permissions: { canViewArchived: req.membership.role === "owner" } } });
  } catch (error) { return next(error); }
}

export async function inventoryCsvApi(req, res, next) {
  try {
    const owner = req.membership.role === "owner"; const options = await inventoryOptions(req.business.id); const categoryId = id(req.query.category); const locationId = id(req.query.location);
    const rows = await inventoryExport({ businessId: req.business.id, q: typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "", categoryId: !categoryId || options.categories.some((x) => Number(x.id) === categoryId) ? categoryId : -1, locationId: !locationId || options.locations.some((x) => Number(x.id) === locationId) ? locationId : -1, status: owner && ["active", "archived", "all"].includes(req.query.productStatus) ? req.query.productStatus : "active", stockRows: ["positive", "all"].includes(req.query.stockRows) ? req.query.stockRows : "positive" });
    res.set("Content-Type", "text/csv; charset=utf-8"); res.set("Content-Disposition", 'attachment; filename="existencias.csv"'); return res.send(createCsv(["Producto","SKU","Categoría","Ubicación","Código de ubicación","Tipo de ubicación","Estado de ubicación","Stock local","Stock total","Estado del producto"], rows.map((x) => [x.name,x.sku,x.category_name,x.location_name,x.code,x.location_type,x.location_status,x.local_stock,x.total_stock,x.product_status])));
  } catch (error) { return next(error); }
}

export async function movementCsvApi(req, res, next) {
  const validDate = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value); const dateFrom = req.query.dateFrom || ""; const dateTo = req.query.dateTo || "";
  if ((dateFrom && !validDate(dateFrom)) || (dateTo && !validDate(dateTo)) || (dateFrom && dateTo && dateFrom > dateTo)) return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Revisa los campos enviados." } });
  try {
    const options = await movementOptions(req.business.id); const locationId = id(req.query.location); const userId = id(req.query.user); const type = ["opening_balance","entry","exit","adjustment","transfer_out","transfer_in"].includes(req.query.movementType) ? req.query.movementType : "";
    const rows = await movementExport({ businessId:req.business.id, role:req.membership.role, q:typeof req.query.q === "string" ? req.query.q.trim().slice(0,100) : "", locationId:!locationId ? null : options.locations.some((x)=>Number(x.id)===locationId) ? locationId : -1, userId:!userId ? null : options.users.some((x)=>Number(x.id)===userId) ? userId : -1, type, dateFrom, dateTo }); const labels={opening_balance:"Saldo inicial",entry:"Entrada",exit:"Salida",adjustment:"Ajuste",transfer_out:"Transferencia — salida",transfer_in:"Transferencia — entrada"};
    res.set("Content-Type","text/csv; charset=utf-8");res.set("Content-Disposition",'attachment; filename="movimientos.csv"');return res.send(createCsv(["Fecha","Producto","SKU","Ubicación","Código de ubicación","Tipo de movimiento","Cambio","Stock anterior","Stock resultante","Usuario","Motivo","Referencia","ID de transferencia"],rows.map((x)=>[new Date(x.created_at).toISOString(),x.item_name,x.sku,x.location_name,x.code,labels[x.movement_type],x.quantity_delta,x.previous_stock,x.resulting_stock,x.username,x.reason,x.reference,x.transfer_id])));
  } catch (error) { return next(error); }
}

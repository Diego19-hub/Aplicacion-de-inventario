import {
  changeApiSupplierStatus,
  countApiSuppliers,
  createApiSupplier,
  getApiSupplierById,
  getApiSuppliers,
  updateApiSupplier
} from "../db/apiSupplierQueries.js";
import { matchedData, validationResult } from "express-validator";

const PAGE_SIZE = 20;
const SUPPLIER_STATUSES = new Set(["active", "inactive", "all"]);

function positiveInteger(value) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function validationError(res, errors = [{ path: "supplierId", msg: "El proveedor debe ser un entero positivo." }]) {
  return res.status(400).json({
    error: {
      code: "VALIDATION_ERROR",
      message: "Revisa los campos enviados.",
      fields: errors.map((error) => ({ field: error.path, message: error.msg }))
    }
  });
}

function supplierNotFound(res) {
  return res.status(404).json({
    error: {
      code: "SUPPLIER_NOT_FOUND",
      message: "No se encontró el proveedor solicitado."
    }
  });
}

function serializeSupplier(supplier) {
  return {
    id: Number(supplier.id),
    name: supplier.name,
    legalName: supplier.legal_name,
    taxId: supplier.tax_id,
    contactName: supplier.contact_name,
    email: supplier.email,
    phone: supplier.phone,
    address: supplier.address,
    notes: supplier.notes,
    status: supplier.status,
    createdAt: supplier.created_at,
    updatedAt: supplier.updated_at
  };
}

function serializeEditableSupplier(supplier) {
  return {
    name: supplier.name,
    legalName: supplier.legal_name,
    taxId: supplier.tax_id,
    contactName: supplier.contact_name,
    email: supplier.email,
    phone: supplier.phone,
    address: supplier.address,
    notes: supplier.notes
  };
}

function normalizedSupplierData(data) {
  return {
    name: data.name,
    legalName: data.legalName ?? null,
    taxId: data.taxId ?? null,
    contactName: data.contactName ?? null,
    email: data.email ?? null,
    phone: data.phone ?? null,
    address: data.address ?? null,
    notes: data.notes ?? null
  };
}

function duplicateSupplierError(res) {
  return res.status(409).json({
    error: {
      code: "SUPPLIER_ALREADY_EXISTS",
      message: "Ya existe un proveedor con ese nombre.",
      fields: [{ field: "name", message: "Ya existe un proveedor con ese nombre." }]
    }
  });
}

export async function listSuppliers(req, res, next) {
  const query = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
  const requestedStatus = typeof req.query.status === "string" ? req.query.status : "active";
  const status = SUPPLIER_STATUSES.has(requestedStatus) ? requestedStatus : "active";
  const requestedPage = positiveInteger(req.query.page) ?? 1;
  const filters = { businessId: req.business.id, query, status };

  try {
    const totalItems = Number(await countApiSuppliers(filters));
    const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
    const page = Math.min(requestedPage, totalPages);
    const suppliers = await getApiSuppliers({
      ...filters,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE
    });

    return res.status(200).json({
      data: {
        suppliers: suppliers.map(serializeSupplier),
        filters: { q: query, status },
        pagination: { page, pageSize: PAGE_SIZE, totalItems, totalPages }
      }
    });
  } catch (error) {
    return next(error);
  }
}

export async function getSupplierDetails(req, res, next) {
  const supplierId = positiveInteger(req.params.supplierId);
  if (!supplierId) return validationError(res);

  try {
    const supplier = await getApiSupplierById(req.business.id, supplierId);
    if (!supplier) return supplierNotFound(res);
    return res.status(200).json({ data: { supplier: serializeSupplier(supplier) } });
  } catch (error) {
    return next(error);
  }
}

export async function createSupplier(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return validationError(res, errors.array());

  try {
    const supplier = await createApiSupplier(req.business.id, normalizedSupplierData(matchedData(req)));
    return res.status(201).json({ data: { supplier: serializeSupplier(supplier) } });
  } catch (error) {
    if (error.code === "23505") return duplicateSupplierError(res);
    return next(error);
  }
}

export async function getSupplierForEdit(req, res, next) {
  const supplierId = positiveInteger(req.params.supplierId);
  if (!supplierId) return validationError(res);

  try {
    const supplier = await getApiSupplierById(req.business.id, supplierId);
    if (!supplier) return supplierNotFound(res);
    return res.status(200).json({ data: { supplier: serializeEditableSupplier(supplier) } });
  } catch (error) {
    return next(error);
  }
}

export async function updateSupplier(req, res, next) {
  const supplierId = positiveInteger(req.params.supplierId);
  if (!supplierId) return validationError(res);

  const errors = validationResult(req);
  if (!errors.isEmpty()) return validationError(res, errors.array());

  try {
    const supplier = await updateApiSupplier(
      req.business.id,
      supplierId,
      normalizedSupplierData(matchedData(req))
    );
    if (!supplier) return supplierNotFound(res);
    return res.status(200).json({ data: { supplier: serializeSupplier(supplier) } });
  } catch (error) {
    if (error.code === "23505") return duplicateSupplierError(res);
    return next(error);
  }
}

function alreadyInStatus(res, code, message) {
  return res.status(409).json({ error: { code, message } });
}

async function transitionSupplier(req, res, next, { fromStatus, toStatus, alreadyCode, alreadyMessage }) {
  const supplierId = positiveInteger(req.params.supplierId);
  if (!supplierId) return validationError(res);

  try {
    const supplier = await changeApiSupplierStatus(
      req.business.id,
      supplierId,
      fromStatus,
      toStatus
    );
    if (supplier) return res.status(200).json({ data: { supplier: serializeSupplier(supplier) } });

    const existingSupplier = await getApiSupplierById(req.business.id, supplierId);
    if (!existingSupplier) return supplierNotFound(res);
    return alreadyInStatus(res, alreadyCode, alreadyMessage);
  } catch (error) {
    return next(error);
  }
}

export function deactivateSupplier(req, res, next) {
  return transitionSupplier(req, res, next, {
    fromStatus: "active",
    toStatus: "inactive",
    alreadyCode: "SUPPLIER_ALREADY_INACTIVE",
    alreadyMessage: "El proveedor ya está inactivo."
  });
}

export function reactivateSupplier(req, res, next) {
  return transitionSupplier(req, res, next, {
    fromStatus: "inactive",
    toStatus: "active",
    alreadyCode: "SUPPLIER_ALREADY_ACTIVE",
    alreadyMessage: "El proveedor ya está activo."
  });
}

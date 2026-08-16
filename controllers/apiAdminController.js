import {
  adminBusiness,
  adminBusinesses,
  adminDashboard,
  createAdminBusiness,
  getAdminOwnerTransferOptions,
  getAdminBusinessForEdit,
  getAdminBusinessFormOptions,
  getAdminUserById,
  transferAdminBusinessOwner,
  transitionAdminBusinessStatus,
  updateAdminBusiness
} from "../db/apiAdminQueries.js";

const editableFields = new Set([
  "name",
  "slug",
  "legalName",
  "taxId",
  "currency",
  "timezone"
]);
const protectedFields = new Set([
  "id",
  "status",
  "createdBy",
  "updatedAt",
  "owner",
  "ownerUserId",
  "memberships",
  "membership",
  "businessId"
]);

function positiveInteger(value) {
  return /^[1-9]\d*$/.test(String(value)) ? Number(value) : null;
}

function serializeBusiness(business) {
  return {
    id: Number(business.id),
    name: business.name,
    slug: business.slug,
    legalName: business.legal_name,
    taxId: business.tax_id,
    currency: business.currency,
    timezone: business.timezone,
    status: business.status,
    createdAt: business.created_at,
    updatedAt: business.updated_at
  };
}

function serializeBusinessSummary(business) {
  return {
    ...serializeBusiness(business),
    activeMembers: Number(business.active_members),
    activeProducts: Number(business.active_products)
  };
}

function serializeOwner(user) {
  if (!user) return null;

  return {
    id: Number(user.id),
    username: user.username,
    email: user.email
  };
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

function normalizeOptional(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function parseBusinessInput(body, { isCreate }) {
  const fields = [];
  const input = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const allowedFields = new Set(editableFields);
  if (isCreate) allowedFields.add("ownerUserId");

  for (const key of Object.keys(input)) {
    if ((protectedFields.has(key) && !(isCreate && key === "ownerUserId")) || !allowedFields.has(key)) {
      fields.push({ field: key, message: "Este campo no se puede modificar." });
    }
  }

  const name = typeof input.name === "string" ? input.name.trim() : "";
  const slug = typeof input.slug === "string" ? input.slug.trim().toLowerCase() : "";
  const currency = typeof input.currency === "string" ? input.currency.trim().toUpperCase() : "";
  const timezone = typeof input.timezone === "string" ? input.timezone.trim() : "";

  if (name.length < 2 || name.length > 120) {
    fields.push({ field: "name", message: "El nombre comercial debe tener entre 2 y 120 caracteres." });
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 100) {
    fields.push({ field: "slug", message: "El slug solo puede usar minúsculas, números y guiones." });
  }
  if (!/^[A-Z]{3}$/.test(currency)) {
    fields.push({ field: "currency", message: "La moneda debe tener tres letras mayúsculas." });
  }
  if (!timezone) {
    fields.push({ field: "timezone", message: "La zona horaria es obligatoria." });
  } else {
    try {
      Intl.DateTimeFormat("es-MX", { timeZone: timezone });
    } catch {
      fields.push({ field: "timezone", message: "Selecciona una zona horaria válida." });
    }
  }

  const legalName = normalizeOptional(input.legalName);
  const taxId = normalizeOptional(input.taxId)?.toUpperCase() ?? null;
  if (legalName && legalName.length > 255) {
    fields.push({ field: "legalName", message: "La razón social no puede superar 255 caracteres." });
  }
  if (taxId && taxId.length > 100) {
    fields.push({ field: "taxId", message: "La identificación fiscal no puede superar 100 caracteres." });
  }

  let ownerUserId = null;
  if (isCreate) {
    ownerUserId = typeof input.ownerUserId === "number" && Number.isSafeInteger(input.ownerUserId) && input.ownerUserId > 0
      ? input.ownerUserId
      : null;
    if (!ownerUserId) {
      fields.push({ field: "ownerUserId", message: "Selecciona una persona propietaria válida." });
    }
  }

  return {
    fields,
    data: { name, slug, legalName, taxId, currency, timezone },
    ownerUserId
  };
}

function duplicateSlug(res) {
  return res.status(409).json({
    error: {
      code: "BUSINESS_ALREADY_EXISTS",
      message: "Ese slug ya está en uso.",
      fields: [{ field: "slug", message: "Ese slug ya está en uso." }]
    }
  });
}

function ownerTransferConflict(res, code) {
  const messages = {
    BUSINESS_INVALID_STATE: "Solo los negocios activos o suspendidos pueden transferir propiedad.",
    OWNER_ALREADY_ASSIGNED: "La persona seleccionada ya es la propietaria activa del negocio."
  };

  return res.status(409).json({
    error: {
      code,
      message: messages[code]
    }
  });
}

function parseOwnerTransferInput(body) {
  const input = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const fields = [];

  for (const key of Object.keys(input)) {
    if (key !== "newOwnerUserId") {
      fields.push({ field: key, message: "Este campo no se puede modificar." });
    }
  }

  const rawUserId = input.newOwnerUserId;
  const newOwnerUserId = (
    typeof rawUserId === "number"
    && Number.isSafeInteger(rawUserId)
    && rawUserId > 0
  )
    ? rawUserId
    : null;

  if (!newOwnerUserId) {
    fields.push({
      field: "newOwnerUserId",
      message: "Selecciona una persona propietaria válida."
    });
  }

  return {
    fields,
    newOwnerUserId
  };
}

export async function dashboard(req, res, next) {
  try {
    const result = await adminDashboard();
    res.json({
      data: {
        metrics: result.metrics,
        recent: result.recent.map((business) => ({
          id: Number(business.id),
          name: business.name,
          slug: business.slug,
          status: business.status,
          createdAt: business.created_at
        }))
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function businesses(req, res, next) {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
    const status = ["active", "suspended", "archived"].includes(req.query.status)
      ? req.query.status
      : "";
    const firstPage = await adminBusinesses({ q, status, limit: 20, offset: 0 });
    const totalPages = Math.max(1, Math.ceil(firstPage.count / 20));
    const requestedPage = /^[1-9]\d*$/.test(req.query.page) ? Number(req.query.page) : 1;
    const page = Math.min(requestedPage, totalPages);
    const result = await adminBusinesses({ q, status, limit: 20, offset: (page - 1) * 20 });

    res.json({
      data: {
        businesses: result.rows.map(serializeBusinessSummary),
        pagination: { page, pageSize: 20, totalItems: result.count, totalPages },
        filters: { q, status }
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function detail(req, res, next) {
  const businessId = positiveInteger(req.params.businessId);
  if (!businessId) {
    return validationError(res, [{ field: "businessId", message: "El negocio debe ser un entero positivo." }]);
  }

  try {
    const result = await adminBusiness(businessId);
    if (!result) {
      return res.status(404).json({
        error: { code: "BUSINESS_NOT_FOUND", message: "No se encontró el negocio solicitado." }
      });
    }

    const business = result.business;
    res.json({
      data: {
        business: serializeBusiness(business),
        owner: business.owner_id
          ? serializeOwner({
              id: business.owner_id,
              username: business.owner_username,
              email: business.owner_email
            })
          : null,
        metrics: {
          activeMembers: Number(business.active_members),
          activeProducts: Number(business.active_products),
          archivedProducts: Number(business.archived_products),
          activeLocations: Number(business.active_locations),
          totalStock: Number(business.total_stock),
          transfers: Number(business.transfers),
          thresholds: Number(business.thresholds)
        },
        members: result.members.map((member) => ({
          id: Number(member.id),
          username: member.username,
          email: member.email,
          role: member.role,
          status: member.status,
          joinedAt: member.joined_at,
          createdAt: member.created_at
        })),
        recentMovements: result.movements.map((movement) => ({
          id: Number(movement.id),
          createdAt: movement.created_at,
          type: movement.movement_type,
          quantityDelta: Number(movement.quantity_delta),
          product: { name: movement.item_name, sku: movement.sku },
          location: { name: movement.location_name, code: movement.code },
          createdBy: { username: movement.username }
        }))
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function formOptions(req, res, next) {
  try {
    const users = await getAdminBusinessFormOptions();
    return res.status(200).json({
      data: {
        owners: users.map((user) => ({
          id: Number(user.id),
          username: user.username,
          email: user.email
        }))
      }
    });
  } catch (error) {
    return next(error);
  }
}

export async function create(req, res, next) {
  const input = parseBusinessInput(req.body, { isCreate: true });
  if (input.fields.length) return validationError(res, input.fields);

  try {
    if (!await getAdminUserById(input.ownerUserId)) {
      return validationError(res, [{ field: "ownerUserId", message: "No existe la persona propietaria seleccionada." }]);
    }

    const business = await createAdminBusiness(input.data, input.ownerUserId, req.session.user.id);
    return res.status(201).json({
      data: { business: { id: Number(business.id), name: business.name, slug: business.slug, status: business.status } }
    });
  } catch (error) {
    if (error.code === "23505") return duplicateSlug(res);
    return next(error);
  }
}

export async function getEdit(req, res, next) {
  const businessId = positiveInteger(req.params.businessId);
  if (!businessId) {
    return validationError(res, [{ field: "businessId", message: "El negocio debe ser un entero positivo." }]);
  }

  try {
    const business = await getAdminBusinessForEdit(businessId);
    if (!business) {
      return res.status(404).json({
        error: { code: "BUSINESS_NOT_FOUND", message: "No se encontró el negocio solicitado." }
      });
    }
    return res.status(200).json({ data: { business: serializeBusiness(business) } });
  } catch (error) {
    return next(error);
  }
}

export async function ownerOptions(req, res, next) {
  const businessId = positiveInteger(req.params.businessId);
  if (!businessId) {
    return validationError(res, [{ field: "businessId", message: "El negocio debe ser un entero positivo." }]);
  }

  const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";

  try {
    const result = await getAdminOwnerTransferOptions(businessId, q);
    if (!result) {
      return res.status(404).json({
        error: { code: "BUSINESS_NOT_FOUND", message: "No se encontró el negocio solicitado." }
      });
    }

    return res.status(200).json({
      data: {
        business: serializeBusiness(result.business),
        owner: result.business.owner_id
          ? serializeOwner({
              id: result.business.owner_id,
              username: result.business.owner_username,
              email: result.business.owner_email
            })
          : null,
        users: result.users.map((user) => ({
          id: Number(user.id),
          username: user.username,
          email: user.email,
          membership: user.membership_role
            ? {
                role: user.membership_role,
                status: user.membership_status
              }
            : null
        })),
        filters: { q }
      }
    });
  } catch (error) {
    return next(error);
  }
}

export async function update(req, res, next) {
  const businessId = positiveInteger(req.params.businessId);
  if (!businessId) {
    return validationError(res, [{ field: "businessId", message: "El negocio debe ser un entero positivo." }]);
  }
  const input = parseBusinessInput(req.body, { isCreate: false });
  if (input.fields.length) return validationError(res, input.fields);

  try {
    const business = await updateAdminBusiness(businessId, input.data);
    if (!business) {
      return res.status(404).json({
        error: { code: "BUSINESS_NOT_FOUND", message: "No se encontró el negocio solicitado." }
      });
    }
    return res.status(200).json({ data: { business: { id: Number(business.id) } } });
  } catch (error) {
    if (error.code === "23505") return duplicateSlug(res);
    return next(error);
  }
}

export async function changeOwner(req, res, next) {
  const businessId = positiveInteger(req.params.businessId);
  if (!businessId) {
    return validationError(res, [{ field: "businessId", message: "El negocio debe ser un entero positivo." }]);
  }

  const input = parseOwnerTransferInput(req.body);
  if (input.fields.length) {
    return validationError(res, input.fields);
  }

  try {
    const result = await transferAdminBusinessOwner(businessId, input.newOwnerUserId);

    if (result.kind === "business_not_found") {
      return res.status(404).json({
        error: { code: "BUSINESS_NOT_FOUND", message: "No se encontró el negocio solicitado." }
      });
    }

    if (result.kind === "user_not_found") {
      return res.status(404).json({
        error: { code: "USER_NOT_FOUND", message: "No se encontró la persona propietaria seleccionada." }
      });
    }

    if (result.kind === "invalid_business_state") {
      return ownerTransferConflict(res, "BUSINESS_INVALID_STATE");
    }

    if (result.kind === "same_owner") {
      return ownerTransferConflict(res, "OWNER_ALREADY_ASSIGNED");
    }

    return res.status(200).json({
      data: {
        business: serializeBusiness(result.business),
        previousOwner: serializeOwner(result.previousOwner),
        owner: serializeOwner(result.newOwner)
      }
    });
  } catch (error) {
    return next(error);
  }
}

function transitionConflict(res, action, status) {
  const codes = {
    suspend: status === "suspended" ? "BUSINESS_ALREADY_SUSPENDED" : "BUSINESS_INVALID_TRANSITION",
    reactivate: status === "active" ? "BUSINESS_ALREADY_ACTIVE" : "BUSINESS_INVALID_TRANSITION",
    archive: status === "archived" ? "BUSINESS_ALREADY_ARCHIVED" : "BUSINESS_INVALID_TRANSITION"
  };
  const messages = {
    BUSINESS_ALREADY_SUSPENDED: "El negocio ya está suspendido.",
    BUSINESS_ALREADY_ACTIVE: "El negocio ya está activo.",
    BUSINESS_ALREADY_ARCHIVED: "El negocio ya está archivado.",
    BUSINESS_INVALID_TRANSITION: "El negocio no está en un estado válido para esta acción."
  };
  const code = codes[action];
  return res.status(409).json({ error: { code, message: messages[code] } });
}

export async function transition(req, res, next) {
  const businessId = positiveInteger(req.params.businessId);
  const action = req.params.action;
  if (!businessId) {
    return validationError(res, [{ field: "businessId", message: "El negocio debe ser un entero positivo." }]);
  }
  if (!["suspend", "reactivate", "archive"].includes(action)) {
    return validationError(res, [{ field: "action", message: "La acción solicitada no es válida." }]);
  }
  if (req.body && Object.keys(req.body).length > 0) {
    return validationError(res, [{ field: "body", message: "Esta acción no acepta campos adicionales." }]);
  }

  try {
    const result = await transitionAdminBusinessStatus(businessId, action);
    if (result.kind === "not_found") {
      return res.status(404).json({
        error: { code: "BUSINESS_NOT_FOUND", message: "No se encontró el negocio solicitado." }
      });
    }
    if (result.kind === "invalid") return transitionConflict(res, action, result.status);

    return res.status(200).json({
      data: {
        business: {
          id: Number(result.business.id),
          status: result.business.status,
          updatedAt: result.business.updated_at
        }
      }
    });
  } catch (error) {
    return next(error);
  }
}

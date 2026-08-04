import { matchedData, validationResult } from "express-validator";
import AppError from "../utils/AppError.js";
import {
  countBusinesses,
  createBusinessWithOwner,
  findUserByEmail,
  getAdminDashboardStats,
  getBusinessAdminDetails,
  getBusinessesPage,
  updateBusiness,
  updateBusinessStatus
} from "../db/adminQueries.js";

const PAGE_SIZE = 20;
const BUSINESS_STATUSES = new Set(["all", "active", "suspended", "archived"]);

function parseBusinessId(value) {
  const businessId = Number(value);

  if (!Number.isInteger(businessId) || businessId < 1) {
    return null;
  }

  return businessId;
}

function emptyBusinessForm() {
  return {
    name: "",
    slug: "",
    ownerEmail: "",
    legalName: "",
    taxId: "",
    currency: "MXN",
    timezone: "America/Mexico_City"
  };
}

function formDataFromBusiness(business) {
  return {
    name: business.name,
    slug: business.slug,
    legalName: business.legal_name ?? "",
    taxId: business.tax_id ?? "",
    currency: business.currency,
    timezone: business.timezone
  };
}

function formDataFromRequest(body, includeOwner) {
  return {
    name: body.name ?? "",
    slug: body.slug ?? "",
    ...(includeOwner ? { ownerEmail: body.ownerEmail ?? "" } : {}),
    legalName: body.legalName ?? "",
    taxId: body.taxId ?? "",
    currency: body.currency ?? "MXN",
    timezone: body.timezone ?? "America/Mexico_City"
  };
}

async function loadBusinessOrFail(businessId) {
  const business = await getBusinessAdminDetails(businessId);

  if (!business) {
    throw new AppError("Negocio no encontrado.", 404);
  }

  return business;
}

function renderBusinessForm(res, { title, formAction, formData, errors, owner }) {
  return res.render("admin/business-form", {
    title,
    formAction,
    formData,
    errors,
    owner
  });
}

export async function showAdminDashboard(req, res, next) {
  try {
    const stats = await getAdminDashboardStats();
    res.render("admin/dashboard", { title: "Administración", stats });
  } catch (error) {
    next(error);
  }
}

export async function showBusinesses(req, res, next) {
  const search = String(req.query.search ?? "").trim();
  const status = String(req.query.status ?? "all");
  const requestedPage = Number(req.query.page);
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const safeStatus = BUSINESS_STATUSES.has(status) ? status : "all";

  try {
    const [businesses, total] = await Promise.all([
      getBusinessesPage({
        search,
        status: safeStatus,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE
      }),
      countBusinesses({ search, status: safeStatus })
    ]);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    res.render("admin/businesses", {
      title: "Negocios",
      businesses,
      filters: { search, status: safeStatus },
      pagination: {
        page: Math.min(page, totalPages),
        totalPages,
        hasPrevious: page > 1,
        hasNext: page < totalPages
      }
    });
  } catch (error) {
    next(error);
  }
}

export function showCreateBusinessForm(req, res) {
  renderBusinessForm(res, {
    title: "Crear negocio",
    formAction: "/admin/businesses/new",
    formData: emptyBusinessForm(),
    errors: [],
    owner: null
  });
}

export async function createBusiness(req, res, next) {
  const validationErrors = validationResult(req);
  const formData = formDataFromRequest(req.body, true);

  if (!validationErrors.isEmpty()) {
    return res.status(400).render("admin/business-form", {
      title: "Crear negocio",
      formAction: "/admin/businesses/new",
      formData,
      errors: validationErrors.array(),
      owner: null
    });
  }

  const data = matchedData(req);

  try {
    const owner = await findUserByEmail(data.ownerEmail);

    if (!owner) {
      return res.status(400).render("admin/business-form", {
        title: "Crear negocio",
        formAction: "/admin/businesses/new",
        formData,
        errors: [{ path: "ownerEmail", msg: "No existe una cuenta registrada con ese correo." }],
        owner: null
      });
    }

    const business = await createBusinessWithOwner(
      data,
      owner.id,
      req.session.user.id
    );
    res.redirect(`/admin/businesses/${business.id}`);
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).render("admin/business-form", {
        title: "Crear negocio",
        formAction: "/admin/businesses/new",
        formData,
        errors: [{ path: "slug", msg: "Ese slug ya está en uso." }],
        owner: null
      });
    }

    next(error);
  }
}

export async function showBusinessDetails(req, res, next) {
  const businessId = parseBusinessId(req.params.id);

  if (!businessId) {
    return next(new AppError("Negocio no encontrado.", 404));
  }

  try {
    const business = await loadBusinessOrFail(businessId);
    res.render("admin/business-details", { title: business.name, business });
  } catch (error) {
    next(error);
  }
}

export async function showEditBusinessForm(req, res, next) {
  const businessId = parseBusinessId(req.params.id);

  if (!businessId) {
    return next(new AppError("Negocio no encontrado.", 404));
  }

  try {
    const business = await loadBusinessOrFail(businessId);
    renderBusinessForm(res, {
      title: "Editar negocio",
      formAction: `/admin/businesses/${business.id}/edit`,
      formData: formDataFromBusiness(business),
      errors: [],
      owner: { username: business.owner_username, email: business.owner_email }
    });
  } catch (error) {
    next(error);
  }
}

export async function editBusiness(req, res, next) {
  const businessId = parseBusinessId(req.params.id);

  if (!businessId) {
    return next(new AppError("Negocio no encontrado.", 404));
  }

  let existingBusiness;

  try {
    existingBusiness = await loadBusinessOrFail(businessId);
    const owner = {
      username: existingBusiness.owner_username,
      email: existingBusiness.owner_email
    };
    const validationErrors = validationResult(req);
    const formData = formDataFromRequest(req.body, false);

    if (!validationErrors.isEmpty()) {
      return res.status(400).render("admin/business-form", {
        title: "Editar negocio",
        formAction: `/admin/businesses/${businessId}/edit`,
        formData,
        errors: validationErrors.array(),
        owner
      });
    }

    const business = await updateBusiness(businessId, matchedData(req));

    if (!business) {
      return next(new AppError("Negocio no encontrado.", 404));
    }

    res.redirect(`/admin/businesses/${business.id}`);
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).render("admin/business-form", {
        title: "Editar negocio",
        formAction: `/admin/businesses/${businessId}/edit`,
        formData,
        errors: [{ path: "slug", msg: "Ese slug ya está en uso." }],
        owner: {
          username: existingBusiness.owner_username,
          email: existingBusiness.owner_email
        }
      });
    }

    next(error);
  }
}

export async function showStatusConfirmation(req, res, next) {
  const businessId = parseBusinessId(req.params.id);
  const action = req.params.action;

  if (!businessId || !["suspend", "reactivate"].includes(action)) {
    return next(new AppError("Solicitud administrativa inválida.", 400));
  }

  try {
    const business = await loadBusinessOrFail(businessId);
    const expectedStatus = action === "suspend" ? "active" : "suspended";

    if (business.status !== expectedStatus) {
      return next(new AppError("El negocio no está en un estado válido para esta acción.", 409));
    }

    res.render("admin/business-status", { title: "Confirmar acción", business, action });
  } catch (error) {
    next(error);
  }
}

export async function changeBusinessStatus(req, res, next) {
  const businessId = parseBusinessId(req.params.id);
  const action = req.params.action;

  if (!businessId || !["suspend", "reactivate"].includes(action)) {
    return next(new AppError("Solicitud administrativa inválida.", 400));
  }

  const fromStatus = action === "suspend" ? "active" : "suspended";
  const toStatus = action === "suspend" ? "suspended" : "active";

  try {
    const business = await updateBusinessStatus(businessId, fromStatus, toStatus);

    if (!business) {
      const existingBusiness = await getBusinessAdminDetails(businessId);

      if (!existingBusiness) {
        return next(new AppError("Negocio no encontrado.", 404));
      }

      return next(new AppError("El negocio no está en un estado válido para esta acción.", 409));
    }

    res.redirect(`/admin/businesses/${business.id}`);
  } catch (error) {
    next(error);
  }
}

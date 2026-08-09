import {
  inventoryOptions,
  inventoryReport,
  movementOptions,
  movementReport,
} from "../db/reportQueries.js";

const id = (value) => (/^[1-9]\d*$/.test(value) ? Number(value) : null);

export async function dashboard(req, res, next) {
  try {
    res.render("reports/index", { title: "Reportes" });
  } catch (error) {
    next(error);
  }
}

export async function inventory(req, res, next) {
  try {
    const owner = req.membership.role === "owner",
      q =
        typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "",
      categoryId = id(req.query.category),
      locationId = id(req.query.location),
      status =
        owner && ["active", "archived", "all"].includes(req.query.productStatus)
          ? req.query.productStatus
          : "active",
      stockRows = ["positive", "all"].includes(req.query.stockRows)
        ? req.query.stockRows
        : "positive",
      requested = /^[1-9]\d*$/.test(req.query.page)
        ? Number(req.query.page)
        : 1,
      options = await inventoryOptions(req.business.id),
      f = {
        businessId: req.business.id,
        q,
        categoryId:
          !categoryId || options.categories.some((x) => x.id === categoryId)
            ? categoryId
            : -1,
        locationId:
          !locationId || options.locations.some((x) => x.id === locationId)
            ? locationId
            : -1,
        status,
        stockRows,
        limit: 25,
        offset: 0,
      };
    let result = await inventoryReport(f),
      pages = Math.max(1, Math.ceil(result.count / 25)),
      page = Math.min(requested, pages);
    result = await inventoryReport({ ...f, offset: (page - 1) * 25 });
    res.render("reports/inventory", {
      title: "Existencias",
      ...result,
      ...options,
      filters: { q, categoryId, locationId, status, stockRows, page },
      pages,
    });
  } catch (error) {
    next(error);
  }
}

export async function movements(req, res, next) {
  try {
    const validDate = (v) =>
        typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v),
      dateFrom = req.query.dateFrom || "",
      dateTo = req.query.dateTo || "";
    if (
      (dateFrom && !validDate(dateFrom)) ||
      (dateTo && !validDate(dateTo)) ||
      (dateFrom && dateTo && dateFrom > dateTo)
    )
      return res
        .status(400)
        .render("reports/movements", {
          title: "Movimientos",
          rows: [],
          count: 0,
          users: [],
          locations: [],
          pages: 1,
          error: "Rango de fechas inválido.",
          filters: {},
        });
    const options = await movementOptions(req.business.id),
      q =
        typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "",
      locationId = id(req.query.location),
      userId = id(req.query.user),
      type = [
        "opening_balance",
        "entry",
        "exit",
        "adjustment",
        "transfer_out",
        "transfer_in",
      ].includes(req.query.movementType)
        ? req.query.movementType
        : "",
      requested = /^[1-9]\d*$/.test(req.query.page)
        ? Number(req.query.page)
        : 1,
      f = {
        businessId: req.business.id,
        role: req.membership.role,
        q,
        locationId: !locationId
          ? null
          : options.locations.some((x) => x.id === locationId)
            ? locationId
            : -1,
        userId: !userId
          ? null
          : options.users.some((x) => x.id === userId)
            ? userId
            : -1,
        type,
        dateFrom,
        dateTo,
        limit: 25,
        offset: 0,
      };
    let result = await movementReport(f),
      pages = Math.max(1, Math.ceil(result.count / 25)),
      page = Math.min(requested, pages);
    result = await movementReport({ ...f, offset: (page - 1) * 25 });
    res.render("reports/movements", {
        isOwner: req.membership.role === "owner",
      title: "Movimientos",
      ...result,
      ...options,
      pages,
      filters: { q, locationId, userId, type, dateFrom, dateTo, page },
      error: null,
    });
  } catch (error) {
    next(error);
  }
}

import { matchedData, validationResult } from "express-validator";
import AppError from "../utils/AppError.js";
import { deleteStockThreshold, getItemThresholdConfiguration, getStockAlertOptions, getStockAlerts, upsertStockThreshold } from "../db/alertQueries.js";

const positiveId = (value) => /^[1-9]\d*$/.test(value) ? Number(value) : null;
const pageValue = (value) => /^[1-9]\d*$/.test(value) ? Number(value) : 1;

export async function showStockAlerts(req, res, next) {
  try {
    const options = await getStockAlertOptions(req.business.id);
    const categoryId = positiveId(req.query.category);
    const locationId = positiveId(req.query.location);
    const filters = {
      businessId: req.business.id,
      q: typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "",
      categoryId: !categoryId || options.categories.some((x) => x.id === categoryId) ? categoryId : -1,
      locationId: !locationId || options.locations.some((x) => x.id === locationId) ? locationId : -1,
      alertStatus: ["all", "out_of_stock", "low_stock"].includes(req.query.alertStatus) ? req.query.alertStatus : "all",
      limit: 25,
      offset: 0
    };
    let result = await getStockAlerts(filters);
    const pages = Math.max(1, Math.ceil(result.count / 25));
    const page = Math.min(pageValue(req.query.page), pages);
    result = await getStockAlerts({ ...filters, offset: (page - 1) * 25 });
    res.render("alerts/index", { title: "Alertas de stock", ...result, ...options, filters: { ...filters, page }, pages, canManageThresholds: ["owner", "manager"].includes(req.membership.role) });
  } catch (error) { next(error); }
}

export async function showThresholdConfiguration(req, res, next) {
  try {
    const itemId = positiveId(req.params.itemId);
    const configuration = itemId && await getItemThresholdConfiguration(req.business.id, itemId);
    if (!configuration) return next(new AppError("Producto no encontrado", 404));
    res.render("alerts/configure", { title: "Configurar umbrales", item: configuration.item, locations: configuration.locations, errors: [], formData: {} });
  } catch (error) { next(error); }
}

export async function saveStockThreshold(req, res, next) {
  try {
    const itemId = positiveId(req.params.itemId);
    const configuration = itemId && await getItemThresholdConfiguration(req.business.id, itemId);
    if (!configuration) return next(new AppError("Producto no encontrado", 404));
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).render("alerts/configure", { title: "Configurar umbrales", item: configuration.item, locations: configuration.locations, errors: errors.array(), formData: req.body });
    const threshold = await upsertStockThreshold({ businessId: req.business.id, itemId, createdBy: req.session.user.id, ...matchedData(req) });
    if (!threshold) return next(new AppError("Producto o ubicación no encontrados", 404));
    res.redirect(`/alerts/products/${itemId}/thresholds`);
  } catch (error) { next(error); }
}

export async function removeStockThreshold(req, res, next) {
  try {
    const itemId = positiveId(req.params.itemId), locationId = positiveId(req.params.locationId);
    if (!itemId || !locationId) return next(new AppError("Umbral no encontrado", 404));
    const threshold = await deleteStockThreshold(req.business.id, itemId, locationId);
    if (!threshold) return next(new AppError("Umbral no encontrado", 404));
    res.redirect(`/alerts/products/${itemId}/thresholds`);
  } catch (error) { next(error); }
}

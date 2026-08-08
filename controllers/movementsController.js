import { matchedData, validationResult } from "express-validator";
import AppError from "../utils/AppError.js";
import { getItemById, getArchivedItemById } from "../db/queries.js";
import { countMovements, getMovementHistory, recordMovement } from "../db/movementQueries.js";

const PER_PAGE = 25;
const itemId = (value) => { const id = Number(value); return Number.isInteger(id) && id > 0 ? id : null; };
const safePage = (value) => typeof value === "string" && /^[1-9]\d{0,5}$/.test(value) ? Number(value) : 1;
async function renderHistory(req, res, next, archived) {
  const id = itemId(req.params.id); if (!id) return next(new AppError("Producto no encontrado", 404));
  try { const item = archived ? await getArchivedItemById(id, req.business.id) : await getItemById(id, req.business.id); if (!item) return next(new AppError("Producto no encontrado", 404)); const total = await countMovements(req.business.id, id); const totalPages = Math.max(1, Math.ceil(total / PER_PAGE)); const page = Math.min(safePage(req.query.page), totalPages); const movements = await getMovementHistory({ businessId: req.business.id, itemId: id, limit: PER_PAGE, offset: (page - 1) * PER_PAGE }); res.render("items/movements", { title: "Movimientos", item, movements, archived, page, totalPages, total }); } catch (error) { next(error); }
}
export const showMovements = (req, res, next) => renderHistory(req, res, next, false);
export const showArchivedMovements = (req, res, next) => renderHistory(req, res, next, true);
export async function showMovementForm(req, res, next) { const id = itemId(req.params.id); if (!id) return next(new AppError("Producto no encontrado", 404)); try { const item = await getItemById(id, req.business.id); if (!item) return next(new AppError("Producto no encontrado", 404)); res.render("items/movement-form", { title: "Registrar movimiento", item, errors: [], formData: { movementType: "entry", quantity: "", reason: "", reference: "" } }); } catch (error) { next(error); } }
export async function addMovement(req, res, next) { const id = itemId(req.params.id); if (!id) return next(new AppError("Producto no encontrado", 404)); try { const item = await getItemById(id, req.business.id); if (!item) return next(new AppError("Producto no encontrado", 404)); const errors = validationResult(req); if (!errors.isEmpty()) return res.status(400).render("items/movement-form", { title: "Registrar movimiento", item, errors: errors.array(), formData: req.body }); const movement = await recordMovement({ businessId: req.business.id, itemId: id, userId: req.session.user.id, ...matchedData(req) }); if (movement.error === "not_found") return next(new AppError("Producto no encontrado", 404)); if (movement.error === "negative_stock" || movement.error === "same_stock") return res.status(400).render("items/movement-form", { title: "Registrar movimiento", item, errors: [{ path: "quantity", msg: movement.error === "same_stock" ? "El ajuste coincide con el stock actual." : "La salida no puede dejar existencias negativas." }], formData: req.body }); res.redirect(`/items/${id}/movements`); } catch (error) { next(error); } }

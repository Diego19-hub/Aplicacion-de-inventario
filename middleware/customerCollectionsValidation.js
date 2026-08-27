import { body } from "express-validator";

const text = (field, max) => body(field).optional({ values: "undefined" }).customSanitizer((v) => v === null || v === "" ? null : String(v).trim()).isLength({ max }).withMessage(`El campo ${field} es demasiado largo.`);
export const customerValidation = [body("name").isString().trim().isLength({ min: 1, max: 160 }).withMessage("El nombre es obligatorio."), text("phone", 40), text("email", 254), text("address", 300), text("notes", 1000)];
export const customerStatusValidation = [body("status").isIn(["active", "inactive", "suspended"]).withMessage("Estado inválido.")];
export const chargeValidation = [body("customerId").isInt({ min: 1 }), body("concept").isString().trim().isLength({ min: 1, max: 200 }), body("amount").isFloat({ gt: 0 }).toFloat(), body("frequency").isIn(["weekly", "biweekly", "monthly", "one_time"]), body("dueDate").isISO8601().toDate(), text("notes", 1000)];
export const chargeStatusValidation = [body("status").isIn(["pending", "partially_paid", "paid", "overdue", "cancelled"]).withMessage("Estado inválido.")];
export const paymentValidation = [body("customerId").isInt({ min: 1 }), body("chargeId").optional({ values: "null" }).isInt({ min: 1 }).toInt(), body("amount").isFloat({ gt: 0 }).toFloat(), body("paymentMethod").isIn(["cash", "transfer", "card", "other"]), text("notes", 1000)];
export const cancellationValidation = [body("cancellationReason").isString().trim().isLength({ min: 1, max: 500 }).withMessage("El motivo de cancelación es obligatorio.")];

import { body, param } from "express-validator";

const MAX_AMOUNT = 999999999999.99;

function validAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 && amount <= MAX_AMOUNT;
}

function validPositiveAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 && amount <= MAX_AMOUNT;
}

export const cashRegisterValidation = [
  body("locationId").isInt({ min: 1 }).withMessage("La ubicación debe ser un entero positivo.").toInt(),
  body("name").isString().trim().isLength({ min: 1, max: 120 }).withMessage("El nombre de la caja es obligatorio.")
];

export const cashSessionOpenValidation = [
  body("registerId").isInt({ min: 1 }).withMessage("La caja debe ser un entero positivo.").toInt(),
  body("openingAmount").custom(validAmount).withMessage("El fondo inicial debe ser un número no negativo válido.").toFloat()
];

export const cashMovementValidation = [
  param("sessionId").isInt({ min: 1 }).withMessage("La sesión debe ser un entero positivo.").toInt(),
  body("movementType").isIn(["cash_in", "cash_out"]).withMessage("El tipo de movimiento no es válido."),
  body("amount").custom(validPositiveAmount).withMessage("El importe debe ser mayor que cero.").toFloat(),
  body("reason").isString().trim().isLength({ min: 1, max: 500 }).withMessage("El motivo es obligatorio.")
];

export const cashSessionCloseValidation = [
  param("sessionId").isInt({ min: 1 }).withMessage("La sesión debe ser un entero positivo.").toInt(),
  body("closingAmount").custom(validAmount).withMessage("El cierre debe ser un número no negativo válido.").toFloat()
];


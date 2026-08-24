import { body } from "express-validator";

const COST_TYPES = ["fixed", "variable"];
const FREQUENCIES = ["monthly", "yearly", "one_time"];

const nameValidation = body("name")
  .isString()
  .withMessage("El nombre del costo es obligatorio.")
  .trim()
  .isLength({ min: 1, max: 150 })
  .withMessage("El nombre debe tener entre 1 y 150 caracteres.");

const descriptionValidation = body("description")
  .optional({ values: "undefined" })
  .custom((value) => value === null || typeof value === "string")
  .withMessage("La descripción no tiene un formato válido.")
  .customSanitizer((value) => value === null || value === "" ? null : value.trim())
  .custom((value) => value === null || value.length <= 500)
  .withMessage("La descripción debe tener hasta 500 caracteres.");

const amountValidation = body("amount")
  .custom((value) => Number.isFinite(Number(value)) && Number(value) > 0 && Number(value) <= 9999999999.99)
  .withMessage("El importe debe ser mayor que cero.")
  .customSanitizer((value) => Number(value));

export const businessCostValidation = [
  nameValidation,
  descriptionValidation,
  amountValidation,
  body("costType")
    .isIn(COST_TYPES)
    .withMessage("El tipo de costo debe ser fixed o variable."),
  body("frequency")
    .isIn(FREQUENCIES)
    .withMessage("La frecuencia debe ser monthly, yearly u one_time.")
];

export const businessCostStatusValidation = [
  body("isActive")
    .isBoolean()
    .withMessage("isActive debe ser un valor booleano.")
    .toBoolean()
];

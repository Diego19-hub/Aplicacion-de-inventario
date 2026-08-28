import { body } from "express-validator";

const COST_TYPES = ["fixed", "variable"];
const CATEGORIES = ["labor", "logistics", "rent", "utilities", "supplies", "maintenance", "marketing", "software", "commissions", "taxes", "banking", "other", "custom"];
const FREQUENCIES = ["weekly", "monthly", "yearly", "one_time"];

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

const dateValidation = (field, label) => body(field)
  .optional({ values: "undefined" })
  .isISO8601({ strict: true, strictSeparator: true })
  .withMessage(`La ${label} debe ser una fecha válida.`)
  .toDate();

const notesValidation = body("notes")
  .optional({ values: "undefined" })
  .custom((value) => value === null || typeof value === "string")
  .withMessage("Las notas no tienen un formato válido.")
  .customSanitizer((value) => value === null || value === "" ? null : value.trim())
  .custom((value) => value === null || value.length <= 1000)
  .withMessage("Las notas deben tener hasta 1000 caracteres.");

const customCategoryValidation = body("customCategoryName")
  .optional({ values: "undefined" })
  .custom((value, { req }) => req.body.category !== "custom" || (typeof value === "string" && value.trim().length >= 1 && value.trim().length <= 100))
  .withMessage("Escribe el nombre de la categoría personalizada (máximo 100 caracteres).")
  .customSanitizer((value) => typeof value === "string" ? value.trim() : null);

export const businessCostValidation = [
  nameValidation,
  descriptionValidation,
  amountValidation,
  body("category").optional().isIn(CATEGORIES).withMessage("La categoría debe ser labor o logistics."),
  customCategoryValidation,
  body("costType")
    .isIn(COST_TYPES)
    .withMessage("El tipo de costo debe ser fixed o variable."),
  body("frequency")
    .isIn(FREQUENCIES)
    .withMessage("La frecuencia debe ser weekly, monthly, yearly u one_time."),
  dateValidation("startDate", "fecha de inicio"),
  dateValidation("endDate", "fecha de fin"),
  notesValidation
];

export const businessCostStatusValidation = [
  body("isActive")
    .isBoolean()
    .withMessage("isActive debe ser un valor booleano.")
    .toBoolean()
];

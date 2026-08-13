import { body, param } from "express-validator";

export const stockThresholdValidation = [
  body("locationId").isInt({ min: 1 }).withMessage("Selecciona una ubicación válida.").toInt(),
  body("minimumStock").isInt({ min: 0, max: 1000000 }).withMessage("El stock mínimo debe ser un entero entre 0 y 1,000,000.").toInt()
];

const protectedFields = ["businessId", "createdBy", "itemId", "locationId", "id", "createdAt", "updatedAt"];
export const apiThresholdValidation = [
  param("productId").isInt({ min: 1 }).withMessage("El producto debe ser un entero positivo."),
  param("locationId").isInt({ min: 1 }).withMessage("La ubicación debe ser un entero positivo."),
  body("minimumStock").isInt({ min: 0, max: 1000000 }).withMessage("El stock mínimo debe ser un entero entre 0 y 1,000,000.").toInt(),
  ...protectedFields.map((field) => body(field).not().exists().withMessage("No se permite modificar este campo."))
];

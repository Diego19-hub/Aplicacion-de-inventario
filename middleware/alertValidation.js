import { body } from "express-validator";

export const stockThresholdValidation = [
  body("locationId").isInt({ min: 1 }).withMessage("Selecciona una ubicación válida.").toInt(),
  body("minimumStock").isInt({ min: 0, max: 1000000 }).withMessage("El stock mínimo debe ser un entero entre 0 y 1,000,000.").toInt()
];

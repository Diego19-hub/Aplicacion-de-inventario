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
  body("maximumStock").optional({ nullable: true }).isInt({ min: 0, max: 1000000 }).withMessage("El stock máximo debe ser un entero válido.").toInt(),
  body("suggestedReplenishment").optional({ nullable: true }).isInt({ min: 0, max: 1000000 }).withMessage("La cantidad sugerida debe ser un entero válido.").toInt(),
  body("preferredSupplierId").optional({ nullable: true }).isInt({ min: 1 }).withMessage("El proveedor no es válido.").toInt(),
  body("alertEnabled").optional().isBoolean().withMessage("El estado de la alerta no es válido.").toBoolean(),
  body("maximumStock").custom((value, { req }) => value == null || Number(value) >= Number(req.body.minimumStock)).withMessage("El stock máximo debe ser mayor o igual al mínimo."),
  ...protectedFields.map((field) => body(field).not().exists().withMessage("No se permite modificar este campo."))
];

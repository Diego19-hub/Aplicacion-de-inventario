import { body } from "express-validator";
import { normalizeSku } from "../utils/sku.js";

export const itemValidation = [
  body("sku")
    .customSanitizer(normalizeSku)
    .custom((sku, { req }) => {
      if (sku === "" && !req.params.id) return true;
      if (sku === "") {
        throw new Error("El SKU es obligatorio al editar un producto.");
      }
      if (sku.length > 64 || !/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(sku)) {
        throw new Error("El SKU debe tener hasta 64 caracteres: letras, números y guiones simples.");
      }
      return true;
    }),
  body("name")
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("El nombre debe tener entre 2 y 100 caracteres."),
  body("brand")
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("La marca debe tener entre 2 y 50 caracteres."),
  body("description")
    .trim()
    .isLength({ min: 10, max: 1000 })
    .withMessage("La descripción debe tener entre 10 y 1000 caracteres."),
  body("price")
    .isFloat({ min: 0, max: 99999999.99 })
    .withMessage("El precio debe ser un número válido mayor o igual a 0.")
    .toFloat(),
  body("categoryId")
    .isInt({ min: 1 })
    .withMessage("Selecciona una categoría válida.")
    .toInt()
];

export const movementValidation = [
  body("movementType").isIn(["entry", "exit", "adjustment"]).withMessage("Selecciona un tipo de movimiento válido."),
  body("quantity").isInt({ min: 0, max: 1000000 }).withMessage("La cantidad debe ser un entero no negativo.").toInt().custom((quantity, { req }) => {
    if (["entry", "exit"].includes(req.body.movementType) && quantity < 1) throw new Error("La entrada o salida debe ser mayor a cero.");
    return true;
  }),
  body("reason").trim().isLength({ min: 5, max: 500 }).withMessage("El motivo debe tener entre 5 y 500 caracteres."),
  body("reference").optional({ values: "falsy" }).trim().isLength({ min: 1, max: 120 }).withMessage("La referencia debe tener hasta 120 caracteres.")
];

export const archiveItemValidation = [
  body("archiveReason")
    .trim()
    .isLength({ min: 5, max: 500 })
    .withMessage("El motivo de archivado debe tener entre 5 y 500 caracteres.")
];

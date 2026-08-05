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
  body("stock")
    .isInt({ min: 0, max: 1000000 })
    .withMessage("Las existencias deben ser un número entero entre 0 y 1000000.")
    .toInt(),
  body("categoryId")
    .isInt({ min: 1 })
    .withMessage("Selecciona una categoría válida.")
    .toInt()
];

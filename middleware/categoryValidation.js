import { body } from "express-validator";

export const categoryValidation = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("El nombre de la categoría es obligatorio.")
    .isLength({ min: 2, max: 50 })
    .withMessage("El nombre debe tener entre 2 y 50 caracteres."),

  body("description")
    .trim()
    .notEmpty()
    .withMessage("La descripción es obligatoria.")
    .isLength({ min: 10, max: 500 })
    .withMessage("La descripción debe tener entre 10 y 500 caracteres.")
];
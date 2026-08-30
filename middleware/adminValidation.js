import { body } from "express-validator";

import { normalizeEmail } from "../utils/email.js";

function normalizeSlug(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeTaxId(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function validTimezone(value) {
  try {
    Intl.DateTimeFormat("es-MX", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const commonBusinessValidation = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("El nombre comercial es obligatorio.")
    .isLength({ min: 2, max: 120 })
    .withMessage("El nombre comercial debe tener entre 2 y 120 caracteres."),
  body("slug")
    .customSanitizer(normalizeSlug)
    .matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .withMessage("El slug solo puede usar minúsculas, números y guiones.")
    .isLength({ max: 100 })
    .withMessage("El slug no puede superar 100 caracteres."),
  body("legalName")
    .optional({ values: "falsy" })
    .trim()
    .isLength({ max: 255 })
    .withMessage("La razón social no puede superar 255 caracteres."),
  body("taxId")
    .customSanitizer(normalizeTaxId)
    .optional({ values: "falsy" })
    .isLength({ max: 100 })
    .withMessage("La identificación fiscal no puede superar 100 caracteres."),
  body("currency")
    .trim()
    .toUpperCase()
    .matches(/^[A-Z]{3}$/)
    .withMessage("La moneda debe tener tres letras mayúsculas."),
  body("timezone")
    .trim()
    .notEmpty()
    .withMessage("La zona horaria es obligatoria.")
    .custom(validTimezone)
    .withMessage("Selecciona una zona horaria válida.")
];

export const createBusinessValidation = [
  ...commonBusinessValidation,
  body("ownerEmail")
    .trim()
    .isEmail()
    .withMessage("Introduce el correo del propietario registrado.")
    .customSanitizer(normalizeEmail)
];

export const editBusinessValidation = commonBusinessValidation;

export const onboardingBusinessValidation = commonBusinessValidation;

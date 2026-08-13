import { body } from "express-validator";
const optional = (field, max) => body(field).trim().customSanitizer(v => v || null).optional({ values: "null" }).isLength({ max });
export const supplierValidation = [body("name").trim().isLength({min:2,max:120}).withMessage("El nombre comercial debe tener entre 2 y 120 caracteres."), optional("legalName",255), optional("taxId",40).customSanitizer(v=>v?.toUpperCase()).matches(/^[A-Z0-9._/-]+$/).withMessage("La identificación fiscal no tiene un formato válido."), optional("contactName",120), optional("email",254).isEmail().withMessage("El correo no es válido.").normalizeEmail(), optional("phone",40).matches(/^[0-9+() .-]+$/).withMessage("El teléfono no es válido."), optional("address",500), optional("notes",1000)];

const apiOptional = (field, max) => body(field)
  .optional({ values: "undefined" })
  .trim()
  .customSanitizer((value) => value || null)
  .optional({ values: "null" })
  .isLength({ max })
  .withMessage(`El campo no puede superar ${max} caracteres.`);

const protectedFields = ["id", "businessId", "status", "createdAt", "updatedAt"];

export const apiSupplierValidation = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("El nombre comercial es obligatorio.")
    .isLength({ min: 2, max: 120 })
    .withMessage("El nombre comercial debe tener entre 2 y 120 caracteres."),
  apiOptional("legalName", 255),
  apiOptional("taxId", 40)
    .customSanitizer((value) => value?.toUpperCase())
    .matches(/^[A-Z0-9._/-]+$/)
    .withMessage("La identificación fiscal no tiene un formato válido."),
  apiOptional("contactName", 120),
  apiOptional("email", 254)
    .isEmail()
    .withMessage("El correo no es válido.")
    .normalizeEmail(),
  apiOptional("phone", 40)
    .matches(/^[0-9+() .-]+$/)
    .withMessage("El teléfono no es válido."),
  apiOptional("address", 500),
  apiOptional("notes", 1000),
  ...protectedFields.map((field) => body(field)
    .not()
    .exists()
    .withMessage("No se permite modificar este campo."))
];

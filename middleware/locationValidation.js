import { body } from "express-validator";
const optional=(field,max)=>body(field).trim().customSanitizer(v=>v||null).optional({values:"null"}).isLength({max});
export const locationValidation=[body("name").trim().isLength({min:2,max:120}).withMessage("El nombre debe tener entre 2 y 120 caracteres."),body("code").trim().customSanitizer(v=>v.toUpperCase()).matches(/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/).isLength({min:2,max:30}).withMessage("El código debe tener 2 a 30 caracteres: letras, números y guiones."),body("locationType").isIn(["branch","warehouse"]).withMessage("Selecciona un tipo válido."),optional("address",500),optional("phone",40),optional("notes",1000)];

const apiOptional = (field, max) => body(field)
  .optional({ values: "undefined" })
  .trim()
  .customSanitizer((value) => value || null)
  .optional({ values: "null" })
  .isLength({ max })
  .withMessage(`El campo no puede superar ${max} caracteres.`);

const protectedFields = [
  "id",
  "businessId",
  "status",
  "isDefault",
  "createdAt",
  "updatedAt",
  "balances"
];

export const apiLocationValidation = [
  body("name")
    .trim()
    .isLength({ min: 2, max: 120 })
    .withMessage("El nombre debe tener entre 2 y 120 caracteres."),
  body("code")
    .trim()
    .customSanitizer((value) => value.toUpperCase())
    .matches(/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/)
    .isLength({ min: 2, max: 30 })
    .withMessage("El código debe tener 2 a 30 caracteres: letras, números y guiones."),
  body("locationType")
    .isIn(["branch", "warehouse"])
    .withMessage("Selecciona un tipo válido."),
  apiOptional("address", 500),
  apiOptional("phone", 40),
  apiOptional("notes", 1000),
  ...protectedFields.map((field) => body(field)
    .not()
    .exists()
    .withMessage("No se permite modificar este campo."))
];

import { body } from "express-validator";

export const registerValidation = [
  body("username")
    .trim()
    .notEmpty()
    .withMessage("El nombre de usuario es obligatorio.")
    .isLength({ min: 3, max: 30 })
    .withMessage("El usuario debe tener entre 3 y 30 caracteres.")
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage(
      "El usuario solamente puede contener letras, números y guion bajo."
    ),

  body("email")
    .trim()
    .notEmpty()
    .withMessage("El correo es obligatorio.")
    .isEmail()
    .withMessage("Introduce un correo electrónico válido.")
    .normalizeEmail(),

  body("password")
    .notEmpty()
    .withMessage("La contraseña es obligatoria.")
    .isLength({ min: 8, max: 64 })
    .withMessage("La contraseña debe tener entre 8 y 64 caracteres.")
    .custom((password) => {
      if (Buffer.byteLength(password, "utf8") > 72) {
        throw new Error("La contraseña es demasiado larga.");
      }

      return true;
    }),

  body("confirmPassword")
    .notEmpty()
    .withMessage("Confirma tu contraseña.")
    .custom((confirmPassword, { req }) => {
      if (confirmPassword !== req.body.password) {
        throw new Error("Las contraseñas no coinciden.");
      }

      return true;
    })
];

export const loginValidation = [
  body("identifier")
    .trim()
    .notEmpty()
    .withMessage("Introduce tu usuario o correo electrónico."),

  body("password")
    .notEmpty()
    .withMessage("Introduce tu contraseña.")
];
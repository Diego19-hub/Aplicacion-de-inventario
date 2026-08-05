import { body, param } from "express-validator";

export const invitationValidation = [
  body("email").trim().isEmail().withMessage("Introduce un correo electrónico válido.").normalizeEmail(),
  body("role").isIn(["manager", "viewer"]).withMessage("Selecciona un rol válido.")
];

export const memberActionValidation = [
  param("membershipId").isInt({ min: 1 }).withMessage("El miembro no es válido.")
];

export const memberRoleValidation = [
  ...memberActionValidation,
  body("role").isIn(["manager", "viewer"]).withMessage("Selecciona un rol válido.")
];

export const invitationActionValidation = [
  param("invitationId").isInt({ min: 1 }).withMessage("La invitación no es válida.")
];

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

const protectedInvitationFields = [
  "id",
  "businessId",
  "invitedBy",
  "status",
  "token",
  "tokenHash",
  "expiresAt",
  "acceptedAt"
];

export const apiInvitationValidation = [
  body("email")
    .trim()
    .isEmail()
    .withMessage("Introduce un correo electrónico válido.")
    .normalizeEmail(),
  body("offeredRole")
    .isIn(["manager", "viewer"])
    .withMessage("Selecciona un rol válido."),
  ...protectedInvitationFields.map((field) => body(field)
    .not()
    .exists()
    .withMessage("No se permite modificar este campo."))
];

export const apiInvitationActionValidation = [
  param("invitationId")
    .isInt({ min: 1 })
    .withMessage("La invitación debe ser un entero positivo.")
];

const protectedMemberFields = [
  "businessId", "userId", "status", "joinedAt", "createdAt", "owner", "user"
];

export const apiMemberActionValidation = [
  param("membershipId")
    .isInt({ min: 1 })
    .withMessage("El miembro debe ser un entero positivo."),
  ...protectedMemberFields.map((field) => body(field)
    .not()
    .exists()
    .withMessage("No se permite modificar este campo."))
];

export const apiMemberRoleValidation = [
  ...apiMemberActionValidation,
  body("role")
    .isIn(["manager", "viewer"])
    .withMessage("Selecciona un rol válido.")
];

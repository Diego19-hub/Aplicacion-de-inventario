import { matchedData, validationResult } from "express-validator";

import { createBusinessWithOwner } from "../db/adminQueries.js";
import {
  getActiveBusinessesForUser,
  getActiveBusinessMembership
} from "../db/businessQueries.js";
import {
  serializeActiveBusiness,
  serializeMembership,
  sessionPermissions
} from "./apiSessionController.js";

const allowedFields = new Set([
  "name",
  "slug",
  "legalName",
  "taxId",
  "currency",
  "timezone"
]);

const protectedFields = new Set([
  "id",
  "status",
  "createdBy",
  "updatedAt",
  "ownerUserId",
  "ownerEmail",
  "businessId",
  "membership",
  "memberships"
]);

function validationError(res, fields) {
  return res.status(400).json({
    error: {
      code: "VALIDATION_ERROR",
      message: "Revisa los campos enviados.",
      fields
    }
  });
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function extraFieldErrors(body) {
  const input = body && typeof body === "object" && !Array.isArray(body) ? body : {};

  return Object.keys(input)
    .filter((key) => protectedFields.has(key) || !allowedFields.has(key))
    .map((key) => ({
      field: key,
      message: "Este campo no se puede modificar."
    }));
}

function duplicateSlug(res) {
  return res.status(409).json({
    error: {
      code: "SLUG_ALREADY_EXISTS",
      message: "Ese slug ya está en uso.",
      fields: [
        {
          field: "slug",
          message: "Ese slug ya está en uso."
        }
      ]
    }
  });
}

function onboardingBusinessData(req) {
  const data = matchedData(req, {
    locations: ["body"],
    includeOptionals: true
  });

  return {
    name: data.name,
    slug: data.slug,
    legalName: data.legalName || null,
    taxId: data.taxId || null,
    currency: data.currency,
    timezone: data.timezone
  };
}

export async function createOnboardingBusiness(req, res, next) {
  const fields = [
    ...extraFieldErrors(req.body),
    ...validationResult(req).array().map((error) => ({
      field: error.path,
      message: error.msg
    }))
  ];

  if (fields.length) {
    return validationError(res, fields);
  }

  const userId = req.session.user.id;

  try {
    const activeBusinesses = await getActiveBusinessesForUser(userId);

    if (activeBusinesses.length > 0) {
      return res.status(409).json({
        error: {
          code: "BUSINESS_ALREADY_EXISTS",
          message: "Tu cuenta ya tiene un negocio configurado."
        }
      });
    }

    const business = await createBusinessWithOwner(
      onboardingBusinessData(req),
      userId,
      userId
    );
    const activeMembership = await getActiveBusinessMembership(userId, business.id);

    if (!activeMembership) {
      throw new Error("No se pudo seleccionar el negocio creado.");
    }

    req.session.activeBusinessId = Number(business.id);
    await saveSession(req);

    const membership = serializeMembership(activeMembership);

    return res.status(201).json({
      data: {
        business: {
          id: Number(business.id),
          name: business.name,
          slug: business.slug,
          status: business.status
        },
        activeBusiness: serializeActiveBusiness(activeMembership),
        membership,
        permissions: sessionPermissions(membership, req.session.user.platformRole)
      }
    });
  } catch (error) {
    if (error.code === "23505" && error.constraint === "businesses_slug_key") {
      return duplicateSlug(res);
    }

    return next(error);
  }
}

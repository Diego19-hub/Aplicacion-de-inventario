import bcrypt from "bcrypt";

import {
  createUser,
  findUserByEmail,
  findUserByIdentifier,
  findUserByUsername
} from "../db/authQueries.js";
import { getActiveBusinessesForUser } from "../db/businessQueries.js";

export function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) reject(error);
      else resolve();
    });
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

function safeUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    platformRole: user.platform_role
  };
}

function registrationConflicts(existingUsername, existingEmail) {
  const conflicts = [];
  if (existingUsername) conflicts.push({ field: "username", message: "Ese nombre de usuario ya está registrado." });
  if (existingEmail) conflicts.push({ field: "email", message: "Ese correo electrónico ya está registrado." });
  return conflicts;
}

export async function registerAccount({ username, email, password }) {
  const [existingUsername, existingEmail] = await Promise.all([
    findUserByUsername(username),
    findUserByEmail(email)
  ]);
  const conflicts = registrationConflicts(existingUsername, existingEmail);
  if (conflicts.length > 0) return { conflicts };

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await createUser({ username, email, passwordHash });
    return { user };
  } catch (error) {
    if (error.code !== "23505") throw error;

    const [conflictingUsername, conflictingEmail] = await Promise.all([
      findUserByUsername(username),
      findUserByEmail(email)
    ]);
    return {
      conflicts: registrationConflicts(conflictingUsername, conflictingEmail).length > 0
        ? registrationConflicts(conflictingUsername, conflictingEmail)
        : [
          { field: "username", message: "El usuario o correo ya está registrado." },
          { field: "email", message: "El usuario o correo ya está registrado." }
        ]
    };
  }
}

export async function establishAuthenticatedSession(req, user, { activeBusinessId = null, returnTo } = {}) {
  await regenerateSession(req);
  req.session.user = safeUser(user);

  if (activeBusinessId) req.session.activeBusinessId = activeBusinessId;
  if (returnTo !== undefined) req.session.returnTo = returnTo;

  await saveSession(req);
  return req.session.user;
}

export async function authenticateLogin(req, { identifier, password, returnTo }) {
  const user = await findUserByIdentifier(identifier);

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return null;
  }

  const businesses = await getActiveBusinessesForUser(user.id);
  const activeBusinessId = businesses.length === 1 ? businesses[0].id : null;

  const sessionUser = await establishAuthenticatedSession(req, user, {
    activeBusinessId,
    returnTo
  });

  return {
    user: sessionUser,
    businesses,
    activeBusinessId,
    requiresBusinessSelection: businesses.length > 1
  };
}

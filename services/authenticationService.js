import bcrypt from "bcrypt";

import { findUserByIdentifier } from "../db/authQueries.js";
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

export async function authenticateLogin(req, { identifier, password, returnTo }) {
  const user = await findUserByIdentifier(identifier);

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return null;
  }

  const businesses = await getActiveBusinessesForUser(user.id);
  const activeBusinessId = businesses.length === 1 ? businesses[0].id : null;

  await regenerateSession(req);

  req.session.user = safeUser(user);

  if (activeBusinessId) {
    req.session.activeBusinessId = activeBusinessId;
  }

  if (returnTo !== undefined) {
    req.session.returnTo = returnTo;
  }

  await saveSession(req);

  return {
    user: req.session.user,
    businesses,
    activeBusinessId,
    requiresBusinessSelection: businesses.length > 1
  };
}

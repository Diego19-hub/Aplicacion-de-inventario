import {
  validationResult,
  matchedData
} from "express-validator";

import { getActiveBusinessesForUser } from "../db/businessQueries.js";
import { isSafeReturnTo } from "../middleware/authMiddleware.js";
import {
  authenticateLogin,
  establishAuthenticatedSession,
  registerAccount
} from "../services/authenticationService.js";


function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function redirectAfterAuthentication(req, res) {
  const businesses = await getActiveBusinessesForUser(req.session.user.id);

  const returnTo = isSafeReturnTo(req.session.returnTo) ? req.session.returnTo : "/";

  if (returnTo.startsWith("/invitations/")) {
    return res.redirect(returnTo);
  }

  if (businesses.length === 0) {
    return res.redirect("/businesses/no-access");
  }

  if (businesses.length === 1) {
    req.session.activeBusinessId = businesses[0].id;
    await saveSession(req);
    return res.redirect(returnTo);
  }

  return res.redirect("/businesses/select");
}

export function showRegisterForm(req, res) {
  if (req.session.user) {
    return res.redirect("/");
  }

  res.render("auth/register", {
    title: "Crear cuenta",
    formData: {
      username: "",
      email: ""
    },
    errors: []
  });
}

export async function registerUser(req, res, next) {
  if (req.session.user) {
    return res.redirect("/");
  }

  const validationErrors = validationResult(req);

  if (!validationErrors.isEmpty()) {
    return res.status(400).render("auth/register", {
      title: "Crear cuenta",
      formData: {
        username: req.body.username ?? "",
        email: req.body.email ?? ""
      },
      errors: validationErrors.array()
    });
  }

  const { username, email, password } = matchedData(req);

  try {
    const registration = await registerAccount({ username, email, password });
    if (registration.conflicts) {
      return res.status(409).render("auth/register", {
        title: "Crear cuenta",
        formData: { username, email },
        errors: registration.conflicts.map((conflict) => ({ path: conflict.field, msg: conflict.message }))
      });
    }

    const returnTo = isSafeReturnTo(req.session.returnTo) ? req.session.returnTo : "/";
    await establishAuthenticatedSession(req, registration.user, { returnTo });
    return redirectAfterAuthentication(req, res);
  } catch (error) {
    next(error);
  }
}

export function showLoginForm(req, res) {
  if (req.session.user) {
    return res.redirect("/");
  }

  res.render("auth/login", {
    title: "Iniciar sesión",
    formData: {
      identifier: ""
    },
    errors: []
  });
}

export async function loginUser(req, res, next) {
  if (req.session.user) {
    return res.redirect("/");
  }

  const validationErrors = validationResult(req);

  if (!validationErrors.isEmpty()) {
    return res.status(400).render("auth/login", {
      title: "Iniciar sesión",
      formData: {
        identifier: req.body.identifier ?? ""
      },
      errors: validationErrors.array()
    });
  }

  const { identifier, password } = matchedData(req);

  try {
    const returnTo = isSafeReturnTo(req.session.returnTo) ? req.session.returnTo : "/";
    const login = await authenticateLogin(req, { identifier, password, returnTo });

    // El mismo mensaje sirve si el usuario o la contraseña son incorrectos.
    if (!login) {
      return res.status(401).render("auth/login", {
        title: "Iniciar sesión",
        formData: { identifier },
        errors: [
          {
            msg: "Usuario, correo o contraseña incorrectos."
          }
        ]
      });
    }

    return redirectAfterAuthentication(req, res);
  } catch (error) {
    next(error);
  }
}

export function logoutUser(req, res, next) {
  req.session.destroy((error) => {
    if (error) {
      return next(error);
    }

    res.clearCookie("boxing_inventory_session", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production"
    });

    res.redirect("/auth/login");
  });
}

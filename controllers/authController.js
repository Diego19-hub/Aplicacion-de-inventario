import bcrypt from "bcrypt";
import {
  validationResult,
  matchedData
} from "express-validator";

import {
  findUserByUsername,
  findUserByEmail,
  findUserByIdentifier,
  createUser
} from "../db/authQueries.js";


function regenerateSession(req) {
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
    const [existingUsername, existingEmail] = await Promise.all([
      findUserByUsername(username),
      findUserByEmail(email)
    ]);

    const errors = [];

    if (existingUsername) {
      errors.push({
        path: "username",
        msg: "Ese nombre de usuario ya está registrado."
      });
    }

    if (existingEmail) {
      errors.push({
        path: "email",
        msg: "Ese correo electrónico ya está registrado."
      });
    }

    if (errors.length > 0) {
      return res.status(409).render("auth/register", {
        title: "Crear cuenta",
        formData: { username, email },
        errors
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await createUser({
      username,
      email,
      passwordHash
    });

    const returnTo = req.session.returnTo || "/";

    await regenerateSession(req);

    req.session.user = {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role
    };

    await saveSession(req);

    res.redirect(returnTo);
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).render("auth/register", {
        title: "Crear cuenta",
        formData: {
          username: req.body.username ?? "",
          email: req.body.email ?? ""
        },
        errors: [
          {
            msg: "El usuario o correo ya está registrado."
          }
        ]
      });
    }

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
    const user = await findUserByIdentifier(identifier);

    // El mismo mensaje sirve si el usuario o la contraseña son incorrectos.
    if (!user) {
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

    const passwordIsCorrect = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordIsCorrect) {
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

    await regenerateSession(req);

    req.session.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role
    };

    await saveSession(req);

    res.redirect("/");
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

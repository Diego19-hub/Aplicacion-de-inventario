import "dotenv/config";
import express from "express";
import session from "express-session";
import helmet from "helmet";
import { csrfSync } from "csrf-sync";
import path from "node:path";
import { fileURLToPath } from "node:url";

import apiRouter from "./routes/apiRouter.js";

import {
  notFoundHandler,
  errorHandler
} from "./middleware/errorMiddleware.js";

const app = express();

const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === "production";
const isTest = process.env.NODE_ENV === "test";
const sessionSecret = process.env.SESSION_SECRET;
const rootDir = path.dirname(fileURLToPath(import.meta.url));
const clientDistDir = path.join(rootDir, "client", "dist");
const reactIndexFile = path.join(clientDistDir, "index.html");


if (!sessionSecret) {
  throw new Error(
    "Falta SESSION_SECRET. Configúrala en las variables de entorno."
  );
}

if (isProduction) {
  app.set("trust proxy", 1);
}

app.disable("x-powered-by");

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        upgradeInsecureRequests: isProduction ? [] : null
      }
    }
  })
);

app.get("/health", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.status(200).json({
    status: "ok"
  });
});

let sessionStore;

if (!isTest) {
  const { default: connectPgSimple } = await import("connect-pg-simple");
  const { default: pool } = await import("./db/pool.js");
  const PostgreSQLStore = connectPgSimple(session);

  sessionStore = new PostgreSQLStore({
    pool,
    tableName: "user_sessions",
    createTableIfMissing: true
  });
}

const {
  csrfSynchronisedProtection
} = csrfSync({
  getTokenFromRequest: (req) => {
    return (
      req.body?._csrf ??
      req.headers["x-csrf-token"]
    );
  }
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

if (isProduction) {
  app.use(express.static(clientDistDir));
}

const sessionOptions = {
  name: "boxing_inventory_session",
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
};

if (!isTest) {
  sessionOptions.store = sessionStore;
}

app.use(session(sessionOptions));
app.use((req, res, next) => {
  // La autenticación API debe poder responder 401 antes de validar CSRF. Sin
  // sesión esta ruta no puede mutar; con sesión conserva la protección global.
  if (
    req.method === "POST"
    && (
      /^\/api\/invitations\/[^/]+\/accept$/.test(req.path)
      || /^\/api\/admin\/businesses\/[^/]+\/(suspend|reactivate|archive)$/.test(req.path)
    )
    && !req.session.user
  ) {
    // Estas rutas deben poder responder 401 JSON antes de exigir token.
    // No hay mutación posible sin sesión autenticada.
    req.csrfToken = () => "";
    return next();
  }

  return csrfSynchronisedProtection(req, res, next);
});

app.use((error, req, res, next) => {
  if (error.code === "EBADCSRFTOKEN" && req.path.startsWith("/api/")) {
    return res.status(403).json({
      error: {
        code: "CSRF_INVALID",
        message: "El token CSRF es inválido."
      }
    });
  }

  return next(error);
});

app.use("/api", apiRouter);

app.get("/", (req, res) => {
  res.redirect("/app");
});

if (isProduction) {
  app.get(/^\/(?!api(?:\/|$)).*/, (req, res) => {
    res.sendFile(reactIndexFile);
  });
}

app.use(notFoundHandler);
app.use(errorHandler);

// Solo abre un puerto cuando se ejecuta localmente
if (!isTest && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
  });
}

// Vercel utiliza esta exportación
export default app;

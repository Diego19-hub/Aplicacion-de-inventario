import "./config/env.js";
import express from "express";
import session from "express-session";
import helmet from "helmet";
import { csrfSync } from "csrf-sync";
import path from "node:path";
import { fileURLToPath } from "node:url";

import apiRouter from "./routes/apiRouter.js";
import { apiTiming } from "./middleware/apiTiming.js";
import { productImportTemplateBuffer } from "./utils/productImportTemplate.js";
import { getFrontendUrl, googleOAuthConfigStatus } from "./config/env.js";

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
const configuredFrontendUrl = getFrontendUrl();
const configuredFrontendOrigin = configuredFrontendUrl
  ? new URL(configuredFrontendUrl).origin
  : null;
const allowedCorsOrigins = new Set([
  "http://tauri.localhost",
  configuredFrontendOrigin || "https://inventario.saas.duob.tech",
  ...(isProduction ? [] : ["http://localhost:5173", "http://127.0.0.1:5173"])
]);

if (process.env.NODE_ENV === "development") {
  console.info("[google-oauth-config]", googleOAuthConfigStatus());
}

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

if (isProduction) {
  app.use(express.static(clientDistDir, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".js")) {
        res.set("Content-Type", "application/javascript; charset=utf-8");
      }
    }
  }));
}

app.get("/health", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.status(200).json({
    status: "ok"
  });
});

app.get("/favicon.ico", (req, res) => {
  res.status(204).end();
});

app.get("/.well-known/appspecific/com.chrome.devtools.json", (req, res) => {
  res.status(204).end();
});

app.get("/plantilla_importacion_productos.xlsx", async (req, res, next) => {
  res.type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.set("Content-Disposition", 'attachment; filename="plantilla_importacion_productos.xlsx"');
  try {
    return res.send(await productImportTemplateBuffer());
  } catch (error) {
    return next(error);
  }
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
app.use("/api", apiTiming);

app.use((req, res, next) => {
  const requestOrigin = req.get("origin");
  const hasOrigin = Boolean(requestOrigin);
  const isAllowed = !hasOrigin || allowedCorsOrigins.has(requestOrigin);

  if (isAllowed && hasOrigin) {
    res.set("Access-Control-Allow-Origin", requestOrigin);
    res.set("Access-Control-Allow-Credentials", "true");
    res.set("Access-Control-Allow-Headers", "Accept, Content-Type, X-CSRF-Token");
    res.set("Access-Control-Allow-Methods", "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS");
    res.vary("Origin");
  }

  if (!isAllowed) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[cors-rejected]", {
        origin: requestOrigin,
        endpoint: `${req.method} ${req.originalUrl}`,
        reason: "origin-not-allowed"
      });
    }

    return res.status(403).json({
      error: {
        code: "CORS_ORIGIN_NOT_ALLOWED",
        message: "El origen de la aplicación no está permitido."
      }
    });
  }

  if (req.method === "OPTIONS") return res.sendStatus(204);

  if (process.env.NODE_ENV === "development" && hasOrigin) {
    res.on("finish", () => {
      console.info("[cors-request]", {
        origin: requestOrigin,
        endpoint: `${req.method} ${req.originalUrl}`,
        status: res.statusCode,
        reason: "origin-allowed"
      });
    });
  }

  return next();
});

const sessionOptions = {
  name: "boxing_inventory_session",
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: isProduction ? "none" : "lax",
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

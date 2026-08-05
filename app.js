import "dotenv/config";
import express from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import helmet from "helmet";
import { csrfSync } from "csrf-sync";

import pool from "./db/pool.js";

import indexRouter from "./routes/indexRouter.js";
import categoriesRouter from "./routes/categoriesRouter.js";
import itemsRouter from "./routes/itemsRouter.js";
import authRouter from "./routes/authRouter.js";
import businessesRouter from "./routes/businessesRouter.js";
import adminRouter from "./routes/adminRouter.js";
import membersRouter from "./routes/membersRouter.js";
import invitationsRouter from "./routes/invitationsRouter.js";

import {
  notFoundHandler,
  errorHandler
} from "./middleware/errorMiddleware.js";

const app = express();

const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === "production";
const sessionSecret = process.env.SESSION_SECRET;


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

const PostgreSQLStore = connectPgSimple(session);

const sessionStore = new PostgreSQLStore({
  pool,
  tableName: "user_sessions",
  createTableIfMissing: true
});

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

app.set("view engine", "ejs");

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static("public"));

app.use(
  session({
    store: sessionStore,
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
  })
);
app.use(csrfSynchronisedProtection);

app.use((req, res, next) => {
  res.locals.csrfToken = req.csrfToken();
  next();
});

app.use((req, res, next) => {
  const currentUser = req.session.user ?? null;

  res.locals.currentUser = currentUser;
  res.locals.isSuperAdmin = currentUser?.platformRole === "super_admin";
  res.locals.currentBusiness = null;
  res.locals.currentMembership = null;
  res.locals.canManageInventory = false;
  res.locals.canDeleteInventory = false;

  next();
});

app.use("/", indexRouter);
app.use("/auth", authRouter);
app.use("/admin", adminRouter);
app.use("/businesses", businessesRouter);
app.use("/members", membersRouter);
app.use("/invitations", invitationsRouter);
app.use("/categories", categoriesRouter);
app.use("/items", itemsRouter);

app.use(notFoundHandler);
app.use(errorHandler);

// Solo abre un puerto cuando se ejecuta localmente
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
  });
}

// Vercel utiliza esta exportación
export default app;

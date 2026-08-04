import "dotenv/config";
import express from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import helmet from "helmet";

import pool from "./db/pool.js";

import indexRouter from "./routes/indexRouter.js";
import categoriesRouter from "./routes/categoriesRouter.js";
import itemsRouter from "./routes/itemsRouter.js";
import authRouter from "./routes/authRouter.js";

import {
  notFoundHandler,
  errorHandler
} from "./middleware/errorMiddleware.js";

const app = express();

const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === "production";
const sessionSecret = process.env.SESSION_SECRET;

// Comprobación segura: no muestra el valor del secreto
console.log("SESSION_SECRET configurado:", Boolean(sessionSecret));

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

app.use((req, res, next) => {
  const currentUser = req.session.user ?? null;

  res.locals.currentUser = currentUser;
  res.locals.isAdmin = currentUser?.role === "admin";

  next();
});

app.use("/", indexRouter);
app.use("/auth", authRouter);
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
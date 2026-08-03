import "dotenv/config";
import express from "express";
import indexRouter from "./routes/indexRouter.js";
import categoriesRouter from "./routes/categoriesRouter.js";
import itemsRouter from "./routes/itemsRouter.js";
import {
  notFoundHandler,
  errorHandler
} from "./middleware/errorMiddleware.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.set("view engine", "ejs");

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static("public"));

app.use("/", indexRouter);
app.use("/categories", categoriesRouter);

app.use("/", indexRouter);
app.use("/categories", categoriesRouter);
app.use("/items", itemsRouter);

app.use(notFoundHandler);
app.use(errorHandler);

app.get("/test-error", (req, res) => {
  throw new Error("Error de prueba");
});

app.listen(PORT, () => {
  console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
});

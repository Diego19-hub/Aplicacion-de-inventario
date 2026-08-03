import {
  getInventorySummary,
  getAllCategories
} from "../db/queries.js";

export async function showHomePage(req, res, next) {
  try {
    const [summary, categories] = await Promise.all([
      getInventorySummary(),
      getAllCategories()
    ]);

    res.render("index", {
      title: "Inventario de boxeo",
      summary,
      categories
    });
  } catch (error) {
    next(error);
  }
}
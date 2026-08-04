import { validationResult, matchedData } from "express-validator";
import AppError from "../utils/AppError.js";
import {
  getAllItems,
  getItemById,
  getAllCategories,
  createItem,
  updateItem,
  deleteItem
} from "../db/queries.js";

function itemFormValues(item = {}) {
  return {
    id: item.id,
    name: item.name ?? "",
    description: item.description ?? "",
    brand: item.brand ?? "",
    price: item.price ?? "",
    stock: item.stock ?? "",
    categoryId: item.categoryId ?? item.category_id ?? ""
  };
}

export async function showItems(req, res, next) {
  try {
    const items = await getAllItems(req.business.id);
    res.render("items/index", { title: "Productos", items });
  } catch (error) {
    next(error);
  }
}

export async function showItem(req, res, next) {
  const itemId = Number(req.params.id);
  if (!Number.isInteger(itemId) || itemId < 1) {
    return next(new AppError("Producto no encontrado", 404));
  }

  try {
    const item = await getItemById(itemId, req.business.id);
    if (!item) return next(new AppError("Producto no encontrado", 404));
    res.render("items/details", { title: item.name, item });
  } catch (error) {
    next(error);
  }
}

export async function showCreateItemForm(req, res, next) {
  try {
    const categories = await getAllCategories(req.business.id);
    res.render("items/form", {
      title: "Crear producto",
      item: itemFormValues({ categoryId: Number(req.query.category) || "" }),
      categories,
      errors: []
    });
  } catch (error) {
    next(error);
  }
}

export async function addItem(req, res, next) {
  const validationErrors = validationResult(req);
  try {
    const categories = await getAllCategories(req.business.id);
    if (!validationErrors.isEmpty()) {
      return res.status(400).render("items/form", {
        title: "Crear producto",
        item: itemFormValues({ ...req.body, categoryId: Number(req.body.categoryId) || "" }),
        categories,
        errors: validationErrors.array()
      });
    }

    const item = await createItem(matchedData(req), req.business.id);
    res.redirect(`/items/${item.id}`);
  } catch (error) {
    if (error.code === "23503") {
      return res.status(400).render("items/form", {
        title: "Crear producto",
        item: itemFormValues({ ...req.body, categoryId: Number(req.body.categoryId) || "" }),
        categories,
        errors: [{ path: "categoryId", msg: "La categoría seleccionada no existe." }]
      });
    }
    next(error);
  }
}

export async function showEditItemForm(req, res, next) {
  const itemId = Number(req.params.id);
  if (!Number.isInteger(itemId) || itemId < 1) {
    return next(new AppError("Producto no encontrado", 404));
  }

  try {
    const [item, categories] = await Promise.all([
      getItemById(itemId, req.business.id),
      getAllCategories(req.business.id)
    ]);
    if (!item) return next(new AppError("Producto no encontrado", 404));
    res.render("items/form", {
      title: "Editar producto",
      item: itemFormValues(item),
      categories,
      errors: []
    });
  } catch (error) {
    next(error);
  }
}

export async function editItem(req, res, next) {
  const itemId = Number(req.params.id);
  if (!Number.isInteger(itemId) || itemId < 1) {
    return next(new AppError("Producto no encontrado", 404));
  }

  const validationErrors = validationResult(req);
  try {
    const categories = await getAllCategories(req.business.id);
    if (!validationErrors.isEmpty()) {
      return res.status(400).render("items/form", {
        title: "Editar producto",
        item: itemFormValues({ id: itemId, ...req.body, categoryId: Number(req.body.categoryId) || "" }),
        categories,
        errors: validationErrors.array()
      });
    }

    const item = await updateItem(itemId, req.business.id, matchedData(req));
    if (!item) return next(new AppError("Producto no encontrado", 404));
    res.redirect(`/items/${item.id}`);
  } catch (error) {
    if (error.code === "23503") {
      return res.status(400).render("items/form", {
        title: "Editar producto",
        item: itemFormValues({ id: itemId, ...req.body, categoryId: Number(req.body.categoryId) || "" }),
        categories,
        errors: [{ path: "categoryId", msg: "La categoría seleccionada no existe." }]
      });
    }
    next(error);
  }
}

export async function showDeleteItemPage(req, res, next) {
  const itemId = Number(req.params.id);
  if (!Number.isInteger(itemId) || itemId < 1) {
    return next(new AppError("Producto no encontrado", 404));
  }

  try {
    const item = await getItemById(itemId, req.business.id);
    if (!item) return next(new AppError("Producto no encontrado", 404));
    res.render("items/delete", { title: "Eliminar producto", item });
  } catch (error) {
    next(error);
  }
}

export async function removeItem(req, res, next) {
  const itemId = Number(req.params.id);
  if (!Number.isInteger(itemId) || itemId < 1) {
    return next(new AppError("Producto no encontrado", 404));
  }

  try {
    const deletedItem = await deleteItem(itemId, req.business.id);
    if (!deletedItem) return next(new AppError("Producto no encontrado", 404));
    res.redirect(`/categories/${deletedItem.category_id}`);
  } catch (error) {
    next(error);
  }
}

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

export async function showItems(req, res, next) {
  try {
    const items = await getAllItems();

    res.render("items/index", {
      title: "Productos",
      items
    });
  } catch (error) {
    next(error);
  }
}

export async function showItem(req, res, next) {
  try {
    const itemId = Number(req.params.id);

    if (!Number.isInteger(itemId) || itemId < 1) {
        return next(new AppError("Producto no encontrado", 404));
    }

    const item = await getItemById(itemId);

    if (!item) {
        return next(new AppError("Producto no encontrado", 404));
    }

    res.render("items/details", {
      title: item.name,
      item
    });
  } catch (error) {
    next(error);
  }
}

export async function showCreateItemForm(req, res, next) {
  try {
    const categories = await getAllCategories();

    res.render("items/form", {
      title: "Crear producto",
      item: {
        name: "",
        description: "",
        brand: "",
        price: "",
        stock: "",
        categoryId: Number(req.query.category) || ""
      },
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
    const categories = await getAllCategories();

    if (!validationErrors.isEmpty()) {
      return res.status(400).render("items/form", {
        title: "Crear producto",
        item: {
          name: req.body.name ?? "",
          description: req.body.description ?? "",
          brand: req.body.brand ?? "",
          price: req.body.price ?? "",
          stock: req.body.stock ?? "",
          categoryId: Number(req.body.categoryId) || ""
        },
        categories,
        errors: validationErrors.array()
      });
    }

    const item = await createItem(matchedData(req));
    res.redirect(`/items/${item.id}`);
  } catch (error) {
    if (error.code === "23503") {
      return res.status(400).render("items/form", {
        title: "Crear producto",
        item: {
          name: req.body.name ?? "",
          description: req.body.description ?? "",
          brand: req.body.brand ?? "",
          price: req.body.price ?? "",
          stock: req.body.stock ?? "",
          categoryId: Number(req.body.categoryId) || ""
        },
        categories: await getAllCategories(),
        errors: [{ path: "categoryId", msg: "La categoría seleccionada no existe." }]
      });
    }

    next(error);
  }
}

export async function showEditItemForm(req, res, next) {
  try {
    const itemId = Number(req.params.id);

    if (!Number.isInteger(itemId) || itemId < 1) {
      return res.status(404).send("Producto no encontrado");
    }

    const [item, categories] = await Promise.all([
      getItemById(itemId),
      getAllCategories()
    ]);

    if (!item) {
        return next(new AppError("Producto no encontrado", 404));
    }

    res.render("items/form", {
      title: "Editar producto",
      item: {
        id: item.id,
        name: item.name,
        description: item.description,
        brand: item.brand,
        price: item.price,
        stock: item.stock,
        categoryId: item.category_id
      },
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
    const categories = await getAllCategories();

    if (!validationErrors.isEmpty()) {
      return res.status(400).render("items/form", {
        title: "Editar producto",
        item: {
          id: itemId,
          name: req.body.name ?? "",
          description: req.body.description ?? "",
          brand: req.body.brand ?? "",
          price: req.body.price ?? "",
          stock: req.body.stock ?? "",
          categoryId: Number(req.body.categoryId) || ""
        },
        categories,
        errors: validationErrors.array()
      });
    }

    const data = matchedData(req);

    const item = await updateItem(itemId, {
      name: data.name,
      description: data.description,
      brand: data.brand,
      price: data.price,
      stock: data.stock,
      categoryId: data.categoryId
    });

    if (!item) {
      return next(new AppError("Producto no encontrado", 404));
    }

    res.redirect(`/items/${item.id}`);
  } catch (error) {
    if (error.code === "23503") {
      const categories = await getAllCategories();

      return res.status(400).render("items/form", {
        title: "Editar producto",
        item: {
          id: itemId,
          name: req.body.name ?? "",
          description: req.body.description ?? "",
          brand: req.body.brand ?? "",
          price: req.body.price ?? "",
          stock: req.body.stock ?? "",
          categoryId: Number(req.body.categoryId) || ""
        },
        categories,
        errors: [
          {
            path: "categoryId",
            msg: "La categoría seleccionada no existe."
          }
        ]
      });
    }

    next(error);
  }
}


export async function showDeleteItemPage(req, res, next) {
  try {
    const itemId = Number(req.params.id);

    if (!Number.isInteger(itemId) || itemId < 1) {
      return res.status(404).send("Producto no encontrado");
    }

    const item = await getItemById(itemId);

    if (!item) {
      return next(new AppError("Producto no encontrado", 404));
    }

    res.render("items/delete", {
      title: "Eliminar producto",
      item
    });
  } catch (error) {
    next(error);
  }
}

export async function removeItem(req, res, next) {
  try {
    const itemId = Number(req.params.id);

    if (!Number.isInteger(itemId) || itemId < 1) {
      return res.status(404).send("Producto no encontrado");
    }

    const deletedItem = await deleteItem(itemId);

    if (!deletedItem) {
      return res.status(404).send("Producto no encontrado");
    }

    res.redirect(`/categories/${deletedItem.category_id}`);
  } catch (error) {
    next(error);
  }
}
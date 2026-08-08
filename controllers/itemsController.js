import { validationResult, matchedData } from "express-validator";
import AppError from "../utils/AppError.js";
import {
  getPaginatedItems,
  countFilteredItems,
  getItemById,
  getAllCategories,
  createItem,
  updateItem,
  archiveItem,
  getArchivedItems,
  getArchivedItemById,
  restoreItem
} from "../db/queries.js";
import { getItemBalances } from "../db/locationQueries.js";

const ITEMS_PER_PAGE = 12;

function readListFilters(query) {
  const text = typeof query.q === "string" ? query.q.trim().slice(0, 100) : "";
  const categoryValue = typeof query.category === "string" ? query.category.trim() : "";
  const categoryId = categoryValue === ""
    ? null
    : /^[1-9]\d{0,8}$/.test(categoryValue) && Number.isSafeInteger(Number(categoryValue))
      ? Number(categoryValue)
      : -1;
  const pageValue = typeof query.page === "string" ? query.page : "";
  const page = /^[1-9]\d{0,5}$/.test(pageValue) ? Number(pageValue) : 1;
  return { categoryId, page, query: text };
}

function paginationPages(currentPage, totalPages) {
  const visible = new Set([1, totalPages]);
  for (let page = currentPage - 2; page <= currentPage + 2; page += 1) {
    if (page >= 1 && page <= totalPages) visible.add(page);
  }

  const pages = [...visible].sort((first, second) => first - second);
  return pages.flatMap((page, index) => (
    index > 0 && page - pages[index - 1] > 1 ? [null, page] : [page]
  ));
}

function itemsUrl({ query, categoryId, page }) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (categoryId !== null) params.set("category", String(categoryId));
  if (page > 1) params.set("page", String(page));
  const queryString = params.toString();
  return queryString ? `/items?${queryString}` : "/items";
}

function itemFormValues(item = {}) {
  return {
    id: item.id,
    sku: item.sku ?? "",
    name: item.name ?? "",
    description: item.description ?? "",
    brand: item.brand ?? "",
    price: item.price ?? "",
    categoryId: item.categoryId ?? item.category_id ?? ""
  };
}

export async function showItems(req, res, next) {
  try {
    const filters = readListFilters(req.query);
    const totalItems = await countFilteredItems({
      businessId: req.business.id,
      query: filters.query,
      categoryId: filters.categoryId
    });
    const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
    const page = Math.min(filters.page, totalPages);
    const [items, categories] = await Promise.all([
      getPaginatedItems({
        businessId: req.business.id,
        query: filters.query,
        categoryId: filters.categoryId,
        limit: ITEMS_PER_PAGE,
        offset: (page - 1) * ITEMS_PER_PAGE
      }),
      getAllCategories(req.business.id)
    ]);
    const currentFilters = { ...filters, page };
    res.render("items/index", {
      title: "Productos",
      items,
      categories,
      totalItems,
      hasFilters: Boolean(filters.query) || filters.categoryId !== null,
      filters: currentFilters,
      pagination: { page, totalPages, pages: paginationPages(page, totalPages) },
      itemsUrl
    });
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
    const balances = await getItemBalances(req.business.id, itemId);
    res.render("items/details", { title: item.name, item, balances });
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
  let categories = [];
  try {
    categories = await getAllCategories(req.business.id);
    if (!validationErrors.isEmpty()) {
      return res.status(400).render("items/form", {
        title: "Crear producto",
        item: itemFormValues({ ...req.body, categoryId: Number(req.body.categoryId) || "" }),
        categories,
        errors: validationErrors.array()
      });
    }

    const item = await createItem(matchedData(req), req.business.id);
    if (!item) {
      return res.status(400).render("items/form", {
        title: "Crear producto",
        item: itemFormValues({ ...req.body, categoryId: Number(req.body.categoryId) || "" }),
        categories,
        errors: [{ path: "categoryId", msg: "La categoría seleccionada no existe." }]
      });
    }
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
    if (error.code === "23505") {
      return res.status(409).render("items/form", {
        title: "Crear producto",
        item: itemFormValues({ ...req.body, categoryId: Number(req.body.categoryId) || "" }),
        categories,
        errors: [{ path: "sku", msg: "Ese SKU ya existe en este negocio." }]
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
  let categories = [];
  try {
    categories = await getAllCategories(req.business.id);
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
    if (error.code === "23505") {
      return res.status(409).render("items/form", {
        title: "Editar producto",
        item: itemFormValues({ id: itemId, ...req.body, categoryId: Number(req.body.categoryId) || "" }),
        categories,
        errors: [{ path: "sku", msg: "Ese SKU ya existe en este negocio." }]
      });
    }
    next(error);
  }
}

export async function showDeleteItemPage(req, res, next) {
  return res.redirect(`/items/${req.params.id}/archive`);
}

function validItemId(value) {
  const itemId = Number(value);
  return Number.isInteger(itemId) && itemId > 0 ? itemId : null;
}

export async function showArchiveItemPage(req, res, next) {
  const itemId = validItemId(req.params.id);
  if (!itemId) {
    return next(new AppError("Producto no encontrado", 404));
  }

  try {
    const item = await getItemById(itemId, req.business.id);
    if (!item) return next(new AppError("Producto no encontrado", 404));
    res.render("items/archive", { title: "Archivar producto", item, errors: [], archiveReason: "" });
  } catch (error) {
    next(error);
  }
}

export async function archiveExistingItem(req, res, next) {
  const itemId = validItemId(req.params.id);
  if (!itemId) {
    return next(new AppError("Producto no encontrado", 404));
  }

  try {
    const validationErrors = validationResult(req);
    if (!validationErrors.isEmpty()) {
      const item = await getItemById(itemId, req.business.id);
      if (!item) return next(new AppError("Producto no encontrado", 404));
      return res.status(400).render("items/archive", {
        title: "Archivar producto",
        item,
        errors: validationErrors.array(),
        archiveReason: req.body.archiveReason ?? ""
      });
    }

    const { archiveReason } = matchedData(req);
    const item = await archiveItem(itemId, req.business.id, req.session.user.id, archiveReason);
    if (!item) return next(new AppError("Producto no encontrado", 404));
    res.redirect("/items");
  } catch (error) {
    next(error);
  }
}

export async function showArchivedItems(req, res, next) {
  try {
    const items = await getArchivedItems(req.business.id);
    res.render("items/archived", { title: "Productos archivados", items });
  } catch (error) {
    next(error);
  }
}

export async function showArchivedItem(req, res, next) {
  const itemId = validItemId(req.params.id);
  if (!itemId) return next(new AppError("Producto no encontrado", 404));

  try {
    const item = await getArchivedItemById(itemId, req.business.id);
    if (!item) return next(new AppError("Producto no encontrado", 404));
    res.render("items/archived-details", { title: item.name, item });
  } catch (error) {
    next(error);
  }
}

export async function showRestoreItemPage(req, res, next) {
  const itemId = validItemId(req.params.id);
  if (!itemId) return next(new AppError("Producto no encontrado", 404));

  try {
    const item = await getArchivedItemById(itemId, req.business.id);
    if (!item) return next(new AppError("Producto no encontrado", 404));
    res.render("items/restore", { title: "Restaurar producto", item });
  } catch (error) {
    next(error);
  }
}

export async function restoreArchivedItem(req, res, next) {
  const itemId = validItemId(req.params.id);
  if (!itemId) return next(new AppError("Producto no encontrado", 404));

  try {
    const item = await restoreItem(itemId, req.business.id);
    if (!item) return next(new AppError("Producto no encontrado", 404));
    res.redirect(`/items/${item.id}`);
  } catch (error) {
    next(error);
  }
}

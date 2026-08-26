import pool from "../db/pool.js";
import { findExistingProductBarcodes, findExistingProductSkus, importProducts } from "../db/productImportQueries.js";
import { parseCurrencyValue } from "../utils/currency.js";
import { productImportTemplateBuffer } from "../utils/productImportTemplate.js";
import { readProductWorkbook } from "../utils/productImportWorker.js";

const activeImports = new Set();

const headers = ["nombre_producto", "sku", "codigo_barras", "descripcion", "marca", "precio", "existencias", "categoria", "existencias_minimas", "ubicacion", "proveedor"];

export async function downloadProductImportTemplate(req, res, next) {
  res.type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.set("Content-Disposition", 'attachment; filename="plantilla_importacion_productos.xlsx"');
  try { return res.send(await productImportTemplateBuffer()); } catch (error) { return next(error); }
}

function text(value) { return value === undefined || value === null ? "" : String(value).trim(); }
function isBlankRow(row) { return row.every((value) => text(value) === ""); }
function error(row, field, message) { return { row, field, message }; }
export function parseBarcode(value, row) {
  const raw = text(value).replace(/[\s-]/g, "");
  if (raw === "") return { value: null, error: null };
  if (!/^\d{8,14}$/.test(raw)) return { value: null, error: error(row, "codigo_barras", "El código de barras debe contener entre 8 y 14 dígitos.") };
  return { value: raw, error: null };
}

function parseNumber(value, row, field, integer = false) {
  const raw = text(value);
  if (raw === "") return { value: null, error: error(row, field, "El campo es obligatorio.") };
  const parsed = Number(raw.replace(",", "."));
  if (!Number.isFinite(parsed) || (integer && !Number.isInteger(parsed)) || parsed < 0) {
    return { value: null, error: error(row, field, integer ? "Las existencias deben ser números enteros mayores o iguales a cero." : "El precio no tiene un formato válido. Usa, por ejemplo, 1299.90 o $1,299.90.") };
  }
  return { value: parsed, error: null };
}

function parsePrice(value, row) {
  const parsed = parseCurrencyValue(value);
  if (parsed === null || parsed < 0) return { value: null, error: error(row, "precio", "El precio debe ser un número mayor o igual a cero.") };
  return { value: parsed, error: null };
}

export async function previewProductImport(req, res, next) {
  if (!req.file) return res.status(400).json({ error: { code: "FILE_REQUIRED", message: "Selecciona un archivo .xlsx." } });
  const importKey = `${req.session.user.id}:${req.business.id}`;
  if (activeImports.has(importKey)) return res.status(429).json({ error: { code: "IMPORT_IN_PROGRESS", message: "Ya hay una importación en curso." } });
  activeImports.add(importKey);
  try {
    const rows = await readProductWorkbook(req.file.buffer);
    const rawHeaders = (rows[0] || []).map((value) => text(value).replace(/\*$/, ""));
    const missingHeaders = headers.filter((header) => !rawHeaders.includes(header));
    if (missingHeaders.length > 0) {
      return res.status(400).json({ error: { code: "INVALID_HEADERS", message: "La plantilla no contiene los encabezados requeridos.", fields: missingHeaders.map((field) => ({ field, message: "Falta este encabezado." })) } });
    }
    const indexes = Object.fromEntries(headers.map((header) => [header, rawHeaders.indexOf(header)]));
    const dataRows = rows.slice(1).map((row, index) => ({ row, number: index + 2 })).filter(({ row }) => !isBlankRow(row));
    const errors = [];
    const products = [];
    const skuRows = new Map();
    for (const { row, number } of dataRows) {
      const product = {
        name: text(row[indexes.nombre_producto]), sku: text(row[indexes.sku]).toUpperCase(), barcode: parseBarcode(row[indexes.codigo_barras], number), description: text(row[indexes.descripcion]),
        brand: text(row[indexes.marca]), category: text(row[indexes.categoria]), location: text(row[indexes.ubicacion]), supplier: text(row[indexes.proveedor])
      };
      if (!product.name) errors.push(error(number, "nombre_producto", "El nombre del producto es obligatorio."));
      if (!product.sku) errors.push(error(number, "sku", "El SKU es obligatorio."));
      else if (skuRows.has(product.sku.toLowerCase())) errors.push(error(number, "sku", "El SKU debe ser único y conservarse como texto."));
      else skuRows.set(product.sku.toLowerCase(), number);
      const barcode = product.barcode;
      const price = parsePrice(row[indexes.precio], number);
      const stock = parseNumber(row[indexes.existencias], number, "existencias", true);
      const minimum = text(row[indexes.existencias_minimas]) === "" ? { value: null, error: null } : parseNumber(row[indexes.existencias_minimas], number, "existencias_minimas", true);
      for (const parsed of [barcode, price, stock, minimum]) if (parsed.error) errors.push(parsed.error);
      products.push({ ...product, barcode: barcode.value, price: price.value, stock: stock.value, minimumStock: minimum.value, row: number });
    }
    const existingSkus = new Set(await findExistingProductSkus(req.business.id, [...skuRows.keys()]));
    const barcodeRows = new Map();
    for (const product of products) {
      if (!product.barcode) continue;
      if (barcodeRows.has(product.barcode)) errors.push(error(product.row, "codigo_barras", "El código de barras está repetido dentro del archivo."));
      else barcodeRows.set(product.barcode, product.row);
    }
    const existingBarcodes = new Set(await findExistingProductBarcodes(req.business.id, [...barcodeRows.keys()]));
    for (const product of products) if (product.barcode && existingBarcodes.has(product.barcode)) errors.push(error(product.row, "codigo_barras", "El código de barras ya existe en este negocio."));
    for (const product of products) if (existingSkus.has(product.sku.toLowerCase())) errors.push(error(product.row, "sku", "El SKU ya existe."));
    const invalidRows = new Set(errors.map((item) => item.row));
    const validProducts = products.filter((product) => !invalidRows.has(product.row)).map(({ row, ...product }) => product);
    return res.status(200).json({ data: { valid: errors.length === 0, totalRows: dataRows.length, validRows: validProducts.length, invalidRows: invalidRows.size, products: validProducts, errors } });
  } catch (err) { return next(err); }
  finally { activeImports.delete(importKey); }
}

export async function confirmProductImport(req, res, next) {
  const products = req.body?.products;
  if (!Array.isArray(products) || products.length === 0 || products.length > 1000) return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Envía productos válidos para importar." } });
  const importKey = `${req.session.user.id}:${req.business.id}`;
  if (activeImports.has(importKey)) return res.status(429).json({ error: { code: "IMPORT_IN_PROGRESS", message: "Ya hay una importación en curso." } });
  activeImports.add(importKey);
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const created = await importProducts(client, req.business.id, req.session.user.id, products);
    await client.query("COMMIT");
    return res.status(201).json({ data: { imported: created.length, products: created.map((item) => ({ id: item.id, name: item.name, sku: item.sku, stock: Number(item.stock) })) } });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    if (["SKU_DUPLICATE", "SKU_ALREADY_EXISTS", "LOCATION_NOT_FOUND"].includes(err.code)) return res.status(409).json({ error: { code: err.code, message: err.message } });
    return next(err);
  } finally { client?.release(); activeImports.delete(importKey); }
}

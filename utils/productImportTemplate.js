import { productImportTemplateBuffer as createWorkbook } from "./productImportWorkbook.js";

const headers = ["nombre_producto", "sku", "codigo_barras", "descripcion", "marca", "precio", "existencias", "categoria", "existencias_minimas", "ubicacion", "proveedor"];

export function productImportTemplateBuffer() { return createWorkbook(headers); }

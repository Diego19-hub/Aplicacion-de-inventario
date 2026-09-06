import { productImportTemplateBuffer as createWorkbook } from "./productImportWorkbook.js";

const headers = ["nombre_producto", "sku", "codigo_barras", "descripcion", "marca", "precio", "existencias", "categoria", "existencias_minimas", "ubicacion", "proveedor"];

export function productImportTemplateBuffer() { return createWorkbook(headers); }

//Importa la función que crea el archivo de Excel desde el módulo de seguridad (productImportWorkbook.js) que analizamos hace un momento, pero le cambia el nombre localmente a createWorkbook para evitar confusiones.Define los encabezados (const headers = [...])Establece la estructura exacta de las columnas que tendrá el Excel descargable. En este caso, define 11 campos clave para dar de alta un producto:
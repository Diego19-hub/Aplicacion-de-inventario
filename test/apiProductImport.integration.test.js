import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import pg from "pg";
import request from "supertest";
import ExcelJS from "exceljs";

import { createTestDatabase, dropTestDatabase } from "./helpers/testDatabase.js";

const { Client } = pg;
const skip = !process.env.TEST_DATABASE_URL;
const original = { NODE_ENV: process.env.NODE_ENV, DATABASE_URL: process.env.DATABASE_URL, SESSION_SECRET: process.env.SESSION_SECRET };

function restore() {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
}

async function workbookBuffer(rows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Productos");
  rows.forEach((row) => sheet.addRow(row));
  return workbook.xlsx.writeBuffer();
}

async function login(app, identifier, password) {
  const agent = request.agent(app);
  const csrf = (await agent.get("/api/csrf-token")).body.data.csrfToken;
  await agent.post("/api/auth/login").set("x-csrf-token", csrf).send({ identifier, password }).expect(200);
  return agent;
}

test("importación masiva de productos valida Excel y confirma atómicamente", { skip }, async (t) => {
  let client;
  let databaseCreated = false;
  try {
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "import-test-secret";
    await createTestDatabase();
    databaseCreated = true;
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await client.connect();
    const password = "import-owner-password";
    const hash = await bcrypt.hash(password, 10);
    const owner = (await client.query(`SELECT u.id, u.username, b.id AS business_id FROM users u JOIN business_members bm ON bm.user_id=u.id JOIN businesses b ON b.id=bm.business_id WHERE bm.role='owner' AND bm.status='active' AND b.status='active' LIMIT 1`)).rows[0];
    await client.query("UPDATE users SET username=$1,email=$2,password_hash=$3 WHERE id=$4", ["import_owner", "import-owner@example.test", hash, owner.id]);
    await client.query("INSERT INTO items (business_id,sku,name,description,brand,price,stock,category_id,status) SELECT $1,'EXIST-001','Existente','x','Marca',1,0,id,'active' FROM categories WHERE business_id=$1 AND is_default LIMIT 1", [owner.business_id]);
    const { default: app } = await import("../app.js");
    const agent = await login(app, "import_owner", password);
    const headers = ["nombre_producto", "sku", "codigo_barras", "descripcion", "marca", "precio", "existencias", "categoria", "existencias_minimas", "ubicacion", "proveedor"];
    const validRow = ["Producto importado", "IMP-001", "", "Descripción", "Marca", "12.50", "4", "", "1", "MAIN", "Proveedor demo"];

    await t.test("archivo válido, filas vacías y SKU existente", async () => {
      const csrf = (await agent.get("/api/csrf-token")).body.data.csrfToken;
      const response = await agent.post("/api/products/import/preview").set("x-csrf-token", csrf).attach("file", await workbookBuffer([headers, validRow, [], ["Otro", "EXIST-001", "", "", "", "2", "1"]]), "Hoja de cálculo sin título.xlsx").expect(200);
      assert.equal(response.body.data.totalRows, 2);
      assert.equal(response.body.data.validRows, 1);
      assert.equal(response.body.data.invalidRows, 1);
      assert.equal(response.body.data.errors[0].message, "El SKU ya existe.");
    });

    await t.test("confirmación válida crea el producto en el negocio activo", async () => {
      const csrf = (await agent.get("/api/csrf-token")).body.data.csrfToken;
      const response = await agent.post("/api/products/import/confirm").set("x-csrf-token", csrf).send({ products: [{ name: "Confirmado", sku: "CONF-001", description: "", brand: "Marca", price: 5, stock: 2, category: "", location: "MAIN", minimumStock: 1 }] }).expect(201);
      assert.equal(response.body.data.imported, 1);
      const stored = await client.query("SELECT business_id, stock FROM items WHERE sku='CONF-001'");
      assert.deepEqual(stored.rows[0], { business_id: owner.business_id, stock: 2 });
    });

    await t.test("encabezados, SKU duplicado y números inválidos", async () => {
      const csrf = (await agent.get("/api/csrf-token")).body.data.csrfToken;
      const response = await agent.post("/api/products/import/preview").set("x-csrf-token", csrf).attach("file", await workbookBuffer([["nombre_producto", "sku"], ["A", "DUP-1"], ["B", "DUP-1"], ["C", "NUM-1", "", "", "-1", "-2"]]), "plantilla.xlsx").expect(400);
      assert.equal(response.body.error.code, "INVALID_HEADERS");
      const valid = await agent.post("/api/products/import/preview").set("x-csrf-token", csrf).attach("file", await workbookBuffer([headers, ["A", "DUP-1", "", "", "", "-1", "-2"], ["B", "DUP-1", "", "", "", "1", "1"]]), "plantilla.xlsx").expect(200);
      assert.ok(valid.body.data.errors.some((item) => item.field === "precio"));
      assert.ok(valid.body.data.errors.some((item) => item.field === "existencias"));
      assert.ok(valid.body.data.errors.some((item) => item.field === "sku" && item.message === "El SKU debe ser único y conservarse como texto."));
    });

    await t.test("confirmación hace rollback completo", async () => {
      const csrf = (await agent.get("/api/csrf-token")).body.data.csrfToken;
      await agent.post("/api/products/import/confirm").set("x-csrf-token", csrf).send({ products: [{ name: "Primero", sku: "ROLL-001", description: "", brand: "Marca", price: 1, stock: 1, category: "", location: "MAIN", minimumStock: null }, { name: "Duplicado", sku: "ROLL-001", description: "", brand: "Marca", price: 1, stock: 1, category: "", location: "MAIN", minimumStock: null }] }).expect(409);
      const count = await client.query("SELECT count(*)::integer AS count FROM items WHERE business_id=$1 AND sku='ROLL-001'", [owner.business_id]);
      assert.equal(count.rows[0].count, 0);
    });

    await t.test("usuario sin permiso no puede previsualizar", async () => {
      const viewer = (await client.query("INSERT INTO users(username,email,password_hash,platform_role) VALUES($1,$2,$3,'user') RETURNING id", ["import_viewer", "import-viewer@example.test", hash])).rows[0];
      await client.query("INSERT INTO business_members(business_id,user_id,role,status) VALUES($1,$2,'viewer','active')", [owner.business_id, viewer.id]);
      const viewerAgent = await login(app, "import_viewer", password);
      const csrf = (await viewerAgent.get("/api/csrf-token")).body.data.csrfToken;
      await viewerAgent.post("/api/products/import/preview").set("x-csrf-token", csrf).attach("file", await workbookBuffer([headers, validRow]), "plantilla.xlsx").expect(403);
    });

    await t.test("usuario autenticado sin negocio activo recibe 409", async () => {
      const noBusiness = (await client.query("INSERT INTO users(username,email,password_hash,platform_role) VALUES($1,$2,$3,'user') RETURNING id", ["import_no_business", "import-no-business@example.test", hash])).rows[0];
      const noBusinessAgent = await login(app, "import_no_business", password);
      const csrf = (await noBusinessAgent.get("/api/csrf-token")).body.data.csrfToken;
      await noBusinessAgent.post("/api/products/import/preview").set("x-csrf-token", csrf).attach("file", await workbookBuffer([headers, validRow]), "plantilla.xlsx").expect(409);
      assert.ok(noBusiness.id);
    });
  } finally {
    await client?.end().catch(() => {});
    if (databaseCreated) await dropTestDatabase().catch(() => {});
    restore();
  }
});

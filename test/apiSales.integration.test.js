import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import pg from "pg";
import request from "supertest";

import { createTestDatabase, dropTestDatabase } from "./helpers/testDatabase.js";

const { Client } = pg;
const skip = !process.env.TEST_DATABASE_URL;
const original = {
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL,
  SESSION_SECRET: process.env.SESSION_SECRET
};

function restoreEnvironment() {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

async function csrf(agent) {
  return (await agent.get("/api/csrf-token")).body.data.csrfToken;
}

async function login(app, identifier, password) {
  const agent = request.agent(app);
  const token = (await agent.get("/api/csrf-token")).body.data.csrfToken;
  const response = await agent.post("/api/auth/login")
    .set("x-csrf-token", token)
    .send({ identifier, password })
    ;
  if (response.status !== 200) {
    console.error("LOGIN ERROR:", identifier, response.status, response.body);
  }
  assert.equal(response.status, 200);
  return agent;
}

async function createSale(agent, payload, status) {
  return agent.post("/api/sales")
    .set("x-csrf-token", await csrf(agent))
    .send(payload)
    .expect(status);
}

test("backend POS protege y registra ventas atómicamente", { skip }, async (t) => {
  let client;
  let pool;
  let databaseCreated = false;

  try {
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "pos-integration-secret";
    await createTestDatabase();
    databaseCreated = true;
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await client.connect();

    const password = "pos-owner-password";
    const hash = await bcrypt.hash(password, 10);
    const owner = (await client.query(`
      SELECT u.id, b.id AS business_id
      FROM users u
      JOIN business_members bm ON bm.user_id = u.id
      JOIN businesses b ON b.id = bm.business_id
      WHERE bm.role = 'owner' AND bm.status = 'active' AND b.status = 'active'
      LIMIT 1
    `)).rows[0];
    await client.query("UPDATE users SET username=$1,email=$2,password_hash=$3 WHERE id=$4", ["pos_owner", "pos-owner@example.test", hash, owner.id]);
    const location = (await client.query("SELECT id FROM business_locations WHERE business_id=$1 AND status='active' AND is_default ORDER BY id LIMIT 1", [owner.business_id])).rows[0];
    const secondLocation = (await client.query("INSERT INTO business_locations(business_id,name,code,location_type,status,is_default) VALUES($1,'Bodega POS secundaria','POS-2','warehouse','active',false) RETURNING id", [owner.business_id])).rows[0];
    const category = (await client.query("INSERT INTO categories(name,description,business_id) VALUES($1,$2,$3) RETURNING id", ["POS", "Categoría POS", owner.business_id])).rows[0];
    const product = (await client.query(`
      INSERT INTO items (business_id,sku,name,description,brand,price,cost_price,stock,category_id,status)
      VALUES ($1,'POS-001','Producto POS','Producto para prueba','Marca',10,4,5,$2,'active') RETURNING id
    `, [owner.business_id, category.id])).rows[0];
    await client.query("INSERT INTO inventory_balances(business_id,location_id,item_id,stock) VALUES($1,$2,$3,5)", [owner.business_id, location.id, product.id]);
    const cashProduct = (await client.query(`
      INSERT INTO items (business_id,sku,name,description,brand,price,cost_price,stock,category_id,status)
      VALUES ($1,'POS-CASH','Producto efectivo','Producto para venta en efectivo','Marca',650,400,2,$2,'active') RETURNING id
    `, [owner.business_id, category.id])).rows[0];
    await client.query("INSERT INTO inventory_balances(business_id,location_id,item_id,stock) VALUES($1,$2,$3,2)", [owner.business_id, location.id, cashProduct.id]);
    const secondProduct = (await client.query(`
      INSERT INTO items (business_id,sku,name,description,brand,price,stock,category_id,status)
      VALUES ($1,'POS-002','Segundo POS','Producto para prueba','Marca',7.50,4,$2,'active') RETURNING id
    `, [owner.business_id, category.id])).rows[0];
    await client.query("INSERT INTO inventory_balances(business_id,location_id,item_id,stock) VALUES($1,$2,$3,4)", [owner.business_id, location.id, secondProduct.id]);
    const archived = (await client.query(`
      INSERT INTO items (business_id,sku,name,description,brand,price,stock,category_id,status,archived_at,archived_by,archive_reason)
      VALUES ($1,'POS-ARC','Archivado POS','Producto archivado','Marca',5,0,$2,'archived',CURRENT_TIMESTAMP,$3,'Prueba') RETURNING id
    `, [owner.business_id, category.id, owner.id])).rows[0];

    const viewer = (await client.query("INSERT INTO users(username,email,password_hash,platform_role) VALUES($1,$2,$3,'user') RETURNING id", ["pos_viewer", "pos-viewer@example.test", hash])).rows[0];
    await client.query("INSERT INTO business_members(business_id,user_id,role,status) VALUES($1,$2,'viewer','active')", [owner.business_id, viewer.id]);
    const manager = (await client.query("INSERT INTO users(username,email,password_hash,platform_role) VALUES($1,$2,$3,'user') RETURNING id", ["pos_manager", "pos-manager@example.test", hash])).rows[0];
    await client.query("INSERT INTO business_members(business_id,user_id,role,status) VALUES($1,$2,'manager','active')", [owner.business_id, manager.id]);
    const noBusiness = (await client.query("INSERT INTO users(username,email,password_hash,platform_role) VALUES($1,$2,$3,'user') RETURNING id", ["pos_no_business", "pos-no-business@example.test", hash])).rows[0];

    const foreignUser = (await client.query("INSERT INTO users(username,email,password_hash,platform_role) VALUES($1,$2,$3,'user') RETURNING id", ["pos_foreign", "pos-foreign@example.test", hash])).rows[0];
    await client.query("BEGIN");
    let foreignBusiness;
    let foreignCategory;
    let foreignLocation;
    let foreignRegister;
    let foreignSession;
    let foreignProduct;
    let foreignSale;
    try {
    foreignBusiness = (await client.query("INSERT INTO businesses(name,slug,created_by,status) VALUES($1,$2,$3,'active') RETURNING id", ["Negocio POS ajeno", "negocio-pos-ajeno", foreignUser.id])).rows[0];
    await client.query("INSERT INTO business_members(business_id,user_id,role,status) VALUES($1,$2,'owner','active')", [foreignBusiness.id, foreignUser.id]);
    await client.query("INSERT INTO categories(business_id,name,description,is_default) VALUES($1,'General','Categoría predeterminada',true)", [foreignBusiness.id]);
    await client.query("INSERT INTO business_locations(business_id,name,code,location_type,status,is_default) VALUES($1,'Caja ajena','POS-AJENA','warehouse','active',true)", [foreignBusiness.id]);
    foreignLocation = (await client.query("SELECT id FROM business_locations WHERE business_id=$1 AND status='active' AND is_default ORDER BY id LIMIT 1", [foreignBusiness.id])).rows[0];
    foreignRegister = (await client.query("INSERT INTO cash_registers(business_id,location_id,name) VALUES($1,$2,$3) RETURNING id", [foreignBusiness.id, foreignLocation.id, "Caja ajena"])).rows[0];
    foreignSession = (await client.query("INSERT INTO cash_sessions(business_id,register_id,opened_by,opening_amount,expected_amount) VALUES($1,$2,$3,100,100) RETURNING id", [foreignBusiness.id, foreignRegister.id, foreignUser.id])).rows[0];
    foreignCategory = (await client.query("INSERT INTO categories(name,description,business_id) VALUES($1,$2,$3) RETURNING id", ["POS ajena", "Categoría", foreignBusiness.id])).rows[0];
    foreignProduct = (await client.query(`INSERT INTO items (business_id,sku,name,description,brand,price,stock,category_id,status) VALUES($1,'POS-FOR','Producto ajeno','Producto','Marca',1,2,$2,'active') RETURNING id`, [foreignBusiness.id, foreignCategory.id])).rows[0];
    await client.query("INSERT INTO inventory_balances(business_id,location_id,item_id,stock) VALUES($1,$2,$3,2)", [foreignBusiness.id, foreignLocation.id, foreignProduct.id]);
    foreignSale = (await client.query(`
      INSERT INTO sales (business_id, location_id, created_by, payment_method, subtotal, total, amount_received, change_amount)
      VALUES ($1,$2,$3,'cash',1,1,1,0) RETURNING id
    `, [foreignBusiness.id, foreignLocation.id, foreignUser.id])).rows[0];
    await client.query("INSERT INTO sale_items(business_id,sale_id,item_id,quantity,unit_price,line_total) VALUES($1,$2,$3,2,0.50,1)", [foreignBusiness.id, foreignSale.id, foreignProduct.id]);
    await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }

    const { default: app } = await import("../app.js");
    const { default: importedPool } = await import("../db/pool.js");
    pool = importedPool;

    await t.test("usuario no autenticado", async () => {
      await request(app).get("/api/pos/products").expect(401);
      await request(app).get("/api/sales").expect(401);
      await request(app).get("/api/sales/1").expect(401);
      await request(app).get("/api/cash/sessions").expect(401);
      await request(app).get("/api/cash/sessions/1/movements").expect(401);
    });

    await t.test("negocio no seleccionado", async () => {
      const agent = await login(app, "pos_no_business", password);
      await agent.get("/api/pos/form-options").expect(409);
      await agent.get("/api/sales").expect(409);
      await agent.get("/api/sales/1").expect(409);
      await agent.get("/api/cash/sessions").expect(409);
      await agent.get("/api/cash/sessions/1/movements").expect(409);
    });

    const viewerAgent = await login(app, "pos_viewer", password);
    await t.test("viewer sin permiso", async () => {
      const response = await createSale(viewerAgent, { locationId: location.id, paymentMethod: "cash", amountReceived: 10, items: [{ itemId: product.id, quantity: 1 }] }, 403);
      assert.equal(response.body.error.code, "FORBIDDEN");
    });

    const ownerAgent = await login(app, "pos_owner", password);
    const managerAgent = await login(app, "pos_manager", password);
    await t.test("form-options y búsqueda POS", async () => {
      const options = await ownerAgent.get("/api/pos/form-options").expect(200);
      assert.equal(options.body.data.defaultLocationId, location.id);
      assert.deepEqual(options.body.data.paymentMethods, ["cash", "card", "transfer"]);
      const products = await ownerAgent.get(`/api/pos/products?q=POS-001&locationId=${location.id}`).expect(200);
      assert.equal(products.body.data.products[0].stock, 5);
      const foreignProducts = await ownerAgent.get(`/api/pos/products?q=POS-FOR&locationId=${location.id}`).expect(200);
      assert.deepEqual(foreignProducts.body.data.products, []);

      const managerOptions = await managerAgent.get("/api/pos/form-options").expect(200);
      assert.equal(managerOptions.body.data.defaultLocationId, location.id);
      const managerProducts = await managerAgent.get(`/api/pos/products?q=POS-001&locationId=${location.id}`).expect(200);
      assert.equal(managerProducts.body.data.products[0].id, Number(product.id));

      const viewerOptions = await viewerAgent.get("/api/pos/form-options").expect(403);
      assert.equal(viewerOptions.body.error.code, "FORBIDDEN");
      const viewerProducts = await viewerAgent.get(`/api/pos/products?q=POS-001&locationId=${location.id}`).expect(403);
      assert.equal(viewerProducts.body.error.code, "FORBIDDEN");
    });

    await t.test("owner crea venta y actualiza stock, líneas y movimiento", async () => {
      const response = await createSale(ownerAgent, { locationId: location.id, paymentMethod: "card", items: [{ itemId: product.id, quantity: 2 }] }, 201);
      assert.equal(response.body.data.sale.total, 20);
      assert.equal(response.body.data.sale.changeAmount, 0);
      const stored = (await client.query(`
        SELECT i.stock,
          (SELECT stock FROM inventory_balances WHERE business_id=$1 AND location_id=$2 AND item_id=$3) AS balance,
          (SELECT COUNT(*)::INTEGER FROM sales WHERE business_id=$1) AS sales,
          (SELECT COUNT(*)::INTEGER FROM sale_items WHERE business_id=$1) AS sale_items,
          (SELECT COUNT(*)::INTEGER FROM inventory_movements WHERE business_id=$1 AND item_id=$3 AND reference LIKE 'SALE-%') AS movements
        FROM items i WHERE i.business_id=$1 AND i.id=$3
      `, [owner.business_id, location.id, product.id])).rows[0];
      assert.deepEqual(stored, { stock: 3, balance: 3, sales: 1, sale_items: 1, movements: 1 });
      const storedLine = (await client.query("SELECT unit_price, unit_cost, line_total FROM sale_items WHERE business_id=$1 AND sale_id=$2", [owner.business_id, response.body.data.sale.id])).rows[0];
      assert.deepEqual(storedLine, { unit_price: "10.00", unit_cost: "4.00", line_total: "20.00" });
    });

    await t.test("manager crea venta", async () => {
      await createSale(managerAgent, { locationId: location.id, paymentMethod: "card", items: [{ itemId: secondProduct.id, quantity: 1 }] }, 201);
    });

    await t.test("Caja: consultas, permisos, apertura, movimientos, cierre y aislamiento", async () => {
      await request(app).get("/api/cash/registers").expect(401);
      await (await login(app, "pos_no_business", password)).get("/api/cash/registers").expect(409);

      const registerResponse = await ownerAgent.post("/api/cash/registers")
        .set("x-csrf-token", await csrf(ownerAgent))
        .send({ locationId: location.id, name: "Caja POS principal" })
        .expect(201);
      const registerId = registerResponse.body.data.register.id;

      const viewerRegisters = await viewerAgent.get("/api/cash/registers").expect(200);
      assert.equal(viewerRegisters.body.data.registers.length, 1);
      assert.equal(viewerRegisters.body.data.registers[0].id, registerId);
      assert.equal(viewerRegisters.body.data.registers.some((register) => register.id === Number(foreignRegister.id)), false);
      await viewerAgent.post("/api/cash/registers")
        .set("x-csrf-token", await csrf(viewerAgent))
        .send({ locationId: location.id, name: "Caja no permitida" })
        .expect(403);

      const cashWithoutSession = await createSale(ownerAgent, { locationId: location.id, paymentMethod: "cash", amountReceived: 650, items: [{ itemId: cashProduct.id, quantity: 1 }] }, 409);
      assert.equal(cashWithoutSession.body.error.code, "CASH_SESSION_REQUIRED");
      const cashWrongLocation = await createSale(ownerAgent, { locationId: secondLocation.id, paymentMethod: "cash", amountReceived: 650, items: [{ itemId: cashProduct.id, quantity: 1 }] }, 409);
      assert.equal(cashWrongLocation.body.error.code, "CASH_SESSION_REQUIRED");

      const opened = await ownerAgent.post("/api/cash/sessions/open")
        .set("x-csrf-token", await csrf(ownerAgent))
        .send({ registerId, openingAmount: 500 })
        .expect(201);
      const sessionId = opened.body.data.session.id;
      assert.equal(opened.body.data.session.openingAmount, 500);

      const cashSale = await createSale(ownerAgent, { locationId: location.id, paymentMethod: "cash", amountReceived: 650, items: [{ itemId: cashProduct.id, quantity: 1, unitCost: 999999 }] }, 201);
      const storedCashSale = (await client.query("SELECT cash_session_id, total FROM sales WHERE business_id=$1 AND id=$2", [owner.business_id, cashSale.body.data.sale.id])).rows[0];
      assert.equal(Number(storedCashSale.cash_session_id), sessionId);
      assert.equal(Number(storedCashSale.total), 650);
      const storedCashLine = (await client.query("SELECT unit_price, unit_cost, line_total FROM sale_items WHERE business_id=$1 AND sale_id=$2", [owner.business_id, cashSale.body.data.sale.id])).rows[0];
      assert.deepEqual(storedCashLine, { unit_price: "650.00", unit_cost: "400.00", line_total: "650.00" });
      const storedCashMovement = (await client.query("SELECT movement_type, amount, session_id, reason FROM cash_movements WHERE business_id=$1 AND session_id=$2 AND movement_type='sale' ORDER BY id DESC LIMIT 1", [owner.business_id, sessionId])).rows[0];
      assert.deepEqual(storedCashMovement, { movement_type: "sale", amount: "650.00", session_id: sessionId, reason: "Venta en punto de venta" });
      const transferSale = await createSale(managerAgent, { locationId: location.id, paymentMethod: "transfer", items: [{ itemId: secondProduct.id, quantity: 1 }] }, 201);
      const storedTransferSale = (await client.query("SELECT cash_session_id FROM sales WHERE business_id=$1 AND id=$2", [owner.business_id, transferSale.body.data.sale.id])).rows[0];
      assert.equal(storedTransferSale.cash_session_id, null);
      const cashSaleMovements = (await client.query("SELECT COUNT(*)::INTEGER AS count FROM cash_movements WHERE business_id=$1 AND session_id=$2 AND movement_type='sale'", [owner.business_id, sessionId])).rows[0];
      assert.equal(cashSaleMovements.count, 1);

      const duplicateOpen = await ownerAgent.post("/api/cash/sessions/open")
        .set("x-csrf-token", await csrf(ownerAgent))
        .send({ registerId, openingAmount: 100 })
        .expect(409);
      assert.equal(duplicateOpen.body.error.code, "CASH_SESSION_ALREADY_OPEN");

      const currentForViewer = await viewerAgent.get("/api/cash/sessions/current").expect(200);
      assert.equal(currentForViewer.body.data.session.id, sessionId);
      assert.equal(currentForViewer.body.data.session.openingAmount, 500);

      await managerAgent.post(`/api/cash/sessions/${sessionId}/movements`)
        .set("x-csrf-token", await csrf(managerAgent))
        .send({ movementType: "cash_in", amount: 100, reason: "Cambio inicial" })
        .expect(201);
      await managerAgent.post(`/api/cash/sessions/${sessionId}/movements`)
        .set("x-csrf-token", await csrf(managerAgent))
        .send({ movementType: "cash_out", amount: 50, reason: "Retiro para depósito" })
        .expect(201);
      const insufficient = await managerAgent.post(`/api/cash/sessions/${sessionId}/movements`)
        .set("x-csrf-token", await csrf(managerAgent))
        .send({ movementType: "cash_out", amount: 1300, reason: "Retiro excesivo" })
        .expect(409);
      assert.equal(insufficient.body.error.code, "CASH_INSUFFICIENT_FUNDS");

      const current = await ownerAgent.get("/api/cash/sessions/current").expect(200);
      assert.equal(current.body.data.session.totalCashIn, 100);
      assert.equal(current.body.data.session.totalCashOut, 50);
      assert.equal(current.body.data.session.cashSales, 650);
      assert.equal(current.body.data.session.expectedAmount, 1200);

      const openHistory = await viewerAgent.get(`/api/cash/sessions?registerId=${registerId}&status=open&limit=1`).expect(200);
      assert.equal(openHistory.body.data.pagination.totalItems, 1);
      assert.equal(openHistory.body.data.sessions[0].status, "open");
      assert.equal(openHistory.body.data.sessions[0].cashSales, 650);
      assert.equal(openHistory.body.data.sessions[0].expectedAmount, 1200);
      assert.equal(openHistory.body.data.sessions.some((session) => session.id === Number(foreignSession.id)), false);
      const openMovements = await viewerAgent.get(`/api/cash/sessions/${sessionId}/movements`).expect(200);
      assert.deepEqual(openMovements.body.data.movements.map((movement) => movement.movementType), ["opening", "sale", "cash_in", "cash_out"]);

      const closed = await ownerAgent.post(`/api/cash/sessions/${sessionId}/close`)
        .set("x-csrf-token", await csrf(ownerAgent))
        .send({ closingAmount: 1250 })
        .expect(200);
      assert.equal(closed.body.data.session.expectedAmount, 1200);
      assert.equal(closed.body.data.session.differenceAmount, 50);
      const closedHistory = await ownerAgent.get(`/api/cash/sessions?status=closed&dateFrom=2026-01-01&dateTo=2099-12-31&limit=1&page=1`).expect(200);
      assert.equal(closedHistory.body.data.pagination.pageSize, 1);
      assert.equal(closedHistory.body.data.pagination.totalItems, 1);
      assert.equal(closedHistory.body.data.sessions[0].status, "closed");
      assert.equal(closedHistory.body.data.sessions[0].closingAmount, 1250);
      assert.equal(closedHistory.body.data.sessions[0].differenceAmount, 50);
      const closedMovements = await ownerAgent.get(`/api/cash/sessions/${sessionId}/movements`).expect(200);
      assert.equal(closedMovements.body.data.movements.at(-1).movementType, "closing_adjustment");
      const closedAgain = await ownerAgent.post(`/api/cash/sessions/${sessionId}/close`)
        .set("x-csrf-token", await csrf(ownerAgent))
        .send({ closingAmount: 1250 })
        .expect(409);
      assert.equal(closedAgain.body.error.code, "CASH_SESSION_ALREADY_CLOSED");

      const foreignOpen = await ownerAgent.post("/api/cash/sessions/open")
        .set("x-csrf-token", await csrf(ownerAgent))
        .send({ registerId: foreignRegister.id, openingAmount: 10 })
        .expect(404);
      assert.equal(foreignOpen.body.error.code, "CASH_REGISTER_NOT_FOUND");
    });

    await t.test("historial: roles autorizados, paginación y aislamiento", async () => {
      const response = await ownerAgent.get("/api/sales?limit=1&page=1").expect(200);
      assert.equal(response.body.data.sales.length, 1);
      assert.equal(response.body.data.pagination.pageSize, 1);
      assert.equal(response.body.data.pagination.totalItems, 4);
      assert.equal(response.body.data.pagination.totalPages, 4);
      assert.equal(response.body.data.sales[0].itemCount, 1);
      assert.ok(!response.body.data.sales.some((sale) => sale.id === Number(foreignSale.id)));

      const secondPage = await ownerAgent.get("/api/sales?limit=1&page=2").expect(200);
      assert.equal(secondPage.body.data.sales.length, 1);
      assert.notEqual(secondPage.body.data.sales[0].id, response.body.data.sales[0].id);

      const managerHistory = await managerAgent.get("/api/sales?paymentMethod=card").expect(200);
      assert.equal(managerHistory.body.data.sales.length, 1);
      assert.equal(managerHistory.body.data.sales[0].paymentMethod, "card");

      const viewerHistory = await viewerAgent.get("/api/sales?status=completed").expect(200);
      assert.equal(viewerHistory.body.data.sales.length, 4);
    });

    await t.test("historial: búsqueda por usuario/número y fechas", async () => {
      const ownerSale = (await client.query("SELECT id FROM sales WHERE business_id=$1 AND payment_method='cash' ORDER BY id LIMIT 1", [owner.business_id])).rows[0];
      const managerSale = (await client.query("SELECT id FROM sales WHERE business_id=$1 AND payment_method='card' ORDER BY id LIMIT 1", [owner.business_id])).rows[0];
      await client.query("UPDATE sales SET created_at=$1 WHERE business_id=$2 AND id=$3", ["2026-08-01T10:00:00Z", owner.business_id, ownerSale.id]);
      await client.query("UPDATE sales SET created_at=$1 WHERE business_id=$2 AND id=$3", ["2026-08-15T10:00:00Z", owner.business_id, managerSale.id]);

      const byUser = await ownerAgent.get("/api/sales?q=pos_owner").expect(200);
      assert.equal(byUser.body.data.sales.length, 2);
      assert.equal(byUser.body.data.sales[0].username, "pos_owner");
      const byDate = await ownerAgent.get("/api/sales?dateFrom=2026-08-10&dateTo=2026-08-20").expect(200);
      assert.equal(byDate.body.data.sales.length, 2);
      assert.ok(byDate.body.data.sales.some((sale) => sale.id === Number(managerSale.id)));
      assert.ok(byDate.body.data.sales.every((sale) => sale.businessId === undefined || sale.businessId === Number(owner.business_id)));
      const noMatch = await ownerAgent.get("/api/sales?q=does-not-exist").expect(200);
      assert.deepEqual(noMatch.body.data.sales, []);
    });

    await t.test("detalle de venta: roles, aislamiento, artículos y movimientos", async () => {
      const ownerSale = (await client.query("SELECT id FROM sales WHERE business_id=$1 AND payment_method='card' AND created_by=$2 ORDER BY id LIMIT 1", [owner.business_id, owner.id])).rows[0];
      await client.query("UPDATE items SET price=$1 WHERE business_id=$2 AND id=$3", [99, owner.business_id, product.id]);

      const ownerDetail = await ownerAgent.get(`/api/sales/${ownerSale.id}`).expect(200);
      assert.equal(ownerDetail.body.data.sale.id, Number(ownerSale.id));
      assert.equal(ownerDetail.body.data.sale.username, "pos_owner");
      assert.equal(ownerDetail.body.data.sale.location.id, location.id);
      assert.equal(ownerDetail.body.data.sale.total, 20);
      assert.deepEqual(ownerDetail.body.data.items, [{
        itemId: Number(product.id),
        name: "Producto POS",
        sku: "POS-001",
        barcode: null,
        quantity: 2,
        unitPrice: 10,
        unitCost: 4,
        costTotal: 8,
        marginTotal: 12,
        lineTotal: 20
      }]);
      assert.equal(ownerDetail.body.data.movements.length, 1);
      assert.equal(ownerDetail.body.data.movements[0].movementType, "exit");
      assert.equal(ownerDetail.body.data.movements[0].quantityDelta, -2);
      assert.equal(ownerDetail.body.data.movements[0].reference, `SALE-${ownerSale.id}`);

      const managerSale = (await client.query("SELECT id FROM sales WHERE business_id=$1 AND payment_method='card' AND created_by=$2 ORDER BY id LIMIT 1", [owner.business_id, manager.id])).rows[0];
      const nullCostDetail = await managerAgent.get(`/api/sales/${managerSale.id}`).expect(200);
      assert.equal(nullCostDetail.body.data.items[0].unitCost, null);
      assert.equal(nullCostDetail.body.data.items[0].costTotal, null);
      assert.equal(nullCostDetail.body.data.items[0].marginTotal, null);

      await managerAgent.get(`/api/sales/${ownerSale.id}`).expect(200);
      await viewerAgent.get(`/api/sales/${ownerSale.id}`).expect(200);
      await ownerAgent.get(`/api/sales/${Number(ownerSale.id) + 999999}`).expect(404);
      await ownerAgent.get(`/api/sales/${foreignSale.id}`).expect(404);
    });

    await t.test("producto ajeno y archivado rechazados", async () => {
      const foreign = await createSale(ownerAgent, { locationId: location.id, paymentMethod: "cash", amountReceived: 1, items: [{ itemId: foreignProduct.id, quantity: 1 }] }, 409);
      assert.equal(foreign.body.error.code, "POS_PRODUCT_NOT_FOUND");
      const inactive = await createSale(ownerAgent, { locationId: location.id, paymentMethod: "cash", amountReceived: 5, items: [{ itemId: archived.id, quantity: 1 }] }, 409);
      assert.equal(inactive.body.error.code, "POS_PRODUCT_INACTIVE");
    });

    await t.test("stock insuficiente y efectivo insuficiente", async () => {
      const stock = await createSale(ownerAgent, { locationId: location.id, paymentMethod: "card", items: [{ itemId: product.id, quantity: 4 }] }, 409);
      assert.equal(stock.body.error.code, "POS_INSUFFICIENT_STOCK");
      const cash = await createSale(ownerAgent, { locationId: location.id, paymentMethod: "cash", amountReceived: 1, items: [{ itemId: product.id, quantity: 1 }] }, 409);
      assert.equal(cash.body.error.code, "POS_CASH_INSUFFICIENT");
    });

    await t.test("rechaza duplicados y hace rollback ante error interno", async () => {
      const duplicate = await createSale(ownerAgent, { locationId: location.id, paymentMethod: "card", items: [{ itemId: product.id, quantity: 1 }, { itemId: product.id, quantity: 1 }] }, 400);
      assert.equal(duplicate.body.error.code, "POS_DUPLICATE_ITEM");
      const before = (await client.query("SELECT stock,(SELECT COUNT(*)::INTEGER FROM sales WHERE business_id=$1) AS sales,(SELECT COUNT(*)::INTEGER FROM sale_items WHERE business_id=$1) AS sale_items,(SELECT COUNT(*)::INTEGER FROM inventory_movements WHERE business_id=$1) AS movements FROM items WHERE business_id=$1 AND id=$2", [owner.business_id, product.id])).rows[0];
      await client.query(`CREATE FUNCTION public.test_pos_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'POS test rollback'; END; $$`);
      await client.query("CREATE TRIGGER test_pos_fail_trigger BEFORE INSERT ON inventory_movements FOR EACH ROW EXECUTE FUNCTION public.test_pos_fail()");
      await createSale(ownerAgent, { locationId: location.id, paymentMethod: "card", items: [{ itemId: product.id, quantity: 1 }] }, 500);
      await client.query("DROP TRIGGER test_pos_fail_trigger ON inventory_movements");
      await client.query("DROP FUNCTION public.test_pos_fail()");
      const after = (await client.query("SELECT stock,(SELECT COUNT(*)::INTEGER FROM sales WHERE business_id=$1) AS sales,(SELECT COUNT(*)::INTEGER FROM sale_items WHERE business_id=$1) AS sale_items,(SELECT COUNT(*)::INTEGER FROM inventory_movements WHERE business_id=$1) AS movements FROM items WHERE business_id=$1 AND id=$2", [owner.business_id, product.id])).rows[0];
      assert.deepEqual(after, before);
    });
  } finally {
    await client?.end().catch(() => {});
    await pool?.end().catch(() => {});
    if (databaseCreated) await dropTestDatabase().catch(() => {});
    restoreEnvironment();
  }
});

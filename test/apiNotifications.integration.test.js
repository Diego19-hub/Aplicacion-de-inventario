import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import pg from "pg";
import request from "supertest";

import { createTestDatabase, dropTestDatabase } from "./helpers/testDatabase.js";

const { Client } = pg;
const enabled = Boolean(process.env.TEST_DATABASE_URL);
const original = {
  NODE_ENV: process.env.NODE_ENV,
  SESSION_SECRET: process.env.SESSION_SECRET,
  DATABASE_URL: process.env.DATABASE_URL
};

async function csrf(agent) {
  return (await agent.get("/api/csrf-token").expect(200)).body.data.csrfToken;
}

async function login(app, identifier, password) {
  const agent = request.agent(app);
  const token = await csrf(agent);
  const response = await agent
    .post("/api/auth/login")
    .set("x-csrf-token", token)
    .send({ identifier, password });
  assert.equal(response.status, 200, `Login respondió ${response.status}: ${JSON.stringify(response.body)}`);
  return agent;
}

test("marcar todas las notificaciones actualiza todo el negocio activo", { skip: !enabled }, async () => {
  let client;
  let pool;
  let created = false;
  try {
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "notifications-test-secret";
    await createTestDatabase();
    created = true;
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await client.connect();

    const password = "notifications-test-password";
    const hash = await bcrypt.hash(password, 10);
    const owner = (await client.query(
      `SELECT u.id, b.id AS business_id
       FROM users u
       JOIN business_members bm ON bm.user_id = u.id
       JOIN businesses b ON b.id = bm.business_id
       WHERE u.platform_role = 'super_admin'
         AND bm.role = 'owner' AND bm.status = 'active' AND b.status = 'active'
       LIMIT 1`
    )).rows[0];
    assert.ok(owner);
    await client.query(
      "UPDATE users SET username=$1,email=$2,password_hash=$3 WHERE id=$4",
      ["notifications_owner", "notifications-owner@example.test", hash, owner.id]
    );
    const loginFixture = (await client.query(
      `SELECT u.username,u.email,u.password_hash,u.platform_role,
              b.status AS business_status,bm.role,bm.status AS membership_status
       FROM users u
       JOIN business_members bm ON bm.user_id=u.id AND bm.business_id=$2
       JOIN businesses b ON b.id=bm.business_id
       WHERE u.id=$1`,
      [owner.id, owner.business_id]
    )).rows[0];
    assert.ok(loginFixture, "El fixture requiere un usuario con membresía activa.");
    assert.deepEqual({
      username: loginFixture.username,
      email: loginFixture.email,
      platformRole: loginFixture.platform_role,
      businessStatus: loginFixture.business_status,
      membershipRole: loginFixture.role,
      membershipStatus: loginFixture.membership_status
    }, {
      username: "notifications_owner",
      email: "notifications-owner@example.test",
      platformRole: "super_admin",
      businessStatus: "active",
      membershipRole: "owner",
      membershipStatus: "active"
    });
    assert.equal(await bcrypt.compare(password, loginFixture.password_hash), true);

    const foreignUser = (await client.query(
      "INSERT INTO users(username,email,password_hash,platform_role) VALUES('notifications_foreign','notifications-foreign@example.test',$1,'user') RETURNING id",
      [hash]
    )).rows[0];
    await client.query("BEGIN");
    let foreignBusiness;
    try {
      foreignBusiness = (await client.query(
        "INSERT INTO businesses(name,slug,created_by,status) VALUES('Negocio ajeno notificaciones','negocio-ajeno-notificaciones',$1,'active') RETURNING id",
        [foreignUser.id]
      )).rows[0];
      await client.query(
        "INSERT INTO business_members(business_id,user_id,role,status) VALUES($1,$2,'owner','active')",
        [foreignBusiness.id, foreignUser.id]
      );
      await client.query(
        "INSERT INTO categories(business_id,name,description,is_default) VALUES($1,'General','Categoría predeterminada',true)",
        [foreignBusiness.id]
      );
      await client.query(
        "INSERT INTO business_locations(business_id,name,code,location_type,status,is_default) VALUES($1,'Bodega ajena','NOT-AJENA','warehouse','active',true)",
        [foreignBusiness.id]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }

    const notifications = [];
    for (let index = 0; index < 21; index += 1) {
      notifications.push([
        owner.business_id,
        owner.id,
        "collection_due",
        `Aviso ${index + 1}`,
        `Mensaje ${index + 1}`,
        index % 2 ? "normal" : "high",
        false
      ]);
    }
    notifications.push([owner.business_id, owner.id, "collection_due", "Ya leída", "Mensaje leído", "normal", true]);
    for (const row of notifications) {
      await client.query(
        `INSERT INTO notifications(business_id,user_id,type,title,message,priority,is_read)
         VALUES($1,$2,$3,$4,$5,$6,$7)`,
        row
      );
    }
    await client.query(
      `INSERT INTO notifications(business_id,user_id,type,title,message,priority,is_read)
       VALUES($1,$2,'stock_alert','Aviso ajeno 1','Mensaje ajeno 1','normal',false),
             ($1,$2,'stock_alert','Aviso ajeno 2','Mensaje ajeno 2','normal',false)`,
      [foreignBusiness.id, foreignUser.id]
    );

    const { default: app } = await import("../app.js");
    const { default: importedPool } = await import("../db/pool.js");
    pool = importedPool;
    const agent = await login(app, "notifications_owner", password);

    const filteredPage = await agent
      .get("/api/notifications?page=2&type=collection_due&status=unread")
      .expect(200);
    assert.equal(filteredPage.body.data.pagination.totalItems, 21);
    assert.equal(filteredPage.body.data.notifications.length, 1);

    const first = await agent
      .patch("/api/notifications/read-all")
      .set("x-csrf-token", await csrf(agent))
      .send()
      .expect(200);
    assert.equal(first.body.data.updated, 21);

    const ownerUnread = await client.query(
      "SELECT COUNT(*)::int AS count FROM notifications WHERE business_id=$1 AND user_id=$2 AND is_read=false",
      [owner.business_id, owner.id]
    );
    assert.equal(ownerUnread.rows[0].count, 0);
    const foreignUnread = await client.query(
      "SELECT COUNT(*)::int AS count FROM notifications WHERE business_id=$1 AND user_id=$2 AND is_read=false",
      [foreignBusiness.id, foreignUser.id]
    );
    assert.equal(foreignUnread.rows[0].count, 2);

    const unreadPage = await agent.get("/api/notifications?status=unread").expect(200);
    assert.equal(unreadPage.body.data.pagination.totalItems, 0);
    const second = await agent
      .patch("/api/notifications/read-all")
      .set("x-csrf-token", await csrf(agent))
      .send()
      .expect(200);
    assert.equal(second.body.data.updated, 0);
  } finally {
    if (client) await client.end();
    if (pool) await pool.end();
    for (const [name, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    if (created) await dropTestDatabase();
  }
});

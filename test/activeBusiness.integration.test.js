import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import {
  createTestDatabase,
  dropTestDatabase,
  withTestTransaction
} from "./helpers/testDatabase.js";

const { Client } = pg;
const hasTestDatabaseUrl = Boolean(process.env.TEST_DATABASE_URL);
const originalEnvironment = {
  NODE_ENV: process.env.NODE_ENV,
  SESSION_SECRET: process.env.SESSION_SECRET,
  DATABASE_URL: process.env.DATABASE_URL
};

function restoreEnvironment() {
  for (const [name, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
}

function createRequest({ userId, activeBusinessId, method = "GET", originalUrl = "/items" }) {
  const session = {
    activeBusinessId,
    saveCalls: 0,
    save(callback) {
      this.saveCalls += 1;
      callback();
    }
  };

  if (userId) {
    session.user = { id: userId };
  }

  return {
    method,
    originalUrl,
    session
  };
}

function createResponse() {
  return {
    locals: {},
    redirectedTo: null,
    redirect(path) {
      this.redirectedTo = path;
    }
  };
}

async function runMiddleware(requireActiveBusiness, req) {
  const res = createResponse();
  const nextCalls = [];

  await requireActiveBusiness(req, res, (error) => nextCalls.push(error));

  return { res, nextCalls };
}

test(
  "requireActiveBusiness integra membresías y negocios activos",
  { skip: !hasTestDatabaseUrl },
  async (t) => {
    let client;
    let pool;
    let databaseCreated = false;

    try {
      process.env.NODE_ENV = "test";
      process.env.SESSION_SECRET = "integration-test-secret";

      await createTestDatabase();
      databaseCreated = true;
      process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

      const middlewareModule = await import("../middleware/authMiddleware.js");
      const poolModule = await import("../db/pool.js");
      const { requireActiveBusiness } = middlewareModule;
      pool = poolModule.default;

      client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
      await client.connect();

      const ownerResult = await client.query(
        `
          SELECT businesses.id AS business_id, users.id AS user_id
          FROM businesses
          INNER JOIN business_members
            ON business_members.business_id = businesses.id
          INNER JOIN users
            ON users.id = business_members.user_id
          WHERE businesses.status = 'active'
            AND business_members.role = 'owner'
            AND business_members.status = 'active'
          ORDER BY businesses.id
          LIMIT 1
        `
      );
      const owner = ownerResult.rows[0];
      assert.ok(owner);

      const usersResult = await client.query(
        `
          INSERT INTO users (username, email, password_hash, platform_role)
          VALUES
            ($1, $2, $3, 'user'),
            ($4, $5, $3, 'user'),
            ($6, $7, $3, 'user'),
            ($8, $9, $3, 'user')
          RETURNING id, username
        `,
        [
          "integration_manager",
          "integration-manager@example.test",
          "disabled-integration-password-hash",
          "integration_viewer",
          "integration-viewer@example.test",
          "integration_without_membership",
          "integration-without-membership@example.test",
          "integration_suspended",
          "integration-suspended@example.test"
        ]
      );
      const users = Object.fromEntries(
        usersResult.rows.map((user) => [user.username, user.id])
      );

      await client.query(
        `
          INSERT INTO business_members (business_id, user_id, role, status)
          VALUES
            ($1, $2, 'manager', 'active'),
            ($1, $3, 'viewer', 'active'),
            ($1, $4, 'viewer', 'suspended')
        `,
        [
          owner.business_id,
          users.integration_manager,
          users.integration_viewer,
          users.integration_suspended
        ]
      );

      const suspendedBusinessId = await withTestTransaction(client, async () => {
        const result = await client.query(
          `INSERT INTO businesses (name, slug, created_by, status)
           VALUES ($1, $2, $3, 'suspended') RETURNING id`,
          ["Negocio suspendido de integración", "integration-suspended-business", owner.user_id]
        );
        const businessId = result.rows[0].id;
        await client.query(
          `INSERT INTO business_members (business_id, user_id, role, status)
           VALUES ($1, $2, 'owner', 'active'), ($1, $3, 'manager', 'active')`,
          [businessId, owner.user_id, users.integration_manager]
        );
        await client.query("INSERT INTO categories (business_id, name, description, is_default) VALUES ($1, 'General', 'Categoría predeterminada', true)", [businessId]);
        return businessId;
      });

      await t.test("owner activo carga negocio, membresía y permisos", async () => {
        const req = createRequest({
          userId: owner.user_id,
          activeBusinessId: owner.business_id
        });
        const { res, nextCalls } = await runMiddleware(requireActiveBusiness, req);

        assert.deepEqual(nextCalls, [undefined]);
        assert.equal(res.redirectedTo, null);
        assert.equal(req.business.id, owner.business_id);
        assert.equal(req.membership.role, "owner");
        assert.equal(res.locals.currentBusiness, req.business);
        assert.equal(res.locals.currentMembership, req.membership);
        assert.equal(res.locals.canManageInventory, true);
        assert.equal(res.locals.canDeleteInventory, true);
      });

      await t.test("manager activo puede administrar pero no eliminar", async () => {
        const req = createRequest({
          userId: users.integration_manager,
          activeBusinessId: owner.business_id
        });
        const { res, nextCalls } = await runMiddleware(requireActiveBusiness, req);

        assert.deepEqual(nextCalls, [undefined]);
        assert.equal(req.membership.role, "manager");
        assert.equal(res.locals.canManageInventory, true);
        assert.equal(res.locals.canDeleteInventory, false);
      });

      await t.test("viewer activo no recibe permisos de inventario", async () => {
        const req = createRequest({
          userId: users.integration_viewer,
          activeBusinessId: owner.business_id
        });
        const { res, nextCalls } = await runMiddleware(requireActiveBusiness, req);

        assert.deepEqual(nextCalls, [undefined]);
        assert.equal(req.membership.role, "viewer");
        assert.equal(res.locals.canManageInventory, false);
        assert.equal(res.locals.canDeleteInventory, false);
      });

      for (const activeBusinessId of [undefined, "invalid", -1, 999999]) {
        await t.test(`ID de negocio inválido o inexistente (${String(activeBusinessId)}) se rechaza`, async () => {
          const req = createRequest({ userId: owner.user_id, activeBusinessId });
          const { res, nextCalls } = await runMiddleware(requireActiveBusiness, req);

          assert.equal(res.redirectedTo, "/businesses/select");
          assert.deepEqual(nextCalls, []);
          assert.equal(req.business, undefined);
          assert.equal(req.membership, undefined);
        });
      }

      for (const [label, userId, businessId] of [
        ["usuario sin membresía", users.integration_without_membership, owner.business_id],
        ["membresía suspendida", users.integration_suspended, owner.business_id],
        ["negocio suspendido", users.integration_manager, suspendedBusinessId]
      ]) {
        await t.test(`${label} se rechaza y limpia el negocio activo`, async () => {
          const req = createRequest({ userId, activeBusinessId: businessId });
          const { res, nextCalls } = await runMiddleware(requireActiveBusiness, req);

          assert.equal(req.session.activeBusinessId, undefined);
          assert.equal(req.session.saveCalls, 1);
          assert.equal(res.redirectedTo, "/businesses/select");
          assert.deepEqual(nextCalls, []);
        });
      }

      await t.test("usuario anónimo se redirige mediante requireAuth", async () => {
        const req = createRequest({
          originalUrl: "/items?page=2"
        });
        const { res, nextCalls } = await runMiddleware(requireActiveBusiness, req);

        assert.equal(req.session.returnTo, "/items?page=2");
        assert.equal(req.session.saveCalls, 1);
        assert.equal(res.redirectedTo, "/auth/login");
        assert.deepEqual(nextCalls, []);
      });

      await t.test("los fixtures existen solo en la base desechable", async () => {
        const result = await client.query(
          `
            SELECT
              current_database() AS database_name,
              (SELECT count(*) FROM users WHERE username LIKE 'integration_%') AS user_count,
              (SELECT count(*) FROM business_members WHERE user_id = $1) AS manager_memberships,
              (SELECT count(*) FROM businesses WHERE slug = $2) AS suspended_business_count
          `,
          [users.integration_manager, "integration-suspended-business"]
        );
        const row = result.rows[0];

        assert.match(row.database_name, /^[a-z0-9_]+_test$/);
        assert.equal(Number(row.user_count), 4);
        assert.equal(Number(row.manager_memberships), 2);
        assert.equal(Number(row.suspended_business_count), 1);
      });
    } finally {
      if (client) {
        await client.end();
      }

      if (pool) {
        await pool.end();
      }

      if (originalEnvironment.DATABASE_URL === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = originalEnvironment.DATABASE_URL;
      }

      if (databaseCreated) {
        await dropTestDatabase();
      }

      restoreEnvironment();
    }
  }
);

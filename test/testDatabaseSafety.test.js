import test from "node:test";
import assert from "node:assert/strict";
import { createTestDatabase } from "./helpers/testDatabase.js";

const originalTestDatabaseUrl = process.env.TEST_DATABASE_URL;
const originalDatabaseUrl = process.env.DATABASE_URL;

function restoreEnvironment() {
  if (originalTestDatabaseUrl === undefined) {
    delete process.env.TEST_DATABASE_URL;
  } else {
    process.env.TEST_DATABASE_URL = originalTestDatabaseUrl;
  }

  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }
}

function setDatabaseUrls(testDatabaseUrl, databaseUrl) {
  if (testDatabaseUrl === undefined) {
    delete process.env.TEST_DATABASE_URL;
  } else {
    process.env.TEST_DATABASE_URL = testDatabaseUrl;
  }

  if (databaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = databaseUrl;
  }
}

async function expectValidationFailure(message) {
  await assert.rejects(createTestDatabase(), message);
}

test.afterEach(() => {
  restoreEnvironment();
});

test("rechaza TEST_DATABASE_URL ausente", async () => {
  setDatabaseUrls(undefined, undefined);

  await expectValidationFailure(/Falta TEST_DATABASE_URL/);
});

test("rechaza un host remoto", async () => {
  setDatabaseUrls("postgres://test_user@example.com/inventory_integration_test", undefined);

  await expectValidationFailure(/solo puede apuntar/i);
});

test("rechaza una base sin sufijo _test", async () => {
  setDatabaseUrls("postgres://test_user@localhost/inventory_integration", undefined);

  await expectValidationFailure(/sufijo _test/);
});

test("rechaza una base protegida", async () => {
  setDatabaseUrls("postgres://test_user@localhost/inventory_boxing", undefined);

  await expectValidationFailure(/base protegida/);
});

test("rechaza parámetros de consulta", async () => {
  setDatabaseUrls(
    "postgres://test_user@localhost/inventory_integration_test?host=example.com",
    undefined
  );

  await expectValidationFailure(/parámetros de consulta/i);
});

test("rechaza fragmentos", async () => {
  setDatabaseUrls("postgres://test_user@localhost/inventory_integration_test#fragment", undefined);

  await expectValidationFailure(/fragmentos/);
});

test("rechaza la misma base con el mismo host", async () => {
  const url = "postgres://test_user@localhost/inventory_integration_test";
  setDatabaseUrls(url, url);

  await expectValidationFailure(/misma base que DATABASE_URL/);
});

test("rechaza la misma base con localhost y 127.0.0.1", async () => {
  setDatabaseUrls(
    "postgres://test_user@localhost/inventory_integration_test",
    "postgres://test_user@127.0.0.1/inventory_integration_test"
  );

  await expectValidationFailure(/misma base que DATABASE_URL/);
});

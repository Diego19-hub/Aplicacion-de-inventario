import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  defaultMigrationsDirectory,
  getMigrationInventory
} from "../db/migrationFiles.js";

async function withTemporaryMigrations(callback) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "inventory-migrations-"));

  try {
    await callback(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function writeMigration(directory, version, name, direction, content = "SELECT 1;\n") {
  await writeFile(
    path.join(directory, `${version}_${name}_${direction}.sql`),
    content
  );
}

test("el repositorio contiene migraciones 001 a 015 ordenadas", async () => {
  const inventory = await getMigrationInventory(defaultMigrationsDirectory);

  assert.deepEqual(
    inventory.map((migration) => migration.version),
    ["001", "002", "003", "004", "005", "006", "007", "008", "009", "010", "011", "012", "013", "014", "015"]
  );
  assert.deepEqual(
    inventory.map((migration) => migration.versionNumber),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
  );
});

test("cada checksum up es SHA-256 hexadecimal", async () => {
  const inventory = await getMigrationInventory();

  for (const migration of inventory) {
    assert.match(migration.up.checksum, /^[a-f0-9]{64}$/);
    assert.equal(path.isAbsolute(migration.up.absolutePath), true);
  }
});

test("cada migración tiene archivos up y down", async () => {
  const inventory = await getMigrationInventory();

  for (const migration of inventory) {
    assert.equal(migration.up.direction, "up");
    assert.equal(migration.down.direction, "down");
    assert.equal(migration.up.name, migration.down.name);
  }
});

test("rechaza una versión duplicada", async () => {
  await withTemporaryMigrations(async (directory) => {
    await writeMigration(directory, "001", "uno", "up");
    await writeMigration(directory, "001", "uno", "down");
    await writeMigration(directory, "001", "dos", "up");

    await assert.rejects(getMigrationInventory(directory), /Versión de migración duplicada/);
  });
});

test("rechaza un salto de versión", async () => {
  await withTemporaryMigrations(async (directory) => {
    await writeMigration(directory, "001", "uno", "up");
    await writeMigration(directory, "001", "uno", "down");
    await writeMigration(directory, "003", "tres", "up");
    await writeMigration(directory, "003", "tres", "down");

    await assert.rejects(getMigrationInventory(directory), /salto/);
  });
});

test("rechaza una migración sin down", async () => {
  await withTemporaryMigrations(async (directory) => {
    await writeMigration(directory, "001", "uno", "up");

    await assert.rejects(getMigrationInventory(directory), /archivos up y down/);
  });
});

test("rechaza nombres lógicos diferentes entre up y down", async () => {
  await withTemporaryMigrations(async (directory) => {
    await writeMigration(directory, "001", "uno", "up");
    await writeMigration(directory, "001", "dos", "down");

    await assert.rejects(getMigrationInventory(directory), /mismo nombre lógico/);
  });
});

test("rechaza un archivo SQL con formato de migración inválido", async () => {
  await withTemporaryMigrations(async (directory) => {
    await writeFile(path.join(directory, "001_nombre.sql"), "SELECT 1;\n");

    await assert.rejects(getMigrationInventory(directory), /formato de migración inválido/);
  });
});

test("un cambio de contenido modifica el checksum", async () => {
  await withTemporaryMigrations(async (directory) => {
    await writeMigration(directory, "001", "uno", "up", "SELECT 1;\n");
    await writeMigration(directory, "001", "uno", "down");
    const first = await getMigrationInventory(directory);

    await writeMigration(directory, "001", "uno", "up", "SELECT 2;\n");
    const second = await getMigrationInventory(directory);

    assert.notEqual(first[0].up.checksum, second[0].up.checksum);
  });
});

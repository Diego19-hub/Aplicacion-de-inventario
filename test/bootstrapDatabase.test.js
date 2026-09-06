import assert from "node:assert/strict";
import test from "node:test";

import { getMigrationInventory } from "../db/migrationFiles.js";
import { latestMigrationVersion } from "../scripts/bootstrapDatabase.js";

test("el bootstrap detecta la última migración válida del repositorio", async () => {
  const inventory = await getMigrationInventory();

  assert.equal(latestMigrationVersion(inventory), 32);
});

test("el bootstrap rechaza un inventario no continuo", () => {
  assert.throws(
    () => latestMigrationVersion([{ versionNumber: 2 }]),
    /inventario de migraciones debe ser continuo/
  );
});

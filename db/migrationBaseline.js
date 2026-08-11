import { createMigrationHistoryTable } from "./migrationHistory.js";

// Debe coincidir con db/migrationHistory.js para serializar baseline e inicialización.
const migrationHistoryLockKey = 781042261;
const expectedVersions = Array.from({ length: 10 }, (_, index) => index + 1);
const hardenedTables = [
  "businesses",
  "business_members",
  "business_invitations",
  "categories",
  "items",
  "inventory_movements",
  "suppliers",
  "business_locations",
  "inventory_balances",
  "inventory_transfers",
  "inventory_stock_thresholds"
];
const requiredColumns = [
  ["users", "platform_role"],
  ["categories", "business_id"],
  ["items", "business_id"],
  ["items", "sku"],
  ["items", "status"],
  ["items", "archived_at"],
  ["items", "archived_by"],
  ["items", "archive_reason"],
  ["inventory_movements", "location_id"],
  ["inventory_movements", "transfer_id"]
];
const requiredTables = ["users", ...hardenedTables];
const requiredConstraints = [
  "business_members_business_user_key",
  "categories_business_id_id_key",
  "items_business_id_id_key",
  "inventory_movements_item_business_fkey",
  "inventory_movements_member_fkey",
  "inventory_movements_location_business_fkey",
  "business_locations_business_id_id_key",
  "inventory_balances_location_business_fkey",
  "inventory_balances_item_business_fkey",
  "inventory_transfers_item_business_fkey",
  "inventory_transfers_from_business_fkey",
  "inventory_transfers_to_business_fkey",
  "inventory_transfers_member_fkey",
  "inventory_movements_transfer_match_fkey",
  "inventory_stock_thresholds_item_business_fkey",
  "inventory_stock_thresholds_location_business_fkey",
  "inventory_stock_thresholds_member_business_fkey"
];
const immutableTriggers = [
  "inventory_movements_immutable_trigger",
  "inventory_transfers_immutable_trigger"
];
const hardenedFunctions = [
  "inventory_saas_set_businesses_updated_at",
  "inventory_movements_immutable",
  "suppliers_set_updated_at",
  "business_locations_set_updated_at",
  "inventory_balances_set_updated_at",
  "inventory_transfers_immutable",
  "inventory_stock_thresholds_set_updated_at"
];
const tablePrivileges = [
  "SELECT",
  "INSERT",
  "UPDATE",
  "DELETE",
  "TRUNCATE",
  "REFERENCES",
  "TRIGGER"
];

function assertExpectedInventory(migrationInventory) {
  if (!Array.isArray(migrationInventory) || migrationInventory.length !== expectedVersions.length) {
    throw new Error("El baseline requiere exactamente el inventario continuo de migraciones 001–010.");
  }

  for (const [index, migration] of migrationInventory.entries()) {
    const expectedVersion = expectedVersions[index];

    if (
      migration?.versionNumber !== expectedVersion
      || migration.version !== String(expectedVersion).padStart(3, "0")
      || typeof migration.name !== "string"
      || !migration.name
      || !/^[0-9a-f]{64}$/.test(migration.up?.checksum ?? "")
    ) {
      throw new Error("El baseline requiere exactamente el inventario continuo de migraciones 001–010.");
    }
  }
}

async function requireRows(client, query, values, description) {
  const result = await client.query(query, values);

  if (result.rows.length !== 0) {
    throw new Error(`No se puede crear el baseline: ${description}.`);
  }
}

async function assertExpectedSchema(client) {
  await requireRows(
    client,
    `
      SELECT expected.table_name
      FROM unnest($1::text[]) AS expected(table_name)
      LEFT JOIN pg_catalog.pg_class AS relation
        ON relation.relname = expected.table_name
       AND relation.relnamespace = 'public'::pg_catalog.regnamespace
      WHERE relation.oid IS NULL
    `,
    [requiredTables],
    "faltan tablas requeridas"
  );
  await requireRows(
    client,
    `
      SELECT expected.table_name, expected.column_name
      FROM unnest($1::text[], $2::text[]) AS expected(table_name, column_name)
      LEFT JOIN information_schema.columns AS columns
        ON columns.table_schema = 'public'
       AND columns.table_name = expected.table_name
       AND columns.column_name = expected.column_name
      WHERE columns.column_name IS NULL
    `,
    [
      requiredColumns.map(([tableName]) => tableName),
      requiredColumns.map(([, columnName]) => columnName)
    ],
    "faltan columnas requeridas"
  );
  await requireRows(
    client,
    `
      SELECT expected.constraint_name
      FROM unnest($1::text[]) AS expected(constraint_name)
      LEFT JOIN pg_catalog.pg_constraint AS constraints
        ON constraints.conname = expected.constraint_name
       AND constraints.connamespace = 'public'::pg_catalog.regnamespace
      WHERE constraints.oid IS NULL
    `,
    [requiredConstraints],
    "faltan restricciones compuestas de aislamiento"
  );
  await requireRows(
    client,
    `
      SELECT expected.trigger_name
      FROM unnest($1::text[]) AS expected(trigger_name)
      LEFT JOIN pg_catalog.pg_trigger AS triggers
        ON triggers.tgname = expected.trigger_name
       AND NOT triggers.tgisinternal
      WHERE triggers.oid IS NULL
    `,
    [immutableTriggers],
    "faltan triggers de inmutabilidad"
  );
  await requireRows(
    client,
    `
      SELECT relation.relname
      FROM pg_catalog.pg_class AS relation
      WHERE relation.relnamespace = 'public'::pg_catalog.regnamespace
        AND relation.relname = ANY($1::text[])
        AND (NOT relation.relrowsecurity OR relation.relforcerowsecurity)
    `,
    [hardenedTables],
    "RLS no está habilitado sin FORCE en todas las tablas endurecidas"
  );
  await requireRows(
    client,
    `
      SELECT policies.tablename
      FROM pg_catalog.pg_policies AS policies
      WHERE policies.schemaname = 'public'
        AND policies.tablename = ANY($1::text[])
    `,
    [hardenedTables],
    "existen políticas RLS"
  );
  await requireRows(
    client,
    `
      SELECT relation.relname, privilege.privilege_name
      FROM pg_catalog.pg_class AS relation
      CROSS JOIN unnest($2::text[]) AS privilege(privilege_name)
      WHERE relation.relnamespace = 'public'::pg_catalog.regnamespace
        AND relation.relname = ANY($1::text[])
        AND has_table_privilege('public', relation.oid, privilege.privilege_name)
    `,
    [hardenedTables, tablePrivileges],
    "PUBLIC conserva privilegios de tabla"
  );
  await requireRows(
    client,
    `
      SELECT procedures.proname
      FROM pg_catalog.pg_proc AS procedures
      WHERE procedures.pronamespace = 'public'::pg_catalog.regnamespace
        AND procedures.proname = ANY($1::text[])
        AND has_function_privilege('public', procedures.oid, 'EXECUTE')
    `,
    [hardenedFunctions],
    "PUBLIC conserva EXECUTE sobre funciones endurecidas"
  );
}

export async function baselineMigrationHistory(client, migrationInventory) {
  assertExpectedInventory(migrationInventory);
  await createMigrationHistoryTable(client);
  await client.query("BEGIN");

  try {
    await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [migrationHistoryLockKey]);
    const existingHistory = await client.query(
      "SELECT version FROM public.schema_migrations LIMIT $1",
      [1]
    );

    if (existingHistory.rows.length > 0) {
      throw new Error("No se puede crear el baseline: schema_migrations ya contiene registros.");
    }

    await assertExpectedSchema(client);
    await client.query(
      `
        INSERT INTO public.schema_migrations (version, name, checksum)
        SELECT migration.version, migration.name, migration.checksum
        FROM unnest($1::integer[], $2::text[], $3::text[])
          AS migration(version, name, checksum)
      `,
      [
        migrationInventory.map((migration) => migration.versionNumber),
        migrationInventory.map((migration) => migration.name),
        migrationInventory.map((migration) => migration.up.checksum)
      ]
    );
    await client.query("COMMIT");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Se conserva el error original del baseline.
    }

    throw error;
  }
}

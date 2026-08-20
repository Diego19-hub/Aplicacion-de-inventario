import "dotenv/config";
import pg from "pg";

const { Client } = pg;
const confirmation = process.env.SEED_DASHBOARD_CONFIRM;
const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const requiredConfirmation = "inventory_boxing";
const demoSkuPrefix = "DEMO-DASH-";
const categoryNames = ["Reactivos demo", "Controles demo", "Consumibles demo"];

const demoProducts = [
  ["Reactivo buffer pH 7", "Reactivos demo", 12, 4], ["Reactivo buffer pH 4", "Reactivos demo", 8, 3],
  ["Solución estándar A", "Reactivos demo", 6, 2], ["Solución estándar B", "Reactivos demo", 1, 4],
  ["Reactivo indicador rojo", "Reactivos demo", 0, 2], ["Control positivo nivel 1", "Controles demo", 14, 5],
  ["Control positivo nivel 2", "Controles demo", 9, 3], ["Control negativo nivel 1", "Controles demo", 2, 5],
  ["Control calibración azul", "Controles demo", 7, 2], ["Control calibración verde", "Controles demo", 0, 1],
  ["Puntas universales 200uL", "Consumibles demo", 40, 12], ["Puntas universales 1000uL", "Consumibles demo", 18, 8],
  ["Tubos de ensayo 15mL", "Consumibles demo", 3, 10], ["Guantes nitrilo medianos", "Consumibles demo", 25, 15],
  ["Placas de reacción", "Consumibles demo", 1, 6]
].map(([name, category, stock, minimumStock], index) => ({
  name, category, stock, minimumStock, sku: `${demoSkuPrefix}${String(index + 1).padStart(3, "0")}`
}));

function assertSafeTarget() {
  if (confirmation !== requiredConfirmation) {
    throw new Error("Define SEED_DASHBOARD_CONFIRM=inventory_boxing para continuar.");
  }
  if (!databaseUrl) throw new Error("Falta DATABASE_URL o POSTGRES_URL.");

  const url = new URL(databaseUrl);
  const safeHosts = new Set(["localhost", "127.0.0.1", "::1", "host.docker.internal"]);
  if (!safeHosts.has(url.hostname)) {
    throw new Error("Por seguridad, este seeder solo acepta una base local.");
  }
}

function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

async function selectBusiness(client) {
  const businessId = process.env.BUSINESS_ID;
  const result = businessId
    ? await client.query("SELECT id FROM businesses WHERE id = $1 AND status = 'active'", [businessId])
    : await client.query(`
        SELECT b.id
        FROM businesses b
        INNER JOIN business_members member ON member.business_id = b.id
        WHERE b.status = 'active' AND member.role = 'owner' AND member.status = 'active'
        ORDER BY b.id
        LIMIT 1
      `);
  if (result.rowCount === 0) throw new Error("No se encontró un negocio activo válido.");
  return result.rows[0].id;
}

async function seed() {
  assertSafeTarget();
  const client = new Client({ connectionString: databaseUrl });
  let createdProducts = 0;
  let reusedProducts = 0;
  let movementCount = 0;

  try {
    await client.connect();
    await client.query("BEGIN");
    const businessId = await selectBusiness(client);
    const ownerResult = await client.query(
      "SELECT user_id FROM business_members WHERE business_id = $1 AND role = 'owner' AND status = 'active' ORDER BY id LIMIT 1",
      [businessId]
    );
    const ownerId = ownerResult.rows[0]?.user_id;
    if (!ownerId) throw new Error("El negocio no tiene un owner activo.");

    const locationResult = await client.query(
      "SELECT id FROM business_locations WHERE business_id = $1 AND status = 'active' ORDER BY is_default DESC, id LIMIT 1",
      [businessId]
    );
    const locationId = locationResult.rows[0]?.id;
    if (!locationId) throw new Error("El negocio no tiene una ubicación activa válida.");

    const categories = new Map();
    for (const name of categoryNames) {
      const result = await client.query(
        "SELECT id FROM categories WHERE business_id = $1 AND lower(name) = lower($2)",
        [businessId, name]
      );
      if (result.rowCount > 0) {
        categories.set(name, result.rows[0].id);
      } else {
        const created = await client.query(
          `INSERT INTO categories (business_id, name, description)
           VALUES ($1, $2, $3) RETURNING id`,
          [businessId, name, "Datos temporales para visualizar el dashboard"]
        );
        categories.set(name, created.rows[0].id);
      }
    }

    for (const product of demoProducts) {
      const existing = await client.query(
        "SELECT id FROM items WHERE business_id = $1 AND sku = $2",
        [businessId, product.sku]
      );
      if (existing.rowCount > 0) {
        reusedProducts += 1;
        continue;
      }

      const itemResult = await client.query(
        `INSERT INTO items (business_id, sku, name, description, brand, price, stock, category_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active')
         RETURNING id`,
        [businessId, product.sku, product.name, "Producto demo temporal para el dashboard.", "Marca demo", (product.stock + 1) * 10, product.stock, categories.get(product.category)]
      );
      const itemId = itemResult.rows[0].id;
      const opening = Math.max(product.stock, product.minimumStock, 3);
      const movements = [
        ["opening_balance", opening, 30],
        ["entry", 4, 22],
        ["exit", -2, 14],
        ["entry", 3, 7]
      ];
      let runningStock = 0;
      for (const [type, delta, age] of movements) {
        const resultingStock = runningStock + delta;
        if (resultingStock < 0) continue;
        await client.query(
          `INSERT INTO inventory_movements
            (business_id, location_id, item_id, movement_type, quantity_delta, previous_stock, resulting_stock, reason, created_by, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [businessId, locationId, itemId, type, delta, runningStock, resultingStock, "Movimiento demo temporal", ownerId, daysAgo(age)]
        );
        runningStock = resultingStock;
        movementCount += 1;
      }
      const adjustment = product.stock - runningStock;
      if (adjustment !== 0) {
        await client.query(
          `INSERT INTO inventory_movements
            (business_id, location_id, item_id, movement_type, quantity_delta, previous_stock, resulting_stock, reason, created_by, created_at)
           VALUES ($1, $2, $3, 'adjustment', $4, $5, $6, $7, $8, $9)`,
          [businessId, locationId, itemId, adjustment, runningStock, product.stock, "Ajuste demo temporal", ownerId, daysAgo(2)]
        );
        movementCount += 1;
      }
      await client.query(
        `INSERT INTO inventory_balances (business_id, location_id, item_id, stock)
         VALUES ($1, $2, $3, $4)`,
        [businessId, locationId, itemId, product.stock]
      );
      await client.query(
        `INSERT INTO inventory_stock_thresholds (business_id, item_id, location_id, minimum_stock, created_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [businessId, itemId, locationId, product.minimumStock, ownerId]
      );
      createdProducts += 1;
    }

    await client.query("COMMIT");
    console.log(`Datos demo creados para el negocio ${businessId}.`);
    console.log(`Productos nuevos: ${createdProducts}; productos ya existentes: ${reusedProducts}; movimientos: ${movementCount}.`);
    console.log(`Categorías reutilizadas/creadas: ${categoryNames.join(", ")}.`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end().catch(() => {});
  }
}

seed().catch((error) => {
  console.error(`No se pudo crear el dataset demo: ${error.message}`);
  process.exitCode = 1;
});

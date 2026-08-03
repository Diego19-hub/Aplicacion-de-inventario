import "dotenv/config";
import pool from "./pool.js";

const categories = [
  {
    name: "Guantes",
    description: "Guantes para entrenamiento, sparring y competición."
  },
  {
    name: "Vendas",
    description: "Protección para manos, nudillos y muñecas."
  },
  {
    name: "Protección",
    description: "Equipo protector para entrenamientos y combates."
  },
  {
    name: "Sacos",
    description: "Sacos y equipo para practicar golpes."
  },
  {
    name: "Ropa",
    description: "Ropa y calzado para entrenamiento de boxeo."
  }
];

const items = [
  {
    name: "Guantes Elite Pro",
    description: "Guantes acolchados para entrenamiento y sparring.",
    brand: "Everlast",
    price: 1899.99,
    stock: 12,
    category: "Guantes"
  },
  {
    name: "Guantes Training",
    description: "Guantes resistentes para entrenamiento diario.",
    brand: "Venum",
    price: 1499.5,
    stock: 8,
    category: "Guantes"
  },
  {
    name: "Vendas profesionales",
    description: "Vendas elásticas de 4.5 metros.",
    brand: "Cleto Reyes",
    price: 299.99,
    stock: 30,
    category: "Vendas"
  },
  {
    name: "Protector bucal",
    description: "Protector bucal moldeable para boxeo.",
    brand: "Everlast",
    price: 249.99,
    stock: 20,
    category: "Protección"
  },
  {
    name: "Careta de entrenamiento",
    description: "Careta acolchada para sesiones de sparring.",
    brand: "Venum",
    price: 1299.99,
    stock: 6,
    category: "Protección"
  },
  {
    name: "Saco pesado 40 kg",
    description: "Saco resistente para entrenamiento de potencia.",
    brand: "Everlast",
    price: 3499.99,
    stock: 4,
    category: "Sacos"
  },
  {
    name: "Short de boxeo",
    description: "Short ligero con cintura elástica.",
    brand: "Adidas",
    price: 799.99,
    stock: 15,
    category: "Ropa"
  }
];

async function populateDatabase() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Borra los datos anteriores y reinicia los identificadores.
    await client.query(`
      TRUNCATE TABLE items, categories
      RESTART IDENTITY CASCADE
    `);

    const categoryIds = new Map();

    for (const category of categories) {
      const result = await client.query(
        `
          INSERT INTO categories (name, description)
          VALUES ($1, $2)
          RETURNING id
        `,
        [category.name, category.description]
      );

      categoryIds.set(category.name, result.rows[0].id);
    }

    for (const item of items) {
      const categoryId = categoryIds.get(item.category);

      await client.query(
        `
          INSERT INTO items (
            name,
            description,
            brand,
            price,
            stock,
            category_id
          )
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          item.name,
          item.description,
          item.brand,
          item.price,
          item.stock,
          categoryId
        ]
      );
    }

    await client.query("COMMIT");

    console.log("Base de datos poblada correctamente.");
    console.log(`${categories.length} categorías insertadas.`);
    console.log(`${items.length} productos insertados.`);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("No se pudo poblar la base de datos:");
    console.error(error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

populateDatabase();
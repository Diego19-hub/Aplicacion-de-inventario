CREATE TABLE IF NOT EXISTS categories (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS items (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  brand VARCHAR(50) NOT NULL,
  price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),

  category_id INTEGER NOT NULL
    REFERENCES categories(id)
    ON DELETE RESTRICT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS items_category_id_index
ON items(category_id);

export async function createCategory(name, description) {
  const result = await pool.query(
    `
      INSERT INTO categories (name, description)
      VALUES ($1, $2)
      RETURNING id, name, description, created_at
    `,
    [name, description]
  );

  return result.rows[0];
}
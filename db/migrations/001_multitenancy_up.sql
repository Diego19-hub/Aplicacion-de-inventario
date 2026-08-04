-- BORRADOR PARA REVISIÓN. No aplicar en Supabase ni en producción todavía.
-- Convierte el MVP de un único inventario en la base del modelo multiempresa.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = public, pg_temp;

DO $$
BEGIN
  IF to_regclass('public.users') IS NULL
    OR to_regclass('public.categories') IS NULL
    OR to_regclass('public.items') IS NULL THEN
    RAISE EXCEPTION
      'No se puede migrar: se requieren las tablas users, categories e items.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'platform_role'
  ) OR to_regclass('public.businesses') IS NOT NULL THEN
    RAISE EXCEPTION
      'No se puede migrar: el modelo multiempresa parece estar aplicado parcialmente o ya existe.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'role'
  ) THEN
    RAISE EXCEPTION
      'No se puede migrar: users.role no existe en el esquema actual.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM users
    WHERE role NOT IN ('user', 'admin')
  ) THEN
    RAISE EXCEPTION
      'No se puede migrar: users.role contiene valores distintos de user/admin.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM users WHERE role = 'admin') THEN
    RAISE EXCEPTION
      'No se puede migrar: se requiere al menos un administrador actual para ser propietario de Boxing Inventory.';
  END IF;
END $$;

ALTER TABLE users RENAME COLUMN role TO platform_role;
ALTER TABLE users ALTER COLUMN platform_role TYPE VARCHAR(20);
ALTER TABLE users ALTER COLUMN platform_role SET DEFAULT 'user';
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
UPDATE users
SET platform_role = 'super_admin'
WHERE platform_role = 'admin';
ALTER TABLE users
  ADD CONSTRAINT users_platform_role_check
  CHECK (platform_role IN ('user', 'super_admin'));

CREATE TABLE businesses (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  legal_name VARCHAR(255),
  tax_id VARCHAR(100),
  currency CHAR(3) NOT NULL DEFAULT 'MXN'
    CHECK (currency = UPPER(currency) AND currency ~ '^[A-Z]{3}$'),
  timezone TEXT NOT NULL DEFAULT 'America/Mexico_City',
  status VARCHAR(10) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'archived')),
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT businesses_slug_format_check
    CHECK (slug = LOWER(slug) AND slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT businesses_slug_key UNIQUE (slug)
);

ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION inventory_saas_set_businesses_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER inventory_saas_businesses_updated_at_trigger
BEFORE UPDATE ON businesses
FOR EACH ROW
EXECUTE FUNCTION inventory_saas_set_businesses_updated_at();

CREATE INDEX businesses_created_by_index ON businesses (created_by);

CREATE TABLE business_members (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  role VARCHAR(10) NOT NULL
    CHECK (role IN ('owner', 'admin', 'manager', 'employee', 'viewer')),
  status VARCHAR(10) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'removed')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT business_members_business_user_key UNIQUE (business_id, user_id)
);

ALTER TABLE business_members ENABLE ROW LEVEL SECURITY;

CREATE INDEX business_members_user_id_index ON business_members (user_id);
CREATE UNIQUE INDEX business_members_one_active_owner_per_business
  ON business_members (business_id)
  WHERE role = 'owner' AND status = 'active';

CREATE TABLE business_invitations (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
  email_normalized VARCHAR(254) NOT NULL
    CHECK (email_normalized = LOWER(email_normalized)),
  offered_role VARCHAR(10) NOT NULL
    CHECK (offered_role IN ('admin', 'manager', 'employee', 'viewer')),
  token_hash VARCHAR(128) NOT NULL,
  invited_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status VARCHAR(10) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days'),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT business_invitations_token_hash_key UNIQUE (token_hash),
  CONSTRAINT business_invitations_acceptance_check CHECK (
    (status = 'accepted' AND accepted_at IS NOT NULL)
    OR (status <> 'accepted' AND accepted_at IS NULL)
  )
);

ALTER TABLE business_invitations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL PRIVILEGES ON TABLE
      businesses,
      business_members,
      business_invitations
    FROM anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL PRIVILEGES ON TABLE
      businesses,
      business_members,
      business_invitations
    FROM authenticated;
  END IF;
END $$;

CREATE INDEX business_invitations_business_id_index
  ON business_invitations (business_id);
CREATE INDEX business_invitations_invited_by_index
  ON business_invitations (invited_by);
CREATE UNIQUE INDEX business_invitations_one_pending_email_per_business
  ON business_invitations (business_id, email_normalized)
  WHERE status = 'pending';

WITH initial_business AS (
  INSERT INTO businesses (name, slug, created_by)
  SELECT 'Boxing Inventory', 'boxing-inventory', id
  FROM users
  WHERE platform_role = 'super_admin'
  ORDER BY id
  LIMIT 1
  RETURNING id, created_by
)
INSERT INTO business_members (business_id, user_id, role, status)
SELECT id, created_by, 'owner', 'active'
FROM initial_business;

ALTER TABLE categories ADD COLUMN business_id INTEGER;
ALTER TABLE items ADD COLUMN business_id INTEGER;

UPDATE categories
SET business_id = (
  SELECT id FROM businesses WHERE slug = 'boxing-inventory'
);

UPDATE items
SET business_id = (
  SELECT id FROM businesses WHERE slug = 'boxing-inventory'
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM categories WHERE business_id IS NULL)
    OR EXISTS (SELECT 1 FROM items WHERE business_id IS NULL) THEN
    RAISE EXCEPTION
      'No se puede finalizar la migración: existen categorías o productos sin negocio asignado.';
  END IF;
END $$;

ALTER TABLE categories ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE items ALTER COLUMN business_id SET NOT NULL;

ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_name_key;
ALTER TABLE categories
  ADD CONSTRAINT categories_business_id_id_key UNIQUE (business_id, id);
ALTER TABLE categories
  ADD CONSTRAINT categories_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX categories_business_name_lower_unique
  ON categories (business_id, LOWER(name));

ALTER TABLE items DROP CONSTRAINT IF EXISTS items_category_id_fkey;
ALTER TABLE items
  ADD CONSTRAINT items_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE RESTRICT;
ALTER TABLE items
  ADD CONSTRAINT items_business_category_fkey
  FOREIGN KEY (business_id, category_id)
  REFERENCES categories (business_id, id) ON DELETE RESTRICT;
CREATE INDEX items_business_id_category_id_index
  ON items (business_id, category_id);

COMMIT;

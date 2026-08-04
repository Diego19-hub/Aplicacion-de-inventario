-- DESTRUCTIVO. BORRADOR PARA REVISIÓN. No aplicar en Supabase ni en producción.
-- Solo revierte el estado inicial de la migración si no existe información multiempresa.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = public, pg_temp;

DO $$
BEGIN
  IF to_regclass('public.businesses') IS NULL
    OR to_regclass('public.business_members') IS NULL
    OR to_regclass('public.business_invitations') IS NULL THEN
    RAISE EXCEPTION 'No se puede revertir: el modelo multiempresa no está completo.';
  END IF;

  IF (SELECT COUNT(*) FROM businesses) <> 1
    OR NOT EXISTS (
      SELECT 1 FROM businesses
      WHERE slug = 'boxing-inventory' AND name = 'Boxing Inventory'
    ) THEN
    RAISE EXCEPTION
      'Se rechaza el rollback destructivo: existen negocios que no caben en el modelo anterior.';
  END IF;

  IF EXISTS (SELECT 1 FROM business_invitations) THEN
    RAISE EXCEPTION
      'Se rechaza el rollback destructivo: existen invitaciones que se perderían.';
  END IF;

  IF (SELECT COUNT(*) FROM business_members) <> 1
    OR NOT EXISTS (
      SELECT 1
      FROM businesses b
      JOIN business_members bm
        ON bm.business_id = b.id
       AND bm.user_id = b.created_by
      WHERE b.slug = 'boxing-inventory'
        AND bm.role = 'owner'
        AND bm.status = 'active'
    ) THEN
    RAISE EXCEPTION
      'Se rechaza el rollback destructivo: existen membresías que no pueden conservarse en el modelo anterior.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM categories c
    JOIN businesses b ON b.id = c.business_id
    WHERE b.slug <> 'boxing-inventory'
  ) OR EXISTS (
    SELECT 1 FROM items i
    JOIN businesses b ON b.id = i.business_id
    WHERE b.slug <> 'boxing-inventory'
  ) THEN
    RAISE EXCEPTION
      'Se rechaza el rollback destructivo: existen datos de inventario en más de un negocio.';
  END IF;
END $$;

ALTER TABLE items DROP CONSTRAINT IF EXISTS items_business_category_fkey;
ALTER TABLE items DROP CONSTRAINT IF EXISTS items_business_id_fkey;
DROP INDEX IF EXISTS items_business_id_category_id_index;

ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_business_id_fkey;
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_business_id_id_key;
DROP INDEX IF EXISTS categories_business_name_lower_unique;

ALTER TABLE items DROP COLUMN business_id;
ALTER TABLE categories DROP COLUMN business_id;

ALTER TABLE categories
  ADD CONSTRAINT categories_name_key UNIQUE (name);
ALTER TABLE items
  ADD CONSTRAINT items_category_id_fkey
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS items_category_id_index ON items (category_id);

DROP TRIGGER IF EXISTS inventory_saas_businesses_updated_at_trigger ON businesses;
DROP FUNCTION IF EXISTS inventory_saas_set_businesses_updated_at();

DROP TABLE business_invitations;
DROP TABLE business_members;
DROP TABLE businesses;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_platform_role_check;
UPDATE users SET platform_role = 'admin' WHERE platform_role = 'super_admin';
ALTER TABLE users ALTER COLUMN platform_role TYPE VARCHAR(10);
ALTER TABLE users ALTER COLUMN platform_role SET DEFAULT 'user';
ALTER TABLE users RENAME COLUMN platform_role TO role;
ALTER TABLE users
  ADD CONSTRAINT users_role_check CHECK (role IN ('user', 'admin'));

COMMIT;

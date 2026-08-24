BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public, pg_temp;

DO $$
BEGIN
  IF to_regclass('public.businesses') IS NULL
    OR to_regclass('public.business_members') IS NULL
    OR to_regclass('public.items') IS NULL
    OR to_regclass('public.sale_items') IS NULL THEN
    RAISE EXCEPTION 'Se requieren businesses, business_members, items y sale_items para crear Punto de Equilibrio.';
  END IF;

  IF to_regclass('public.business_costs') IS NOT NULL THEN
    RAISE EXCEPTION 'La tabla business_costs ya existe.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.business_members'::regclass
      AND conname = 'business_members_business_user_key'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.items'::regclass
      AND conname = 'items_business_id_id_key'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.sale_items'::regclass
      AND conname = 'sale_items_business_id_id_key'
  ) THEN
    RAISE EXCEPTION 'Faltan restricciones compuestas necesarias para aislar Punto de Equilibrio por negocio.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'items' AND column_name = 'cost_price'
  ) OR EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sale_items' AND column_name = 'unit_cost'
  ) THEN
    RAISE EXCEPTION 'Una columna de costos ya existe.';
  END IF;
END
$$;

ALTER TABLE public.items
  ADD COLUMN cost_price NUMERIC(12,2),
  ADD CONSTRAINT items_cost_price_check
    CHECK (cost_price IS NULL OR cost_price >= 0);

ALTER TABLE public.sale_items
  ADD COLUMN unit_cost NUMERIC(12,2),
  ADD CONSTRAINT sale_items_unit_cost_check
    CHECK (unit_cost IS NULL OR unit_cost >= 0);

CREATE TABLE public.business_costs (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  name VARCHAR(150) NOT NULL,
  description VARCHAR(500),
  amount NUMERIC(12,2) NOT NULL,
  cost_type VARCHAR(20) NOT NULL DEFAULT 'fixed',
  frequency VARCHAR(20) NOT NULL DEFAULT 'monthly',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT business_costs_business_id_id_key UNIQUE (business_id, id),
  CONSTRAINT business_costs_created_by_business_fkey
    FOREIGN KEY (business_id, created_by)
    REFERENCES public.business_members (business_id, user_id) ON DELETE RESTRICT,
  CONSTRAINT business_costs_name_check
    CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 150),
  CONSTRAINT business_costs_description_check
    CHECK (description IS NULL OR char_length(description) <= 500),
  CONSTRAINT business_costs_amount_check
    CHECK (amount > 0),
  CONSTRAINT business_costs_cost_type_check
    CHECK (cost_type IN ('fixed', 'variable')),
  CONSTRAINT business_costs_frequency_check
    CHECK (frequency IN ('monthly', 'yearly', 'one_time'))
);

CREATE INDEX business_costs_business_index
  ON public.business_costs (business_id);
CREATE INDEX business_costs_business_type_index
  ON public.business_costs (business_id, cost_type);
CREATE INDEX business_costs_business_frequency_index
  ON public.business_costs (business_id, frequency);
CREATE INDEX business_costs_business_active_index
  ON public.business_costs (business_id, is_active);

CREATE FUNCTION public.business_costs_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE TRIGGER business_costs_updated_at_trigger
  BEFORE UPDATE ON public.business_costs
  FOR EACH ROW EXECUTE FUNCTION public.business_costs_set_updated_at();

ALTER TABLE public.business_costs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.business_costs FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.business_costs FROM authenticated;
  END IF;
END
$$;

COMMIT;

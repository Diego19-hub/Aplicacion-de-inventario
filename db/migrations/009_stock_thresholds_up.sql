BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public, pg_temp;

DO $$
BEGIN
  IF to_regclass('public.inventory_stock_thresholds') IS NOT NULL THEN
    RAISE EXCEPTION 'inventory_stock_thresholds ya existe.';
  END IF;

  IF to_regclass('public.items') IS NULL
    OR to_regclass('public.business_locations') IS NULL
    OR to_regclass('public.business_members') IS NULL THEN
    RAISE EXCEPTION 'Se requieren items, business_locations y business_members.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.items'::regclass AND conname='items_business_id_id_key')
    OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.business_locations'::regclass AND conname='business_locations_business_id_id_key')
    OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.business_members'::regclass AND conname='business_members_business_user_key') THEN
    RAISE EXCEPTION 'Faltan restricciones compuestas indispensables para umbrales.';
  END IF;
END $$;

CREATE TABLE public.inventory_stock_thresholds (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  location_id INTEGER NOT NULL,
  minimum_stock INTEGER NOT NULL,
  created_by INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT inventory_stock_thresholds_business_item_location_key UNIQUE (business_id, item_id, location_id),
  CONSTRAINT inventory_stock_thresholds_minimum_stock_check CHECK (minimum_stock >= 0),
  CONSTRAINT inventory_stock_thresholds_item_business_fkey FOREIGN KEY (business_id, item_id) REFERENCES public.items (business_id, id) ON DELETE RESTRICT,
  CONSTRAINT inventory_stock_thresholds_location_business_fkey FOREIGN KEY (business_id, location_id) REFERENCES public.business_locations (business_id, id) ON DELETE RESTRICT,
  CONSTRAINT inventory_stock_thresholds_member_business_fkey FOREIGN KEY (business_id, created_by) REFERENCES public.business_members (business_id, user_id) ON DELETE RESTRICT
);

CREATE INDEX inventory_stock_thresholds_business_item_index ON public.inventory_stock_thresholds (business_id, item_id);
CREATE INDEX inventory_stock_thresholds_business_location_index ON public.inventory_stock_thresholds (business_id, location_id);

CREATE FUNCTION public.inventory_stock_thresholds_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = clock_timestamp(); RETURN NEW; END; $$;

CREATE TRIGGER inventory_stock_thresholds_updated_at_trigger
BEFORE UPDATE ON public.inventory_stock_thresholds
FOR EACH ROW EXECUTE FUNCTION public.inventory_stock_thresholds_set_updated_at();

ALTER TABLE public.inventory_stock_thresholds ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON public.inventory_stock_thresholds FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON public.inventory_stock_thresholds FROM authenticated; END IF;
END $$;

COMMIT;

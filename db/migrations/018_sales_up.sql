BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public, pg_temp;

DO $$
BEGIN
  IF to_regclass('public.businesses') IS NULL
    OR to_regclass('public.business_locations') IS NULL
    OR to_regclass('public.business_members') IS NULL
    OR to_regclass('public.items') IS NULL THEN
    RAISE EXCEPTION 'Se requieren businesses, business_locations, business_members e items para crear ventas.';
  END IF;

  IF to_regclass('public.sales') IS NOT NULL
    OR to_regclass('public.sale_items') IS NOT NULL THEN
    RAISE EXCEPTION 'sales o sale_items ya existe.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.business_locations'::regclass
      AND conname = 'business_locations_business_id_id_key'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.items'::regclass
      AND conname = 'items_business_id_id_key'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.business_members'::regclass
      AND conname = 'business_members_business_user_key'
  ) THEN
    RAISE EXCEPTION 'Faltan restricciones compuestas indispensables para aislar las ventas por negocio.';
  END IF;
END
$$;

CREATE TABLE public.sales (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  location_id INTEGER NOT NULL,
  created_by INTEGER NOT NULL,
  payment_method VARCHAR(12) NOT NULL DEFAULT 'cash',
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  amount_received NUMERIC(14,2) NOT NULL DEFAULT 0,
  change_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  status VARCHAR(12) NOT NULL DEFAULT 'completed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT sales_business_id_id_key UNIQUE (business_id, id),
  CONSTRAINT sales_location_business_fkey
    FOREIGN KEY (business_id, location_id)
    REFERENCES public.business_locations (business_id, id) ON DELETE RESTRICT,
  CONSTRAINT sales_member_business_fkey
    FOREIGN KEY (business_id, created_by)
    REFERENCES public.business_members (business_id, user_id) ON DELETE RESTRICT,
  CONSTRAINT sales_payment_method_check
    CHECK (payment_method IN ('cash', 'card', 'transfer')),
  CONSTRAINT sales_status_check
    CHECK (status IN ('completed', 'cancelled')),
  CONSTRAINT sales_subtotal_check
    CHECK (subtotal >= 0),
  CONSTRAINT sales_total_check
    CHECK (total >= 0),
  CONSTRAINT sales_amount_received_check
    CHECK (amount_received >= 0),
  CONSTRAINT sales_change_amount_check
    CHECK (change_amount >= 0)
);

CREATE TABLE public.sale_items (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_id INTEGER NOT NULL,
  sale_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL,
  line_total NUMERIC(14,2) NOT NULL,
  CONSTRAINT sale_items_business_id_id_key UNIQUE (business_id, id),
  CONSTRAINT sale_items_sale_business_fkey
    FOREIGN KEY (business_id, sale_id)
    REFERENCES public.sales (business_id, id) ON DELETE RESTRICT,
  CONSTRAINT sale_items_item_business_fkey
    FOREIGN KEY (business_id, item_id)
    REFERENCES public.items (business_id, id) ON DELETE RESTRICT,
  CONSTRAINT sale_items_quantity_check
    CHECK (quantity > 0),
  CONSTRAINT sale_items_unit_price_check
    CHECK (unit_price >= 0),
  CONSTRAINT sale_items_line_total_check
    CHECK (line_total >= 0 AND line_total = quantity * unit_price)
);

CREATE INDEX sales_business_history_index
  ON public.sales (business_id, created_at DESC, id DESC);
CREATE INDEX sales_business_location_history_index
  ON public.sales (business_id, location_id, created_at DESC, id DESC);
CREATE INDEX sales_business_creator_history_index
  ON public.sales (business_id, created_by, created_at DESC, id DESC);
CREATE INDEX sale_items_business_sale_index
  ON public.sale_items (business_id, sale_id, id);
CREATE INDEX sale_items_business_item_index
  ON public.sale_items (business_id, item_id);

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.sales, public.sale_items FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.sales, public.sale_items FROM authenticated;
  END IF;
END
$$;

COMMIT;

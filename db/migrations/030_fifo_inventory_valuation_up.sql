BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public, pg_temp;

DO $$
BEGIN
  IF to_regclass('public.businesses') IS NULL
    OR to_regclass('public.items') IS NULL
    OR to_regclass('public.business_locations') IS NULL
    OR to_regclass('public.sales') IS NULL
    OR to_regclass('public.sale_items') IS NULL THEN
    RAISE EXCEPTION 'Se requieren businesses, items, business_locations, sales y sale_items para habilitar PEPS.';
  END IF;
  IF to_regclass('public.inventory_cost_layers') IS NOT NULL
    OR to_regclass('public.inventory_layer_consumptions') IS NOT NULL THEN
    RAISE EXCEPTION 'Las tablas de capas de costo ya existen.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'businesses'
      AND column_name = 'inventory_valuation_method'
  ) THEN
    RAISE EXCEPTION 'businesses.inventory_valuation_method ya existe.';
  END IF;
END
$$;

ALTER TABLE public.businesses
  ADD COLUMN inventory_valuation_method VARCHAR(10) NOT NULL DEFAULT 'average',
  ADD CONSTRAINT businesses_inventory_valuation_method_check
    CHECK (inventory_valuation_method IN ('average', 'fifo'));

CREATE TABLE public.inventory_cost_layers (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  item_id INTEGER NOT NULL,
  location_id INTEGER NOT NULL,
  source_movement_id INTEGER,
  source_layer_id BIGINT,
  source_operation_type VARCHAR(40) NOT NULL DEFAULT 'manual_entry',
  source_operation_id INTEGER,
  source_reference VARCHAR(120),
  received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  quantity_original INTEGER NOT NULL,
  quantity_available INTEGER NOT NULL,
  unit_cost NUMERIC(14,4) NOT NULL,
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(12) NOT NULL DEFAULT 'available',
  depleted_at TIMESTAMPTZ,
  CONSTRAINT inventory_cost_layers_business_id_id_key UNIQUE (business_id, id),
  CONSTRAINT inventory_cost_layers_item_business_fkey
    FOREIGN KEY (business_id, item_id)
    REFERENCES public.items(business_id, id) ON DELETE RESTRICT,
  CONSTRAINT inventory_cost_layers_location_business_fkey
    FOREIGN KEY (business_id, location_id)
    REFERENCES public.business_locations(business_id, id) ON DELETE RESTRICT,
  CONSTRAINT inventory_cost_layers_source_layer_business_fkey
    FOREIGN KEY (business_id, source_layer_id)
    REFERENCES public.inventory_cost_layers(business_id, id) ON DELETE RESTRICT,
  CONSTRAINT inventory_cost_layers_quantity_check
    CHECK (quantity_original > 0 AND quantity_available BETWEEN 0 AND quantity_original),
  CONSTRAINT inventory_cost_layers_unit_cost_check CHECK (unit_cost >= 0),
  CONSTRAINT inventory_cost_layers_status_check
    CHECK (
      (status = 'available' AND quantity_available > 0 AND depleted_at IS NULL)
      OR (status = 'depleted' AND quantity_available = 0 AND depleted_at IS NOT NULL)
    ),
  CONSTRAINT inventory_cost_layers_depleted_at_check
    CHECK (depleted_at IS NULL OR depleted_at >= received_at),
  CONSTRAINT inventory_cost_layers_source_type_check
    CHECK (source_operation_type IN ('opening_balance','purchase_receipt','manual_entry','adjustment_in','customer_return','production_output','transfer_in','migration')),
  CONSTRAINT inventory_cost_layers_source_reference_check
    CHECK (source_reference IS NULL OR (
      source_reference = btrim(source_reference)
      AND char_length(source_reference) BETWEEN 1 AND 120
    )),
  CONSTRAINT inventory_cost_layers_source_layer_check
    CHECK (source_layer_id IS NULL OR source_layer_id <> id)
);

CREATE TABLE public.inventory_layer_consumptions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  layer_id BIGINT NOT NULL,
  related_movement_id INTEGER,
  operation_type VARCHAR(40) NOT NULL,
  operation_id INTEGER NOT NULL,
  operation_reference VARCHAR(120),
  quantity INTEGER NOT NULL,
  unit_cost NUMERIC(14,4) NOT NULL,
  created_by INTEGER,
  consumed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT inventory_layer_consumptions_business_id_id_key UNIQUE (business_id, id),
  CONSTRAINT inventory_layer_consumptions_layer_business_fkey
    FOREIGN KEY (business_id, layer_id)
    REFERENCES public.inventory_cost_layers(business_id, id) ON DELETE RESTRICT,
  CONSTRAINT inventory_layer_consumptions_quantity_check CHECK (quantity > 0),
  CONSTRAINT inventory_layer_consumptions_unit_cost_check CHECK (unit_cost >= 0),
  CONSTRAINT inventory_layer_consumptions_type_check
    CHECK (operation_type IN ('sale','manual_exit','damage_loss','supplier_return','production_consumption','adjustment_out','transfer_out','other')),
  CONSTRAINT inventory_layer_consumptions_reference_check
    CHECK (operation_reference IS NULL OR (
      operation_reference = btrim(operation_reference)
      AND char_length(operation_reference) BETWEEN 1 AND 120
    ))
);

ALTER TABLE public.sales
  ADD COLUMN inventory_cost_snapshot NUMERIC(14,4),
  ADD COLUMN gross_profit_snapshot NUMERIC(14,4),
  ADD COLUMN valuation_method_snapshot VARCHAR(10),
  ADD CONSTRAINT sales_inventory_valuation_snapshot_check
    CHECK (
      (inventory_cost_snapshot IS NULL AND gross_profit_snapshot IS NULL AND valuation_method_snapshot IS NULL)
      OR (
        inventory_cost_snapshot >= 0
        AND gross_profit_snapshot = total - inventory_cost_snapshot
        AND valuation_method_snapshot IN ('average', 'fifo')
      )
    );

ALTER TABLE public.sale_items
  ADD COLUMN unit_cost_snapshot NUMERIC(18,10),
  ADD COLUMN inventory_cost_snapshot NUMERIC(18,4),
  ADD COLUMN gross_profit_snapshot NUMERIC(18,4),
  ADD COLUMN valuation_method_snapshot VARCHAR(10),
  ADD CONSTRAINT sale_items_inventory_valuation_snapshot_check
    CHECK (
      (unit_cost_snapshot IS NULL AND inventory_cost_snapshot IS NULL AND gross_profit_snapshot IS NULL AND valuation_method_snapshot IS NULL)
      OR (
        unit_cost_snapshot >= 0
        AND inventory_cost_snapshot >= 0
        AND inventory_cost_snapshot = ROUND(quantity * unit_cost_snapshot, 4)
        AND gross_profit_snapshot = line_total - inventory_cost_snapshot
        AND valuation_method_snapshot IN ('average', 'fifo')
      )
    );

CREATE INDEX inventory_cost_layers_available_fifo_index
  ON public.inventory_cost_layers (business_id, item_id, location_id, received_at, id)
  WHERE status = 'available' AND quantity_available > 0;
CREATE INDEX inventory_cost_layers_business_location_item_index
  ON public.inventory_cost_layers (business_id, location_id, item_id, id);
CREATE INDEX inventory_cost_layers_origin_index
  ON public.inventory_cost_layers (business_id, source_layer_id)
  WHERE source_layer_id IS NOT NULL;
CREATE INDEX inventory_layer_consumptions_layer_history_index
  ON public.inventory_layer_consumptions (business_id, layer_id, consumed_at DESC, id DESC);
CREATE INDEX inventory_layer_consumptions_business_history_index
  ON public.inventory_layer_consumptions (business_id, consumed_at DESC, id DESC);
CREATE INDEX inventory_layer_consumptions_business_reference_index
  ON public.inventory_layer_consumptions (business_id, operation_type, operation_reference, id)
  WHERE operation_reference IS NOT NULL;
CREATE INDEX sales_business_valuation_method_index
  ON public.sales (business_id, valuation_method_snapshot, created_at DESC, id DESC)
  WHERE valuation_method_snapshot IS NOT NULL;
CREATE INDEX sale_items_business_valuation_method_index
  ON public.sale_items (business_id, valuation_method_snapshot, item_id, id)
  WHERE valuation_method_snapshot IS NOT NULL;

CREATE FUNCTION public.inventory_cost_layers_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE TRIGGER inventory_cost_layers_updated_at_trigger
BEFORE UPDATE ON public.inventory_cost_layers
FOR EACH ROW EXECUTE FUNCTION public.inventory_cost_layers_set_updated_at();

ALTER TABLE public.inventory_cost_layers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_layer_consumptions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.inventory_cost_layers, public.inventory_layer_consumptions FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.inventory_cost_layers, public.inventory_layer_consumptions FROM authenticated;
  END IF;
END
$$;

COMMIT;

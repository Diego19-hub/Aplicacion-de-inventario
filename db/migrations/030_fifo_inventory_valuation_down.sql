BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public, pg_temp;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.inventory_layer_consumptions
  ) OR EXISTS (
    SELECT 1 FROM public.inventory_cost_layers
  ) THEN
    RAISE EXCEPTION 'No se puede revertir PEPS: existen capas o consumos de costo.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.businesses WHERE inventory_valuation_method <> 'average'
  ) THEN
    RAISE EXCEPTION 'No se puede revertir PEPS: existe un negocio configurado con fifo.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.sales
    WHERE inventory_cost_snapshot IS NOT NULL
       OR gross_profit_snapshot IS NOT NULL
       OR valuation_method_snapshot IS NOT NULL
  ) OR EXISTS (
    SELECT 1 FROM public.sale_items
    WHERE unit_cost_snapshot IS NOT NULL
       OR inventory_cost_snapshot IS NOT NULL
       OR gross_profit_snapshot IS NOT NULL
       OR valuation_method_snapshot IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'No se puede revertir PEPS: existen snapshots históricos de costo o utilidad.';
  END IF;
END
$$;

DROP INDEX IF EXISTS public.sale_items_business_valuation_method_index;
DROP INDEX IF EXISTS public.sales_business_valuation_method_index;
DROP INDEX IF EXISTS public.inventory_layer_consumptions_business_reference_index;
DROP INDEX IF EXISTS public.inventory_layer_consumptions_business_history_index;
DROP INDEX IF EXISTS public.inventory_layer_consumptions_layer_history_index;
DROP INDEX IF EXISTS public.inventory_layer_consumptions_operation_index;
DROP INDEX IF EXISTS public.inventory_cost_layers_source_movement_index;
DROP INDEX IF EXISTS public.inventory_cost_layers_source_layer_index;
DROP INDEX IF EXISTS public.inventory_cost_layers_origin_index;
DROP INDEX IF EXISTS public.inventory_cost_layers_business_location_item_index;
DROP INDEX IF EXISTS public.inventory_cost_layers_available_fifo_index;

ALTER TABLE public.sale_items
  DROP CONSTRAINT IF EXISTS sale_items_inventory_valuation_snapshot_check,
  DROP COLUMN IF EXISTS valuation_method_snapshot,
  DROP COLUMN IF EXISTS gross_profit_snapshot,
  DROP COLUMN IF EXISTS inventory_cost_snapshot,
  DROP COLUMN IF EXISTS unit_cost_snapshot;

ALTER TABLE public.sales
  DROP CONSTRAINT IF EXISTS sales_inventory_valuation_snapshot_check,
  DROP COLUMN IF EXISTS valuation_method_snapshot,
  DROP COLUMN IF EXISTS gross_profit_snapshot,
  DROP COLUMN IF EXISTS inventory_cost_snapshot;

DROP TABLE IF EXISTS public.inventory_layer_consumptions;
DROP TRIGGER IF EXISTS inventory_cost_layers_updated_at_trigger ON public.inventory_cost_layers;
DROP FUNCTION IF EXISTS public.inventory_cost_layers_set_updated_at();
DROP TABLE IF EXISTS public.inventory_cost_layers;

ALTER TABLE public.inventory_movements
  DROP CONSTRAINT IF EXISTS inventory_movements_business_id_id_key;

ALTER TABLE public.businesses
  DROP CONSTRAINT IF EXISTS businesses_inventory_valuation_method_check,
  DROP COLUMN IF EXISTS inventory_valuation_method;

COMMIT;

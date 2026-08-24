BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public, pg_temp;

DO $$
BEGIN
  IF to_regclass('public.business_costs') IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.business_costs) THEN
    RAISE EXCEPTION 'No se puede revertir: existen costos de negocio.';
  END IF;

  IF to_regclass('public.items') IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.items WHERE cost_price IS NOT NULL) THEN
    RAISE EXCEPTION 'No se puede revertir: existen costos de productos.';
  END IF;

  IF to_regclass('public.sale_items') IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.sale_items WHERE unit_cost IS NOT NULL) THEN
    RAISE EXCEPTION 'No se puede revertir: existen costos históricos de ventas.';
  END IF;
END
$$;

DROP TRIGGER IF EXISTS business_costs_updated_at_trigger ON public.business_costs;
DROP FUNCTION IF EXISTS public.business_costs_set_updated_at();
DROP INDEX IF EXISTS public.business_costs_business_active_index;
DROP INDEX IF EXISTS public.business_costs_business_frequency_index;
DROP INDEX IF EXISTS public.business_costs_business_type_index;
DROP INDEX IF EXISTS public.business_costs_business_index;
DROP TABLE IF EXISTS public.business_costs;

ALTER TABLE public.sale_items
  DROP CONSTRAINT IF EXISTS sale_items_unit_cost_check,
  DROP COLUMN IF EXISTS unit_cost;

ALTER TABLE public.items
  DROP CONSTRAINT IF EXISTS items_cost_price_check,
  DROP COLUMN IF EXISTS cost_price;

COMMIT;

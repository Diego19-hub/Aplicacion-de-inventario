BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public, pg_temp;

DO $$
BEGIN
  IF to_regclass('public.sale_items') IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.sale_items) THEN
    RAISE EXCEPTION 'No se puede revertir: existen líneas de venta.';
  END IF;

  IF to_regclass('public.sales') IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.sales) THEN
    RAISE EXCEPTION 'No se puede revertir: existen ventas.';
  END IF;
END
$$;

DROP TABLE IF EXISTS public.sale_items;
DROP TABLE IF EXISTS public.sales;

COMMIT;

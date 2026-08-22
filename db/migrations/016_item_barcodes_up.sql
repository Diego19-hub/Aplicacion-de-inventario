BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public, pg_temp;

ALTER TABLE public.items ADD COLUMN barcode text NULL;

DO $$
DECLARE duplicate_count integer;
BEGIN
  SELECT count(*) INTO duplicate_count
  FROM (
    SELECT business_id, barcode
    FROM public.items
    WHERE barcode IS NOT NULL AND barcode <> ''
    GROUP BY business_id, barcode
    HAVING count(*) > 1
  ) duplicates;
  IF duplicate_count > 0 THEN
    RAISE EXCEPTION 'No se puede crear la unicidad de códigos de barras: existen % grupos duplicados. Identifícalos con SELECT business_id, barcode, count(*) FROM items WHERE barcode IS NOT NULL AND barcode <> '''' GROUP BY business_id, barcode HAVING count(*) > 1.', duplicate_count;
  END IF;
END;
$$;

CREATE UNIQUE INDEX items_business_barcode_unique
  ON public.items (business_id, barcode)
  WHERE barcode IS NOT NULL AND barcode <> '';

COMMIT;

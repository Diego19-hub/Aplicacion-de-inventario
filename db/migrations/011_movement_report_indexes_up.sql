BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public, pg_temp;

DO $$
DECLARE
  required_column TEXT;
BEGIN
  IF to_regclass('public.inventory_movements') IS NULL THEN
    RAISE EXCEPTION 'No se pueden crear índices del reporte: falta public.inventory_movements.';
  END IF;

  FOREACH required_column IN ARRAY ARRAY[
    'id',
    'business_id',
    'created_by',
    'movement_type',
    'created_at'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_attribute
      WHERE attrelid = 'public.inventory_movements'::regclass
        AND attname = required_column
        AND NOT attisdropped
    ) THEN
      RAISE EXCEPTION 'No se pueden crear índices del reporte: falta la columna inventory_movements.%.', required_column;
    END IF;
  END LOOP;
END
$$;

CREATE INDEX inventory_movements_business_user_history_index
  ON public.inventory_movements
    (business_id, created_by, created_at DESC, id DESC);

CREATE INDEX inventory_movements_business_type_history_index
  ON public.inventory_movements
    (business_id, movement_type, created_at DESC, id DESC);

COMMIT;

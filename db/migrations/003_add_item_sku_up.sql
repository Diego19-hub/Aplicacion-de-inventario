BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public, pg_temp;

DO $$
BEGIN
  IF to_regclass('public.items') IS NULL OR to_regclass('public.categories') IS NULL THEN
    RAISE EXCEPTION 'No se puede añadir SKU: se requieren las tablas items y categories.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'items' AND column_name = 'sku'
  ) THEN
    RAISE EXCEPTION 'No se puede añadir SKU: items.sku ya existe.';
  END IF;
END $$;

ALTER TABLE public.items ADD COLUMN sku VARCHAR(64);

WITH normalized_items AS (
  SELECT
    items.id,
    items.business_id,
    CASE
      WHEN normalized_prefix = '' THEN 'PRD'
      WHEN char_length(normalized_prefix) < 3 THEN rpad(normalized_prefix, 3, 'X')
      ELSE left(normalized_prefix, 3)
    END AS prefix
  FROM public.items
  INNER JOIN public.categories
    ON categories.id = items.category_id
   AND categories.business_id = items.business_id
  CROSS JOIN LATERAL (
    SELECT regexp_replace(
      upper(
        translate(
          translate(
            categories.name,
            'ÁÉÍÓÚÜÀÈÌÒÙÂÊÎÔÛÄËÏÖÑÇ',
            'AEIOUUAEIOUAEIOUAEIOUNC'
          ),
          'áéíóúüàèìòùâêîôûäëïöñç',
          'aeiouuaeiouaeiouaeiounc'
        )
      ),
      '[^A-Z0-9]', '', 'g'
    ) AS normalized_prefix
  ) AS category_prefix
), numbered_items AS (
  SELECT
    id,
    prefix,
    row_number() OVER (PARTITION BY business_id, prefix ORDER BY id) AS sequence_number
  FROM normalized_items
)
UPDATE public.items
SET sku = numbered_items.prefix || '-' || lpad(numbered_items.sequence_number::TEXT, 4, '0')
FROM numbered_items
WHERE items.id = numbered_items.id;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.items WHERE sku IS NULL OR sku = '') THEN
    RAISE EXCEPTION 'No se puede finalizar SKU: existen productos sin SKU.';
  END IF;
END $$;

ALTER TABLE public.items ALTER COLUMN sku SET NOT NULL;
ALTER TABLE public.items
  ADD CONSTRAINT items_sku_format_check
  CHECK (
    sku = upper(sku)
    AND sku ~ '^[A-Z0-9]+(?:-[A-Z0-9]+)*$'
    AND char_length(sku) <= 64
  );
CREATE UNIQUE INDEX items_business_sku_lower_key
  ON public.items (business_id, lower(sku));

COMMIT;

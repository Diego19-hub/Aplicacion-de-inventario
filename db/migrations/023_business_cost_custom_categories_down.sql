BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public, pg_temp;

DROP INDEX IF EXISTS public.business_costs_business_custom_category_index;

ALTER TABLE public.business_costs
  DROP CONSTRAINT IF EXISTS business_costs_custom_category_check,
  DROP CONSTRAINT IF EXISTS business_costs_category_check,
  DROP COLUMN IF EXISTS custom_category_name,
  ADD CONSTRAINT business_costs_category_check
    CHECK (category IN ('labor', 'logistics'));

COMMIT;

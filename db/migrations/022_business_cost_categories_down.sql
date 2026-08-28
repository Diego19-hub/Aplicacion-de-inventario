BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public, pg_temp;

DROP INDEX IF EXISTS public.business_costs_business_category_index;
DROP INDEX IF EXISTS public.business_costs_business_dates_index;

ALTER TABLE public.business_costs
  DROP CONSTRAINT IF EXISTS business_costs_category_check,
  DROP CONSTRAINT IF EXISTS business_costs_dates_check,
  DROP CONSTRAINT IF EXISTS business_costs_notes_check,
  DROP CONSTRAINT IF EXISTS business_costs_frequency_check,
  ADD CONSTRAINT business_costs_frequency_check
    CHECK (frequency IN ('monthly', 'yearly', 'one_time')),
  DROP COLUMN IF EXISTS category,
  DROP COLUMN IF EXISTS start_date,
  DROP COLUMN IF EXISTS end_date,
  DROP COLUMN IF EXISTS notes;

COMMIT;

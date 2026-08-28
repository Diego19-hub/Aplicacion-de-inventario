BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public, pg_temp;

ALTER TABLE public.business_costs
  ADD COLUMN category VARCHAR(20) NOT NULL DEFAULT 'labor',
  ADD COLUMN start_date DATE,
  ADD COLUMN end_date DATE,
  ADD COLUMN notes VARCHAR(1000);

UPDATE public.business_costs
SET start_date = created_at::date
WHERE start_date IS NULL;

ALTER TABLE public.business_costs
  ALTER COLUMN start_date SET NOT NULL,
  ALTER COLUMN start_date SET DEFAULT CURRENT_DATE,
  DROP CONSTRAINT business_costs_frequency_check,
  ADD CONSTRAINT business_costs_frequency_check
    CHECK (frequency IN ('weekly', 'monthly', 'yearly', 'one_time')),
  ADD CONSTRAINT business_costs_category_check
    CHECK (category IN ('labor', 'logistics')),
  ADD CONSTRAINT business_costs_dates_check
    CHECK (end_date IS NULL OR end_date >= start_date),
  ADD CONSTRAINT business_costs_notes_check
    CHECK (notes IS NULL OR char_length(notes) <= 1000);

CREATE INDEX business_costs_business_category_index
  ON public.business_costs (business_id, category);
CREATE INDEX business_costs_business_dates_index
  ON public.business_costs (business_id, start_date, end_date);

COMMIT;

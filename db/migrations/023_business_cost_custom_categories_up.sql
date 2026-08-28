BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public, pg_temp;

ALTER TABLE public.business_costs
  DROP CONSTRAINT business_costs_category_check,
  ADD COLUMN custom_category_name VARCHAR(100),
  ADD CONSTRAINT business_costs_category_check
    CHECK (category IN ('labor', 'logistics', 'rent', 'utilities', 'supplies', 'maintenance', 'marketing', 'software', 'commissions', 'taxes', 'banking', 'other', 'custom')),
  ADD CONSTRAINT business_costs_custom_category_check
    CHECK (
      (category = 'custom' AND custom_category_name IS NOT NULL AND char_length(btrim(custom_category_name)) BETWEEN 1 AND 100)
      OR (category <> 'custom' AND custom_category_name IS NULL)
    );

CREATE INDEX business_costs_business_custom_category_index
  ON public.business_costs (business_id, custom_category_name);

COMMIT;

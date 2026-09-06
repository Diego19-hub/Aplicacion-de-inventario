BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public, pg_temp;

DROP INDEX IF EXISTS public.inventory_return_items_business_sale_item_index;
DROP INDEX IF EXISTS public.inventory_returns_business_sale_index;
ALTER TABLE public.inventory_return_items
  DROP CONSTRAINT IF EXISTS inventory_return_items_condition_check,
  DROP CONSTRAINT IF EXISTS inventory_return_items_customer_sale_item_check,
  DROP CONSTRAINT IF EXISTS inventory_return_items_sale_item_business_fkey,
  DROP COLUMN IF EXISTS item_condition,
  DROP COLUMN IF EXISTS sale_item_id;
ALTER TABLE public.inventory_return_items
  ALTER COLUMN unit_cost TYPE NUMERIC(14,2);
ALTER TABLE public.inventory_returns
  DROP CONSTRAINT IF EXISTS inventory_returns_customer_sale_check,
  DROP CONSTRAINT IF EXISTS inventory_returns_sale_business_fkey,
  DROP CONSTRAINT IF EXISTS inventory_returns_type_check,
  ADD CONSTRAINT inventory_returns_type_check
    CHECK (return_type IN ('supplier_return','damage','loss','destroyed','expired')),
  DROP COLUMN IF EXISTS sale_id;

COMMIT;

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public, pg_temp;

ALTER TABLE public.inventory_returns
  ADD COLUMN sale_id INTEGER;

ALTER TABLE public.inventory_returns
  DROP CONSTRAINT inventory_returns_type_check,
  ADD CONSTRAINT inventory_returns_type_check
    CHECK (return_type IN ('supplier_return','customer_return','damage','loss','destroyed','expired')),
  ADD CONSTRAINT inventory_returns_sale_business_fkey
    FOREIGN KEY (business_id, sale_id) REFERENCES public.sales (business_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT inventory_returns_customer_sale_check
    CHECK ((return_type = 'customer_return' AND sale_id IS NOT NULL AND purchase_order_id IS NULL AND supplier_id IS NULL)
       OR (return_type <> 'customer_return' AND sale_id IS NULL));

ALTER TABLE public.inventory_return_items
  ALTER COLUMN unit_cost TYPE NUMERIC(18,4);

ALTER TABLE public.inventory_return_items
  ADD COLUMN sale_item_id INTEGER,
  ADD COLUMN item_condition VARCHAR(8) NOT NULL DEFAULT 'good',
  ADD CONSTRAINT inventory_return_items_sale_item_business_fkey
    FOREIGN KEY (business_id, sale_item_id) REFERENCES public.sale_items (business_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT inventory_return_items_customer_sale_item_check
    CHECK (sale_item_id IS NULL OR sale_item_id > 0),
  ADD CONSTRAINT inventory_return_items_condition_check
    CHECK (item_condition IN ('good','damaged'));

CREATE INDEX inventory_returns_business_sale_index
  ON public.inventory_returns (business_id, sale_id, created_at DESC)
  WHERE sale_id IS NOT NULL;
CREATE INDEX inventory_return_items_business_sale_item_index
  ON public.inventory_return_items (business_id, sale_item_id)
  WHERE sale_item_id IS NOT NULL;

COMMIT;

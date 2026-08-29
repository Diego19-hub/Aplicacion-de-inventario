BEGIN;
DROP TABLE IF EXISTS public.inventory_return_items;
DROP TABLE IF EXISTS public.inventory_returns;
ALTER TABLE public.purchase_order_items DROP CONSTRAINT IF EXISTS purchase_order_items_returned_check;
ALTER TABLE public.purchase_order_items DROP COLUMN IF EXISTS quantity_returned;
COMMIT;

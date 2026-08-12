BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public, pg_temp;

DROP INDEX public.inventory_movements_business_user_history_index;
DROP INDEX public.inventory_movements_business_type_history_index;

COMMIT;

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public, pg_temp;
DROP TRIGGER IF EXISTS recipes_updated_at_trigger ON public.recipes;
DROP FUNCTION IF EXISTS public.recipes_set_updated_at();
DROP TABLE IF EXISTS public.recipe_ingredients;
DROP TABLE IF EXISTS public.recipes;
COMMIT;

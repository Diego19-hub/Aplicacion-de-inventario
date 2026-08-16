-- Destructiva respecto a la garantía de exactamente un owner activo por negocio.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public, pg_temp;

DROP TRIGGER IF EXISTS business_members_exactly_one_active_owner_trigger ON public.business_members;
DROP TRIGGER IF EXISTS businesses_exactly_one_active_owner_trigger ON public.businesses;
DROP FUNCTION IF EXISTS public.enforce_exactly_one_active_owner();

-- Se conserva el índice parcial preexistente que garantiza como máximo un owner activo.
COMMIT;

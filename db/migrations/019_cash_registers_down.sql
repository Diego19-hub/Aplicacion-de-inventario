BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public, pg_temp;

DO $$
BEGIN
  IF to_regclass('public.cash_movements') IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.cash_movements) THEN
    RAISE EXCEPTION 'No se puede revertir: existen movimientos de Caja.';
  END IF;

  IF to_regclass('public.cash_sessions') IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.cash_sessions) THEN
    RAISE EXCEPTION 'No se puede revertir: existen sesiones de Caja.';
  END IF;

  IF to_regclass('public.cash_registers') IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.cash_registers) THEN
    RAISE EXCEPTION 'No se puede revertir: existen cajas.';
  END IF;
END
$$;

ALTER TABLE public.sales
  DROP CONSTRAINT IF EXISTS sales_cash_session_business_fkey,
  DROP CONSTRAINT IF EXISTS sales_cash_session_payment_check;
DROP INDEX IF EXISTS public.sales_business_cash_session_index;
ALTER TABLE public.sales DROP COLUMN IF EXISTS cash_session_id;

DROP TABLE IF EXISTS public.cash_movements;
DROP TABLE IF EXISTS public.cash_sessions;
DROP TRIGGER IF EXISTS cash_registers_updated_at_trigger ON public.cash_registers;
DROP FUNCTION IF EXISTS public.cash_registers_set_updated_at();
DROP TABLE IF EXISTS public.cash_registers;

COMMIT;

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public, pg_temp;

DO $$
BEGIN
  IF to_regclass('public.businesses') IS NULL
    OR to_regclass('public.business_locations') IS NULL
    OR to_regclass('public.business_members') IS NULL
    OR to_regclass('public.sales') IS NULL THEN
    RAISE EXCEPTION 'Se requieren businesses, business_locations, business_members y sales para crear Caja.';
  END IF;

  IF to_regclass('public.cash_registers') IS NOT NULL
    OR to_regclass('public.cash_sessions') IS NOT NULL
    OR to_regclass('public.cash_movements') IS NOT NULL THEN
    RAISE EXCEPTION 'Una o más tablas de Caja ya existen.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.business_locations'::regclass
      AND conname = 'business_locations_business_id_id_key'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.business_members'::regclass
      AND conname = 'business_members_business_user_key'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.sales'::regclass
      AND conname = 'sales_business_id_id_key'
  ) THEN
    RAISE EXCEPTION 'Faltan restricciones compuestas necesarias para aislar Caja por negocio.';
  END IF;
END
$$;

CREATE TABLE public.cash_registers (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  location_id INTEGER NOT NULL,
  name VARCHAR(120) NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT cash_registers_business_id_id_key UNIQUE (business_id, id),
  CONSTRAINT cash_registers_location_business_fkey
    FOREIGN KEY (business_id, location_id)
    REFERENCES public.business_locations (business_id, id) ON DELETE RESTRICT,
  CONSTRAINT cash_registers_name_check
    CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 120),
  CONSTRAINT cash_registers_status_check
    CHECK (status IN ('active', 'inactive'))
);

CREATE INDEX cash_registers_business_index
  ON public.cash_registers (business_id);
CREATE INDEX cash_registers_business_location_index
  ON public.cash_registers (business_id, location_id);
CREATE FUNCTION public.cash_registers_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = clock_timestamp();
  RETURN NEW;
END;
$$;
CREATE TRIGGER cash_registers_updated_at_trigger
  BEFORE UPDATE ON public.cash_registers
  FOR EACH ROW EXECUTE FUNCTION public.cash_registers_set_updated_at();

CREATE TABLE public.cash_sessions (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_id INTEGER NOT NULL,
  register_id INTEGER NOT NULL,
  opened_by INTEGER NOT NULL,
  opening_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_by INTEGER,
  closing_amount NUMERIC(14,2),
  expected_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  difference_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  status VARCHAR(8) NOT NULL DEFAULT 'open',
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT cash_sessions_business_id_id_key UNIQUE (business_id, id),
  CONSTRAINT cash_sessions_register_business_fkey
    FOREIGN KEY (business_id, register_id)
    REFERENCES public.cash_registers (business_id, id) ON DELETE RESTRICT,
  CONSTRAINT cash_sessions_opened_by_business_fkey
    FOREIGN KEY (business_id, opened_by)
    REFERENCES public.business_members (business_id, user_id) ON DELETE RESTRICT,
  CONSTRAINT cash_sessions_closed_by_business_fkey
    FOREIGN KEY (business_id, closed_by)
    REFERENCES public.business_members (business_id, user_id) ON DELETE RESTRICT,
  CONSTRAINT cash_sessions_opening_amount_check
    CHECK (opening_amount >= 0),
  CONSTRAINT cash_sessions_closing_amount_check
    CHECK (closing_amount IS NULL OR closing_amount >= 0),
  CONSTRAINT cash_sessions_expected_amount_check
    CHECK (expected_amount >= 0),
  CONSTRAINT cash_sessions_status_check
    CHECK (status IN ('open', 'closed')),
  CONSTRAINT cash_sessions_state_check
    CHECK (
      (status = 'open' AND closed_by IS NULL AND closing_amount IS NULL AND closed_at IS NULL)
      OR
      (status = 'closed' AND closed_by IS NOT NULL AND closing_amount IS NOT NULL AND closed_at IS NOT NULL)
    )
);

CREATE INDEX cash_sessions_business_index
  ON public.cash_sessions (business_id, created_at DESC, id DESC);
CREATE INDEX cash_sessions_business_register_index
  ON public.cash_sessions (business_id, register_id, created_at DESC, id DESC);
CREATE UNIQUE INDEX cash_sessions_one_open_per_register_index
  ON public.cash_sessions (business_id, register_id)
  WHERE status = 'open';

CREATE TABLE public.cash_movements (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_id INTEGER NOT NULL,
  session_id INTEGER NOT NULL,
  movement_type VARCHAR(22) NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  reason VARCHAR(500) NOT NULL,
  created_by INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT cash_movements_business_id_id_key UNIQUE (business_id, id),
  CONSTRAINT cash_movements_session_business_fkey
    FOREIGN KEY (business_id, session_id)
    REFERENCES public.cash_sessions (business_id, id) ON DELETE RESTRICT,
  CONSTRAINT cash_movements_created_by_business_fkey
    FOREIGN KEY (business_id, created_by)
    REFERENCES public.business_members (business_id, user_id) ON DELETE RESTRICT,
  CONSTRAINT cash_movements_type_check
    CHECK (movement_type IN ('opening', 'sale', 'cash_in', 'cash_out', 'closing_adjustment')),
  CONSTRAINT cash_movements_amount_check
    CHECK (amount > 0),
  CONSTRAINT cash_movements_reason_check
    CHECK (reason = btrim(reason) AND char_length(reason) BETWEEN 1 AND 500)
);

CREATE INDEX cash_movements_business_history_index
  ON public.cash_movements (business_id, created_at DESC, id DESC);
CREATE INDEX cash_movements_business_session_index
  ON public.cash_movements (business_id, session_id, created_at DESC, id DESC);

ALTER TABLE public.sales
  ADD COLUMN cash_session_id INTEGER;

ALTER TABLE public.sales
  ADD CONSTRAINT sales_cash_session_business_fkey
    FOREIGN KEY (business_id, cash_session_id)
    REFERENCES public.cash_sessions (business_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT sales_cash_session_payment_check
    CHECK (cash_session_id IS NULL OR payment_method = 'cash');

CREATE INDEX sales_business_cash_session_index
  ON public.sales (business_id, cash_session_id, created_at DESC, id DESC)
  WHERE cash_session_id IS NOT NULL;

ALTER TABLE public.cash_registers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.cash_registers, public.cash_sessions, public.cash_movements FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.cash_registers, public.cash_sessions, public.cash_movements FROM authenticated;
  END IF;
END
$$;

COMMIT;

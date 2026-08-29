BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public, pg_temp;

CREATE TABLE public.audit_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  user_id INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
  module VARCHAR(40) NOT NULL,
  action VARCHAR(32) NOT NULL,
  reference VARCHAR(160),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  description VARCHAR(1000) NOT NULL,
  previous_values JSONB,
  new_values JSONB,
  ip_address INET,
  CONSTRAINT audit_log_module_check CHECK (btrim(module) <> ''),
  CONSTRAINT audit_log_action_check CHECK (action IN ('create','edit','cancel','delete','receive','register_payment','change_status','change_permissions')),
  CONSTRAINT audit_log_description_check CHECK (btrim(description) <> ''),
  CONSTRAINT audit_log_user_business_fkey FOREIGN KEY (business_id, user_id) REFERENCES public.business_members(business_id, user_id)
);

CREATE INDEX audit_log_business_occurred_index ON public.audit_log (business_id, occurred_at DESC, id DESC);
CREATE INDEX audit_log_business_module_index ON public.audit_log (business_id, module, occurred_at DESC);
CREATE INDEX audit_log_business_user_index ON public.audit_log (business_id, user_id, occurred_at DESC);
CREATE INDEX audit_log_business_action_index ON public.audit_log (business_id, action, occurred_at DESC);
CREATE INDEX audit_log_business_reference_index ON public.audit_log (business_id, reference);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
COMMIT;

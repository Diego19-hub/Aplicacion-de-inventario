BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public, pg_temp;

CREATE TABLE public.customers (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  name VARCHAR(160) NOT NULL,
  phone VARCHAR(40), email VARCHAR(254), address VARCHAR(300), notes VARCHAR(1000),
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_by INTEGER NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT customers_business_id_id_key UNIQUE (business_id, id),
  CONSTRAINT customers_created_by_business_fkey FOREIGN KEY (business_id, created_by) REFERENCES public.business_members(business_id, user_id),
  CONSTRAINT customers_status_check CHECK (status IN ('active','inactive','suspended')),
  CONSTRAINT customers_name_check CHECK (char_length(btrim(name)) BETWEEN 1 AND 160)
);
CREATE TABLE public.customer_charges (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  customer_id INTEGER NOT NULL, concept VARCHAR(200) NOT NULL, amount NUMERIC(12,2) NOT NULL,
  frequency VARCHAR(20) NOT NULL, due_date DATE NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'pending',
  notes VARCHAR(1000), created_by INTEGER NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT customer_charges_business_id_id_key UNIQUE (business_id,id),
  CONSTRAINT customer_charges_business_customer_id_key UNIQUE (business_id,customer_id,id),
  CONSTRAINT customer_charges_customer_fkey FOREIGN KEY (business_id,customer_id) REFERENCES public.customers(business_id,id) ON DELETE RESTRICT,
  CONSTRAINT customer_charges_created_by_business_fkey FOREIGN KEY (business_id,created_by) REFERENCES public.business_members(business_id,user_id),
  CONSTRAINT customer_charges_amount_check CHECK (amount > 0),
  CONSTRAINT customer_charges_frequency_check CHECK (frequency IN ('weekly','biweekly','monthly','one_time')),
  CONSTRAINT customer_charges_status_check CHECK (status IN ('pending','partially_paid','paid','overdue','cancelled'))
);
CREATE TABLE public.customer_payments (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  customer_id INTEGER NOT NULL, charge_id INTEGER, folio VARCHAR(40) NOT NULL,
  amount NUMERIC(12,2) NOT NULL, payment_method VARCHAR(20) NOT NULL, paid_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  previous_balance NUMERIC(12,2) NOT NULL, remaining_balance NUMERIC(12,2) NOT NULL,
  notes VARCHAR(1000), status VARCHAR(20) NOT NULL DEFAULT 'active', created_by INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, cancelled_at TIMESTAMPTZ, cancelled_by INTEGER, cancellation_reason VARCHAR(500),
  CONSTRAINT customer_payments_folio_key UNIQUE (folio),
  CONSTRAINT customer_payments_customer_fkey FOREIGN KEY (business_id,customer_id) REFERENCES public.customers(business_id,id),
  CONSTRAINT customer_payments_charge_fkey FOREIGN KEY (business_id,customer_id,charge_id) REFERENCES public.customer_charges(business_id,customer_id,id),
  CONSTRAINT customer_payments_created_by_business_fkey FOREIGN KEY (business_id,created_by) REFERENCES public.business_members(business_id,user_id),
  CONSTRAINT customer_payments_cancelled_by_business_fkey FOREIGN KEY (business_id,cancelled_by) REFERENCES public.business_members(business_id,user_id),
  CONSTRAINT customer_payments_amount_check CHECK (amount > 0),
  CONSTRAINT customer_payments_balance_check CHECK (previous_balance >= 0 AND remaining_balance >= 0),
  CONSTRAINT customer_payments_method_check CHECK (payment_method IN ('cash','transfer','card','other')),
  CONSTRAINT customer_payments_status_check CHECK (status IN ('active','cancelled')),
  CONSTRAINT customer_payments_cancel_check CHECK (status = 'active' OR (cancelled_at IS NOT NULL AND cancellation_reason IS NOT NULL AND char_length(btrim(cancellation_reason)) > 0))
);
CREATE INDEX customers_business_status_idx ON public.customers (business_id,status);
CREATE INDEX customer_charges_business_customer_idx ON public.customer_charges (business_id,customer_id);
CREATE INDEX customer_charges_status_due_idx ON public.customer_charges (business_id,status,due_date);
CREATE INDEX customer_payments_business_customer_idx ON public.customer_payments (business_id,customer_id);
CREATE INDEX customer_payments_business_status_idx ON public.customer_payments (business_id,status);
CREATE INDEX customer_payments_paid_at_idx ON public.customer_payments (business_id,paid_at);
COMMIT;

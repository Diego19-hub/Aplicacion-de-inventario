BEGIN;
SET LOCAL lock_timeout = '5s'; SET LOCAL statement_timeout = '30s'; SET LOCAL search_path = pg_catalog, public, pg_temp;
CREATE TABLE public.suppliers (
 id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 business_id INTEGER NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
 name VARCHAR(120) NOT NULL, legal_name VARCHAR(255), tax_id VARCHAR(40), contact_name VARCHAR(120), email VARCHAR(254), phone VARCHAR(40), address TEXT, notes TEXT,
 status VARCHAR(10) NOT NULL DEFAULT 'active', created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT suppliers_name_check CHECK (name=btrim(name) AND char_length(name) BETWEEN 2 AND 120),
 CONSTRAINT suppliers_status_check CHECK (status IN ('active','inactive')),
 CONSTRAINT suppliers_optional_check CHECK ((legal_name IS NULL OR legal_name=btrim(legal_name)) AND (tax_id IS NULL OR tax_id=btrim(tax_id) AND tax_id=upper(tax_id) AND tax_id ~ '^[A-Z0-9._/-]+$') AND (contact_name IS NULL OR contact_name=btrim(contact_name)) AND (email IS NULL OR email=btrim(email) AND email=lower(email)) AND (phone IS NULL OR phone=btrim(phone)) AND (address IS NULL OR address=btrim(address)) AND (notes IS NULL OR notes=btrim(notes))),
 CONSTRAINT suppliers_business_name_key UNIQUE (business_id, name)
);
CREATE UNIQUE INDEX suppliers_business_name_lower_key ON public.suppliers (business_id, lower(name));
CREATE INDEX suppliers_business_status_index ON public.suppliers (business_id,status);
CREATE FUNCTION public.suppliers_set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=clock_timestamp(); RETURN NEW; END; $$;
CREATE TRIGGER suppliers_updated_at_trigger BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.suppliers_set_updated_at();
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON public.suppliers FROM anon; END IF; IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON public.suppliers FROM authenticated; END IF; END $$;
COMMIT;

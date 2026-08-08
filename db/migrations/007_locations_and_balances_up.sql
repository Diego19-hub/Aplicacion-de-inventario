BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public, pg_temp;

DO $$ BEGIN
  IF to_regclass('public.businesses') IS NULL OR to_regclass('public.items') IS NULL OR to_regclass('public.inventory_movements') IS NULL THEN
    RAISE EXCEPTION 'Se requieren businesses, items e inventory_movements para crear ubicaciones.';
  END IF;
  IF to_regclass('public.business_locations') IS NOT NULL OR to_regclass('public.inventory_balances') IS NOT NULL THEN
    RAISE EXCEPTION 'Las ubicaciones o balances ya existen.';
  END IF;
END $$;

CREATE TABLE public.business_locations (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  name VARCHAR(120) NOT NULL,
  code VARCHAR(30) NOT NULL,
  location_type VARCHAR(12) NOT NULL,
  address VARCHAR(500), phone VARCHAR(40), notes TEXT,
  status VARCHAR(10) NOT NULL DEFAULT 'active',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT business_locations_business_id_id_key UNIQUE (business_id, id),
  CONSTRAINT business_locations_name_check CHECK (name = btrim(name) AND char_length(name) BETWEEN 2 AND 120),
  CONSTRAINT business_locations_code_check CHECK (code = upper(code) AND code ~ '^[A-Z0-9]+(?:-[A-Z0-9]+)*$' AND char_length(code) BETWEEN 2 AND 30),
  CONSTRAINT business_locations_type_check CHECK (location_type IN ('branch', 'warehouse')),
  CONSTRAINT business_locations_status_check CHECK (status IN ('active', 'inactive')),
  CONSTRAINT business_locations_default_active_check CHECK (NOT is_default OR status = 'active'),
  CONSTRAINT business_locations_optional_check CHECK ((address IS NULL OR address = btrim(address)) AND (phone IS NULL OR phone = btrim(phone)) AND (notes IS NULL OR notes = btrim(notes)))
);
CREATE UNIQUE INDEX business_locations_business_name_lower_key ON public.business_locations (business_id, lower(name));
CREATE UNIQUE INDEX business_locations_business_code_lower_key ON public.business_locations (business_id, lower(code));
CREATE UNIQUE INDEX business_locations_one_default_per_business ON public.business_locations (business_id) WHERE is_default;
CREATE INDEX business_locations_business_status_index ON public.business_locations (business_id, status);
CREATE FUNCTION public.business_locations_set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = clock_timestamp(); RETURN NEW; END; $$;
CREATE TRIGGER business_locations_updated_at_trigger BEFORE UPDATE ON public.business_locations FOR EACH ROW EXECUTE FUNCTION public.business_locations_set_updated_at();
ALTER TABLE public.business_locations ENABLE ROW LEVEL SECURITY;

INSERT INTO public.business_locations (business_id, name, code, location_type, is_default)
SELECT id, 'Sucursal principal', 'MAIN', 'branch', true FROM public.businesses;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.businesses b WHERE 1 <> (SELECT count(*) FROM public.business_locations l WHERE l.business_id=b.id AND l.is_default AND l.status='active')) THEN
    RAISE EXCEPTION 'Cada negocio debe tener exactamente una ubicación principal activa.';
  END IF;
END $$;

CREATE TABLE public.inventory_balances (
  business_id INTEGER NOT NULL,
  location_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  stock INTEGER NOT NULL CHECK (stock >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT inventory_balances_pkey PRIMARY KEY (business_id, location_id, item_id),
  CONSTRAINT inventory_balances_location_business_fkey FOREIGN KEY (business_id, location_id) REFERENCES public.business_locations (business_id, id) ON DELETE RESTRICT,
  CONSTRAINT inventory_balances_item_business_fkey FOREIGN KEY (business_id, item_id) REFERENCES public.items (business_id, id) ON DELETE RESTRICT
);
CREATE INDEX inventory_balances_business_item_index ON public.inventory_balances (business_id, item_id);
CREATE INDEX inventory_balances_business_location_index ON public.inventory_balances (business_id, location_id);
CREATE FUNCTION public.inventory_balances_set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = clock_timestamp(); RETURN NEW; END; $$;
CREATE TRIGGER inventory_balances_updated_at_trigger BEFORE UPDATE ON public.inventory_balances FOR EACH ROW EXECUTE FUNCTION public.inventory_balances_set_updated_at();
ALTER TABLE public.inventory_balances ENABLE ROW LEVEL SECURITY;

INSERT INTO public.inventory_balances (business_id, location_id, item_id, stock)
SELECT i.business_id, l.id, i.id, i.stock
FROM public.items i JOIN public.business_locations l ON l.business_id=i.business_id AND l.is_default
WHERE i.stock > 0;

DROP TRIGGER inventory_movements_immutable_trigger ON public.inventory_movements;
ALTER TABLE public.inventory_movements ADD COLUMN location_id INTEGER;
UPDATE public.inventory_movements m SET location_id=l.id FROM public.business_locations l WHERE l.business_id=m.business_id AND l.is_default;
ALTER TABLE public.inventory_movements ALTER COLUMN location_id SET NOT NULL;
ALTER TABLE public.inventory_movements ADD CONSTRAINT inventory_movements_location_business_fkey FOREIGN KEY (business_id, location_id) REFERENCES public.business_locations (business_id, id) ON DELETE RESTRICT;
CREATE INDEX inventory_movements_business_location_history_index ON public.inventory_movements (business_id, location_id, created_at DESC, id DESC);
CREATE TRIGGER inventory_movements_immutable_trigger BEFORE UPDATE OR DELETE ON public.inventory_movements FOR EACH ROW EXECUTE FUNCTION public.inventory_movements_immutable();

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.items i WHERE i.stock <> COALESCE((SELECT sum(b.stock) FROM public.inventory_balances b WHERE b.business_id=i.business_id AND b.item_id=i.id),0)) THEN RAISE EXCEPTION 'La suma de balances no coincide con items.stock.'; END IF;
  IF EXISTS (SELECT 1 FROM public.inventory_balances b WHERE b.stock <> COALESCE((SELECT sum(m.quantity_delta) FROM public.inventory_movements m WHERE m.business_id=b.business_id AND m.item_id=b.item_id AND m.location_id=b.location_id),0)) THEN RAISE EXCEPTION 'El ledger por ubicación no coincide con balances.'; END IF;
  IF EXISTS (SELECT 1 FROM public.inventory_movements m LEFT JOIN public.business_locations l ON (l.business_id,l.id)=(m.business_id,m.location_id) WHERE l.id IS NULL) THEN RAISE EXCEPTION 'Existen movimientos con ubicación de otro negocio.'; END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON public.business_locations, public.inventory_balances FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON public.business_locations, public.inventory_balances FROM authenticated; END IF;
END $$;
COMMIT;

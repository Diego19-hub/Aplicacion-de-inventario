BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s'; SET LOCAL search_path=pg_catalog,public,pg_temp;
DO $$ BEGIN IF to_regclass('public.inventory_transfers') IS NOT NULL THEN RAISE EXCEPTION 'inventory_transfers ya existe.'; END IF; IF to_regclass('public.inventory_movements') IS NULL OR to_regclass('public.inventory_balances') IS NULL THEN RAISE EXCEPTION 'Se requieren movimientos y balances.'; END IF; END $$;
CREATE TABLE public.inventory_transfers (
 id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 business_id INTEGER NOT NULL,
 item_id INTEGER NOT NULL,
 from_location_id INTEGER NOT NULL,
 to_location_id INTEGER NOT NULL,
 quantity INTEGER NOT NULL,
 reason VARCHAR(500) NOT NULL,
 reference VARCHAR(120),
 created_by INTEGER NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT inventory_transfers_business_item_id_key UNIQUE (id,business_id,item_id),
 CONSTRAINT inventory_transfers_item_business_fkey FOREIGN KEY(business_id,item_id) REFERENCES public.items(business_id,id) ON DELETE RESTRICT,
 CONSTRAINT inventory_transfers_from_business_fkey FOREIGN KEY(business_id,from_location_id) REFERENCES public.business_locations(business_id,id) ON DELETE RESTRICT,
 CONSTRAINT inventory_transfers_to_business_fkey FOREIGN KEY(business_id,to_location_id) REFERENCES public.business_locations(business_id,id) ON DELETE RESTRICT,
 CONSTRAINT inventory_transfers_member_fkey FOREIGN KEY(business_id,created_by) REFERENCES public.business_members(business_id,user_id) ON DELETE RESTRICT,
 CONSTRAINT inventory_transfers_quantity_check CHECK(quantity>0),
 CONSTRAINT inventory_transfers_locations_check CHECK(from_location_id<>to_location_id),
 CONSTRAINT inventory_transfers_reason_check CHECK(reason=btrim(reason) AND char_length(reason) BETWEEN 5 AND 500),
 CONSTRAINT inventory_transfers_reference_check CHECK(reference IS NULL OR(reference=btrim(reference) AND char_length(reference) BETWEEN 1 AND 120))
);
CREATE INDEX inventory_transfers_business_history_index ON public.inventory_transfers(business_id,created_at DESC,id DESC);
CREATE INDEX inventory_transfers_business_item_index ON public.inventory_transfers(business_id,item_id,created_at DESC,id DESC);
CREATE INDEX inventory_transfers_business_locations_index ON public.inventory_transfers(business_id,from_location_id,to_location_id,created_at DESC,id DESC);
ALTER TABLE public.inventory_transfers ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.inventory_transfers_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Las transferencias de inventario son inmutables.'; END; $$;
CREATE TRIGGER inventory_transfers_immutable_trigger BEFORE UPDATE OR DELETE ON public.inventory_transfers FOR EACH ROW EXECUTE FUNCTION public.inventory_transfers_immutable();
ALTER TABLE public.inventory_movements ADD COLUMN transfer_id INTEGER;
ALTER TABLE public.inventory_movements DROP CONSTRAINT inventory_movements_type_check;
ALTER TABLE public.inventory_movements DROP CONSTRAINT inventory_movements_type_delta_check;
ALTER TABLE public.inventory_movements ADD CONSTRAINT inventory_movements_type_check CHECK(movement_type IN ('opening_balance','entry','exit','adjustment','transfer_out','transfer_in'));
ALTER TABLE public.inventory_movements ADD CONSTRAINT inventory_movements_type_delta_check CHECK((movement_type IN('opening_balance','entry','transfer_in') AND quantity_delta>0) OR (movement_type IN('exit','transfer_out') AND quantity_delta<0) OR movement_type='adjustment');
ALTER TABLE public.inventory_movements ADD CONSTRAINT inventory_movements_transfer_state_check CHECK((movement_type IN('transfer_out','transfer_in') AND transfer_id IS NOT NULL) OR (movement_type NOT IN('transfer_out','transfer_in') AND transfer_id IS NULL));
ALTER TABLE public.inventory_movements ADD CONSTRAINT inventory_movements_transfer_match_fkey FOREIGN KEY(transfer_id,business_id,item_id) REFERENCES public.inventory_transfers(id,business_id,item_id) ON DELETE RESTRICT;
CREATE INDEX inventory_movements_transfer_id_index ON public.inventory_movements(transfer_id);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON public.inventory_transfers FROM anon; END IF; IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON public.inventory_transfers FROM authenticated; END IF; END $$;
COMMIT;

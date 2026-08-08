BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public, pg_temp;

DO $$
BEGIN
  IF to_regclass('public.items') IS NULL OR to_regclass('public.business_members') IS NULL THEN
    RAISE EXCEPTION 'Se requieren items y business_members para crear movimientos.';
  END IF;
  IF to_regclass('public.inventory_movements') IS NOT NULL THEN
    RAISE EXCEPTION 'inventory_movements ya existe.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.items i WHERE NOT EXISTS (
    SELECT 1 FROM public.business_members bm WHERE bm.business_id = i.business_id AND bm.role = 'owner' AND bm.status = 'active'
  )) THEN
    RAISE EXCEPTION 'Cada negocio con productos requiere un owner activo para el saldo inicial.';
  END IF;
END $$;

ALTER TABLE public.items ADD CONSTRAINT items_business_id_id_key UNIQUE (business_id, id);

CREATE TABLE public.inventory_movements (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  item_id INTEGER NOT NULL,
  movement_type VARCHAR(20) NOT NULL,
  quantity_delta INTEGER NOT NULL,
  previous_stock INTEGER NOT NULL,
  resulting_stock INTEGER NOT NULL,
  reason VARCHAR(500) NOT NULL,
  reference VARCHAR(120),
  created_by INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT inventory_movements_item_business_fkey FOREIGN KEY (business_id, item_id)
    REFERENCES public.items (business_id, id) ON DELETE RESTRICT,
  CONSTRAINT inventory_movements_member_fkey FOREIGN KEY (business_id, created_by)
    REFERENCES public.business_members (business_id, user_id) ON DELETE RESTRICT,
  CONSTRAINT inventory_movements_type_check CHECK (movement_type IN ('opening_balance', 'entry', 'exit', 'adjustment')),
  CONSTRAINT inventory_movements_quantity_check CHECK (quantity_delta <> 0 AND previous_stock >= 0 AND resulting_stock >= 0 AND resulting_stock = previous_stock + quantity_delta),
  CONSTRAINT inventory_movements_type_delta_check CHECK ((movement_type IN ('opening_balance', 'entry') AND quantity_delta > 0) OR (movement_type = 'exit' AND quantity_delta < 0) OR movement_type = 'adjustment'),
  CONSTRAINT inventory_movements_reason_check CHECK (reason = btrim(reason) AND char_length(reason) BETWEEN 5 AND 500),
  CONSTRAINT inventory_movements_reference_check CHECK (reference IS NULL OR (reference = btrim(reference) AND char_length(reference) BETWEEN 1 AND 120))
);

ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
CREATE INDEX inventory_movements_item_history_index ON public.inventory_movements (business_id, item_id, created_at DESC, id DESC);
CREATE INDEX inventory_movements_business_index ON public.inventory_movements (business_id, created_at DESC, id DESC);

CREATE FUNCTION public.inventory_movements_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Los movimientos de inventario son inmutables.'; END; $$;
CREATE TRIGGER inventory_movements_immutable_trigger BEFORE UPDATE OR DELETE ON public.inventory_movements FOR EACH ROW EXECUTE FUNCTION public.inventory_movements_immutable();

INSERT INTO public.inventory_movements (business_id, item_id, movement_type, quantity_delta, previous_stock, resulting_stock, reason, created_by)
SELECT i.business_id, i.id, 'opening_balance', i.stock, 0, i.stock, 'Saldo inicial migrado desde existencias actuales', bm.user_id
FROM public.items i
JOIN LATERAL (SELECT user_id FROM public.business_members WHERE business_id = i.business_id AND role = 'owner' AND status = 'active' ORDER BY id LIMIT 1) bm ON true
WHERE i.stock > 0;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.items i WHERE i.stock <> COALESCE((SELECT SUM(quantity_delta) FROM public.inventory_movements m WHERE m.business_id = i.business_id AND m.item_id = i.id), 0)) THEN
    RAISE EXCEPTION 'El saldo inicial no coincide con items.stock.';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON public.inventory_movements FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON public.inventory_movements FROM authenticated; END IF;
END $$;
COMMIT;

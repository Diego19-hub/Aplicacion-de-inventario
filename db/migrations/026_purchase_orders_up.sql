BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public, pg_temp;

CREATE TABLE public.purchase_orders (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  supplier_id INTEGER NOT NULL,
  location_id INTEGER NOT NULL,
  issued_at DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_at DATE,
  notes VARCHAR(1000),
  status VARCHAR(24) NOT NULL DEFAULT 'draft',
  created_by INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT purchase_orders_business_id_id_key UNIQUE (business_id, id),
  CONSTRAINT purchase_orders_supplier_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id),
  CONSTRAINT purchase_orders_location_business_fkey FOREIGN KEY (business_id, location_id) REFERENCES public.business_locations(business_id, id),
  CONSTRAINT purchase_orders_creator_business_fkey FOREIGN KEY (business_id, created_by) REFERENCES public.business_members(business_id, user_id),
  CONSTRAINT purchase_orders_status_check CHECK (status IN ('draft','pending','partially_received','received','cancelled')),
  CONSTRAINT purchase_orders_dates_check CHECK (expected_at IS NULL OR expected_at >= issued_at),
  CONSTRAINT purchase_orders_notes_check CHECK (notes IS NULL OR btrim(notes) = notes)
);

CREATE TABLE public.purchase_order_items (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_id INTEGER NOT NULL,
  purchase_order_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  quantity_ordered INTEGER NOT NULL,
  quantity_received INTEGER NOT NULL DEFAULT 0,
  unit_cost NUMERIC(14,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT purchase_order_items_business_id_id_key UNIQUE (business_id, id),
  CONSTRAINT purchase_order_items_order_business_fkey FOREIGN KEY (business_id, purchase_order_id) REFERENCES public.purchase_orders(business_id, id) ON DELETE CASCADE,
  CONSTRAINT purchase_order_items_item_business_fkey FOREIGN KEY (business_id, item_id) REFERENCES public.items(business_id, id),
  CONSTRAINT purchase_order_items_quantity_check CHECK (quantity_ordered > 0 AND quantity_received >= 0 AND quantity_received <= quantity_ordered),
  CONSTRAINT purchase_order_items_cost_check CHECK (unit_cost >= 0),
  CONSTRAINT purchase_order_items_unique_item UNIQUE (business_id, purchase_order_id, item_id)
);

CREATE TABLE public.purchase_receipts (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_id INTEGER NOT NULL,
  purchase_order_id INTEGER NOT NULL,
  purchase_order_item_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  reference VARCHAR(120) NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER NOT NULL,
  CONSTRAINT purchase_receipts_business_id_id_key UNIQUE (business_id, id),
  CONSTRAINT purchase_receipts_order_business_fkey FOREIGN KEY (business_id, purchase_order_id) REFERENCES public.purchase_orders(business_id, id),
  CONSTRAINT purchase_receipts_item_business_fkey FOREIGN KEY (business_id, purchase_order_item_id) REFERENCES public.purchase_order_items(business_id, id),
  CONSTRAINT purchase_receipts_creator_business_fkey FOREIGN KEY (business_id, created_by) REFERENCES public.business_members(business_id, user_id),
  CONSTRAINT purchase_receipts_quantity_check CHECK (quantity > 0)
);

CREATE INDEX purchase_orders_business_status_index ON public.purchase_orders (business_id, status, issued_at DESC);
CREATE INDEX purchase_orders_business_supplier_index ON public.purchase_orders (business_id, supplier_id);
CREATE INDEX purchase_orders_business_location_index ON public.purchase_orders (business_id, location_id);
CREATE INDEX purchase_order_items_business_order_index ON public.purchase_order_items (business_id, purchase_order_id);
CREATE INDEX purchase_order_items_business_item_index ON public.purchase_order_items (business_id, item_id);
CREATE INDEX purchase_receipts_business_order_index ON public.purchase_receipts (business_id, purchase_order_id, received_at DESC);

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_receipts ENABLE ROW LEVEL SECURITY;
COMMIT;

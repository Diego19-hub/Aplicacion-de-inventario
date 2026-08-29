BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s'; SET LOCAL search_path=pg_catalog,public,pg_temp;
ALTER TABLE public.purchase_order_items ADD COLUMN quantity_returned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.purchase_order_items ADD CONSTRAINT purchase_order_items_returned_check CHECK (quantity_returned >= 0 AND quantity_returned <= quantity_received);
CREATE TABLE public.inventory_returns (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  return_type VARCHAR(20) NOT NULL,
  purchase_order_id INTEGER,
  supplier_id INTEGER,
  location_id INTEGER NOT NULL,
  reference VARCHAR(120) NOT NULL,
  reason VARCHAR(500) NOT NULL,
  notes VARCHAR(1000),
  status VARCHAR(12) NOT NULL DEFAULT 'draft',
  created_by INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  registered_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancelled_by INTEGER,
  CONSTRAINT inventory_returns_business_id_id_key UNIQUE (business_id,id),
  CONSTRAINT inventory_returns_reference_key UNIQUE (business_id,reference),
  CONSTRAINT inventory_returns_type_check CHECK (return_type IN ('supplier_return','damage','loss','destroyed','expired')),
  CONSTRAINT inventory_returns_status_check CHECK (status IN ('draft','registered','cancelled')),
  CONSTRAINT inventory_returns_reason_check CHECK (btrim(reason)=reason AND char_length(reason) BETWEEN 2 AND 500),
  CONSTRAINT inventory_returns_location_fkey FOREIGN KEY (business_id,location_id) REFERENCES public.business_locations(business_id,id),
  CONSTRAINT inventory_returns_supplier_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id),
  CONSTRAINT inventory_returns_order_fkey FOREIGN KEY (business_id,purchase_order_id) REFERENCES public.purchase_orders(business_id,id),
  CONSTRAINT inventory_returns_creator_fkey FOREIGN KEY (business_id,created_by) REFERENCES public.business_members(business_id,user_id),
  CONSTRAINT inventory_returns_canceller_fkey FOREIGN KEY (business_id,cancelled_by) REFERENCES public.business_members(business_id,user_id)
);
CREATE TABLE public.inventory_return_items (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_id INTEGER NOT NULL,
  return_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  purchase_order_item_id INTEGER,
  quantity INTEGER NOT NULL,
  unit_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  CONSTRAINT inventory_return_items_business_id_id_key UNIQUE (business_id,id),
  CONSTRAINT inventory_return_items_return_fkey FOREIGN KEY (business_id,return_id) REFERENCES public.inventory_returns(business_id,id) ON DELETE CASCADE,
  CONSTRAINT inventory_return_items_item_fkey FOREIGN KEY (business_id,item_id) REFERENCES public.items(business_id,id),
  CONSTRAINT inventory_return_items_order_item_fkey FOREIGN KEY (business_id,purchase_order_item_id) REFERENCES public.purchase_order_items(business_id,id),
  CONSTRAINT inventory_return_items_quantity_check CHECK (quantity > 0),
  CONSTRAINT inventory_return_items_cost_check CHECK (unit_cost >= 0)
);
CREATE INDEX inventory_returns_business_status_index ON public.inventory_returns(business_id,status,created_at DESC);
CREATE INDEX inventory_returns_business_type_index ON public.inventory_returns(business_id,return_type);
CREATE INDEX inventory_return_items_business_return_index ON public.inventory_return_items(business_id,return_id);
CREATE INDEX inventory_return_items_business_item_index ON public.inventory_return_items(business_id,item_id);
ALTER TABLE public.inventory_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_return_items ENABLE ROW LEVEL SECURITY;
COMMIT;

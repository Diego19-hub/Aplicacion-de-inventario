BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s'; SET LOCAL search_path=pg_catalog,public,pg_temp;
ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_business_id_id_key UNIQUE (business_id,id);
ALTER TABLE public.inventory_stock_thresholds
  ADD COLUMN maximum_stock INTEGER,
  ADD COLUMN suggested_replenishment INTEGER,
    ADD COLUMN preferred_supplier_id INTEGER,
    ADD COLUMN alert_enabled BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN reviewed_at TIMESTAMPTZ,
    ADD COLUMN reviewed_by INTEGER,
  ADD CONSTRAINT inventory_stock_thresholds_maximum_stock_check CHECK (maximum_stock IS NULL OR maximum_stock >= minimum_stock),
  ADD CONSTRAINT inventory_stock_thresholds_suggested_check CHECK (suggested_replenishment IS NULL OR suggested_replenishment >= 0),
    ADD CONSTRAINT inventory_stock_thresholds_supplier_business_fkey FOREIGN KEY (business_id,preferred_supplier_id) REFERENCES public.suppliers(business_id,id) ON DELETE RESTRICT;
ALTER TABLE public.inventory_stock_thresholds ADD CONSTRAINT inventory_stock_thresholds_reviewed_by_business_fkey FOREIGN KEY (business_id,reviewed_by) REFERENCES public.business_members(business_id,user_id) ON DELETE SET NULL;
CREATE INDEX inventory_stock_thresholds_supplier_index ON public.inventory_stock_thresholds (business_id, preferred_supplier_id);
COMMIT;

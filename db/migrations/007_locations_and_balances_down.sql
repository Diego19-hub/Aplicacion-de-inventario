-- Este rollback elimina permanentemente los datos de stock por ubicación.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public, pg_temp;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.business_locations l WHERE l.name <> 'Sucursal principal' OR l.code <> 'MAIN' OR l.location_type <> 'branch' OR NOT l.is_default) THEN RAISE EXCEPTION 'No se puede revertir: existen ubicaciones distintas de MAIN generada.'; END IF;
  IF EXISTS (SELECT 1 FROM public.items i WHERE i.stock <> COALESCE((SELECT sum(b.stock) FROM public.inventory_balances b WHERE b.business_id=i.business_id AND b.item_id=i.id),0)) THEN RAISE EXCEPTION 'No se puede revertir: balances no conciliados.'; END IF;
  IF EXISTS (SELECT 1 FROM public.inventory_balances b WHERE b.stock <> COALESCE((SELECT sum(m.quantity_delta) FROM public.inventory_movements m WHERE m.business_id=b.business_id AND m.item_id=b.item_id AND m.location_id=b.location_id),0)) THEN RAISE EXCEPTION 'No se puede revertir: ledger por ubicación no conciliado.'; END IF;
END $$;
DROP TRIGGER inventory_movements_immutable_trigger ON public.inventory_movements;
ALTER TABLE public.inventory_movements DROP CONSTRAINT inventory_movements_location_business_fkey;
DROP INDEX public.inventory_movements_business_location_history_index;
ALTER TABLE public.inventory_movements DROP COLUMN location_id;
CREATE TRIGGER inventory_movements_immutable_trigger BEFORE UPDATE OR DELETE ON public.inventory_movements FOR EACH ROW EXECUTE FUNCTION public.inventory_movements_immutable();
DROP TRIGGER inventory_balances_updated_at_trigger ON public.inventory_balances;
DROP FUNCTION public.inventory_balances_set_updated_at();
DROP TABLE public.inventory_balances;
DROP TRIGGER business_locations_updated_at_trigger ON public.business_locations;
DROP FUNCTION public.business_locations_set_updated_at();
DROP TABLE public.business_locations;
COMMIT;

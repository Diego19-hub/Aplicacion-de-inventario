BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public, pg_temp;

DO $$
DECLARE
  required_table TEXT;
  required_function TEXT;
BEGIN
  FOREACH required_table IN ARRAY ARRAY[
    'businesses',
    'business_members',
    'business_invitations',
    'categories',
    'items',
    'inventory_movements',
    'suppliers',
    'business_locations',
    'inventory_balances',
    'inventory_transfers',
    'inventory_stock_thresholds'
  ]
  LOOP
    IF to_regclass('public.' || required_table) IS NULL THEN
      RAISE EXCEPTION 'No se puede endurecer el acceso: falta la tabla public.%.', required_table;
    END IF;
  END LOOP;

  FOREACH required_function IN ARRAY ARRAY[
    'public.inventory_saas_set_businesses_updated_at()',
    'public.inventory_movements_immutable()',
    'public.suppliers_set_updated_at()',
    'public.business_locations_set_updated_at()',
    'public.inventory_balances_set_updated_at()',
    'public.inventory_transfers_immutable()',
    'public.inventory_stock_thresholds_set_updated_at()'
  ]
  LOOP
    IF to_regprocedure(required_function) IS NULL THEN
      RAISE EXCEPTION 'No se puede endurecer el acceso: falta la función de trigger %.', required_function;
    END IF;
  END LOOP;
END
$$;

ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_stock_thresholds ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE
  public.businesses,
  public.business_members,
  public.business_invitations,
  public.categories,
  public.items,
  public.inventory_movements,
  public.suppliers,
  public.business_locations,
  public.inventory_balances,
  public.inventory_transfers,
  public.inventory_stock_thresholds
FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.inventory_saas_set_businesses_updated_at() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.inventory_movements_immutable() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.suppliers_set_updated_at() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.business_locations_set_updated_at() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.inventory_balances_set_updated_at() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.inventory_transfers_immutable() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.inventory_stock_thresholds_set_updated_at() FROM PUBLIC;

DO $$
DECLARE
  application_role TEXT;
BEGIN
  FOREACH application_role IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = application_role) THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TABLE public.businesses, public.business_members, public.business_invitations, public.categories, public.items, public.inventory_movements, public.suppliers, public.business_locations, public.inventory_balances, public.inventory_transfers, public.inventory_stock_thresholds FROM %I',
        application_role
      );
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.inventory_saas_set_businesses_updated_at() FROM %I', application_role);
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.inventory_movements_immutable() FROM %I', application_role);
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.suppliers_set_updated_at() FROM %I', application_role);
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.business_locations_set_updated_at() FROM %I', application_role);
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.inventory_balances_set_updated_at() FROM %I', application_role);
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.inventory_transfers_immutable() FROM %I', application_role);
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.inventory_stock_thresholds_set_updated_at() FROM %I', application_role);
    END IF;
  END LOOP;
END
$$;

COMMIT;

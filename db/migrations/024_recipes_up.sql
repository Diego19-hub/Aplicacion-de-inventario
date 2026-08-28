BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public, pg_temp;

CREATE TABLE public.recipes (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  name VARCHAR(150) NOT NULL,
  product_id INTEGER NOT NULL,
  yield_quantity NUMERIC(12,3) NOT NULL,
  yield_unit VARCHAR(12) NOT NULL,
  instructions VARCHAR(3000),
  waste_percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
  manual_cost NUMERIC(12,2),
  manual_cost_notes VARCHAR(1000),
  is_estimated BOOLEAN NOT NULL DEFAULT false,
  labor_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  logistics_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  status VARCHAR(10) NOT NULL DEFAULT 'active',
  created_by INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT recipes_business_id_id_key UNIQUE (business_id, id),
  CONSTRAINT recipes_product_business_fkey FOREIGN KEY (business_id, product_id) REFERENCES public.items (business_id, id) ON DELETE RESTRICT,
  CONSTRAINT recipes_created_by_business_fkey FOREIGN KEY (business_id, created_by) REFERENCES public.business_members (business_id, user_id) ON DELETE RESTRICT,
  CONSTRAINT recipes_name_check CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 150),
  CONSTRAINT recipes_yield_check CHECK (yield_quantity > 0 AND yield_unit IN ('piece', 'kilogram', 'gram', 'liter', 'milliliter', 'package', 'box')),
  CONSTRAINT recipes_waste_check CHECK (waste_percentage BETWEEN 0 AND 100),
  CONSTRAINT recipes_costs_check CHECK (manual_cost IS NULL OR manual_cost > 0),
  CONSTRAINT recipes_labor_cost_check CHECK (labor_cost >= 0),
  CONSTRAINT recipes_logistics_cost_check CHECK (logistics_cost >= 0),
  CONSTRAINT recipes_status_check CHECK (status IN ('active', 'inactive'))
);

CREATE TABLE public.recipe_ingredients (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_id INTEGER NOT NULL,
  recipe_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  quantity NUMERIC(12,3) NOT NULL,
  unit VARCHAR(12) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT recipe_ingredients_business_id_id_key UNIQUE (business_id, id),
  CONSTRAINT recipe_ingredients_recipe_business_fkey FOREIGN KEY (business_id, recipe_id) REFERENCES public.recipes (business_id, id) ON DELETE CASCADE,
  CONSTRAINT recipe_ingredients_item_business_fkey FOREIGN KEY (business_id, item_id) REFERENCES public.items (business_id, id) ON DELETE RESTRICT,
  CONSTRAINT recipe_ingredients_quantity_check CHECK (quantity > 0),
  CONSTRAINT recipe_ingredients_unit_check CHECK (unit IN ('piece', 'kilogram', 'gram', 'liter', 'milliliter', 'package', 'box')),
  CONSTRAINT recipe_ingredients_unique_item UNIQUE (business_id, recipe_id, item_id)
);

CREATE INDEX recipes_business_status_index ON public.recipes (business_id, status);
CREATE INDEX recipes_business_product_index ON public.recipes (business_id, product_id);
CREATE INDEX recipe_ingredients_business_recipe_index ON public.recipe_ingredients (business_id, recipe_id);
CREATE INDEX recipe_ingredients_business_item_index ON public.recipe_ingredients (business_id, item_id);

CREATE FUNCTION public.recipes_set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = clock_timestamp(); RETURN NEW; END; $$;
CREATE TRIGGER recipes_updated_at_trigger BEFORE UPDATE ON public.recipes FOR EACH ROW EXECUTE FUNCTION public.recipes_set_updated_at();
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_ingredients ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON public.recipes, public.recipe_ingredients FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON public.recipes, public.recipe_ingredients FROM authenticated; END IF;
END $$;

COMMIT;

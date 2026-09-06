BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public, pg_temp;

-- connect-pg-simple puede haber creado esta tabla antes de que la migración
-- se registre. Nunca se reemplaza ni se borran sus sesiones.
CREATE TABLE IF NOT EXISTS public.user_sessions (
  sid VARCHAR NOT NULL COLLATE "default",
  sess JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL,
  CONSTRAINT user_sessions_pkey PRIMARY KEY (sid)
);

ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS sid VARCHAR;
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS sess JSON;
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS expire TIMESTAMP(6);

DO $$
DECLARE
  primary_key_columns TEXT[];
  expire_attribute SMALLINT;
  has_expire_index BOOLEAN;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_sessions'
      AND column_name = 'sid' AND data_type <> 'character varying'
  ) THEN
    RAISE EXCEPTION 'user_sessions.sid tiene un tipo incompatible; se esperaba VARCHAR.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_sessions'
      AND column_name = 'sess' AND data_type <> 'json'
  ) THEN
    RAISE EXCEPTION 'user_sessions.sess tiene un tipo incompatible; se esperaba JSON.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_sessions'
      AND column_name = 'expire'
      AND (data_type <> 'timestamp without time zone' OR datetime_precision <> 6)
  ) THEN
    RAISE EXCEPTION 'user_sessions.expire tiene un tipo incompatible; se esperaba TIMESTAMP(6).'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (SELECT 1 FROM public.user_sessions WHERE sid IS NULL)
    OR EXISTS (SELECT 1 FROM public.user_sessions WHERE sess IS NULL)
    OR EXISTS (SELECT 1 FROM public.user_sessions WHERE expire IS NULL) THEN
    RAISE EXCEPTION 'user_sessions contiene filas incompatibles con columnas obligatorias no nulas.'
      USING ERRCODE = 'check_violation';
  END IF;

  ALTER TABLE public.user_sessions
    ALTER COLUMN sid SET NOT NULL,
    ALTER COLUMN sess SET NOT NULL,
    ALTER COLUMN expire SET NOT NULL;

  SELECT array_agg(columns.attname ORDER BY key_columns.ordinality)
  INTO primary_key_columns
  FROM pg_catalog.pg_constraint AS constraints
  JOIN pg_catalog.pg_class AS relations ON relations.oid = constraints.conrelid
  JOIN pg_catalog.pg_namespace AS namespaces ON namespaces.oid = relations.relnamespace
  JOIN LATERAL unnest(constraints.conkey) WITH ORDINALITY AS key_columns(attnum, ordinality) ON TRUE
  JOIN pg_catalog.pg_attribute AS columns
    ON columns.attrelid = relations.oid AND columns.attnum = key_columns.attnum
  WHERE namespaces.nspname = 'public'
    AND relations.relname = 'user_sessions'
    AND constraints.contype = 'p';

  IF primary_key_columns IS NULL THEN
    ALTER TABLE public.user_sessions
      ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (sid);
  ELSIF primary_key_columns <> ARRAY['sid']::TEXT[] THEN
    RAISE EXCEPTION 'user_sessions tiene una clave primaria incompatible; se esperaba (sid).'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT attributes.attnum INTO expire_attribute
  FROM pg_catalog.pg_attribute AS attributes
  WHERE attributes.attrelid = 'public.user_sessions'::regclass
    AND attributes.attname = 'expire';

  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_index AS indexes
    WHERE indexes.indrelid = 'public.user_sessions'::regclass
      AND indexes.indisvalid AND indexes.indpred IS NULL
      AND indexes.indnatts = 1 AND indexes.indkey[0] = expire_attribute
  ) INTO has_expire_index;

  IF NOT has_expire_index THEN
    CREATE INDEX IF NOT EXISTS user_sessions_expire_index
      ON public.user_sessions (expire);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_index AS indexes
    WHERE indexes.indrelid = 'public.user_sessions'::regclass
      AND indexes.indisvalid AND indexes.indpred IS NULL
      AND indexes.indnatts = 1 AND indexes.indkey[0] = expire_attribute
  ) THEN
    RAISE EXCEPTION 'user_sessions no tiene un índice válido sobre expire.'
      USING ERRCODE = 'check_violation';
  END IF;
END
$$;

COMMIT;

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = public, pg_temp;

ALTER TABLE public.users
  ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'local',
  ADD COLUMN provider_subject TEXT,
  ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.users
  ALTER COLUMN password_hash DROP NOT NULL;

ALTER TABLE public.users
  ADD CONSTRAINT users_auth_provider_check
    CHECK (auth_provider IN ('local', 'google')),
  ADD CONSTRAINT users_google_subject_check
    CHECK (auth_provider = 'local' OR provider_subject IS NOT NULL);

CREATE UNIQUE INDEX users_email_normalized_unique
  ON public.users (LOWER(BTRIM(email)));

CREATE UNIQUE INDEX users_provider_subject_unique
  ON public.users (auth_provider, provider_subject)
  WHERE provider_subject IS NOT NULL;

COMMIT;

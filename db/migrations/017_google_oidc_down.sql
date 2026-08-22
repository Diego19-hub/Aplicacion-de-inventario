BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = public, pg_temp;

DROP INDEX IF EXISTS public.users_provider_subject_unique;
DROP INDEX IF EXISTS public.users_email_normalized_unique;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_google_subject_check;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_auth_provider_check;
ALTER TABLE public.users ALTER COLUMN password_hash SET NOT NULL;
ALTER TABLE public.users DROP COLUMN IF EXISTS email_verified;
ALTER TABLE public.users DROP COLUMN IF EXISTS provider_subject;
ALTER TABLE public.users DROP COLUMN IF EXISTS auth_provider;

COMMIT;

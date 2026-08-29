BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public, pg_temp;

CREATE TABLE public.notifications (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type VARCHAR(40) NOT NULL,
  title VARCHAR(160) NOT NULL,
  message VARCHAR(1000) NOT NULL,
  priority VARCHAR(16) NOT NULL DEFAULT 'normal' CHECK (priority IN ('urgent','high','medium','normal')),
  link VARCHAR(255),
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at TIMESTAMPTZ,
  event_key VARCHAR(180),
  CONSTRAINT notifications_user_business_fkey FOREIGN KEY (business_id, user_id)
    REFERENCES public.business_members(business_id, user_id),
  CONSTRAINT notifications_type_check CHECK (btrim(type) <> ''),
  CONSTRAINT notifications_title_check CHECK (btrim(title) <> ''),
  CONSTRAINT notifications_message_check CHECK (btrim(message) <> '')
);

CREATE INDEX notifications_user_unread_index ON public.notifications (business_id, user_id, is_read, created_at DESC);
CREATE INDEX notifications_business_created_index ON public.notifications (business_id, created_at DESC);
CREATE INDEX notifications_business_type_index ON public.notifications (business_id, type, created_at DESC);
CREATE UNIQUE INDEX notifications_event_key_unique
  ON public.notifications (business_id, user_id, event_key)
  WHERE event_key IS NOT NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
COMMIT;

-- The devotional cache writes were silently failing because the call_type
-- CHECK constraint never included 'devotional'. Add it so the daily
-- devotional caches once per day like scripture/qotw/outreach.
ALTER TABLE ht_ai_cache DROP CONSTRAINT IF EXISTS ht_ai_cache_call_type_check;
ALTER TABLE ht_ai_cache ADD CONSTRAINT ht_ai_cache_call_type_check
  CHECK (call_type = ANY (ARRAY['scripture'::text, 'devotional'::text, 'qotw'::text, 'outreach'::text]));

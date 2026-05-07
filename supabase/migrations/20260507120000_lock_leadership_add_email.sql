-- HTCB — lock down ht_leadership and add email column for magic-link auth.
-- Paste into Supabase SQL Editor (Dashboard → SQL → New query) and run once.
--
-- Why this matters: until this runs, anon REST callers can read every leader's
-- PIN from /rest/v1/ht_leadership. After this runs, only the service role
-- (used by edge functions like htcb-pin-verify and htcb-magic-verify) can
-- read the table.

-- 1. Add email column for magic-link lookup (nullable, case-insensitive unique).
ALTER TABLE public.ht_leadership ADD COLUMN IF NOT EXISTS email text;

CREATE UNIQUE INDEX IF NOT EXISTS ht_leadership_email_lower_uk
  ON public.ht_leadership (lower(email))
  WHERE email IS NOT NULL;

-- 2. Populate leadership emails (idempotent).
UPDATE public.ht_leadership SET email = 'Qtkearney@gmail.com'
 WHERE access_level = 'bishop' AND name = 'Bishop Tonya L. Kearney';

UPDATE public.ht_leadership SET email = 'mdleblanc4@gmail.com'
 WHERE name = 'Asst. Pastor Maria LeBlanc';

UPDATE public.ht_leadership SET email = 'ebonilove33@gmail.com'
 WHERE name = 'Elder Eboni Washington';

UPDATE public.ht_leadership SET email = 'toreykees2399@gmail.com'
 WHERE name = 'Minister Torey Kees';

-- 3. Drop every existing policy on ht_leadership and lock RLS.
ALTER TABLE public.ht_leadership ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'ht_leadership'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.ht_leadership', pol.policyname);
  END LOOP;
END $$;

-- 4. Revoke all table-level grants from anon and authenticated roles.
REVOKE ALL ON public.ht_leadership FROM anon;
REVOKE ALL ON public.ht_leadership FROM authenticated;

-- 5. Service role retains full access (edge functions use it).
GRANT ALL ON public.ht_leadership TO service_role;

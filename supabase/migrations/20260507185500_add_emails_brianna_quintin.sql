-- HTCB — populate magic-link emails for Brianna and Quintin.
-- Idempotent so re-running is safe.

UPDATE public.ht_leadership SET email = 'Bosborne44@gmail.com'
 WHERE name = 'Elder Brianna Osborne';

UPDATE public.ht_leadership SET email = 'ledman65@gmail.com'
 WHERE name = 'Deacon Quintin Kearney';

-- Raise community-media object size limit so iPhone-quality video clips don't
-- silently fail at the bucket boundary. Match the voice-messages bucket (500 MB).
update storage.buckets
set file_size_limit = 524288000
where id = 'community-media';

-- Carousel support: store an ordered array of {url, type} entries when a
-- post has more than one piece of media. The first item is mirrored into
-- the existing media_url / media_type columns for backward compatibility
-- with older readers.
alter table public.ht_community_posts
  add column if not exists media_items jsonb;

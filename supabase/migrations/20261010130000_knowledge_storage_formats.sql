-- Extend the existing private bucket for knowledge formats; preserve its RLS.
update storage.buckets
set allowed_mime_types = array(
  select distinct mime from unnest(
    coalesce(allowed_mime_types, array[]::text[]) || array[
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain', 'text/markdown', 'application/json', 'image/jpeg', 'image/png'
    ]::text[]
  ) mime
)
where id = 'ophanim-private' and allowed_mime_types is not null;
-- A null allow-list already permits these formats; do not restrict existing use.

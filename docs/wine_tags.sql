-- WINE TAGS: the owner's own labels on catalog wines (all versions of the app; owner, 2026-10-15). Run once in the Supabase SQL editor
-- (New query, paste all, Run). Safe to run twice.
-- Why: tags are meant to help recommendations later. FOR NOW THEY ARE LABELS ONLY: nothing in the deck, the games or the suggestions reads them.
-- They are not wine facts: a tag says what the owner wants to group, never what is in the bottle.
--   wine_tags       the tag names (the owner makes them; none to start)
--   wine_tag_links  which wines have which tag (on the wine, so every vintage of a wine carries it)
-- Everyone can read both (recommendations will need them). Only the owner (settings_edit) makes, renames or deletes tags; the owner and editors
-- (catalog_edit) put tags on wines and take them off.

create table if not exists public.wine_tags (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) between 1 and 40),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index if not exists wine_tags_name on public.wine_tags (lower(name));

create table if not exists public.wine_tag_links (
  wine_id    uuid not null references public.wines(id) on delete cascade,
  tag_id     uuid not null references public.wine_tags(id) on delete cascade,
  tagged_by  uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (wine_id, tag_id)
);
create index if not exists wine_tag_links_tag on public.wine_tag_links (tag_id);

alter table public.wine_tags enable row level security;
alter table public.wine_tag_links enable row level security;

drop policy if exists wine_tags_read on public.wine_tags;
drop policy if exists wine_tags_write on public.wine_tags;
drop policy if exists wine_tag_links_read on public.wine_tag_links;
drop policy if exists wine_tag_links_write on public.wine_tag_links;
create policy wine_tags_read on public.wine_tags for select using (true);
create policy wine_tags_write on public.wine_tags for all using (has_permission('settings_edit'::text)) with check (has_permission('settings_edit'::text));
create policy wine_tag_links_read on public.wine_tag_links for select using (true);
create policy wine_tag_links_write on public.wine_tag_links for all
  using (has_permission('catalog_edit'::text) or has_permission('settings_edit'::text))
  with check (has_permission('catalog_edit'::text) or has_permission('settings_edit'::text));

grant select on public.wine_tags, public.wine_tag_links to anon, authenticated;
grant insert, update, delete on public.wine_tags, public.wine_tag_links to authenticated;

-- Check: both tables are there (0 tags until the owner adds some).
select (select count(*) from public.wine_tags) as tags, (select count(*) from public.wine_tag_links) as tagged_wines;

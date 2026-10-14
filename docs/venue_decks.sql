-- Venue lists (the venue branch, first venue: Vintage Wine Merchants, venue_id 'vwm'). RUN THIS ONCE in the Supabase SQL editor; it is safe to repeat.
-- Until it is run, the venue app says its selection is being prepared and the Owner page's list tab says this update is needed.
--
-- One row per wine on a venue's list. A row from the venue's file that is not (yet) a catalog wine is kept with wine_vintage_id empty, holding the words
-- from the file, so an editor can add the wine through the usual Editor flow and "Re-check" links it. Nothing here creates or changes a catalog wine.
-- Same database as the main app: the list only says which catalog wines this venue shows. Players, journals and the catalog are shared.

create table if not exists public.venue_wines (
  id              uuid primary key default gen_random_uuid(),
  venue_id        text not null check (venue_id ~ '^[a-z0-9_]{2,30}$'),
  wine_vintage_id uuid references public.wine_vintages(id) on delete set null,
  producer        text not null default '',
  wine_name       text not null default '',
  vintage         text not null default '' check (vintage = '' or vintage = 'NV' or vintage ~ '^[0-9]{4}$'),
  source          text not null default 'file' check (source in ('file', 'hand')),
  added_by        uuid references auth.users(id) on delete set null default auth.uid(),
  added_at        timestamptz not null default now()
);
-- the shop's own category from its file (e.g. "Sparkling Wine"), only used to suggest a type when an editor reviews the wine
alter table public.venue_wines add column if not exists shop_type text not null default '';
-- a catalog wine is on a venue's list at most once
create unique index if not exists venue_wines_once on public.venue_wines (venue_id, wine_vintage_id) where wine_vintage_id is not null;
create index if not exists venue_wines_venue on public.venue_wines (venue_id);

alter table public.venue_wines enable row level security;
-- Everyone who opens the app (guests too) reads the list: their deck is built from it.
drop policy if exists venue_wines_read on public.venue_wines;
create policy venue_wines_read on public.venue_wines for select to anon, authenticated using (true);
-- Only the owner (settings_edit) changes it.
drop policy if exists venue_wines_add on public.venue_wines;
create policy venue_wines_add on public.venue_wines for insert to authenticated with check (has_permission('settings_edit'::text));
drop policy if exists venue_wines_change on public.venue_wines;
create policy venue_wines_change on public.venue_wines for update to authenticated using (has_permission('settings_edit'::text)) with check (has_permission('settings_edit'::text));
-- Editors (catalog_edit) link a row to the catalog wine they just added (Editor tab, the venue's list). They can change rows, not add or remove them.
drop policy if exists venue_wines_link on public.venue_wines;
create policy venue_wines_link on public.venue_wines for update to authenticated using (has_permission('catalog_edit'::text)) with check (has_permission('catalog_edit'::text));
drop policy if exists venue_wines_remove on public.venue_wines;
create policy venue_wines_remove on public.venue_wines for delete to authenticated using (has_permission('settings_edit'::text));
grant select on public.venue_wines to anon, authenticated;
grant insert, update, delete on public.venue_wines to authenticated;

-- Check (read only): how many wines each venue has, and how many are not in the catalog yet.
select venue_id, count(*) as rows, count(wine_vintage_id) as in_catalog, count(*) - count(wine_vintage_id) as not_in_catalog_yet
from public.venue_wines group by venue_id;

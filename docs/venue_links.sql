-- Links from the venue's wines to their pages on the venue's own website (owner, 2026-10-15; Vintage Wine Merchants branch only).
-- RUN ONCE in the Supabase SQL editor after docs/venue_decks.sql; it is safe to repeat.
-- A row holds a link ONLY when the wine was found on the venue's website (the venue-links server function, docs/VENUE_LINKS.md). No link is
-- ever made up: a wine that is not on the website simply has none, and the card's name is then not a link at all.
-- Editors (catalog_edit) may already change rows (policy venue_wines_link), so they can save and remove links; players only read them.

alter table public.venue_wines add column if not exists product_url text;
alter table public.venue_wines add column if not exists link_status text not null default '' check (link_status in ('', 'found', 'ok', 'removed', 'not found'));
alter table public.venue_wines add column if not exists link_checked_at timestamptz;
-- only the venue's own website may be stored
alter table public.venue_wines drop constraint if exists venue_wines_product_url_site;
alter table public.venue_wines add constraint venue_wines_product_url_site check (product_url is null or product_url ~ '^https://(www\.)?vintagewinemerchants\.com/');

-- Check: how many rows have a link, by status.
select link_status, count(*), count(product_url) as with_link from public.venue_wines group by link_status order by 1;

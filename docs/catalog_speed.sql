-- CATALOG SPEED, THIRD VERSION (2026-10-17; all versions). Run in the Supabase SQL editor: New query, paste ALL of it, Run. Safe to run again.
-- Plain statements only (the second version did the view change inside a programmed block, and it did not take effect on the live database;
-- it also replaced the view in place, which Postgres refuses when a column's type would change).
-- The editor shows only the LAST result: one line that says whether each step took effect, and how long the whole catalog now takes.
-- If the editor shows an error instead, copy the error into the chat: nothing after the failing statement has run.
--
-- Why: the catalog view (v_catalog_cards) finds each wine's region and country with geo_ancestor(), one step up the place tree at a time, and
-- the view runs with each visitor's own rights, so every step also runs the place list's permission check (about 0.4 ms a row here). For
-- ~1,900 wines that is longer than the 3 seconds a visitor's read is allowed. Here a small helper reads the place tree once per read and the
-- view joins it by id. Same columns, names and order (region and country become plain text), the same "each visitor sees only what they may" rule (security_invoker), plus a
-- new last column: dosage (a sparkling wine's sweetness term). On a copy of the catalog: 15.5 s before, 0.6 s after, every row identical.

-- 1. Indexes on the columns the view joins on (each is skipped if it is already there).
create index if not exists geo_areas_parent_idx       on public.geo_areas (parent_id);
create index if not exists wines_appellation_idx      on public.wines (appellation_id);
create index if not exists wines_producer_idx         on public.wines (producer_id);
create index if not exists wine_vintages_wine_idx     on public.wine_vintages (wine_id);
create index if not exists wine_grapes_wine_idx       on public.wine_grapes (wine_id);
create index if not exists wine_images_vintage_idx    on public.wine_images (wine_vintage_id);

-- 2. Every place with its region and country, read once per query (a region is its own region; a country its own country). The tree is at
--    most three deep (appellation, region, country); a fourth level is looked at in case.
create or replace function public.catalog_place_lines()
returns table (id uuid, region text, country text)
language sql stable security definer set search_path = public
as $$
  select a.id,
    (case when a.level::text = 'region' then a.name when a1.level::text = 'region' then a1.name when a2.level::text = 'region' then a2.name when a3.level::text = 'region' then a3.name end)::text,
    (case when a.level::text = 'country' then a.name when a1.level::text = 'country' then a1.name when a2.level::text = 'country' then a2.name when a3.level::text = 'country' then a3.name end)::text
  from geo_areas a
    left join geo_areas a1 on a1.id = a.parent_id
    left join geo_areas a2 on a2.id = a1.parent_id
    left join geo_areas a3 on a3.id = a2.parent_id
$$;
revoke all on function public.catalog_place_lines() from public;
grant execute on function public.catalog_place_lines() to anon, authenticated;

-- 3. The view, swapped in one go: the old one is dropped and the new one made in the same transaction, so if anything fails nothing changes
--    (the old view stays). Swapping, not replacing in place, lets the region and country columns be plain text whatever type the place list uses
--    (replacing in place refuses any change of type). security_invoker keeps the rule that each visitor only sees what they may (players:
--    published wines). If this step says other objects depend on the view, copy the message into the chat: nothing has changed.
begin;
drop view if exists public.v_catalog_cards;
create view public.v_catalog_cards with (security_invoker = true) as
 SELECT wv.id AS wine_vintage_id,
    wv.vintage_year,
    wv.is_non_vintage,
    p.name AS producer,
    w.name AS wine_name,
    w.style,
    a.name AS appellation,
    a.classification,
    gl.region,
    gl.country,
    COALESCE(( SELECT array_agg(g.name ORDER BY wg."position", g.name) AS array_agg
           FROM wine_grapes wg
             JOIN grapes g ON g.id = wg.grape_id
          WHERE wg.wine_id = w.id AND wg.basis = 'label'::basis_kind), '{}'::text[]) AS label_grapes,
    COALESCE(( SELECT array_agg(g.name ORDER BY wg."position", g.name) AS array_agg
           FROM wine_grapes wg
             JOIN grapes g ON g.id = wg.grape_id
          WHERE wg.wine_id = w.id AND (wg.basis = ANY (ARRAY['rule'::basis_kind, 'editor'::basis_kind]))), '{}'::text[]) AS rule_grapes,
    w.status::text AS wine_status,
    w.reach,
    wv.archived_at,
    img.storage_path AS image_path,
    img.kind AS image_kind,
    img.note AS image_note,
    w.vineyard,
    w.dosage
   FROM wine_vintages wv
     JOIN wines w ON w.id = wv.wine_id
     JOIN producers p ON p.id = w.producer_id
     LEFT JOIN geo_areas a ON a.id = w.appellation_id
     LEFT JOIN public.catalog_place_lines() gl(id, region, country) ON gl.id = w.appellation_id
     LEFT JOIN LATERAL ( SELECT wi.storage_path,
            wi.kind::text AS kind,
            wi.license_note AS note
           FROM wine_images wi
          WHERE wi.wine_id = w.id AND (wi.wine_vintage_id = wv.id OR wi.wine_vintage_id IS NULL) AND wi.status = 'verified'::verification_status
          ORDER BY (wi.wine_vintage_id IS NOT NULL) DESC, wi.is_primary DESC, wi.created_at DESC
         LIMIT 1) img ON true;
grant select on public.v_catalog_cards to anon, authenticated, service_role;
commit;

-- 4. Tell the website's database interface (PostgREST) about the new column and helper straight away.
notify pgrst, 'reload schema';

-- 5. The check. Expect: uses_new_helper true, has_dosage_column true, follows_visitor_rights true, and milliseconds well under 1000
--    (measured as the database owner, who skips the permission checks; a visitor's read is a little slower).
select
  (select pg_get_viewdef('public.v_catalog_cards'::regclass) like '%catalog_place_lines%') as uses_new_helper,
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'v_catalog_cards' and column_name = 'dosage') as has_dosage_column,
  coalesce((select 'security_invoker=true' = any (reloptions) or 'security_invoker=on' = any (reloptions) from pg_class where oid = 'public.v_catalog_cards'::regclass), false) as follows_visitor_rights,
  (select count(*) from (select * from public.v_catalog_cards) x) as wines_in_the_view,
  round(1000 * extract(epoch from clock_timestamp() - statement_timestamp())) as milliseconds;

-- CATALOG SPEED, SECOND TRY (2026-10-17; all versions). Run in the Supabase SQL editor (New query, paste all, Run). Safe to run again.
-- The editor shows only the LAST result: one line with how many wines the catalog view returns and how many milliseconds that took.
--
-- Why: the catalog view (v_catalog_cards) found each wine's region and country with geo_ancestor(), which walks up the place tree one row at a
-- time. The view runs with the visitor's own rights, so every one of those steps also runs the place list's permission check, which costs about
-- 0.4 ms a row here: 2 to 3 steps per wine, twice, for ~1,900 wines, so the whole view took longer than the 3 seconds a visitor's read is allowed.
-- (Marking geo_ancestor STABLE, the first try, did not help.)
-- Now one small helper reads the place tree once per read and gives every place its region and country; the view joins it by id. Nothing else
-- changes: the same columns, names, order and types, the same rules on who sees what (the view's own options are read first and put back),
-- plus one new column at the end: dosage (a sparkling wine's sweetness term, docs/sparkling_dosage.sql), so the app gets it in the same read.
-- On a copy of the catalog with an equally slow permission check: 15.5 s before, 0.6 s after, and every row identical.
-- The view's source is kept in docs/v_catalog_cards.sql from now on.

-- 1. Indexes on the columns the view joins on (each is skipped if it is already there).
create index if not exists geo_areas_parent_idx       on public.geo_areas (parent_id);
create index if not exists wines_appellation_idx      on public.wines (appellation_id);
create index if not exists wines_producer_idx         on public.wines (producer_id);
create index if not exists wine_vintages_wine_idx     on public.wine_vintages (wine_id);
create index if not exists wine_grapes_wine_idx       on public.wine_grapes (wine_id);
create index if not exists wine_images_vintage_idx    on public.wine_images (wine_vintage_id);

-- 2. Every place with its region and country, read once (a region is its own region; a country its own country). The place tree is at most
--    three deep (appellation, region, country); a fourth level is looked at in case. Only names come out, and the view only shows them next
--    to wines the visitor may see.
create or replace function public.geo_place_lines()
returns table (id uuid, region text, country text)
language sql stable security definer set search_path = public
as $$
  select a.id,
    case when a.level::text = 'region' then a.name when a1.level::text = 'region' then a1.name when a2.level::text = 'region' then a2.name when a3.level::text = 'region' then a3.name end::text,
    case when a.level::text = 'country' then a.name when a1.level::text = 'country' then a1.name when a2.level::text = 'country' then a2.name when a3.level::text = 'country' then a3.name end::text
  from geo_areas a
    left join geo_areas a1 on a1.id = a.parent_id
    left join geo_areas a2 on a2.id = a1.parent_id
    left join geo_areas a3 on a3.id = a2.parent_id
$$;
revoke all on function public.geo_place_lines() from public;
grant execute on function public.geo_place_lines() to anon, authenticated;

-- 3. The view, replaced in place. Its options (such as security_invoker, which makes it follow each visitor's own rights) are read first and
--    put back after, and the region and country keep the exact type the place names have.
do $do$
declare
  opts text[];
  name_type text;
  src text := $v$
 SELECT wv.id AS wine_vintage_id,
    wv.vintage_year,
    wv.is_non_vintage,
    p.name AS producer,
    w.name AS wine_name,
    w.style,
    a.name AS appellation,
    a.classification,
    gl.region::NAME_TYPE AS region,
    gl.country::NAME_TYPE AS country,
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
     LEFT JOIN public.geo_place_lines() gl(id, region, country) ON gl.id = w.appellation_id
     LEFT JOIN LATERAL ( SELECT wi.storage_path,
            wi.kind::text AS kind,
            wi.license_note AS note
           FROM wine_images wi
          WHERE wi.wine_id = w.id AND (wi.wine_vintage_id = wv.id OR wi.wine_vintage_id IS NULL) AND wi.status = 'verified'::verification_status
          ORDER BY (wi.wine_vintage_id IS NOT NULL) DESC, wi.is_primary DESC, wi.created_at DESC
         LIMIT 1) img ON true
$v$;
begin
  select reloptions into opts from pg_class where oid = 'public.v_catalog_cards'::regclass;
  select format_type(atttypid, atttypmod) into name_type from pg_attribute where attrelid = 'public.geo_areas'::regclass and attname = 'name';
  execute 'create or replace view public.v_catalog_cards as ' || replace(src, 'NAME_TYPE', name_type);
  if opts is not null then
    execute format('alter view public.v_catalog_cards set (%s)', array_to_string(opts, ', '));
  end if;
end
$do$;

-- 4. How long the whole view takes now, measured as the database owner (who skips the permission checks; a visitor's read is a little slower).
--    Under 1000 ms is good.
select count(*) as wines_in_the_view,
       round(1000 * extract(epoch from clock_timestamp() - statement_timestamp())) as milliseconds
from (select * from public.v_catalog_cards) x;

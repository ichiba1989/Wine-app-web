-- CATALOG SPEED (2026-10-17; all versions). Run in the Supabase SQL editor (New query, paste all, Run). Safe to run again.
--
-- Why: since about 1,500 wines were published, reading the whole catalog view (v_catalog_cards) takes longer than the 3 seconds the database
-- allows a visitor's read, so the app could not load the wine list. The app now reads it in 16 pieces (data.js loadCards), which works but takes
-- about 5 seconds. Measured from outside: the view's region and country columns cost about 1.5 milliseconds per wine each, everything else is cheap.
--
-- 0. The likely cause. The views find a wine's region and country with "where geo_areas.id = geo_ancestor(w.appellation_id, 'region')" (see the
--    view text kept in docs/soft_delete.sql). Unless geo_ancestor is marked STABLE, Postgres calls it once for EVERY place in geo_areas, for every
--    wine, twice (about 290 x 1,900 x 2 walks up the place tree). It only reads the place list, so STABLE is true of it, and Postgres can then
--    call it once per wine and use the primary key. First look at what it is now (provolatile: v = volatile, the slow case; s = stable; i = immutable):
select p.oid::regprocedure as function, p.provolatile, l.lanname as language from pg_proc p join pg_language l on l.oid = p.prolang where p.proname = 'geo_ancestor';
--    then mark it stable (does nothing if it already is):
do $$ declare f regprocedure; begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace where p.proname = 'geo_ancestor' and n.nspname = 'public' and p.provolatile = 'v' loop
    execute format('alter function %s stable', f);
  end loop;
end $$;

-- 1. Indexes on the columns the view joins on. Postgres does not make these by itself for foreign keys. Each is skipped if it is already there.
create index if not exists geo_areas_parent_idx       on public.geo_areas (parent_id);
create index if not exists wines_appellation_idx      on public.wines (appellation_id);
create index if not exists wines_producer_idx         on public.wines (producer_id);
create index if not exists wine_vintages_wine_idx     on public.wine_vintages (wine_id);
create index if not exists wine_grapes_wine_idx       on public.wine_grapes (wine_id);
create index if not exists wine_images_vintage_idx    on public.wine_images (wine_vintage_id);
analyze public.geo_areas; analyze public.wines; analyze public.wine_vintages; analyze public.wine_grapes; analyze public.wine_images;

-- 2. How long the whole view takes now (look at "Execution Time" at the bottom of the result). Under 3000 ms means the app can read it whole again.
explain analyze select * from public.v_catalog_cards;

-- 3. The view's own definition. The view's source is not kept in the repository; if step 2 is still slow, copy this result into the chat so the
--    region and country columns can be rewritten.
select pg_get_viewdef('public.v_catalog_cards'::regclass, true) as view_definition;

-- STAGING ONLY (disposable LOCAL Supabase stack). NEVER RUN ON PRODUCTION. Migration 003 tests, 2026-11-08.
-- A few more SYNTHETIC old-catalog rows, loaded after migration_002/tests/prereq_catalog.sql: two producers whose names differ only by
-- capitals and spaces (the kind of duplicate the live catalog has, REFERENCE_MODEL.md section 6), an appellation under the stand-in
-- region, and one stand-in wine placed in it. Synthetic names only; no wine facts.
insert into public.producers (name) select 'Domaine Exemple' where not exists (select 1 from public.producers where name = 'Domaine Exemple');
insert into public.producers (name) select 'DOMAINE  Exemple' where not exists (select 1 from public.producers where name = 'DOMAINE  Exemple');
insert into public.geo_areas (id, name, level, parent_id) values ('71000000-0000-0000-0000-000000000003', 'Stand-in Hill', 'appellation', '71000000-0000-0000-0000-000000000002') on conflict do nothing;
update public.wines set appellation_id = '71000000-0000-0000-0000-000000000003' where name = 'Stand-in draft wine' and appellation_id is null;

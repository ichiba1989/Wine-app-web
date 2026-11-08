-- MIGRATION 003: PREFLIGHT (READ-ONLY). Run BEFORE 003_reference_taxonomy_identity_catalog.sql, in the Supabase SQL Editor. It changes
-- nothing: one select; every row is a check with PASS or FAIL. All rows must say PASS before 003 is run. 003 makes the same checks
-- itself and stops (changing nothing) if one fails; this file shows the answers in advance. Needs migration 002.

with checks(name, ok, detail) as (
  select 'migration 002 is release "002 r1 (2026-11-08)"',
         (select release from wine_reference.schema_migrations where version = '002') is not distinct from '002 r1 (2026-11-08)',
         coalesce((select release from wine_reference.schema_migrations where version = '002'), 'not registered')
  union all
  select 'migration 003 is not registered yet', not exists (select 1 from wine_reference.schema_migrations where version = '003'),
         coalesce((select release from wine_reference.schema_migrations where version = '003'), '')
  union all
  select 'no hand-made change since 002 (fingerprint matches the one 002 stored)',
         wine_reference.fingerprint_002() is not distinct from (select structure_md5 from wine_reference.schema_migrations where version = '002'), ''
  union all
  select 'public has only the four ref_* functions 001 and 002 made',
         not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and p.proname like 'ref\_%'
                        and (p.proname, pg_catalog.oidvectortypes(p.proargtypes)) not in
                            (('ref_published_names', 'text, text, integer'), ('ref_review', 'text, uuid, text, text, uuid'), ('ref_staff', 'text, jsonb'), ('ref_draft', 'text, jsonb'))),
         coalesce((select string_agg(p.proname, ', ' order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'ref\_%'), '')
  union all
  select 'every existing catalog link points at a thing of the kind its table stands for (003 enforces this from now on)',
         not exists (select 1 from wine_reference.legacy_links l join wine_reference.entities e on e.id = l.entity_id
                      where l.status <> 'rejected' and e.kind is distinct from case l.catalog_table when 'producers' then 'producer' when 'wines' then 'wine_product'
                            when 'wine_vintages' then 'wine_edition' when 'grapes' then 'grape_variety' when 'geo_areas' then 'place' end),
         coalesce((select string_agg(l.catalog_table || ' ' || l.catalog_id || ' -> ' || e.kind, '; ') from wine_reference.legacy_links l join wine_reference.entities e on e.id = l.entity_id
                    where l.status <> 'rejected' and e.kind is distinct from case l.catalog_table when 'producers' then 'producer' when 'wines' then 'wine_product'
                          when 'wine_vintages' then 'wine_edition' when 'grapes' then 'grape_variety' when 'geo_areas' then 'place' end), '')
  union all
  select 'the catalog columns 003 reads exist (producers.name, wines.producer_id/name/style/appellation_id, wine_vintages.wine_id/vintage_year/is_non_vintage, grapes.name, geo_areas.name/level)',
         (select count(*) from information_schema.columns where table_schema = 'public' and (table_name, column_name) in
            (('producers', 'name'), ('wines', 'producer_id'), ('wines', 'name'), ('wines', 'style'), ('wines', 'appellation_id'), ('wine_vintages', 'wine_id'),
             ('wine_vintages', 'vintage_year'), ('wine_vintages', 'is_non_vintage'), ('grapes', 'name'), ('geo_areas', 'name'), ('geo_areas', 'level'))) = 11, ''
  union all
  select 'the Owner role holds ref_edit, ref_review, ref_publish, ref_rights; no other role holds any',
         coalesce((select permissions @> array['ref_edit', 'ref_review', 'ref_publish', 'ref_rights'] from public.staff_roles where code = 'owner'), false)
         and not exists (select 1 from public.staff_roles where code <> 'owner' and permissions && array['ref_edit', 'ref_review', 'ref_publish', 'ref_rights']), ''
  union all
  select 'the reference switch is off (app_config reference_enabled absent or 0)', public.cfg_number('reference_enabled', 0) < 1, ''
  union all
  select '(information) things / links / taxonomy entries today', true,
         (select count(*) from wine_reference.entities) || ' / ' || (select count(*) from wine_reference.legacy_links) || ' / '
         || ((select count(*) from wine_reference.taxonomy_domains) + (select count(*) from wine_reference.taxonomy_nodes))
)
select case when ok then 'PASS' else 'FAIL' end as result, name as check_name, detail from checks order by ok, name;

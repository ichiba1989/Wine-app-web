-- MIGRATION 002: PREFLIGHT (READ-ONLY). Run BEFORE 002_reference_editorial_identity.sql, in the Supabase SQL Editor. It changes nothing:
-- one select; every row is a check with PASS or FAIL. All rows must say PASS before 002 is run. 002 makes the same checks itself and stops
-- (changing nothing) if one fails, so this file only shows the answers in advance. Needs migration 001 (it reads wine_reference).
-- The one thing SQL cannot see: whether wine_reference is listed in Settings -> API -> Exposed schemas (it must NOT be; look by hand).

with checks(name, ok, detail) as (
  select 'migration 001 is release "001 r5 (2026-11-08)"',
         (select release from wine_reference.schema_migrations where version = '001') is not distinct from '001 r5 (2026-11-08)',
         coalesce((select release from wine_reference.schema_migrations where version = '001'), 'not registered')
  union all
  select '001a (reference permissions) is registered', exists (select 1 from wine_reference.schema_migrations where version = '001a'), ''
  union all
  select 'migration 002 is not registered yet', not exists (select 1 from wine_reference.schema_migrations where version = '002'),
         coalesce((select release from wine_reference.schema_migrations where version = '002'), '')
  union all
  select 'no hand-made change since 001 (structure fingerprint matches the one 001 stored)',
         wine_reference.structure_fingerprint() is not distinct from (select structure_md5 from wine_reference.schema_migrations where version = '001'), ''
  union all
  select 'public has only the two ref_* functions 001 made (ref_published_names, ref_review)',
         not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and p.proname like 'ref\_%'
                        and (p.proname, pg_catalog.oidvectortypes(p.proargtypes)) not in
                            (('ref_published_names', 'text, text, integer'), ('ref_review', 'text, uuid, text, text, uuid'))),
         coalesce((select string_agg(p.proname || '(' || pg_catalog.oidvectortypes(p.proargtypes) || ')', ', ')
                     from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'ref\_%'), '')
  union all
  select 'nothing named legacy_links yet', to_regclass('wine_reference.legacy_links') is null, ''
  union all
  select 'the Owner role holds ref_edit, ref_review, ref_publish, ref_rights',
         coalesce((select permissions @> array['ref_edit', 'ref_review', 'ref_publish', 'ref_rights'] from public.staff_roles where code = 'owner'), false), ''
  union all
  select 'no other role holds a ref_* permission (owner decision 5)',
         not exists (select 1 from public.staff_roles where code <> 'owner' and permissions && array['ref_edit', 'ref_review', 'ref_publish', 'ref_rights']),
         coalesce((select string_agg(code, ', ') from public.staff_roles where code <> 'owner' and permissions && array['ref_edit', 'ref_review', 'ref_publish', 'ref_rights']), '')
  union all
  select 'the permission check public.has_permission(text) exists (the new doors use it)', to_regprocedure('public.has_permission(text)') is not null, ''
  union all
  select 'the reference switch is off (app_config reference_enabled absent or 0)', public.cfg_number('reference_enabled', 0) < 1, ''
  union all
  select 'the catalog tables 002 reads exist (producers, wines, wine_vintages, grapes, geo_areas)',
         to_regclass('public.producers') is not null and to_regclass('public.wines') is not null and to_regclass('public.wine_vintages') is not null
         and to_regclass('public.grapes') is not null and to_regclass('public.geo_areas') is not null, ''
  union all
  select '(information) reference rows today: entities / claims / sources',
         true,
         (select count(*) from wine_reference.entities) || ' / ' || (select count(*) from wine_reference.claims) || ' / ' || (select count(*) from wine_reference.sources)
)
select case when ok then 'PASS' else 'FAIL' end as result, name as check_name, detail from checks order by ok, name;

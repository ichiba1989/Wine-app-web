-- MIGRATION 006: PREFLIGHT (READ-ONLY). Run BEFORE 006_reference_browse.sql, in the Supabase SQL Editor. It changes nothing:
-- one select; every row is a check with PASS or FAIL. All rows must say PASS before 006 is run. 006 makes the same checks itself and
-- stops (changing nothing) if one fails; this file shows the answers in advance. Needs migration 005.

with checks(name, ok, detail) as (
  select 'migration 005 is release "005 r1 (2026-11-13)"',
         (select release from wine_reference.schema_migrations where version = '005') is not distinct from '005 r1 (2026-11-13)',
         coalesce((select release from wine_reference.schema_migrations where version = '005'), 'not registered')
  union all
  select 'migration 006 is not registered yet', not exists (select 1 from wine_reference.schema_migrations where version = '006'),
         coalesce((select release from wine_reference.schema_migrations where version = '006'), '')
  union all
  select 'no hand-made change since 005 (fingerprint matches the one 005 stored)',
         wine_reference.fingerprint_005() is not distinct from (select structure_md5 from wine_reference.schema_migrations where version = '005'), ''
  union all
  select 'public has only the seven ref_* functions 001 to 005 made (no ref_browse yet)',
         not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and p.proname like 'ref\_%'
                        and (p.proname, pg_catalog.oidvectortypes(p.proargtypes)) not in
                            (('ref_published_names', 'text, text, integer'), ('ref_review', 'text, uuid, text, text, uuid'), ('ref_staff', 'text, jsonb'), ('ref_draft', 'text, jsonb'),
                             ('ref_tools', 'text, jsonb'), ('ref_work', 'text, jsonb'), ('ref_rules', 'text, jsonb'))),
         coalesce((select string_agg(p.proname, ', ' order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'ref\_%'), '')
  union all
  select 'the read door''s helpers exist (version_problems, is_current, display_name, names_json, catalog_rows, catalog_row_name, my_staff_role_code)',
         to_regprocedure('wine_reference.version_problems(uuid)') is not null and to_regprocedure('wine_reference.is_current(uuid, integer)') is not null
         and to_regprocedure('wine_reference.display_name(uuid)') is not null and to_regprocedure('wine_reference.names_json(uuid)') is not null
         and to_regprocedure('wine_reference.catalog_rows(text)') is not null and to_regprocedure('wine_reference.catalog_row_name(text, text)') is not null
         and to_regprocedure('public.my_staff_role_code()') is not null, ''
  union all
  select 'the indexes 006 adds are not there yet (entities_created, claims_created)',
         to_regclass('wine_reference.entities_created') is null and to_regclass('wine_reference.claims_created') is null, ''
  union all
  select 'the Owner role holds ref_edit, ref_review, ref_publish, ref_rights; no other role holds any',
         coalesce((select permissions @> array['ref_edit', 'ref_review', 'ref_publish', 'ref_rights'] from public.staff_roles where code = 'owner'), false)
         and not exists (select 1 from public.staff_roles where code <> 'owner' and permissions && array['ref_edit', 'ref_review', 'ref_publish', 'ref_rights']), ''
  union all
  select 'the reference switch is off (app_config reference_enabled absent or 0)', public.cfg_number('reference_enabled', 0) < 1, ''
  union all
  select '(information) things / facts / sources today', true,
         (select count(*) from wine_reference.entities) || ' / ' || (select count(*) from wine_reference.claims) || ' / ' || (select count(*) from wine_reference.sources)
)
select case when ok then 'PASS' else 'FAIL' end as result, name as check_name, detail from checks order by ok, name;

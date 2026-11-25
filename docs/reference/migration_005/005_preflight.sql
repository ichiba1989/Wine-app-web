-- MIGRATION 005: PREFLIGHT (READ-ONLY). Run BEFORE 005_reference_grape_rules.sql, in the Supabase SQL Editor. It changes nothing:
-- one select; every row is a check with PASS or FAIL. All rows must say PASS before 005 is run. 005 makes the same checks itself and
-- stops (changing nothing) if one fails; this file shows the answers in advance. Needs migration 004.

with checks(name, ok, detail) as (
  select 'migration 004 is release "004 r1 (2026-11-13)"',
         (select release from wine_reference.schema_migrations where version = '004') is not distinct from '004 r1 (2026-11-13)',
         coalesce((select release from wine_reference.schema_migrations where version = '004'), 'not registered')
  union all
  select 'migration 005 is not registered yet', not exists (select 1 from wine_reference.schema_migrations where version = '005'),
         coalesce((select release from wine_reference.schema_migrations where version = '005'), '')
  union all
  select 'no hand-made change since 004 (fingerprint matches the one 004 stored)',
         wine_reference.fingerprint_004() is not distinct from (select structure_md5 from wine_reference.schema_migrations where version = '004'), ''
  union all
  select 'public has only the six ref_* functions 001 to 004 made',
         not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and p.proname like 'ref\_%'
                        and (p.proname, pg_catalog.oidvectortypes(p.proargtypes)) not in
                            (('ref_published_names', 'text, text, integer'), ('ref_review', 'text, uuid, text, text, uuid'), ('ref_staff', 'text, jsonb'), ('ref_draft', 'text, jsonb'), ('ref_tools', 'text, jsonb'), ('ref_work', 'text, jsonb'))),
         coalesce((select string_agg(p.proname, ', ' order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'ref\_%'), '')
  union all
  select 'the type 005 imports into exists (rules_name_grape: place -> grape variety)',
         exists (select 1 from wine_reference.relationship_types where code = 'rules_name_grape'), ''
  union all
  select '(information) appellation_grape_rules exists (the grape-rules check reads it; without it the check says so)',
         true, case when to_regclass('public.appellation_grape_rules') is null then 'not found' else 'found' end
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

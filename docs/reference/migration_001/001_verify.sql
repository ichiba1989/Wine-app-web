-- MIGRATION 001: VERIFY (READ-ONLY). Safe to run on the live database AFTER migration 001, and locally. Changes nothing.
-- One select; every row is a check with PASS or FAIL. Rows marked "(right after migration 001)" are expected to change later, once the
-- owner activates types, imports the taxonomy and publishes. Run it in the SQL Editor and read the "result" column; all rows should say PASS.

with
expected_tables(t) as (values
  ('schema_migrations'), ('entity_kinds'), ('name_kinds'), ('source_kinds'), ('evidence_modalities'), ('rights_statements'), ('entities'),
  ('entity_names'), ('taxonomy_domains'), ('taxonomy_nodes'), ('taxonomy_assignments'), ('relationship_types'), ('attribute_types'),
  ('sources'), ('source_versions'), ('claims'), ('claim_versions'), ('claim_version_dependencies'), ('claim_evidence'),
  ('review_events'), ('change_log')),
tbl as (
  select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'wine_reference' and c.relkind = 'r'),
checks(name, ok, detail) as (
  select 'schema wine_reference exists', exists (select 1 from pg_namespace where nspname = 'wine_reference'), ''
  union all
  select 'migration 001 is registered', (select count(*) = 1 from wine_reference.schema_migrations where version = '001'), ''
  union all
  select 'all ' || (select count(*) from expected_tables) || ' tables exist',
         not exists (select 1 from expected_tables e where e.t not in (select relname from tbl)),
         coalesce((select string_agg(e.t, ', ') from expected_tables e where e.t not in (select relname from tbl)), '')
  union all
  select 'row-level security is on for every table', not exists (select 1 from tbl where not relrowsecurity),
         coalesce((select string_agg(relname, ', ') from tbl where not relrowsecurity), '')
  union all
  select 'no policies on the schema''s tables (only the owner reaches rows)',
         not exists (select 1 from pg_policies where schemaname = 'wine_reference'), ''
  union all
  select 'the browser''s roles cannot use the schema',
         not has_schema_privilege('anon', 'wine_reference', 'USAGE') and not has_schema_privilege('authenticated', 'wine_reference', 'USAGE')
         and not has_schema_privilege('service_role', 'wine_reference', 'USAGE'), ''
  union all
  select 'no table grants to anon, authenticated, service_role or PUBLIC',
         not exists (select 1 from information_schema.role_table_grants where table_schema = 'wine_reference'
                      and grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')), ''
  union all
  select 'no function in the schema is executable by anon, authenticated or PUBLIC',
         not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'wine_reference'
                        and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE')
                             or p.proacl is null   -- no explicit list means PostgreSQL's default: PUBLIC may execute
                             or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'))), ''
  union all
  select 'public.ref_published_names: security definer, empty search_path, executable by anon and authenticated only',
         exists (select 1 from pg_proc p where p.oid = 'public.ref_published_names(text,text,integer)'::regprocedure and p.prosecdef
                   and p.proconfig @> array['search_path=""'])
         and has_function_privilege('anon', 'public.ref_published_names(text,text,integer)', 'EXECUTE')
         and has_function_privilege('authenticated', 'public.ref_published_names(text,text,integer)', 'EXECUTE')
         and not has_function_privilege('service_role', 'public.ref_published_names(text,text,integer)', 'EXECUTE'), ''
  union all
  select 'public.ref_review: security definer, empty search_path, executable by authenticated only',
         exists (select 1 from pg_proc p where p.oid = 'public.ref_review(text,uuid,text,text,uuid)'::regprocedure and p.prosecdef
                   and p.proconfig @> array['search_path=""'])
         and has_function_privilege('authenticated', 'public.ref_review(text,uuid,text,text,uuid)', 'EXECUTE')
         and not has_function_privilege('anon', 'public.ref_review(text,uuid,text,text,uuid)', 'EXECUTE')
         and not has_function_privilege('service_role', 'public.ref_review(text,uuid,text,text,uuid)', 'EXECUTE'), ''
  union all
  select 'migration 001 release is "001 r3 (2026-10-27)"',
         (select release from wine_reference.schema_migrations where version = '001') = '001 r3 (2026-10-27)', ''
  union all
  select 'no structure drift: the schema matches the fingerprint stored by the migration',
         (select structure_md5 from wine_reference.schema_migrations where version = '001') = wine_reference.structure_fingerprint(), ''
  union all
  select 'health: every published, unsuspended claim version is current (sound, with current dependencies)',
         not exists (select 1 from wine_reference.claim_versions v where v.status = 'verified' and v.published_at is not null
                      and v.suspended_at is null and not wine_reference.is_current(v.id)),
         coalesce((select string_agg(v.id::text, ', ') from wine_reference.claim_versions v where v.status = 'verified' and v.published_at is not null
                    and v.suspended_at is null and not wine_reference.is_current(v.id)), '')
  union all
  select 'health: every published entity has a current display name',
         not exists (select 1 from wine_reference.entities e where e.status = 'verified' and e.published_at is not null
                      and not wine_reference.has_display_name(e.id)),
         coalesce((select string_agg(e.id::text, ', ') from wine_reference.entities e where e.status = 'verified' and e.published_at is not null
                    and not wine_reference.has_display_name(e.id)), '')
  union all
  select 'health: every private source copy is under verified rights that allow copying',
         not exists (select 1 from wine_reference.source_versions sv left join wine_reference.rights_statements rs on rs.id = sv.rights_id
                      where sv.storage_path is not null and sv.status <> 'retired' and not (rs.status = 'verified' and rs.allows_copy)), ''
  union all
  select '001a consistency: if registered, the Owner role holds all four ref_* permissions; if not, no role holds any',
         case when exists (select 1 from wine_reference.schema_migrations where version = '001a')
              then (select permissions @> array['ref_edit', 'ref_review', 'ref_publish', 'ref_rights'] from public.staff_roles where code = 'owner')
              else not exists (select 1 from public.staff_roles where permissions && array['ref_edit', 'ref_review', 'ref_publish', 'ref_rights']) end,
         case when exists (select 1 from wine_reference.schema_migrations where version = '001a') then '001a registered' else '001a not registered' end
  union all
  select '001a consistency: no role other than owner (or editor, if the owner chose it) holds a ref_* permission',
         not exists (select 1 from public.staff_roles where code not in ('owner', 'editor')
                      and permissions && array['ref_edit', 'ref_review', 'ref_publish', 'ref_rights']), ''
  union all
  select 'the Owner lookup public.my_staff_role_code() exists (used by the Owner approval override)',
         to_regprocedure('public.my_staff_role_code()') is not null, ''
  union all
  select 'review_events records owner_override (only ever on approve decisions)',
         exists (select 1 from information_schema.columns where table_schema = 'wine_reference' and table_name = 'review_events' and column_name = 'owner_override')
         and not exists (select 1 from wine_reference.review_events where owner_override and decision <> 'approve'), ''
  union all
  select 'nothing else named ref_* in public',
         (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'ref\_%') = 2, ''
  union all
  select 'the reference switch is off (app_config reference_enabled absent or 0)', public.cfg_number('reference_enabled', 0) < 1,
         'turn it on only after the owner approves'
  union all
  select '(right after migration 001) no published entity yet', not exists (select 1 from wine_reference.entities where published_at is not null), ''
  union all
  select '(right after migration 001) relationship types are all still proposed',
         not exists (select 1 from wine_reference.relationship_types where status <> 'proposed'), 'owner activates them'
  union all
  select '(right after migration 001) taxonomy is empty until the approved list is imported',
         (select count(*) from wine_reference.taxonomy_domains) = 0 and (select count(*) from wine_reference.taxonomy_nodes) = 0, ''
)
select case when ok then 'PASS' else 'FAIL' end as result, name as check_name, detail from checks order by ok, name;

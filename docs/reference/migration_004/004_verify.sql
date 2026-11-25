-- MIGRATION 004: VERIFY (READ-ONLY). Run AFTER migration 004; it replaces 003_verify.sql from then on. Two rows of 003_verify are
-- expected to FAIL once 004 is in, because 004 adds functions on purpose: its drift row (the fingerprint covers every function in the
-- reference schema) and its "five ref_* functions" row. This file checks the new state. One select; every row is a check with PASS or
-- FAIL, and every row should say PASS at any time (none depends on what the owner has drafted, switched on or published).
with
expected_tables(t) as (values
  ('schema_migrations'), ('entity_kinds'), ('name_kinds'), ('source_kinds'), ('evidence_modalities'), ('rights_statements'), ('entities'),
  ('entity_names'), ('taxonomy_domains'), ('taxonomy_nodes'), ('taxonomy_assignments'), ('relationship_types'), ('attribute_types'),
  ('sources'), ('source_versions'), ('claims'), ('claim_versions'), ('claim_version_dependencies'), ('claim_evidence'),
  ('review_events'), ('change_log'), ('legacy_links')),
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
  select 'migration 001 release is "001 r5 (2026-11-08)"',
         (select release from wine_reference.schema_migrations where version = '001') = '001 r5 (2026-11-08)', ''
  union all
  select 'every editorial table takes the editorial lock at the start of each write statement (19 statement triggers, legacy_links included)',
         (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'wine_reference' and not t.tgisinternal and t.tgname like '%\_lock\_first'
             and t.tgfoid = 'wine_reference.lock_before_write()'::regprocedure
             and (t.tgtype & 1) = 0 and (t.tgtype & 2) = 2 and (t.tgtype & 28) = 28) = 19, ''
  union all
  select 'TRUNCATE is refused on every reference table except the migration register (21 triggers)',
         (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'wine_reference' and not t.tgisinternal and t.tgfoid = 'wine_reference.refuse_truncate()'::regprocedure
             and (t.tgtype & 32) = 32) = 21, ''
  union all
  select 'audit: every claim version retired after publication has a retire event in review_events',
         not exists (select 1 from wine_reference.claim_versions v where v.status = 'retired' and v.published_at is not null
                      and not exists (select 1 from wine_reference.review_events e where e.target_table = 'claim_versions'
                                       and e.target_id = v.id and e.decision = 'retire')),
         coalesce((select string_agg(v.id::text, ', ') from wine_reference.claim_versions v where v.status = 'retired' and v.published_at is not null
                    and not exists (select 1 from wine_reference.review_events e where e.target_table = 'claim_versions'
                                     and e.target_id = v.id and e.decision = 'retire')), '')
  union all
  select 'audit: no claim version has more than one retire event',
         not exists (select 1 from wine_reference.review_events where target_table = 'claim_versions' and decision = 'retire'
                      group by target_id having count(*) > 1), ''
  union all
  select 'no structure drift: the reference matches the fingerprint stored by migration 004',
         (select structure_md5 from wine_reference.schema_migrations where version = '004') = wine_reference.fingerprint_004(), ''
  union all
  select 'migration 004 release is "004 r1 (2026-11-13)"',
         (select release from wine_reference.schema_migrations where version = '004') = '004 r1 (2026-11-13)', ''
  union all
  select 'public.ref_work: security definer, empty search_path, executable by authenticated only',
         (select count(*) = 1 from pg_proc p where p.oid = 'public.ref_work(text,jsonb)'::regprocedure
            and p.prosecdef and p.proconfig @> array['search_path=""']
            and has_function_privilege('authenticated', p.oid, 'EXECUTE') and not has_function_privilege('anon', p.oid, 'EXECUTE')
            and not has_function_privilege('service_role', p.oid, 'EXECUTE')
            and not exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0)), ''
  union all
  select 'the functions 004 added inside wine_reference are not executable by anon or signed-in users',
         not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'wine_reference' and p.proname in ('catalog_grapes', 'catalog_place_tree', 'rule_grape_report', 'fingerprint_004')
                        and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'))), ''
  union all
  select 'the appellation grape-rule claim type exists (rules_name_grape: place -> grape variety, needs documentary evidence)',
         exists (select 1 from wine_reference.relationship_types where code = 'rules_name_grape' and subject_kinds = '{place}' and object_kinds = '{grape_variety}'
                  and required_modality = 'documentary'), ''
  union all
  select 'migration 003 release is "003 r1 (2026-11-08)"',
         (select release from wine_reference.schema_migrations where version = '003') = '003 r1 (2026-11-08)', ''
  union all
  select 'migration 002 release is "002 r1 (2026-11-08)"',
         (select release from wine_reference.schema_migrations where version = '002') = '002 r1 (2026-11-08)', ''
  union all
  select 'migration 001a (reference permissions) is registered', exists (select 1 from wine_reference.schema_migrations where version = '001a'), ''
  union all
  select 'public.ref_draft and public.ref_staff: security definer, empty search_path, executable by authenticated only',
         (select count(*) = 2 from pg_proc p where p.oid in ('public.ref_draft(text,jsonb)'::regprocedure, 'public.ref_staff(text,jsonb)'::regprocedure)
            and p.prosecdef and p.proconfig @> array['search_path=""']
            and has_function_privilege('authenticated', p.oid, 'EXECUTE') and not has_function_privilege('anon', p.oid, 'EXECUTE')
            and not has_function_privilege('service_role', p.oid, 'EXECUTE')
            and not exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0)), ''
  union all
  select 'the four wine identity kinds exist (wine_product, wine_edition, wine_release, release_event)',
         (select count(*) = 4 from wine_reference.entity_kinds where code in ('wine_product', 'wine_edition', 'wine_release', 'release_event')), ''
  union all
  select 'the six identity relationship types and five attribute types exist',
         (select count(*) = 6 from wine_reference.relationship_types where code in ('product_of', 'defined_by_place', 'edition_of', 'release_of', 'event_of', 'made_from'))
         and (select count(*) = 5 from wine_reference.attribute_types where code in ('harvest_year', 'nv_identifier', 'release_date', 'event_date', 'bottle_format_ml')), ''
  union all
  select 'legacy_links keeps the editorial lock, refuses TRUNCATE, is in the change log, and checks and settles every link (5 triggers)',
         (select count(*) = 5 from pg_trigger where tgrelid = 'wine_reference.legacy_links'::regclass and not tgisinternal
            and tgname in ('legacy_links_log', 'legacy_links_lock_first', 'legacy_links_no_truncate', 'legacy_links_check', 'legacy_links_settle')), ''
  union all
  select 'legacy_links records how each link was found (match_method, match_score)',
         (select count(*) = 2 from information_schema.columns where table_schema = 'wine_reference' and table_name = 'legacy_links' and column_name in ('match_method', 'match_score')), ''
  union all
  select 'every live link points at a thing of the kind its catalog table stands for',
         not exists (select 1 from wine_reference.legacy_links l join wine_reference.entities e on e.id = l.entity_id
                      where l.status <> 'rejected' and e.kind is distinct from wine_reference.catalog_kind(l.catalog_table)),
         coalesce((select string_agg(l.id::text, ', ') from wine_reference.legacy_links l join wine_reference.entities e on e.id = l.entity_id
                    where l.status <> 'rejected' and e.kind is distinct from wine_reference.catalog_kind(l.catalog_table)), '')
  union all
  select 'no catalog row has a confirmed link and an open suggestion at the same time',
         not exists (select 1 from wine_reference.legacy_links s join wine_reference.legacy_links c on c.catalog_table = s.catalog_table and c.catalog_id = s.catalog_id
                      where s.status = 'suggested' and c.status = 'confirmed'), ''
  union all
  select 'public.ref_tools: security definer, empty search_path, executable by authenticated only',
         (select count(*) = 1 from pg_proc p where p.oid = 'public.ref_tools(text,jsonb)'::regprocedure
            and p.prosecdef and p.proconfig @> array['search_path=""']
            and has_function_privilege('authenticated', p.oid, 'EXECUTE') and not has_function_privilege('anon', p.oid, 'EXECUTE')
            and not has_function_privilege('service_role', p.oid, 'EXECUTE')
            and not exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0)), ''
  union all
  select 'the functions 003 added inside wine_reference are not executable by anon or signed-in users',
         not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'wine_reference' and p.proname in ('catalog_kind', 'catalog_row_exists', 'catalog_row_name', 'make_entity', 'add_names',
                            'suggest_link', 'linked_entity', 'catalog_fact', 'catalog_identity', 'catalog_rows', 'display_name', 'names_json', 'import_taxonomy', 'fingerprint_003')
                        and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'))), ''
  union all
  select 'every taxonomy domain and subdomain is a thing of the right kind (codes stable, hierarchy within one domain)',
         not exists (select 1 from wine_reference.taxonomy_domains d join wine_reference.entities e on e.id = d.entity_id where e.kind <> 'taxonomy_domain')
         and not exists (select 1 from wine_reference.taxonomy_nodes n join wine_reference.entities e on e.id = n.entity_id where e.kind <> 'taxonomy_node')
         and not exists (select 1 from wine_reference.taxonomy_nodes n join wine_reference.taxonomy_nodes p on p.entity_id = n.parent_id where p.domain_id <> n.domain_id), ''
  union all
  select 'bottle format stays proposed until the owner decides (REFERENCE_MODEL.md section 15, question 4)',
         (select status from wine_reference.attribute_types where code = 'bottle_format_ml') = 'proposed', ''
  union all
  select 'old catalog links: at most one confirmed entity per catalog row, and every link is marked "old catalog, not verified"',
         not exists (select 1 from wine_reference.legacy_links where status = 'confirmed' group by catalog_table, catalog_id having count(*) > 1)
         and not exists (select 1 from wine_reference.legacy_links where basis <> 'old catalog, not verified'), ''
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
         (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'ref\_%') = 6, 'ref_published_names, ref_review, ref_draft, ref_staff, ref_tools, ref_work'
  union all
  select 'the reference switch is off (app_config reference_enabled absent or 0)', public.cfg_number('reference_enabled', 0) < 1,
         'turn it on only after the owner approves'
  union all
  select '(information) taxonomy domains / subdomains, links confirmed / suggested', true,
         (select count(*) from wine_reference.taxonomy_domains) || ' / ' || (select count(*) from wine_reference.taxonomy_nodes) || ', '
         || (select count(*) from wine_reference.legacy_links where status = 'confirmed') || ' / ' || (select count(*) from wine_reference.legacy_links where status = 'suggested')
)
select case when ok then 'PASS' else 'FAIL' end as result, name as check_name, detail from checks order by ok, name;

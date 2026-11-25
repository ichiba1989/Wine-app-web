-- POST-DEPLOYMENT CHECK for anon_hardening_up.sql (release 2, 2026-11-08). READ-ONLY: changes nothing; safe on the live database.
-- Run it in the Supabase SQL editor right after the hardening. Every row should say PASS. A FAIL names what to look at; if the app
-- misbehaves, run anon_hardening_rollback.sql (docs/security/DEPLOY.md).
with v as (select current_setting('server_version_num')::int >= 170000 as v17),
pub_rel as (
  select c.oid, c.oid::regclass::text as name, c.relkind from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S') and pg_has_role(current_user, c.relowner, 'USAGE')
     and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')),
checks(name, ok, detail) as (
  select 'hardening is applied (backup table present, release 2)',
         to_regclass('private.anon_hardening_backup') is not null, ''
  union all
  select 'profiles: anon has no table privilege',
         not (has_table_privilege('anon', 'public.profiles', 'SELECT') or has_table_privilege('anon', 'public.profiles', 'INSERT')
              or has_table_privilege('anon', 'public.profiles', 'UPDATE') or has_table_privilege('anon', 'public.profiles', 'DELETE')
              or has_table_privilege('anon', 'public.profiles', 'TRUNCATE') or has_table_privilege('anon', 'public.profiles', 'REFERENCES')
              or has_table_privilege('anon', 'public.profiles', 'TRIGGER')), ''
  union all
  select 'profiles: anon has no column privilege',
         not exists (select 1 from pg_attribute a where a.attrelid = 'public.profiles'::regclass and a.attnum > 0 and not a.attisdropped
                      and (has_column_privilege('anon', 'public.profiles'::regclass, a.attnum, 'SELECT') or has_column_privilege('anon', 'public.profiles'::regclass, a.attnum, 'UPDATE')
                           or has_column_privilege('anon', 'public.profiles'::regclass, a.attnum, 'INSERT'))), ''
  union all
  select 'profiles: signed-in users can read (row security still limits rows)', has_table_privilege('authenticated', 'public.profiles', 'SELECT'), ''
  union all
  select 'profiles: signed-in users can update the consent and age columns (the app writes them)',
         has_column_privilege('authenticated', 'public.profiles', 'consent_version', 'UPDATE') and has_column_privilege('authenticated', 'public.profiles', 'consent_at', 'UPDATE')
         and has_column_privilege('authenticated', 'public.profiles', 'age_attested_at', 'UPDATE') and has_column_privilege('authenticated', 'public.profiles', 'age_attested_rule', 'UPDATE'), ''
  union all
  select 'profiles: signed-in users cannot change role, staff_role, tier, id or created_at',
         not exists (select 1 from unnest(array['role', 'staff_role', 'tier', 'id', 'created_at']) c
                      where exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = c)
                        and has_column_privilege('authenticated', 'public.profiles', c, 'UPDATE')),
         coalesce((select string_agg(c, ', ') from unnest(array['role', 'staff_role', 'tier', 'id', 'created_at']) c
                    where exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = c)
                      and has_column_privilege('authenticated', 'public.profiles', c, 'UPDATE')), '')
  union all
  select 'profiles: signed-in users cannot insert, delete or truncate profiles',
         not (has_table_privilege('authenticated', 'public.profiles', 'INSERT') or has_table_privilege('authenticated', 'public.profiles', 'DELETE')
              or has_table_privilege('authenticated', 'public.profiles', 'TRUNCATE')), ''
  union all
  select 'profiles: row-level security is on', (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), ''
  union all
  select 'no TRUNCATE, REFERENCES, TRIGGER (or MAINTAIN) for anon or authenticated on public tables postgres controls',
         not exists (select 1 from pub_rel r, v where r.relkind <> 'S' and (
                       has_table_privilege('anon', r.oid, 'TRUNCATE') or has_table_privilege('authenticated', r.oid, 'TRUNCATE')
                       or has_table_privilege('anon', r.oid, 'REFERENCES') or has_table_privilege('authenticated', r.oid, 'REFERENCES')
                       or has_table_privilege('anon', r.oid, 'TRIGGER') or has_table_privilege('authenticated', r.oid, 'TRIGGER')
                       or (v.v17 and (has_table_privilege('anon', r.oid, 'MAINTAIN') or has_table_privilege('authenticated', r.oid, 'MAINTAIN'))))),
         coalesce((select string_agg(r.name, ', ') from pub_rel r where r.relkind <> 'S' and (has_table_privilege('anon', r.oid, 'TRUNCATE') or has_table_privilege('authenticated', r.oid, 'TRUNCATE'))), '')
  union all
  select 'sequences: anon has none; signed-in users cannot move them (UPDATE)',
         not exists (select 1 from pub_rel r where case when r.relkind = 'S' then (has_sequence_privilege('anon', r.oid, 'USAGE') or has_sequence_privilege('anon', r.oid, 'SELECT')
                      or has_sequence_privilege('anon', r.oid, 'UPDATE') or has_sequence_privilege('authenticated', r.oid, 'UPDATE')) else false end), ''
  union all
  select 'sequences: signed-in users keep USAGE (inserts with serial ids work)',
         not exists (select 1 from pub_rel r where case when r.relkind = 'S' then not has_sequence_privilege('authenticated', r.oid, 'USAGE') else false end),
         coalesce((select string_agg(r.name, ', ') from pub_rel r where case when r.relkind = 'S' then not has_sequence_privilege('authenticated', r.oid, 'USAGE') else false end), '')
  union all
  select 'signed-in-only functions: anon cannot execute them; signed-in users still can',
         not exists (select 1 from private.anon_hardening_backup b where b.part = 'C' and to_regprocedure(b.object_name) is not null
                      and (has_function_privilege('anon', to_regprocedure(b.object_name), 'EXECUTE')
                           or (exists (select 1 from private.anon_hardening_backup b2 where b2.part = 'C' and b2.object_name = b.object_name
                                        and b2.grantee in ('authenticated', 'PUBLIC') and b2.privilege = 'EXECUTE')
                               and not has_function_privilege('authenticated', to_regprocedure(b.object_name), 'EXECUTE')))),
         (select count(distinct object_name) || ' functions' from private.anon_hardening_backup where part = 'C')
  union all
  select 'policy helper has_permission() still executable by anon (signed-out reads need it)',
         to_regprocedure('public.has_permission(text)') is null or has_function_privilege('anon', 'public.has_permission(text)', 'EXECUTE'), ''
  union all
  select 'public catalog still readable by signed-out visitors (first visit)',
         not exists (select 1 from unnest(array['public.v_catalog_cards', 'public.wine_vintages', 'public.wine_reference_values', 'public.flavor_varietals',
                                               'public.flavor_regions', 'public.grape_aliases', 'public.producer_aliases', 'public.producers',
                                               'public.place_designation_rules', 'public.broad_places']) t
                      where to_regclass(t) is not null and not has_table_privilege('anon', to_regclass(t), 'SELECT')),
         coalesce((select string_agg(t, ', ') from unnest(array['public.v_catalog_cards', 'public.wine_vintages', 'public.wine_reference_values', 'public.flavor_varietals',
                                               'public.flavor_regions', 'public.grape_aliases', 'public.producer_aliases', 'public.producers',
                                               'public.place_designation_rules', 'public.broad_places']) t
                    where to_regclass(t) is not null and not has_table_privilege('anon', to_regclass(t), 'SELECT')), '')
  union all
  select 'future tables of postgres: anon gets SELECT only; no TRUNCATE/REFERENCES/TRIGGER for anyone browsing',
         not exists (select 1 from pg_default_acl d, aclexplode(d.defaclacl) a
                      where d.defaclrole = 'postgres'::regrole and d.defaclnamespace = 'public'::regnamespace and d.defaclobjtype = 'r'
                        and ((a.grantee = 'anon'::regrole and a.privilege_type <> 'SELECT')
                             or (a.grantee = 'authenticated'::regrole and a.privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN')))), ''
  union all
  select 'future sequences of postgres: anon none; signed-in users no UPDATE',
         not exists (select 1 from pg_default_acl d, aclexplode(d.defaclacl) a
                      where d.defaclrole = 'postgres'::regrole and d.defaclnamespace = 'public'::regnamespace and d.defaclobjtype = 'S'
                        and (a.grantee = 'anon'::regrole or (a.grantee = 'authenticated'::regrole and a.privilege_type = 'UPDATE'))), ''
  union all
  select 'the sign-up trigger on auth.users is still there',
         exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal and p.proname = 'handle_new_user'), ''
  union all
  select '(information only) staff roles in use, with how many people hold each', true,
         (select string_agg(coalesce(staff_role, '-') || ':' || n, ', ') from (select staff_role, count(*) n from public.profiles group by 1) x)
)
select case when ok then 'PASS' else 'FAIL' end as result, name as check_name, detail from checks order by ok, name;

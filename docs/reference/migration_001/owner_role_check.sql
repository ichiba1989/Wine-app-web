-- OWNER ROLE CHECK (READ-ONLY). Phase 2.0B.3 correction 5, 2026-10-27. NOT RUN ON THE LIVE DATABASE BY CLAUDE.
--
-- Purpose: before migration 001 runs live, the owner reads how the live database decides who is the Owner, because the Owner approval
-- override in public.ref_review trusts public.my_staff_role_code(). The definition is not in the repository.
-- What it reads: the definitions of a NAMED list of role functions (and of functions attached as triggers to public.profiles); the
-- column and table privileges on public.profiles; its row-level security policies; the names (only) of other functions whose code
-- mentions staff_role; the role definitions in public.staff_roles; the user_role enum; and COUNTS of accounts per role (no ids, no names,
-- no emails). It changes nothing: one select, no insert, update, delete, create, alter, drop, grant or revoke.
-- How to run: Supabase, SQL Editor, New query, paste, Run, then Export / Download CSV and keep the file (it shows security details:
-- do not publish it). What to look for: docs/reference/migration_001/DESIGN.md, "Owner role verification".

with named(fn) as (values ('my_staff_role_code'), ('has_permission'), ('my_staff_access'), ('is_editor'), ('is_contributor'),
                          ('protect_profile_columns'), ('staff_set_role'), ('staff_remove'), ('handle_new_user')),
rows(section, item, detail) as (
  -- 1. The role functions themselves (full definitions of the named functions only).
  select '1 role function', p.proname || '(' || pg_catalog.oidvectortypes(p.proargtypes) || ')',
         'security=' || case when p.prosecdef then 'DEFINER' else 'invoker' end || '; config=' || coalesce(array_to_string(p.proconfig, ','), '') ||
         E'\n' || pg_catalog.pg_get_functiondef(p.oid)
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in (select fn from named)
  union all
  -- 2. Triggers on public.profiles and the definitions of their functions (these could change role or staff_role).
  select '2 profiles trigger', t.tgname, pg_catalog.pg_get_triggerdef(t.oid) || E'\n' || pg_catalog.pg_get_functiondef(t.tgfoid)
    from pg_catalog.pg_trigger t where t.tgrelid = 'public.profiles'::regclass and not t.tgisinternal
  union all
  -- 3. Column-level privileges on public.profiles for the browser's roles (role and staff_role must NOT be updatable by them).
  select '3 profiles column grant', c.grantee || ' ' || c.privilege_type, string_agg(c.column_name, ', ' order by c.column_name)
    from information_schema.column_privileges c
   where c.table_schema = 'public' and c.table_name = 'profiles' and c.grantee in ('anon', 'authenticated', 'PUBLIC')
     and c.privilege_type in ('INSERT', 'UPDATE')
   group by c.grantee, c.privilege_type
  union all
  -- 4. Table-level privileges on public.profiles.
  select '4 profiles table grant', g.grantee, string_agg(g.privilege_type, ',' order by g.privilege_type)
    from information_schema.role_table_grants g
   where g.table_schema = 'public' and g.table_name = 'profiles' and g.grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')
   group by g.grantee
  union all
  -- 5. Row-level security on public.profiles.
  select '5 profiles rls', 'enabled=' || c.relrowsecurity || ' forced=' || c.relforcerowsecurity, ''
    from pg_catalog.pg_class c where c.oid = 'public.profiles'::regclass
  union all
  select '5 profiles policy', p.policyname, 'roles=' || array_to_string(p.roles, ',') || '; command=' || p.cmd ||
         '; using=' || coalesce(p.qual, '') || '; with_check=' || coalesce(p.with_check, '')
    from pg_catalog.pg_policies p where p.schemaname = 'public' and p.tablename = 'profiles'
  union all
  -- 6. Other functions whose code mentions staff_role or profiles.role (names and security only; their bodies are not read here).
  select '6 other function mentioning staff_role', n.nspname || '.' || p.proname || '(' || pg_catalog.oidvectortypes(p.proargtypes) || ')',
         'security=' || case when p.prosecdef then 'DEFINER' else 'invoker' end || '; execute_acl=' || coalesce(p.proacl::text, 'default')
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private') and p.proname not in (select fn from named)
     and (p.prosrc ilike '%staff_role%' or p.prosrc ilike '%''admin''%')
  union all
  -- 7. Role definitions and the legacy enum.
  select '7 staff role', r.code, array_to_string(r.permissions, ', ') from public.staff_roles r
  union all
  select '7 enum user_role', '', string_agg(e.enumlabel, ', ' order by e.enumsortorder)
    from pg_catalog.pg_enum e join pg_catalog.pg_type t on t.oid = e.enumtypid where t.typname = 'user_role'
  union all
  -- 8. How many accounts hold each role (counts only).
  select '8 accounts per role', coalesce(pr.staff_role, '(none)') || ' / role=' || pr.role::text, count(*)::text
    from public.profiles pr group by pr.staff_role, pr.role
)
select section, item, detail from rows order by section, item;

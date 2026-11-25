-- READ-ONLY privilege inventory for the browser roles (Phase 2.0B.6, 2026-11-01). Safe to run on the live database: it only reads the
-- system catalogs and changes nothing. Run it in the Supabase SQL editor before and after anon_hardening_up.sql and keep the result
-- PRIVATE (it describes the database's permissions). The tests run it on the disposable local stack and compare the results.
-- Effective privileges are reported (has_*_privilege), so a grant through PUBLIC or through role membership is counted too.
-- Columns: section | object | role | privileges | note

with roles(r) as (values ('anon'), ('authenticated')),
rels as (
  select c.oid, c.relname, c.relkind from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
     and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')),   -- not extension-owned
rel_privs as (
  select r.relname, ro.r as role, r.relkind,
         array_to_string(array_remove(array[
           case when has_table_privilege(ro.r, r.oid, 'SELECT') then 'SELECT' end,
           case when has_table_privilege(ro.r, r.oid, 'INSERT') then 'INSERT' end,
           case when has_table_privilege(ro.r, r.oid, 'UPDATE') then 'UPDATE' end,
           case when has_table_privilege(ro.r, r.oid, 'DELETE') then 'DELETE' end,
           case when has_table_privilege(ro.r, r.oid, 'TRUNCATE') then 'TRUNCATE' end,
           case when has_table_privilege(ro.r, r.oid, 'REFERENCES') then 'REFERENCES' end,
           case when has_table_privilege(ro.r, r.oid, 'TRIGGER') then 'TRIGGER' end,
           case when current_setting('server_version_num')::int >= 170000 and has_table_privilege(ro.r, r.oid, 'MAINTAIN') then 'MAINTAIN' end], null), ',') as privs,
         (select relrowsecurity from pg_class where oid = r.oid) as rls
    from rels r cross join roles ro),
prof_cols as (
  select a.attname, ro.r as role,
         array_to_string(array_remove(array[
           case when has_column_privilege(ro.r, 'public.profiles'::regclass, a.attnum, 'SELECT') then 'SELECT' end,
           case when has_column_privilege(ro.r, 'public.profiles'::regclass, a.attnum, 'INSERT') then 'INSERT' end,
           case when has_column_privilege(ro.r, 'public.profiles'::regclass, a.attnum, 'UPDATE') then 'UPDATE' end,
           case when has_column_privilege(ro.r, 'public.profiles'::regclass, a.attnum, 'REFERENCES') then 'REFERENCES' end], null), ',') as privs
    from pg_attribute a cross join roles ro
   where to_regclass('public.profiles') is not null and a.attrelid = to_regclass('public.profiles') and a.attnum > 0 and not a.attisdropped),
funcs as (
  select p.oid, p.oid::regprocedure::text as sig, p.prosecdef, p.prorettype = 'trigger'::regtype as is_trigger
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')),
seqs as (
  select c.oid, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'S')
select 'A table/view' as section, relname as object, role, coalesce(nullif(privs, ''), '-') as privileges,
       case relkind when 'v' then 'view' when 'm' then 'materialized view' else case when rls then 'rls on' else 'RLS OFF' end end as note
  from rel_privs
union all
select 'B profiles column', attname, role, coalesce(nullif(privs, ''), '-'), '' from prof_cols
union all
select 'C function', f.sig, ro.r, case when has_function_privilege(ro.r, f.oid, 'EXECUTE') then 'EXECUTE' else '-' end,
       case when f.is_trigger then 'trigger function' when f.prosecdef then 'security definer' else 'security invoker' end
  from funcs f cross join roles ro
union all
select 'D sequence', s.relname, ro.r,
       coalesce(nullif(array_to_string(array_remove(array[
         case when has_sequence_privilege(ro.r, s.oid, 'USAGE') then 'USAGE' end,
         case when has_sequence_privilege(ro.r, s.oid, 'SELECT') then 'SELECT' end,
         case when has_sequence_privilege(ro.r, s.oid, 'UPDATE') then 'UPDATE' end], null), ','), ''), '-'), ''
  from seqs s cross join roles ro
union all
select 'E policy on profiles', pol.polname, coalesce(array_to_string(array(select rolname from pg_roles where oid = any (pol.polroles)), ','), 'PUBLIC'),
       case pol.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT' when 'w' then 'UPDATE' when 'd' then 'DELETE' else 'ALL' end,
       'using: ' || coalesce(pg_get_expr(pol.polqual, pol.polrelid), '-') || ' / check: ' || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '-')
  from pg_policy pol where to_regclass('public.profiles') is not null and pol.polrelid = to_regclass('public.profiles')
union all
select 'F sign-up trigger', t.tgname, '-', p.oid::regprocedure::text,
       case when p.prosecdef then 'security definer' else 'security invoker (needs the auth service role to hold INSERT on profiles)' end
  from pg_trigger t join pg_proc p on p.oid = t.tgfoid where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal
union all
select 'G default privileges', coalesce(n.nspname, '<all schemas>') || ' / for role ' || pg_get_userbyid(d.defaclrole) || ' / ' ||
       case d.defaclobjtype when 'r' then 'tables' when 'S' then 'sequences' when 'f' then 'functions' when 'T' then 'types' else d.defaclobjtype::text end,
       x.grantee_name, string_agg(x.privilege_type, ',' order by x.privilege_type), ''
  from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace
  cross join lateral (select case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as grantee_name, a.privilege_type from aclexplode(d.defaclacl) a) x
 where (n.nspname is null or n.nspname = 'public') and x.grantee_name in ('anon', 'authenticated', 'PUBLIC')
 group by 1, 2, 3
union all
select 'I schema private', coalesce((select 'exists, owner ' || pg_get_userbyid(nspowner) from pg_namespace where nspname = 'private'), 'absent'), ro.r,
       case when to_regnamespace('private') is null then '-'
            else coalesce(nullif(concat_ws(',', case when has_schema_privilege(ro.r, 'private', 'USAGE') then 'USAGE' end,
                                                case when has_schema_privilege(ro.r, 'private', 'CREATE') then 'CREATE' end), ''), '-') end, ''
  from roles ro
union all
select 'H hardening backup', 'private.anon_hardening_backup', '-',
       case when to_regclass('private.anon_hardening_backup') is null then 'absent' else 'present' end, 'present = anon_hardening_up.sql has been applied'
order by 1, 2, 3;

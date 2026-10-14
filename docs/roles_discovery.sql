-- STEP 1 of the roles update (docs/ROLES_AND_ACCESS.md). READ-ONLY: every statement here is a select, nothing is changed.
-- Run each block in the Supabase SQL editor and send the results back, so the roles script (roles_proposal.sql) can be written against
-- what the database really has. The staff tables and functions were created outside this repository (database update 13), so nobody
-- here has seen them.

-- 1. The functions the app calls for access, written out in full.
select p.proname, pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('my_staff_access', 'has_permission', 'wine_delete_check', 'delete_wine_vintage', 'my_import_allowance', 'legend_candidates');

-- 2. Every table that looks like it holds staff, roles or permissions, with its columns.
select c.table_name, c.column_name, c.data_type, c.is_nullable
from information_schema.columns c
where c.table_schema = 'public'
  and (c.table_name ilike '%staff%' or c.table_name ilike '%role%' or c.table_name ilike '%permission%')
order by c.table_name, c.ordinal_position;

-- 3. What is in them (names, not secrets). Replace the table names with what query 2 shows if they differ.
-- select * from public.staff_roles limit 50;
-- select * from public.role_permissions limit 100;

-- 4. Every security rule that asks has_permission(...), with the permission it asks for.
select schemaname, tablename, policyname, cmd, qual, with_check
from pg_policies
where coalesce(qual, '') ilike '%has_permission%' or coalesce(with_check, '') ilike '%has_permission%'
order by tablename, policyname;

-- 5. Every permission name used anywhere in those rules and functions (the closed list the app should know).
select distinct m[1] as permission
from (
  select regexp_matches(coalesce(qual, '') || ' ' || coalesce(with_check, ''), 'has_permission\(''([a-z_]+)''', 'g') as m from pg_policies
  union all
  select regexp_matches(pg_get_functiondef(p.oid), 'has_permission\(''([a-z_]+)''', 'g') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
) t
order by 1;

-- 6. How the profile table marks roles and plans today (counts only, no names).
select role, staff_role, tier, count(*) from public.profiles group by 1, 2, 3 order by 4 desc;

-- 7. The app_config rows that matter for plans and imports.
select key, value, note from public.app_config where key in ('plan_switch_open', 'import_limit_regular', 'import_limit_extended', 'import_window_hours');

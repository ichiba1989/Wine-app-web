-- ONE-QUERY version of docs/roles_discovery.sql. READ-ONLY (a single select, nothing is changed).
-- Paste it in the Supabase SQL editor, press Run, and copy the one cell it returns ("result") back to the chat.
-- It contains: the text of the access functions, the staff/role/permission tables and their rows (user ids only, no emails),
-- every security rule that uses has_permission, how profiles mark roles and plans, and the related app_config rows.
select jsonb_pretty(jsonb_build_object(
  'functions', (
    select coalesce(jsonb_agg(jsonb_build_object('name', p.proname, 'definition', pg_get_functiondef(p.oid))), '[]'::jsonb)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('my_staff_access', 'has_permission', 'wine_delete_check', 'delete_wine_vintage', 'my_import_allowance', 'legend_candidates')
  ),
  'staff_tables', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'table', t.table_name,
      'columns', (select jsonb_agg(c.column_name || ' ' || c.data_type order by c.ordinal_position) from information_schema.columns c where c.table_schema = 'public' and c.table_name = t.table_name),
      'rows', left(query_to_xml(format('select * from public.%I limit 60', t.table_name), true, false, '')::text, 6000)
    )), '[]'::jsonb)
    from information_schema.tables t
    where t.table_schema = 'public' and t.table_type = 'BASE TABLE'
      and (t.table_name ilike '%staff%' or t.table_name ilike '%role%' or t.table_name ilike '%permission%')
  ),
  'policies_using_has_permission', (
    select coalesce(jsonb_agg(jsonb_build_object('table', tablename, 'policy', policyname, 'cmd', cmd, 'using', qual, 'check', with_check)), '[]'::jsonb)
    from pg_policies
    where coalesce(qual, '') ilike '%has_permission%' or coalesce(with_check, '') ilike '%has_permission%'
  ),
  'profile_roles_and_tiers', (
    select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
    from (select role, staff_role, tier, count(*) as people from public.profiles group by 1, 2, 3 order by 4 desc) x
  ),
  'app_config_related', (
    select coalesce(jsonb_agg(jsonb_build_object('key', key, 'value', value)), '[]'::jsonb)
    from public.app_config
    where key in ('plan_switch_open', 'import_limit_regular', 'import_limit_extended', 'import_window_hours')
  )
)) as result;

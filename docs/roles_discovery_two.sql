-- SECOND discovery query for the roles update (docs/ROLES_AND_ACCESS.md). READ-ONLY: one select, nothing is changed.
-- The first query showed that staff_roles holds the role DEFINITIONS (editor, quiz_reviewer, owner and their permissions) and that
-- my_staff_access finds a person's role through my_staff_role_code(). This one reads that function and how profiles store a person's
-- role and plan, so the Roles tab can write to the right place.
select jsonb_pretty(jsonb_build_object(
  'functions', (
    select coalesce(jsonb_agg(jsonb_build_object('name', p.proname, 'definition', pg_get_functiondef(p.oid))), '[]'::jsonb)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('my_staff_role_code', 'is_editor', 'is_owner', 'is_admin', 'my_import_limit', 'cfg_number', 'protect_profile_columns')
  ),
  'feature_access', (select coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb) from public.feature_access f),
  'profile_columns', (
    select coalesce(jsonb_agg(c.column_name || ' ' || c.data_type || coalesce(' default ' || c.column_default, '') order by c.ordinal_position), '[]'::jsonb)
    from information_schema.columns c where c.table_schema = 'public' and c.table_name = 'profiles'
  ),
  'profile_constraints', (
    select coalesce(jsonb_agg(jsonb_build_object('name', conname, 'definition', pg_get_constraintdef(oid))), '[]'::jsonb)
    from pg_constraint where conrelid = 'public.profiles'::regclass
  ),
  'profile_triggers', (
    select coalesce(jsonb_agg(jsonb_build_object('name', tgname, 'definition', pg_get_triggerdef(oid))), '[]'::jsonb)
    from pg_trigger where tgrelid = 'public.profiles'::regclass and not tgisinternal
  ),
  'profile_policies', (
    select coalesce(jsonb_agg(jsonb_build_object('policy', policyname, 'cmd', cmd, 'using', qual, 'check', with_check)), '[]'::jsonb)
    from pg_policies where schemaname = 'public' and tablename = 'profiles'
  )
)) as result;

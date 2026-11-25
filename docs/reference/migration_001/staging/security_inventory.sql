-- STAGING ONLY, read-only. What migration 001 left behind on the local Supabase database: ownership, row-level security, grants to the
-- browser roles, function settings, and the default privileges that could hand new objects to anon/authenticated.
select 'default acl' as what, coalesce(n.nspname, '<all schemas>') || ' / ' || pg_get_userbyid(d.defaclrole) || ' / ' || d.defaclobjtype::text || ' / ' || d.defaclacl::text
  from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace
 where n.nspname is null or n.nspname in ('public', 'wine_reference')
union all
select 'schema', n.nspname || ' owner=' || pg_get_userbyid(n.nspowner) || ' acl=' || coalesce(n.nspacl::text, 'default') from pg_namespace n where n.nspname = 'wine_reference'
union all
select 'tables', count(*) || ' tables; owner(s)=' || string_agg(distinct pg_get_userbyid(c.relowner), ',') || '; rls on=' || count(*) filter (where c.relrowsecurity)
       || '; forced=' || count(*) filter (where c.relforcerowsecurity) || '; policies=' || (select count(*) from pg_policies where schemaname = 'wine_reference')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'wine_reference' and c.relkind = 'r'
union all
select 'views', string_agg(c.relname || ' owner=' || pg_get_userbyid(c.relowner) || ' opts=' || coalesce(array_to_string(c.reloptions, ','), '-'), '; ')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'wine_reference' and c.relkind = 'v'
union all
select 'table grants to browser roles', coalesce(string_agg(distinct grantee || ':' || privilege_type, ','), 'none')
  from information_schema.role_table_grants where table_schema = 'wine_reference' and grantee in ('anon', 'authenticated', 'PUBLIC', 'service_role')
union all
select 'sequences', count(*)::text from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'wine_reference' and c.relkind = 'S'
union all
select 'function', n.nspname || '.' || p.oid::regprocedure::text || ' owner=' || pg_get_userbyid(p.proowner) || ' definer=' || p.prosecdef
       || ' config=' || coalesce(array_to_string(p.proconfig, ','), '-') || ' acl=' || coalesce(p.proacl::text, 'default')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'wine_reference' or (n.nspname = 'public' and p.proname like 'ref\_%')
union all
select 'execute by anon', coalesce(string_agg(p.oid::regprocedure::text, ', '), 'none') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where (n.nspname = 'wine_reference' or (n.nspname = 'public' and p.proname like 'ref\_%')) and has_function_privilege('anon', p.oid, 'execute')
union all
select 'execute by authenticated', coalesce(string_agg(p.oid::regprocedure::text, ', '), 'none') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where (n.nspname = 'wine_reference' or (n.nspname = 'public' and p.proname like 'ref\_%')) and has_function_privilege('authenticated', p.oid, 'execute')
union all
select 'schema usage', 'anon=' || has_schema_privilege('anon', 'wine_reference', 'usage') || ' authenticated=' || has_schema_privilege('authenticated', 'wine_reference', 'usage')
       || ' service_role=' || has_schema_privilege('service_role', 'wine_reference', 'usage') || ' authenticator=' || has_schema_privilege('authenticator', 'wine_reference', 'usage')
union all
select 'bypassrls roles', string_agg(rolname, ',' order by rolname) from pg_roles where rolbypassrls
union all
select 'event triggers', string_agg(evtname || '(' || evtevent || ')', ', ' order by evtname) from pg_event_trigger
order by 1, 2;

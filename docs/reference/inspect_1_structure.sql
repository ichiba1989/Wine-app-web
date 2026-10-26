-- READ-ONLY INSPECTION, PART 1 OF 2: the database's STRUCTURE (metadata only). Wine Education Master Reference, Phase 2.0B.1 (2026-10-26).
--
-- What it does: ONE select statement that lists how the database is built, as rows of four text columns
-- (section, schema_name, object_name, detail). It reads only PostgreSQL's own catalog (pg_catalog, information_schema).
-- It reads NO rows of any app table: no journals, tastings, swipes, profiles, emails, sign-ins or photos.
-- It changes nothing: there is no insert, update, delete, create, alter, drop, grant or revoke in this file.
-- Function BODIES are not read (a body could hold a key someone pasted in); only names, arguments, return types and security settings.
-- Database settings are not read, except the one setting that says which schemas the API serves (pgrst.db_schemas).
--
-- How to run: Supabase, SQL Editor, New query, paste this whole file, Run. Then download the result as CSV
-- (the download button above the results) and send the file back. Steps and what to expect: docs/reference/INSPECTION.md.
-- If the result is too big to show, change the last line's filter to one section at a time, e.g. where section = '03 columns'.
--
-- Which schemas get the full detail: every schema except PostgreSQL's own and Supabase's internal ones (listed in app_schemas below).
-- Section 01 still lists every schema by name, so nothing is hidden.

with app_schemas as (
  select n.oid, n.nspname
  from pg_namespace n
  where n.nspname not like 'pg\_%'
    and n.nspname not in ('information_schema', 'auth', 'storage', 'realtime', '_realtime', 'extensions', 'graphql', 'graphql_public',
                          'vault', 'pgsodium', 'pgsodium_masks', 'supabase_functions', 'supabase_migrations', 'net', 'cron',
                          'pgbouncer', '_analytics', 'pgtle')
),
-- Objects that belong to an installed extension (left out of the detail; the extensions themselves are listed in section 13).
ext_objects as (
  select d.objid, d.classid from pg_depend d where d.deptype = 'e'
),
all_rows as (

  -- 01 Every schema, with how many tables, views and functions it holds.
  select '01 schemas' as section, n.nspname::text as schema_name, ''::text as object_name,
         format('owner=%s; tables=%s; views=%s; functions=%s; detail_below=%s',
                pg_get_userbyid(n.nspowner),
                (select count(*) from pg_class c where c.relnamespace = n.oid and c.relkind in ('r', 'p')),
                (select count(*) from pg_class c where c.relnamespace = n.oid and c.relkind in ('v', 'm')),
                (select count(*) from pg_proc p where p.pronamespace = n.oid),
                case when n.oid in (select oid from app_schemas) then 'yes' else 'no' end) as detail
  from pg_namespace n
  where n.nspname not like 'pg\_%' and n.nspname <> 'information_schema'

  union all
  -- 02 Tables: kind, row-level security on/forced, estimated row count (the planner's estimate, not a count of anyone's rows), comment.
  select '02 tables', s.nspname, c.relname,
         format('kind=%s; rls_enabled=%s; rls_forced=%s; estimated_rows=%s; comment=%s',
                case c.relkind when 'p' then 'partitioned table' else 'table' end,
                c.relrowsecurity, c.relforcerowsecurity, greatest(c.reltuples, 0)::bigint,
                coalesce(obj_description(c.oid, 'pg_class'), ''))
  from pg_class c join app_schemas s on s.oid = c.relnamespace
  where c.relkind in ('r', 'p')

  union all
  -- 03 Columns of tables and views: position, type, null or not, default, identity or generated.
  select '03 columns', s.nspname, c.relname || '.' || a.attname,
         format('#%s; type=%s; %s; default=%s%s%s',
                a.attnum, format_type(a.atttypid, a.atttypmod),
                case when a.attnotnull then 'not null' else 'null allowed' end,
                coalesce(pg_get_expr(ad.adbin, ad.adrelid), ''),
                case when a.attidentity <> '' then '; identity=' || a.attidentity::text else '' end,
                case when a.attgenerated <> '' then '; generated' else '' end)
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join app_schemas s on s.oid = c.relnamespace
  left join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum
  where a.attnum > 0 and not a.attisdropped and c.relkind in ('r', 'p', 'v', 'm', 'f')

  union all
  -- 04 Constraints: primary keys (p), unique (u), foreign keys (f), checks (c), exclusions (x), with their full definition.
  select '04 constraints', s.nspname, c.relname || '.' || con.conname,
         format('type=%s; %s', con.contype, pg_get_constraintdef(con.oid, true))
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  join app_schemas s on s.oid = c.relnamespace

  union all
  -- 05 Indexes, with their definition.
  select '05 indexes', s.nspname, c.relname || '.' || ic.relname,
         format('unique=%s; primary=%s; %s', i.indisunique, i.indisprimary, pg_get_indexdef(i.indexrelid))
  from pg_index i
  join pg_class c on c.oid = i.indrelid
  join pg_class ic on ic.oid = i.indexrelid
  join app_schemas s on s.oid = c.relnamespace

  union all
  -- 06 Row-level security policies: who they apply to, which command, and the rule itself.
  select '06 rls policies', p.schemaname::text, p.tablename || '.' || p.policyname,
         format('permissive=%s; roles=%s; command=%s; using=%s; with_check=%s',
                p.permissive, array_to_string(p.roles, ','), p.cmd, coalesce(p.qual, ''), coalesce(p.with_check, ''))
  from pg_policies p
  where p.schemaname in (select nspname from app_schemas)

  union all
  -- 07 Functions: signature, return type, language, SECURITY DEFINER or INVOKER, volatility, search_path, who may run them. NO bodies.
  select '07 functions', s.nspname, pr.proname || '(' || pg_get_function_identity_arguments(pr.oid) || ')',
         format('returns=%s; language=%s; security=%s; volatility=%s; kind=%s; search_path=%s; execute_acl=%s',
                pg_get_function_result(pr.oid), l.lanname,
                case when pr.prosecdef then 'DEFINER' else 'invoker' end,
                case pr.provolatile when 'i' then 'immutable' when 's' then 'stable' else 'volatile' end,
                case pr.prokind when 'f' then 'function' when 'p' then 'procedure' when 'a' then 'aggregate' when 'w' then 'window' end,
                coalesce((select string_agg(cfg, ',') from unnest(pr.proconfig) cfg where cfg like 'search\_path=%'), ''),
                coalesce(pr.proacl::text, 'default'))
  from pg_proc pr
  join app_schemas s on s.oid = pr.pronamespace
  join pg_language l on l.oid = pr.prolang
  where not exists (select 1 from ext_objects e where e.objid = pr.oid and e.classid = 'pg_proc'::regclass)

  union all
  -- 08 Triggers (not the internal ones PostgreSQL makes for foreign keys), with their definition.
  select '08 triggers', s.nspname, c.relname || '.' || t.tgname,
         format('enabled=%s; %s', t.tgenabled, pg_get_triggerdef(t.oid, true))
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join app_schemas s on s.oid = c.relnamespace
  where not t.tgisinternal

  union all
  -- 09 Views and materialized views: options (security_invoker) and the definition (the SELECT the view runs).
  select '09 views', s.nspname, c.relname,
         format('kind=%s; options=%s; definition=%s',
                case c.relkind when 'm' then 'materialized view' else 'view' end,
                coalesce(array_to_string(c.reloptions, ','), ''),
                regexp_replace(pg_get_viewdef(c.oid, true), '\s+', ' ', 'g'))
  from pg_class c join app_schemas s on s.oid = c.relnamespace
  where c.relkind in ('v', 'm')
    and not exists (select 1 from ext_objects e where e.objid = c.oid and e.classid = 'pg_class'::regclass)

  union all
  -- 10 View dependencies: which tables and views each view reads.
  select distinct '10 view dependencies', vs.nspname, vc.relname,
         'reads ' || rn.nspname || '.' || rc.relname || ' (' || case rc.relkind when 'v' then 'view' when 'm' then 'materialized view' else 'table' end || ')'
  from pg_rewrite rw
  join pg_class vc on vc.oid = rw.ev_class
  join app_schemas vs on vs.oid = vc.relnamespace
  join pg_depend d on d.objid = rw.oid and d.classid = 'pg_rewrite'::regclass and d.refclassid = 'pg_class'::regclass
  join pg_class rc on rc.oid = d.refobjid
  join pg_namespace rn on rn.oid = rc.relnamespace
  where rc.oid <> vc.oid and vc.relkind in ('v', 'm')

  union all
  -- 11 Enumerated types (lists of allowed words, such as basis_kind or verification_status), with their values in order.
  select '11 enum types', s.nspname, t.typname,
         string_agg(e.enumlabel, ', ' order by e.enumsortorder)
  from pg_type t
  join app_schemas s on s.oid = t.typnamespace
  join pg_enum e on e.enumtypid = t.oid
  group by s.nspname, t.typname

  union all
  -- 12 What the browser's roles may do on each table and view (anon = before sign-in, authenticated = signed in, incl. guests).
  select '12 table grants', g.table_schema::text, g.table_name || ' -> ' || g.grantee,
         string_agg(g.privilege_type, ',' order by g.privilege_type)
  from information_schema.role_table_grants g
  where g.table_schema in (select nspname from app_schemas)
    and g.grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')
  group by g.table_schema, g.table_name, g.grantee

  union all
  -- 13 Installed extensions (for example pg_trgm or unaccent, which matter for search).
  select '13 extensions', n.nspname, x.extname, 'version=' || x.extversion
  from pg_extension x join pg_namespace n on n.oid = x.extnamespace

  union all
  -- 14 Which schemas the Supabase API serves to the browser. Only this one setting is read; nothing else from role settings.
  select '14 api exposed schemas', '', r.rolname, cfg
  from pg_db_role_setting rs
  join pg_roles r on r.oid = rs.setrole
  cross join lateral unnest(rs.setconfig) cfg
  where r.rolname = 'authenticator' and cfg like 'pgrst.db\_schemas=%'

  union all
  -- 15 Default privileges: what new tables, views and functions automatically grant, per schema (important before adding any table).
  select '15 default privileges', coalesce(n.nspname, '(all schemas)'), pg_get_userbyid(da.defaclrole) || ' creates ' ||
         case da.defaclobjtype when 'r' then 'tables' when 'S' then 'sequences' when 'f' then 'functions' when 'T' then 'types' when 'n' then 'schemas' end,
         coalesce(da.defaclacl::text, '')
  from pg_default_acl da
  left join pg_namespace n on n.oid = da.defaclnamespace

  union all
  -- 16 Schema-level permissions: who may use each schema at all.
  select '16 schema grants', n.nspname, '', coalesce(n.nspacl::text, 'default')
  from pg_namespace n
  where n.oid in (select oid from app_schemas)

  union all
  -- 17 Database roles that are not PostgreSQL's own (names and powers only; no passwords are read: pg_roles never shows them).
  select '17 database roles', '', r.rolname,
         format('login=%s; superuser=%s; bypass_rls=%s; create_role=%s; member_of=%s', r.rolcanlogin, r.rolsuper, r.rolbypassrls, r.rolcreaterole,
                coalesce((select string_agg(g.rolname, ',') from pg_auth_members m join pg_roles g on g.oid = m.roleid where m.member = r.oid), ''))
  from pg_roles r
  where r.rolname not like 'pg\_%'

  union all
  -- 18 Storage buckets: names and whether they are public (bucket settings only; no file is listed).
  select '18 storage buckets', 'storage', b.id::text, format('name=%s; public=%s', b.name, b.public)
  from storage.buckets b
)
select section, schema_name, object_name, detail
from all_rows
where section like '%'          -- to run one section at a time: where section = '03 columns'
order by section, schema_name, object_name, detail;

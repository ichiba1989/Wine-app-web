-- ANONYMOUS-ACCESS AND PRIVILEGE HARDENING, FINAL (release 2, 2026-11-08; Phase 2.0B.6 implementation). Tested on a disposable local
-- Supabase stack (docs/security/ANON_HARDENING_CHANGE_REPORT.md). Run it ONLY after the owner's written approval, in the Supabase SQL
-- editor (role postgres), in one go: steps in docs/security/DEPLOY.md. Undo: anon_hardening_rollback.sql (restores the exact grants saved
-- here). Grants only: no table, row, policy or function body is created, changed or removed in the app's schema.
--
-- Who is who. "anon" is a visitor who has NOT signed in. Guests are NOT anon: the app signs every visitor in anonymously at once
-- (data.js ensureUser) and a guest's requests use "authenticated", like a member's. anon only does the first visit's public catalog reads
-- before that sign-in (app.js startEarlyLoads) and nothing else; this script keeps exactly what those reads need.
--
-- What it changes
--   A. public.profiles: anon and PUBLIC lose every privilege. authenticated keeps SELECT (row security still limits rows) and UPDATE of
--      display_name, consent_version, consent_at, age_attested_at, age_attested_rule only (the columns the app writes); it loses INSERT,
--      DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN and table-wide UPDATE. Profiles are made by the sign-up trigger (owner's rights).
--   B. Every table and view in public that postgres controls: anon AND authenticated lose TRUNCATE, REFERENCES, TRIGGER and (PostgreSQL
--      17+) MAINTAIN. The API cannot issue them, the app never uses them, and row security does not apply to TRUNCATE.
--   F. Every sequence in public that postgres controls: anon loses USAGE, SELECT and UPDATE (it never inserts); authenticated loses
--      UPDATE (setval) and keeps USAGE and SELECT (needed for inserts into tables with serial ids).
--   C. Functions only signed-in people use (staff, plan, import, delete-my-data, guest merge, photos, legend, places, wine delete): anon
--      and PUBLIC lose EXECUTE; authenticated keeps it. Skipped (left as they are, and listed) when a policy, a view or a function anon can
--      still run mentions them: then a signed-out read could depend on them (has_permission is one: policies call it on every read).
--   D. Default privileges for objects created later in public, for role postgres: new tables give anon SELECT only (no INSERT, UPDATE,
--      DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN) and authenticated no TRUNCATE, REFERENCES, TRIGGER, MAINTAIN; new sequences give
--      anon nothing and authenticated USAGE and SELECT. The same is TRIED for role supabase_admin: the SQL editor's role is normally not
--      allowed to change supabase_admin's defaults; the result says whether it worked (if not, only Supabase support can change them).
-- Not changed: anon's SELECT on existing tables (public content; row security decides), anon's INSERT/UPDATE/DELETE on existing tables
-- other than profiles (row security protects them; ANON_ACCESS_AUDIT.md section 6), function default privileges (policy helpers need
-- them), objects owned by a role postgres cannot act for (listed), storage, auth, the private and wine_reference schemas.
-- A copy of every grant it changes is saved in private.anon_hardening_backup (owner only) on the first run. Safe to run again.

begin;

-- 0. Preflight: stop, changing nothing, unless what it relies on is there.
do $$
declare c text;
begin
  if to_regclass('public.profiles') is null then raise exception 'Preflight: public.profiles not found'; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') or not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise exception 'Preflight: the roles anon and authenticated must exist (this is meant for a Supabase database)';
  end if;
  if not pg_has_role(current_user, (select relowner from pg_class where oid = 'public.profiles'::regclass), 'USAGE') then
    raise exception 'Preflight: % does not own public.profiles; run this as the role the SQL editor uses (postgres)', current_user;
  end if;
  foreach c in array array['age_attested_at', 'age_attested_rule', 'consent_version', 'consent_at'] loop   -- the columns the app writes
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = c) then
      raise exception 'Preflight: public.profiles has no column %; the app writes it, so stop and check', c;
    end if;
  end loop;
end $$;

-- The signed-in-only functions of part C, by name (every overload). Names that do not exist are passed over.
create temporary table _c_names (name text primary key) on commit drop;
insert into _c_names values
  ('staff_list'), ('staff_set_role'), ('staff_remove'), ('set_my_plan'), ('my_staff_access'),
  ('my_import_allowance'), ('my_import_limit'),
  ('delete_my_account'), ('delete_my_journal_entry'), ('delete_my_photo'), ('delete_my_swipe'), ('delete_my_restaurant_visit'),
  ('record_reaction'), ('record_swipe'), ('prepare_guest_merge'), ('claim_guest_merge'),
  ('share_my_photo'), ('unshare_my_photo'), ('list_photo_submissions'), ('decide_photo_submission'),
  ('legend_candidates'), ('apply_place_fix'), ('fill_place_designation'),
  ('submitted_wine_rows'), ('wine_delete_check'), ('delete_wine_vintage'),
  ('techsheet_approve_candidate'), ('techsheet_confirm_by_rule'), ('techsheet_decide_suggestion'), ('techsheet_enter_fact'),
  ('techsheet_import'), ('techsheet_level'), ('techsheet_recheck_all'), ('techsheet_reject_candidate'), ('techsheet_remove_source'),
  ('techsheet_set_source'), ('techsheet_visible');

create temporary table _c_funcs on commit drop as
with cand as (
  select p.oid, p.proname, p.oid::regprocedure::text as sig, pg_has_role(current_user, p.proowner, 'USAGE') as controlled
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace join _c_names c on c.name = p.proname
   where n.nspname = 'public' and p.prokind = 'f' and p.prorettype <> 'trigger'::regtype
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')),
mentions as (
  select c.oid,
         (select string_agg(distinct 'policy ' || pol.polname || ' on ' || pol.polrelid::regclass::text, '; ')
            from pg_policy pol
           where coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') ~ ('\m' || c.proname || '\M')
              or coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') ~ ('\m' || c.proname || '\M')) as in_policy,
         (select string_agg(distinct 'view ' || v.oid::regclass::text, '; ')
            from pg_class v join pg_namespace vn on vn.oid = v.relnamespace
           where v.relkind in ('v', 'm') and vn.nspname not in ('pg_catalog', 'information_schema')
             and pg_get_viewdef(v.oid) ~ ('\m' || c.proname || '\M')) as in_view,
         (select string_agg(distinct 'function ' || o.oid::regprocedure::text, '; ')
            from pg_proc o join pg_namespace onn on onn.oid = o.pronamespace
           where onn.nspname = 'public' and o.oid <> c.oid and not o.prosecdef and o.prosrc ~ ('\m' || c.proname || '\M')
             and o.proname not in (select name from _c_names)) as in_invoker_fn
    from cand c)
select c.oid, c.sig,
       concat_ws('; ', case when not c.controlled then 'owned by a role postgres cannot act for' end, m.in_policy, m.in_view, m.in_invoker_fn) as blocked_by,
       has_function_privilege('authenticated', c.oid, 'EXECUTE') as auth_had
  from cand c join mentions m on m.oid = c.oid;

-- Tables, views and sequences in public: which ones postgres controls (the others are listed and left alone).
create temporary table _rels on commit drop as
select c.oid, c.oid::regclass::text as name, c.relkind, pg_has_role(current_user, c.relowner, 'USAGE') as controlled, pg_get_userbyid(c.relowner) as owner
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
   and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e');

-- 1. Backup (first run only): the grants this script changes, as they are now. The private schema is used as it is if it exists (its
--    own privileges are not touched); if it does not, it is created, with no access for the browser roles, and the rollback removes it.
do $$
begin
  if to_regnamespace('private') is null then
    create schema private;
    revoke all on schema private from public, anon, authenticated;
    create temporary table _created_private (x int) on commit drop;
  end if;
end $$;
create table if not exists private.anon_hardening_backup (
  id           bigint generated always as identity primary key,
  taken_at     timestamptz not null default now(),
  release      text not null default 'release 2 (2026-11-08)',
  part         text not null check (part in ('A', 'B', 'C', 'D', 'E', 'F')),
  object_kind  text not null check (object_kind in ('table', 'column', 'function', 'sequence', 'default', 'schema')),
  object_name  text not null,       -- a table or sequence (regclass text), a function (regprocedure text), 'postgres:r' (role:objtype) for D, 'private' for E
  column_name  text,
  grantee      text not null check (grantee in ('anon', 'authenticated', 'PUBLIC', '-')),
  privilege    text,                -- null = the grantee held none of the privileges this script changes there (marks the object as touched)
  grantable    boolean not null default false
);
revoke all on private.anon_hardening_backup from public, anon, authenticated, service_role;
comment on table private.anon_hardening_backup is 'Grants changed by docs/security/anon_hardening_up.sql, as they were before; read by anon_hardening_rollback.sql.';

do $$
declare v17 boolean := current_setting('server_version_num')::int >= 170000;
        b_privs text[]; f_anon text[] := array['USAGE', 'SELECT', 'UPDATE']; d_tab_anon text[]; d_tab_auth text[];
begin
  b_privs := array['TRUNCATE', 'REFERENCES', 'TRIGGER'] || case when v17 then array['MAINTAIN'] else '{}'::text[] end;
  d_tab_anon := array['INSERT', 'UPDATE', 'DELETE'] || b_privs;
  d_tab_auth := b_privs;
  if exists (select 1 from private.anon_hardening_backup) then
    raise notice 'Backup already taken on %; it is kept as it is (the state before the first run).', (select min(taken_at) from private.anon_hardening_backup);
    return;
  end if;
  if to_regclass('pg_temp._created_private') is not null then
    insert into private.anon_hardening_backup (part, object_kind, object_name, grantee, privilege) values ('E', 'schema', 'private', '-', 'created by this script');
  end if;
  -- A: profiles, every table and column grant of anon, authenticated, PUBLIC
  insert into private.anon_hardening_backup (part, object_kind, object_name, column_name, grantee, privilege, grantable)
  select 'A', 'table', 'public.profiles', null, g.grantee, x.privilege_type, coalesce(x.is_grantable, false)
    from (values ('anon', 'anon'::regrole::oid), ('authenticated', 'authenticated'::regrole::oid), ('PUBLIC', 0::oid)) g(grantee, goid)
    left join lateral (select a.privilege_type, a.is_grantable from pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
                        where c.oid = 'public.profiles'::regclass and a.grantee = g.goid) x on true;
  insert into private.anon_hardening_backup (part, object_kind, object_name, column_name, grantee, privilege, grantable)
  select 'A', 'column', 'public.profiles', att.attname, case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end, a.privilege_type, a.is_grantable
    from pg_attribute att, aclexplode(att.attacl) a
   where att.attrelid = 'public.profiles'::regclass and att.attnum > 0 and not att.attisdropped and att.attacl is not null
     and (a.grantee = 0 or a.grantee in ('anon'::regrole, 'authenticated'::regrole));
  -- B: anon's and authenticated's TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on the other tables and views postgres controls
  insert into private.anon_hardening_backup (part, object_kind, object_name, grantee, privilege, grantable)
  select 'B', 'table', r.name, g.grantee, x.privilege_type, coalesce(x.is_grantable, false)
    from _rels r cross join (values ('anon', 'anon'::regrole::oid), ('authenticated', 'authenticated'::regrole::oid)) g(grantee, goid)
    left join lateral (select a.privilege_type, a.is_grantable from pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
                        where c.oid = r.oid and a.grantee = g.goid and a.privilege_type = any (b_privs)) x on true
   where r.relkind <> 'S' and r.controlled and r.oid <> 'public.profiles'::regclass;
  -- F: sequences: anon's USAGE, SELECT, UPDATE and authenticated's UPDATE
  insert into private.anon_hardening_backup (part, object_kind, object_name, grantee, privilege, grantable)
  select 'F', 'sequence', r.name, g.grantee, x.privilege_type, coalesce(x.is_grantable, false)
    from _rels r cross join (values ('anon', 'anon'::regrole::oid, f_anon), ('authenticated', 'authenticated'::regrole::oid, array['UPDATE'])) g(grantee, goid, privs)
    left join lateral (select a.privilege_type, a.is_grantable from pg_class c, aclexplode(coalesce(c.relacl, acldefault('s', c.relowner))) a
                        where c.oid = r.oid and a.grantee = g.goid and a.privilege_type = any (g.privs)) x on true
   where r.relkind = 'S' and r.controlled;
  -- C: EXECUTE of anon, authenticated, PUBLIC on the functions part C changes (null proacl = PostgreSQL's default: PUBLIC may execute)
  insert into private.anon_hardening_backup (part, object_kind, object_name, grantee, privilege, grantable)
  select 'C', 'function', f.sig, g.grantee, x.privilege_type, coalesce(x.is_grantable, false)
    from _c_funcs f join pg_proc p on p.oid = f.oid
    cross join (values ('anon', 'anon'::regrole::oid), ('authenticated', 'authenticated'::regrole::oid), ('PUBLIC', 0::oid)) g(grantee, goid)
    left join lateral (select a.privilege_type, a.is_grantable from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = g.goid) x on true
   where f.blocked_by = '';
  -- D: default privileges in public of postgres and supabase_admin, for tables (r) and sequences (S), for anon and authenticated
  insert into private.anon_hardening_backup (part, object_kind, object_name, grantee, privilege, grantable)
  select 'D', 'default', ro.rolname || ':' || t.objtype, g.grantee, x.privilege_type, coalesce(x.is_grantable, false)
    from (select rolname, oid from pg_roles where rolname in ('postgres', 'supabase_admin')) ro
    cross join (values ('r'), ('S')) t(objtype)
    cross join (values ('anon', 'anon'::regrole::oid), ('authenticated', 'authenticated'::regrole::oid)) g(grantee, goid)
    left join lateral (select a.privilege_type, a.is_grantable from pg_default_acl d, aclexplode(d.defaclacl) a
                        where d.defaclrole = ro.oid and d.defaclnamespace = 'public'::regnamespace and d.defaclobjtype = t.objtype::"char" and a.grantee = g.goid
                          and a.privilege_type = any (case when t.objtype = 'S' then (case when g.grantee = 'anon' then f_anon else array['UPDATE'] end)
                                                          else (case when g.grantee = 'anon' then d_tab_anon else d_tab_auth end) end)) x on true;
end $$;

-- 2. Part A: profiles.
revoke all on table public.profiles from anon;
revoke all on table public.profiles from public;
revoke insert, update, delete, truncate, references, trigger on table public.profiles from authenticated;   -- also clears column-level grants
grant select on table public.profiles to authenticated;
do $$
declare c text; v_cols text[] := '{}';
begin
  if current_setting('server_version_num')::int >= 170000 then execute 'revoke maintain on table public.profiles from authenticated'; end if;
  foreach c in array array['display_name', 'consent_version', 'consent_at', 'age_attested_at', 'age_attested_rule'] loop
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = c) then
      v_cols := v_cols || c;
    end if;
  end loop;
  execute format('grant update (%s) on table public.profiles to authenticated', (select string_agg(quote_ident(x), ', ') from unnest(v_cols) x));
end $$;

-- 3. Parts B and F: tables, views and sequences postgres controls.
do $$
declare r record; v_privs text := case when current_setting('server_version_num')::int >= 170000 then 'truncate, references, trigger, maintain' else 'truncate, references, trigger' end;
begin
  for r in select * from _rels where controlled loop
    if r.relkind = 'S' then
      execute format('revoke usage, select, update on sequence %s from anon', r.name);
      execute format('revoke update on sequence %s from authenticated', r.name);
    else
      execute format('revoke %s on table %s from anon, authenticated', v_privs, r.name);
    end if;
  end loop;
  for r in select * from _rels where not controlled loop
    raise notice 'Left as it is (owned by %, which postgres cannot act for): %', r.owner, r.name;
  end loop;
end $$;

-- 4. Part C: signed-in-only functions.
do $$
declare f record;
begin
  for f in select * from _c_funcs loop
    if f.blocked_by <> '' then
      raise notice 'Part C skipped % (%): left as it is', f.sig, f.blocked_by;
      continue;
    end if;
    execute format('revoke execute on function %s from public, anon', f.sig);
    if f.auth_had then execute format('grant execute on function %s to authenticated', f.sig); end if;
  end loop;
end $$;

-- 5. Part D: default privileges for objects created later in public.
create temporary table _d_result (role text primary key, result text) on commit drop;
do $$
declare ro text; v_extra text := case when current_setting('server_version_num')::int >= 170000 then ', maintain' else '' end;
begin
  foreach ro in array array['postgres', 'supabase_admin'] loop
    if not exists (select 1 from pg_roles where rolname = ro) then continue; end if;
    begin
      execute format('alter default privileges for role %I in schema public revoke insert, update, delete, truncate, references, trigger%s on tables from anon', ro, v_extra);
      execute format('alter default privileges for role %I in schema public revoke truncate, references, trigger%s on tables from authenticated', ro, v_extra);
      execute format('alter default privileges for role %I in schema public revoke usage, select, update on sequences from anon', ro);
      execute format('alter default privileges for role %I in schema public revoke update on sequences from authenticated', ro);
      insert into _d_result values (ro, 'changed');
    exception when insufficient_privilege then
      insert into _d_result values (ro, 'NOT CHANGED: ' || current_user || ' may not change this role''s default privileges (only Supabase support can)');
    end;
  end loop;
end $$;

-- 6. Postconditions: stop and undo everything (the transaction) if a target is not met.
do $$
declare p text; c text; f record; r record; v17 boolean := current_setting('server_version_num')::int >= 170000;
begin
  foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] || case when v17 then array['MAINTAIN'] else '{}'::text[] end loop
    if has_table_privilege('anon', 'public.profiles', p) then raise exception 'Postcondition: anon still has % on profiles', p; end if;
  end loop;
  if exists (select 1 from pg_attribute a where a.attrelid = 'public.profiles'::regclass and a.attnum > 0 and not a.attisdropped
              and (has_column_privilege('anon', 'public.profiles'::regclass, a.attnum, 'SELECT') or has_column_privilege('anon', 'public.profiles'::regclass, a.attnum, 'INSERT')
                   or has_column_privilege('anon', 'public.profiles'::regclass, a.attnum, 'UPDATE') or has_column_privilege('anon', 'public.profiles'::regclass, a.attnum, 'REFERENCES'))) then
    raise exception 'Postcondition: anon still holds a column privilege on profiles';
  end if;
  if not has_table_privilege('authenticated', 'public.profiles', 'SELECT') then raise exception 'Postcondition: authenticated lost SELECT on profiles'; end if;
  foreach p in array array['INSERT', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] || case when v17 then array['MAINTAIN'] else '{}'::text[] end loop
    if has_table_privilege('authenticated', 'public.profiles', p) then raise exception 'Postcondition: authenticated still has % on profiles', p; end if;
  end loop;
  foreach c in array array['id', 'role', 'staff_role', 'tier', 'created_at'] loop
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = c)
       and has_column_privilege('authenticated', 'public.profiles', c, 'UPDATE') then
      raise exception 'Postcondition: authenticated may still update profiles.%', c;
    end if;
  end loop;
  foreach c in array array['age_attested_at', 'age_attested_rule', 'consent_version', 'consent_at'] loop
    if not has_column_privilege('authenticated', 'public.profiles', c, 'UPDATE') then raise exception 'Postcondition: authenticated cannot update profiles.% (the app needs it)', c; end if;
  end loop;
  for r in select * from _rels where controlled loop
    if r.relkind = 'S' then
      if has_sequence_privilege('anon', r.oid, 'USAGE') or has_sequence_privilege('anon', r.oid, 'SELECT') or has_sequence_privilege('anon', r.oid, 'UPDATE')
         or has_sequence_privilege('authenticated', r.oid, 'UPDATE') then
        raise exception 'Postcondition: a browser role still holds a removed privilege on sequence %', r.name;
      end if;
    else
      foreach p in array array['TRUNCATE', 'REFERENCES', 'TRIGGER'] || case when v17 then array['MAINTAIN'] else '{}'::text[] end loop
        if has_table_privilege('anon', r.oid, p) or has_table_privilege('authenticated', r.oid, p) then
          raise exception 'Postcondition: a browser role still has % on %', p, r.name;
        end if;
      end loop;
    end if;
  end loop;
  for f in select * from _c_funcs where blocked_by = '' loop
    if has_function_privilege('anon', f.oid, 'EXECUTE') then raise exception 'Postcondition: anon may still execute %', f.sig; end if;
    if f.auth_had and not has_function_privilege('authenticated', f.oid, 'EXECUTE') then raise exception 'Postcondition: authenticated lost %', f.sig; end if;
  end loop;
  if (select result from _d_result where role = 'postgres') is distinct from 'changed' then
    raise exception 'Postcondition: the default privileges of postgres were not changed';
  end if;
end $$;

-- What was done, for the person running it.
select 'C function' as part, sig as object, case when blocked_by = '' then 'anon and PUBLIC lose EXECUTE' else 'SKIPPED: ' || blocked_by end as result from _c_funcs
union all
select 'D defaults', role, result from _d_result
union all
select 'B/F not owned', name, 'left as it is (owner ' || owner || ')' from _rels where not controlled
union all
select 'A, B, F', 'profiles; ' || (select count(*) from _rels where controlled and relkind <> 'S') || ' tables and views; ' ||
       (select count(*) from _rels where controlled and relkind = 'S') || ' sequences', 'done'
order by 1, 2;

commit;

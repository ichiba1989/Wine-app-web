-- ANONYMOUS ACCESS HARDENING (Phase 2.0B.6, 2026-11-01). PROPOSAL: tested on a disposable local Supabase stack only; NOT run on the live
-- database. Run it only after the owner approves (docs/security/ANON_HARDENING_CHANGE_REPORT.md), in the Supabase SQL editor, as the
-- database owner, in one go. Undo with anon_hardening_rollback.sql (restores the exact grants saved here; no row of data is touched).
--
-- Who is who. The browser's "anon" role is a visitor who has NOT signed in at all. Guests are NOT anon: the app signs every visitor in
-- anonymously at once (data.js ensureUser, Supabase anonymous sign-in), and a guest's requests use the "authenticated" role, exactly
-- like a member's. anon is used only for the few requests a first visit sends before that sign-in finishes: the public catalog reads
-- started early by app.js startEarlyLoads (v_catalog_cards, wine_vintages, wine_reference_values, flavor_varietals, flavor_regions,
-- grape_aliases, producer_aliases, place_designation_rules, broad_places). Nothing here touches what those reads need.
--
-- What it changes (grants only; no table, row, function body or policy is created, changed or removed in the app's schema):
--   A. public.profiles: anon and PUBLIC lose every privilege; authenticated keeps SELECT (row security still limits it to the person's
--      own row, or all rows for editors) and UPDATE on the name, consent and age-attestation columns only (the columns the app writes:
--      consent.js, data.js attestAge). authenticated loses INSERT, DELETE, TRUNCATE, REFERENCES, TRIGGER and table-wide UPDATE, so
--      role, staff_role, tier, id and created_at can only change through the existing server functions (staff_set_role, set_my_plan)
--      or by the owner in SQL. Profiles are created by the sign-up trigger (handle_new_user), which runs with its owner's rights.
--   B. Every table and view in public: anon loses TRUNCATE, REFERENCES and TRIGGER, and on PostgreSQL 17 or later also MAINTAIN (lock,
--      vacuum, analyze, refresh); no API request can use them, row security does not apply to TRUNCATE, and the app never uses them.
--      Also for tables the owner creates later (default privileges of role postgres). authenticated loses MAINTAIN on profiles too.
--   C. Functions only signed-in people use (staff, plan, import, delete-my-data, guest merge, photos, legend, places): anon and PUBLIC
--      lose EXECUTE; authenticated keeps it. A function is SKIPPED (left as it is, and listed) when a policy, a view, or another function
--      that anon may still run mentions it, because then a signed-out read could depend on it (has_permission is one: the reference
--      lists' policies call it on every read).
-- What it does NOT change: anon's SELECT on public content, any other table's INSERT/UPDATE/DELETE (row security protects them; see
-- ANON_ACCESS_AUDIT.md for the proposal, which needs the live inventory first), sequences, storage, auth, and migration 001's schema.
-- A copy of every grant it changes is saved in private.anon_hardening_backup (owner only) the first time it runs. Safe to run again.

begin;

-- 0. Preflight: stop, changing nothing, unless the objects it relies on are there.
do $$
declare c text;
begin
  if to_regclass('public.profiles') is null then raise exception 'Preflight: public.profiles not found'; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') or not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise exception 'Preflight: the roles anon and authenticated must exist (this is meant for a Supabase database)';
  end if;
  foreach c in array array['age_attested_at', 'age_attested_rule', 'consent_version', 'consent_at'] loop   -- the columns the app writes
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = c) then
      raise exception 'Preflight: public.profiles has no column %; the app writes it, so stop and check', c;
    end if;
  end loop;
end $$;

-- The signed-in-only functions of part C, by name (every overload). Names that do not exist are simply passed over.
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

-- Which of them part C will change: public, not a trigger function, not owned by an extension, and not mentioned by a policy, a view,
-- or a function that stays executable by anon (a security invoker function would run it with anon's rights).
create temporary table _c_funcs on commit drop as
with cand as (
  select p.oid, p.proname, p.oid::regprocedure::text as sig
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
select c.oid, c.sig, concat_ws('; ', m.in_policy, m.in_view, m.in_invoker_fn) as blocked_by,
       has_function_privilege('authenticated', c.oid, 'EXECUTE') as auth_had
  from cand c join mentions m on m.oid = c.oid;

-- 1. Backup (first run only): every grant to anon, authenticated and PUBLIC on the objects this script changes, as they are now.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.anon_hardening_backup (
  id           bigint generated always as identity primary key,
  taken_at     timestamptz not null default now(),
  part         text not null check (part in ('A', 'B', 'C', 'D')),
  object_kind  text not null check (object_kind in ('table', 'column', 'function', 'default')),
  object_name  text not null,       -- a table (regclass text), a function (regprocedure text) or, for D, 'tables in public for postgres'
  column_name  text,
  grantee      text not null check (grantee in ('anon', 'authenticated', 'PUBLIC')),
  privilege    text,                -- null = the grantee held nothing here (recorded so the rollback knows the object was touched)
  grantable    boolean not null default false
);
revoke all on private.anon_hardening_backup from public, anon, authenticated, service_role;
comment on table private.anon_hardening_backup is 'Grants changed by docs/security/anon_hardening_up.sql, as they were before; read by anon_hardening_rollback.sql.';

do $$
begin
  if exists (select 1 from private.anon_hardening_backup) then
    raise notice 'Backup already taken on %; it is kept as it is (the state before the first run).', (select min(taken_at) from private.anon_hardening_backup);
    return;
  end if;
  -- A: profiles, table and column grants of anon, authenticated, PUBLIC
  insert into private.anon_hardening_backup (part, object_kind, object_name, column_name, grantee, privilege, grantable)
  select 'A', 'table', 'public.profiles', null, g.grantee, x.privilege_type, coalesce(x.is_grantable, false)
    from (values ('anon', (select oid from pg_roles where rolname = 'anon')), ('authenticated', (select oid from pg_roles where rolname = 'authenticated')), ('PUBLIC', 0::oid)) g(grantee, goid)
    left join lateral (select a.privilege_type, a.is_grantable from pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
                        where c.oid = 'public.profiles'::regclass and a.grantee = g.goid) x on true;
  insert into private.anon_hardening_backup (part, object_kind, object_name, column_name, grantee, privilege, grantable)
  select 'A', 'column', 'public.profiles', att.attname, case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end, a.privilege_type, a.is_grantable
    from pg_attribute att, aclexplode(att.attacl) a
   where att.attrelid = 'public.profiles'::regclass and att.attnum > 0 and not att.attisdropped and att.attacl is not null
     and (a.grantee = 0 or pg_get_userbyid(a.grantee) in ('anon', 'authenticated'));
  -- B: anon's TRUNCATE, REFERENCES and TRIGGER on every public table and view (a null row marks "held none of them")
  insert into private.anon_hardening_backup (part, object_kind, object_name, column_name, grantee, privilege, grantable)
  select 'B', 'table', c.oid::regclass::text, null, 'anon', x.privilege_type, coalesce(x.is_grantable, false)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    left join lateral (select a.privilege_type, a.is_grantable from aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
                        where a.grantee = (select oid from pg_roles where rolname = 'anon') and a.privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN')) x on true
   where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f') and c.oid <> 'public.profiles'::regclass
     and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e');
  -- C: EXECUTE of anon, authenticated, PUBLIC on the functions part C changes (null proacl = PostgreSQL's default: PUBLIC may execute)
  insert into private.anon_hardening_backup (part, object_kind, object_name, column_name, grantee, privilege, grantable)
  select 'C', 'function', f.sig, null, g.grantee, x.privilege_type, coalesce(x.is_grantable, false)
    from _c_funcs f join pg_proc p on p.oid = f.oid
    cross join (values ('anon', (select oid from pg_roles where rolname = 'anon')), ('authenticated', (select oid from pg_roles where rolname = 'authenticated')), ('PUBLIC', 0::oid)) g(grantee, goid)
    left join lateral (select a.privilege_type, a.is_grantable from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = g.goid) x on true
   where f.blocked_by = '';
  -- D: the default privileges role postgres gives anon on new tables in public
  insert into private.anon_hardening_backup (part, object_kind, object_name, column_name, grantee, privilege, grantable)
  select 'D', 'default', 'tables in public for postgres', null, 'anon', x.privilege_type, coalesce(x.is_grantable, false)
    from (select 1) one
    left join lateral (select a.privilege_type, a.is_grantable from pg_default_acl d, aclexplode(d.defaclacl) a
                        where d.defaclrole = (select oid from pg_roles where rolname = 'postgres') and d.defaclnamespace = 'public'::regnamespace
                          and d.defaclobjtype = 'r' and a.grantee = (select oid from pg_roles where rolname = 'anon')
                          and a.privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN')) x on true;
end $$;

-- 2. Part A: profiles.
revoke all on table public.profiles from anon;
revoke all on table public.profiles from public;
revoke insert, update, delete, truncate, references, trigger on table public.profiles from authenticated;   -- also clears column-level grants
grant select on table public.profiles to authenticated;
do $$ begin
  if current_setting('server_version_num')::int >= 170000 then execute 'revoke maintain on table public.profiles from authenticated'; end if;
end $$;
do $$
declare c text; v_cols text[] := '{}';
begin
  foreach c in array array['display_name', 'consent_version', 'consent_at', 'age_attested_at', 'age_attested_rule'] loop
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = c) then
      v_cols := v_cols || c;
    end if;
  end loop;
  execute format('grant update (%s) on table public.profiles to authenticated', (select string_agg(quote_ident(x), ', ') from unnest(v_cols) x));
end $$;

-- 3. Part B: no TRUNCATE, REFERENCES, TRIGGER (or, on PostgreSQL 17+, MAINTAIN) for anon on any public table or view, now or later.
do $$
declare r record; v_privs text := case when current_setting('server_version_num')::int >= 170000 then 'truncate, references, trigger, maintain' else 'truncate, references, trigger' end;
begin
  for r in select c.oid::regclass as rel from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
              and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e') loop
    execute format('revoke %s on table %s from anon', v_privs, r.rel);
  end loop;
  execute format('alter default privileges for role postgres in schema public revoke %s on tables from anon', v_privs);
end $$;

-- 4. Part C: signed-in-only functions.
do $$
declare f record;
begin
  for f in select * from _c_funcs loop
    if f.blocked_by <> '' then
      raise notice 'Part C skipped % (mentioned by %): left as it is', f.sig, f.blocked_by;
      continue;
    end if;
    execute format('revoke execute on function %s from public, anon', f.sig);
    if f.auth_had then execute format('grant execute on function %s to authenticated', f.sig); end if;
  end loop;
end $$;

-- 5. Postconditions: stop and undo everything (the transaction) if any of the targets is not met.
do $$
declare p text; c text; f record; v17 boolean := current_setting('server_version_num')::int >= 170000;
begin
  if v17 and (has_table_privilege('anon', 'public.profiles', 'MAINTAIN') or has_table_privilege('authenticated', 'public.profiles', 'MAINTAIN')) then
    raise exception 'Postcondition: anon or authenticated still has MAINTAIN on profiles';
  end if;
  if v17 and exists (select 1 from pg_class cl join pg_namespace n on n.oid = cl.relnamespace where n.nspname = 'public' and cl.relkind in ('r', 'p', 'v', 'm', 'f')
                      and has_table_privilege('anon', cl.oid, 'MAINTAIN') and not exists (select 1 from pg_depend d where d.objid = cl.oid and d.deptype = 'e')) then
    raise exception 'Postcondition: anon still has MAINTAIN on a public table';
  end if;
  foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
    if has_table_privilege('anon', 'public.profiles', p) then raise exception 'Postcondition: anon still has % on profiles', p; end if;
  end loop;
  if exists (select 1 from pg_attribute a where a.attrelid = 'public.profiles'::regclass and a.attnum > 0 and not a.attisdropped
              and (has_column_privilege('anon', 'public.profiles'::regclass, a.attnum, 'SELECT') or has_column_privilege('anon', 'public.profiles'::regclass, a.attnum, 'INSERT')
                   or has_column_privilege('anon', 'public.profiles'::regclass, a.attnum, 'UPDATE') or has_column_privilege('anon', 'public.profiles'::regclass, a.attnum, 'REFERENCES'))) then
    raise exception 'Postcondition: anon still holds a column privilege on profiles';
  end if;
  if not has_table_privilege('authenticated', 'public.profiles', 'SELECT') then raise exception 'Postcondition: authenticated lost SELECT on profiles'; end if;
  foreach p in array array['INSERT', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
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
  if exists (select 1 from pg_class cl join pg_namespace n on n.oid = cl.relnamespace where n.nspname = 'public' and cl.relkind in ('r', 'p', 'v', 'm', 'f')
              and (has_table_privilege('anon', cl.oid, 'TRUNCATE') or has_table_privilege('anon', cl.oid, 'REFERENCES') or has_table_privilege('anon', cl.oid, 'TRIGGER'))
              and not exists (select 1 from pg_depend d where d.objid = cl.oid and d.deptype = 'e')) then
    raise exception 'Postcondition: anon still has TRUNCATE, REFERENCES or TRIGGER on a public table';
  end if;
  for f in select * from _c_funcs where blocked_by = '' loop
    if has_function_privilege('anon', f.oid, 'EXECUTE') then raise exception 'Postcondition: anon may still execute %', f.sig; end if;
    if f.auth_had and not has_function_privilege('authenticated', f.oid, 'EXECUTE') then raise exception 'Postcondition: authenticated lost %', f.sig; end if;
  end loop;
end $$;

-- What was done (one row per changed function, and the skipped ones), for the person running it.
select 'part C' as part, sig as function, case when blocked_by = '' then 'anon and PUBLIC lose EXECUTE' else 'SKIPPED: ' || blocked_by end as result from _c_funcs
union all
select 'parts A, B', 'public.profiles and every public table', 'done' order by 1, 2;

commit;

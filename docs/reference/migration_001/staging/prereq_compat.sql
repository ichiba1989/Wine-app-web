-- STAGING ONLY (disposable LOCAL Supabase stack). NEVER RUN ON PRODUCTION. Phase 2.0B.4, 2026-11-01.
-- Compatibility prerequisites: the minimum existing-app structures Migration 001 needs, in the SAME shape as tests/stub_supabase.sql, so
-- the unchanged SQL behaviour suite (tests/001_behaviour_tests.sql) and the concurrency scenarios run on a REAL Supabase database.
-- Real Supabase parts (not recreated): the roles anon / authenticated / service_role / authenticator / supabase_admin, auth.uid(), the
-- auth schema, Supabase's default privileges and event triggers. Recreated stand-ins (from FINDINGS.md and the repository's scripts):
-- the enum verification_status, app_config and cfg_number(), has_permission() reading a test table (_stub_permissions), staff_roles,
-- a test-shaped profiles table and my_staff_role_code(), two catalog stand-ins, and pg_trgm in schema public (as on production).
-- Generated from tests/stub_supabase.sql from its "default privileges" line on; the role and auth blocks are left out because Supabase
-- provides them.

-- Supabase's default privileges in public (FINDINGS.md, part 1): every new table and function is granted to the browser's roles.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

create extension if not exists pg_trgm with schema public;

-- The existing status list (live enum).
do $$ begin
  if not exists (select 1 from pg_type where typname = 'verification_status') then
    create type public.verification_status as enum ('draft', 'pending_review', 'verified', 'retired');
  end if;
end $$;

-- app_config and cfg_number (cfg_number copied from docs/import_limit.sql).
create table if not exists public.app_config (key text primary key, value jsonb not null, note text);
create or replace function public.cfg_number(p_key text, p_default numeric)
returns numeric language sql stable security definer set search_path to 'public'
as $$
  select coalesce((select (case when jsonb_typeof(to_jsonb(c.value)) = 'object' then to_jsonb(c.value) ->> 'value' else trim(both '"' from to_jsonb(c.value)::text) end)::numeric
                   from app_config c where c.key = p_key), p_default)
$$;

-- has_permission: STUB. Live it reads the person's staff role (docs/ROLES_AND_ACCESS.md); here a test table of user -> permission.
create table if not exists public._stub_permissions (user_id uuid not null, perm text not null, primary key (user_id, perm));
create or replace function public.has_permission(p_perm text) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public._stub_permissions where user_id = auth.uid() and perm = p_perm)
$$;

-- Catalog stand-ins, with rows, so the compatibility test can prove nothing in them changes.
create table if not exists public.wines (id uuid primary key default gen_random_uuid(), name text, status public.verification_status not null default 'draft');
create table if not exists public.wine_vintages (id uuid primary key default gen_random_uuid(), wine_id uuid references public.wines(id), vintage_year smallint);
insert into public.wines (name, status) select 'Stand-in wine ' || g, 'verified' from generate_series(1, 5) g where not exists (select 1 from public.wines);
insert into public.wine_vintages (wine_id, vintage_year) select id, 2020 from public.wines where not exists (select 1 from public.wine_vintages);
alter table public.wines enable row level security;
alter table public.wine_vintages enable row level security;

-- Role definitions as read on 2026-10-26 (FINDINGS.md, part 2), to test migration 001a.
create table if not exists public.staff_roles (code text primary key, label text not null, description text, permissions text[] not null default '{}', sort_order smallint not null default 0);
insert into public.staff_roles (code, label, permissions, sort_order) values
  ('owner', 'Owner', '{catalog_edit,quiz_verify,feedback_read,settings_edit,remove_content,found_online_photos,import_extended,owner_page}', 1),
  ('editor', 'Editor', '{catalog_edit,quiz_verify,feedback_read,import_extended}', 2),
  ('quiz_reviewer', 'Quiz reviewer', '{quiz_verify}', 3)
on conflict (code) do nothing;

-- A person's staff role and the authoritative lookup, my_staff_role_code(). STUB of the live function: same rule as the repository's role
-- scripts (docs/roles_proposal.sql: profiles.role 'admin' = owner, else profiles.staff_role, else profiles.role 'editor' = editor); the live
-- body itself is not in the repository. Live, profiles.role is the enum user_role; here plain text.
create table if not exists public.profiles (id uuid primary key, role text not null default 'player', staff_role text references public.staff_roles(code));
create or replace function public.my_staff_role_code() returns text
language sql stable security definer set search_path to 'public' as $$
  select coalesce(case when p.role = 'admin' then 'owner' end, p.staff_role, case when p.role = 'editor' then 'editor' end)
    from public.profiles p where p.id = auth.uid()
$$;

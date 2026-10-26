-- LOCAL TEST ONLY. NEVER RUN ON SUPABASE. A disposable stand-in for the parts of the live database that migration 001 relies on,
-- built from docs/reference/results/FINDINGS.md and the repository's scripts. It is NOT the live database: has_permission() here reads a
-- test table, auth.uid() reads a session setting the tests set, and the app's real tables are reduced to a few catalog stand-ins whose rows
-- the compatibility test counts before and after the migration.

-- Roles the browser and Supabase use (live: anon, authenticated, service_role; service_role bypasses RLS).
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

-- auth.uid(): live it reads the signed-in user from the request; here from the setting request.jwt.claim.sub.
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

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

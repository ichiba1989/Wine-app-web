-- STAGING ONLY (disposable LOCAL Supabase stack). NEVER RUN ON PRODUCTION. Phase 2.0B.4, 2026-11-01.
-- Realistic prerequisites: the existing-app structures Migration 001 needs, recreated from the documented production behaviour
-- (docs/reference/results/FINDINGS.md, docs/ROLES_AND_ACCESS.md, docs/roles_proposal.sql), tied to REAL local Supabase Auth users.
-- REAL (provided by the local Supabase stack): auth.users and sign-in (GoTrue), auth.uid(), JWT roles, PostgREST, the roles and default
-- privileges. RECREATED (synthetic; production bodies were NOT read): has_permission(), my_staff_role_code(), is_editor(),
-- handle_new_user(), the profiles grants and policies. They follow the documented rules; production must still be checked read-only
-- with owner_role_check.sql.

create extension if not exists pg_trgm with schema public;                 -- production: pg_trgm 1.6 in public (FINDINGS 13)

do $$ begin
  if not exists (select 1 from pg_type where typname = 'verification_status') then
    create type public.verification_status as enum ('draft', 'pending_review', 'verified', 'retired');   -- FINDINGS 11
  end if;
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('player', 'contributor', 'editor', 'admin');                    -- FINDINGS 11
  end if;
end $$;

-- app_config and cfg_number (copied from docs/import_limit.sql); read by everyone, as on production.
create table if not exists public.app_config (key text primary key, value jsonb not null, note text);
alter table public.app_config enable row level security;
drop policy if exists app_config_read on public.app_config;
create policy app_config_read on public.app_config for select using (true);
create or replace function public.cfg_number(p_key text, p_default numeric)
returns numeric language sql stable security definer set search_path to 'public'
as $$
  select coalesce((select (case when jsonb_typeof(to_jsonb(c.value)) = 'object' then to_jsonb(c.value) ->> 'value' else trim(both '"' from to_jsonb(c.value)::text) end)::numeric
                   from app_config c where c.key = p_key), p_default)
$$;

-- Role definitions, exactly as read on 2026-10-26 (FINDINGS part 2).
create table if not exists public.staff_roles (code text primary key, label text not null, description text,
  permissions text[] not null default '{}', sort_order smallint not null default 0);
alter table public.staff_roles enable row level security;
drop policy if exists staff_roles_read on public.staff_roles;
create policy staff_roles_read on public.staff_roles for select to authenticated using (true);
insert into public.staff_roles (code, label, description, permissions, sort_order) values
  ('quiz_reviewer', 'Quiz reviewer', 'Quiz verification only.', '{quiz_verify}', 3),
  ('editor', 'Editor', 'Everything except removing content and changing settings.', '{catalog_edit,quiz_verify,feedback_read,import_extended}', 2),
  ('owner', 'Owner', 'Everything, including deleting wines and quiz questions and changing settings.',
   '{catalog_edit,quiz_verify,feedback_read,settings_edit,remove_content,found_online_photos,import_extended,owner_page}', 1)
on conflict (code) do nothing;

-- profiles: the live columns (FINDINGS 03), a row per Auth user (handle_new_user), the live policies (FINDINGS 06), and the documented
-- grants: authenticated has NO table-level UPDATE, only column-level UPDATE on name and consent columns (docs/ROLES_AND_ACCESS.md,
-- CLAUDE.md convention 16: ASSUMED, not read from production); anon keeps Supabase's table-level grants (FINDINGS 12).
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text, role public.user_role not null default 'player', tier text not null default 'default',
  age_attested_at timestamptz, age_attested_rule text, created_at timestamptz not null default now(),
  staff_role text references public.staff_roles(code), consent_version text, consent_at timestamptz);
alter table public.profiles enable row level security;

create or replace function public.my_staff_role_code() returns text
language sql stable security definer set search_path to 'public' as $$
  -- RECREATED from the documented rule (docs/roles_proposal.sql): older accounts role 'admin' = owner, else staff_role, else role 'editor'
  select coalesce(case when p.role = 'admin' then 'owner' end, p.staff_role, case when p.role = 'editor' then 'editor' end)
    from public.profiles p where p.id = auth.uid()
$$;
create or replace function public.has_permission(p_perm text) returns boolean
language sql stable security definer set search_path to 'public' as $$
  -- RECREATED from docs/ROLES_AND_ACCESS.md: the permission is in the signed-in person's staff role
  select exists (select 1 from public.staff_roles r where r.code = public.my_staff_role_code() and p_perm = any (r.permissions))
$$;
create or replace function public.is_editor() returns boolean
language sql stable security definer set search_path to 'public' as $$ select public.has_permission('catalog_edit') $$;

drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles for select using ((id = auth.uid()) or public.is_editor());
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles for update using (id = auth.uid());
revoke update on public.profiles from authenticated;
grant update (display_name, consent_version, consent_at, age_attested_at, age_attested_rule) on public.profiles to authenticated;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  -- RECREATED (synthetic): every new Auth user gets a player profile with no staff role
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Two catalog stand-ins with rows, for the "existing data untouched" check.
create table if not exists public.wines (id uuid primary key default gen_random_uuid(), name text, status public.verification_status not null default 'draft');
alter table public.wines enable row level security;
insert into public.wines (name, status) select 'Stand-in wine ' || g, 'verified' from generate_series(1, 5) g where not exists (select 1 from public.wines);

-- STAGING ONLY (disposable LOCAL Supabase stack). NEVER RUN ON PRODUCTION. Migration 002 tests, 2026-11-08.
-- The old catalog tables migration 002's link report reads, as STAND-INS with the columns the app itself reads (data.js):
-- grapes (id, name), geo_areas (id, name, level, parent_id, classification), and the wines columns producer_id, name, style,
-- appellation_id. Loaded after migration_001/staging/prereq_realistic.sql and docs/security/tests/prereq_app.sql. Synthetic rows only.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'geo_level') then create type public.geo_level as enum ('country', 'region', 'appellation'); end if;
end $$;
create table if not exists public.grapes (id uuid primary key default gen_random_uuid(), name text not null unique);
create table if not exists public.geo_areas (id uuid primary key default gen_random_uuid(), name text not null, level public.geo_level not null,
  parent_id uuid references public.geo_areas(id), classification text);
alter table public.grapes enable row level security;
alter table public.geo_areas enable row level security;
alter table public.wines add column if not exists appellation_id uuid references public.geo_areas(id);
insert into public.grapes (name) values ('Stand-in Noir'), ('Stand-in Blanc') on conflict do nothing;
insert into public.geo_areas (id, name, level) values ('71000000-0000-0000-0000-000000000001', 'Standinland', 'country') on conflict do nothing;
insert into public.geo_areas (id, name, level, parent_id) values ('71000000-0000-0000-0000-000000000002', 'Stand-in Valley', 'region', '71000000-0000-0000-0000-000000000001') on conflict do nothing;
insert into public.wine_vintages (wine_id, vintage_year, is_non_vintage) select id, null, true from public.wines where name = 'Stand-in draft wine' and not exists (select 1 from public.wine_vintages v where v.wine_id = public.wines.id and v.is_non_vintage);


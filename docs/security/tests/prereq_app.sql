-- STAGING ONLY (disposable LOCAL Supabase stack). NEVER RUN ON PRODUCTION. Phase 2.0B.6, 2026-11-01.
-- Loaded after docs/reference/migration_001/staging/prereq_realistic.sql (profiles with the documented grants and policies, staff
-- roles, the sign-up trigger, my_staff_role_code/has_permission) and before the repository's own scripts that the tests also load
-- unchanged: docs/roles_proposal.sql, docs/reference_lists.sql, docs/restaurant_visits.sql, docs/this_or_that.sql, docs/note_legend.sql.
-- Everything below is a STAND-IN (synthetic, labelled): the live catalog's tables, views and functions are not in the repository.

-- feature_access (needed by roles_proposal.sql step 3)
create table if not exists public.feature_access (feature text primary key, all_tiers boolean not null default false, tiers text[] not null default '{}');
alter table public.feature_access enable row level security;

-- The public catalog the first visit reads before sign-in (app.js startEarlyLoads). Stand-in policies: published (verified) wines are
-- readable by everyone, as the live view's security_invoker rule says ("players: published wines", docs/v_catalog_cards.sql).
create table if not exists public.producers (id uuid primary key default gen_random_uuid(), name text not null);
alter table public.producers enable row level security;
drop policy if exists producers_read on public.producers;
create policy producers_read on public.producers for select using (true);
alter table public.wines add column if not exists producer_id uuid references public.producers(id);
alter table public.wines add column if not exists style text not null default 'red';
drop policy if exists wines_read on public.wines;
create policy wines_read on public.wines for select using (status = 'verified' or public.has_permission('catalog_edit'));
create table if not exists public.wine_vintages (id uuid primary key default gen_random_uuid(), wine_id uuid references public.wines(id), vintage_year smallint, is_non_vintage boolean not null default false);
alter table public.wine_vintages enable row level security;
drop policy if exists wine_vintages_read on public.wine_vintages;
create policy wine_vintages_read on public.wine_vintages for select using (exists (select 1 from public.wines w where w.id = wine_id));
create table if not exists public.wine_reference_values (id uuid primary key default gen_random_uuid(), wine_id uuid, wine_vintage_id uuid, dimension_key text, value numeric, status text not null default 'verified');
alter table public.wine_reference_values enable row level security;
drop policy if exists wrv_read on public.wine_reference_values;
create policy wrv_read on public.wine_reference_values for select using (status = 'verified' or public.has_permission('catalog_edit'));
create table if not exists public.flavor_varietals (key text primary key, label text, type text, shape text, weights jsonb);
create table if not exists public.flavor_regions (key text primary key, country text, name text, kind text, lat numeric, lon numeric, nudges jsonb);
alter table public.flavor_varietals enable row level security;
alter table public.flavor_regions enable row level security;
drop policy if exists fv_read on public.flavor_varietals;
create policy fv_read on public.flavor_varietals for select using (true);
drop policy if exists fr_read on public.flavor_regions;
create policy fr_read on public.flavor_regions for select using (true);
drop view if exists public.v_catalog_cards;
create view public.v_catalog_cards with (security_invoker = true) as
  select v.id as wine_vintage_id, w.id as wine_id, p.name as producer_name, w.name as wine_name, w.style, v.vintage_year, v.is_non_vintage,
         'France'::text as country, null::text as region, null::text as appellation, '{}'::text[] as label_grapes, '{}'::text[] as rule_grapes
    from public.wine_vintages v join public.wines w on w.id = v.wine_id left join public.producers p on p.id = w.producer_id;

insert into public.producers (id, name) values ('70000000-0000-0000-0000-000000000001', 'Stand-in Cellars') on conflict do nothing;
update public.wines set producer_id = '70000000-0000-0000-0000-000000000001' where producer_id is null;
insert into public.wines (name, status, producer_id) values ('Stand-in draft wine', 'draft', '70000000-0000-0000-0000-000000000001');
insert into public.wine_vintages (wine_id, vintage_year) select id, 2020 from public.wines where not exists (select 1 from public.wine_vintages);
insert into public.flavor_varietals (key, label, type, shape, weights) values ('standin', 'Stand-in grape', 'red', 'round', '{}') on conflict do nothing;
insert into public.flavor_regions (key, country, name, kind, lat, lon, nudges) values ('standin', 'France', 'Stand-in place', 'region', 45, 3, '{}') on conflict do nothing;

-- A player-owned table in the usual pattern (journal stand-in): rows only for their owner.
create table if not exists public.consumptions (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid(), wine_vintage_id uuid, consumed_on date default current_date);
alter table public.consumptions enable row level security;
drop policy if exists consumptions_own on public.consumptions;
create policy consumptions_own on public.consumptions for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Signed-in-only functions written the way the repository's are (security definer; "Not signed in" check; no revoke from anon), for
-- names whose live source is not in the repository's runnable scripts here. Stand-ins.
create or replace function public.delete_my_swipe(p_wine_vintage_id uuid) returns void
language plpgsql security definer set search_path to 'public' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not signed in'; end if;
end $$;
create or replace function public.my_staff_access() returns jsonb
language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object('role', public.my_staff_role_code(),
           'permissions', coalesce((select to_jsonb(r.permissions) from public.staff_roles r where r.code = public.my_staff_role_code()), '[]'::jsonb))
$$;

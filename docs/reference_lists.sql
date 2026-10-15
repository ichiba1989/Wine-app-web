-- Reference lists in the database (owner, 2026-10-15; every version). Run once in the Supabase SQL editor; safe to run again.
-- Until now these lists lived only in the app's code. Here they become rows the owner can see and edit (Owner page, Lists tab), each saying where it
-- came from (basis), whether it is used (status) and when it was checked. The app reads only rows that are 'in use' or 'checked'; with no rows (before
-- this script, or offline with nothing saved) it keeps its built-in lists. Then run docs/reference_lists_seed.sql (generated from the code lists).
--   grape_aliases            other words for a grape: 'shortcut' (typing help: "cab" -> Cabernet Sauvignon) or 'synonym' (the same grape under
--                            another name: "Lemberger" -> Blaufränkisch; only used to find the grape's rules; a label keeps its own word)
--   producer_aliases         other spellings of a producer an editor confirmed ("Donnhoff" -> Dönnhoff), offered as "Looks like ..."
--   place_designation_rules  appellation -> designation (geo.js KNOWN_DESIGNATIONS)
--   broad_places             the places a German or Austrian wine may point at (geo.js BROAD_PLACES)

create table if not exists public.grape_aliases (
  id bigserial primary key,
  alias text not null,
  grape text not null,                  -- the grape's name as on the grape list
  kind text not null check (kind in ('shortcut', 'synonym')),
  status text not null default 'suggested' check (status in ('suggested', 'in use', 'checked')),
  basis text not null default 'owner',
  source_url text,
  checked_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists grape_aliases_one on public.grape_aliases (lower(alias), kind);

create table if not exists public.producer_aliases (
  id bigserial primary key,
  alias text not null,
  producer_id uuid not null references public.producers(id) on delete cascade,
  status text not null default 'in use' check (status in ('suggested', 'in use', 'checked')),
  basis text not null default 'editor',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index if not exists producer_aliases_one on public.producer_aliases (lower(alias));

create table if not exists public.place_designation_rules (
  id bigserial primary key,
  country text not null,
  place_name text not null,
  designation text not null,
  status text not null default 'in use' check (status in ('suggested', 'in use', 'checked')),
  basis text not null default 'owner',
  source_url text,
  checked_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists place_designation_rules_one on public.place_designation_rules (lower(country), lower(place_name));

create table if not exists public.broad_places (
  id bigserial primary key,
  country text not null,
  name text not null,
  status text not null default 'in use' check (status in ('suggested', 'in use', 'checked')),
  basis text not null default 'owner',
  source_url text,
  checked_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists broad_places_one on public.broad_places (lower(country), lower(name));

-- Everyone reads (the lists shape what the app suggests); the owner changes everything; editors may add and change aliases.
alter table public.grape_aliases enable row level security;
alter table public.producer_aliases enable row level security;
alter table public.place_designation_rules enable row level security;
alter table public.broad_places enable row level security;
drop policy if exists grape_aliases_read on public.grape_aliases;
create policy grape_aliases_read on public.grape_aliases for select using (true);
drop policy if exists grape_aliases_write on public.grape_aliases;
create policy grape_aliases_write on public.grape_aliases for all using (has_permission('settings_edit'::text) or has_permission('catalog_edit'::text)) with check (has_permission('settings_edit'::text) or has_permission('catalog_edit'::text));
drop policy if exists producer_aliases_read on public.producer_aliases;
create policy producer_aliases_read on public.producer_aliases for select using (true);
drop policy if exists producer_aliases_write on public.producer_aliases;
create policy producer_aliases_write on public.producer_aliases for all using (has_permission('settings_edit'::text) or has_permission('catalog_edit'::text)) with check (has_permission('settings_edit'::text) or has_permission('catalog_edit'::text));
drop policy if exists place_designation_rules_read on public.place_designation_rules;
create policy place_designation_rules_read on public.place_designation_rules for select using (true);
drop policy if exists place_designation_rules_write on public.place_designation_rules;
create policy place_designation_rules_write on public.place_designation_rules for all using (has_permission('settings_edit'::text)) with check (has_permission('settings_edit'::text));
drop policy if exists broad_places_read on public.broad_places;
create policy broad_places_read on public.broad_places for select using (true);
drop policy if exists broad_places_write on public.broad_places;
create policy broad_places_write on public.broad_places for all using (has_permission('settings_edit'::text)) with check (has_permission('settings_edit'::text));
grant select on public.grape_aliases, public.producer_aliases, public.place_designation_rules, public.broad_places to anon, authenticated;
grant insert, update, delete on public.grape_aliases, public.producer_aliases, public.place_designation_rules, public.broad_places to authenticated;
grant usage on all sequences in schema public to authenticated;

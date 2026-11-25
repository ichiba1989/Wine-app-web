-- STAGING ONLY (disposable LOCAL Supabase stack). NEVER RUN ON PRODUCTION. Migration 004 tests, 2026-11-13.
-- SYNTHETIC stand-ins, loaded after migration_003/tests/prereq_catalog_003.sql:
--   wine_grapes (wine_id, grape_id, basis, position) with the live enum basis_kind (label, rule, editor, source), as the catalog view
--   reads them (docs/v_catalog_cards.sql); a stand-in appellation_grape_rules whose column names are DELIBERATELY not guessed to be the
--   live ones (the grape-rules check must not depend on them); and an appellation under the stand-in region named like a code-list line.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'basis_kind') then create type public.basis_kind as enum ('label', 'rule', 'editor', 'source'); end if;
end $$;
create table if not exists public.wine_grapes (wine_id uuid not null references public.wines(id), grape_id uuid not null references public.grapes(id),
  basis public.basis_kind not null default 'label', position smallint not null default 1, primary key (wine_id, grape_id));
alter table public.wine_grapes enable row level security;
-- the stand-in draft wine: one grape from the label, one from a rule
insert into public.wine_grapes (wine_id, grape_id, basis, position)
select w.id, g.id, 'label', 1 from public.wines w, public.grapes g where w.name = 'Stand-in draft wine' and g.name = 'Stand-in Noir' on conflict do nothing;
insert into public.wine_grapes (wine_id, grape_id, basis, position)
select w.id, g.id, 'rule', 2 from public.wines w, public.grapes g where w.name = 'Stand-in draft wine' and g.name = 'Stand-in Blanc' on conflict do nothing;
-- an appellation and a grape named like a line of the code list, and the stand-in rule table
insert into public.geo_areas (id, name, level, parent_id) values ('71000000-0000-0000-0000-000000000004', 'Morgon', 'appellation', '71000000-0000-0000-0000-000000000002') on conflict do nothing;
insert into public.grapes (name) values ('Gamay') on conflict do nothing;
create table if not exists public.appellation_grape_rules (rule_ref bigint generated always as identity primary key, place uuid not null references public.geo_areas(id),
  variety uuid not null references public.grapes(id), role text not null, min_pct numeric, source_text text not null, state text not null default 'draft');
alter table public.appellation_grape_rules enable row level security;
insert into public.appellation_grape_rules (place, variety, role, min_pct, source_text)
select '71000000-0000-0000-0000-000000000004', g.id, 'primary', 85, 'synthetic test row' from public.grapes g where g.name = 'Gamay'
 and not exists (select 1 from public.appellation_grape_rules);
insert into public.appellation_grape_rules (place, variety, role, source_text)
select '71000000-0000-0000-0000-000000000003', g.id, 'permitted', 'synthetic row no code line matches' from public.grapes g where g.name = 'Stand-in Blanc'
 and (select count(*) from public.appellation_grape_rules) = 1;

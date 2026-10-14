-- TECH SHEET (researched, sourced wine facts and the full-page sheet). Run the WHOLE script once in the Supabase SQL editor; it is safe to run again.
-- It only ADDS separate things (four tables, a few techsheet_* functions, three app_config rows). It changes no existing table, view or function,
-- and the app switch techsheet_enabled starts at 0 (off for everyone). To remove everything again: docs/tech_sheet_remove.sql (see docs/TECHSHEET_REMOVAL.md).
-- Who may read: everyone when the switch is 2; only Editors/Owner when it is 1; nobody (but Editors/Owner writing through the functions) when it is 0.

-- 0. The kill switch and two limits (Owner page, Config tab).
insert into public.app_config (key, value, note)
select v.k, to_jsonb(v.n), v.t from (values
  ('techsheet_enabled', 0, 'Tech sheet: 0 off for everyone, 1 only Editors and the Owner, 2 everyone. Turn it to 0 to hide the feature at once; nothing is deleted.'),
  ('techsheet_daily_limit', 10, 'Tech sheet: most researched look-ups one player can ask for in a day (used once the research function is deployed)'),
  ('techsheet_batch_max', 25, 'Tech sheet: most catalog wines the Owner can research in one batch (used once the research function is deployed)')
) as v(k, n, t)
where not exists (select 1 from public.app_config c where c.key = v.k);

create or replace function public.techsheet_level() returns integer
language sql stable security definer set search_path to 'public' as $$
  select case when cfg_number('techsheet_enabled', 0) >= 2 then 2 when cfg_number('techsheet_enabled', 0) >= 1 then 1 else 0 end;
$$;
create or replace function public.techsheet_visible() returns boolean
language sql stable security definer set search_path to 'public' as $$
  select techsheet_level() >= 2 or (techsheet_level() = 1 and (has_permission('catalog_edit') or has_permission('settings_edit')));
$$;
revoke all on function public.techsheet_level() from public;   grant execute on function public.techsheet_level() to authenticated;
revoke all on function public.techsheet_visible() from public; grant execute on function public.techsheet_visible() to authenticated;

-- 1. Sites that Editors/Owner approved. kind 'producer' = the official site of one producer (producer_key = the producer's name folded to lower case words);
--    kind 'approved' = a site whose facts may count when two such sites agree.
create table if not exists public.fact_sources (
  "id" uuid primary key default gen_random_uuid(),
  domain text not null,
  kind text not null check (kind in ('producer', 'approved')),
  producer_key text not null default '',
  note text,
  approved_by uuid references auth.users("id") on delete set null,
  approved_at timestamptz not null default now()
);
create unique index if not exists fact_sources_uq on public.fact_sources (domain, kind, producer_key);

-- 2. Finds that are not confirmed yet (written by the research function; Editors approve or reject).
create table if not exists public.wine_fact_candidates (
  "id" uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('vintage', 'producer')),
  subject_key text not null,
  producer_key text,
  fact_key text not null check (fact_key in ('abv','bottle_size','closure','founded','owner_winemaker','estate_size','website','awards','residual_sugar','total_acidity','ph','so2_total')),
  value text not null,
  source_url text not null,
  domain text not null,
  quote text not null,
  quote_checked boolean not null default false,
  fetched_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  found_by text,
  created_at timestamptz not null default now()
);
create index if not exists wine_fact_candidates_subject on public.wine_fact_candidates (subject_type, subject_key);

-- 3. The confirmed facts for catalog wines (a vintage's own facts, or a producer's).
create table if not exists public.wine_facts (
  "id" uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('vintage', 'producer')),
  subject_key text not null,
  producer_key text,
  fact_key text not null check (fact_key in ('abv','bottle_size','closure','founded','owner_winemaker','estate_size','website','awards','residual_sugar','total_acidity','ph','so2_total')),
  value text not null,
  rule text not null check (rule in ('producer_source', 'two_sources', 'editor_entered')),
  sources jsonb not null default '[]'::jsonb,
  confirmed_at timestamptz not null default now(),
  confirmed_by uuid references auth.users("id") on delete set null,
  unique (subject_type, subject_key, fact_key)
);

-- 4. A player's own wine: what they entered themselves (status player_entered) and, later, what the research found for it (found / confirmed). Private to them.
create table if not exists public.my_wine_facts (
  "id" uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users("id") on delete set null,
  user_wine_id uuid not null,
  fact_key text not null check (fact_key in ('abv','bottle_size','closure','founded','owner_winemaker','estate_size','website','awards','residual_sugar','total_acidity','ph','so2_total')),
  value text not null,
  status text not null check (status in ('player_entered', 'found', 'confirmed')),
  rule text,
  sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_wine_id, fact_key)
);

-- 5. Row-level security.
alter table public.fact_sources enable row level security;
alter table public.wine_fact_candidates enable row level security;
alter table public.wine_facts enable row level security;
alter table public.my_wine_facts enable row level security;
drop policy if exists fact_sources_read on public.fact_sources;
drop policy if exists wine_fact_candidates_read on public.wine_fact_candidates;
drop policy if exists wine_facts_read on public.wine_facts;
drop policy if exists my_wine_facts_own on public.my_wine_facts;
create policy fact_sources_read on public.fact_sources for select using (techsheet_visible());
create policy wine_fact_candidates_read on public.wine_fact_candidates for select using (techsheet_visible());
create policy wine_facts_read on public.wine_facts for select using (techsheet_visible());
create policy my_wine_facts_own on public.my_wine_facts for all using (user_id = auth.uid() and techsheet_visible()) with check (user_id = auth.uid() and techsheet_visible() and status = 'player_entered');
-- No other writes: the tables are written only by the functions below (Editors) and by the research function (service role).

-- 6. Editor functions (catalog_edit). Each also refuses while the switch is 0.
create or replace function public.techsheet_set_source(p_domain text, p_kind text, p_producer_key text default null, p_note text default null) returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid; v_domain text := lower(trim(p_domain));
begin
  if not (has_permission('catalog_edit') and techsheet_visible()) then raise exception 'Not allowed.' using errcode = '42501'; end if;
  if p_kind not in ('producer', 'approved') then raise exception 'Choose producer site or approved source.'; end if;
  if v_domain !~ '^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$' then raise exception 'Write the site as a plain address such as domaine-example.fr'; end if;
  if p_kind = 'producer' and coalesce(trim(p_producer_key), '') = '' then raise exception 'A producer site needs the producer it belongs to.'; end if;
  insert into fact_sources (domain, kind, producer_key, note, approved_by)
    values (v_domain, p_kind, case when p_kind = 'producer' then lower(trim(p_producer_key)) else '' end, p_note, auth.uid())
    on conflict (domain, kind, producer_key) do update set note = excluded.note
    returning "id" into v_id;
  return v_id;
end $$;

create or replace function public.techsheet_remove_source(p_id uuid) returns void
language plpgsql security definer set search_path to 'public' as $$
begin
  if not (has_permission('catalog_edit') and techsheet_visible()) then raise exception 'Not allowed.' using errcode = '42501'; end if;
  delete from fact_sources where "id" = p_id;
end $$;

-- Types a fact in with the page it came from and the exact words on that page. The value is read by the app (techsheet.js) before it is sent.
create or replace function public.techsheet_enter_fact(p_subject_type text, p_subject_key text, p_producer_key text, p_fact_key text, p_value text, p_url text, p_quote text) returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid; v_domain text;
begin
  if not (has_permission('catalog_edit') and techsheet_visible()) then raise exception 'Not allowed.' using errcode = '42501'; end if;
  if p_subject_type not in ('vintage', 'producer') or coalesce(trim(p_subject_key), '') = '' then raise exception 'Choose the wine or producer.'; end if;
  if coalesce(trim(p_value), '') = '' or length(p_value) > 240 then raise exception 'Write the value.'; end if;
  if coalesce(trim(p_quote), '') = '' or length(p_quote) < 6 then raise exception 'Copy the exact words from the page as the quote.'; end if;
  v_domain := lower(regexp_replace(regexp_replace(coalesce(p_url, ''), '^[a-z]+://', ''), '^www\d?\.|/.*$', '', 'g'));
  if v_domain !~ '\.' then raise exception 'Give the address of the page the fact came from.'; end if;
  insert into wine_facts (subject_type, subject_key, producer_key, fact_key, value, rule, sources, confirmed_by)
    values (p_subject_type, p_subject_key, nullif(lower(trim(p_producer_key)), ''), p_fact_key, trim(p_value), 'editor_entered',
            jsonb_build_array(jsonb_build_object('url', p_url, 'domain', v_domain, 'quote', p_quote, 'fetched_at', now())), auth.uid())
    on conflict (subject_type, subject_key, fact_key) do update
      set value = excluded.value, rule = excluded.rule, sources = excluded.sources, confirmed_at = now(), confirmed_by = excluded.confirmed_by
    returning "id" into v_id;
  return v_id;
end $$;

-- Approving a find turns it into a confirmed fact (rule editor_entered: an editor judged it); rejecting it keeps it from coming back.
create or replace function public.techsheet_approve_candidate(p_id uuid) returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare c record; v_id uuid;
begin
  if not (has_permission('catalog_edit') and techsheet_visible()) then raise exception 'Not allowed.' using errcode = '42501'; end if;
  select * into c from wine_fact_candidates where "id" = p_id and status = 'pending';
  if not found then raise exception 'That find is no longer waiting.'; end if;
  insert into wine_facts (subject_type, subject_key, producer_key, fact_key, value, rule, sources, confirmed_by)
    values (c.subject_type, c.subject_key, c.producer_key, c.fact_key, c.value, 'editor_entered',
            jsonb_build_array(jsonb_build_object('url', c.source_url, 'domain', c.domain, 'quote', c.quote, 'fetched_at', c.fetched_at)), auth.uid())
    on conflict (subject_type, subject_key, fact_key) do update
      set value = excluded.value, rule = excluded.rule, sources = excluded.sources, confirmed_at = now(), confirmed_by = excluded.confirmed_by
    returning "id" into v_id;
  update wine_fact_candidates set status = 'confirmed' where "id" = p_id;
  return v_id;
end $$;
create or replace function public.techsheet_reject_candidate(p_id uuid) returns void
language plpgsql security definer set search_path to 'public' as $$
begin
  if not (has_permission('catalog_edit') and techsheet_visible()) then raise exception 'Not allowed.' using errcode = '42501'; end if;
  update wine_fact_candidates set status = 'rejected' where "id" = p_id and status = 'pending';
end $$;

revoke all on function public.techsheet_set_source(text, text, text, text) from public;                           grant execute on function public.techsheet_set_source(text, text, text, text) to authenticated;
revoke all on function public.techsheet_remove_source(uuid) from public;                                           grant execute on function public.techsheet_remove_source(uuid) to authenticated;
revoke all on function public.techsheet_enter_fact(text, text, text, text, text, text, text) from public;          grant execute on function public.techsheet_enter_fact(text, text, text, text, text, text, text) to authenticated;
revoke all on function public.techsheet_approve_candidate(uuid) from public;                                       grant execute on function public.techsheet_approve_candidate(uuid) to authenticated;
revoke all on function public.techsheet_reject_candidate(uuid) from public;                                        grant execute on function public.techsheet_reject_candidate(uuid) to authenticated;

-- Check afterwards (read-only):
--   select key, value from app_config where key like 'techsheet%';
--   select count(*) from wine_facts;

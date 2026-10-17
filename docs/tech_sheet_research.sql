-- TECH SHEET, part 2: the research pack (Owner/Editors file finds from a verified results file; the stored rule confirms them).
-- Run docs/tech_sheet.sql FIRST, then this whole script once in the Supabase SQL editor. Safe to run again. Additive only:
-- one new table and some techsheet_* functions; nothing existing is changed. Removal: docs/tech_sheet_remove.sql (see docs/TECHSHEET_REMOVAL.md).
-- Nobody but Editors/Owner (catalog_edit) can use these functions, and only while the switch techsheet_enabled is not 0.
-- The confirming rule below is the same one as confirmRule in techsheet.js (keep the two in step):
--   * a producer's own site (a fact_sources row of kind 'producer' for that producer) confirms a fact ALONE;
--   * otherwise two DIFFERENT sites from the approved list (fact_sources, any kind) must give the SAME value;
--   * any disagreement between those sites changes nothing (an Editor decides); a fact that already exists is never overwritten here.
--   * only finds whose quote was checked against the real page (quote_checked) count.

-- 1. Producer sites Claude suggested, waiting for an Editor to approve or dismiss.
create table if not exists public.fact_source_suggestions (
  "id" uuid primary key default gen_random_uuid(),
  producer_key text not null,
  domain text not null,
  evidence_url text,
  quote text,
  site_checked boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'approved', 'dismissed')),
  created_at timestamptz not null default now(),
  decided_by uuid references auth.users("id") on delete set null,
  decided_at timestamptz,
  unique (producer_key, domain)
);
alter table public.fact_source_suggestions enable row level security;
drop policy if exists fact_source_suggestions_read on public.fact_source_suggestions;
create policy fact_source_suggestions_read on public.fact_source_suggestions for select using (techsheet_visible() and has_permission('catalog_edit'));

-- 2. The rule, for one wine (or producer) and one field. Returns 'confirmed', 'conflict', 'waiting', 'exists' or 'none'.
create or replace function public.techsheet_confirm_by_rule(p_subject_type text, p_subject_key text, p_fact_key text) returns text
language plpgsql security definer set search_path to 'public' as $$
declare v_ids uuid[]; v_vals text[]; v_n integer; v_rule text;
begin
  if not (has_permission('catalog_edit') and techsheet_visible()) then raise exception 'Not allowed.' using errcode = '42501'; end if;
  if exists (select 1 from wine_facts f where f.subject_type = p_subject_type and f.subject_key = p_subject_key and f.fact_key = p_fact_key) then return 'exists'; end if;
  -- the producer's own site
  select array_agg(c."id"), array_agg(distinct c.value) into v_ids, v_vals
    from wine_fact_candidates c
    join fact_sources s on s.kind = 'producer' and s.domain = c.domain and s.producer_key = c.producer_key
   where c.subject_type = p_subject_type and c.subject_key = p_subject_key and c.fact_key = p_fact_key and c.status = 'pending' and c.quote_checked;
  if v_ids is not null then
    if array_length(v_vals, 1) > 1 then return 'conflict'; end if;
    v_rule := 'producer_source';
  else
    -- two different approved sites that agree
    select array_agg(c."id"), array_agg(distinct c.value) into v_ids, v_vals
      from wine_fact_candidates c
     where c.subject_type = p_subject_type and c.subject_key = p_subject_key and c.fact_key = p_fact_key and c.status = 'pending' and c.quote_checked
       and exists (select 1 from fact_sources s where s.domain = c.domain);
    if v_ids is null then return 'none'; end if;
    if array_length(v_vals, 1) > 1 then return 'conflict'; end if;
    select count(distinct c.domain) into v_n from wine_fact_candidates c where c."id" = any (v_ids);
    if v_n < 2 then return 'waiting'; end if;
    v_rule := 'two_sources';
  end if;
  insert into wine_facts (subject_type, subject_key, producer_key, fact_key, value, rule, sources)
    select p_subject_type, p_subject_key, min(c.producer_key), p_fact_key, v_vals[1], v_rule,
           jsonb_agg(jsonb_build_object('url', c.source_url, 'domain', c.domain, 'quote', c.quote, 'fetched_at', c.fetched_at))
      from wine_fact_candidates c where c."id" = any (v_ids)
    on conflict (subject_type, subject_key, fact_key) do nothing;
  update wine_fact_candidates set status = 'confirmed' where "id" = any (v_ids);
  return 'confirmed';
end $$;

-- 3. Run the rule for everything waiting. Returns how many were confirmed / in conflict / still waiting.
create or replace function public.techsheet_recheck_all() returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare r record; res text; n_ok integer := 0; n_conflict integer := 0; n_wait integer := 0;
begin
  if not (has_permission('catalog_edit') and techsheet_visible()) then raise exception 'Not allowed.' using errcode = '42501'; end if;
  for r in select distinct c.subject_type, c.subject_key, c.fact_key from wine_fact_candidates c where c.status = 'pending' and c.quote_checked loop
    res := techsheet_confirm_by_rule(r.subject_type, r.subject_key, r.fact_key);
    if res = 'confirmed' then n_ok := n_ok + 1; elsif res = 'conflict' then n_conflict := n_conflict + 1; elsif res in ('waiting', 'none') then n_wait := n_wait + 1; end if;
  end loop;
  return jsonb_build_object('confirmed', n_ok, 'conflict', n_conflict, 'waiting', n_wait);
end $$;

-- 4. Filing a verified results file. Every item is checked again here; anything that does not pass is skipped and counted.
create or replace function public.techsheet_import(p_items jsonb, p_sites jsonb default '[]'::jsonb) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare it jsonb; st text; sk text; fk text; v_url text; v_domain text; v_host text; v_quote text; v_value text; v_pk text; v_qc boolean; v_at timestamptz;
        n_added integer := 0; n_skipped integer := 0; n_sites integer := 0; v_rc jsonb;
begin
  if not (has_permission('catalog_edit') and techsheet_visible()) then raise exception 'Not allowed.' using errcode = '42501'; end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception 'The file has no list of finds.'; end if;
  if jsonb_array_length(p_items) > 500 then raise exception 'Too many finds in one file (500 at most).'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    fk := it ->> 'fact_key'; st := it ->> 'subject_type'; sk := trim(coalesce(it ->> 'subject_key', ''));
    v_url := coalesce(it ->> 'source_url', ''); v_domain := lower(coalesce(it ->> 'domain', ''));
    v_quote := trim(coalesce(it ->> 'quote', '')); v_value := trim(coalesce(it ->> 'value', '')); v_pk := lower(trim(coalesce(it ->> 'producer_key', '')));
    v_qc := (it ->> 'quote_checked') = 'true';
    v_host := lower(coalesce(substring(v_url from '^https?://([^/:?#]+)'), ''));
    begin v_at := (it ->> 'fetched_at')::timestamptz; exception when others then v_at := now(); end;
    v_at := coalesce(v_at, now());
    if fk is null or fk not in ('abv','bottle_size','closure','founded','owner_winemaker','estate_size','website','awards','residual_sugar','total_acidity','ph','so2_total')
       or st not in ('vintage', 'producer')
       or ((fk in ('founded','owner_winemaker','estate_size','website','awards')) <> (st = 'producer'))
       or sk = '' or v_value = '' or length(v_value) > 240
       or length(v_quote) < 6 or length(v_quote) > 600
       or v_url !~* '^https?://' or v_domain = '' or v_host = '' or not (v_host = v_domain or right(v_host, length(v_domain) + 1) = '.' || v_domain)
       or (st = 'vintage' and not exists (select 1 from wine_vintages wv where wv."id"::text = sk))
       or (st = 'producer' and v_pk = '')
    then n_skipped := n_skipped + 1; continue; end if;
    if exists (select 1 from wine_fact_candidates c where c.subject_type = st and c.subject_key = sk and c.fact_key = fk and c.domain = v_domain and c.value = v_value and c.status <> 'rejected') then n_skipped := n_skipped + 1; continue; end if;
    insert into wine_fact_candidates (subject_type, subject_key, producer_key, fact_key, value, source_url, domain, quote, quote_checked, fetched_at, found_by)
      values (st, sk, nullif(v_pk, ''), fk, v_value, v_url, v_domain, v_quote, v_qc,
              v_at, 'claude_pack:' || case when v_qc then coalesce(nullif(left(it ->> 'verified_by', 60), ''), 'checked') else 'not_checked' end);
    n_added := n_added + 1;
  end loop;
  if jsonb_typeof(p_sites) = 'array' then
    for it in select * from jsonb_array_elements(p_sites) loop
      v_pk := lower(trim(coalesce(it ->> 'producer_key', ''))); v_domain := lower(coalesce(it ->> 'domain', ''));
      if v_pk = '' or v_domain !~ '^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$' then n_skipped := n_skipped + 1; continue; end if;
      if exists (select 1 from fact_sources s where s.kind = 'producer' and s.domain = v_domain and s.producer_key = v_pk) then continue; end if;
      insert into fact_source_suggestions (producer_key, domain, evidence_url, quote, site_checked)
        values (v_pk, v_domain, left(it ->> 'evidence_url', 500), left(it ->> 'quote', 600), (it ->> 'site_checked') = 'true')
        on conflict (producer_key, domain) do nothing;
      if found then n_sites := n_sites + 1; end if;
    end loop;
  end if;
  v_rc := techsheet_recheck_all();
  return jsonb_build_object('added', n_added, 'skipped', n_skipped, 'sites', n_sites, 'recheck', v_rc);
end $$;

-- 5. Approve or dismiss a suggested producer site. Approving makes it that producer's official site and re-checks what was waiting.
create or replace function public.techsheet_decide_suggestion(p_id uuid, p_approve boolean) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare s record; v_rc jsonb := null;
begin
  if not (has_permission('catalog_edit') and techsheet_visible()) then raise exception 'Not allowed.' using errcode = '42501'; end if;
  select * into s from fact_source_suggestions where "id" = p_id and status = 'pending';
  if not found then raise exception 'That suggestion is no longer waiting.'; end if;
  if p_approve then
    insert into fact_sources (domain, kind, producer_key, note, approved_by) values (s.domain, 'producer', s.producer_key, 'Suggested by research; approved by an editor', auth.uid())
      on conflict (domain, kind, producer_key) do nothing;
  end if;
  update fact_source_suggestions set status = case when p_approve then 'approved' else 'dismissed' end, decided_by = auth.uid(), decided_at = now() where "id" = p_id;
  if p_approve then v_rc := techsheet_recheck_all(); end if;
  return jsonb_build_object('approved', p_approve, 'recheck', v_rc);
end $$;

-- 6. Adding a site by hand now also re-checks what was waiting (replaces the version from tech_sheet.sql).
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
  perform techsheet_recheck_all();
  return v_id;
end $$;

revoke all on function public.techsheet_confirm_by_rule(text, text, text) from public; grant execute on function public.techsheet_confirm_by_rule(text, text, text) to authenticated;
revoke all on function public.techsheet_recheck_all() from public;                     grant execute on function public.techsheet_recheck_all() to authenticated;
revoke all on function public.techsheet_import(jsonb, jsonb) from public;              grant execute on function public.techsheet_import(jsonb, jsonb) to authenticated;
revoke all on function public.techsheet_decide_suggestion(uuid, boolean) from public;  grant execute on function public.techsheet_decide_suggestion(uuid, boolean) to authenticated;

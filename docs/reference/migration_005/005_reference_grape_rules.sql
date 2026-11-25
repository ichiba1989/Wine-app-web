-- MIGRATION 005: Wine Education Master Reference: the grape-rule reconciliation and import workflow.
-- Release "005 r1 (2026-11-13)". Tested locally on a Supabase stack with the production state (hardening release 2, 001 r5, 001a, 002 r1,
-- 003 r1, 004 r1). NOT RUN ON THE LIVE DATABASE until the owner approves (docs/reference/migration_005/DEPLOY_005.md).
--
-- Why (docs/reference/migration_004/README.md, "Preparing the appellation_grape_rules reconciliation"): the app's code list (aocgrapes.js)
-- and the database table public.appellation_grape_rules both say which grapes an appellation's rules name. 005 turns the comparison into a
-- reviewed workflow, so that rules become reference facts (type rules_name_grape) only after the owner decides, with their sources:
--   1. STAGE: a batch of candidates, one per appellation and grape found in either list, each with what the code list says, the table's
--      row exactly as stored, and a state: agree, conflict (both name the pair but differ, or one names another principal grape for the
--      same appellation and type), code_only, table_only, unresolved (the appellation or grape is not in the catalog by its exact name),
--      needs_source (a code line not yet checked against the official text, or a table row with no recognisable source) or not_importable
--      (a code line of kind "usual": the rules allow two grapes equally and do not say which is in the bottle, so it is never a rule fact).
--   2. DECIDE (ref_review): accept the code list's version, accept the table's version, or reject. A conflict is never accepted silently:
--      the owner picks a side (or rejects); unresolved and not_importable candidates cannot be accepted; a side can be accepted only if it
--      has a source.
--   3. IMPORT (ref_edit): every accepted candidate not yet imported becomes a DRAFT rules_name_grape fact (place -> grape variety) with
--      qualifiers (rule, min_percent, style, origin) and DOCUMENTARY evidence from its source (a source record is created as a draft from
--      the line's own address, or reused); only when the appellation and the grape are linked (confirmed) to reference things and the type
--      is switched on (each reason is reported). Nothing is published: drafts go through ref_review like every fact (001's rules: the
--      source, its rights and version must be approved first).
-- The table's column names are not known to this repository, so a row is read whole (to_jsonb): its place and grape are the values that
-- are ids of geo_areas and grapes; its rule is the value that is one of the known rule words (sole, only, primary, main, principal,
-- permitted, accessory, secondary); its minimum percentage the number under a key that says percent/pct/min; its source a web address,
-- else the value under a key that says source. The raw row is kept with every candidate, so the owner reviews what is really stored.
-- What it never does: it changes no app table (appellation_grape_rules, geo_areas, grapes and aocgrapes.js are only read), publishes
-- nothing, switches no type on, and leaves reference_enabled as it is.

begin;

-- =====================================================================================================================================
-- 0. Preflight: stop, changing nothing, unless 004 r1 is in place and nothing was changed by hand since.
-- =====================================================================================================================================
do $$
declare
  c_release constant text := '005 r1 (2026-11-13)';
  v_rel004 text; v_md5_004 text; v_rel005 text; v_md5_005 text; v_foreign text;
begin
  if to_regclass('wine_reference.schema_migrations') is null then raise exception 'Preflight: migration 001 is not installed'; end if;
  select release, structure_md5 into v_rel004, v_md5_004 from wine_reference.schema_migrations where version = '004';
  if v_rel004 is distinct from '004 r1 (2026-11-13)' then raise exception 'Preflight: migration 004 release "004 r1 (2026-11-13)" is required (found "%")', v_rel004; end if;
  select string_agg(p.proname || '(' || pg_catalog.oidvectortypes(p.proargtypes) || ')', ', ') into v_foreign
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'ref\_%'
     and (p.proname, pg_catalog.oidvectortypes(p.proargtypes)) not in
         (('ref_published_names', 'text, text, integer'), ('ref_review', 'text, uuid, text, text, uuid'), ('ref_staff', 'text, jsonb'),
          ('ref_draft', 'text, jsonb'), ('ref_tools', 'text, jsonb'), ('ref_work', 'text, jsonb'), ('ref_rules', 'text, jsonb'));
  if v_foreign is not null then raise exception 'Preflight: unexpected function(s) in public: %. Stop and investigate.', v_foreign; end if;
  select release, structure_md5 into v_rel005, v_md5_005 from wine_reference.schema_migrations where version = '005';
  if not found then
    if wine_reference.fingerprint_004() is distinct from v_md5_004 then
      raise exception 'Preflight: the reference was changed by hand since migration 004 ran (structure drift). Stop and investigate.';
    end if;
  else
    if v_rel005 is distinct from c_release then
      raise exception 'Preflight: release "%" of migration 005 is applied, this file is "%". Never replay an edited 005; write migration 006.', v_rel005, c_release;
    end if;
    if to_regprocedure('wine_reference.fingerprint_005()') is null or wine_reference.fingerprint_005() is distinct from v_md5_005 then
      raise exception 'Preflight: the reference was changed by hand since migration 005 ran (structure drift). Stop and investigate.';
    end if;
  end if;
end $$;

-- =====================================================================================================================================
-- 1. The review batches and their candidates.
-- =====================================================================================================================================
create table if not exists wine_reference.rule_import_batches (
  id               uuid primary key default gen_random_uuid(),
  created_by       uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  code_lines       integer not null default 0,
  table_rows       integer not null default 0,
  table_columns    jsonb not null default '[]'::jsonb,
  note             text not null default '' check (length(note) <= 500)
);
create table if not exists wine_reference.rule_import_candidates (
  id               uuid primary key default gen_random_uuid(),
  batch_id         uuid not null references wine_reference.rule_import_batches(id),
  appellation      text not null,
  grape            text not null,
  style            text,
  geo_area_id      text,                 -- the catalog place found by its exact name (or named by the table row)
  grape_id         text,                 -- the catalog grape found by its exact name (or named by the table row)
  code_line        jsonb,                -- the aocgrapes.js line as sent (rule, checked, source, read ...)
  code_rule        text,                 -- normalised: sole | primary | usual
  table_row        jsonb,                -- the appellation_grape_rules row exactly as stored
  table_rule       text,                 -- normalised: sole | primary | permitted (null if no rule word was recognised)
  table_min_pct    numeric,
  table_source     text,
  state            text not null check (state in ('agree', 'conflict', 'code_only', 'table_only', 'unresolved', 'needs_source', 'not_importable')),
  reason           text not null default '',
  decision         text not null default 'pending' check (decision in ('pending', 'accept_code', 'accept_table', 'reject')),
  decided_by       uuid,
  decided_at       timestamptz,
  decision_note    text not null default '' check (length(decision_note) <= 500),
  claim_id         uuid references wine_reference.claims(id),
  imported_at      timestamptz,
  constraint rule_candidates_decided check ((decision = 'pending') = (decided_at is null)),
  constraint rule_candidates_imported check ((claim_id is null) = (imported_at is null)),
  constraint rule_candidates_import_needs_accept check (claim_id is null or decision in ('accept_code', 'accept_table'))
);
create index if not exists rule_candidates_batch on wine_reference.rule_import_candidates (batch_id, state);
alter table wine_reference.rule_import_batches enable row level security;
alter table wine_reference.rule_import_candidates enable row level security;
revoke all on wine_reference.rule_import_batches, wine_reference.rule_import_candidates from public, anon, authenticated, service_role;
comment on table wine_reference.rule_import_batches is 'Each staging of the grape-rule reconciliation (code list aocgrapes.js against appellation_grape_rules).';
comment on table wine_reference.rule_import_candidates is 'One appellation and grape per row, with what each list says, the state, the owner''s decision and the draft fact it became.';

-- A decision can move only from pending, and only to what the candidate allows (a side that exists and has a source; never an
-- unresolved or not-importable candidate). An imported candidate is frozen.
create or replace function wine_reference.check_rule_candidate() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if old.imported_at is not null and (new.decision <> old.decision or new.claim_id is distinct from old.claim_id) then
      raise exception 'This candidate was imported; change the fact itself instead' using errcode = '42501';
    end if;
    if (new.batch_id, new.appellation, new.grape, new.code_line, new.table_row, new.state) is distinct from (old.batch_id, old.appellation, old.grape, old.code_line, old.table_row, old.state) then
      raise exception 'A candidate''s content never changes; stage a new batch' using errcode = '42501';
    end if;
    if new.decision <> old.decision and old.decision <> 'pending' and new.decision <> 'pending' then
      raise exception 'Set the decision back to pending first' using errcode = '23514';
    end if;
  end if;
  if new.decision in ('accept_code', 'accept_table') then
    if new.state in ('unresolved', 'not_importable') then
      raise exception 'A % candidate cannot be accepted (%)', new.state, new.reason using errcode = '23514';
    end if;
    if new.decision = 'accept_code' and (new.code_line is null or coalesce(new.code_line ->> 'source', '') = '' or not coalesce((new.code_line ->> 'checked')::boolean, false)) then
      raise exception 'The code list''s version can be accepted only when it names a checked official source' using errcode = '23514';
    end if;
    if new.decision = 'accept_code' and new.code_rule = 'usual' then
      raise exception 'A "usual" line is practice, not a rule; it is never imported' using errcode = '23514';
    end if;
    if new.decision = 'accept_table' and (new.table_row is null or coalesce(new.table_source, '') = '' or new.table_rule is null) then
      raise exception 'The table''s version can be accepted only when its row has a recognisable rule and source' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['rule_import_batches', 'rule_import_candidates'] loop
    execute format('drop trigger if exists %I on wine_reference.%I', t || '_log', t);
    execute format('create trigger %I after insert or update or delete on wine_reference.%I for each row execute function wine_reference.log_change()', t || '_log', t);
    execute format('drop trigger if exists %I on wine_reference.%I', t || '_lock_first', t);
    execute format('create trigger %I before insert or update or delete on wine_reference.%I for each statement execute function wine_reference.lock_before_write()', t || '_lock_first', t);
    execute format('drop trigger if exists %I on wine_reference.%I', t || '_no_truncate', t);
    execute format('create trigger %I before truncate on wine_reference.%I for each statement execute function wine_reference.refuse_truncate()', t || '_no_truncate', t);
  end loop;
end $$;
drop trigger if exists rule_import_candidates_check on wine_reference.rule_import_candidates;
create trigger rule_import_candidates_check before insert or update on wine_reference.rule_import_candidates for each row execute function wine_reference.check_rule_candidate();

-- =====================================================================================================================================
-- 2. Internal helpers (no grants).
-- =====================================================================================================================================
-- The rule word in a table row, normalised: only/sole -> sole; main/primary/principal -> primary; permitted/accessory/secondary -> permitted.
create or replace function wine_reference.row_rule(p_row jsonb) returns text
language sql immutable set search_path = '' as $$
  select case w when 'sole' then 'sole' when 'only' then 'sole' when 'exclusive' then 'sole' when 'primary' then 'primary' when 'main' then 'primary'
                when 'principal' then 'primary' when 'permitted' then 'permitted' when 'accessory' then 'permitted' when 'secondary' then 'permitted' end
    from (select lower(btrim(e.value)) as w from jsonb_each_text(p_row) e) x
   where w in ('sole', 'only', 'exclusive', 'primary', 'main', 'principal', 'permitted', 'accessory', 'secondary') limit 1
$$;
create or replace function wine_reference.row_min_pct(p_row jsonb) returns numeric
language sql immutable set search_path = '' as $$
  select (e.value)::numeric from jsonb_each_text(p_row) e
   where e.key ~* '(percent|pct|min)' and e.value ~ '^[0-9]+(\.[0-9]+)?$' and (e.value)::numeric between 0 and 100 limit 1
$$;
create or replace function wine_reference.row_source(p_row jsonb) returns text
language sql immutable set search_path = '' as $$
  select coalesce((select e.value from jsonb_each_text(p_row) e where e.value ~* '^https?://' limit 1),
                  (select nullif(btrim(e.value), '') from jsonb_each_text(p_row) e where e.key ~* 'source' limit 1))
$$;
-- The code list's rule, normalised: only -> sole; main -> primary; usual stays usual (never imported).
create or replace function wine_reference.code_rule(p_rule text) returns text
language sql immutable set search_path = '' as $$
  select case lower(p_rule) when 'only' then 'sole' when 'main' then 'primary' when 'usual' then 'usual' end
$$;

-- STAGE: one new batch comparing the code list (p_lines) with the table. Returns the batch and its counts by state.
create or replace function wine_reference.stage_rules(p_lines jsonb, p_note text) returns jsonb
language plpgsql set search_path = '' as $$
declare
  v_batch uuid; v_rows jsonb := '[]'::jsonb; v_cols jsonb := '[]'::jsonb; ln jsonb; r jsonb; v_app text; v_grape text; v_row jsonb;
  v_state text; v_reason text; v_crule text; v_trule text; v_src text; v_pct numeric; v_used jsonb := '[]'::jsonb; v_other text; v_counts jsonb;
begin
  if to_regclass('public.appellation_grape_rules') is not null then
    execute 'select coalesce(jsonb_agg(to_jsonb(r)), ''[]''::jsonb) from public.appellation_grape_rules r' into v_rows;
    select coalesce(jsonb_agg(column_name order by ordinal_position), '[]'::jsonb) into v_cols from information_schema.columns
     where table_schema = 'public' and table_name = 'appellation_grape_rules';
  end if;
  insert into wine_reference.rule_import_batches (code_lines, table_rows, table_columns, note, created_by)
  values (jsonb_array_length(coalesce(p_lines, '[]'::jsonb)), jsonb_array_length(v_rows), v_cols, coalesce(p_note, ''), auth.uid()) returning id into v_batch;
  -- every code line, with the table row that names the same appellation and grape (if any)
  for ln in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    select min(a.id::text) into v_app from public.geo_areas a where lower(a.name) = lower(ln ->> 'appellation');
    select min(g.id::text) into v_grape from public.grapes g where lower(g.name) = lower(ln ->> 'grape');
    v_row := null;
    if v_app is not null and v_grape is not null then
      select x.value into v_row from jsonb_array_elements(v_rows) x
       where exists (select 1 from jsonb_each_text(x.value) e where e.value = v_app) and exists (select 1 from jsonb_each_text(x.value) e where e.value = v_grape) limit 1;
    end if;
    if v_row is not null then v_used := v_used || jsonb_build_array(v_row); end if;
    v_crule := wine_reference.code_rule(ln ->> 'rule'); v_trule := wine_reference.row_rule(v_row); v_src := wine_reference.row_source(v_row); v_pct := wine_reference.row_min_pct(v_row);
    -- another principal grape for the same appellation in the table, when the code list says this one is the only or main grape
    v_other := null;
    if v_app is not null and v_crule in ('sole', 'primary') then
      select string_agg(distinct g.name, ', ') into v_other from jsonb_array_elements(v_rows) x join public.grapes g on g.id::text in (select e.value from jsonb_each_text(x.value) e)
       where exists (select 1 from jsonb_each_text(x.value) e where e.value = v_app) and g.id::text <> coalesce(v_grape, '')
         and wine_reference.row_rule(x.value) in ('sole', 'primary');
    end if;
    if v_app is null or v_grape is null then
      v_state := 'unresolved'; v_reason := case when v_app is null then 'appellation not in the catalog by its exact name' else 'grape not in the catalog by its exact name' end;
    elsif v_crule = 'usual' then
      v_state := 'not_importable'; v_reason := 'a "usual" line is practice (the rules allow two grapes equally), not a rule';
    elsif v_row is not null and (v_trule is distinct from v_crule) then
      v_state := 'conflict'; v_reason := 'the code list says ' || coalesce(v_crule, '?') || ', the table says ' || coalesce(v_trule, 'no rule word');
    elsif v_other is not null then
      v_state := 'conflict'; v_reason := 'the table names another principal grape for this appellation: ' || v_other;
    elsif not coalesce((ln ->> 'checked')::boolean, false) or coalesce(ln ->> 'source', '') = '' then
      v_state := case when v_row is not null and v_src is not null then 'agree' else 'needs_source' end;
      v_reason := 'the code line is not yet checked against the official text' || case when v_row is not null and v_src is not null then '; the table''s row has a source' else '' end;
    elsif v_row is not null then v_state := 'agree'; v_reason := 'both name this grape with the same rule';
    else v_state := 'code_only'; v_reason := 'not in appellation_grape_rules';
    end if;
    insert into wine_reference.rule_import_candidates (batch_id, appellation, grape, style, geo_area_id, grape_id, code_line, code_rule, table_row, table_rule, table_min_pct, table_source, state, reason)
    values (v_batch, ln ->> 'appellation', ln ->> 'grape', ln ->> 'style', v_app, v_grape, ln, v_crule, v_row, v_trule, v_pct, v_src, v_state, v_reason);
  end loop;
  -- the table rows no code line named
  for r in select x.value from jsonb_array_elements(v_rows) x where not (v_used @> jsonb_build_array(x.value)) loop
    select min(a.id::text) into v_app from public.geo_areas a where a.id::text in (select e.value from jsonb_each_text(r) e);
    select min(g.id::text) into v_grape from public.grapes g where g.id::text in (select e.value from jsonb_each_text(r) e);
    v_trule := wine_reference.row_rule(r); v_src := wine_reference.row_source(r);
    v_state := case when v_app is null or v_grape is null then 'unresolved' when v_src is null or v_trule is null then 'needs_source' else 'table_only' end;
    v_reason := case v_state when 'unresolved' then 'the row''s place or grape is not in the catalog' when 'needs_source' then 'no recognisable source or rule word in the row' else 'not in the code list' end;
    insert into wine_reference.rule_import_candidates (batch_id, appellation, grape, geo_area_id, grape_id, table_row, table_rule, table_min_pct, table_source, state, reason)
    values (v_batch, coalesce((select a.name from public.geo_areas a where a.id::text = v_app), '?'), coalesce((select g.name from public.grapes g where g.id::text = v_grape), '?'),
            v_app, v_grape, r, v_trule, wine_reference.row_min_pct(r), v_src, v_state, v_reason);
  end loop;
  select jsonb_object_agg(state, n) into v_counts from (select state, count(*) n from wine_reference.rule_import_candidates where batch_id = v_batch group by state) s;
  return jsonb_build_object('batch_id', v_batch, 'table_found', to_regclass('public.appellation_grape_rules') is not null, 'counts', coalesce(v_counts, '{}'::jsonb));
end $$;

-- A draft source (regulation) and its version for an address or a title, reused when one with the same address exists and is live.
create or replace function wine_reference.rule_source_version(p_url text, p_title text, p_read date) returns uuid
language plpgsql set search_path = '' as $$
declare v_src uuid; v_ver uuid; v_url text := case when p_url ~* '^https?://' then p_url end;
begin
  if v_url is not null then
    select v.id into v_ver from wine_reference.source_versions v join wine_reference.sources s on s.id = v.source_id
     where v.url = v_url and v.status <> 'retired' and s.status <> 'retired' order by v.created_at limit 1;
    if v_ver is not null then return v_ver; end if;
  else
    select v.id into v_ver from wine_reference.source_versions v join wine_reference.sources s on s.id = v.source_id
     where v_url is null and s.title = left(p_title, 500) and s.kind = 'regulation' and v.status <> 'retired' and s.status <> 'retired' order by v.created_at limit 1;
    if v_ver is not null then return v_ver; end if;
  end if;
  insert into wine_reference.sources (kind, title, url, created_by) values ('regulation', left(p_title, 500), v_url, auth.uid()) returning id into v_src;
  insert into wine_reference.source_versions (source_id, version_label, retrieved_at, url, created_by)
  values (v_src, 'read ' || coalesce(p_read::text, current_date::text), coalesce(p_read::timestamptz, now()), v_url, auth.uid()) returning id into v_ver;
  return v_ver;
end $$;

-- IMPORT: every accepted, not yet imported candidate of the batch becomes a draft rules_name_grape fact with documentary evidence.
create or replace function wine_reference.import_rules(p_batch uuid) returns jsonb
language plpgsql set search_path = '' as $$
declare c record; v_place uuid; v_grape uuid; v_sv uuid; v_claim uuid; v_out jsonb := '[]'::jsonb; v_q jsonb; v_from_code boolean; v_made integer := 0;
begin
  if (select status from wine_reference.relationship_types where code = 'rules_name_grape') is distinct from 'active' then
    return jsonb_build_object('made', 0, 'waiting', 'the type "Its rules name the grape" (rules_name_grape) is still proposed: switch it on in Types first', 'results', '[]'::jsonb);
  end if;
  for c in select * from wine_reference.rule_import_candidates where batch_id = p_batch and decision in ('accept_code', 'accept_table') and claim_id is null order by appellation, grape loop
    v_place := (select entity_id from wine_reference.legacy_links where catalog_table = 'geo_areas' and catalog_id = c.geo_area_id and status = 'confirmed');
    v_grape := (select entity_id from wine_reference.legacy_links where catalog_table = 'grapes' and catalog_id = c.grape_id and status = 'confirmed');
    if v_place is null or v_grape is null then
      v_out := v_out || jsonb_build_object('appellation', c.appellation, 'grape', c.grape, 'result', case when v_place is null then 'the place is not linked (confirmed) yet' else 'the grape is not linked (confirmed) yet' end);
      continue;
    end if;
    v_from_code := c.decision = 'accept_code';
    v_q := jsonb_strip_nulls(jsonb_build_object('rule', case when v_from_code then c.code_rule else c.table_rule end,
             'min_percent', case when v_from_code then null else c.table_min_pct end, 'style', c.style,
             'origin', case when v_from_code then 'aocgrapes.js' else 'appellation_grape_rules' end));
    if exists (select 1 from wine_reference.claims x join wine_reference.claim_versions v on v.claim_id = x.id
                where x.subject_entity_id = v_place and x.relationship_type = 'rules_name_grape' and x.object_entity_id = v_grape and v.status <> 'retired'
                  and (v.qualifiers ->> 'style') is not distinct from c.style) then
      v_out := v_out || jsonb_build_object('appellation', c.appellation, 'grape', c.grape, 'result', 'already there');
      continue;
    end if;
    v_sv := case when v_from_code
                 then wine_reference.rule_source_version(c.code_line ->> 'source', 'Official rules: ' || c.appellation, nullif(c.code_line ->> 'read', '')::date)
                 else wine_reference.rule_source_version(c.table_source, coalesce(c.table_source, 'appellation_grape_rules'), null) end;
    insert into wine_reference.claims (subject_entity_id, relationship_type, object_entity_id, created_by)
    values (v_place, 'rules_name_grape', v_grape, auth.uid()) returning id into v_claim;
    perform wine_reference.write_claim_version(v_claim, jsonb_build_object('qualifiers', v_q,
      'change_note', 'grape rule imported after review from ' || (v_q ->> 'origin') || ' (batch ' || p_batch || '); approve the source first',
      'evidence', jsonb_build_array(jsonb_build_object('source_version_id', v_sv, 'modality', 'documentary', 'role', 'supports',
                   'locator', case when v_from_code then 'grape rules of the appellation (' || coalesce(c.style, 'all types') || ')' else 'appellation_grape_rules row' end))));
    update wine_reference.rule_import_candidates set claim_id = v_claim, imported_at = now() where id = c.id;
    v_made := v_made + 1;
    v_out := v_out || jsonb_build_object('appellation', c.appellation, 'grape', c.grape, 'result', 'made', 'claim_id', v_claim);
  end loop;
  return jsonb_build_object('made', v_made, 'results', v_out);
end $$;

-- =====================================================================================================================================
-- 3. public.ref_rules: the Grape rules workflow. Reads need any ref_* permission; staging and import need ref_edit; decisions ref_review.
-- =====================================================================================================================================
drop function if exists public.ref_rules(text, jsonb);
create function public.ref_rules(p_action text, p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d jsonb := coalesce(p_data, '{}'::jsonb); v_out jsonb; v_id uuid; v_n integer := 0; v_m integer := 0; v_err text[] := '{}'; v_batch uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if p_action in ('batches', 'candidates') then
    if not (public.has_permission('ref_edit') or public.has_permission('ref_review') or public.has_permission('ref_publish') or public.has_permission('ref_rights')) then
      raise exception 'Not allowed: needs a reference permission' using errcode = '42501';
    end if;
  else
    perform wine_reference.editorial_lock();
    perform wine_reference.require_permission(case when p_action = 'decide' then 'ref_review' else 'ref_edit' end);
  end if;
  case p_action
  when 'batches' then
    select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'created_at', b.created_at, 'code_lines', b.code_lines, 'table_rows', b.table_rows, 'table_columns', b.table_columns, 'note', b.note,
             'counts', (select jsonb_object_agg(state, n) from (select state, count(*) n from wine_reference.rule_import_candidates c where c.batch_id = b.id group by state) s),
             'decided', (select count(*) from wine_reference.rule_import_candidates c where c.batch_id = b.id and c.decision <> 'pending'),
             'imported', (select count(*) from wine_reference.rule_import_candidates c where c.batch_id = b.id and c.claim_id is not null)) order by b.created_at desc), '[]'::jsonb)
      into v_out from (select * from wine_reference.rule_import_batches order by created_at desc limit 20) b;
    return jsonb_build_object('batches', v_out);
  when 'candidates' then   -- {batch_id, state?}
    select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'appellation', c.appellation, 'grape', c.grape, 'style', c.style, 'state', c.state, 'reason', c.reason,
             'code_line', c.code_line, 'code_rule', c.code_rule, 'table_row', c.table_row, 'table_rule', c.table_rule, 'table_min_pct', c.table_min_pct, 'table_source', c.table_source,
             'decision', c.decision, 'decision_note', c.decision_note, 'claim_id', c.claim_id) order by c.state, c.appellation, c.grape), '[]'::jsonb)
      into v_out from wine_reference.rule_import_candidates c
     where c.batch_id = (d ->> 'batch_id')::uuid and (d ->> 'state' is null or c.state = d ->> 'state');
    return jsonb_build_object('candidates', v_out);
  when 'stage' then   -- {lines, note}
    if jsonb_typeof(d -> 'lines') is distinct from 'array' or jsonb_array_length(d -> 'lines') > 2000 then raise exception 'lines must be a list of at most 2000' using errcode = '22023'; end if;
    return wine_reference.stage_rules(d -> 'lines', d ->> 'note');
  when 'decide' then   -- {ids[], decision: accept_code | accept_table | reject | pending, note}: each on its own; refusals listed
    if d ->> 'decision' not in ('accept_code', 'accept_table', 'reject', 'pending') then raise exception 'Unknown decision' using errcode = '22023'; end if;
    for v_id in select (jsonb_array_elements_text(coalesce(d -> 'ids', '[]'::jsonb)))::uuid limit 500 loop
      v_m := v_m + 1;
      begin
        update wine_reference.rule_import_candidates
           set decision = d ->> 'decision', decision_note = left(coalesce(d ->> 'note', ''), 500),
               decided_by = case when d ->> 'decision' = 'pending' then null else auth.uid() end,
               decided_at = case when d ->> 'decision' = 'pending' then null else now() end
         where id = v_id;
        if found then v_n := v_n + 1; else v_err := v_err || (v_id::text || ': no such candidate'); end if;
      exception when others then v_err := v_err || (v_id::text || ': ' || sqlerrm);
      end;
    end loop;
    return jsonb_build_object('done', v_n, 'of', v_m, 'failed', to_jsonb(v_err[1:20]));
  when 'import' then   -- {batch_id}
    v_batch := (d ->> 'batch_id')::uuid;
    if not exists (select 1 from wine_reference.rule_import_batches where id = v_batch) then raise exception 'No such batch' using errcode = 'P0002'; end if;
    return wine_reference.import_rules(v_batch);
  else
    raise exception 'Unknown action %', p_action using errcode = '22023';
  end case;
end $$;
revoke all on function public.ref_rules(text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.ref_rules(text, jsonb) to authenticated;
do $$
declare f text;
begin
  foreach f in array array['wine_reference.check_rule_candidate()', 'wine_reference.row_rule(jsonb)', 'wine_reference.row_min_pct(jsonb)', 'wine_reference.row_source(jsonb)',
                           'wine_reference.code_rule(text)', 'wine_reference.stage_rules(jsonb, text)', 'wine_reference.rule_source_version(text, text, date)',
                           'wine_reference.import_rules(uuid)'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', f);
  end loop;
end $$;

-- Fingerprint after 005 (drift check on a replay of 005): the structure fingerprint covers every table, trigger and function of the schema.
create or replace function wine_reference.fingerprint_005() returns text
language sql stable set search_path = '' as $$
  select md5(wine_reference.fingerprint_004() || coalesce((select p.prosecdef || ' ' || coalesce(array_to_string(p.proconfig, ','), '') || ' ' || coalesce(p.proacl::text, '') || ' ' || md5(p.prosrc)
                                                              from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
                                                             where n.nspname = 'public' and p.proname = 'ref_rules'), ''))
$$;
revoke all on function wine_reference.fingerprint_005() from public, anon, authenticated, service_role;

-- =====================================================================================================================================
-- 4. Register.
-- =====================================================================================================================================
insert into wine_reference.schema_migrations (version, name, notes, release)
values ('005', 'reference grape-rule reconciliation and import workflow',
        'ref_rules; rule_import_batches, rule_import_candidates; stage, decide, import as draft rules_name_grape facts with documentary evidence; nothing published',
        '005 r1 (2026-11-13)')
on conflict (version) do nothing;
update wine_reference.schema_migrations set structure_md5 = wine_reference.fingerprint_005() where version = '005';

commit;

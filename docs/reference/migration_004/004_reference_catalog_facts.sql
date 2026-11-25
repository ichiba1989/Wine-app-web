-- MIGRATION 004: Wine Education Master Reference: grape and place-tree drafts from the old catalog, subject-area assignments, and the
-- grape-rules check. Release "004 r1 (2026-11-13)". Tested locally on a Supabase stack with the production state (hardening release 2,
-- 001 r5, 001a, 002 r1, 003 r1). NOT RUN ON THE LIVE DATABASE until the owner approves (docs/reference/migration_004/DEPLOY_004.md).
--
-- Why (docs/reference/migration_003/README.md, "Not in 003 (next)"):
--   1. made_from drafts from the catalog's LABEL grapes: for an edition already built from a catalog vintage, one draft "made from" fact
--      per grape the catalog says is on the wine's label (wine_grapes basis 'label', the bottle itself: product rule (1)), when that
--      grape row is linked (confirmed) to a grape variety. Grapes with basis rule or editor are not used (reported). No share is invented.
--   2. part_of drafts from the catalog's place tree: for an old geo_areas row with a parent, one draft "part of" fact when both places are
--      linked (confirmed). The catalog's tree is "old catalog, not verified" until a real source (a map, a regulation) is added.
--      Both kinds of draft are made only while their type is switched on (the owner's switch), and say "from the old catalog, not verified".
--   3. Subject-area assignments: a read of every assignment (thing, subject area, primary, status), for the Reference tab; assigning is
--      003's assign_taxonomy, reviewing is ref_review('taxonomy_assignments', ...).
--   4. The grape-rules check (preparing the reconciliation of public.appellation_grape_rules with the app's code list aocgrapes.js,
--      REFERENCE_MODEL.md section 6 rule 5): a READ-ONLY report. The app sends its code list; the report finds each line's appellation
--      and grape in the catalog by name and looks for a row of appellation_grape_rules that names both (it reads each row whole, so it
--      does not depend on that table's column names), and lists the table's rows that no code line matches. Nothing is changed.
--      A relationship type for an appellation's grape rule is added as PROPOSED (unusable until the owner switches it on).
-- What it never does: it changes no app table, row, view or existing function (appellation_grape_rules and wine_grapes are only read);
-- it adds no wine content; it switches no type on; reference_enabled stays as it is. Permissions: reads for any ref_* holder; drafts
-- need ref_edit (Owner only today, owner decision 5).

begin;

-- =====================================================================================================================================
-- 0. Preflight: stop, changing nothing, unless 003 r1 is in place and nothing was changed by hand since.
-- =====================================================================================================================================
do $$
declare
  c_release constant text := '004 r1 (2026-11-13)';
  v_rel003 text; v_md5_003 text; v_rel004 text; v_md5_004 text; v_foreign text;
begin
  if to_regclass('wine_reference.schema_migrations') is null then raise exception 'Preflight: migration 001 is not installed'; end if;
  select release, structure_md5 into v_rel003, v_md5_003 from wine_reference.schema_migrations where version = '003';
  if v_rel003 is distinct from '003 r1 (2026-11-08)' then raise exception 'Preflight: migration 003 release "003 r1 (2026-11-08)" is required (found "%")', v_rel003; end if;
  select string_agg(p.proname || '(' || pg_catalog.oidvectortypes(p.proargtypes) || ')', ', ') into v_foreign
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'ref\_%'
     and (p.proname, pg_catalog.oidvectortypes(p.proargtypes)) not in
         (('ref_published_names', 'text, text, integer'), ('ref_review', 'text, uuid, text, text, uuid'), ('ref_staff', 'text, jsonb'),
          ('ref_draft', 'text, jsonb'), ('ref_tools', 'text, jsonb'), ('ref_work', 'text, jsonb'));
  if v_foreign is not null then raise exception 'Preflight: unexpected function(s) in public: %. Stop and investigate.', v_foreign; end if;
  select release, structure_md5 into v_rel004, v_md5_004 from wine_reference.schema_migrations where version = '004';
  if not found then
    if wine_reference.fingerprint_003() is distinct from v_md5_003 then
      raise exception 'Preflight: the reference was changed by hand since migration 003 ran (structure drift). Stop and investigate.';
    end if;
  else
    if v_rel004 is distinct from c_release then
      raise exception 'Preflight: release "%" of migration 004 is applied, this file is "%". Never replay an edited 004; write migration 005.', v_rel004, c_release;
    end if;
    if to_regprocedure('wine_reference.fingerprint_004()') is null or wine_reference.fingerprint_004() is distinct from v_md5_004 then
      raise exception 'Preflight: the reference was changed by hand since migration 004 ran (structure drift). Stop and investigate.';
    end if;
  end if;
end $$;

-- =====================================================================================================================================
-- 1. Vocabulary: the appellation's grape rule as a claim type, PROPOSED (the owner decides whether rules become reference claims).
-- =====================================================================================================================================
insert into wine_reference.relationship_types (code, label, description, subject_kinds, object_kinds, allows_cycles, requires_dates, default_risk_tier, required_modality) values
  ('rules_name_grape', 'Its rules name the grape', 'An appellation''s official rules (cahier des charges, disciplinare ...) name this grape variety. Qualifiers: rule (only | main | usual, or sole | primary | permitted) and min_percent, as the text states. Publication needs documentary evidence (the rules themselves). PROPOSED: the owner decides whether appellation_grape_rules and aocgrapes.js become reference claims (REFERENCE_MODEL.md section 6 rule 5).',
   '{place}', '{grape_variety}', false, false, 1, 'documentary')
on conflict (code) do nothing;

-- =====================================================================================================================================
-- 2. Internal helpers (no grants).
-- =====================================================================================================================================
-- made_from drafts for the editions built from the given old vintages (or the next p_limit vintages with an edition).
create or replace function wine_reference.catalog_grapes(p_vintages text[], p_limit integer) returns jsonb
language plpgsql set search_path = '' as $$
declare r record; g record; v_edition uuid; v_grape uuid; v_out jsonb := '[]'::jsonb; v_facts jsonb; v_skipped jsonb;
begin
  if to_regclass('public.wine_grapes') is null then raise exception 'The catalog has no wine_grapes table' using errcode = '42P01'; end if;
  for r in select v.id::text as vid, v.wine_id::text as wid,
                  wine_reference.catalog_row_name('wine_vintages', v.id::text) as name
             from public.wine_vintages v
            where (p_vintages is null and exists (select 1 from wine_reference.legacy_links l where l.catalog_table = 'wine_vintages' and l.catalog_id = v.id::text and l.status <> 'rejected')
                   and exists (select 1 from public.wine_grapes wg where wg.wine_id = v.wine_id))
               or v.id::text = any (p_vintages)
            order by 3 limit p_limit loop
    v_facts := '[]'::jsonb; v_skipped := '[]'::jsonb;
    v_edition := wine_reference.linked_entity('wine_vintages', r.vid);
    if v_edition is null then
      v_out := v_out || jsonb_build_object('wine_vintage_id', r.vid, 'name', r.name, 'error', 'no edition yet: build product + edition first');
      continue;
    end if;
    for g in select wg.grape_id::text as gid, wg.basis::text as basis, gr.name::text as grape
               from public.wine_grapes wg join public.grapes gr on gr.id = wg.grape_id
              where wg.wine_id::text = r.wid order by gr.name loop
      if g.basis <> 'label' then
        v_skipped := v_skipped || jsonb_build_object('grape', g.grape, 'why', 'not from the label (' || g.basis || ')');
        continue;
      end if;
      v_grape := (select entity_id from wine_reference.legacy_links where catalog_table = 'grapes' and catalog_id = g.gid and status = 'confirmed');
      if v_grape is null then
        v_skipped := v_skipped || jsonb_build_object('grape', g.grape, 'why', 'grape not linked (confirmed) yet');
        continue;
      end if;
      v_facts := v_facts || jsonb_build_object('grape', g.grape, 'made_from', wine_reference.catalog_fact(v_edition, 'made_from', v_grape, null, null));
    end loop;
    v_out := v_out || jsonb_build_object('wine_vintage_id', r.vid, 'name', r.name, 'edition_id', v_edition, 'facts', v_facts, 'skipped', v_skipped);
  end loop;
  return v_out;
end $$;

-- part_of drafts from the old catalog's place tree (child -> parent), both places linked (confirmed).
create or replace function wine_reference.catalog_place_tree(p_limit integer) returns jsonb
language plpgsql set search_path = '' as $$
declare r record; v_made integer := 0; v_there integer := 0; v_wait integer := 0; v_proposed integer := 0; v_res text; v_examples jsonb := '[]'::jsonb;
begin
  for r in select g.id::text as cid, g.parent_id::text as pid, g.name::text as cname, p.name::text as pname,
                  (select entity_id from wine_reference.legacy_links where catalog_table = 'geo_areas' and catalog_id = g.id::text and status = 'confirmed') as ce,
                  (select entity_id from wine_reference.legacy_links where catalog_table = 'geo_areas' and catalog_id = g.parent_id::text and status = 'confirmed') as pe
             from public.geo_areas g join public.geo_areas p on p.id = g.parent_id
            order by p.name, g.name limit p_limit loop
    if r.ce is null or r.pe is null then
      v_wait := v_wait + 1;
      if jsonb_array_length(v_examples) < 20 then v_examples := v_examples || jsonb_build_object('place', r.cname, 'in', r.pname, 'result', 'waiting for both links to be confirmed'); end if;
      continue;
    end if;
    v_res := wine_reference.catalog_fact(r.ce, 'part_of', r.pe, null, null);
    if v_res = 'made' then v_made := v_made + 1; elsif v_res = 'type proposed' then v_proposed := v_proposed + 1; else v_there := v_there + 1; end if;
    if jsonb_array_length(v_examples) < 20 then v_examples := v_examples || jsonb_build_object('place', r.cname, 'in', r.pname, 'result', v_res); end if;
  end loop;
  return jsonb_build_object('made', v_made, 'already_there', v_there, 'waiting_for_links', v_wait, 'type_proposed', v_proposed, 'examples', v_examples);
end $$;

-- The grape-rules check. p_lines: [{appellation, grape, style, rule, checked, source, country}] from aocgrapes.js. Read-only.
create or replace function wine_reference.rule_grape_report(p_lines jsonb) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_rows jsonb := '[]'::jsonb; v_cols jsonb; ln jsonb; v_app uuid[]; v_grape uuid[]; v_hits jsonb; v_out jsonb := '[]'::jsonb; v_used jsonb := '[]'::jsonb;
  v_state text; v_extra jsonb;
begin
  if to_regclass('public.appellation_grape_rules') is null then
    return jsonb_build_object('table_found', false, 'lines', '[]'::jsonb, 'extra_rows', '[]'::jsonb);
  end if;
  execute 'select coalesce(jsonb_agg(to_jsonb(r)), ''[]''::jsonb) from public.appellation_grape_rules r' into v_rows;
  select jsonb_agg(column_name order by ordinal_position) into v_cols from information_schema.columns
   where table_schema = 'public' and table_name = 'appellation_grape_rules';
  for ln in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    select array_agg(a.id) into v_app from public.geo_areas a where lower(a.name) = lower(ln ->> 'appellation');
    select array_agg(g.id) into v_grape from public.grapes g where lower(g.name) = lower(ln ->> 'grape');
    -- a table row matches a line when, among its values, it holds one of the appellation's ids and one of the grape's ids
    select coalesce(jsonb_agg(x.row), '[]'::jsonb) into v_hits from (
      select r.value as row from jsonb_array_elements(v_rows) r
       where exists (select 1 from jsonb_each_text(r.value) e where e.value = any (coalesce(v_app, '{}')::text[]))
         and exists (select 1 from jsonb_each_text(r.value) e where e.value = any (coalesce(v_grape, '{}')::text[]))) x;
    v_state := case when v_app is null then 'appellation not in the catalog (exact name)'
                    when v_grape is null then 'grape not in the catalog (exact name)'
                    when jsonb_array_length(v_hits) = 0 then 'not in appellation_grape_rules'
                    else 'in both' end;
    v_used := v_used || v_hits;
    v_out := v_out || jsonb_build_object('appellation', ln ->> 'appellation', 'grape', ln ->> 'grape', 'style', ln ->> 'style', 'rule', ln ->> 'rule',
                                         'checked', ln -> 'checked', 'source', ln ->> 'source', 'state', v_state, 'table_rows', v_hits);
  end loop;
  -- rows of the table that no code line matched, with the names of the places and grapes they point at (looked up by id)
  select coalesce(jsonb_agg(jsonb_build_object('row', r.value,
           'places', (select jsonb_agg(a.name) from public.geo_areas a where a.id::text in (select e.value from jsonb_each_text(r.value) e)),
           'grapes', (select jsonb_agg(g.name) from public.grapes g where g.id::text in (select e.value from jsonb_each_text(r.value) e)))), '[]'::jsonb)
    into v_extra
    from jsonb_array_elements(v_rows) r where not (v_used @> jsonb_build_array(r.value));
  return jsonb_build_object('table_found', true, 'columns', v_cols, 'table_rows', jsonb_array_length(v_rows), 'lines', v_out, 'extra_rows', v_extra);
end $$;

-- =====================================================================================================================================
-- 3. public.ref_work: the Reference tab's tools added by 004. Reads need any ref_* permission; drafts need ref_edit.
-- =====================================================================================================================================
drop function if exists public.ref_work(text, jsonb);
create function public.ref_work(p_action text, p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d jsonb := coalesce(p_data, '{}'::jsonb); v_lim integer; v_out jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if p_action in ('assignments', 'rule_grape_report') then
    if not (public.has_permission('ref_edit') or public.has_permission('ref_review') or public.has_permission('ref_publish') or public.has_permission('ref_rights')) then
      raise exception 'Not allowed: needs a reference permission' using errcode = '42501';
    end if;
  else
    perform wine_reference.editorial_lock();
    perform wine_reference.require_permission('ref_edit');
  end if;
  v_lim := least(greatest(coalesce((d ->> 'limit')::integer, 100), 1), 2000);
  case p_action
  when 'assignments' then   -- {entity_id?, node?}: every live assignment with the thing's and the subject area's names
    select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'entity_id', a.entity_id, 'entity_name', wine_reference.display_name(a.entity_id),
             'node', n.code, 'node_name', wine_reference.display_name(n.entity_id), 'is_primary', a.is_primary, 'status', a.status) order by n.code), '[]'::jsonb)
      into v_out
      from wine_reference.taxonomy_assignments a join wine_reference.taxonomy_nodes n on n.entity_id = a.node_id
     where a.status <> 'retired' and (d ->> 'entity_id' is null or a.entity_id = (d ->> 'entity_id')::uuid) and (d ->> 'node' is null or n.code = d ->> 'node');
    return jsonb_build_object('assignments', v_out);
  when 'rule_grape_report' then   -- {lines: [...]} the app's code list; read-only
    if jsonb_typeof(d -> 'lines') is distinct from 'array' or jsonb_array_length(d -> 'lines') > 2000 then
      raise exception 'lines must be a list of at most 2000' using errcode = '22023';
    end if;
    return wine_reference.rule_grape_report(d -> 'lines');
  when 'catalog_grapes' then   -- {wine_vintage_ids?, limit}: made_from drafts from the label grapes
    return jsonb_build_object('results', wine_reference.catalog_grapes(
      case when d ? 'wine_vintage_ids' then array(select jsonb_array_elements_text(d -> 'wine_vintage_ids')) end, least(v_lim, 200)));
  when 'catalog_place_tree' then   -- {limit}: part_of drafts from the catalog's place tree
    return wine_reference.catalog_place_tree(v_lim);
  else
    raise exception 'Unknown action %', p_action using errcode = '22023';
  end case;
end $$;
revoke all on function public.ref_work(text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.ref_work(text, jsonb) to authenticated;
revoke all on function wine_reference.catalog_grapes(text[], integer) from public, anon, authenticated, service_role;
revoke all on function wine_reference.catalog_place_tree(integer) from public, anon, authenticated, service_role;
revoke all on function wine_reference.rule_grape_report(jsonb) from public, anon, authenticated, service_role;

-- Fingerprint after 004: 003's fingerprint plus the new door and helpers (drift check on a replay of 004).
create or replace function wine_reference.fingerprint_004() returns text
language sql stable set search_path = '' as $$
  select md5(wine_reference.fingerprint_003() || coalesce((select string_agg(n.nspname || '.' || p.proname || ' ' || p.prosecdef || ' ' || coalesce(array_to_string(p.proconfig, ','), '')
                                                                             || ' ' || coalesce(p.proacl::text, '') || ' ' || md5(p.prosrc), E'\n' order by n.nspname, p.proname)
                                                               from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
                                                              where (n.nspname = 'public' and p.proname = 'ref_work')
                                                                 or (n.nspname = 'wine_reference' and p.proname in ('catalog_grapes', 'catalog_place_tree', 'rule_grape_report'))), ''))
$$;
revoke all on function wine_reference.fingerprint_004() from public, anon, authenticated, service_role;

-- =====================================================================================================================================
-- 4. Register.
-- =====================================================================================================================================
insert into wine_reference.schema_migrations (version, name, notes, release)
values ('004', 'reference grape and place-tree drafts from the old catalog, assignments read, grape-rules check',
        'ref_work; made_from from label grapes; part_of from the catalog place tree; rules_name_grape (proposed); no type switched on',
        '004 r1 (2026-11-13)')
on conflict (version) do nothing;
update wine_reference.schema_migrations set structure_md5 = wine_reference.fingerprint_004() where version = '004';

commit;

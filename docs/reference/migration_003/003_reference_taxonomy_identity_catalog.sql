-- MIGRATION 003: Wine Education Master Reference: taxonomy tools, wine identity from the old catalog, and catalog matching.
-- Release "003 r1 (2026-11-08)". Tested locally on a Supabase stack with the production state (hardening release 2, 001 r5, 001a, 002 r1).
-- NOT RUN ON THE LIVE DATABASE until the owner approves (docs/reference/migration_003/DEPLOY_003.md).
--
-- Why (docs/REFERENCE_MODEL.md sections 2, 4, 5 and 6; docs/reference/migration_002/README.md, "Still later"):
--   A. Taxonomy. 001 made the tables (domains and nodes are entities, so their labels use the names table in any language; codes are
--      unique and frozen once approved; a node's parent is in the same domain; no cycles) but nothing could write them. 003 adds:
--      creating a domain or a node with its names, assigning a thing to a node, and IMPORTING a whole approved list in one go (a dry run
--      first, then the same call applies it; repeatable: codes already there are kept and only missing names or new sort orders are
--      added). An import must name the source version (the approved document), so every row keeps its provenance. The 14 domains and
--      the subdomains themselves are NOT in this file: they come only from the owner's approved list.
--   B. Wine identity. "Build product and edition from a catalog wine": for one old wine_vintages row, a draft wine product (its wines row)
--      and a draft edition (its year, or "unidentified non-vintage", REFERENCE_MODEL.md section 5), each with a suggested link, and the
--      draft facts that tie them together WHERE THE TYPE IS SWITCHED ON (edition_of, harvest_year, product_of and defined_by_place when
--      the producer or place is already linked). Every fact made this way is a draft marked "from the old catalog, not verified"; it
--      can be published only with evidence from a real source (001's rules). Bottle format stays proposed.
--   C. Catalog matching. legacy_links gains how a link was found (match_method, match_score) and three database rules that hold for
--      every path: a link's thing must be the kind its catalog table maps to; a catalog row that already has a confirmed link takes no
--      new suggestion; confirming one link turns the row's other suggestions to rejected (audited). Tools: suggest matches by exact name
--      (capitals and spaces ignored; never confirmed automatically), make drafts for unmatched rows (bulk), confirm or reject several at
--      once, confirm only the unambiguous suggestions (one suggestion for the row, found by exact name or made from that very row), undo
--      a confirmed link (it becomes rejected; history kept) or reopen a rejected one (back to suggested), and reports: coverage per table, the review queue, and catalog rows that
--      point to the same thing (duplicates in the old catalog, REFERENCE_MODEL.md section 6 rule 4).
-- What it never does: it changes no app table, row, view or existing function; it never writes the old catalog (only reads it); it adds
-- no wine content and no taxonomy content; it switches no type on; reference_enabled stays as it is. Everything it writes is a draft or a
-- suggestion, moved on only by the existing review (ref_review) or by an explicit decision.
-- Permissions (owner decision 5): ref_edit for drafts and suggestions; ref_review for link decisions; reads for any ref_* holder.

begin;

-- =====================================================================================================================================
-- 0. Preflight: stop, changing nothing, unless 002 r1 is in place and nothing was changed by hand since.
-- =====================================================================================================================================
do $$
declare
  c_release constant text := '003 r1 (2026-11-08)';
  v_rel002 text; v_md5_002 text; v_rel003 text; v_md5_003 text; v_foreign text;
begin
  if to_regclass('wine_reference.schema_migrations') is null then raise exception 'Preflight: migration 001 is not installed'; end if;
  select release, structure_md5 into v_rel002, v_md5_002 from wine_reference.schema_migrations where version = '002';
  if v_rel002 is distinct from '002 r1 (2026-11-08)' then raise exception 'Preflight: migration 002 release "002 r1 (2026-11-08)" is required (found "%")', v_rel002; end if;
  select string_agg(p.proname || '(' || pg_catalog.oidvectortypes(p.proargtypes) || ')', ', ') into v_foreign
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'ref\_%'
     and (p.proname, pg_catalog.oidvectortypes(p.proargtypes)) not in
         (('ref_published_names', 'text, text, integer'), ('ref_review', 'text, uuid, text, text, uuid'), ('ref_staff', 'text, jsonb'),
          ('ref_draft', 'text, jsonb'), ('ref_tools', 'text, jsonb'));
  if v_foreign is not null then raise exception 'Preflight: unexpected function(s) in public: %. Stop and investigate.', v_foreign; end if;
  select release, structure_md5 into v_rel003, v_md5_003 from wine_reference.schema_migrations where version = '003';
  if not found then
    if wine_reference.fingerprint_002() is distinct from v_md5_002 then
      raise exception 'Preflight: the reference was changed by hand since migration 002 ran (structure drift). Stop and investigate.';
    end if;
  else
    if v_rel003 is distinct from c_release then
      raise exception 'Preflight: release "%" of migration 003 is applied, this file is "%". Never replay an edited 003; write migration 004.', v_rel003, c_release;
    end if;
    if to_regprocedure('wine_reference.fingerprint_003()') is null or wine_reference.fingerprint_003() is distinct from v_md5_003 then
      raise exception 'Preflight: the reference was changed by hand since migration 003 ran (structure drift). Stop and investigate.';
    end if;
  end if;
end $$;

-- =====================================================================================================================================
-- 1. Catalog links: how a link was found, and the rules every path must keep.
-- =====================================================================================================================================
alter table wine_reference.legacy_links add column if not exists match_method text not null default 'editor';
alter table wine_reference.legacy_links add column if not exists match_score smallint;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'legacy_links_match_method_check') then
    alter table wine_reference.legacy_links add constraint legacy_links_match_method_check
      check (match_method in ('editor', 'exact_name', 'created_from_catalog'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'legacy_links_match_score_check') then
    alter table wine_reference.legacy_links add constraint legacy_links_match_score_check check (match_score is null or match_score between 0 and 100);
  end if;
end $$;
comment on column wine_reference.legacy_links.match_method is 'How the link was found: editor (picked by hand), exact_name (same name, capitals and spaces ignored), created_from_catalog (the thing was drafted from this very row).';
comment on column wine_reference.legacy_links.match_score is 'For exact_name: 100 when it was the only candidate, 50 when several things had the name. Never a reason to confirm by itself.';

-- The kind of reference thing each old catalog table stands for (REFERENCE_MODEL.md section 6 rule 3).
create or replace function wine_reference.catalog_kind(p_table text) returns text
language sql immutable set search_path = '' as $$
  select case p_table when 'producers' then 'producer' when 'wines' then 'wine_product' when 'wine_vintages' then 'wine_edition'
                      when 'grapes' then 'grape_variety' when 'geo_areas' then 'place' end
$$;

-- Does the old catalog row exist? (read-only; the catalog is never written)
create or replace function wine_reference.catalog_row_exists(p_table text, p_id text) returns boolean
language plpgsql stable set search_path = '' as $$
declare v boolean;
begin
  if wine_reference.catalog_kind(p_table) is null then return false; end if;
  execute format('select exists (select 1 from public.%I where id::text = $1)', p_table) into v using p_id;
  return v;
end $$;

-- The name an old catalog row is shown by (as stored; nothing is respelled).
create or replace function wine_reference.catalog_row_name(p_table text, p_id text) returns text
language sql stable set search_path = '' as $$
  select case p_table
    when 'producers' then (select p.name from public.producers p where p.id::text = p_id)
    when 'grapes' then (select g.name from public.grapes g where g.id::text = p_id)
    when 'geo_areas' then (select g.name from public.geo_areas g where g.id::text = p_id)
    when 'wines' then (select btrim(coalesce(p.name || ' ', '') || coalesce(w.name, '')) from public.wines w left join public.producers p on p.id = w.producer_id where w.id::text = p_id)
    when 'wine_vintages' then (select btrim(coalesce(p.name || ' ', '') || coalesce(w.name, '')) || ' ' || case when v.is_non_vintage then 'NV' else coalesce(v.vintage_year::text, '?') end
                                 from public.wine_vintages v join public.wines w on w.id = v.wine_id left join public.producers p on p.id = w.producer_id where v.id::text = p_id)
  end
$$;

-- Before a link is written or changed: the right kind of thing, a catalog row that exists, a live thing, one confirmed link per row,
-- and only the moves suggested -> confirmed | rejected, confirmed -> rejected (undo) and rejected -> suggested (reopen, to decide again).
-- A rejected link never jumps straight to confirmed. What a link points at never changes.
create or replace function wine_reference.check_legacy_link() returns trigger
language plpgsql set search_path = '' as $$
declare v_kind text; v_ent record;
begin
  if tg_op = 'UPDATE' then
    if new.catalog_table <> old.catalog_table or new.catalog_id <> old.catalog_id or new.entity_id <> old.entity_id then
      raise exception 'A link''s catalog row and thing never change; reject it and make a new one' using errcode = '42501';
    end if;
    if old.status = new.status then return new; end if;
    if not ((old.status = 'suggested' and new.status in ('confirmed', 'rejected')) or (old.status = 'confirmed' and new.status = 'rejected')
            or (old.status = 'rejected' and new.status = 'suggested')) then
      raise exception 'A link cannot go from % to %', old.status, new.status using errcode = '23514';
    end if;
  end if;
  select kind, status, superseded_by into v_ent from wine_reference.entities where id = new.entity_id;
  v_kind := wine_reference.catalog_kind(new.catalog_table);
  if v_ent.kind is distinct from v_kind then
    raise exception 'A % row can only be linked to a % (this is a %)', new.catalog_table, v_kind, coalesce(v_ent.kind, 'missing thing') using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then
    if not wine_reference.catalog_row_exists(new.catalog_table, new.catalog_id) then
      raise exception 'No % row with id %', new.catalog_table, new.catalog_id using errcode = '23503';
    end if;
    if new.status <> 'suggested' then raise exception 'A new link starts as suggested' using errcode = '23514'; end if;
    if exists (select 1 from wine_reference.legacy_links l where l.catalog_table = new.catalog_table and l.catalog_id = new.catalog_id and l.status = 'confirmed') then
      raise exception 'This catalog row already has a confirmed link; undo that one first' using errcode = '23505';
    end if;
  end if;
  if tg_op = 'UPDATE' and new.status = 'suggested' and exists (select 1 from wine_reference.legacy_links l where l.catalog_table = new.catalog_table
                                                                 and l.catalog_id = new.catalog_id and l.status = 'confirmed') then
    raise exception 'This catalog row already has a confirmed link; undo that one first' using errcode = '23505';
  end if;
  if (tg_op = 'INSERT' or new.status in ('confirmed', 'suggested')) and (v_ent.status = 'retired' or v_ent.superseded_by is not null) then
    raise exception 'That thing is retired or replaced; link the thing that replaced it' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists legacy_links_check on wine_reference.legacy_links;
create trigger legacy_links_check before insert or update on wine_reference.legacy_links for each row execute function wine_reference.check_legacy_link();

-- After a link is confirmed, the same row's other suggestions are rejected (each change is logged by legacy_links_log).
create or replace function wine_reference.settle_legacy_link() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'confirmed' and old.status = 'suggested' then
    update wine_reference.legacy_links set status = 'rejected', decided_by = auth.uid(), decided_at = now(),
           note = left(btrim(note || ' another link for this catalog row was confirmed'), 500)
     where catalog_table = new.catalog_table and catalog_id = new.catalog_id and status = 'suggested' and id <> new.id;
  end if;
  return null;
end $$;
drop trigger if exists legacy_links_settle on wine_reference.legacy_links;
create trigger legacy_links_settle after update on wine_reference.legacy_links for each row execute function wine_reference.settle_legacy_link();

-- =====================================================================================================================================
-- 2. Internal helpers for the tools (no grants: only the tools call them).
-- =====================================================================================================================================
-- A draft thing with its first name (preferred), as the signed-in author.
create or replace function wine_reference.make_entity(p_kind text, p_name text, p_language text, p_name_kind text, p_note text) returns uuid
language plpgsql set search_path = '' as $$
declare v uuid;
begin
  if coalesce(btrim(p_name), '') = '' then raise exception 'A name is needed' using errcode = '22023'; end if;
  insert into wine_reference.entities (kind, note, created_by) values (p_kind, coalesce(p_note, ''), auth.uid()) returning id into v;
  insert into wine_reference.entity_names (entity_id, name, language, name_kind, is_preferred, created_by)
  values (v, btrim(p_name), coalesce(nullif(p_language, ''), 'und'), coalesce(nullif(p_name_kind, ''), 'common'), true, auth.uid());
  return v;
end $$;

-- Names given as [{name, language, script, name_kind}]: each added once (same name, language and kind are skipped); the first name in
-- a language becomes preferred when the thing has no preferred name in that language yet. Returns how many were added.
create or replace function wine_reference.add_names(p_entity uuid, p_names jsonb, p_default_kind text) returns integer
language plpgsql set search_path = '' as $$
declare n jsonb; v_lang text; v_kind text; v_count integer := 0;
begin
  for n in select * from jsonb_array_elements(coalesce(p_names, '[]'::jsonb)) loop
    if coalesce(btrim(n ->> 'name'), '') = '' then continue; end if;
    v_lang := coalesce(nullif(n ->> 'language', ''), 'und'); v_kind := coalesce(nullif(n ->> 'name_kind', ''), p_default_kind);
    if exists (select 1 from wine_reference.entity_names x where x.entity_id = p_entity and lower(x.name) = lower(btrim(n ->> 'name'))
                and x.language = v_lang and x.name_kind = v_kind and x.valid_from is null) then continue; end if;
    insert into wine_reference.entity_names (entity_id, name, language, script, name_kind, is_preferred, created_by)
    values (p_entity, btrim(n ->> 'name'), v_lang, nullif(n ->> 'script', ''), v_kind,
            not exists (select 1 from wine_reference.entity_names x where x.entity_id = p_entity and x.language = v_lang and x.is_preferred
                         and x.valid_to is null and x.status <> 'retired'),
            auth.uid());
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- A suggested link (nothing happens if this row already points at this thing, or the row already has a confirmed link).
create or replace function wine_reference.suggest_link(p_table text, p_id text, p_entity uuid, p_method text, p_score smallint, p_note text) returns uuid
language plpgsql set search_path = '' as $$
declare v uuid;
begin
  if exists (select 1 from wine_reference.legacy_links where catalog_table = p_table and catalog_id = p_id and (entity_id = p_entity or status = 'confirmed')) then
    return null;
  end if;
  insert into wine_reference.legacy_links (catalog_table, catalog_id, entity_id, note, match_method, match_score, created_by)
  values (p_table, p_id, p_entity, coalesce(p_note, ''), p_method, p_score, auth.uid()) returning id into v;
  return v;
end $$;

-- The thing an old catalog row stands for: its confirmed link, else its one live suggestion (several suggestions: none, undecided).
create or replace function wine_reference.linked_entity(p_table text, p_id text) returns uuid
language sql stable set search_path = '' as $$
  select coalesce(
    (select entity_id from wine_reference.legacy_links where catalog_table = p_table and catalog_id = p_id and status = 'confirmed'),
    (select min(entity_id::text)::uuid from wine_reference.legacy_links where catalog_table = p_table and catalog_id = p_id and status = 'suggested'
      having count(*) = 1))
$$;

-- A draft fact from the old catalog, only when its type is switched on and the same fact (any status but retired) is not there yet.
-- Returns 'made', or why not ('type proposed', 'already there').
create or replace function wine_reference.catalog_fact(p_subject uuid, p_rel text, p_object uuid, p_attr text, p_value jsonb) returns text
language plpgsql set search_path = '' as $$
declare v_claim uuid;
begin
  if p_rel is not null and (select status from wine_reference.relationship_types where code = p_rel) is distinct from 'active' then return 'type proposed'; end if;
  if p_attr is not null and (select status from wine_reference.attribute_types where code = p_attr) is distinct from 'active' then return 'type proposed'; end if;
  if exists (select 1 from wine_reference.claims c where c.subject_entity_id = p_subject
               and c.relationship_type is not distinct from p_rel and c.object_entity_id is not distinct from p_object and c.attribute_type is not distinct from p_attr
               and exists (select 1 from wine_reference.claim_versions v where v.claim_id = c.id and v.status <> 'retired')) then
    return 'already there';
  end if;
  insert into wine_reference.claims (subject_entity_id, relationship_type, object_entity_id, attribute_type, created_by)
  values (p_subject, p_rel, p_object, p_attr, auth.uid()) returning id into v_claim;
  perform wine_reference.write_claim_version(v_claim, coalesce(p_value, '{}'::jsonb)
            || jsonb_build_object('change_note', 'from the old catalog, not verified: add evidence from a real source before approving'));
  return 'made';
end $$;

-- Product and edition for one old wine_vintages row (section B above). Returns what was made, reused and skipped, with reasons.
create or replace function wine_reference.catalog_identity(p_vintage text) returns jsonb
language plpgsql set search_path = '' as $$
declare r record; v_product uuid; v_edition uuid; v_producer uuid; v_place uuid; v_name text; v_made text[] := '{}'; v_facts jsonb := '{}'::jsonb;
begin
  select v.id::text as vid, v.vintage_year, v.is_non_vintage, w.id::text as wid, w.producer_id::text as pid, w.appellation_id::text as aid,
         btrim(coalesce(p.name || ' ', '') || coalesce(w.name, '')) as pname
    into r
    from public.wine_vintages v join public.wines w on w.id = v.wine_id left join public.producers p on p.id = w.producer_id
   where v.id::text = p_vintage;
  if not found then raise exception 'No wine_vintages row with id %', p_vintage using errcode = 'P0002'; end if;
  if coalesce(r.pname, '') = '' then raise exception 'This catalog wine has no producer or name to make a product from' using errcode = '22023'; end if;
  -- the product (one per old wines row)
  v_product := wine_reference.linked_entity('wines', r.wid);
  if v_product is null then
    if exists (select 1 from wine_reference.legacy_links where catalog_table = 'wines' and catalog_id = r.wid and status = 'suggested') then
      raise exception 'This catalog wine has several suggested products; decide those links first' using errcode = '23505';
    end if;
    v_product := wine_reference.make_entity('wine_product', r.pname, 'und', 'label', 'from the old catalog (wines ' || r.wid || '), not verified');
    perform wine_reference.suggest_link('wines', r.wid, v_product, 'created_from_catalog', null, 'product drafted from this catalog wine');
    v_made := array_append(v_made, 'product');
  end if;
  -- the edition (one per old wine_vintages row): the stated year, or "unidentified non-vintage" (REFERENCE_MODEL.md section 5)
  v_edition := wine_reference.linked_entity('wine_vintages', r.vid);
  if v_edition is null then
    if exists (select 1 from wine_reference.legacy_links where catalog_table = 'wine_vintages' and catalog_id = r.vid and status = 'suggested') then
      raise exception 'This catalog vintage has several suggested editions; decide those links first' using errcode = '23505';
    end if;
    v_name := r.pname || ' ' || case when r.is_non_vintage or r.vintage_year is null then 'NV (unidentified non-vintage)' else r.vintage_year::text end;
    v_edition := wine_reference.make_entity('wine_edition', v_name, 'und', 'label', 'from the old catalog (wine_vintages ' || r.vid || '), not verified');
    perform wine_reference.suggest_link('wine_vintages', r.vid, v_edition, 'created_from_catalog', null, 'edition drafted from this catalog vintage');
    v_made := array_append(v_made, 'edition');
  end if;
  -- the facts that tie them, only where the type is switched on (otherwise they are listed as waiting for the type)
  v_facts := v_facts || jsonb_build_object('edition_of', wine_reference.catalog_fact(v_edition, 'edition_of', v_product, null, null));
  if not coalesce(r.is_non_vintage, false) and r.vintage_year is not null then
    v_facts := v_facts || jsonb_build_object('harvest_year', wine_reference.catalog_fact(v_edition, null, null, 'harvest_year', jsonb_build_object('value_number', r.vintage_year)));
  else
    v_facts := v_facts || jsonb_build_object('harvest_year', 'non-vintage: nothing stated');
  end if;
  v_producer := case when r.pid is not null then (select entity_id from wine_reference.legacy_links where catalog_table = 'producers' and catalog_id = r.pid and status = 'confirmed') end;
  v_facts := v_facts || jsonb_build_object('product_of', case when v_producer is null then 'producer not linked (confirmed) yet'
                                                              else wine_reference.catalog_fact(v_product, 'product_of', v_producer, null, null) end);
  v_place := case when r.aid is not null then (select entity_id from wine_reference.legacy_links where catalog_table = 'geo_areas' and catalog_id = r.aid and status = 'confirmed') end;
  v_facts := v_facts || jsonb_build_object('defined_by_place', case when r.aid is null then 'no place in the catalog' when v_place is null then 'place not linked (confirmed) yet'
                                                                    else wine_reference.catalog_fact(v_product, 'defined_by_place', v_place, null, null) end);
  return jsonb_build_object('wine_vintage_id', r.vid, 'product_id', v_product, 'edition_id', v_edition, 'made', to_jsonb(v_made), 'facts', v_facts);
end $$;

-- Every old catalog row of a table with the name it is shown by (read-only).
create or replace function wine_reference.catalog_rows(p_table text) returns table (catalog_id text, name text, detail text)
language plpgsql stable set search_path = '' as $$
begin
  if p_table = 'producers' then return query select p.id::text, p.name::text, ''::text from public.producers p;
  elsif p_table = 'grapes' then return query select g.id::text, g.name::text, ''::text from public.grapes g;
  elsif p_table = 'geo_areas' then return query select g.id::text, g.name::text, g.level::text from public.geo_areas g;
  elsif p_table = 'wines' then
    return query select w.id::text, btrim(coalesce(p.name || ' ', '') || coalesce(w.name, ''))::text, coalesce(w.style::text, '')
                   from public.wines w left join public.producers p on p.id = w.producer_id;
  elsif p_table = 'wine_vintages' then
    return query select v.id::text, (btrim(coalesce(p.name || ' ', '') || coalesce(w.name, '')) || ' ' || case when v.is_non_vintage then 'NV' else coalesce(v.vintage_year::text, '?') end)::text,
                        case when v.is_non_vintage then 'non-vintage' else '' end::text
                   from public.wine_vintages v join public.wines w on w.id = v.wine_id left join public.producers p on p.id = w.producer_id;
  else raise exception 'table must be producers, wines, wine_vintages, grapes or geo_areas' using errcode = '22023';
  end if;
end $$;

-- A thing's display name (preferred English, else any preferred, else any) for reports.
create or replace function wine_reference.display_name(p_entity uuid) returns text
language sql stable set search_path = '' as $$
  select n.name from wine_reference.entity_names n where n.entity_id = p_entity and n.status <> 'retired'
   order by (n.is_preferred and n.language = 'en') desc, n.is_preferred desc, n.created_at limit 1
$$;

-- One taxonomy entry's names as [{name, language, script, status, is_preferred}].
create or replace function wine_reference.names_json(p_entity uuid) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'name', n.name, 'language', n.language, 'script', n.script, 'name_kind', n.name_kind,
                                               'status', n.status, 'is_preferred', n.is_preferred) order by n.language, n.is_preferred desc, n.name), '[]'::jsonb)
    from wine_reference.entity_names n where n.entity_id = p_entity
$$;

-- Import (or dry-run) an approved taxonomy list. p: {source_version_id, dry_run, name_kind, domains: [{code, sort_order, names: [...],
-- nodes: [{code, parent, sort_order, names: [...]}]}]}. Parents are listed before their children (the Reference tab's reader sorts them).
-- Codes already there are kept: their domain and parent must match (else a conflict); missing names are added; a new sort order is
-- applied. Nothing is retired: codes in the database that the file does not list are reported (not_in_file) for the owner to decide.
create or replace function wine_reference.import_taxonomy(p jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare
  v_dry boolean := coalesce((p ->> 'dry_run')::boolean, true); v_sv uuid := nullif(p ->> 'source_version_id', '')::uuid;
  v_kind text := coalesce(nullif(p ->> 'name_kind', ''), 'official');
  dom jsonb; nd jsonb; v_dom uuid; v_node uuid; v_parent uuid; v_code text; v_pcode text; r record;
  v_new_domains text[] := '{}'; v_new_nodes text[] := '{}'; v_sort text[] := '{}'; v_conf text[] := '{}'; v_names integer := 0;
  v_seen text[] := '{}'; v_codes_in_file text[] := '{}'; v_ndom integer := 0; v_nnode integer := 0; v_lang_names integer;
begin
  if v_sv is null then raise exception 'Name the approved document: source_version_id is required (create the source first)' using errcode = '22023'; end if;
  if not exists (select 1 from wine_reference.source_versions where id = v_sv and status <> 'retired') then
    raise exception 'No live source version %', v_sv using errcode = 'P0002';
  end if;
  if jsonb_typeof(p -> 'domains') is distinct from 'array' then raise exception 'domains must be a list' using errcode = '22023'; end if;
  for dom in select * from jsonb_array_elements(p -> 'domains') loop
    v_ndom := v_ndom + 1; v_nnode := v_nnode + coalesce(jsonb_array_length(dom -> 'nodes'), 0);
  end loop;
  if v_ndom > 50 or v_nnode > 3000 then raise exception 'Too large for one import (% domains, % nodes; at most 50 and 3000)', v_ndom, v_nnode using errcode = '22023'; end if;
  for dom in select * from jsonb_array_elements(p -> 'domains') loop
    v_code := btrim(dom ->> 'code');
    if v_code is null or v_code !~ '^[A-Z0-9][A-Z0-9_.-]{0,19}$' then v_conf := v_conf || ('domain code "' || coalesce(v_code, '') || '" is not valid (A-Z, 0-9, . _ -; up to 20)'); continue; end if;
    if v_code = any (v_seen) then v_conf := v_conf || ('code ' || v_code || ' is listed twice'); continue; end if;
    v_seen := v_seen || v_code; v_codes_in_file := v_codes_in_file || v_code;
    select d.entity_id, d.sort_order into r from wine_reference.taxonomy_domains d where d.code = v_code;
    if found then
      v_dom := r.entity_id;
      if dom ? 'sort_order' and (dom ->> 'sort_order')::smallint <> r.sort_order then
        v_sort := v_sort || v_code;
        if not v_dry then update wine_reference.taxonomy_domains set sort_order = (dom ->> 'sort_order')::smallint where entity_id = v_dom; end if;
      end if;
    else
      v_new_domains := v_new_domains || v_code; v_dom := null;
      if jsonb_array_length(coalesce(dom -> 'names', '[]'::jsonb)) = 0 then v_conf := v_conf || ('domain ' || v_code || ' has no name'); end if;
      if not v_dry then
        insert into wine_reference.entities (kind, note, created_by) values ('taxonomy_domain', 'approved taxonomy import', auth.uid()) returning id into v_dom;
        insert into wine_reference.taxonomy_domains (entity_id, code, sort_order, source_version_id)
        values (v_dom, v_code, coalesce((dom ->> 'sort_order')::smallint, v_ndom::smallint), v_sv);
      end if;
    end if;
    -- a dry run writes nothing: it counts the names in the file (an apply adds only the ones missing)
    if v_dry then v_names := v_names + jsonb_array_length(coalesce(dom -> 'names', '[]'::jsonb));
    elsif v_dom is not null then v_lang_names := wine_reference.add_names(v_dom, dom -> 'names', v_kind); v_names := v_names + v_lang_names; end if;
    for nd in select * from jsonb_array_elements(coalesce(dom -> 'nodes', '[]'::jsonb)) loop
      v_code := btrim(nd ->> 'code'); v_pcode := nullif(btrim(coalesce(nd ->> 'parent', '')), '');
      if v_code is null or v_code !~ '^[A-Z0-9][A-Z0-9_.-]{0,29}$' then v_conf := v_conf || ('node code "' || coalesce(v_code, '') || '" is not valid (A-Z, 0-9, . _ -; up to 30)'); continue; end if;
      if v_code = any (v_seen) then v_conf := v_conf || ('code ' || v_code || ' is listed twice'); continue; end if;
      v_seen := v_seen || v_code; v_codes_in_file := v_codes_in_file || v_code;
      if v_pcode is not null and not (v_pcode = any (v_seen)) and not exists (select 1 from wine_reference.taxonomy_nodes where code = v_pcode) then
        v_conf := v_conf || ('node ' || v_code || ': parent ' || v_pcode || ' is not listed before it'); continue;
      end if;
      select n.entity_id, n.sort_order, d.code as dcode, pn.code as pcode into r
        from wine_reference.taxonomy_nodes n join wine_reference.taxonomy_domains d on d.entity_id = n.domain_id
        left join wine_reference.taxonomy_nodes pn on pn.entity_id = n.parent_id where n.code = v_code;
      if found then
        if r.dcode <> btrim(dom ->> 'code') or r.pcode is distinct from v_pcode then
          v_conf := v_conf || ('node ' || v_code || ' is already under ' || r.dcode || coalesce('/' || r.pcode, '') || ', the file puts it under ' || btrim(dom ->> 'code') || coalesce('/' || v_pcode, ''));
          continue;
        end if;
        v_node := r.entity_id;
        if nd ? 'sort_order' and (nd ->> 'sort_order')::smallint <> r.sort_order then
          v_sort := v_sort || v_code;
          if not v_dry then update wine_reference.taxonomy_nodes set sort_order = (nd ->> 'sort_order')::smallint where entity_id = v_node; end if;
        end if;
        if not v_dry then v_names := v_names + wine_reference.add_names(v_node, nd -> 'names', v_kind); end if;
      else
        if v_pcode is not null and exists (select 1 from wine_reference.taxonomy_nodes n join wine_reference.taxonomy_domains d on d.entity_id = n.domain_id
                                            where n.code = v_pcode and d.code <> btrim(dom ->> 'code')) then
          v_conf := v_conf || ('node ' || v_code || ': parent ' || v_pcode || ' is in another domain'); continue;
        end if;
        if jsonb_array_length(coalesce(nd -> 'names', '[]'::jsonb)) = 0 then v_conf := v_conf || ('node ' || v_code || ' has no name'); end if;
        v_new_nodes := v_new_nodes || v_code;
        if v_dry then v_names := v_names + jsonb_array_length(coalesce(nd -> 'names', '[]'::jsonb));
        else
          v_parent := case when v_pcode is null then null else (select entity_id from wine_reference.taxonomy_nodes where code = v_pcode) end;
          insert into wine_reference.entities (kind, note, created_by) values ('taxonomy_node', 'approved taxonomy import', auth.uid()) returning id into v_node;
          insert into wine_reference.taxonomy_nodes (entity_id, domain_id, parent_id, code, sort_order, source_version_id)
          values (v_node, v_dom, v_parent, v_code, coalesce((nd ->> 'sort_order')::smallint, 0), v_sv);
          v_names := v_names + wine_reference.add_names(v_node, nd -> 'names', v_kind);
        end if;
      end if;
    end loop;
  end loop;
  if not v_dry and cardinality(v_conf) > 0 then
    raise exception 'Import refused, nothing was changed: %', array_to_string(v_conf[1:10], '; ') using errcode = '23514';
  end if;
  return jsonb_build_object('dry_run', v_dry, 'new_domains', to_jsonb(v_new_domains), 'new_nodes', to_jsonb(v_new_nodes), 'names', v_names,
    'sort_changes', to_jsonb(v_sort), 'conflicts', to_jsonb(v_conf),
    'not_in_file', coalesce((select jsonb_agg(code order by code) from (select code from wine_reference.taxonomy_domains union all select code from wine_reference.taxonomy_nodes) c
                              where not (c.code = any (v_codes_in_file))), '[]'::jsonb));
end $$;

-- =====================================================================================================================================
-- 3. public.ref_tools: the Reference tab's taxonomy, identity and catalog tools. Reads need any ref_* permission; drafts and
--    suggestions need ref_edit; link decisions need ref_review. Review decisions still go only through ref_review.
-- =====================================================================================================================================
drop function if exists public.ref_tools(text, jsonb);
create function public.ref_tools(p_action text, p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  d jsonb := coalesce(p_data, '{}'::jsonb); v_tab text; v_lim integer; v_a uuid; v_b uuid; v_n integer := 0; v_m integer := 0; v_out jsonb; r record;
  v_ids uuid[]; v_err text[] := '{}'; v_id uuid; v_kind text;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if p_action in ('taxonomy', 'coverage', 'link_queue', 'duplicates') then
    if not (public.has_permission('ref_edit') or public.has_permission('ref_review') or public.has_permission('ref_publish') or public.has_permission('ref_rights')) then
      raise exception 'Not allowed: needs a reference permission' using errcode = '42501';
    end if;
  else
    perform wine_reference.editorial_lock();
    perform wine_reference.require_permission(case when p_action in ('decide_links', 'confirm_unambiguous', 'undo_link', 'reopen_link') then 'ref_review' else 'ref_edit' end);
  end if;
  v_tab := coalesce(d ->> 'table', 'producers');
  v_lim := least(greatest(coalesce((d ->> 'limit')::integer, 100), 1), case when p_action in ('suggest_links', 'link_queue') then 2000 else 200 end);

  case p_action
  -- ------------------------------------------------------------ reads
  when 'taxonomy' then   -- every domain with its nodes (code, parent, order, status, names in every language, how many things are assigned)
    select coalesce(jsonb_agg(jsonb_build_object('entity_id', dm.entity_id, 'code', dm.code, 'sort_order', dm.sort_order, 'status', e.status,
             'published_at', e.published_at, 'names', wine_reference.names_json(dm.entity_id), 'source_version_id', dm.source_version_id,
             'nodes', coalesce((select jsonb_agg(jsonb_build_object('entity_id', n.entity_id, 'code', n.code, 'parent', pn.code, 'sort_order', n.sort_order,
                                  'status', ne.status, 'published_at', ne.published_at, 'names', wine_reference.names_json(n.entity_id),
                                  'assigned', (select count(*) from wine_reference.taxonomy_assignments a where a.node_id = n.entity_id and a.status <> 'retired'))
                                  order by n.sort_order, n.code)
                                  from wine_reference.taxonomy_nodes n join wine_reference.entities ne on ne.id = n.entity_id
                                  left join wine_reference.taxonomy_nodes pn on pn.entity_id = n.parent_id where n.domain_id = dm.entity_id), '[]'::jsonb))
             order by dm.sort_order, dm.code), '[]'::jsonb)
      into v_out
      from wine_reference.taxonomy_domains dm join wine_reference.entities e on e.id = dm.entity_id;
    return jsonb_build_object('domains', v_out);
  when 'coverage' then   -- per old catalog table: rows, confirmed, waiting with a suggestion, with several suggestions, not linked at all
    select jsonb_agg(x) into v_out from (
      select t as catalog_table, wine_reference.catalog_kind(t) as kind,
             (select count(*) from wine_reference.catalog_rows(t)) as rows,
             (select count(*) from wine_reference.legacy_links l where l.catalog_table = t and l.status = 'confirmed') as confirmed,
             (select count(distinct l.catalog_id) from wine_reference.legacy_links l where l.catalog_table = t and l.status = 'suggested') as waiting,
             (select count(*) from (select l.catalog_id from wine_reference.legacy_links l where l.catalog_table = t and l.status = 'suggested'
                                    group by l.catalog_id having count(*) > 1) s) as several,
             (select count(*) from wine_reference.catalog_rows(t) c where not exists (select 1 from wine_reference.legacy_links l
                                    where l.catalog_table = t and l.catalog_id = c.catalog_id and l.status <> 'rejected')) as unlinked
        from unnest(array['producers', 'wines', 'wine_vintages', 'grapes', 'geo_areas']) t) x;
    return jsonb_build_object('basis', 'old catalog, not verified', 'tables', v_out);
  when 'link_queue' then   -- {table, filter: waiting | several | unlinked | confirmed, q, limit}: catalog rows with their links
    select coalesce(jsonb_agg(x order by x.name), '[]'::jsonb) into v_out from (
      select c.catalog_id, c.name, c.detail,
             (select jsonb_agg(jsonb_build_object('id', l.id, 'entity_id', l.entity_id, 'entity_name', wine_reference.display_name(l.entity_id),
                                                  'entity_status', e.status, 'status', l.status, 'method', l.match_method, 'score', l.match_score, 'note', l.note)
                               order by l.status, l.match_score desc nulls last)
                from wine_reference.legacy_links l join wine_reference.entities e on e.id = l.entity_id
               where l.catalog_table = v_tab and l.catalog_id = c.catalog_id and l.status <> 'rejected') as links
        from wine_reference.catalog_rows(v_tab) c
       where (coalesce(d ->> 'q', '') = '' or lower(c.name) like '%' || lower(d ->> 'q') || '%')
         and case coalesce(d ->> 'filter', 'waiting')
               when 'confirmed' then exists (select 1 from wine_reference.legacy_links l where l.catalog_table = v_tab and l.catalog_id = c.catalog_id and l.status = 'confirmed')
               when 'unlinked' then not exists (select 1 from wine_reference.legacy_links l where l.catalog_table = v_tab and l.catalog_id = c.catalog_id and l.status <> 'rejected')
               when 'several' then (select count(*) from wine_reference.legacy_links l where l.catalog_table = v_tab and l.catalog_id = c.catalog_id and l.status = 'suggested') > 1
               else exists (select 1 from wine_reference.legacy_links l where l.catalog_table = v_tab and l.catalog_id = c.catalog_id and l.status = 'suggested')
             end
       order by c.name limit v_lim) x;
    return jsonb_build_object('table', v_tab, 'kind', wine_reference.catalog_kind(v_tab), 'filter', coalesce(d ->> 'filter', 'waiting'), 'basis', 'old catalog, not verified', 'rows', v_out);
  when 'duplicates' then   -- things that several rows of one old catalog table are confirmed (or suggested) to stand for
    select coalesce(jsonb_agg(x), '[]'::jsonb) into v_out from (
      select l.catalog_table, l.entity_id, wine_reference.display_name(l.entity_id) as entity_name,
             jsonb_agg(jsonb_build_object('catalog_id', l.catalog_id, 'name', wine_reference.catalog_row_name(l.catalog_table, l.catalog_id), 'status', l.status)) as rows
        from wine_reference.legacy_links l where l.status <> 'rejected'
       group by l.catalog_table, l.entity_id having count(distinct l.catalog_id) > 1) x;
    return jsonb_build_object('groups', v_out);

  -- ------------------------------------------------------------ taxonomy (ref_edit; drafts; approved later through ref_review)
  when 'create_domain' then   -- {code, sort_order, names: [{name, language, script}], source_version_id}
    if coalesce(jsonb_array_length(d -> 'names'), 0) = 0 then raise exception 'A domain needs at least one name' using errcode = '22023'; end if;
    insert into wine_reference.entities (kind, note, created_by) values ('taxonomy_domain', coalesce(d ->> 'note', ''), auth.uid()) returning id into v_a;
    insert into wine_reference.taxonomy_domains (entity_id, code, sort_order, source_version_id)
    values (v_a, btrim(d ->> 'code'), coalesce((d ->> 'sort_order')::smallint, 0), nullif(d ->> 'source_version_id', '')::uuid);
    perform wine_reference.add_names(v_a, d -> 'names', coalesce(nullif(d ->> 'name_kind', ''), 'official'));
    return jsonb_build_object('entity_id', v_a);
  when 'create_node' then   -- {domain (code), parent (code, optional), code, sort_order, names, source_version_id}
    if coalesce(jsonb_array_length(d -> 'names'), 0) = 0 then raise exception 'A subdomain needs at least one name' using errcode = '22023'; end if;
    select entity_id into v_a from wine_reference.taxonomy_domains where code = d ->> 'domain';
    if v_a is null then raise exception 'No domain with code %', d ->> 'domain' using errcode = 'P0002'; end if;
    if nullif(d ->> 'parent', '') is not null then
      select entity_id into v_b from wine_reference.taxonomy_nodes where code = d ->> 'parent';
      if v_b is null then raise exception 'No subdomain with code %', d ->> 'parent' using errcode = 'P0002'; end if;
    end if;
    insert into wine_reference.entities (kind, note, created_by) values ('taxonomy_node', coalesce(d ->> 'note', ''), auth.uid()) returning id into v_id;
    insert into wine_reference.taxonomy_nodes (entity_id, domain_id, parent_id, code, sort_order, source_version_id)
    values (v_id, v_a, v_b, btrim(d ->> 'code'), coalesce((d ->> 'sort_order')::smallint, 0), nullif(d ->> 'source_version_id', '')::uuid);
    perform wine_reference.add_names(v_id, d -> 'names', coalesce(nullif(d ->> 'name_kind', ''), 'official'));
    return jsonb_build_object('entity_id', v_id);
  when 'assign_taxonomy' then   -- {entity_id, node (code), is_primary}: a draft assignment, reviewed through ref_review('taxonomy_assignments')
    select entity_id into v_b from wine_reference.taxonomy_nodes where code = d ->> 'node';
    if v_b is null then raise exception 'No subdomain with code %', d ->> 'node' using errcode = 'P0002'; end if;
    insert into wine_reference.taxonomy_assignments (entity_id, node_id, is_primary, created_by)
    values ((d ->> 'entity_id')::uuid, v_b, coalesce((d ->> 'is_primary')::boolean, false), auth.uid()) returning id into v_a;
    return jsonb_build_object('assignment_id', v_a);
  when 'import_taxonomy' then   -- see wine_reference.import_taxonomy
    return wine_reference.import_taxonomy(d);
  when 'review_many' then   -- {table, ids[], decision, note}: the same ref_review decision on several rows; each is checked on its own
    for v_id in select (jsonb_array_elements_text(coalesce(d -> 'ids', '[]'::jsonb)))::uuid loop
      v_m := v_m + 1;
      if v_m > 500 then raise exception 'At most 500 at once' using errcode = '22023'; end if;
      begin
        perform public.ref_review(d ->> 'table', v_id, d ->> 'decision', coalesce(d ->> 'note', ''));
        v_n := v_n + 1;
      exception when others then
        v_err := v_err || (v_id::text || ': ' || sqlerrm);
      end;
    end loop;
    return jsonb_build_object('done', v_n, 'of', v_m, 'failed', to_jsonb(v_err[1:20]));

  -- ------------------------------------------------------------ wine identity from the old catalog (ref_edit)
  when 'catalog_identity' then   -- {wine_vintage_ids: [...]} (up to 200): product + edition + the facts their switched-on types allow
    v_out := '[]'::jsonb;
    for r in select jsonb_array_elements_text(coalesce(d -> 'wine_vintage_ids', '[]'::jsonb)) as vid limit v_lim loop
      begin
        v_out := v_out || wine_reference.catalog_identity(r.vid);
      exception when others then
        v_out := v_out || jsonb_build_object('wine_vintage_id', r.vid, 'error', sqlerrm);
      end;
    end loop;
    return jsonb_build_object('results', v_out);

  -- ------------------------------------------------------------ catalog matching (ref_edit: suggestions and drafts; ref_review: decisions)
  when 'suggest_links' then   -- {table, limit}: rows with no live link get a suggestion for every live thing of the right kind with the same name
    v_kind := wine_reference.catalog_kind(v_tab);
    for r in select c.catalog_id, c.name from wine_reference.catalog_rows(v_tab) c
              where not exists (select 1 from wine_reference.legacy_links l where l.catalog_table = v_tab and l.catalog_id = c.catalog_id and l.status <> 'rejected')
                and coalesce(btrim(c.name), '') <> ''
              order by c.name limit v_lim loop
      select array_agg(distinct e.id) into v_ids
        from wine_reference.entity_names n join wine_reference.entities e on e.id = n.entity_id
       where e.kind = v_kind and e.status <> 'retired' and e.superseded_by is null and n.status <> 'retired'
         and lower(regexp_replace(btrim(n.name), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(r.name), '\s+', ' ', 'g'))
         and not exists (select 1 from wine_reference.legacy_links x where x.catalog_table = v_tab and x.catalog_id = r.catalog_id and x.entity_id = e.id);
      if v_ids is null then continue; end if;
      v_m := v_m + 1;
      foreach v_a in array v_ids loop
        if wine_reference.suggest_link(v_tab, r.catalog_id, v_a, 'exact_name', (case when cardinality(v_ids) = 1 then 100 else 50 end)::smallint,
                                       case when cardinality(v_ids) > 1 then 'several things have this name' else 'same name' end) is not null then v_n := v_n + 1; end if;
      end loop;
    end loop;
    return jsonb_build_object('table', v_tab, 'rows_matched', v_m, 'suggestions', v_n);
  when 'seed_from_catalog' then   -- {table, ids[] or limit}: a draft thing for each row with no live link, linked as created_from_catalog
    if v_tab = 'wine_vintages' then raise exception 'Use catalog_identity for vintages (it makes the product and the edition)' using errcode = '22023'; end if;
    v_kind := wine_reference.catalog_kind(v_tab);
    for r in select c.catalog_id, c.name from wine_reference.catalog_rows(v_tab) c
              where not exists (select 1 from wine_reference.legacy_links l where l.catalog_table = v_tab and l.catalog_id = c.catalog_id and l.status <> 'rejected')
                and coalesce(btrim(c.name), '') <> ''
                and (d -> 'ids' is null or c.catalog_id in (select jsonb_array_elements_text(d -> 'ids')))
              order by c.name limit v_lim loop
      v_a := wine_reference.make_entity(v_kind, r.name, 'und', case when v_tab = 'wines' then 'label' else 'common' end,
                                        'from the old catalog (' || v_tab || ' ' || r.catalog_id || '), not verified');
      perform wine_reference.suggest_link(v_tab, r.catalog_id, v_a, 'created_from_catalog', null, 'drafted from this catalog row');
      v_n := v_n + 1;
    end loop;
    return jsonb_build_object('table', v_tab, 'drafts', v_n);
  when 'decide_links' then   -- {ids[], status: confirmed | rejected}: each decided on its own; refusals are listed
    if d ->> 'status' not in ('confirmed', 'rejected') then raise exception 'Status must be confirmed or rejected' using errcode = '22023'; end if;
    for v_id in select (jsonb_array_elements_text(coalesce(d -> 'ids', '[]'::jsonb)))::uuid limit 500 loop
      v_m := v_m + 1;
      begin
        update wine_reference.legacy_links set status = d ->> 'status', decided_by = auth.uid(), decided_at = now() where id = v_id and status = 'suggested';
        if found then v_n := v_n + 1; else v_err := v_err || (v_id::text || ': not a suggested link (already decided?)'); end if;
      exception when others then v_err := v_err || (v_id::text || ': ' || sqlerrm);
      end;
    end loop;
    return jsonb_build_object('done', v_n, 'of', v_m, 'failed', to_jsonb(v_err[1:20]));
  when 'confirm_unambiguous' then   -- {table}: confirm suggestions that are the row's only one and were made from that row or matched by exact name alone
    for r in select l.id from wine_reference.legacy_links l join wine_reference.entities e on e.id = l.entity_id
              where l.catalog_table = v_tab and l.status = 'suggested' and e.status <> 'retired' and e.superseded_by is null
                and (l.match_method = 'created_from_catalog' or (l.match_method = 'exact_name' and l.match_score = 100))
                and (select count(*) from wine_reference.legacy_links x where x.catalog_table = l.catalog_table and x.catalog_id = l.catalog_id and x.status = 'suggested') = 1
                and not exists (select 1 from wine_reference.legacy_links x where x.catalog_table = l.catalog_table and x.catalog_id = l.catalog_id and x.status = 'confirmed')
              limit v_lim loop
      update wine_reference.legacy_links set status = 'confirmed', decided_by = auth.uid(), decided_at = now() where id = r.id;
      v_n := v_n + 1;
    end loop;
    return jsonb_build_object('table', v_tab, 'confirmed', v_n);
  when 'reopen_link' then   -- {id}: a rejected link becomes a suggestion again (to be decided again; history kept in the change log)
    update wine_reference.legacy_links set status = 'suggested', decided_by = null, decided_at = null,
           note = left(btrim(note || ' reopened'), 500)
     where id = (d ->> 'id')::uuid and status = 'rejected';
    if not found then raise exception 'No such rejected link' using errcode = 'P0002'; end if;
    return jsonb_build_object('link_id', d ->> 'id', 'status', 'suggested');
  when 'undo_link' then   -- {id, note}: a confirmed link becomes rejected (history kept); the row can then be linked again
    update wine_reference.legacy_links set status = 'rejected', decided_by = auth.uid(), decided_at = now(),
           note = left(btrim(note || ' undone: ' || coalesce(d ->> 'note', '')), 500)
     where id = (d ->> 'id')::uuid and status = 'confirmed';
    if not found then raise exception 'No such confirmed link' using errcode = 'P0002'; end if;
    return jsonb_build_object('link_id', d ->> 'id', 'status', 'rejected');
  else
    raise exception 'Unknown action %', p_action using errcode = '22023';
  end case;
end $$;
revoke all on function public.ref_tools(text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.ref_tools(text, jsonb) to authenticated;

-- Internal functions added here: nobody but the owner may run them.
do $$
declare f text;
begin
  foreach f in array array['wine_reference.catalog_kind(text)', 'wine_reference.catalog_row_exists(text, text)', 'wine_reference.catalog_row_name(text, text)',
                           'wine_reference.check_legacy_link()', 'wine_reference.settle_legacy_link()', 'wine_reference.make_entity(text, text, text, text, text)',
                           'wine_reference.add_names(uuid, jsonb, text)', 'wine_reference.suggest_link(text, text, uuid, text, smallint, text)',
                           'wine_reference.linked_entity(text, text)', 'wine_reference.catalog_fact(uuid, text, uuid, text, jsonb)',
                           'wine_reference.catalog_identity(text)', 'wine_reference.catalog_rows(text)', 'wine_reference.display_name(uuid)',
                           'wine_reference.names_json(uuid)', 'wine_reference.import_taxonomy(jsonb)'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', f);
  end loop;
end $$;

-- Fingerprint after 003: 002's fingerprint plus the definitions of the new door and of the link rules (drift check on a replay of 003).
create or replace function wine_reference.fingerprint_003() returns text
language sql stable set search_path = '' as $$
  select md5(wine_reference.fingerprint_002() || coalesce((select string_agg(n.nspname || '.' || p.proname || ' ' || p.prosecdef || ' ' || coalesce(array_to_string(p.proconfig, ','), '')
                                                                             || ' ' || coalesce(p.proacl::text, '') || ' ' || md5(p.prosrc), E'\n' order by n.nspname, p.proname)
                                                               from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
                                                              where (n.nspname = 'public' and p.proname = 'ref_tools')
                                                                 or (n.nspname = 'wine_reference' and p.proname in ('check_legacy_link', 'settle_legacy_link', 'import_taxonomy', 'catalog_identity'))), ''))
$$;
revoke all on function wine_reference.fingerprint_003() from public, anon, authenticated, service_role;

-- =====================================================================================================================================
-- 4. Register.
-- =====================================================================================================================================
insert into wine_reference.schema_migrations (version, name, notes, release)
values ('003', 'reference taxonomy tools, wine identity from the old catalog, catalog matching',
        'ref_tools; legacy_links match_method/match_score and link rules; taxonomy import (no taxonomy content); no type switched on',
        '003 r1 (2026-11-08)')
on conflict (version) do nothing;
update wine_reference.schema_migrations set structure_md5 = wine_reference.fingerprint_003() where version = '003';

commit;

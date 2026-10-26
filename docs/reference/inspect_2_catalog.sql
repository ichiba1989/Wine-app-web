-- READ-ONLY INSPECTION, PART 2 OF 2: observations about the shared CATALOG DATA. Wine Education Master Reference, Phase 2.0B.1 (2026-10-26).
--
-- Kept apart from part 1 (inspect_1_structure.sql), which reads only the database's structure.
-- What it does: ONE select statement that returns counts and summaries of the shared catalog, reference lists, quiz and settings,
-- as rows of three text columns (section, check_name, result).
-- What it never reads: journal entries, tastings, perceptions, notes, swipes, photos, restaurant visits, game answers, profiles, emails,
-- sign-ins, or anything else about a person. It does not count staff per role either (that would point at people).
-- Source rows are summarised by kind and name only; licence notes and document text are not read.
-- It changes nothing: no insert, update, delete, create, alter, drop, grant or revoke.
--
-- How it copes with tables that may not exist yet (for example rank_appellations before its script is run): each check names the
-- table it needs, and a check whose table is missing returns "table not present" instead of failing. query_to_xml() only runs the
-- check's own read-only SELECT; the text of every check is written out below.
-- Run as in docs/reference/INSPECTION.md: SQL Editor, paste, Run, download CSV.
-- Note: the SQL Editor runs as the database owner, so these numbers include wines still waiting for review, not only published ones.
-- Text in results comes back XML-escaped (& shows as &amp;); that is only how it is printed.

with checks(section, check_name, needs, query) as (values
  -- A. How big each shared table is (exact counts).
  ('A counts', 'producers', 'public.producers', 'select count(*)::text as v from public.producers'),
  ('A counts', 'wines', 'public.wines', 'select count(*)::text as v from public.wines'),
  ('A counts', 'wine_vintages', 'public.wine_vintages', 'select count(*)::text as v from public.wine_vintages'),
  ('A counts', 'wine_grapes', 'public.wine_grapes', 'select count(*)::text as v from public.wine_grapes'),
  ('A counts', 'grapes', 'public.grapes', 'select count(*)::text as v from public.grapes'),
  ('A counts', 'geo_areas', 'public.geo_areas', 'select count(*)::text as v from public.geo_areas'),
  ('A counts', 'sources', 'public.sources', 'select count(*)::text as v from public.sources'),
  ('A counts', 'wine_source_records', 'public.wine_source_records', 'select count(*)::text as v from public.wine_source_records'),
  ('A counts', 'wine_images', 'public.wine_images', 'select count(*)::text as v from public.wine_images'),
  ('A counts', 'wine_reference_values', 'public.wine_reference_values', 'select count(*)::text as v from public.wine_reference_values'),
  ('A counts', 'wine_default_values', 'public.wine_default_values', 'select count(*)::text as v from public.wine_default_values'),
  ('A counts', 'quiz_questions', 'public.quiz_questions', 'select count(*)::text as v from public.quiz_questions'),
  ('A counts', 'quiz_tags', 'public.quiz_tags', 'select count(*)::text as v from public.quiz_tags'),
  ('A counts', 'quiz_question_tags', 'public.quiz_question_tags', 'select count(*)::text as v from public.quiz_question_tags'),
  ('A counts', 'grape_aliases', 'public.grape_aliases', 'select count(*)::text as v from public.grape_aliases'),
  ('A counts', 'producer_aliases', 'public.producer_aliases', 'select count(*)::text as v from public.producer_aliases'),
  ('A counts', 'place_designation_rules', 'public.place_designation_rules', 'select count(*)::text as v from public.place_designation_rules'),
  ('A counts', 'broad_places', 'public.broad_places', 'select count(*)::text as v from public.broad_places'),
  ('A counts', 'flavor_varietals', 'public.flavor_varietals', 'select count(*)::text as v from public.flavor_varietals'),
  ('A counts', 'flavor_regions', 'public.flavor_regions', 'select count(*)::text as v from public.flavor_regions'),
  ('A counts', 'wine_tags', 'public.wine_tags', 'select count(*)::text as v from public.wine_tags'),
  ('A counts', 'wine_tag_links', 'public.wine_tag_links', 'select count(*)::text as v from public.wine_tag_links'),
  ('A counts', 'note_legend (shared, approved words)', 'public.note_legend', 'select count(*)::text as v from public.note_legend'),
  ('A counts', 'food_pairing_overrides', 'public.food_pairing_overrides', 'select count(*)::text as v from public.food_pairing_overrides'),
  ('A counts', 'rank_appellations', 'public.rank_appellations', 'select count(*)::text as v from public.rank_appellations'),
  ('A counts', 'venue_wines (vwm)', 'public.venue_wines', 'select count(*)::text as v from public.venue_wines'),
  ('A counts', 'wine_facts (parked tech sheet)', 'public.wine_facts', 'select count(*)::text as v from public.wine_facts'),
  ('A counts', 'fact_sources (parked tech sheet)', 'public.fact_sources', 'select count(*)::text as v from public.fact_sources'),

  -- B. Wine identity: status, type, how the type and sweetness term were decided, duplicates.
  ('B wines', 'by status', 'public.wines', 'select string_agg(k || ''='' || n, ''; '' order by k) as v from (select coalesce(status::text, ''(none)'') k, count(*) n from public.wines group by 1) t'),
  ('B wines', 'by style', 'public.wines', 'select string_agg(k || ''='' || n, ''; '' order by k) as v from (select coalesce(style::text, ''(none)'') k, count(*) n from public.wines group by 1) t'),
  ('B wines', 'by style_basis', 'public.wines', 'select string_agg(k || ''='' || n, ''; '' order by k) as v from (select coalesce(style_basis::text, ''(none)'') k, count(*) n from public.wines group by 1) t'),
  ('B wines', 'with no name', 'public.wines', 'select count(*)::text as v from public.wines where name is null or btrim(name) = '''''),
  ('B wines', 'with a vineyard text', 'public.wines', 'select count(*)::text as v from public.wines where vineyard is not null and btrim(vineyard) <> '''''),
  ('B wines', 'with no appellation', 'public.wines', 'select count(*)::text as v from public.wines where appellation_id is null'),
  ('B wines', 'same producer + name + type + place (groups)', 'public.wines', 'select count(*)::text as v from (select 1 from public.wines group by producer_id, lower(coalesce(name, '''')), style, appellation_id having count(*) > 1) t'),

  -- C. Vintages: non-vintage, year range, archived, replaced, duplicates.
  ('C vintages', 'non-vintage', 'public.wine_vintages', 'select count(*)::text as v from public.wine_vintages where is_non_vintage'),
  ('C vintages', 'no year and not marked non-vintage', 'public.wine_vintages', 'select count(*)::text as v from public.wine_vintages where vintage_year is null and not coalesce(is_non_vintage, false)'),
  ('C vintages', 'year range', 'public.wine_vintages', 'select (min(vintage_year) || '' to '' || max(vintage_year)) as v from public.wine_vintages'),
  ('C vintages', 'archived', 'public.wine_vintages', 'select count(*)::text as v from public.wine_vintages where archived_at is not null'),
  ('C vintages', 'replaced by another vintage', 'public.wine_vintages', 'select count(*)::text as v from public.wine_vintages where superseded_by is not null'),
  ('C vintages', 'same wine + same year listed twice (groups)', 'public.wine_vintages', 'select count(*)::text as v from (select 1 from public.wine_vintages group by wine_id, vintage_year, is_non_vintage having count(*) > 1) t'),
  ('C vintages', 'wines with more than one vintage', 'public.wine_vintages', 'select count(*)::text as v from (select wine_id from public.wine_vintages group by wine_id having count(*) > 1) t'),

  -- D. Producers and grapes: names that differ only by capitals or common accents; the grape list itself (41 rows on 2026-10-26).
  ('D producers', 'names equal ignoring capitals and accents', 'public.producers', 'select string_agg(names, '' || '' order by names) as v from (select string_agg(name, '' ~ '' order by name) names from public.producers group by translate(lower(name), ''àáâäãåçèéêëìíîïñòóôöõùúûüýÿ'', ''aaaaaaceeeeiiiinooooouuuuyy'') having count(*) > 1) t'),
  ('D grapes', 'all grape names', 'public.grapes', 'select string_agg(name, ''; '' order by name) as v from public.grapes'),
  ('D grapes', 'wine_grapes by basis', 'public.wine_grapes', 'select string_agg(k || ''='' || n, ''; '' order by k) as v from (select coalesce(basis::text, ''(none)'') k, count(*) n from public.wine_grapes group by 1) t'),
  ('D grapes', 'grape_aliases by kind and status', 'public.grape_aliases', 'select string_agg(k || ''='' || n, ''; '' order by k) as v from (select kind || ''/'' || status k, count(*) n from public.grape_aliases group by 1) t'),

  -- E. Places: levels, designations, status, sources, names used at two levels.
  ('E places', 'by level', 'public.geo_areas', 'select string_agg(k || ''='' || n, ''; '' order by k) as v from (select coalesce(level::text, ''(none)'') k, count(*) n from public.geo_areas group by 1) t'),
  ('E places', 'by designation (classification)', 'public.geo_areas', 'select string_agg(k || ''='' || n, ''; '' order by k) as v from (select coalesce(classification::text, ''(none)'') k, count(*) n from public.geo_areas group by 1) t'),
  ('E places', 'by status', 'public.geo_areas', 'select string_agg(k || ''='' || n, ''; '' order by k) as v from (select coalesce(status::text, ''(none)'') k, count(*) n from public.geo_areas group by 1) t'),
  ('E places', 'with a source', 'public.geo_areas', 'select count(*)::text as v from public.geo_areas where source_id is not null'),
  ('E places', 'with no parent, by level', 'public.geo_areas', 'select string_agg(k || ''='' || n, ''; '' order by k) as v from (select coalesce(level::text, ''(none)'') k, count(*) n from public.geo_areas where parent_id is null group by 1) t'),
  ('E places', 'names used at more than one level', 'public.geo_areas', 'select string_agg(name || '' ('' || levels || '')'', ''; '' order by name) as v from (select name, string_agg(level::text, ''+'' order by level::text) levels from public.geo_areas group by name having count(distinct level) > 1) t'),

  -- F. Sources and evidence: kinds and names only (no licence text, no document content).
  ('F sources', 'by kind', 'public.sources', 'select string_agg(k || ''='' || n, ''; '' order by k) as v from (select coalesce(kind::text, ''(none)'') k, count(*) n from public.sources group by 1) t'),
  ('F sources', 'names (first 60)', 'public.sources', 'select string_agg(name, '' || '' order by name) as v from (select name from public.sources order by name limit 60) t'),
  ('F sources', 'source records per source name', 'public.wine_source_records', 'select string_agg(k || ''='' || n, ''; '' order by k) as v from (select coalesce(s.name, ''(no source)'') k, count(*) n from public.wine_source_records r left join public.sources s on s.id = r.source_id group by 1) t'),
  ('F sources', 'reference values by basis and status', 'public.wine_reference_values', 'select string_agg(k || ''='' || n, ''; '' order by k) as v from (select coalesce(basis::text, ''-'') || ''/'' || coalesce(status::text, ''-'') k, count(*) n from public.wine_reference_values group by 1) t'),
  ('F sources', 'images by kind and status', 'public.wine_images', 'select string_agg(k || ''='' || n, ''; '' order by k) as v from (select coalesce(kind::text, ''-'') || ''/'' || coalesce(status::text, ''-'') k, count(*) n from public.wine_images group by 1) t'),

  -- G. Quiz: status, topics, difficulty, links to grapes, places, wines and sources, tags.
  ('G quiz', 'by status', 'public.quiz_questions', 'select string_agg(k || ''='' || n, ''; '' order by k) as v from (select coalesce(status::text, ''(none)'') k, count(*) n from public.quiz_questions group by 1) t'),
  ('G quiz', 'by topic', 'public.quiz_questions', 'select string_agg(k || ''='' || n, ''; '' order by k) as v from (select coalesce(topic::text, ''(none)'') k, count(*) n from public.quiz_questions group by 1) t'),
  ('G quiz', 'by difficulty', 'public.quiz_questions', 'select string_agg(k || ''='' || n, ''; '' order by k) as v from (select coalesce(difficulty::text, ''(none)'') k, count(*) n from public.quiz_questions group by 1) t'),
  ('G quiz', 'linked to a grape / place / wine / source', 'public.quiz_questions', 'select (count(grape_id) || '' / '' || count(geo_area_id) || '' / '' || count(wine_id) || '' / '' || count(source_id)) as v from public.quiz_questions'),
  ('G quiz', 'tags by kind', 'public.quiz_tags', 'select string_agg(k || ''='' || n, ''; '' order by k) as v from (select coalesce(kind::text, ''(none)'') k, count(*) n from public.quiz_tags group by 1) t'),

  -- H. Reference lists: how many rows are suggested, in use or checked.
  ('H reference lists', 'place_designation_rules by status', 'public.place_designation_rules', 'select string_agg(k || ''='' || n, ''; '' order by k) as v from (select status k, count(*) n from public.place_designation_rules group by 1) t'),
  ('H reference lists', 'broad_places by status', 'public.broad_places', 'select string_agg(k || ''='' || n, ''; '' order by k) as v from (select status k, count(*) n from public.broad_places group by 1) t'),
  ('H reference lists', 'producer_aliases by status', 'public.producer_aliases', 'select string_agg(k || ''='' || n, ''; '' order by k) as v from (select status k, count(*) n from public.producer_aliases group by 1) t'),

  -- I. Roles, plans and settings: definitions only (which permissions a role or a plan gives), never who holds them.
  ('I roles and settings', 'staff role definitions', 'public.staff_roles', 'select string_agg(row_to_json(r)::text, '' || '') as v from public.staff_roles r'),
  ('I roles and settings', 'feature switches per plan', 'public.feature_access', 'select string_agg(row_to_json(f)::text, '' || '') as v from public.feature_access f'),
  ('I roles and settings', 'app_config keys and values', 'public.app_config', 'select string_agg(key || ''='' || value::text, ''; '' order by key) as v from public.app_config')
)
select section, check_name,
       case when to_regclass(needs) is null then 'table not present'
            else coalesce((xpath('//v/text()', query_to_xml(query, false, false, '')))[1]::text, '(none)') end as result
from checks
order by section, check_name;

-- MIGRATION 006: Wine Education Master Reference: evidence review and full-catalog editorial navigation (READ-ONLY door).
-- Release "006 r1 (2026-11-25)". Tested locally on a Supabase stack with the production state (hardening release 2, 001 r5, 001a, 002 r1,
-- 003 r1, 004 r1, 005 r1). NOT RUN ON THE LIVE DATABASE until the owner approves (docs/reference/migration_006/DEPLOY_006.md).
--
-- Why: the Reference tab reads the latest 300 things, facts and sources (ref_staff 'overview'), and it cannot show which source an
-- imported grape-rule fact is waiting for. 006 adds ONE read door, public.ref_browse, for staff holding a reference permission:
--   evidence          the facts of one claim type (default rules_name_grape, the imported grape rules), page by page, each with its
--                     latest version, every piece of evidence with its source and source version and their review status, and what
--                     stops it from being published;
--   evidence_sources  the sources and source versions those facts rely on, page by page, with what stops each from being approved and
--                     how many facts wait on it;
--   entities          every thing, searchable (any name, any language) and filtered by kind, status and subject area, page by page;
--                     optionally with, for one subject area, whether each thing can be assigned to it;
--   claims            every fact, searchable (subject or object name) and filtered by claim type, status and kind, page by page;
--   link_compare      one old catalog row and every live candidate link, side by side (names in every language, status, subject
--                     areas, other catalog rows linked to the same thing).
-- Publication eligibility is NOT recalculated: 'problems' is wine_reference.version_problems() verbatim (001's one rule) and 'current' is
-- wine_reference.is_current(). Two checks that public.ref_review makes inline (and that no function exposes) are mirrored here so the
-- screen never offers a step ref_review would refuse: the approval rules for a source version and the two-person rule (with the Owner
-- exemption), and the forward-only publication rule (owner decision 14). The tests compare each mirror with ref_review's real answer.
-- ref_review stays the only place that decides.
-- Pages: a page holds at most 100 rows (default 50), in a fixed order with the row id as the last tie-breaker, and the next page starts
-- after the last row returned ('next' cursor), so rows are neither repeated nor skipped while paging.
-- Indexes: entities and claims gain an index on (created_at, id) for the newest-first pages (see README.md, "Indexes").
-- What it never does: it writes nothing (every function is STABLE), changes no app table, publishes nothing, switches no type on and
-- leaves reference_enabled as it is. Signed-out visitors and players without a reference permission are refused.

begin;

-- =====================================================================================================================================
-- 0. Preflight: stop, changing nothing, unless 005 r1 is in place and nothing was changed by hand since.
-- =====================================================================================================================================
do $$
declare
  c_release constant text := '006 r1 (2026-11-25)';
  v_rel005 text; v_md5_005 text; v_rel006 text; v_md5_006 text; v_foreign text;
begin
  if to_regclass('wine_reference.schema_migrations') is null then raise exception 'Preflight: migration 001 is not installed'; end if;
  select release, structure_md5 into v_rel005, v_md5_005 from wine_reference.schema_migrations where version = '005';
  if v_rel005 is distinct from '005 r1 (2026-11-13)' then raise exception 'Preflight: migration 005 release "005 r1 (2026-11-13)" is required (found "%")', v_rel005; end if;
  select string_agg(p.proname || '(' || pg_catalog.oidvectortypes(p.proargtypes) || ')', ', ') into v_foreign
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'ref\_%'
     and (p.proname, pg_catalog.oidvectortypes(p.proargtypes)) not in
         (('ref_published_names', 'text, text, integer'), ('ref_review', 'text, uuid, text, text, uuid'), ('ref_staff', 'text, jsonb'),
          ('ref_draft', 'text, jsonb'), ('ref_tools', 'text, jsonb'), ('ref_work', 'text, jsonb'), ('ref_rules', 'text, jsonb'), ('ref_browse', 'text, jsonb'));
  if v_foreign is not null then raise exception 'Preflight: unexpected function(s) in public: %. Stop and investigate.', v_foreign; end if;
  select release, structure_md5 into v_rel006, v_md5_006 from wine_reference.schema_migrations where version = '006';
  if not found then
    if to_regprocedure('public.ref_browse(text, jsonb)') is not null then
      raise exception 'Preflight: public.ref_browse exists but migration 006 is not registered. Stop and investigate.';
    end if;
    if wine_reference.fingerprint_005() is distinct from v_md5_005 then
      raise exception 'Preflight: the reference was changed by hand since migration 005 ran (structure drift). Stop and investigate.';
    end if;
  else
    if v_rel006 is distinct from c_release then
      raise exception 'Preflight: release "%" of migration 006 is applied, this file is "%". Never replay an edited 006; write migration 007.', v_rel006, c_release;
    end if;
    if to_regprocedure('wine_reference.fingerprint_006()') is null or wine_reference.fingerprint_006() is distinct from v_md5_006 then
      raise exception 'Preflight: the reference was changed by hand since migration 006 ran (structure drift). Stop and investigate.';
    end if;
  end if;
end $$;

-- =====================================================================================================================================
-- 1. Indexes for the newest-first pages (additive; nothing else changes).
-- =====================================================================================================================================
create index if not exists entities_created on wine_reference.entities (created_at, id);
create index if not exists claims_created on wine_reference.claims (created_at, id);

-- =====================================================================================================================================
-- 2. Internal helpers (owner only; not executable by anyone else). Each MIRRORS a check that public.ref_review makes inline.
-- =====================================================================================================================================
-- Why the signed-in person could not approve a row written by p_creator: ref_review's two-person rule, with the Owner exemption.
-- Null = no objection from this rule.
create or replace function wine_reference.author_blocker(p_creator uuid) returns text
language sql stable set search_path = '' as $$
  select case when (p_creator is null or p_creator = auth.uid()) and coalesce(public.my_staff_role_code(), '') <> 'owner'
              then 'The author cannot approve their own row (and a row with no recorded author cannot be approved here)' end
$$;

-- What stops a source version from being approved (ref_review's approval rules for source_versions, worded as ref_review words them).
-- Empty = nothing (the two-person rule and the row's status are reported separately).
create or replace function wine_reference.source_version_blockers(p_id uuid) returns text[]
language sql stable set search_path = '' as $$
  select array_remove(array[
           case when s.status <> 'verified' then 'Approve the source before its versions' end,
           case when sv.rights_id is not null and rs.status is distinct from 'verified' then 'The rights statement of this source version is not verified' end,
           case when sv.storage_path is not null and not (rs.status = 'verified' and coalesce(rs.allows_copy, false)) then 'A private copy needs verified rights that allow copying' end
         ], null)
    from wine_reference.source_versions sv join wine_reference.sources s on s.id = sv.source_id
    left join wine_reference.rights_statements rs on rs.id = sv.rights_id
   where sv.id = p_id
$$;

-- The highest NEWER version of the same claim that was ever published (ref_review's forward-only rule, owner decision 14). Null = none.
create or replace function wine_reference.newer_published(p_id uuid) returns integer
language sql stable set search_path = '' as $$
  select max(n.version_no) from wine_reference.claim_versions o join wine_reference.claim_versions n on n.claim_id = o.claim_id
   where o.id = p_id and n.id <> o.id and n.version_no > o.version_no and n.published_at is not null
$$;

-- One claim version for the evidence review: its evidence with sources, the authoritative problems, and the next step.
create or replace function wine_reference.fact_review_json(p_version uuid) returns jsonb
language plpgsql stable set search_path = '' as $$
declare v record; k record; v_problems text[]; v_newer integer; v_block text[] := '{}'; v_next text := 'none'; v_author text;
begin
  select * into v from wine_reference.claim_versions where id = p_version;
  if not found then return null; end if;
  select * into k from wine_reference.claims where id = v.claim_id;
  v_problems := wine_reference.version_problems(v.id);          -- 001's one rule, verbatim
  v_newer := wine_reference.newer_published(v.id);
  if v.status <> 'retired' and v.published_at is null then
    if v.suspended_at is not null then v_block := v_block || 'A suspended version is never published again; write a new version'::text; end if;
    if v_newer is not null then v_block := v_block || format('Version %s of this claim has been published, so version %s is never published: write its content as a new version', v_newer, v.version_no); end if;
    v_block := v_block || v_problems;
  end if;
  v_author := wine_reference.author_blocker(v.created_by);
  v_next := case when v.status = 'draft' then 'submit'
                 when v.status = 'pending_review' then 'approve'
                 when v.status = 'verified' and v.published_at is null then case when cardinality(v_block) = 0 then 'publish' else 'blocked' end
                 when v.status = 'verified' then 'published'
                 else 'retired' end;
  return jsonb_build_object(
    'claim_id', k.id, 'version_id', v.id, 'version_no', v.version_no, 'versions', (select count(*) from wine_reference.claim_versions x where x.claim_id = k.id),
    'status', v.status, 'published_at', v.published_at, 'suspended_at', v.suspended_at, 'suspended_reason', v.suspended_reason,
    'created_at', v.created_at, 'mine', v.created_by = auth.uid(), 'change_note', v.change_note, 'qualifiers', v.qualifiers,
    'value', coalesce(to_jsonb(v.value_text), to_jsonb(v.value_number), to_jsonb(v.value_date), to_jsonb(v.value_boolean)),
    'predicate', coalesce(k.relationship_type, k.attribute_type),
    'subject', (select jsonb_build_object('id', e.id, 'name', wine_reference.display_name(e.id), 'kind', e.kind, 'status', e.status, 'published', e.published_at is not null)
                  from wine_reference.entities e where e.id = k.subject_entity_id),
    'object', (select jsonb_build_object('id', e.id, 'name', wine_reference.display_name(e.id), 'kind', e.kind, 'status', e.status, 'published', e.published_at is not null)
                 from wine_reference.entities e where e.id = k.object_entity_id),
    'problems', to_jsonb(v_problems), 'newer_published', v_newer, 'current', wine_reference.is_current(v.id),
    'publish_blockers', to_jsonb(v_block), 'next', v_next,
    'approve_blocker', case when v.status = 'pending_review' then v_author end,
    'evidence', coalesce((select jsonb_agg(jsonb_build_object(
        'id', ev.id, 'role', ev.role, 'modality', ev.modality, 'locator', ev.locator, 'has_quote', ev.quote is not null,
        'source', jsonb_build_object('id', s.id, 'title', s.title, 'kind', s.kind, 'status', s.status, 'url', s.url, 'mine', s.created_by = auth.uid(),
                                     'approve_blocker', case when s.status = 'pending_review' then wine_reference.author_blocker(s.created_by) end),
        'version', jsonb_build_object('id', sv.id, 'label', sv.version_label, 'status', sv.status, 'url', sv.url, 'superseded', sv.superseded_by is not null,
                                      'rights_status', rs.status, 'mine', sv.created_by = auth.uid(),
                                      'blockers', to_jsonb(wine_reference.source_version_blockers(sv.id)),
                                      'approve_blocker', case when sv.status = 'pending_review' then wine_reference.author_blocker(sv.created_by) end),
        'counts', ev.role = 'supports' and sv.status = 'verified' and sv.superseded_by is null and s.status = 'verified')
        order by ev.created_at, ev.id)
       from wine_reference.claim_evidence ev join wine_reference.source_versions sv on sv.id = ev.source_version_id
       join wine_reference.sources s on s.id = sv.source_id left join wine_reference.rights_statements rs on rs.id = sv.rights_id
      where ev.claim_version_id = v.id), '[]'::jsonb));
end $$;

-- LIKE pattern for a search word, with its wildcards taken literally.
create or replace function wine_reference.like_pattern(p_q text) returns text
language sql immutable set search_path = '' as $$
  select '%' || replace(replace(replace(lower(btrim(p_q)), '\', '\\'), '%', '\%'), '_', '\_') || '%'
$$;

-- =====================================================================================================================================
-- 3. public.ref_browse: read-only. Any reference permission (ref_edit, ref_review, ref_publish, ref_rights) may read.
--    Common arguments: limit (1 to 100, default 50) and after (the 'next' cursor of the previous page; absent for the first page).
--    Every answer has rows, next (null on the last page), and on the first page total (how many rows match).
-- =====================================================================================================================================
drop function if exists public.ref_browse(text, jsonb);
create function public.ref_browse(p_action text, p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  d jsonb := coalesce(p_data, '{}'::jsonb);
  v_lim integer := least(greatest(coalesce((d ->> 'limit')::integer, 50), 1), 100);
  v_first boolean := d -> 'after' is null or jsonb_typeof(d -> 'after') = 'null';
  v_after_ts timestamptz; v_after_id uuid; v_after_k text;
  v_q text := nullif(btrim(coalesce(d ->> 'q', '')), '');
  v_pat text; v_rows jsonb; v_total bigint; v_next jsonb; v_node uuid; v_pred text; v_stage text; v_status text; v_tab text; v_sort text;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if not (public.has_permission('ref_edit') or public.has_permission('ref_review') or public.has_permission('ref_publish') or public.has_permission('ref_rights')) then
    raise exception 'Not allowed: needs a reference permission' using errcode = '42501';
  end if;
  if not v_first then   -- the cursor: k (a time, or a sort name) and id
    if jsonb_typeof(d -> 'after') <> 'object' or d -> 'after' ->> 'id' is null or d -> 'after' ->> 'k' is null then
      raise exception 'after must be the next cursor of the previous page' using errcode = '22023';
    end if;
    v_after_id := (d -> 'after' ->> 'id')::uuid;
    v_after_k := d -> 'after' ->> 'k';
    if not (p_action = 'entities' and coalesce(nullif(d ->> 'sort', ''), 'newest') = 'name') then v_after_ts := v_after_k::timestamptz; end if;
  end if;
  if v_q is not null then
    if length(v_q) > 100 then raise exception 'Search for at most 100 characters' using errcode = '22023'; end if;
    v_pat := wine_reference.like_pattern(v_q);
  end if;

  case p_action
  -- ------------------------------------------------------------------------------------------------ facts with their evidence
  when 'evidence' then   -- {predicate (default rules_name_grape), stage: all | draft | pending_review | approved | publishable | blocked | published | retired, q}
    v_pred := coalesce(nullif(d ->> 'predicate', ''), 'rules_name_grape');
    v_stage := coalesce(nullif(d ->> 'stage', ''), 'all');
    if v_stage not in ('all', 'draft', 'pending_review', 'approved', 'publishable', 'blocked', 'published', 'retired') then
      raise exception 'Unknown stage %', v_stage using errcode = '22023';
    end if;
    with base as (
      select c.id, c.created_at, v.id as vid, v.status, v.published_at, v.suspended_at
        from wine_reference.claims c
        join lateral (select * from wine_reference.claim_versions x where x.claim_id = c.id order by x.version_no desc limit 1) v on true
       where coalesce(c.relationship_type, c.attribute_type) = v_pred
         and (v_pat is null or exists (select 1 from wine_reference.entity_names n where n.entity_id in (c.subject_entity_id, c.object_entity_id) and lower(n.name) like v_pat))
    ), staged as (
      select b.* from base b
       where case v_stage
               when 'all' then true
               when 'draft' then b.status = 'draft'
               when 'pending_review' then b.status = 'pending_review'
               when 'approved' then b.status = 'verified' and b.published_at is null
               when 'published' then b.status = 'verified' and b.published_at is not null
               when 'retired' then b.status = 'retired'
               when 'publishable' then b.status = 'verified' and b.published_at is null and b.suspended_at is null
                                        and cardinality(wine_reference.version_problems(b.vid)) = 0 and wine_reference.newer_published(b.vid) is null
               when 'blocked' then b.status <> 'retired' and b.published_at is null
                                    and (b.suspended_at is not null or cardinality(wine_reference.version_problems(b.vid)) > 0 or wine_reference.newer_published(b.vid) is not null)
             end
    ), page as (
      select s.* from staged s where v_first or (s.created_at, s.id) < (v_after_ts, v_after_id)
       order by s.created_at desc, s.id desc limit v_lim + 1
    )
    select (select coalesce(jsonb_agg(wine_reference.fact_review_json(p.vid) order by p.created_at desc, p.id desc), '[]'::jsonb)
              from (select * from page order by created_at desc, id desc limit v_lim) p),
           case when (select count(*) from page) > v_lim then
                (select jsonb_build_object('k', p.created_at, 'id', p.id) from (select * from page order by created_at desc, id desc offset v_lim - 1 limit 1) p) end,
           case when v_first then (select count(*) from staged) end
      into v_rows, v_next, v_total;
    return jsonb_build_object('rows', v_rows, 'next', v_next, 'total', v_total, 'predicate', v_pred, 'stage', v_stage,
                              'permissions', jsonb_build_object('edit', public.has_permission('ref_edit'), 'review', public.has_permission('ref_review'),
                                                                'publish', public.has_permission('ref_publish'), 'owner', coalesce(public.my_staff_role_code(), '') = 'owner'));

  -- ------------------------------------------------------------------------------------------------ the sources those facts rely on
  when 'evidence_sources' then   -- {predicate (default rules_name_grape), stage: waiting | all, q (title)}
    v_pred := coalesce(nullif(d ->> 'predicate', ''), 'rules_name_grape');
    v_stage := coalesce(nullif(d ->> 'stage', ''), 'waiting');
    if v_stage not in ('waiting', 'all') then raise exception 'Unknown stage %', v_stage using errcode = '22023'; end if;
    with used as (
      select sv.id, sv.created_at from wine_reference.source_versions sv join wine_reference.sources s on s.id = sv.source_id
       where exists (select 1 from wine_reference.claim_evidence ev join wine_reference.claim_versions v on v.id = ev.claim_version_id
                       join wine_reference.claims c on c.id = v.claim_id
                      where ev.source_version_id = sv.id and coalesce(c.relationship_type, c.attribute_type) = v_pred and v.status <> 'retired')
         and (v_stage = 'all' or s.status <> 'verified' or sv.status <> 'verified')
         and (v_pat is null or lower(s.title) like v_pat or lower(sv.version_label) like v_pat)
    ), page as (
      select u.* from used u where v_first or (u.created_at, u.id) < (v_after_ts, v_after_id) order by u.created_at desc, u.id desc limit v_lim + 1
    )
    select (select coalesce(jsonb_agg(jsonb_build_object(
               'source', jsonb_build_object('id', s.id, 'title', s.title, 'kind', s.kind, 'status', s.status, 'url', s.url, 'mine', s.created_by = auth.uid(),
                                            'approve_blocker', case when s.status = 'pending_review' then wine_reference.author_blocker(s.created_by) end),
               'version', jsonb_build_object('id', sv.id, 'label', sv.version_label, 'status', sv.status, 'url', sv.url, 'superseded', sv.superseded_by is not null,
                                             'rights_status', rs.status, 'mine', sv.created_by = auth.uid(),
                                             'blockers', to_jsonb(wine_reference.source_version_blockers(sv.id)),
                                             'approve_blocker', case when sv.status = 'pending_review' then wine_reference.author_blocker(sv.created_by) end),
               'facts', (select jsonb_object_agg(st, n) from (
                           select v.status::text || case when v.status = 'verified' and v.published_at is null then '_unpublished' else '' end as st, count(distinct v.id) as n
                             from wine_reference.claim_evidence ev join wine_reference.claim_versions v on v.id = ev.claim_version_id
                             join wine_reference.claims c on c.id = v.claim_id
                            where ev.source_version_id = sv.id and coalesce(c.relationship_type, c.attribute_type) = v_pred group by 1) f))
             order by p.created_at desc, p.id desc), '[]'::jsonb)
              from (select * from page order by created_at desc, id desc limit v_lim) p
              join wine_reference.source_versions sv on sv.id = p.id join wine_reference.sources s on s.id = sv.source_id
              left join wine_reference.rights_statements rs on rs.id = sv.rights_id),
           case when (select count(*) from page) > v_lim then
                (select jsonb_build_object('k', p.created_at, 'id', p.id) from (select * from page order by created_at desc, id desc offset v_lim - 1 limit 1) p) end,
           case when v_first then (select count(*) from used) end
      into v_rows, v_next, v_total;
    return jsonb_build_object('rows', v_rows, 'next', v_next, 'total', v_total, 'predicate', v_pred, 'stage', v_stage,
                              'permissions', jsonb_build_object('edit', public.has_permission('ref_edit'), 'review', public.has_permission('ref_review'),
                                                                'publish', public.has_permission('ref_publish'), 'owner', coalesce(public.my_staff_role_code(), '') = 'owner'));

  -- ------------------------------------------------------------------------------------------------ every thing
  when 'entities' then   -- {q, kind, status: draft | pending_review | approved | published | retired | live (default: all but retired),
                         --  area (subject-area code, or 'none'), sort: newest | name, assign_area (a subject-area code: report whether each can be assigned)}
    v_status := coalesce(nullif(d ->> 'status', ''), 'live');
    if v_status not in ('live', 'all', 'draft', 'pending_review', 'approved', 'published', 'retired') then raise exception 'Unknown status %', v_status using errcode = '22023'; end if;
    v_sort := coalesce(nullif(d ->> 'sort', ''), 'newest');
    if v_sort not in ('newest', 'name') then raise exception 'Unknown sort %', v_sort using errcode = '22023'; end if;
    if nullif(d ->> 'assign_area', '') is not null then
      select entity_id into v_node from wine_reference.taxonomy_nodes where code = d ->> 'assign_area';
      if v_node is null then raise exception 'No subject area with code %', d ->> 'assign_area' using errcode = 'P0002'; end if;
    end if;
    with matched as (
      select e.id, e.created_at, case when v_sort = 'name' then coalesce(lower(wine_reference.display_name(e.id)), '') end as sort_name
        from wine_reference.entities e
       where (nullif(d ->> 'kind', '') is null or e.kind = d ->> 'kind')
         and case v_status when 'all' then true when 'live' then e.status <> 'retired'
                            when 'approved' then e.status = 'verified' and e.published_at is null
                            when 'published' then e.status = 'verified' and e.published_at is not null
                            else e.status::text = v_status end
         and (nullif(d ->> 'area', '') is null
              or (d ->> 'area' = 'none' and not exists (select 1 from wine_reference.taxonomy_assignments a where a.entity_id = e.id and a.status <> 'retired'))
              or exists (select 1 from wine_reference.taxonomy_assignments a join wine_reference.taxonomy_nodes n on n.entity_id = a.node_id
                          where a.entity_id = e.id and a.status <> 'retired' and n.code = d ->> 'area'))
         and (v_pat is null or e.id::text = lower(v_q)
              or exists (select 1 from wine_reference.entity_names n where n.entity_id = e.id and lower(n.name) like v_pat))
    ), page as (
      select m.* from matched m
       where v_first
          or (v_sort = 'newest' and (m.created_at, m.id) < (v_after_ts, v_after_id))
          or (v_sort = 'name' and (m.sort_name, m.id) > (v_after_k, v_after_id))
       order by case when v_sort = 'name' then m.sort_name end, case when v_sort = 'name' then m.id end,
                case when v_sort = 'newest' then m.created_at end desc, case when v_sort = 'newest' then m.id end desc
       limit v_lim + 1
    ), numbered as (
      select p.*, row_number() over (order by case when v_sort = 'name' then p.sort_name end, case when v_sort = 'name' then p.id end,
                                              case when v_sort = 'newest' then p.created_at end desc, case when v_sort = 'newest' then p.id end desc) as rn
        from page p
    )
    select (select coalesce(jsonb_agg(jsonb_build_object(
               'id', e.id, 'kind', e.kind, 'status', e.status, 'published', e.published_at is not null, 'superseded_by', e.superseded_by,
               'created_at', e.created_at, 'mine', e.created_by = auth.uid(), 'name', wine_reference.display_name(e.id),
               'names', (select coalesce(jsonb_agg(jsonb_build_object('name', n.name, 'language', n.language, 'status', n.status) order by n.is_preferred desc, n.language, n.name), '[]'::jsonb)
                           from (select * from wine_reference.entity_names n where n.entity_id = e.id and n.status <> 'retired' order by n.is_preferred desc, n.language, n.name limit 6) n),
               'name_count', (select count(*) from wine_reference.entity_names n where n.entity_id = e.id and n.status <> 'retired'),
               'areas', (select coalesce(jsonb_agg(jsonb_build_object('code', t.code, 'status', a.status, 'is_primary', a.is_primary) order by t.code), '[]'::jsonb)
                           from wine_reference.taxonomy_assignments a join wine_reference.taxonomy_nodes t on t.entity_id = a.node_id
                          where a.entity_id = e.id and a.status <> 'retired'),
               'links', (select count(*) from wine_reference.legacy_links l where l.entity_id = e.id and l.status <> 'rejected'),
               'claims', (select count(*) from wine_reference.claims c where c.subject_entity_id = e.id or c.object_entity_id = e.id),
               'assign', case when v_node is null then null
                              when e.status = 'retired' or e.superseded_by is not null then 'retired or replaced'
                              when e.kind in ('taxonomy_domain', 'taxonomy_node') then 'a subject area itself'
                              when exists (select 1 from wine_reference.taxonomy_assignments a where a.entity_id = e.id and a.node_id = v_node and a.status <> 'retired')
                                then 'already in this subject area'
                              when exists (select 1 from wine_reference.taxonomy_assignments a where a.entity_id = e.id and a.node_id = v_node)
                                then 'was in this subject area (retired); it cannot be added again'
                              else '' end)
             order by x.rn), '[]'::jsonb)
              from numbered x join wine_reference.entities e on e.id = x.id where x.rn <= v_lim),
           case when (select count(*) from page) > v_lim then
                (select jsonb_build_object('k', case when v_sort = 'name' then to_jsonb(x.sort_name) else to_jsonb(x.created_at) end, 'id', x.id)
                   from numbered x where x.rn = v_lim) end,
           case when v_first then (select count(*) from matched) end
      into v_rows, v_next, v_total;
    return jsonb_build_object('rows', v_rows, 'next', v_next, 'total', v_total, 'sort', v_sort, 'status', v_status);

  -- ------------------------------------------------------------------------------------------------ every fact
  when 'claims' then   -- {q (subject or object name), predicate, status (of the latest version): draft | pending_review | approved | published |
                       --  suspended | retired | all (default), kind (the subject's kind), entity_id (facts about one thing)}
    v_status := coalesce(nullif(d ->> 'status', ''), 'all');
    if v_status not in ('all', 'draft', 'pending_review', 'approved', 'published', 'suspended', 'retired') then raise exception 'Unknown status %', v_status using errcode = '22023'; end if;
    with matched as (
      select c.id, c.created_at, v.id as vid
        from wine_reference.claims c
        join lateral (select * from wine_reference.claim_versions x where x.claim_id = c.id order by x.version_no desc limit 1) v on true
       where (nullif(d ->> 'predicate', '') is null or coalesce(c.relationship_type, c.attribute_type) = d ->> 'predicate')
         and (nullif(d ->> 'entity_id', '') is null or (d ->> 'entity_id')::uuid in (c.subject_entity_id, c.object_entity_id))
         and (nullif(d ->> 'kind', '') is null or exists (select 1 from wine_reference.entities e where e.id = c.subject_entity_id and e.kind = d ->> 'kind'))
         and case v_status when 'all' then true
                            when 'approved' then v.status = 'verified' and v.published_at is null
                            when 'published' then v.status = 'verified' and v.published_at is not null and v.suspended_at is null
                            when 'suspended' then v.suspended_at is not null
                            else v.status::text = v_status end
         and (v_pat is null or exists (select 1 from wine_reference.entity_names n where n.entity_id in (c.subject_entity_id, c.object_entity_id) and lower(n.name) like v_pat))
    ), page as (
      select m.* from matched m where v_first or (m.created_at, m.id) < (v_after_ts, v_after_id) order by m.created_at desc, m.id desc limit v_lim + 1
    )
    select (select coalesce(jsonb_agg(jsonb_build_object(
               'id', c.id, 'created_at', c.created_at, 'predicate', coalesce(c.relationship_type, c.attribute_type),
               'shape', case when c.relationship_type is not null then 'relationship' else 'attribute' end,
               'subject', (select jsonb_build_object('id', e.id, 'name', wine_reference.display_name(e.id), 'kind', e.kind, 'status', e.status, 'published', e.published_at is not null)
                             from wine_reference.entities e where e.id = c.subject_entity_id),
               'object', (select jsonb_build_object('id', e.id, 'name', wine_reference.display_name(e.id), 'kind', e.kind, 'status', e.status, 'published', e.published_at is not null)
                            from wine_reference.entities e where e.id = c.object_entity_id),
               'versions', (select count(*) from wine_reference.claim_versions x where x.claim_id = c.id),
               'latest', jsonb_build_object('id', v.id, 'version_no', v.version_no, 'status', v.status, 'published_at', v.published_at,
                                            'suspended_at', v.suspended_at, 'mine', v.created_by = auth.uid(), 'qualifiers', v.qualifiers,
                                            'value', coalesce(to_jsonb(v.value_text), to_jsonb(v.value_number), to_jsonb(v.value_date), to_jsonb(v.value_boolean)),
                                            'evidence', (select count(*) from wine_reference.claim_evidence ev where ev.claim_version_id = v.id),
                                            'problems', case when v.status <> 'retired' and v.published_at is null then to_jsonb(wine_reference.version_problems(v.id)) end,
                                            'current', wine_reference.is_current(v.id)))
             order by p.created_at desc, p.id desc), '[]'::jsonb)
              from (select * from page order by created_at desc, id desc limit v_lim) p
              join wine_reference.claims c on c.id = p.id join wine_reference.claim_versions v on v.id = p.vid),
           case when (select count(*) from page) > v_lim then
                (select jsonb_build_object('k', p.created_at, 'id', p.id) from (select * from page order by created_at desc, id desc offset v_lim - 1 limit 1) p) end,
           case when v_first then (select count(*) from matched) end
      into v_rows, v_next, v_total;
    return jsonb_build_object('rows', v_rows, 'next', v_next, 'total', v_total, 'status', v_status);

  -- ------------------------------------------------------------------------------------------------ one catalog row's candidates, side by side
  when 'link_compare' then   -- {table, catalog_id}
    v_tab := d ->> 'table';
    if v_tab not in ('producers', 'wines', 'wine_vintages', 'grapes', 'geo_areas') then
      raise exception 'table must be producers, wines, wine_vintages, grapes or geo_areas' using errcode = '22023';
    end if;
    select jsonb_build_object('table', v_tab, 'catalog_id', r.catalog_id, 'name', r.name, 'detail', r.detail, 'kind', wine_reference.catalog_kind(v_tab),
                              'basis', 'old catalog, not verified') into v_rows
      from wine_reference.catalog_rows(v_tab) r where r.catalog_id = d ->> 'catalog_id';
    if v_rows is null then raise exception 'No % row with id %', v_tab, d ->> 'catalog_id' using errcode = 'P0002'; end if;
    return jsonb_build_object('catalog', v_rows,
      'rejected', (select count(*) from wine_reference.legacy_links l where l.catalog_table = v_tab and l.catalog_id = d ->> 'catalog_id' and l.status = 'rejected'),
      'candidates', coalesce((select jsonb_agg(jsonb_build_object(
          'link', jsonb_build_object('id', l.id, 'status', l.status, 'method', l.match_method, 'score', l.match_score, 'note', l.note, 'created_at', l.created_at),
          'entity', jsonb_build_object('id', e.id, 'kind', e.kind, 'status', e.status, 'published', e.published_at is not null, 'superseded_by', e.superseded_by,
                                       'name', wine_reference.display_name(e.id), 'names', wine_reference.names_json(e.id), 'created_at', e.created_at,
                                       'areas', (select coalesce(jsonb_agg(t.code order by t.code), '[]'::jsonb) from wine_reference.taxonomy_assignments a
                                                   join wine_reference.taxonomy_nodes t on t.entity_id = a.node_id where a.entity_id = e.id and a.status <> 'retired'),
                                       'claims', (select count(*) from wine_reference.claims c where c.subject_entity_id = e.id or c.object_entity_id = e.id),
                                       'other_links', (select coalesce(jsonb_agg(jsonb_build_object('table', o.catalog_table, 'catalog_id', o.catalog_id, 'status', o.status,
                                                                                                    'name', wine_reference.catalog_row_name(o.catalog_table, o.catalog_id)) order by o.status, o.catalog_id), '[]'::jsonb)
                                                         from wine_reference.legacy_links o where o.entity_id = e.id and o.status <> 'rejected'
                                                          and not (o.catalog_table = v_tab and o.catalog_id = d ->> 'catalog_id'))))
          order by l.status, l.match_score desc nulls last, l.created_at, l.id)
        from wine_reference.legacy_links l join wine_reference.entities e on e.id = l.entity_id
       where l.catalog_table = v_tab and l.catalog_id = d ->> 'catalog_id' and l.status <> 'rejected'), '[]'::jsonb));
  else
    raise exception 'Unknown action %', p_action using errcode = '22023';
  end case;
end $$;
revoke all on function public.ref_browse(text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.ref_browse(text, jsonb) to authenticated;
do $$
declare f text;
begin
  foreach f in array array['wine_reference.author_blocker(uuid)', 'wine_reference.source_version_blockers(uuid)', 'wine_reference.newer_published(uuid)',
                           'wine_reference.fact_review_json(uuid)', 'wine_reference.like_pattern(text)'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', f);
  end loop;
end $$;

-- Fingerprint after 006 (drift check on a replay of 006): the structure fingerprint covers every index and function of the schema; the
-- new public door is added here.
create or replace function wine_reference.fingerprint_006() returns text
language sql stable set search_path = '' as $$
  select md5(wine_reference.fingerprint_005() || coalesce((select p.prosecdef || ' ' || p.provolatile::text || ' ' || coalesce(array_to_string(p.proconfig, ','), '') || ' '
                                                                  || coalesce(p.proacl::text, '') || ' ' || md5(p.prosrc)
                                                              from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
                                                             where n.nspname = 'public' and p.proname = 'ref_browse'), ''))
$$;
revoke all on function wine_reference.fingerprint_006() from public, anon, authenticated, service_role;

-- =====================================================================================================================================
-- 4. Register.
-- =====================================================================================================================================
insert into wine_reference.schema_migrations (version, name, notes, release)
values ('006', 'reference evidence review and full-catalog navigation (read-only)',
        'ref_browse: evidence, evidence_sources, entities, claims, link_compare; keyset pages of at most 100; indexes entities_created, claims_created; writes nothing',
        '006 r1 (2026-11-25)')
on conflict (version) do nothing;
update wine_reference.schema_migrations set structure_md5 = wine_reference.fingerprint_006() where version = '006';

commit;

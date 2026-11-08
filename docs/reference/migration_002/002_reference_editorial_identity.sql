-- MIGRATION 002: Wine Education Master Reference: the editorial door, the wine identity levels and links to the old catalog.
-- Release "002 r1 (2026-11-08)". DRAFT, tested locally on a Supabase stack with the production hardening and 001 r5 (+001a) in place.
-- NOT RUN ON THE LIVE DATABASE until the owner approves (docs/reference/migration_002/DEPLOY_002.md).
--
-- Why (docs/reference/migration_001/DESIGN.md section 3, "Deferred ... 002"):
--   1. The editorial door. Until now a reference row could only be typed in the SQL editor, where nobody is signed in, so it has no
--      author and public.ref_review refuses to approve it (by design). public.ref_draft lets a signed-in person who holds ref_edit write
--      DRAFTS with themselves as author (approval, publication and retirement still go only through ref_review, unchanged).
--      public.ref_staff lets reference staff read drafts and published rows (the Owner page's Reference tab).
--   2. The wine identity levels (REFERENCE_MODEL.md section 4, owner's levels 2026-10-26): entity kinds wine_product, wine_edition,
--      wine_release and release_event, with relationship and attribute types that link them. The types are seeded as PROPOSED: nothing
--      can be claimed with them until the owner activates each one (the definitions, and whether bottle format belongs to a release, are
--      still the owner's to confirm; REFERENCE_MODEL.md section 15, question 4).
--   3. Links to the old catalog (REFERENCE_MODEL.md section 6): legacy_links records which reference entity an old catalog row
--      (producers, wines, wine_vintages, grapes, geo_areas) stands for; every link is marked "old catalog, not verified", starts as
--      suggested and counts only once confirmed. ref_staff('suggestions') lists unlinked catalog rows with the entity kind they would map
--      to and any reference entity whose name matches: a read-only report, nothing is applied. The old catalog is never changed.
-- What it never does: it changes no existing app table, row, view or function; it adds no wine content; reference_enabled stays as it is.
-- Owner-only today: ref_edit, ref_review, ref_publish, ref_rights are held by the Owner role only (001a, owner decision 5).

begin;

-- =====================================================================================================================================
-- 0. Preflight: stop, changing nothing, unless 001 r5 (2026-11-08) and 001a are in place and nothing was changed by hand since.
-- =====================================================================================================================================
do $$
declare
  c_release constant text := '002 r1 (2026-11-08)';
  v_rel001 text; v_md5_001 text; v_rel002 text; v_md5_002 text; v_foreign text;
begin
  if to_regclass('wine_reference.schema_migrations') is null then raise exception 'Preflight: migration 001 is not installed; run it first'; end if;
  select release, structure_md5 into v_rel001, v_md5_001 from wine_reference.schema_migrations where version = '001';
  if v_rel001 is distinct from '001 r5 (2026-11-08)' then raise exception 'Preflight: migration 001 release "001 r5 (2026-11-08)" is required (found "%")', v_rel001; end if;
  if not exists (select 1 from wine_reference.schema_migrations where version = '001a') then raise exception 'Preflight: run 001a_reference_permissions.sql first'; end if;
  select string_agg(p.proname || '(' || pg_catalog.oidvectortypes(p.proargtypes) || ')', ', ') into v_foreign
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'ref\_%'
     and (p.proname, pg_catalog.oidvectortypes(p.proargtypes)) not in
         (('ref_published_names', 'text, text, integer'), ('ref_review', 'text, uuid, text, text, uuid'), ('ref_staff', 'text, jsonb'), ('ref_draft', 'text, jsonb'));
  if v_foreign is not null then raise exception 'Preflight: unexpected function(s) in public: %. Stop and investigate.', v_foreign; end if;
  select release, structure_md5 into v_rel002, v_md5_002 from wine_reference.schema_migrations where version = '002';
  if not found then
    -- first run: the schema must be exactly as 001 left it
    if wine_reference.structure_fingerprint() is distinct from v_md5_001 then
      raise exception 'Preflight: the schema wine_reference was changed by hand since migration 001 ran (structure drift). Stop and investigate.';
    end if;
  else
    if v_rel002 is distinct from c_release then
      raise exception 'Preflight: release "%" of migration 002 is applied, this file is "%". Never replay an edited 002; write migration 003.', v_rel002, c_release;
    end if;
    if to_regprocedure('wine_reference.fingerprint_002()') is null or wine_reference.fingerprint_002() is distinct from v_md5_002 then
      raise exception 'Preflight: the reference was changed by hand since migration 002 ran (structure drift). Stop and investigate.';
    end if;
  end if;
end $$;

-- =====================================================================================================================================
-- 1. Controlled vocabularies: the wine identity levels (kinds), and their relationship and attribute types (PROPOSED until activated).
-- =====================================================================================================================================
insert into wine_reference.entity_kinds (code, label, description, sort_order) values
  ('wine_product',  'Wine product',  'The wine as a continuing thing a producer makes under one identity (producer + name as on the label + type + defining place, as stated).', 80),
  ('wine_edition',  'Wine edition',  'One make-up of a product: for a vintage wine the stated harvest year; for a non-vintage wine an identifier the label or producer states, else "unidentified non-vintage".', 81),
  ('wine_release',  'Wine release',  'One stated way an edition reaches the market (release date, late or library release ...), only as stated.', 82),
  ('release_event', 'Release event', 'A dated event attached to a release or an edition (bottling, disgorgement, harvest ...), only as stated.', 83)
on conflict (code) do nothing;

insert into wine_reference.relationship_types (code, label, description, subject_kinds, object_kinds, allows_cycles, requires_dates, default_risk_tier, required_modality) values
  ('product_of',      'Is a product of',      'A wine product made by a producer (REFERENCE_MODEL.md section 4).', '{wine_product}', '{producer}', false, false, 2, null),
  ('defined_by_place','Is defined by place',  'The place a wine product is defined by, as stated on the label or by the producer.', '{wine_product}', '{place}', false, false, 2, null),
  ('edition_of',      'Is an edition of',     'An edition of a wine product (one harvest year, or one stated non-vintage identifier).', '{wine_edition}', '{wine_product}', false, false, 2, null),
  ('release_of',      'Is a release of',      'A release of an edition, only as stated.', '{wine_release}', '{wine_edition}', false, false, 2, null),
  ('event_of',        'Is an event of',       'A dated event of a release or an edition, only as stated.', '{release_event}', '{wine_release,wine_edition}', false, true, 2, null),
  ('made_from',       'Is made from',         'A grape variety in an edition, with its share (qualifier share_percent) only when stated.', '{wine_edition}', '{grape_variety}', false, false, 2, null)
on conflict (code) do nothing;

insert into wine_reference.attribute_types (code, label, description, subject_kinds, value_type, unit, default_risk_tier) values
  ('harvest_year',     'Harvest year',      'A harvest year of an edition, as stated on the label or in an official record (one claim per year for a multi-vintage blend).', '{wine_edition}', 'number', 'year', 2),
  ('nv_identifier',    'Non-vintage identifier', 'What the label or producer states to tell a non-vintage edition apart (edition number, base year, lot ...).', '{wine_edition}', 'text', null, 2),
  ('release_date',     'Release date',      'The date a release reached the market, as stated.', '{wine_release}', 'date', null, 2),
  ('event_date',       'Event date',        'The date of a release event (bottling, disgorgement ...), as stated.', '{release_event}', 'date', null, 2),
  ('bottle_format_ml', 'Bottle format',     'Bottle size in millilitres. OWNER TO DECIDE whether bottle format belongs to a release (REFERENCE_MODEL.md section 15, question 4); proposed only.', '{wine_release}', 'number', 'ml', 2)
on conflict (code) do nothing;

-- =====================================================================================================================================
-- 2. Links to the old catalog. A link says "this old catalog row stands for this reference entity"; it never changes the catalog.
-- =====================================================================================================================================
create table if not exists wine_reference.legacy_links (
  id             uuid primary key default gen_random_uuid(),
  catalog_table  text not null check (catalog_table in ('producers', 'wines', 'wine_vintages', 'grapes', 'geo_areas')),
  catalog_id     text not null check (length(catalog_id) between 1 and 64),
  entity_id      uuid not null references wine_reference.entities(id),
  status         text not null default 'suggested' check (status in ('suggested', 'confirmed', 'rejected')),
  basis          text not null default 'old catalog, not verified',
  note           text not null default '' check (length(note) <= 500),
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now(),
  decided_by     uuid,
  decided_at     timestamptz,
  unique (catalog_table, catalog_id, entity_id),
  constraint legacy_links_decided check ((status = 'suggested') = (decided_at is null))
);
-- one confirmed entity per old catalog row
create unique index if not exists legacy_links_one_confirmed on wine_reference.legacy_links (catalog_table, catalog_id) where status = 'confirmed';
create index if not exists legacy_links_entity on wine_reference.legacy_links (entity_id);
alter table wine_reference.legacy_links enable row level security;
revoke all on wine_reference.legacy_links from public, anon, authenticated, service_role;
comment on table wine_reference.legacy_links is 'Which reference entity an old catalog row stands for (producers, wines, wine_vintages, grapes, geo_areas). Marked "old catalog, not verified"; suggested until confirmed; the catalog itself is never changed.';
drop trigger if exists legacy_links_log on wine_reference.legacy_links;
create trigger legacy_links_log after insert or update or delete on wine_reference.legacy_links for each row execute function wine_reference.log_change();
drop trigger if exists legacy_links_lock_first on wine_reference.legacy_links;
create trigger legacy_links_lock_first before insert or update or delete on wine_reference.legacy_links for each statement execute function wine_reference.lock_before_write();
drop trigger if exists legacy_links_no_truncate on wine_reference.legacy_links;
create trigger legacy_links_no_truncate before truncate on wine_reference.legacy_links for each statement execute function wine_reference.refuse_truncate();

-- =====================================================================================================================================
-- 3. Internal helpers (owner only; not executable by anyone else).
-- =====================================================================================================================================
create or replace function wine_reference.require_permission(p_perm text) returns void
language plpgsql stable set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if not public.has_permission(p_perm) then raise exception 'Not allowed: needs %', p_perm using errcode = '42501'; end if;
end $$;

-- A draft claim version from the fields of p (value, dates, qualifiers, risk tier, change note), its evidence and its dependencies.
create or replace function wine_reference.write_claim_version(p_claim uuid, p jsonb) returns uuid
language plpgsql set search_path = '' as $$
declare v_id uuid; v_no integer; v_risk smallint; e jsonb; dep text; c record;
begin
  select * into c from wine_reference.claims where id = p_claim;
  if not found then raise exception 'No such claim' using errcode = 'P0002'; end if;
  select coalesce(max(version_no), 0) + 1 into v_no from wine_reference.claim_versions where claim_id = p_claim;
  v_risk := coalesce((p ->> 'risk_tier')::smallint,
                     (select default_risk_tier from wine_reference.relationship_types where code = c.relationship_type),
                     (select default_risk_tier from wine_reference.attribute_types where code = c.attribute_type), 2);
  insert into wine_reference.claim_versions (claim_id, version_no, value_text, value_number, value_date, value_boolean, qualifiers,
                                             valid_from, valid_from_precision, valid_to, valid_to_precision, risk_tier, supersedes_version_id, change_note, created_by)
  values (p_claim, v_no, nullif(p ->> 'value_text', ''), (p ->> 'value_number')::numeric, (p ->> 'value_date')::date, (p ->> 'value_boolean')::boolean,
          coalesce(p -> 'qualifiers', '{}'::jsonb), (p ->> 'valid_from')::date, coalesce(p ->> 'valid_from_precision', 'unknown'),
          (p ->> 'valid_to')::date, coalesce(p ->> 'valid_to_precision', 'unknown'), v_risk,
          coalesce((p ->> 'supersedes_version_id')::uuid,
                   (select id from wine_reference.claim_versions where claim_id = p_claim and published_at is not null order by version_no desc limit 1)),
          coalesce(p ->> 'change_note', ''), auth.uid())
  returning id into v_id;
  for e in select * from jsonb_array_elements(coalesce(p -> 'evidence', '[]'::jsonb)) loop
    insert into wine_reference.claim_evidence (claim_version_id, source_version_id, modality, role, locator, quote, quote_language, quote_rights_id, created_by)
    values (v_id, (e ->> 'source_version_id')::uuid, coalesce(e ->> 'modality', 'documentary'), coalesce(e ->> 'role', 'supports'), e ->> 'locator',
            nullif(e ->> 'quote', ''), nullif(e ->> 'quote_language', ''), (e ->> 'quote_rights_id')::uuid, auth.uid());
  end loop;
  for dep in select * from jsonb_array_elements_text(coalesce(p -> 'depends_on', '[]'::jsonb)) loop
    insert into wine_reference.claim_version_dependencies (dependent_version_id, depends_on_version_id, created_by) values (v_id, dep::uuid, auth.uid());
  end loop;
  return v_id;
end $$;

-- Fingerprint after 002: 001's structure fingerprint plus the definitions of the two new public doors (drift check on a replay of 002).
create or replace function wine_reference.fingerprint_002() returns text
language sql stable set search_path = '' as $$
  select md5(wine_reference.structure_fingerprint() || coalesce((select string_agg(p.proname || ' ' || p.prosecdef || ' ' || coalesce(array_to_string(p.proconfig, ','), '')
                                                                                 || ' ' || coalesce(p.proacl::text, '') || ' ' || md5(p.prosrc), E'\n' order by p.proname)
                                                                   from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
                                                                  where n.nspname = 'public' and p.proname in ('ref_staff', 'ref_draft')), ''))
$$;

-- =====================================================================================================================================
-- 4. public.ref_draft: write DRAFTS as the signed-in author (ref_edit), and two owner tools (ref_publish: claim types; ref_review:
--    catalog links). Everything it writes starts as a draft (or "suggested") and goes on only through ref_review (or decide_link).
-- =====================================================================================================================================
drop function if exists public.ref_draft(text, jsonb);
create function public.ref_draft(p_action text, p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d jsonb := coalesce(p_data, '{}'::jsonb); v_actor uuid := auth.uid(); v_a uuid; v_b uuid; v_c uuid; v_rights uuid; v_status text;
begin
  if v_actor is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  perform wine_reference.editorial_lock();
  perform wine_reference.require_permission(case when p_action in ('set_type_status', 'create_attribute_type') then 'ref_publish'
                                                  when p_action = 'decide_link' then 'ref_review' else 'ref_edit' end);
  case p_action
  when 'create_entity' then   -- {kind, name, language, name_kind, script, note}: a draft entity with its first (preferred) name
    if coalesce(btrim(d ->> 'name'), '') = '' then raise exception 'A name is needed' using errcode = '22023'; end if;
    insert into wine_reference.entities (kind, note, created_by) values (d ->> 'kind', coalesce(d ->> 'note', ''), v_actor) returning id into v_a;
    insert into wine_reference.entity_names (entity_id, name, language, script, name_kind, is_preferred, created_by)
    values (v_a, btrim(d ->> 'name'), coalesce(nullif(d ->> 'language', ''), 'und'), nullif(d ->> 'script', ''), coalesce(nullif(d ->> 'name_kind', ''), 'common'), true, v_actor)
    returning id into v_b;
    return jsonb_build_object('entity_id', v_a, 'name_id', v_b);
  when 'add_name' then   -- {entity_id, name, language, script, name_kind, is_preferred, valid_from, valid_to, note}
    insert into wine_reference.entity_names (entity_id, name, language, script, name_kind, is_preferred, valid_from, valid_to, note, created_by)
    values ((d ->> 'entity_id')::uuid, btrim(d ->> 'name'), coalesce(nullif(d ->> 'language', ''), 'und'), nullif(d ->> 'script', ''),
            coalesce(nullif(d ->> 'name_kind', ''), 'common'), coalesce((d ->> 'is_preferred')::boolean, false), (d ->> 'valid_from')::date, (d ->> 'valid_to')::date,
            coalesce(d ->> 'note', ''), v_actor)
    returning id into v_a;
    return jsonb_build_object('name_id', v_a);
  when 'create_source' then   -- {kind, title, publisher, authors, identifier, url, language, licence_code, licence_name, licence_url, rights_holder,
                              --  attribution_text, allows_quote, allows_copy, allows_commercial, allows_derivative, version_label, published_on, retrieved_at, version_url}
    insert into wine_reference.sources (kind, title, publisher, authors, identifier, url, language, created_by)
    values (d ->> 'kind', btrim(d ->> 'title'), coalesce(d ->> 'publisher', ''), coalesce(d ->> 'authors', ''), nullif(d ->> 'identifier', ''), nullif(d ->> 'url', ''),
            nullif(d ->> 'language', ''), v_actor)
    returning id into v_a;
    if coalesce(d ->> 'licence_code', '') <> '' then
      insert into wine_reference.rights_statements (licence_code, licence_name, licence_url, rights_holder, attribution_text, allows_quote, allows_copy,
                                                    allows_commercial, allows_derivative, created_by)
      values (d ->> 'licence_code', coalesce(d ->> 'licence_name', ''), nullif(d ->> 'licence_url', ''), coalesce(d ->> 'rights_holder', ''), coalesce(d ->> 'attribution_text', ''),
              coalesce((d ->> 'allows_quote')::boolean, false), coalesce((d ->> 'allows_copy')::boolean, false),
              coalesce((d ->> 'allows_commercial')::boolean, false), coalesce((d ->> 'allows_derivative')::boolean, false), v_actor)
      returning id into v_rights;
    end if;
    insert into wine_reference.source_versions (source_id, version_label, published_on, retrieved_at, url, rights_id, created_by)
    values (v_a, coalesce(nullif(btrim(d ->> 'version_label'), ''), to_char(current_date, 'YYYY-MM-DD')), (d ->> 'published_on')::date,
            coalesce((d ->> 'retrieved_at')::timestamptz, now()), nullif(coalesce(d ->> 'version_url', d ->> 'url'), ''), v_rights, v_actor)
    returning id into v_b;
    return jsonb_build_object('source_id', v_a, 'rights_id', v_rights, 'source_version_id', v_b);
  when 'add_source_version' then   -- {source_id, version_label, published_on, retrieved_at, url, rights_id}
    insert into wine_reference.source_versions (source_id, version_label, published_on, retrieved_at, url, rights_id, created_by)
    values ((d ->> 'source_id')::uuid, coalesce(nullif(btrim(d ->> 'version_label'), ''), to_char(current_date, 'YYYY-MM-DD')), (d ->> 'published_on')::date,
            coalesce((d ->> 'retrieved_at')::timestamptz, now()), nullif(d ->> 'url', ''), (d ->> 'rights_id')::uuid, v_actor)
    returning id into v_a;
    return jsonb_build_object('source_version_id', v_a);
  when 'create_claim' then   -- {subject_entity_id, relationship_type | attribute_type, object_entity_id, + version fields, evidence[], depends_on[]}
    insert into wine_reference.claims (subject_entity_id, relationship_type, object_entity_id, attribute_type, created_by)
    values ((d ->> 'subject_entity_id')::uuid, nullif(d ->> 'relationship_type', ''), (d ->> 'object_entity_id')::uuid, nullif(d ->> 'attribute_type', ''), v_actor)
    returning id into v_a;
    v_b := wine_reference.write_claim_version(v_a, d);
    return jsonb_build_object('claim_id', v_a, 'claim_version_id', v_b);
  when 'new_claim_version' then   -- {claim_id, + version fields, evidence[], depends_on[]}: the next version number; supersedes the published one
    v_b := wine_reference.write_claim_version((d ->> 'claim_id')::uuid, d);
    return jsonb_build_object('claim_version_id', v_b);
  when 'add_evidence' then   -- {claim_version_id, source_version_id, modality, role, locator, quote, quote_language, quote_rights_id}
    insert into wine_reference.claim_evidence (claim_version_id, source_version_id, modality, role, locator, quote, quote_language, quote_rights_id, created_by)
    values ((d ->> 'claim_version_id')::uuid, (d ->> 'source_version_id')::uuid, coalesce(nullif(d ->> 'modality', ''), 'documentary'), coalesce(nullif(d ->> 'role', ''), 'supports'),
            d ->> 'locator', nullif(d ->> 'quote', ''), nullif(d ->> 'quote_language', ''), (d ->> 'quote_rights_id')::uuid, v_actor)
    returning id into v_a;
    return jsonb_build_object('evidence_id', v_a);
  when 'add_dependency' then   -- {dependent_version_id, depends_on_version_id, kind}
    insert into wine_reference.claim_version_dependencies (dependent_version_id, depends_on_version_id, kind, created_by)
    values ((d ->> 'dependent_version_id')::uuid, (d ->> 'depends_on_version_id')::uuid, coalesce(nullif(d ->> 'kind', ''), 'requires'), v_actor);
    return jsonb_build_object('ok', true);
  when 'set_type_status' then   -- {table: relationship | attribute, code, status: active | retired} (ref_publish): the owner switches a claim type on or off
    v_status := d ->> 'status';
    if v_status not in ('active', 'retired') then raise exception 'Status must be active or retired' using errcode = '22023'; end if;
    if d ->> 'table' = 'relationship' then
      update wine_reference.relationship_types set status = v_status where code = d ->> 'code';
    elsif d ->> 'table' = 'attribute' then
      update wine_reference.attribute_types set status = v_status where code = d ->> 'code';
    else raise exception 'table must be relationship or attribute' using errcode = '22023'; end if;
    if not found then raise exception 'No such type' using errcode = 'P0002'; end if;
    return jsonb_build_object('code', d ->> 'code', 'status', v_status);
  when 'create_attribute_type' then   -- {code, label, description, subject_kinds[], value_type, unit, default_risk_tier} (ref_publish): starts proposed
    insert into wine_reference.attribute_types (code, label, description, subject_kinds, value_type, unit, default_risk_tier)
    values (d ->> 'code', d ->> 'label', coalesce(d ->> 'description', ''), array(select jsonb_array_elements_text(d -> 'subject_kinds')), d ->> 'value_type',
            nullif(d ->> 'unit', ''), coalesce((d ->> 'default_risk_tier')::smallint, 2));
    return jsonb_build_object('code', d ->> 'code', 'status', 'proposed');
  when 'link_catalog' then   -- {catalog_table, catalog_id, entity_id, note}: a suggested link (old catalog, not verified)
    if (select status from wine_reference.entities where id = (d ->> 'entity_id')::uuid) = 'retired' then
      raise exception 'That entity is retired' using errcode = '23514';
    end if;
    insert into wine_reference.legacy_links (catalog_table, catalog_id, entity_id, note, created_by)
    values (d ->> 'catalog_table', d ->> 'catalog_id', (d ->> 'entity_id')::uuid, coalesce(d ->> 'note', ''), v_actor)
    returning id into v_a;
    return jsonb_build_object('link_id', v_a);
  when 'decide_link' then   -- {id, status: confirmed | rejected} (ref_review)
    v_status := d ->> 'status';
    if v_status not in ('confirmed', 'rejected') then raise exception 'Status must be confirmed or rejected' using errcode = '22023'; end if;
    update wine_reference.legacy_links set status = v_status, decided_by = v_actor, decided_at = now()
     where id = (d ->> 'id')::uuid and status = 'suggested';
    if not found then raise exception 'No such suggested link' using errcode = 'P0002'; end if;
    return jsonb_build_object('link_id', d ->> 'id', 'status', v_status);
  else
    raise exception 'Unknown action %', p_action using errcode = '22023';
  end case;
end $$;
revoke all on function public.ref_draft(text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.ref_draft(text, jsonb) to authenticated;

-- =====================================================================================================================================
-- 5. public.ref_staff: what reference staff read (drafts included), for the Owner page's Reference tab. Any ref_* permission.
--    'overview' {limit}: entities with names, sources with versions and rights, claims with versions, types, vocabularies, links.
--    'suggestions' {table, limit}: unlinked old catalog rows with the kind they would map to and any same-name reference entity.
-- =====================================================================================================================================
drop function if exists public.ref_staff(text, jsonb);
create function public.ref_staff(p_what text, p_args jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare a jsonb := coalesce(p_args, '{}'::jsonb); v_lim integer := least(greatest(coalesce((a ->> 'limit')::integer, 300), 1), 1000); v_tab text; v_out jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if not (public.has_permission('ref_edit') or public.has_permission('ref_review') or public.has_permission('ref_publish') or public.has_permission('ref_rights')) then
    raise exception 'Not allowed: needs a reference permission' using errcode = '42501';
  end if;
  if p_what = 'overview' then
    select jsonb_build_object(
      'switch', public.cfg_number('reference_enabled', 0),
      'counts', jsonb_build_object('entities', (select count(*) from wine_reference.entities), 'claims', (select count(*) from wine_reference.claims),
                                   'sources', (select count(*) from wine_reference.sources), 'links', (select count(*) from wine_reference.legacy_links)),
      'entities', coalesce((select jsonb_agg(x order by x.created_at desc) from (
          select e.id, e.kind, e.status, e.published_at, e.created_at, e.created_by = auth.uid() as mine,
                 (select jsonb_agg(jsonb_build_object('id', n.id, 'name', n.name, 'language', n.language, 'script', n.script, 'name_kind', n.name_kind,
                                                      'is_preferred', n.is_preferred, 'status', n.status, 'valid_from', n.valid_from, 'valid_to', n.valid_to,
                                                      'mine', n.created_by = auth.uid()) order by n.is_preferred desc, n.language, n.name)
                    from wine_reference.entity_names n where n.entity_id = e.id) as names
            from wine_reference.entities e order by e.created_at desc limit v_lim) x), '[]'::jsonb),
      'sources', coalesce((select jsonb_agg(x order by x.created_at desc) from (
          select s.id, s.kind, s.title, s.status, s.created_at, s.created_by = auth.uid() as mine,
                 (select jsonb_agg(jsonb_build_object('id', v.id, 'version_label', v.version_label, 'status', v.status, 'url', v.url, 'mine', v.created_by = auth.uid(),
                                                      'rights', (select jsonb_build_object('id', r.id, 'licence_code', r.licence_code, 'status', r.status, 'allows_quote', r.allows_quote,
                                                                                           'allows_copy', r.allows_copy, 'mine', r.created_by = auth.uid())
                                                                   from wine_reference.rights_statements r where r.id = v.rights_id)) order by v.created_at)
                    from wine_reference.source_versions v where v.source_id = s.id) as versions
            from wine_reference.sources s order by s.created_at desc limit v_lim) x), '[]'::jsonb),
      'claims', coalesce((select jsonb_agg(x order by x.created_at desc) from (
          select c.id, c.subject_entity_id, c.relationship_type, c.object_entity_id, c.attribute_type, c.created_at,
                 (select jsonb_agg(jsonb_build_object('id', v.id, 'version_no', v.version_no, 'status', v.status, 'published_at', v.published_at,
                                                      'suspended_at', v.suspended_at, 'suspended_reason', v.suspended_reason, 'mine', v.created_by = auth.uid(),
                                                      'value_text', v.value_text, 'value_number', v.value_number, 'value_date', v.value_date, 'value_boolean', v.value_boolean,
                                                      'current', wine_reference.is_current(v.id),
                                                      'evidence', (select count(*) from wine_reference.claim_evidence ev where ev.claim_version_id = v.id),
                                                      'problems', case when v.status = 'verified' and v.published_at is null then to_jsonb(wine_reference.version_problems(v.id)) end)
                                   order by v.version_no)
                    from wine_reference.claim_versions v where v.claim_id = c.id) as versions
            from wine_reference.claims c order by c.created_at desc limit v_lim) x), '[]'::jsonb),
      'relationship_types', coalesce((select jsonb_agg(jsonb_build_object('code', code, 'label', label, 'status', status, 'subject_kinds', subject_kinds, 'object_kinds', object_kinds) order by code)
                                        from wine_reference.relationship_types), '[]'::jsonb),
      'attribute_types', coalesce((select jsonb_agg(jsonb_build_object('code', code, 'label', label, 'status', status, 'subject_kinds', subject_kinds, 'value_type', value_type, 'unit', unit) order by code)
                                     from wine_reference.attribute_types), '[]'::jsonb),
      'entity_kinds', (select jsonb_agg(jsonb_build_object('code', code, 'label', label) order by sort_order) from wine_reference.entity_kinds),
      'name_kinds', (select jsonb_agg(jsonb_build_object('code', code, 'label', label) order by code) from wine_reference.name_kinds),
      'source_kinds', (select jsonb_agg(jsonb_build_object('code', code, 'label', label) order by code) from wine_reference.source_kinds),
      'modalities', (select jsonb_agg(jsonb_build_object('code', code, 'label', label) order by code) from wine_reference.evidence_modalities),
      'links', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'catalog_table', l.catalog_table, 'catalog_id', l.catalog_id, 'entity_id', l.entity_id,
                                                             'status', l.status, 'basis', l.basis, 'note', l.note) order by l.created_at desc)
                           from (select * from wine_reference.legacy_links order by created_at desc limit v_lim) l), '[]'::jsonb),
      'permissions', jsonb_build_object('edit', public.has_permission('ref_edit'), 'review', public.has_permission('ref_review'),
                                        'publish', public.has_permission('ref_publish'), 'rights', public.has_permission('ref_rights')),
      'me', auth.uid())
    into v_out;
    return v_out;
  elsif p_what = 'suggestions' then
    v_tab := coalesce(a ->> 'table', 'producers');
    -- each unlinked old catalog row (not yet confirmed), the entity kind it would map to, its name, and any reference entity of that kind
    -- with the same name (capitals ignored). A report only: nothing is linked until someone links and confirms it.
    if v_tab = 'producers' then
      select coalesce(jsonb_agg(x), '[]'::jsonb) into v_out from (
        select 'producers' as catalog_table, p.id::text as catalog_id, p.name, 'producer' as kind,
               (select jsonb_agg(n.entity_id) from wine_reference.entity_names n join wine_reference.entities e on e.id = n.entity_id
                 where e.kind = 'producer' and e.status <> 'retired' and lower(n.name) = lower(p.name)) as matches
          from public.producers p
         where not exists (select 1 from wine_reference.legacy_links l where l.catalog_table = 'producers' and l.catalog_id = p.id::text and l.status = 'confirmed')
         order by p.name limit v_lim) x;
    elsif v_tab = 'grapes' then
      select coalesce(jsonb_agg(x), '[]'::jsonb) into v_out from (
        select 'grapes' as catalog_table, g.id::text as catalog_id, g.name, 'grape_variety' as kind,
               (select jsonb_agg(n.entity_id) from wine_reference.entity_names n join wine_reference.entities e on e.id = n.entity_id
                 where e.kind = 'grape_variety' and e.status <> 'retired' and lower(n.name) = lower(g.name)) as matches
          from public.grapes g
         where not exists (select 1 from wine_reference.legacy_links l where l.catalog_table = 'grapes' and l.catalog_id = g.id::text and l.status = 'confirmed')
         order by g.name limit v_lim) x;
    elsif v_tab = 'geo_areas' then
      select coalesce(jsonb_agg(x), '[]'::jsonb) into v_out from (
        select 'geo_areas' as catalog_table, g.id::text as catalog_id, g.name, 'place' as kind, g.level::text as level,
               (select jsonb_agg(n.entity_id) from wine_reference.entity_names n join wine_reference.entities e on e.id = n.entity_id
                 where e.kind = 'place' and e.status <> 'retired' and lower(n.name) = lower(g.name)) as matches
          from public.geo_areas g
         where not exists (select 1 from wine_reference.legacy_links l where l.catalog_table = 'geo_areas' and l.catalog_id = g.id::text and l.status = 'confirmed')
         order by g.name limit v_lim) x;
    elsif v_tab = 'wines' then
      select coalesce(jsonb_agg(x), '[]'::jsonb) into v_out from (
        select 'wines' as catalog_table, w.id::text as catalog_id, coalesce(p.name || ' ', '') || coalesce(w.name, '') as name, 'wine_product' as kind,
               (select jsonb_agg(n.entity_id) from wine_reference.entity_names n join wine_reference.entities e on e.id = n.entity_id
                 where e.kind = 'wine_product' and e.status <> 'retired' and lower(n.name) = lower(coalesce(p.name || ' ', '') || coalesce(w.name, ''))) as matches
          from public.wines w left join public.producers p on p.id = w.producer_id
         where not exists (select 1 from wine_reference.legacy_links l where l.catalog_table = 'wines' and l.catalog_id = w.id::text and l.status = 'confirmed')
         order by 3 limit v_lim) x;
    elsif v_tab = 'wine_vintages' then
      select coalesce(jsonb_agg(x), '[]'::jsonb) into v_out from (
        select 'wine_vintages' as catalog_table, v.id::text as catalog_id,
               coalesce(p.name || ' ', '') || coalesce(w.name, '') || ' ' || case when v.is_non_vintage then 'NV' else coalesce(v.vintage_year::text, '?') end as name,
               'wine_edition' as kind,
               case when v.is_non_vintage then 'unidentified non-vintage (until an editor links a stated one)' end as note,
               (select l.entity_id from wine_reference.legacy_links l where l.catalog_table = 'wines' and l.catalog_id = w.id::text and l.status = 'confirmed') as product_entity_id
          from public.wine_vintages v join public.wines w on w.id = v.wine_id left join public.producers p on p.id = w.producer_id
         where not exists (select 1 from wine_reference.legacy_links l where l.catalog_table = 'wine_vintages' and l.catalog_id = v.id::text and l.status = 'confirmed')
         order by 3 limit v_lim) x;
    else
      raise exception 'table must be producers, wines, wine_vintages, grapes or geo_areas' using errcode = '22023';
    end if;
    return jsonb_build_object('table', v_tab, 'basis', 'old catalog, not verified', 'rows', v_out);
  end if;
  raise exception 'Unknown request %', p_what using errcode = '22023';
end $$;
revoke all on function public.ref_staff(text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.ref_staff(text, jsonb) to authenticated;

-- Internal functions added here: nobody but the owner may run them.
revoke all on function wine_reference.require_permission(text) from public, anon, authenticated, service_role;
revoke all on function wine_reference.write_claim_version(uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function wine_reference.fingerprint_002() from public, anon, authenticated, service_role;

-- =====================================================================================================================================
-- 6. Register.
-- =====================================================================================================================================
insert into wine_reference.schema_migrations (version, name, notes, release)
values ('002', 'reference editorial door, wine identity levels, old catalog links',
        'ref_draft, ref_staff, legacy_links; kinds wine_product/wine_edition/wine_release/release_event; 6 relationship and 5 attribute types (proposed)',
        '002 r1 (2026-11-08)')
on conflict (version) do nothing;
update wine_reference.schema_migrations set structure_md5 = wine_reference.fingerprint_002() where version = '002';

commit;

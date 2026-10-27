-- MIGRATION 001: Wine Education Master Reference, canonical foundation. DRAFT (Phase 2.0B.2, 2026-10-26; corrected in Phase 2.0B.3, 2026-10-27; release "001 r3"). NOT RUN ON THE LIVE DATABASE.
--
-- What it does: creates a NEW, PRIVATE schema `wine_reference` with the reference's foundation tables (entities, names, taxonomy, relationship
-- and attribute types, sources and source versions, rights statements, claims and claim versions, claim evidence, claim-version
-- dependencies, review history, a change log and a migration register), plus TWO functions in `public`, both prefixed `ref_`:
--   public.ref_published_names(...)  read-only: published entities and their verified names; returns nothing while the switch is off
--   public.ref_review(...)           staff only: the one way to move a row through draft -> pending_review -> verified -> published / retired
-- What it never does: it changes NO existing table, view, function, row, setting or permission. It adds no data except the controlled
-- vocabularies listed in part 3 (structural words, not wine facts). It creates no wine content and imports nothing from the catalog.
-- The reference is OFF until the owner adds app_config key `reference_enabled` = 1 (absent counts as 0; this script does not add it).
--
-- Design and data dictionary: docs/reference/migration_001/DESIGN.md and DATA_DICTIONARY.md. Tests: docs/reference/migration_001/tests/.
-- Safe to run again: every statement is "if not exists", "create or replace" or "on conflict do nothing"; a second run changes nothing.
-- Once run on the live database this file is frozen: later changes go in migration 002 and after (never edit 001 after it is applied).
-- Requires (all present on the live database per docs/reference/results/FINDINGS.md): PostgreSQL 15+ (gen_random_uuid), the enum
-- public.verification_status, the functions public.has_permission(text) and public.cfg_number(text, numeric),
-- auth.uid(), the roles anon / authenticated / service_role, and pg_trgm installed in schema public. The first step checks them and stops
-- (changing nothing) if one is missing. (Also: public.my_staff_role_code(), for the Owner approval override below.)
--
-- Owner approval override (owner policy, 2026-10-26, Phase 2.0B.2 amendment): the person whose staff role is Owner may approve their own
-- contributions; everyone else keeps the two-person rule. The Owner is identified only by public.my_staff_role_code() = 'owner' (the
-- app's authoritative, server-side role lookup), asked again on every call, and every use is marked owner_override in review_events.

begin;

-- 0. Stop before changing anything if a required piece of the live database is missing.
do $$
begin
  if to_regtype('public.verification_status') is null then raise exception 'Missing enum public.verification_status'; end if;
  if to_regprocedure('public.has_permission(text)') is null then raise exception 'Missing function public.has_permission(text)'; end if;
  if to_regprocedure('public.my_staff_role_code()') is null then raise exception 'Missing function public.my_staff_role_code()'; end if;
  if to_regprocedure('public.cfg_number(text,numeric)') is null then raise exception 'Missing function public.cfg_number(text, numeric)'; end if;
  if to_regprocedure('auth.uid()') is null then raise exception 'Missing function auth.uid()'; end if;
end $$;

-- 0b. Preflight (Phase 2.0B.3 correction 6). RELEASE below names this exact version of the script; the owner also checks the file's
--     SHA-256 against DESIGN.md before running it. The run stops, changing nothing, when:
--       - a function named ref_* exists in public that this migration did not create (name clash);
--       - public.ref_* exists but the schema does not, or the schema exists but migration 001 is not registered (partial or foreign);
--       - a DIFFERENT release of 001 is registered (changes go in migration 002, never by replaying an edited 001);
--       - the schema's structure no longer matches the fingerprint stored after the last run (someone changed it by hand: drift).
do $$
declare
  c_release constant text := '001 r3 (2026-10-27)';
  v_foreign text; v_ours boolean; v_release text; v_stored text;
begin
  select string_agg(p.proname || '(' || pg_catalog.oidvectortypes(p.proargtypes) || ')', ', ') into v_foreign
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'ref\_%'
     and not (p.proname = 'ref_published_names' and pg_catalog.oidvectortypes(p.proargtypes) = 'text, text, integer')
     and not (p.proname = 'ref_review' and pg_catalog.oidvectortypes(p.proargtypes) = 'text, uuid, text, text, uuid');
  if v_foreign is not null then raise exception 'Preflight: unexpected function(s) in public: %. Stop and investigate.', v_foreign; end if;
  select exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname in ('ref_published_names', 'ref_review')) into v_ours;
  if not exists (select 1 from pg_catalog.pg_namespace where nspname = 'wine_reference') then
    if v_ours then raise exception 'Preflight: public.ref_* exists but schema wine_reference does not (partial or foreign deployment). Stop.'; end if;
    return;   -- fresh install
  end if;
  if to_regclass('wine_reference.schema_migrations') is null then
    raise exception 'Preflight: schema wine_reference exists without its migration register (foreign or partial). Stop.';
  end if;
  select release, structure_md5 into v_release, v_stored from wine_reference.schema_migrations where version = '001';
  if not found then raise exception 'Preflight: schema wine_reference exists but migration 001 is not registered (partial or foreign). Stop.'; end if;
  if v_release is distinct from c_release then
    raise exception 'Preflight: release "%" of migration 001 is applied, this file is "%". Never replay an edited 001; write migration 002.', v_release, c_release;
  end if;
  if to_regprocedure('wine_reference.structure_fingerprint()') is null or wine_reference.structure_fingerprint() is distinct from v_stored then
    raise exception 'Preflight: the schema wine_reference was changed by hand since migration 001 ran (structure drift). Stop and investigate.';
  end if;
end $$;

-- =====================================================================================================================================
-- 1. The private schema. Nobody but its owner (postgres) may use it. It is NOT to be added to the API's Exposed schemas.
-- =====================================================================================================================================
create schema if not exists wine_reference;
comment on schema wine_reference is 'Wine Education Master Reference (canonical foundation). Private: reached only through public.ref_* functions. Not exposed to the Data API.';
revoke all on schema wine_reference from public;
revoke all on schema wine_reference from anon, authenticated, service_role;
-- New functions are executable by PUBLIC by PostgreSQL's own default; switch that off inside this schema.
alter default privileges in schema wine_reference revoke execute on functions from public;
alter default privileges in schema wine_reference revoke all on tables from public;

-- =====================================================================================================================================
-- 2. Migration register (which reference migrations ran, when, by whom).
-- =====================================================================================================================================
create table if not exists wine_reference.schema_migrations (
  version     text primary key check (version ~ '^[0-9]{3}[a-z]?$'),
  name        text not null,
  applied_at  timestamptz not null default now(),
  applied_by  text not null default current_user,
  notes       text,
  release     text not null default '',     -- which release of the script was applied (checked on replay)
  structure_md5 text                         -- fingerprint of the schema's structure after the run (checked on replay: drift)
);

-- =====================================================================================================================================
-- 3. Controlled vocabularies (small lists of allowed words; changing them is an owner decision, not data entry).
-- =====================================================================================================================================
create table if not exists wine_reference.entity_kinds (
  code        text primary key check (code ~ '^[a-z][a-z_]{1,39}$'),
  label       text not null,
  description text not null default '',
  sort_order  smallint not null default 100
);
insert into wine_reference.entity_kinds (code, label, description, sort_order) values
  ('grape_variety',   'Grape variety',   'A grape variety as a genetic identity (not a name; names are separate rows).', 10),
  ('place',           'Place',           'A geographic or legally delimited wine place (country, region, appellation, vineyard ...).', 20),
  ('producer',        'Producer',        'The maker of wine as a business identity (separate from its brands and its legal entities).', 30),
  ('brand',           'Brand',           'A trading or label name under which wines are sold (separate from producers and legal entities).', 40),
  ('legal_entity',    'Legal entity',    'A company, cooperative, trust or other registered body that can own and be owned.', 50),
  ('person',          'Person',          'A natural person, only where a published claim needs one (owner, founder ...).', 60),
  ('term',            'Term',            'A word or concept of the reference (tasting, winemaking, law ...).', 70),
  ('taxonomy_domain', 'Knowledge domain','One of the approved knowledge domains (rows added only from the owner''s approved list).', 90),
  ('taxonomy_node',   'Knowledge subdomain', 'A node under a knowledge domain (rows added only from the owner''s approved taxonomy).', 91)
on conflict (code) do nothing;

create table if not exists wine_reference.name_kinds (
  code        text primary key check (code ~ '^[a-z][a-z_]{1,39}$'),
  label       text not null,
  description text not null default ''
);
insert into wine_reference.name_kinds (code, label, description) values
  ('official',        'Official or legal', 'The name as registered or legally defined. Never respelled or translated.'),
  ('label',           'As on the label',   'The name as printed on a label.'),
  ('common',          'Common',            'A name in everyday use.'),
  ('historical',      'Historical',        'A name used in the past (with its dates).'),
  ('translation',     'Translation',       'A translation into another language; never replaces an official name.'),
  ('transliteration', 'Transliteration',   'The same name written in another script.'),
  ('synonym',         'Synonym',           'Another name for the same entity, as stated by a source.'),
  ('shortcut',        'Typing shortcut',   'Typing help only; never shown as a name.')
on conflict (code) do nothing;

create table if not exists wine_reference.source_kinds (
  code        text primary key check (code ~ '^[a-z][a-z_]{1,39}$'),
  label       text not null
);
insert into wine_reference.source_kinds (code, label) values
  ('regulation', 'Law, regulation or official specification'), ('register', 'Official register or database'),
  ('producer', 'Producer''s own document'), ('publication', 'Book, article or reference work'), ('scientific', 'Scientific study'),
  ('dataset', 'Published dataset'), ('label', 'Label photograph'), ('website', 'Web page'), ('other', 'Other')
on conflict (code) do nothing;

-- How a piece of evidence was obtained (Phase 1.9 revision 7: evidence is kept apart by modality; sensory evidence never counts as documentary).
create table if not exists wine_reference.evidence_modalities (
  code        text primary key check (code ~ '^[a-z][a-z_]{1,39}$'),
  label       text not null
);
insert into wine_reference.evidence_modalities (code, label) values
  ('documentary', 'Documentary (text of a source)'), ('label', 'Label as printed'), ('analytical', 'Laboratory or analytical measurement'),
  ('genetic', 'Genetic (DNA) analysis'), ('cartographic', 'Map or delimitation'), ('sensory', 'Sensory assessment'),
  ('expert_attestation', 'Signed statement by a named expert')
on conflict (code) do nothing;

-- =====================================================================================================================================
-- 4. Rights statements (Phase 1.9 revision 8: licensing is recorded per component, not per source).
-- =====================================================================================================================================
create table if not exists wine_reference.rights_statements (
  id                 uuid primary key default gen_random_uuid(),
  licence_code       text not null check (length(btrim(licence_code)) between 1 and 60),   -- e.g. 'CC-BY-4.0', 'Licence-Ouverte-2.0', 'all-rights-reserved', 'unknown'
  licence_name       text not null default '',
  licence_url        text check (licence_url is null or licence_url ~ '^https?://'),
  rights_holder      text not null default '',
  attribution_text   text not null default '',
  allows_quote       boolean not null default false,
  allows_copy        boolean not null default false,
  allows_commercial  boolean not null default false,
  allows_derivative  boolean not null default false,
  status             public.verification_status not null default 'draft',
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  checked_by         uuid,
  checked_at         timestamptz,
  retired_at         timestamptz,
  note               text not null default '',
  constraint rights_statements_retired_dates check ((status = 'retired') = (retired_at is not null))
);

-- =====================================================================================================================================
-- 5. Entities: one permanent id per real-world thing. Names, claims and taxonomy hang off it.
-- =====================================================================================================================================
create table if not exists wine_reference.entities (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null references wine_reference.entity_kinds(code),
  status         public.verification_status not null default 'draft',
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now(),
  published_at   timestamptz,
  published_by   uuid,
  retired_at     timestamptz,
  superseded_by  uuid references wine_reference.entities(id),
  note           text not null default '',
  constraint entities_not_self_superseded check (superseded_by is null or superseded_by <> id),
  constraint entities_published_is_verified check (published_at is null or status in ('verified', 'retired')),
  constraint entities_retired_dates check ((status = 'retired') = (retired_at is not null))
);
create index if not exists entities_kind on wine_reference.entities (kind);
create index if not exists entities_published on wine_reference.entities (kind) where status = 'verified' and published_at is not null;

-- Names (Phase 1.9 revision 5: one unified naming table for every kind of entity, every language and every period).
create table if not exists wine_reference.entity_names (
  id                   uuid primary key default gen_random_uuid(),
  entity_id            uuid not null references wine_reference.entities(id),
  name                 text not null check (length(btrim(name)) between 1 and 300),
  language             text not null default 'und' check (language ~ '^([a-z]{2,3}(-[A-Za-z0-9]{2,8})*|und)$'),   -- BCP 47; 'und' = not stated
  script               text check (script is null or script ~ '^[A-Z][a-z]{3}$'),                              -- ISO 15924, e.g. 'Latn'
  name_kind            text not null references wine_reference.name_kinds(code),
  is_preferred         boolean not null default false,
  valid_from           date,
  valid_from_precision text not null default 'unknown' check (valid_from_precision in ('day', 'month', 'year', 'decade', 'unknown')),
  valid_to             date,
  valid_to_precision   text not null default 'unknown' check (valid_to_precision in ('day', 'month', 'year', 'decade', 'unknown')),
  status               public.verification_status not null default 'draft',
  created_by           uuid default auth.uid(),
  created_at           timestamptz not null default now(),
  retired_at           timestamptz,
  note                 text not null default '',
  constraint entity_names_retired_dates check ((status = 'retired') = (retired_at is not null)),
  constraint entity_names_dates check (valid_to is null or valid_from is null or valid_to >= valid_from)
);
create unique index if not exists entity_names_one
  on wine_reference.entity_names (entity_id, lower(name), language, name_kind, coalesce(valid_from, '-infinity'::date));
create unique index if not exists entity_names_one_preferred
  on wine_reference.entity_names (entity_id, language) where is_preferred and valid_to is null and status <> 'retired';
create index if not exists entity_names_entity on wine_reference.entity_names (entity_id);
create index if not exists entity_names_search on wine_reference.entity_names using gin (lower(name) public.gin_trgm_ops);

-- =====================================================================================================================================
-- 6. Taxonomy: the approved knowledge domains and their nodes. Each is an entity, so its labels use the unified names table.
--    Created EMPTY: rows come only from the owner's approved list (the 14 domains and the ~140-node taxonomy are pending import).
-- =====================================================================================================================================
create table if not exists wine_reference.taxonomy_domains (
  entity_id         uuid primary key references wine_reference.entities(id),
  code              text not null unique check (code ~ '^[A-Z0-9][A-Z0-9_.-]{0,19}$'),
  sort_order        smallint not null,
  source_version_id uuid,   -- the approved taxonomy document it came from (foreign key added below, after source_versions exists)
  created_at        timestamptz not null default now()
);
create table if not exists wine_reference.taxonomy_nodes (
  entity_id         uuid primary key references wine_reference.entities(id),
  domain_id         uuid not null references wine_reference.taxonomy_domains(entity_id),
  parent_id         uuid references wine_reference.taxonomy_nodes(entity_id),
  code              text not null unique check (code ~ '^[A-Z0-9][A-Z0-9_.-]{0,29}$'),
  sort_order        smallint not null default 0,
  source_version_id uuid,
  created_at        timestamptz not null default now(),
  constraint taxonomy_nodes_not_own_parent check (parent_id is null or parent_id <> entity_id)
);
create index if not exists taxonomy_nodes_domain on wine_reference.taxonomy_nodes (domain_id);
create index if not exists taxonomy_nodes_parent on wine_reference.taxonomy_nodes (parent_id);

-- Which taxonomy nodes an entity belongs to.
create table if not exists wine_reference.taxonomy_assignments (
  id           uuid not null default gen_random_uuid() unique,
  entity_id    uuid not null references wine_reference.entities(id),
  node_id      uuid not null references wine_reference.taxonomy_nodes(entity_id),
  is_primary   boolean not null default false,
  status       public.verification_status not null default 'draft',
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  retired_at   timestamptz,
  primary key (entity_id, node_id),
  constraint taxonomy_assignments_retired_dates check ((status = 'retired') = (retired_at is not null))
);
create unique index if not exists taxonomy_assignments_one_primary on wine_reference.taxonomy_assignments (entity_id) where is_primary and status <> 'retired';
create index if not exists taxonomy_assignments_node on wine_reference.taxonomy_assignments (node_id);

-- =====================================================================================================================================
-- 7. Controlled claim types: relationship types (entity -> entity) and attribute types (entity -> value).
--    Seeds are PROPOSED (unusable) until the owner sets them to 'active'. They are vocabulary, not facts.
-- =====================================================================================================================================
create table if not exists wine_reference.relationship_types (
  code              text primary key check (code ~ '^[a-z][a-z_]{1,39}$'),
  label             text not null,
  description       text not null default '',
  subject_kinds     text[] not null,
  object_kinds      text[] not null,
  allows_cycles     boolean not null default false,
  requires_dates    boolean not null default false,
  default_risk_tier smallint not null default 2 check (default_risk_tier between 1 and 3),
  required_modality text references wine_reference.evidence_modalities(code),   -- publication needs at least one piece of evidence of this modality
  status            text not null default 'proposed' check (status in ('proposed', 'active', 'retired')),
  created_at        timestamptz not null default now()
);
insert into wine_reference.relationship_types (code, label, description, subject_kinds, object_kinds, allows_cycles, requires_dates, default_risk_tier, required_modality) values
  ('part_of',            'Is part of',              'A place inside another place, or a node inside another.', '{place}', '{place}', false, false, 2, null),
  ('genetic_parent_of',  'Is a genetic parent of',  'Phase 1.9 revision 1: a parent variety of another variety, only from genetic evidence.', '{grape_variety}', '{grape_variety}', false, false, 1, 'genetic'),
  ('mutation_of',        'Is a mutation of',        'Phase 1.9 revision 1: a variety that arose as a mutation of another, only from genetic evidence.', '{grape_variety}', '{grape_variety}', false, false, 1, 'genetic'),
  ('holds_interest_in',  'Holds an interest in',    'Phase 1.9 revision 2: ownership or another stated interest, with its dates and, when stated, its share.', '{legal_entity,person}', '{producer,brand,legal_entity,place}', true, true, 2, null),
  ('brand_of',           'Is a brand of',           'Phase 1.9 revision 3: a brand used by a producer.', '{brand}', '{producer}', false, true, 2, null),
  ('operated_by',        'Is operated by',          'Phase 1.9 revision 3: the legal entity that operates a producer.', '{producer}', '{legal_entity}', false, true, 2, null)
on conflict (code) do nothing;

create table if not exists wine_reference.attribute_types (
  code              text primary key check (code ~ '^[a-z][a-z_]{1,39}$'),
  label             text not null,
  description       text not null default '',
  subject_kinds     text[] not null,
  value_type        text not null check (value_type in ('text', 'number', 'date', 'boolean')),
  unit              text,
  default_risk_tier smallint not null default 2 check (default_risk_tier between 1 and 3),
  status            text not null default 'proposed' check (status in ('proposed', 'active', 'retired')),
  created_at        timestamptz not null default now()
);
-- No attribute types are seeded: each one is an owner decision (DESIGN.md, owner decisions).

-- =====================================================================================================================================
-- 8. Sources and source versions (a source is the work; a version is the exact edition, page state or file that was read).
-- =====================================================================================================================================
create table if not exists wine_reference.sources (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null references wine_reference.source_kinds(code),
  title       text not null check (length(btrim(title)) between 1 and 500),
  publisher   text not null default '',
  authors     text not null default '',
  identifier  text,                                   -- ISBN, DOI, official reference number ...
  url         text check (url is null or url ~ '^https?://'),
  language    text check (language is null or language ~ '^([a-z]{2,3}(-[A-Za-z0-9]{2,8})*|und)$'),
  status      public.verification_status not null default 'draft',
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  retired_at  timestamptz,
  note        text not null default '',
  constraint sources_retired_dates check ((status = 'retired') = (retired_at is not null))
);
create table if not exists wine_reference.source_versions (
  id               uuid primary key default gen_random_uuid(),
  source_id        uuid not null references wine_reference.sources(id),
  version_label    text not null check (length(btrim(version_label)) between 1 and 120),   -- edition, version number, or the retrieval date
  published_on     date,
  retrieved_at     timestamptz,
  url              text check (url is null or url ~ '^https?://'),
  content_sha256   text check (content_sha256 is null or content_sha256 ~ '^[0-9a-f]{64}$'),
  storage_path     text,                              -- a private copy, only where the rights statement allows copying
  rights_id        uuid references wine_reference.rights_statements(id),
  status           public.verification_status not null default 'draft',
  created_by       uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  superseded_by    uuid references wine_reference.source_versions(id),
  retired_at       timestamptz,
  note             text not null default '',
  constraint source_versions_retired_dates check ((status = 'retired') = (retired_at is not null)),
  unique (source_id, version_label),
  constraint source_versions_not_self_superseded check (superseded_by is null or superseded_by <> id),
  constraint source_versions_copy_needs_rights check (storage_path is null or rights_id is not null)
);
create index if not exists source_versions_source on wine_reference.source_versions (source_id);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'taxonomy_domains_source_version_fk') then
    alter table wine_reference.taxonomy_domains add constraint taxonomy_domains_source_version_fk foreign key (source_version_id) references wine_reference.source_versions(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'taxonomy_nodes_source_version_fk') then
    alter table wine_reference.taxonomy_nodes add constraint taxonomy_nodes_source_version_fk foreign key (source_version_id) references wine_reference.source_versions(id);
  end if;
end $$;

-- =====================================================================================================================================
-- 9. Claims (the stable identity of a statement) and claim versions (what it says, when it was true, its status).
-- =====================================================================================================================================
create table if not exists wine_reference.claims (
  id                 uuid primary key default gen_random_uuid(),
  subject_entity_id  uuid not null references wine_reference.entities(id),
  relationship_type  text references wine_reference.relationship_types(code),
  object_entity_id   uuid references wine_reference.entities(id),
  attribute_type     text references wine_reference.attribute_types(code),
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  constraint claims_one_shape check (
    (relationship_type is not null and object_entity_id is not null and attribute_type is null) or
    (attribute_type is not null and relationship_type is null and object_entity_id is null)),
  constraint claims_not_about_itself check (object_entity_id is null or object_entity_id <> subject_entity_id)
);
create index if not exists claims_subject on wine_reference.claims (subject_entity_id);
create index if not exists claims_object on wine_reference.claims (object_entity_id) where object_entity_id is not null;
create index if not exists claims_relationship on wine_reference.claims (relationship_type, subject_entity_id) where relationship_type is not null;

create table if not exists wine_reference.claim_versions (
  id                     uuid primary key default gen_random_uuid(),
  claim_id               uuid not null references wine_reference.claims(id),
  version_no             integer not null check (version_no >= 1),
  value_text             text check (value_text is null or length(value_text) <= 2000),
  value_number           numeric,
  value_date             date,
  value_boolean          boolean,
  qualifiers             jsonb not null default '{}'::jsonb check (jsonb_typeof(qualifiers) = 'object' and octet_length(qualifiers::text) <= 4000),
  valid_from             date,
  valid_from_precision   text not null default 'unknown' check (valid_from_precision in ('day', 'month', 'year', 'decade', 'unknown')),
  valid_to               date,
  valid_to_precision     text not null default 'unknown' check (valid_to_precision in ('day', 'month', 'year', 'decade', 'unknown')),
  risk_tier              smallint not null check (risk_tier between 1 and 3),
  status                 public.verification_status not null default 'draft',
  supersedes_version_id  uuid references wine_reference.claim_versions(id),
  change_note            text not null default '',
  created_by             uuid default auth.uid(),
  created_at             timestamptz not null default now(),
  published_at           timestamptz,
  published_by           uuid,
  retired_at             timestamptz,
  suspended_at           timestamptz,       -- set automatically when a published version stops being sound (evidence, rights, dependency, entity)
  suspended_reason       text,
  unique (claim_id, version_no),
  constraint claim_versions_suspended_is_published check (suspended_at is null or published_at is not null),
  constraint claim_versions_suspended_reason check ((suspended_at is null) = (suspended_reason is null)),
  constraint claim_versions_dates check (valid_to is null or valid_from is null or valid_to >= valid_from),
  constraint claim_versions_not_self check (supersedes_version_id is null or supersedes_version_id <> id),
  constraint claim_versions_published_is_verified check (published_at is null or status in ('verified', 'retired')),
  constraint claim_versions_retired_dates check ((status = 'retired') = (retired_at is not null))
);
-- At most one live published version per claim.
create unique index if not exists claim_versions_one_published
  on wine_reference.claim_versions (claim_id) where status = 'verified' and published_at is not null;
create index if not exists claim_versions_claim on wine_reference.claim_versions (claim_id);

-- Claim-version dependencies (Phase 1.9 revision 6): this version holds only if that version holds.
create table if not exists wine_reference.claim_version_dependencies (
  dependent_version_id   uuid not null references wine_reference.claim_versions(id),
  depends_on_version_id  uuid not null references wine_reference.claim_versions(id),
  kind                   text not null default 'requires' check (kind in ('requires', 'derived_from')),
  created_by             uuid default auth.uid(),
  created_at             timestamptz not null default now(),
  primary key (dependent_version_id, depends_on_version_id),
  constraint claim_version_dependencies_not_self check (dependent_version_id <> depends_on_version_id)
);
create index if not exists claim_version_dependencies_on on wine_reference.claim_version_dependencies (depends_on_version_id);

-- Evidence: where a claim version is supported (or contradicted), in which source version, how, and with what rights.
create table if not exists wine_reference.claim_evidence (
  id                 uuid primary key default gen_random_uuid(),
  claim_version_id   uuid not null references wine_reference.claim_versions(id),
  source_version_id  uuid not null references wine_reference.source_versions(id),
  modality           text not null references wine_reference.evidence_modalities(code),
  role               text not null default 'supports' check (role in ('supports', 'contradicts', 'context')),
  locator            text not null check (length(btrim(locator)) between 1 and 300),   -- page, section, article, URL fragment
  quote              text check (quote is null or length(quote) <= 600),
  quote_language     text check (quote_language is null or quote_language ~ '^([a-z]{2,3}(-[A-Za-z0-9]{2,8})*|und)$'),
  quote_rights_id    uuid references wine_reference.rights_statements(id),
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  constraint claim_evidence_quote_needs_rights check (quote is null or quote_rights_id is not null)
);
create index if not exists claim_evidence_version on wine_reference.claim_evidence (claim_version_id);
create index if not exists claim_evidence_source on wine_reference.claim_evidence (source_version_id);

-- =====================================================================================================================================
-- 10. Review history (append-only) and the change log (append-only).
-- =====================================================================================================================================
create table if not exists wine_reference.review_events (
  id           bigint generated always as identity primary key,
  target_table text not null check (target_table in ('entities', 'entity_names', 'claim_versions', 'sources', 'source_versions', 'rights_statements', 'taxonomy_assignments')),
  target_id    uuid not null,
  decision     text not null check (decision in ('submit', 'approve', 'reject', 'publish', 'retire', 'suspend')),   -- suspend: automatic
  from_status  public.verification_status not null,
  to_status    public.verification_status not null,
  actor        uuid not null,
  acted_at     timestamptz not null default now(),
  note         text not null default '' check (length(note) <= 2000),   -- optional justification
  owner_override boolean not null default false,                         -- true when the Owner approved without a second person
  constraint review_events_override_only_on_approve check (not owner_override or decision = 'approve')
);
create index if not exists review_events_target on wine_reference.review_events (target_table, target_id, acted_at);

create table if not exists wine_reference.change_log (
  id          bigint generated always as identity primary key,
  table_name  text not null,
  row_key     text not null,
  operation   text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  before      jsonb,
  after       jsonb,
  actor       uuid,
  db_user     text not null default current_user,
  changed_at  timestamptz not null default now()
);
create index if not exists change_log_row on wine_reference.change_log (table_name, row_key, changed_at);

-- =====================================================================================================================================
-- 11. Rules enforced in the database (triggers). Functions here are owned by postgres and not executable by anyone else.
-- =====================================================================================================================================

-- 11a. Change log for every content table.
create or replace function wine_reference.log_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_row jsonb; v_key text;
begin
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_key := coalesce(v_row ->> 'id', v_row ->> 'entity_id', v_row ->> 'code', v_row ->> 'version',
                    concat_ws('|', v_row ->> 'dependent_version_id', v_row ->> 'depends_on_version_id'));
  insert into wine_reference.change_log (table_name, row_key, operation, before, after, actor)
  values (tg_table_name, coalesce(v_key, ''), tg_op,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end,
          auth.uid());
  return null;
end $$;

-- 11b. Append-only tables refuse updates and deletes.
create or replace function wine_reference.refuse_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'wine_reference.%: rows are never changed or deleted (append-only)', tg_table_name using errcode = '42501';
end $$;

-- 11c. Lifecycle and immutability for every record that has a status (Phase 2.0B.3 correction 3).
--      Lifecycle columns (status, publication, retirement, supersession, rights check, suspension) change ONLY inside public.ref_review,
--      which sets a flag for the transaction. Every other column is frozen as soon as the row leaves draft: an approved (or submitted)
--      name, source, source version, rights statement, claim version or assignment is never edited; it is replaced by a new row that goes
--      through review, and the old one is retired. Rows that left draft are never deleted.
create or replace function wine_reference.guard_row() returns trigger
language plpgsql set search_path = '' as $$
declare
  k constant text[] := array['status', 'published_at', 'published_by', 'retired_at', 'superseded_by', 'checked_by', 'checked_at',
                             'suspended_at', 'suspended_reason'];
  v_old jsonb := to_jsonb(old); v_new jsonb; v_life boolean := false; x text;
  v_flag boolean := coalesce(current_setting('wine_reference.in_review', true), '') = 'on';
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'wine_reference.%: a row that left draft is never deleted; retire it instead', tg_table_name using errcode = '42501';
    end if;
    return old;
  end if;
  v_new := to_jsonb(new);
  foreach x in array k loop
    if (v_new -> x) is distinct from (v_old -> x) then v_life := true; end if;
  end loop;
  if v_life and not v_flag then
    raise exception 'Status, publication, retirement, supersession and suspension change only through public.ref_review' using errcode = '42501';
  end if;
  if old.status <> 'draft' and (v_new - k) is distinct from (v_old - k) then
    raise exception 'wine_reference.%: this row is % and frozen; make a new row and retire this one', tg_table_name, old.status using errcode = '42501';
  end if;
  return new;
end $$;

-- A claim's identity (subject, type, object) is frozen once any of its versions left draft.
create or replace function wine_reference.freeze_claim() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from wine_reference.claim_versions v where v.claim_id = old.id and v.status <> 'draft') then
    if tg_op = 'DELETE' or (to_jsonb(new) - 'note') is distinct from (to_jsonb(old) - 'note') then
      raise exception 'A claim whose versions left draft keeps its subject, type and object; make a new claim' using errcode = '42501';
    end if;
  end if;
  return coalesce(new, old);
end $$;

-- A taxonomy domain's or node's code, parent, domain and source are frozen once its entity left draft (sort order may change).
create or replace function wine_reference.freeze_taxonomy() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (select status from wine_reference.entities where id = old.entity_id) <> 'draft' then
    if tg_op = 'DELETE' or (to_jsonb(new) - 'sort_order') is distinct from (to_jsonb(old) - 'sort_order') then
      raise exception 'This taxonomy row''s entity left draft; its code, parent and domain are frozen' using errcode = '42501';
    end if;
  end if;
  return coalesce(new, old);
end $$;

-- A claim type that claims already use keeps its meaning: only its label, description and retirement may change.
create or replace function wine_reference.freeze_claim_type() returns trigger
language plpgsql set search_path = '' as $$
declare v_used boolean;
begin
  if tg_table_name = 'relationship_types' then
    select exists (select 1 from wine_reference.claims c where c.relationship_type = old.code) into v_used;
  else
    select exists (select 1 from wine_reference.claims c where c.attribute_type = old.code) into v_used;
  end if;
  if v_used then
    if tg_op = 'DELETE' then raise exception 'Claim type % is in use and cannot be deleted', old.code using errcode = '42501'; end if;
    if (to_jsonb(new) - array['label', 'description', 'status']) is distinct from (to_jsonb(old) - array['label', 'description', 'status'])
       or (new.status = 'proposed' and old.status <> 'proposed') then
      raise exception 'Claim type % is in use: only its label, description and retirement may change', old.code using errcode = '42501';
    end if;
  end if;
  return coalesce(new, old);
end $$;

-- 11d. Evidence and dependencies can only be added to, or removed from, a draft claim version.
create or replace function wine_reference.draft_version_only(p_version uuid) returns void
language plpgsql set search_path = '' as $$
begin
  if (select status from wine_reference.claim_versions where id = p_version) is distinct from 'draft' then
    raise exception 'Evidence and dependencies can only change while the claim version is a draft' using errcode = '42501';
  end if;
end $$;
create or replace function wine_reference.evidence_only_on_draft() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then perform wine_reference.draft_version_only(old.claim_version_id); end if;
  if tg_op in ('INSERT', 'UPDATE') then perform wine_reference.draft_version_only(new.claim_version_id); return new; end if;
  return old;
end $$;
create or replace function wine_reference.dependency_only_on_draft() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then perform wine_reference.draft_version_only(old.dependent_version_id); end if;
  if tg_op in ('INSERT', 'UPDATE') then perform wine_reference.draft_version_only(new.dependent_version_id); return new; end if;
  return old;
end $$;

-- 11e. A claim's types, kinds and dates must fit its type; cycles are refused where the type does not allow them.
create or replace function wine_reference.check_claim() returns trigger
language plpgsql set search_path = '' as $$
declare r record; v_subject text; v_object text; v_cycle boolean;
begin
  select kind into v_subject from wine_reference.entities where id = new.subject_entity_id;
  if new.relationship_type is not null then
    select * into r from wine_reference.relationship_types where code = new.relationship_type;
    if r.status <> 'active' then raise exception 'Relationship type % is not active', new.relationship_type using errcode = '23514'; end if;
    select kind into v_object from wine_reference.entities where id = new.object_entity_id;
    if not (v_subject = any (r.subject_kinds)) or not (v_object = any (r.object_kinds)) then
      raise exception 'Relationship type % does not connect a % to a %', new.relationship_type, v_subject, v_object using errcode = '23514';
    end if;
    if not r.allows_cycles then
      -- would the object already reach the subject through claims of the same type (any status except retired)?
      with recursive reach(id) as (
        select c.object_entity_id from wine_reference.claims c
         where c.relationship_type = new.relationship_type and c.subject_entity_id = new.object_entity_id and c.id <> new.id
        union
        select c.object_entity_id from wine_reference.claims c join reach on c.subject_entity_id = reach.id
         where c.relationship_type = new.relationship_type and c.id <> new.id
      )
      select exists (select 1 from reach where id = new.subject_entity_id) into v_cycle;
      if v_cycle or new.object_entity_id = new.subject_entity_id then
        raise exception 'This % claim would make a cycle', new.relationship_type using errcode = '23514';
      end if;
    end if;
  else
    select * into r from wine_reference.attribute_types where code = new.attribute_type;
    if r.status <> 'active' then raise exception 'Attribute type % is not active', new.attribute_type using errcode = '23514'; end if;
    if not (v_subject = any (r.subject_kinds)) then
      raise exception 'Attribute type % does not apply to a %', new.attribute_type, v_subject using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

-- 11f. A claim version's value must fit the attribute type; dated relationship types need a start date; a share is 0 to 100.
create or replace function wine_reference.check_claim_version() returns trigger
language plpgsql set search_path = '' as $$
declare c record; v_type text; v_needs_dates boolean; v_share numeric;
begin
  select * into c from wine_reference.claims where id = new.claim_id;
  if c.attribute_type is not null then
    select value_type into v_type from wine_reference.attribute_types where code = c.attribute_type;
    if (v_type = 'text' and new.value_text is null) or (v_type = 'number' and new.value_number is null) or
       (v_type = 'date' and new.value_date is null) or (v_type = 'boolean' and new.value_boolean is null) then
      raise exception 'Attribute % needs a % value', c.attribute_type, v_type using errcode = '23514';
    end if;
  else
    select requires_dates into v_needs_dates from wine_reference.relationship_types where code = c.relationship_type;
    -- a dated relationship needs its start date, or an explicit statement that the dates are not known
    if v_needs_dates and new.valid_from is null and coalesce(new.qualifiers ->> 'dates_unknown', '') <> 'true' then
      raise exception 'A dated relationship needs valid_from, or qualifiers {"dates_unknown": true}' using errcode = '23514';
    end if;
  end if;
  if new.qualifiers ? 'share_percent' then
    begin v_share := (new.qualifiers ->> 'share_percent')::numeric;
    exception when others then raise exception 'share_percent must be a number' using errcode = '23514'; end;
    if v_share < 0 or v_share > 100 then raise exception 'share_percent must be between 0 and 100' using errcode = '23514'; end if;
  end if;
  return new;
end $$;

-- 11g. Taxonomy: a node's parent is in the same domain and the tree has no cycles.
create or replace function wine_reference.check_taxonomy_node() returns trigger
language plpgsql set search_path = '' as $$
declare v_parent_domain uuid; v_cycle boolean;
begin
  if new.parent_id is not null then
    select domain_id into v_parent_domain from wine_reference.taxonomy_nodes where entity_id = new.parent_id;
    if v_parent_domain is distinct from new.domain_id then
      raise exception 'A taxonomy node''s parent must be in the same domain' using errcode = '23514';
    end if;
    with recursive up(id) as (
      select parent_id from wine_reference.taxonomy_nodes where entity_id = new.parent_id
      union
      select n.parent_id from wine_reference.taxonomy_nodes n join up on n.entity_id = up.id where n.parent_id is not null
    )
    select exists (select 1 from up where id = new.entity_id) into v_cycle;
    if v_cycle or new.parent_id = new.entity_id then raise exception 'This would make a cycle in the taxonomy' using errcode = '23514'; end if;
  end if;
  if (select kind from wine_reference.entities where id = new.entity_id) <> 'taxonomy_node' then
    raise exception 'A taxonomy node must be an entity of kind taxonomy_node' using errcode = '23514';
  end if;
  return new;
end $$;

create or replace function wine_reference.check_taxonomy_domain() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (select kind from wine_reference.entities where id = new.entity_id) <> 'taxonomy_domain' then
    raise exception 'A knowledge domain must be an entity of kind taxonomy_domain' using errcode = '23514';
  end if;
  return new;
end $$;

-- 11g2. A private copy of a source is recorded only under verified rights that allow copying (checked when written, and again
--       at approval; if the rights are retired later, the verify script lists the copy so it can be removed).
create or replace function wine_reference.check_source_copy() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.storage_path is not null and not exists (select 1 from wine_reference.rights_statements rs
                                                    where rs.id = new.rights_id and rs.status = 'verified' and rs.allows_copy) then
    raise exception 'A private copy needs verified rights that allow copying' using errcode = '23514';
  end if;
  return new;
end $$;

-- 11h. Claim-version dependencies have no cycles.
create or replace function wine_reference.check_dependency() returns trigger
language plpgsql set search_path = '' as $$
declare v_cycle boolean;
begin
  with recursive down(id) as (
    select depends_on_version_id from wine_reference.claim_version_dependencies where dependent_version_id = new.depends_on_version_id
    union
    select d.depends_on_version_id from wine_reference.claim_version_dependencies d join down on d.dependent_version_id = down.id
  )
  select exists (select 1 from down where id = new.dependent_version_id) into v_cycle;
  if v_cycle then raise exception 'This dependency would make a cycle' using errcode = '23514'; end if;
  return new;
end $$;

-- 11i. New rows always start as draft, with no lifecycle values (status and publication change only through public.ref_review).
create or replace function wine_reference.start_as_draft() returns trigger
language plpgsql set search_path = '' as $$
declare v jsonb := to_jsonb(new);
begin
  if coalesce(current_setting('wine_reference.in_review', true), '') <> 'on' then
    if new.status <> 'draft' or coalesce(v ->> 'published_at', v ->> 'retired_at', v ->> 'superseded_by', v ->> 'suspended_at', v ->> 'checked_at') is not null then
      raise exception 'New rows start as draft; use public.ref_review to move them on' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

-- Attach the triggers (drop-and-create keeps a replay harmless).
do $$
declare t text;
begin
  foreach t in array array['entities', 'entity_names', 'taxonomy_domains', 'taxonomy_nodes', 'taxonomy_assignments', 'relationship_types',
                           'attribute_types', 'rights_statements', 'sources', 'source_versions', 'claims', 'claim_versions',
                           'claim_version_dependencies', 'claim_evidence', 'entity_kinds', 'name_kinds', 'source_kinds', 'evidence_modalities'] loop
    execute format('drop trigger if exists %I on wine_reference.%I', t || '_log', t);
    execute format('create trigger %I after insert or update or delete on wine_reference.%I for each row execute function wine_reference.log_change()', t || '_log', t);
  end loop;
  foreach t in array array['entities', 'entity_names', 'taxonomy_assignments', 'rights_statements', 'sources', 'source_versions', 'claim_versions'] loop
    execute format('drop trigger if exists %I on wine_reference.%I', t || '_status_guard', t);
    execute format('drop trigger if exists %I on wine_reference.%I', t || '_guard', t);
    execute format('create trigger %I before update or delete on wine_reference.%I for each row execute function wine_reference.guard_row()', t || '_guard', t);
    execute format('drop trigger if exists %I on wine_reference.%I', t || '_start_draft', t);
    execute format('create trigger %I before insert on wine_reference.%I for each row execute function wine_reference.start_as_draft()', t || '_start_draft', t);
  end loop;
  foreach t in array array['review_events', 'change_log'] loop
    execute format('drop trigger if exists %I on wine_reference.%I', t || '_append_only', t);
    execute format('create trigger %I before update or delete on wine_reference.%I for each row execute function wine_reference.refuse_change()', t || '_append_only', t);
  end loop;
end $$;
drop trigger if exists claim_versions_freeze on wine_reference.claim_versions;   -- replaced by claim_versions_guard (guard_row)
drop trigger if exists claims_freeze on wine_reference.claims;
create trigger claims_freeze before update or delete on wine_reference.claims for each row execute function wine_reference.freeze_claim();
drop trigger if exists taxonomy_nodes_freeze on wine_reference.taxonomy_nodes;
create trigger taxonomy_nodes_freeze before update or delete on wine_reference.taxonomy_nodes for each row execute function wine_reference.freeze_taxonomy();
drop trigger if exists taxonomy_domains_freeze on wine_reference.taxonomy_domains;
create trigger taxonomy_domains_freeze before update or delete on wine_reference.taxonomy_domains for each row execute function wine_reference.freeze_taxonomy();
drop trigger if exists relationship_types_freeze on wine_reference.relationship_types;
create trigger relationship_types_freeze before update or delete on wine_reference.relationship_types for each row execute function wine_reference.freeze_claim_type();
drop trigger if exists attribute_types_freeze on wine_reference.attribute_types;
create trigger attribute_types_freeze before update or delete on wine_reference.attribute_types for each row execute function wine_reference.freeze_claim_type();
drop function if exists wine_reference.freeze_claim_version();
drop function if exists wine_reference.guard_status();
drop trigger if exists claim_evidence_draft_only on wine_reference.claim_evidence;
create trigger claim_evidence_draft_only before insert or update or delete on wine_reference.claim_evidence for each row execute function wine_reference.evidence_only_on_draft();
drop trigger if exists claim_version_dependencies_draft_only on wine_reference.claim_version_dependencies;
create trigger claim_version_dependencies_draft_only before insert or update or delete on wine_reference.claim_version_dependencies for each row execute function wine_reference.dependency_only_on_draft();
drop trigger if exists claim_version_dependencies_no_cycle on wine_reference.claim_version_dependencies;
create trigger claim_version_dependencies_no_cycle before insert or update on wine_reference.claim_version_dependencies for each row execute function wine_reference.check_dependency();
drop trigger if exists claims_check on wine_reference.claims;
create trigger claims_check before insert or update on wine_reference.claims for each row execute function wine_reference.check_claim();
drop trigger if exists claim_versions_check on wine_reference.claim_versions;
create trigger claim_versions_check before insert or update on wine_reference.claim_versions for each row execute function wine_reference.check_claim_version();
drop trigger if exists taxonomy_nodes_check on wine_reference.taxonomy_nodes;
create trigger taxonomy_nodes_check before insert or update on wine_reference.taxonomy_nodes for each row execute function wine_reference.check_taxonomy_node();
drop trigger if exists source_versions_copy on wine_reference.source_versions;
create trigger source_versions_copy before insert or update on wine_reference.source_versions for each row execute function wine_reference.check_source_copy();
drop trigger if exists taxonomy_domains_check on wine_reference.taxonomy_domains;
create trigger taxonomy_domains_check before insert or update on wine_reference.taxonomy_domains for each row execute function wine_reference.check_taxonomy_domain();

-- 11j. Is a claim version sound? ONE rule, used to publish, to suspend automatically, and by the verify script (Phase 2.0B.3
--      corrections 1 and 2). It returns the list of problems (empty = sound):
--        the subject and object are published, not retired, not superseded;
--        at least one SUPPORTING piece of evidence comes from a source version that is verified (not retired, not superseded) of a
--        source that is verified; the claim type's required modality is met by such evidence;
--        every quote has a verified rights statement that allows quoting;
--        every version it depends on is published, verified and not suspended.
create or replace function wine_reference.version_problems(p_id uuid) returns text[]
language plpgsql stable set search_path = '' as $$
declare c record; p text[] := '{}';
begin
  select v.id, k.subject_entity_id, k.object_entity_id, k.relationship_type into c
    from wine_reference.claim_versions v join wine_reference.claims k on k.id = v.claim_id where v.id = p_id;
  if c.id is null then return array['no such claim version']; end if;
  if not exists (select 1 from wine_reference.entities e where e.id = c.subject_entity_id and e.status = 'verified'
                   and e.published_at is not null and e.superseded_by is null) then
    p := array_append(p, 'its subject is not a published entity');
  end if;
  if c.object_entity_id is not null and not exists (select 1 from wine_reference.entities e where e.id = c.object_entity_id
                   and e.status = 'verified' and e.published_at is not null and e.superseded_by is null) then
    p := array_append(p, 'its object is not a published entity');
  end if;
  if not exists (select 1 from wine_reference.claim_evidence ev
                   join wine_reference.source_versions sv on sv.id = ev.source_version_id
                   join wine_reference.sources s on s.id = sv.source_id
                  where ev.claim_version_id = p_id and ev.role = 'supports'
                    and sv.status = 'verified' and sv.superseded_by is null and s.status = 'verified') then
    p := array_append(p, 'no supporting evidence from a verified, current source version of a verified source');
  elsif c.relationship_type is not null and exists (select 1 from wine_reference.relationship_types rt where rt.code = c.relationship_type and rt.required_modality is not null)
     and not exists (select 1 from wine_reference.claim_evidence ev
                       join wine_reference.relationship_types rt on rt.code = c.relationship_type
                       join wine_reference.source_versions sv on sv.id = ev.source_version_id
                       join wine_reference.sources s on s.id = sv.source_id
                      where ev.claim_version_id = p_id and ev.role = 'supports' and ev.modality = rt.required_modality
                        and sv.status = 'verified' and sv.superseded_by is null and s.status = 'verified') then
    p := array_append(p, 'no current evidence of the required modality');
  end if;
  if exists (select 1 from wine_reference.claim_evidence ev left join wine_reference.rights_statements rs on rs.id = ev.quote_rights_id
              where ev.claim_version_id = p_id and ev.quote is not null and not (rs.status = 'verified' and rs.allows_quote)) then
    p := array_append(p, 'a quote has no verified rights statement that allows quoting');
  end if;
  if exists (select 1 from wine_reference.claim_version_dependencies d join wine_reference.claim_versions dv on dv.id = d.depends_on_version_id
              where d.dependent_version_id = p_id
                and not (dv.status = 'verified' and dv.published_at is not null and dv.suspended_at is null)) then
    p := array_append(p, 'a version it depends on is not published, or was retired or suspended');
  end if;
  return p;
end $$;

-- Current = published, verified, not suspended, sound, and everything it depends on is current too (followed to any depth; the
-- dependency graph has no cycles, and the depth limit is a second guard). This is what any future read door must use.
create or replace function wine_reference.is_current(p_id uuid, p_depth integer default 0) returns boolean
language plpgsql stable set search_path = '' as $$
declare d uuid;
begin
  if p_depth > 50 then return false; end if;
  if not exists (select 1 from wine_reference.claim_versions v where v.id = p_id and v.status = 'verified'
                   and v.published_at is not null and v.suspended_at is null) then return false; end if;
  if cardinality(wine_reference.version_problems(p_id)) > 0 then return false; end if;
  for d in select depends_on_version_id from wine_reference.claim_version_dependencies where dependent_version_id = p_id loop
    if not wine_reference.is_current(d, p_depth + 1) then return false; end if;
  end loop;
  return true;
end $$;

create or replace view wine_reference.current_claim_versions as
  select v.* from wine_reference.claim_versions v where wine_reference.is_current(v.id);

-- Fail closed: after anything is retired, superseded or published, every published version that is no longer sound is suspended, and
-- the step repeats until nothing changes, so versions that depend on a suspended one are suspended too (transitively). Suspension is
-- final for that version: it is never lifted automatically; a new version is written and reviewed instead.
create or replace function wine_reference.suspend_unsound(p_actor uuid, p_cause text) returns integer
language plpgsql set search_path = '' as $$
declare n integer; total integer := 0;
begin
  perform set_config('wine_reference.in_review', 'on', true);
  loop
    with bad as (
      select v.id, wine_reference.version_problems(v.id) as pr from wine_reference.claim_versions v
       where v.status = 'verified' and v.published_at is not null and v.suspended_at is null
    ), upd as (
      update wine_reference.claim_versions c set suspended_at = now(), suspended_reason = left(array_to_string(b.pr, '; '), 500)
        from bad b where c.id = b.id and cardinality(b.pr) > 0
      returning c.id, c.suspended_reason
    )
    insert into wine_reference.review_events (target_table, target_id, decision, from_status, to_status, actor, note)
    select 'claim_versions', u.id, 'suspend', 'verified', 'verified', p_actor,
           left('Suspended automatically after ' || p_cause || ': ' || u.suspended_reason, 2000) from upd u;
    get diagnostics n = row_count;
    total := total + n;
    exit when n = 0;
  end loop;
  return total;
end $$;

-- A fingerprint of the schema's structure (tables, columns, constraints, indexes, triggers, functions and their bodies, views, grants,
-- row-level security), stored after each run and compared on a replay: a difference means someone changed the schema by hand (drift).
create or replace function wine_reference.structure_fingerprint() returns text
language sql stable set search_path = '' as $$
  select md5(string_agg(line, E'\n' order by line)) from (
    select 'table ' || c.relname || ' ' || c.relkind::text || ' rls=' || c.relrowsecurity::text || ' acl=' || coalesce(c.relacl::text, '') as line
      from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname = 'wine_reference' and c.relkind in ('r', 'v')
    union all
    select 'column ' || c.relname || '.' || a.attname || ' ' || pg_catalog.format_type(a.atttypid, a.atttypmod) || ' ' || a.attnotnull || ' ' ||
           coalesce(pg_catalog.pg_get_expr(d.adbin, d.adrelid), '')
      from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid = a.attrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      left join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
     where n.nspname = 'wine_reference' and c.relkind in ('r', 'v') and a.attnum > 0 and not a.attisdropped
    union all
    select 'constraint ' || c.relname || '.' || con.conname || ' ' || pg_catalog.pg_get_constraintdef(con.oid)
      from pg_catalog.pg_constraint con join pg_catalog.pg_class c on c.oid = con.conrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'wine_reference'
    union all
    select 'index ' || pg_catalog.pg_get_indexdef(i.indexrelid)
      from pg_catalog.pg_index i join pg_catalog.pg_class c on c.oid = i.indrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'wine_reference'
    union all
    select 'trigger ' || pg_catalog.pg_get_triggerdef(t.oid)
      from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid = t.tgrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'wine_reference' and not t.tgisinternal
    union all
    select 'function ' || n.nspname || '.' || p.proname || '(' || pg_catalog.oidvectortypes(p.proargtypes) || ') ' || p.prosecdef || ' ' ||
           coalesce(array_to_string(p.proconfig, ','), '') || ' ' || coalesce(p.proacl::text, '') || ' ' || md5(p.prosrc)
      from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'wine_reference' or (n.nspname = 'public' and p.proname in ('ref_review', 'ref_published_names'))
    union all
    select 'view ' || c.relname || ' ' || pg_catalog.pg_get_viewdef(c.oid)
      from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname = 'wine_reference' and c.relkind = 'v'
    union all
    select 'schema acl ' || coalesce(n.nspacl::text, '') from pg_catalog.pg_namespace n where n.nspname = 'wine_reference'
  ) x
$$;

-- Row-level security on every table, with NO policies: only the owner (and roles that bypass RLS) can touch rows. Defence in depth:
-- the schema is already closed to the browser's roles.
do $$
declare t text;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'wine_reference' and c.relkind = 'r' loop
    execute format('alter table wine_reference.%I enable row level security', t);
  end loop;
end $$;

-- No function in the schema is executable by anyone but its owner.
revoke all on all functions in schema wine_reference from public;
revoke all on all tables in schema wine_reference from public;
revoke all on all sequences in schema wine_reference from public;

-- =====================================================================================================================================
-- 12. The two doors in public. Both SECURITY DEFINER, owned by postgres, with an empty search_path (every name written in full).
-- =====================================================================================================================================

-- A current display name: verified, not a typing shortcut, not ended (valid_to in the future or open). (Phase 2.0B.3 correction 4)
create or replace function wine_reference.has_display_name(p_entity uuid, p_except uuid default null) returns boolean
language sql stable set search_path = '' as $$
  select exists (select 1 from wine_reference.entity_names n
                  where n.entity_id = p_entity and n.status = 'verified' and n.name_kind <> 'shortcut'
                    and (n.valid_to is null or n.valid_to >= current_date) and (p_except is null or n.id <> p_except))
$$;
revoke all on function wine_reference.has_display_name(uuid, uuid) from public;

-- 12a. Read: published entities with their verified names. Returns nothing while app_config 'reference_enabled' is absent or 0.
create or replace function public.ref_published_names(p_query text default null, p_language text default null, p_limit integer default 50)
returns table (entity_id uuid, kind text, name text, language text, name_kind text, is_preferred boolean)
language sql stable security definer set search_path = '' as $$
  select e.id, e.kind, n.name, n.language, n.name_kind, n.is_preferred
    from wine_reference.entities e
    join wine_reference.entity_names n on n.entity_id = e.id
   where public.cfg_number('reference_enabled', 0) >= 1
     and e.status = 'verified' and e.published_at is not null and e.superseded_by is null
     and n.status = 'verified' and n.name_kind <> 'shortcut'
     and wine_reference.has_display_name(e.id)          -- fail closed: an entity with no current display name is not shown
     and (p_language is null or n.language = p_language)
     and (p_query is null or lower(n.name) like '%' || lower(left(p_query, 100)) || '%')
   order by e.id, n.is_preferred desc, n.name
   limit least(greatest(coalesce(p_limit, 50), 1), 200)
$$;
revoke all on function public.ref_published_names(text, text, integer) from public, anon, authenticated, service_role;
grant execute on function public.ref_published_names(text, text, integer) to anon, authenticated;

-- 12b. Review: the only way to change status, publish, retire or supersede. Checks the app's permissions, the two-person rule (with
--      the Owner exemption), the approval, publication and retirement rules, writes a review event (append-only), and then suspends
--      whatever stopped being sound (fail closed). Staff only; nothing here is open to signed-out visitors.
--      p_replacement: only with 'retire' on an entity or a source version: the verified row that replaces it (recorded as superseded_by).
drop function if exists public.ref_review(text, uuid, text, text);
create or replace function public.ref_review(p_table text, p_id uuid, p_decision text, p_note text default '', p_replacement uuid default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_from public.verification_status; v_to public.verification_status; v_creator uuid; v_published timestamptz;
  v_has_published boolean; v_perm text; v_override boolean := false;
  v_problems text[]; r record;
begin
  if v_actor is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if p_table not in ('entities', 'entity_names', 'claim_versions', 'sources', 'source_versions', 'rights_statements', 'taxonomy_assignments') then
    raise exception 'Unknown table %', p_table using errcode = '22023';
  end if;
  if p_decision not in ('submit', 'approve', 'reject', 'publish', 'retire') then
    raise exception 'Unknown decision %', p_decision using errcode = '22023';
  end if;
  v_has_published := p_table in ('entities', 'claim_versions');
  if p_decision = 'publish' and not v_has_published then raise exception 'Only entities and claim versions are published' using errcode = '22023'; end if;
  if p_replacement is not null and not (p_decision = 'retire' and p_table in ('entities', 'source_versions')) then
    raise exception 'A replacement is only given when retiring an entity or a source version' using errcode = '22023';
  end if;

  -- the application permission each decision needs (rights statements need ref_rights to approve)
  v_perm := case p_decision when 'submit' then 'ref_edit' when 'approve' then case when p_table = 'rights_statements' then 'ref_rights' else 'ref_review' end
                            when 'reject' then 'ref_review' else 'ref_publish' end;
  if not public.has_permission(v_perm) then raise exception 'Not allowed: needs %', v_perm using errcode = '42501'; end if;

  execute format('select status, created_by%s from wine_reference.%I where id = $1 for update',
                 case when v_has_published then ', published_at' else ', null::timestamptz' end, p_table)
    into v_from, v_creator, v_published using p_id;
  if v_from is null then raise exception 'No such row' using errcode = 'P0002'; end if;

  v_to := case
    when p_decision = 'submit'  and v_from = 'draft' then 'pending_review'
    when p_decision = 'approve' and v_from = 'pending_review' then 'verified'
    when p_decision = 'reject'  and v_from = 'pending_review' then 'draft'
    when p_decision = 'publish' and v_from = 'verified' and v_published is null then 'verified'
    when p_decision = 'retire'  and v_from in ('verified', 'pending_review', 'draft') then 'retired'
    else null end;
  if v_to is null then raise exception 'Cannot % a row that is %', p_decision, v_from using errcode = '22023'; end if;
  if p_decision = 'publish' and p_table = 'claim_versions'
     and exists (select 1 from wine_reference.claim_versions where id = p_id and suspended_at is not null) then
    raise exception 'A suspended version is never published again; write a new version' using errcode = '22023';
  end if;

  -- two-person rule: nobody approves their own work; an unknown author (a row typed in the SQL editor) cannot be approved here.
  -- Owner exemption (owner policy 2026-10-26): the person whose staff role is Owner may approve anyway. The role is read server-side by
  -- public.my_staff_role_code() (profiles.staff_role, or the older profiles.role 'admin'), which players cannot change; it is asked on
  -- every call, so removing the Owner role ends the exemption at once. Every other rule below still applies to the Owner.
  if p_decision = 'approve' and (v_creator is null or v_creator = v_actor) then
    if coalesce(public.my_staff_role_code(), '') = 'owner' then
      v_override := true;
    else
      raise exception 'The author cannot approve their own row (and a row with no recorded author cannot be approved here)' using errcode = '42501';
    end if;
  end if;

  -- approval rules: a source version is approved only with its source approved and its rights statement (if any) verified; a private
  -- copy only under verified rights that allow copying
  if p_decision = 'approve' and p_table = 'source_versions' then
    select sv.storage_path, sv.rights_id, s.status as source_status, rs.status as rights_status, rs.allows_copy into r
      from wine_reference.source_versions sv join wine_reference.sources s on s.id = sv.source_id
      left join wine_reference.rights_statements rs on rs.id = sv.rights_id where sv.id = p_id;
    if r.source_status <> 'verified' then raise exception 'Approve the source before its versions' using errcode = '23514'; end if;
    if r.rights_id is not null and r.rights_status is distinct from 'verified' then
      raise exception 'The rights statement of this source version is not verified' using errcode = '23514';
    end if;
    if r.storage_path is not null and not (r.rights_status = 'verified' and r.allows_copy) then
      raise exception 'A private copy needs verified rights that allow copying' using errcode = '23514';
    end if;
  end if;

  -- retirement rules: a published entity always keeps a current display name; a replacement must be verified and of the same kind
  if p_decision = 'retire' and p_table = 'entity_names' then
    select n.entity_id, e.status as entity_status, e.published_at into r
      from wine_reference.entity_names n join wine_reference.entities e on e.id = n.entity_id where n.id = p_id;
    if r.entity_status = 'verified' and r.published_at is not null and not wine_reference.has_display_name(r.entity_id, p_id) then
      raise exception 'This is the published entity''s last current display name: approve another name first, or retire the entity' using errcode = '23514';
    end if;
  end if;
  if p_replacement is not null then
    if p_replacement = p_id then raise exception 'A row cannot replace itself' using errcode = '22023'; end if;
    if p_table = 'entities' and not exists (select 1 from wine_reference.entities a join wine_reference.entities b on b.kind = a.kind
                                             where a.id = p_id and b.id = p_replacement and b.status = 'verified' and b.superseded_by is null) then
      raise exception 'The replacement must be a verified entity of the same kind' using errcode = '23514';
    end if;
    if p_table = 'source_versions' and not exists (select 1 from wine_reference.source_versions a join wine_reference.source_versions b on b.source_id = a.source_id
                                                    where a.id = p_id and b.id = p_replacement and b.status = 'verified' and b.superseded_by is null) then
      raise exception 'The replacement must be a verified version of the same source' using errcode = '23514';
    end if;
  end if;

  -- publication rules
  if p_decision = 'publish' and p_table = 'entities' and not wine_reference.has_display_name(p_id) then
    raise exception 'An entity needs a current display name (a verified name that is not a typing shortcut) before it is published' using errcode = '23514';
  end if;
  if p_decision = 'publish' and p_table = 'claim_versions' then
    v_problems := wine_reference.version_problems(p_id);
    if cardinality(v_problems) > 0 then
      raise exception 'Cannot publish this claim version: %', array_to_string(v_problems, '; ') using errcode = '23514';
    end if;
  end if;

  perform set_config('wine_reference.in_review', 'on', true);
  if p_decision = 'publish' and p_table = 'claim_versions' then
    -- the previous live version of the same claim is retired in the same step
    update wine_reference.claim_versions set status = 'retired', retired_at = now()
     where claim_id = (select claim_id from wine_reference.claim_versions where id = p_id)
       and id <> p_id and status = 'verified' and published_at is not null;
  end if;
  if p_decision = 'publish' then
    execute format('update wine_reference.%I set published_at = now(), published_by = $2 where id = $1', p_table) using p_id, v_actor;
  elsif p_decision = 'retire' then
    execute format('update wine_reference.%I set status = ''retired'', retired_at = now() where id = $1', p_table) using p_id;
    if p_replacement is not null then
      execute format('update wine_reference.%I set superseded_by = $2 where id = $1', p_table) using p_id, p_replacement;
    end if;
  elsif p_table = 'rights_statements' and p_decision = 'approve' then
    update wine_reference.rights_statements set status = v_to, checked_by = v_actor, checked_at = now() where id = p_id;
  else
    execute format('update wine_reference.%I set status = $2 where id = $1', p_table) using p_id, v_to;
  end if;

  insert into wine_reference.review_events (target_table, target_id, decision, from_status, to_status, actor, note, owner_override)
  values (p_table, p_id, p_decision, v_from, v_to, v_actor, left(coalesce(p_note, ''), 2000), v_override);

  -- fail closed: whatever this retirement, supersession or publication made unsound is suspended now (transitively)
  if p_decision in ('retire', 'publish') then
    perform wine_reference.suspend_unsound(v_actor, p_decision || ' ' || p_table || ' ' || p_id::text);
  end if;
  perform set_config('wine_reference.in_review', 'off', true);
  return v_to::text;
end $$;
revoke all on function public.ref_review(text, uuid, text, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.ref_review(text, uuid, text, text, uuid) to authenticated;


-- Table descriptions (read by the data dictionary generator).
comment on table wine_reference.schema_migrations is 'Which reference migrations ran, when and by which database user.';
comment on table wine_reference.entity_kinds is 'Controlled list: the kinds of thing the reference holds. Owner decision to change.';
comment on table wine_reference.name_kinds is 'Controlled list: kinds of name (official, label, common, historical, translation ...).';
comment on table wine_reference.source_kinds is 'Controlled list: kinds of source (regulation, register, producer document ...).';
comment on table wine_reference.evidence_modalities is 'Controlled list: how evidence was obtained (Phase 1.9 revision 7: kept apart by modality).';
comment on table wine_reference.rights_statements is 'What a component may be used for: licence, holder, attribution, quote/copy/commercial/derivative (Phase 1.9 revision 8).';
comment on table wine_reference.entities is 'One permanent id per real-world thing. Status and publication are changed only through public.ref_review.';
comment on table wine_reference.entity_names is 'Every name of every entity, per language, kind and period (Phase 1.9 revision 5: unified naming).';
comment on table wine_reference.taxonomy_domains is 'The approved knowledge domains (an entity each). Empty until the owners approved list is imported.';
comment on table wine_reference.taxonomy_nodes is 'The approved taxonomy under each domain (an entity each). Same domain as its parent; no cycles.';
comment on table wine_reference.taxonomy_assignments is 'Which taxonomy nodes an entity belongs to (at most one primary).';
comment on table wine_reference.relationship_types is 'Controlled list of entity-to-entity claim types. Proposed until the owner activates one.';
comment on table wine_reference.attribute_types is 'Controlled list of entity-to-value claim types. None seeded; each is an owner decision.';
comment on table wine_reference.sources is 'A work that can be cited (regulation, book, register, producer document ...).';
comment on table wine_reference.source_versions is 'The exact edition, page state or file of a source that was read, with its retrieval date, fingerprint and rights.';
comment on table wine_reference.claims is 'The stable identity of a statement: subject + relationship type + object, or subject + attribute type.';
comment on table wine_reference.claim_versions is 'What a claim says, when it was true, its risk tier and status. Frozen once it leaves draft; one live published version per claim; suspended automatically when it stops being sound.';
comment on table wine_reference.claim_version_dependencies is 'This claim version holds only if that one holds (Phase 1.9 revision 6). No cycles.';
comment on table wine_reference.claim_evidence is 'Where a claim version is supported or contradicted: source version, locator, modality, optional quote with its rights.';
comment on table wine_reference.review_events is 'Append-only history of every status decision (submit, approve, reject, publish, retire); owner_override marks the Owner approving without a second person.';
comment on table wine_reference.change_log is 'Append-only before/after record of every insert, update and delete in the reference tables.';

-- =====================================================================================================================================
-- 13. Register this migration.
-- =====================================================================================================================================
insert into wine_reference.schema_migrations (version, name, notes, release)
values ('001', 'wine_reference foundation', 'Phase 2.0B.3 draft; schema, entities, names, taxonomy, claim types, sources, rights, claims, evidence, review, change log',
        '001 r3 (2026-10-27)')
on conflict (version) do nothing;
update wine_reference.schema_migrations set structure_md5 = wine_reference.structure_fingerprint() where version = '001';

commit;

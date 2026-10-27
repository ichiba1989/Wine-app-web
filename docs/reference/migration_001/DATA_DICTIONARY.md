# Migration 001: physical schema and data dictionary (DRAFT, 2026-10-26; release "001 r3", 2026-10-27)

The schema `wine_reference` as created by `001_wine_reference_foundation.sql`. **Not on the live database yet.** The column tables below are
**generated from a tested local install** by `tests/dictionary.sql` (`DICT=... bash tests/run_local_tests.sh`), so they match the SQL
exactly; the text above them is written by hand. Design and reasons: `DESIGN.md`.

## How the tables connect

```
entity_kinds ─┐                         name_kinds ─┐
              ▼                                     ▼
          entities ◄────────────────────────── entity_names            (every name, language, period)
           ▲  ▲  ▲  ▲
           │  │  │  └── taxonomy_domains ◄── taxonomy_nodes ◄── taxonomy_assignments ──► entities
           │  │  │        (each domain and node is itself an entity, so its labels are entity_names)
           │  │  └───── claims.subject_entity_id ── claims.object_entity_id ──► entities   (relationship claims)
           │  │              │  relationship_type ──► relationship_types   attribute_type ──► attribute_types
           │  │              ▼
           │  │         claim_versions ◄── claim_version_dependencies ──► claim_versions
           │  │              ▲
           │  │         claim_evidence ──► source_versions ──► sources ──► source_kinds
           │  │              │   modality ──► evidence_modalities
           │  │              └── quote_rights_id ──► rights_statements ◄── source_versions.rights_id
           │  └── superseded_by (merging never deletes)
review_events (append-only, every status decision)      change_log (append-only, every row change)      schema_migrations
```

## Statuses (one vocabulary, reused from the live enum `public.verification_status`)

| Status | Meaning | How a row gets there |
|---|---|---|
| `draft` | being written; content may change | every new row starts here (a row inserted with another status is refused) |
| `pending_review` | submitted; content frozen (claim versions) | `ref_review(..., 'submit')`, needs `ref_edit` |
| `verified` | approved by someone other than the author | `ref_review(..., 'approve')`, needs `ref_review` (`ref_rights` for rights statements) |
| `verified` + `published_at` | shown to players (entities and claim versions only) | `ref_review(..., 'publish')`, needs `ref_publish` and the publication rules |
| `retired` | withdrawn; kept forever | `ref_review(..., 'retire')`, needs `ref_publish`; publishing a newer claim version retires the old one |

`reject` sends a submitted row back to `draft`. A plain `update` of any lifecycle column (`status`, `published_at`, `published_by`,
`retired_at`, `superseded_by`, `checked_by`, `checked_at`, `suspended_at`, `suspended_reason`) is refused, and every other column is
**frozen once the row leaves draft** (`guard_row`): to change approved content, write a new row, have it reviewed and retire the old one.

**Suspended (claim versions only, Phase 2.0B.3).** A published version that stops being sound (its evidence's source version or source
retired or superseded, a quote's rights retired, its subject or object retired, a dependency retired or suspended) is suspended
automatically (`suspended_at`, `suspended_reason`, a `suspend` row in `review_events`, repeated until nothing changes, so it reaches every
dependent). Suspension is final for that version. **Current** = verified, published, not suspended, sound, with every dependency current
(`wine_reference.is_current`, view `wine_reference.current_claim_versions`).

**Functions inside the schema** (owner only): `version_problems(id)` (the soundness rule), `is_current(id)`, `suspend_unsound(actor,
cause)`, `has_display_name(entity)`, `structure_fingerprint()`, and the trigger functions `guard_row`, `start_as_draft`, `freeze_claim`,
`freeze_taxonomy`, `freeze_claim_type`, `check_source_copy`, `check_claim`, `check_claim_version`, `check_taxonomy_node`,
`check_taxonomy_domain`, `check_dependency`, `evidence_only_on_draft`, `dependency_only_on_draft`, `log_change`, `refuse_change`.
**Doors in `public`:** `ref_published_names(query, language, limit)` and `ref_review(table, id, decision, note, replacement)`.

**Owner approval override (owner policy, 2026-10-26).** "Approved by someone other than the author" has one exception: the person whose
staff role is Owner (read server-side by `public.my_staff_role_code()`, checked on every call) may approve their own work. Each such
approval is a `review_events` row with `owner_override = true` (allowed on `approve` decisions only), the actor, the time, the decision and
the optional justification in `note`. Every other rule (evidence, verified sources, quotation rights, required modality, published
subjects and dependencies) still applies to the Owner.

## Columns, keys, rules, indexes and triggers (generated)

## `attribute_types`

Controlled list of entity-to-value claim types. None seeded; each is an owner decision.

| Column | Type | Null | Default |
|---|---|---|---|
| `code` | text | not null |  |
| `label` | text | not null |  |
| `description` | text | not null | `''::text` |
| `subject_kinds` | text[] | not null |  |
| `value_type` | text | not null |  |
| `unit` | text | null |  |
| `default_risk_tier` | smallint | not null | `2` |
| `status` | text | not null | `'proposed'::text` |
| `created_at` | timestamp with time zone | not null | `now()` |

**Keys and rules**

- Check `attribute_types_code_check`: `CHECK (code ~ '^[a-z][a-z_]{1,39}$'::text)`
- Check `attribute_types_default_risk_tier_check`: `CHECK (default_risk_tier >= 1 AND default_risk_tier <= 3)`
- Check `attribute_types_status_check`: `CHECK (status = ANY (ARRAY['proposed'::text, 'active'::text, 'retired'::text]))`
- Check `attribute_types_value_type_check`: `CHECK (value_type = ANY (ARRAY['text'::text, 'number'::text, 'date'::text, 'boolean'::text]))`
- Primary key `attribute_types_pkey`: `PRIMARY KEY (code)`
- Trigger `attribute_types_freeze` runs `wine_reference.freeze_claim_type`
- Trigger `attribute_types_log` runs `wine_reference.log_change`

## `change_log`

Append-only before/after record of every insert, update and delete in the reference tables.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | bigint | not null | identity |
| `table_name` | text | not null |  |
| `row_key` | text | not null |  |
| `operation` | text | not null |  |
| `before` | jsonb | null |  |
| `after` | jsonb | null |  |
| `actor` | uuid | null |  |
| `db_user` | text | not null | `CURRENT_USER` |
| `changed_at` | timestamp with time zone | not null | `now()` |

**Keys and rules**

- Check `change_log_operation_check`: `CHECK (operation = ANY (ARRAY['INSERT'::text, 'UPDATE'::text, 'DELETE'::text]))`
- Primary key `change_log_pkey`: `PRIMARY KEY (id)`
- Index `change_log_row`: `USING btree (table_name, row_key, changed_at)`
- Trigger `change_log_append_only` runs `wine_reference.refuse_change`

## `claim_evidence`

Where a claim version is supported or contradicted: source version, locator, modality, optional quote with its rights.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `claim_version_id` | uuid | not null |  |
| `source_version_id` | uuid | not null |  |
| `modality` | text | not null |  |
| `role` | text | not null | `'supports'::text` |
| `locator` | text | not null |  |
| `quote` | text | null |  |
| `quote_language` | text | null |  |
| `quote_rights_id` | uuid | null |  |
| `created_by` | uuid | null | `auth.uid()` |
| `created_at` | timestamp with time zone | not null | `now()` |

**Keys and rules**

- Check `claim_evidence_locator_check`: `CHECK (length(btrim(locator)) >= 1 AND length(btrim(locator)) <= 300)`
- Check `claim_evidence_quote_check`: `CHECK (quote IS NULL OR length(quote) <= 600)`
- Check `claim_evidence_quote_language_check`: `CHECK (quote_language IS NULL OR quote_language ~ '^([a-z]{2,3}(-[A-Za-z0-9]{2,8})*\|und)$'::text)`
- Check `claim_evidence_quote_needs_rights`: `CHECK (quote IS NULL OR quote_rights_id IS NOT NULL)`
- Check `claim_evidence_role_check`: `CHECK (role = ANY (ARRAY['supports'::text, 'contradicts'::text, 'context'::text]))`
- Foreign key `claim_evidence_claim_version_id_fkey`: `FOREIGN KEY (claim_version_id) REFERENCES wine_reference.claim_versions(id)`
- Foreign key `claim_evidence_modality_fkey`: `FOREIGN KEY (modality) REFERENCES wine_reference.evidence_modalities(code)`
- Foreign key `claim_evidence_quote_rights_id_fkey`: `FOREIGN KEY (quote_rights_id) REFERENCES wine_reference.rights_statements(id)`
- Foreign key `claim_evidence_source_version_id_fkey`: `FOREIGN KEY (source_version_id) REFERENCES wine_reference.source_versions(id)`
- Primary key `claim_evidence_pkey`: `PRIMARY KEY (id)`
- Index `claim_evidence_source`: `USING btree (source_version_id)`
- Index `claim_evidence_version`: `USING btree (claim_version_id)`
- Trigger `claim_evidence_draft_only` runs `wine_reference.evidence_only_on_draft`
- Trigger `claim_evidence_log` runs `wine_reference.log_change`

## `claim_version_dependencies`

This claim version holds only if that one holds (Phase 1.9 revision 6). No cycles.

| Column | Type | Null | Default |
|---|---|---|---|
| `dependent_version_id` | uuid | not null |  |
| `depends_on_version_id` | uuid | not null |  |
| `kind` | text | not null | `'requires'::text` |
| `created_by` | uuid | null | `auth.uid()` |
| `created_at` | timestamp with time zone | not null | `now()` |

**Keys and rules**

- Check `claim_version_dependencies_kind_check`: `CHECK (kind = ANY (ARRAY['requires'::text, 'derived_from'::text]))`
- Check `claim_version_dependencies_not_self`: `CHECK (dependent_version_id <> depends_on_version_id)`
- Foreign key `claim_version_dependencies_dependent_version_id_fkey`: `FOREIGN KEY (dependent_version_id) REFERENCES wine_reference.claim_versions(id)`
- Foreign key `claim_version_dependencies_depends_on_version_id_fkey`: `FOREIGN KEY (depends_on_version_id) REFERENCES wine_reference.claim_versions(id)`
- Primary key `claim_version_dependencies_pkey`: `PRIMARY KEY (dependent_version_id, depends_on_version_id)`
- Index `claim_version_dependencies_on`: `USING btree (depends_on_version_id)`
- Trigger `claim_version_dependencies_draft_only` runs `wine_reference.dependency_only_on_draft`
- Trigger `claim_version_dependencies_log` runs `wine_reference.log_change`
- Trigger `claim_version_dependencies_no_cycle` runs `wine_reference.check_dependency`

## `claim_versions`

What a claim says, when it was true, its risk tier and status. Frozen once it leaves draft; one live published version per claim; suspended automatically when it stops being sound.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `claim_id` | uuid | not null |  |
| `version_no` | integer | not null |  |
| `value_text` | text | null |  |
| `value_number` | numeric | null |  |
| `value_date` | date | null |  |
| `value_boolean` | boolean | null |  |
| `qualifiers` | jsonb | not null | `'{}'::jsonb` |
| `valid_from` | date | null |  |
| `valid_from_precision` | text | not null | `'unknown'::text` |
| `valid_to` | date | null |  |
| `valid_to_precision` | text | not null | `'unknown'::text` |
| `risk_tier` | smallint | not null |  |
| `status` | verification_status | not null | `'draft'::verification_status` |
| `supersedes_version_id` | uuid | null |  |
| `change_note` | text | not null | `''::text` |
| `created_by` | uuid | null | `auth.uid()` |
| `created_at` | timestamp with time zone | not null | `now()` |
| `published_at` | timestamp with time zone | null |  |
| `published_by` | uuid | null |  |
| `retired_at` | timestamp with time zone | null |  |
| `suspended_at` | timestamp with time zone | null |  |
| `suspended_reason` | text | null |  |

**Keys and rules**

- Check `claim_versions_dates`: `CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)`
- Check `claim_versions_not_self`: `CHECK (supersedes_version_id IS NULL OR supersedes_version_id <> id)`
- Check `claim_versions_published_is_verified`: `CHECK (published_at IS NULL OR (status = ANY (ARRAY['verified'::verification_status, 'retired'::verification_status])))`
- Check `claim_versions_qualifiers_check`: `CHECK (jsonb_typeof(qualifiers) = 'object'::text AND octet_length(qualifiers::text) <= 4000)`
- Check `claim_versions_retired_dates`: `CHECK ((status = 'retired'::verification_status) = (retired_at IS NOT NULL))`
- Check `claim_versions_risk_tier_check`: `CHECK (risk_tier >= 1 AND risk_tier <= 3)`
- Check `claim_versions_suspended_is_published`: `CHECK (suspended_at IS NULL OR published_at IS NOT NULL)`
- Check `claim_versions_suspended_reason`: `CHECK ((suspended_at IS NULL) = (suspended_reason IS NULL))`
- Check `claim_versions_valid_from_precision_check`: `CHECK (valid_from_precision = ANY (ARRAY['day'::text, 'month'::text, 'year'::text, 'decade'::text, 'unknown'::text]))`
- Check `claim_versions_valid_to_precision_check`: `CHECK (valid_to_precision = ANY (ARRAY['day'::text, 'month'::text, 'year'::text, 'decade'::text, 'unknown'::text]))`
- Check `claim_versions_value_text_check`: `CHECK (value_text IS NULL OR length(value_text) <= 2000)`
- Check `claim_versions_version_no_check`: `CHECK (version_no >= 1)`
- Foreign key `claim_versions_claim_id_fkey`: `FOREIGN KEY (claim_id) REFERENCES wine_reference.claims(id)`
- Foreign key `claim_versions_supersedes_version_id_fkey`: `FOREIGN KEY (supersedes_version_id) REFERENCES wine_reference.claim_versions(id)`
- Primary key `claim_versions_pkey`: `PRIMARY KEY (id)`
- Unique `claim_versions_claim_id_version_no_key`: `UNIQUE (claim_id, version_no)`
- Index `claim_versions_claim`: `USING btree (claim_id)`
- Index `claim_versions_one_published`: `USING btree (claim_id) WHERE ((status = 'verified'::verification_status) AND (published_at IS NOT NULL))`
- Trigger `claim_versions_check` runs `wine_reference.check_claim_version`
- Trigger `claim_versions_guard` runs `wine_reference.guard_row`
- Trigger `claim_versions_log` runs `wine_reference.log_change`
- Trigger `claim_versions_start_draft` runs `wine_reference.start_as_draft`

## `claims`

The stable identity of a statement: subject + relationship type + object, or subject + attribute type.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `subject_entity_id` | uuid | not null |  |
| `relationship_type` | text | null |  |
| `object_entity_id` | uuid | null |  |
| `attribute_type` | text | null |  |
| `created_by` | uuid | null | `auth.uid()` |
| `created_at` | timestamp with time zone | not null | `now()` |

**Keys and rules**

- Check `claims_not_about_itself`: `CHECK (object_entity_id IS NULL OR object_entity_id <> subject_entity_id)`
- Check `claims_one_shape`: `CHECK (relationship_type IS NOT NULL AND object_entity_id IS NOT NULL AND attribute_type IS NULL OR attribute_type IS NOT NULL AND relationship_type IS NULL AND object_entity_id IS NULL)`
- Foreign key `claims_attribute_type_fkey`: `FOREIGN KEY (attribute_type) REFERENCES wine_reference.attribute_types(code)`
- Foreign key `claims_object_entity_id_fkey`: `FOREIGN KEY (object_entity_id) REFERENCES wine_reference.entities(id)`
- Foreign key `claims_relationship_type_fkey`: `FOREIGN KEY (relationship_type) REFERENCES wine_reference.relationship_types(code)`
- Foreign key `claims_subject_entity_id_fkey`: `FOREIGN KEY (subject_entity_id) REFERENCES wine_reference.entities(id)`
- Primary key `claims_pkey`: `PRIMARY KEY (id)`
- Index `claims_object`: `USING btree (object_entity_id) WHERE (object_entity_id IS NOT NULL)`
- Index `claims_relationship`: `USING btree (relationship_type, subject_entity_id) WHERE (relationship_type IS NOT NULL)`
- Index `claims_subject`: `USING btree (subject_entity_id)`
- Trigger `claims_check` runs `wine_reference.check_claim`
- Trigger `claims_freeze` runs `wine_reference.freeze_claim`
- Trigger `claims_log` runs `wine_reference.log_change`

## `entities`

One permanent id per real-world thing. Status and publication are changed only through public.ref_review.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `kind` | text | not null |  |
| `status` | verification_status | not null | `'draft'::verification_status` |
| `created_by` | uuid | null | `auth.uid()` |
| `created_at` | timestamp with time zone | not null | `now()` |
| `published_at` | timestamp with time zone | null |  |
| `published_by` | uuid | null |  |
| `retired_at` | timestamp with time zone | null |  |
| `superseded_by` | uuid | null |  |
| `note` | text | not null | `''::text` |

**Keys and rules**

- Check `entities_not_self_superseded`: `CHECK (superseded_by IS NULL OR superseded_by <> id)`
- Check `entities_published_is_verified`: `CHECK (published_at IS NULL OR (status = ANY (ARRAY['verified'::verification_status, 'retired'::verification_status])))`
- Check `entities_retired_dates`: `CHECK ((status = 'retired'::verification_status) = (retired_at IS NOT NULL))`
- Foreign key `entities_kind_fkey`: `FOREIGN KEY (kind) REFERENCES wine_reference.entity_kinds(code)`
- Foreign key `entities_superseded_by_fkey`: `FOREIGN KEY (superseded_by) REFERENCES wine_reference.entities(id)`
- Primary key `entities_pkey`: `PRIMARY KEY (id)`
- Index `entities_kind`: `USING btree (kind)`
- Index `entities_published`: `USING btree (kind) WHERE ((status = 'verified'::verification_status) AND (published_at IS NOT NULL))`
- Trigger `entities_guard` runs `wine_reference.guard_row`
- Trigger `entities_log` runs `wine_reference.log_change`
- Trigger `entities_start_draft` runs `wine_reference.start_as_draft`

## `entity_kinds`

Controlled list: the kinds of thing the reference holds. Owner decision to change.

| Column | Type | Null | Default |
|---|---|---|---|
| `code` | text | not null |  |
| `label` | text | not null |  |
| `description` | text | not null | `''::text` |
| `sort_order` | smallint | not null | `100` |

**Keys and rules**

- Check `entity_kinds_code_check`: `CHECK (code ~ '^[a-z][a-z_]{1,39}$'::text)`
- Primary key `entity_kinds_pkey`: `PRIMARY KEY (code)`
- Trigger `entity_kinds_log` runs `wine_reference.log_change`

## `entity_names`

Every name of every entity, per language, kind and period (Phase 1.9 revision 5: unified naming).

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `entity_id` | uuid | not null |  |
| `name` | text | not null |  |
| `language` | text | not null | `'und'::text` |
| `script` | text | null |  |
| `name_kind` | text | not null |  |
| `is_preferred` | boolean | not null | `false` |
| `valid_from` | date | null |  |
| `valid_from_precision` | text | not null | `'unknown'::text` |
| `valid_to` | date | null |  |
| `valid_to_precision` | text | not null | `'unknown'::text` |
| `status` | verification_status | not null | `'draft'::verification_status` |
| `created_by` | uuid | null | `auth.uid()` |
| `created_at` | timestamp with time zone | not null | `now()` |
| `retired_at` | timestamp with time zone | null |  |
| `note` | text | not null | `''::text` |

**Keys and rules**

- Check `entity_names_dates`: `CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)`
- Check `entity_names_language_check`: `CHECK (language ~ '^([a-z]{2,3}(-[A-Za-z0-9]{2,8})*\|und)$'::text)`
- Check `entity_names_name_check`: `CHECK (length(btrim(name)) >= 1 AND length(btrim(name)) <= 300)`
- Check `entity_names_retired_dates`: `CHECK ((status = 'retired'::verification_status) = (retired_at IS NOT NULL))`
- Check `entity_names_script_check`: `CHECK (script IS NULL OR script ~ '^[A-Z][a-z]{3}$'::text)`
- Check `entity_names_valid_from_precision_check`: `CHECK (valid_from_precision = ANY (ARRAY['day'::text, 'month'::text, 'year'::text, 'decade'::text, 'unknown'::text]))`
- Check `entity_names_valid_to_precision_check`: `CHECK (valid_to_precision = ANY (ARRAY['day'::text, 'month'::text, 'year'::text, 'decade'::text, 'unknown'::text]))`
- Foreign key `entity_names_entity_id_fkey`: `FOREIGN KEY (entity_id) REFERENCES wine_reference.entities(id)`
- Foreign key `entity_names_name_kind_fkey`: `FOREIGN KEY (name_kind) REFERENCES wine_reference.name_kinds(code)`
- Primary key `entity_names_pkey`: `PRIMARY KEY (id)`
- Index `entity_names_entity`: `USING btree (entity_id)`
- Index `entity_names_one`: `USING btree (entity_id, lower(name), language, name_kind, COALESCE(valid_from, '-infinity'::date))`
- Index `entity_names_one_preferred`: `USING btree (entity_id, language) WHERE (is_preferred AND (valid_to IS NULL) AND (status <> 'retired'::verification_status))`
- Index `entity_names_search`: `USING gin (lower(name) gin_trgm_ops)`
- Trigger `entity_names_guard` runs `wine_reference.guard_row`
- Trigger `entity_names_log` runs `wine_reference.log_change`
- Trigger `entity_names_start_draft` runs `wine_reference.start_as_draft`

## `evidence_modalities`

Controlled list: how evidence was obtained (Phase 1.9 revision 7: kept apart by modality).

| Column | Type | Null | Default |
|---|---|---|---|
| `code` | text | not null |  |
| `label` | text | not null |  |

**Keys and rules**

- Check `evidence_modalities_code_check`: `CHECK (code ~ '^[a-z][a-z_]{1,39}$'::text)`
- Primary key `evidence_modalities_pkey`: `PRIMARY KEY (code)`
- Trigger `evidence_modalities_log` runs `wine_reference.log_change`

## `name_kinds`

Controlled list: kinds of name (official, label, common, historical, translation ...).

| Column | Type | Null | Default |
|---|---|---|---|
| `code` | text | not null |  |
| `label` | text | not null |  |
| `description` | text | not null | `''::text` |

**Keys and rules**

- Check `name_kinds_code_check`: `CHECK (code ~ '^[a-z][a-z_]{1,39}$'::text)`
- Primary key `name_kinds_pkey`: `PRIMARY KEY (code)`
- Trigger `name_kinds_log` runs `wine_reference.log_change`

## `relationship_types`

Controlled list of entity-to-entity claim types. Proposed until the owner activates one.

| Column | Type | Null | Default |
|---|---|---|---|
| `code` | text | not null |  |
| `label` | text | not null |  |
| `description` | text | not null | `''::text` |
| `subject_kinds` | text[] | not null |  |
| `object_kinds` | text[] | not null |  |
| `allows_cycles` | boolean | not null | `false` |
| `requires_dates` | boolean | not null | `false` |
| `default_risk_tier` | smallint | not null | `2` |
| `required_modality` | text | null |  |
| `status` | text | not null | `'proposed'::text` |
| `created_at` | timestamp with time zone | not null | `now()` |

**Keys and rules**

- Check `relationship_types_code_check`: `CHECK (code ~ '^[a-z][a-z_]{1,39}$'::text)`
- Check `relationship_types_default_risk_tier_check`: `CHECK (default_risk_tier >= 1 AND default_risk_tier <= 3)`
- Check `relationship_types_status_check`: `CHECK (status = ANY (ARRAY['proposed'::text, 'active'::text, 'retired'::text]))`
- Foreign key `relationship_types_required_modality_fkey`: `FOREIGN KEY (required_modality) REFERENCES wine_reference.evidence_modalities(code)`
- Primary key `relationship_types_pkey`: `PRIMARY KEY (code)`
- Trigger `relationship_types_freeze` runs `wine_reference.freeze_claim_type`
- Trigger `relationship_types_log` runs `wine_reference.log_change`

## `review_events`

Append-only history of every status decision (submit, approve, reject, publish, retire); owner_override marks the Owner approving without a second person.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | bigint | not null | identity |
| `target_table` | text | not null |  |
| `target_id` | uuid | not null |  |
| `decision` | text | not null |  |
| `from_status` | verification_status | not null |  |
| `to_status` | verification_status | not null |  |
| `actor` | uuid | not null |  |
| `acted_at` | timestamp with time zone | not null | `now()` |
| `note` | text | not null | `''::text` |
| `owner_override` | boolean | not null | `false` |

**Keys and rules**

- Check `review_events_decision_check`: `CHECK (decision = ANY (ARRAY['submit'::text, 'approve'::text, 'reject'::text, 'publish'::text, 'retire'::text, 'suspend'::text]))`
- Check `review_events_note_check`: `CHECK (length(note) <= 2000)`
- Check `review_events_override_only_on_approve`: `CHECK (NOT owner_override OR decision = 'approve'::text)`
- Check `review_events_target_table_check`: `CHECK (target_table = ANY (ARRAY['entities'::text, 'entity_names'::text, 'claim_versions'::text, 'sources'::text, 'source_versions'::text, 'rights_statements'::text, 'taxonomy_assignments'::text]))`
- Primary key `review_events_pkey`: `PRIMARY KEY (id)`
- Index `review_events_target`: `USING btree (target_table, target_id, acted_at)`
- Trigger `review_events_append_only` runs `wine_reference.refuse_change`

## `rights_statements`

What a component may be used for: licence, holder, attribution, quote/copy/commercial/derivative (Phase 1.9 revision 8).

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `licence_code` | text | not null |  |
| `licence_name` | text | not null | `''::text` |
| `licence_url` | text | null |  |
| `rights_holder` | text | not null | `''::text` |
| `attribution_text` | text | not null | `''::text` |
| `allows_quote` | boolean | not null | `false` |
| `allows_copy` | boolean | not null | `false` |
| `allows_commercial` | boolean | not null | `false` |
| `allows_derivative` | boolean | not null | `false` |
| `status` | verification_status | not null | `'draft'::verification_status` |
| `created_by` | uuid | null | `auth.uid()` |
| `created_at` | timestamp with time zone | not null | `now()` |
| `checked_by` | uuid | null |  |
| `checked_at` | timestamp with time zone | null |  |
| `retired_at` | timestamp with time zone | null |  |
| `note` | text | not null | `''::text` |

**Keys and rules**

- Check `rights_statements_licence_code_check`: `CHECK (length(btrim(licence_code)) >= 1 AND length(btrim(licence_code)) <= 60)`
- Check `rights_statements_licence_url_check`: `CHECK (licence_url IS NULL OR licence_url ~ '^https?://'::text)`
- Check `rights_statements_retired_dates`: `CHECK ((status = 'retired'::verification_status) = (retired_at IS NOT NULL))`
- Primary key `rights_statements_pkey`: `PRIMARY KEY (id)`
- Trigger `rights_statements_guard` runs `wine_reference.guard_row`
- Trigger `rights_statements_log` runs `wine_reference.log_change`
- Trigger `rights_statements_start_draft` runs `wine_reference.start_as_draft`

## `schema_migrations`

Which reference migrations ran, when and by which database user.

| Column | Type | Null | Default |
|---|---|---|---|
| `version` | text | not null |  |
| `name` | text | not null |  |
| `applied_at` | timestamp with time zone | not null | `now()` |
| `applied_by` | text | not null | `CURRENT_USER` |
| `notes` | text | null |  |
| `release` | text | not null | `''::text` |
| `structure_md5` | text | null |  |

**Keys and rules**

- Check `schema_migrations_version_check`: `CHECK (version ~ '^[0-9]{3}[a-z]?$'::text)`
- Primary key `schema_migrations_pkey`: `PRIMARY KEY (version)`

## `source_kinds`

Controlled list: kinds of source (regulation, register, producer document ...).

| Column | Type | Null | Default |
|---|---|---|---|
| `code` | text | not null |  |
| `label` | text | not null |  |

**Keys and rules**

- Check `source_kinds_code_check`: `CHECK (code ~ '^[a-z][a-z_]{1,39}$'::text)`
- Primary key `source_kinds_pkey`: `PRIMARY KEY (code)`
- Trigger `source_kinds_log` runs `wine_reference.log_change`

## `source_versions`

The exact edition, page state or file of a source that was read, with its retrieval date, fingerprint and rights.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `source_id` | uuid | not null |  |
| `version_label` | text | not null |  |
| `published_on` | date | null |  |
| `retrieved_at` | timestamp with time zone | null |  |
| `url` | text | null |  |
| `content_sha256` | text | null |  |
| `storage_path` | text | null |  |
| `rights_id` | uuid | null |  |
| `status` | verification_status | not null | `'draft'::verification_status` |
| `created_by` | uuid | null | `auth.uid()` |
| `created_at` | timestamp with time zone | not null | `now()` |
| `superseded_by` | uuid | null |  |
| `retired_at` | timestamp with time zone | null |  |
| `note` | text | not null | `''::text` |

**Keys and rules**

- Check `source_versions_content_sha256_check`: `CHECK (content_sha256 IS NULL OR content_sha256 ~ '^[0-9a-f]{64}$'::text)`
- Check `source_versions_copy_needs_rights`: `CHECK (storage_path IS NULL OR rights_id IS NOT NULL)`
- Check `source_versions_not_self_superseded`: `CHECK (superseded_by IS NULL OR superseded_by <> id)`
- Check `source_versions_retired_dates`: `CHECK ((status = 'retired'::verification_status) = (retired_at IS NOT NULL))`
- Check `source_versions_url_check`: `CHECK (url IS NULL OR url ~ '^https?://'::text)`
- Check `source_versions_version_label_check`: `CHECK (length(btrim(version_label)) >= 1 AND length(btrim(version_label)) <= 120)`
- Foreign key `source_versions_rights_id_fkey`: `FOREIGN KEY (rights_id) REFERENCES wine_reference.rights_statements(id)`
- Foreign key `source_versions_source_id_fkey`: `FOREIGN KEY (source_id) REFERENCES wine_reference.sources(id)`
- Foreign key `source_versions_superseded_by_fkey`: `FOREIGN KEY (superseded_by) REFERENCES wine_reference.source_versions(id)`
- Primary key `source_versions_pkey`: `PRIMARY KEY (id)`
- Unique `source_versions_source_id_version_label_key`: `UNIQUE (source_id, version_label)`
- Index `source_versions_source`: `USING btree (source_id)`
- Trigger `source_versions_copy` runs `wine_reference.check_source_copy`
- Trigger `source_versions_guard` runs `wine_reference.guard_row`
- Trigger `source_versions_log` runs `wine_reference.log_change`
- Trigger `source_versions_start_draft` runs `wine_reference.start_as_draft`

## `sources`

A work that can be cited (regulation, book, register, producer document ...).

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `kind` | text | not null |  |
| `title` | text | not null |  |
| `publisher` | text | not null | `''::text` |
| `authors` | text | not null | `''::text` |
| `identifier` | text | null |  |
| `url` | text | null |  |
| `language` | text | null |  |
| `status` | verification_status | not null | `'draft'::verification_status` |
| `created_by` | uuid | null | `auth.uid()` |
| `created_at` | timestamp with time zone | not null | `now()` |
| `retired_at` | timestamp with time zone | null |  |
| `note` | text | not null | `''::text` |

**Keys and rules**

- Check `sources_language_check`: `CHECK (language IS NULL OR language ~ '^([a-z]{2,3}(-[A-Za-z0-9]{2,8})*\|und)$'::text)`
- Check `sources_retired_dates`: `CHECK ((status = 'retired'::verification_status) = (retired_at IS NOT NULL))`
- Check `sources_title_check`: `CHECK (length(btrim(title)) >= 1 AND length(btrim(title)) <= 500)`
- Check `sources_url_check`: `CHECK (url IS NULL OR url ~ '^https?://'::text)`
- Foreign key `sources_kind_fkey`: `FOREIGN KEY (kind) REFERENCES wine_reference.source_kinds(code)`
- Primary key `sources_pkey`: `PRIMARY KEY (id)`
- Trigger `sources_guard` runs `wine_reference.guard_row`
- Trigger `sources_log` runs `wine_reference.log_change`
- Trigger `sources_start_draft` runs `wine_reference.start_as_draft`

## `taxonomy_assignments`

Which taxonomy nodes an entity belongs to (at most one primary).

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `entity_id` | uuid | not null |  |
| `node_id` | uuid | not null |  |
| `is_primary` | boolean | not null | `false` |
| `status` | verification_status | not null | `'draft'::verification_status` |
| `created_by` | uuid | null | `auth.uid()` |
| `created_at` | timestamp with time zone | not null | `now()` |
| `retired_at` | timestamp with time zone | null |  |

**Keys and rules**

- Check `taxonomy_assignments_retired_dates`: `CHECK ((status = 'retired'::verification_status) = (retired_at IS NOT NULL))`
- Foreign key `taxonomy_assignments_entity_id_fkey`: `FOREIGN KEY (entity_id) REFERENCES wine_reference.entities(id)`
- Foreign key `taxonomy_assignments_node_id_fkey`: `FOREIGN KEY (node_id) REFERENCES wine_reference.taxonomy_nodes(entity_id)`
- Primary key `taxonomy_assignments_pkey`: `PRIMARY KEY (entity_id, node_id)`
- Unique `taxonomy_assignments_id_key`: `UNIQUE (id)`
- Index `taxonomy_assignments_node`: `USING btree (node_id)`
- Index `taxonomy_assignments_one_primary`: `USING btree (entity_id) WHERE (is_primary AND (status <> 'retired'::verification_status))`
- Trigger `taxonomy_assignments_guard` runs `wine_reference.guard_row`
- Trigger `taxonomy_assignments_log` runs `wine_reference.log_change`
- Trigger `taxonomy_assignments_start_draft` runs `wine_reference.start_as_draft`

## `taxonomy_domains`

The approved knowledge domains (an entity each). Empty until the owners approved list is imported.

| Column | Type | Null | Default |
|---|---|---|---|
| `entity_id` | uuid | not null |  |
| `code` | text | not null |  |
| `sort_order` | smallint | not null |  |
| `source_version_id` | uuid | null |  |
| `created_at` | timestamp with time zone | not null | `now()` |

**Keys and rules**

- Check `taxonomy_domains_code_check`: `CHECK (code ~ '^[A-Z0-9][A-Z0-9_.-]{0,19}$'::text)`
- Foreign key `taxonomy_domains_entity_id_fkey`: `FOREIGN KEY (entity_id) REFERENCES wine_reference.entities(id)`
- Foreign key `taxonomy_domains_source_version_fk`: `FOREIGN KEY (source_version_id) REFERENCES wine_reference.source_versions(id)`
- Primary key `taxonomy_domains_pkey`: `PRIMARY KEY (entity_id)`
- Unique `taxonomy_domains_code_key`: `UNIQUE (code)`
- Trigger `taxonomy_domains_check` runs `wine_reference.check_taxonomy_domain`
- Trigger `taxonomy_domains_freeze` runs `wine_reference.freeze_taxonomy`
- Trigger `taxonomy_domains_log` runs `wine_reference.log_change`

## `taxonomy_nodes`

The approved taxonomy under each domain (an entity each). Same domain as its parent; no cycles.

| Column | Type | Null | Default |
|---|---|---|---|
| `entity_id` | uuid | not null |  |
| `domain_id` | uuid | not null |  |
| `parent_id` | uuid | null |  |
| `code` | text | not null |  |
| `sort_order` | smallint | not null | `0` |
| `source_version_id` | uuid | null |  |
| `created_at` | timestamp with time zone | not null | `now()` |

**Keys and rules**

- Check `taxonomy_nodes_code_check`: `CHECK (code ~ '^[A-Z0-9][A-Z0-9_.-]{0,29}$'::text)`
- Check `taxonomy_nodes_not_own_parent`: `CHECK (parent_id IS NULL OR parent_id <> entity_id)`
- Foreign key `taxonomy_nodes_domain_id_fkey`: `FOREIGN KEY (domain_id) REFERENCES wine_reference.taxonomy_domains(entity_id)`
- Foreign key `taxonomy_nodes_entity_id_fkey`: `FOREIGN KEY (entity_id) REFERENCES wine_reference.entities(id)`
- Foreign key `taxonomy_nodes_parent_id_fkey`: `FOREIGN KEY (parent_id) REFERENCES wine_reference.taxonomy_nodes(entity_id)`
- Foreign key `taxonomy_nodes_source_version_fk`: `FOREIGN KEY (source_version_id) REFERENCES wine_reference.source_versions(id)`
- Primary key `taxonomy_nodes_pkey`: `PRIMARY KEY (entity_id)`
- Unique `taxonomy_nodes_code_key`: `UNIQUE (code)`
- Index `taxonomy_nodes_domain`: `USING btree (domain_id)`
- Index `taxonomy_nodes_parent`: `USING btree (parent_id)`
- Trigger `taxonomy_nodes_check` runs `wine_reference.check_taxonomy_node`
- Trigger `taxonomy_nodes_freeze` runs `wine_reference.freeze_taxonomy`
- Trigger `taxonomy_nodes_log` runs `wine_reference.log_change`


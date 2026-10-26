# Migration 001: design (DRAFT, Phase 2.0B.2, 2026-10-26)

**Status: a tested draft for the owner's approval. Nothing has been run on the live database.** Migration 001 creates the canonical
foundation of the Wine Education Master Reference in a new private schema, `wine_reference`, and two functions in `public`. It changes no
existing table, row, view, function, setting or permission, and adds no wine content.

| Deliverable | File |
|---|---|
| 1. Design document (this file) | `docs/reference/migration_001/DESIGN.md` |
| 2. Physical schema and data dictionary | `DATA_DICTIONARY.md` (column tables generated from a tested install) |
| 3. SQL migration draft | `001_wine_reference_foundation.sql`; the permissions step `001a_reference_permissions.sql` (approved separately) |
| 4. Verification and negative tests | `001_verify.sql` (read-only, also for the live database after migration); `tests/001_behaviour_tests.sql` (local only); `tests/run_local_tests.sh` |
| 5. Security and permissions review | section 4 below |
| 6. Compatibility assessment | section 5 below |
| 7. Local test results | `TEST_REPORT.md`: 127 passed, 0 failed, on a throwaway local PostgreSQL 16 |
| 8. Rollback and forward recovery | section 6 below; `001_rollback.sql` |
| 9. Remaining owner decisions | section 7 below |
| 10. Approval checklist for live execution | section 8 below |

Read with: `docs/REFERENCE_MODEL.md` (the model), `docs/reference/results/FINDINGS.md` (the live database as inspected on 2026-10-26).

---

## 1. Reconciliation with Phase 1.9 and the reference model

**What was available.** The Phase 2.0B.2 brief lists eight requirements to incorporate. They are treated here as **the eight Phase 1.9
architectural revisions** (the brief names "Phase 1.9's eight architectural revisions" and then lists eight items). **The Phase 1.9
document itself, the fourteen approved knowledge domains and the ~140-subdomain taxonomy are still not available** in the repository or
this session. So: the taxonomy tables are built and tested but **created empty**; no domain or subdomain code, name or count is invented;
and a full line-by-line comparison with Phase 1.9 is not possible. **This is a dependency** (owner decision 2).

### The eight revisions: where each lives

| # | Revision | In migration 001 | Deferred (and to where) |
|---|---|---|---|
| 1 | Evidence-backed grape genetic relationships | Kind `grape_variety` (an identity, separate from its names). Relationship types `genetic_parent_of` and `mutation_of` (proposed until the owner activates them), risk tier 1, **publication refused without evidence of modality `genetic`** (tested) | Clones, crossings vs. natural parentage detail, and the link to today's `grapes` rows (002, with the legacy mapping) |
| 2 | Historical ownership and asset interests | Relationship type `holds_interest_in` (legal entity or person → producer, brand, legal entity or place), with valid-from / valid-to and their precision; **a start date is required unless "dates unknown" is stated**; `share_percent` 0 to 100 in qualifiers (tested); cross-holdings allowed (no cycle rule) | The kinds of interest (owner, lessee, operator ...) as a controlled list; vineyard parcels as their own entities (later migration) |
| 3 | Producers, brands and legal entities kept apart | Three separate entity kinds; relationship types `brand_of` and `operated_by` (proposed) | Linking today's `producers` rows (002) |
| 4 | Product, edition, release and release-event identities | **Not in 001** (see "Why the wine identity model waits") | 002: tables for product, edition, release and release event, plus the legacy mapping to `wines` / `wine_vintages` |
| 5 | Unified multilingual naming | One `entity_names` table for every kind (taxonomy labels included): language (BCP 47), script, name kind, preferred per language, valid dates, status (tested) | Translations of encyclopedia text (with the entries, later) |
| 6 | Claim-version dependencies | `claim_version_dependencies` (requires / derived from); **no cycles**; publication refused while a dependency is not the live published version (tested) | Flagging dependent versions automatically when a dependency is retired (a report or check in 002) |
| 7 | Assessment evidence separated by modality | Every piece of claim evidence carries a **modality** (documentary, label, analytical, genetic, cartographic, sensory, expert attestation); a claim type can require one (tested for genetic) | **Learner assessment evidence** (theory, tasting, practical ...) belongs to education and is deferred. **The meaning needs the owner** (decision 4): this draft covers the claim-evidence reading and keeps the learner reading for later |
| 8 | Component-level licensing and rights | `rights_statements`, attached to each **source version** (whether a copy may be kept: a stored copy without one is refused) and to each **quote** (a quote without one is refused; a claim is not published while a quote's rights are unverified or forbid quoting); approving a rights statement needs its own permission, `ref_rights` (tested) | Rights for images, entry text, translations and datasets: the same table, linked from those components when they are built |

### Changes to the reference model (`docs/REFERENCE_MODEL.md`)

| Topic | Model said | Migration 001 does | Why |
|---|---|---|---|
| Statuses | draft → in review → verified → published → retired | Reuses the live list `draft → pending_review → verified → retired`; **publication is a separate step** (`published_at`) for entities and claim versions only | The live enum already exists (FINDINGS); approving and publishing need different people's permissions |
| Change log | FINDINGS suggested reusing `public.revisions` and `log_revision()` | Its own append-only `wine_reference.change_log` | `log_revision()`'s body is not in the repository; `revisions.table_name` holds no schema, so `sources` or `claims` would clash with names in `public`; `revisions` is readable by every editor. Can be unified later (decision 10) |
| `field_provenance`, `appellation_grape_rules` | Reconcile with the claims model | Untouched | Reconciling them is a mapping task with the legacy catalog (002) |
| "Event" | Events attached to any level | Release events become identities in 002 | Revision 4 |
| Risk tiers | Tier 1 needs two people | Every tier: the author never approves their own row. Tier-specific extra rules are not enforced yet | Owner decision 6 |
| `ref_translate` | Proposed permission | Not created | No translated entry text exists yet |

### Assumptions this design makes (to confirm)
- The live `has_permission(text)` returns true when the signed-in person's staff role lists the permission (`docs/ROLES_AND_ACCESS.md`); its body is not in the repository.
- `auth.uid()` is the signed-in user, as everywhere in the app; it is null in the SQL Editor.
- The dashboard's **Exposed schemas** does not include `wine_reference` and will not be changed (section 14 of the inspection came back empty because the list is kept in the dashboard).
- PostgreSQL 15 or later (the inspection's catalogs match it); `gen_random_uuid()` and `pg_trgm` in `public` exist (FINDINGS).

### Why the wine identity model (product, edition, release, release event) waits for 002
There is **no technical dependency** that needs it in 001: an entity kind is one row in `entity_kinds`, and claims, names, evidence and
review all work for any kind. Putting it in 001 would also force the legacy-mapping decisions (how each `wines` and `wine_vintages` row
becomes a product, edition or "unidentified non-vintage" edition), which need their own design and the owner's review. Keeping 001 to
the foundation lets that design be tested on its own.

---

## 2. Namespace: final recommendation

| Point | Dedicated private schema `wine_reference` | `ref_`-prefixed tables in `public` | Evidence |
|---|---|---|---|
| Schema privileges | Starts with no grants; this draft also revokes from PUBLIC and the three browser roles explicitly | Browser roles already hold USAGE on `public` | FINDINGS part 1, section 16 |
| Default privileges | None for a new schema; the draft also turns off PostgreSQL's own "functions executable by PUBLIC" inside it | Every new table and function is granted to `anon`, `authenticated`, `service_role` automatically | FINDINGS part 1, section 15 |
| Row-level security | On for every table, with **no policies** (only the owner reaches rows) | Must be on from the first moment; `rls_auto_enable()` exists but its activity was not confirmed | FINDINGS; verify check |
| Data API exposure | Not served unless added to Exposed schemas (not to be done); GraphQL also sees only schemas a role may use | Served at once | Supabase setting; inspection section 14 |
| Function security | Internal functions not executable by anyone but the owner; two curated doors in `public`, granted explicitly | Every function auto-granted; each would need revoking | Tested |
| Migration complexity | One schema to create, list, verify and (while empty) remove; no name clashes with ~65 tables in `public` | Prefix discipline; removal table by table | Tested (rollback) |
| Compatibility with the app | No effect: the app never calls `sb.schema(...)`; the offline wrapper only catches `from`/`rpc` (`offline.js` 142-144); the two `ref_*` functions are new names | Every new table appears in the API the app's key can reach | Tested (public unchanged except two functions) |

**Recommendation: the dedicated private schema `wine_reference`, not exposed through the Data API.** The inspection supports it on every
point. No database or dashboard setting was changed; the owner keeps Exposed schemas as it is.

---

## 3. Scope of migration 001

**Included** (all in `001_wine_reference_foundation.sql`; column detail in `DATA_DICTIONARY.md`):

| Area | Tables / functions |
|---|---|
| Schema and namespace | `wine_reference`, closed; migration register `schema_migrations` |
| Controlled vocabularies | `entity_kinds` (9 structural kinds), `name_kinds` (8), `source_kinds` (9), `evidence_modalities` (7), `relationship_types` (6, all **proposed**), `attribute_types` (none seeded) |
| Canonical entities | `entities` (permanent uuid, kind, status, publication, retirement, `superseded_by` so merging never deletes) |
| Names and aliases | `entity_names` (language, script, kind, preferred, dates, status; one preferred name per language; trigram index for search) |
| Taxonomy | `taxonomy_domains`, `taxonomy_nodes` (same-domain parents, no cycles), `taxonomy_assignments` (one primary per entity); **empty** |
| Sources | `sources`, `source_versions` (edition or retrieval, date, SHA-256 fingerprint, private copy only with rights), `rights_statements` |
| Claims | `claims` (relationship or attribute, kinds checked, cycles refused where the type forbids them), `claim_versions` (values, qualifiers, valid dates with precision, risk tier, status, one live published version), `claim_version_dependencies`, `claim_evidence` |
| Editorial | `public.ref_review(table, id, decision, note)`: submit, approve, reject, publish, retire; `review_events` (append-only) |
| Auditing | `change_log` (append-only, every insert, update and delete, with the signed-in user and the database user) |
| Reading | `public.ref_published_names(query, language, limit)`: published entities' verified names; nothing while the switch is off |

**Deferred** (later migrations, each with its own design and approval):

| Item | Planned |
|---|---|
| Wine product, edition, release and release-event tables (revision 4) | 002 |
| Mapping to the legacy catalog (`producers`, `wines`, `wine_vintages`, `grapes`, `geo_areas`), read-only suggestion reports first, all marked "old catalog, not verified" | 002 |
| Staff functions to create and edit drafts (entities, names, sources, claims, evidence) and the Owner page "Reference" tab | 002 / 003 (until then, rows typed in the SQL Editor have no author and **cannot be approved through `ref_review`**, by design) |
| Reconciling `field_provenance`, `appellation_grape_rules`, the code lists (`aocgrapes.js`, `geo.js` ...) | after 002 |
| The taxonomy import (once the approved list is supplied) | its own script |
| Attribute types (ABV, founding year ...) | owner decision, then a small script |
| Encyclopedia entries, layered templates, translations of text | later |
| Education: learning paths, assessments (with their modality), CMS/WSET mapping (only with permission) | later |
| Full-text search per language, staff read functions for drafts | with the Owner tab |

---

## 4. Security and permissions review

**Two separate layers.**

| Layer | What decides | In migration 001 |
|---|---|---|
| **Database privileges** (PostgreSQL) | Which database role may touch a schema, table or function at all | `wine_reference` is closed to `anon`, `authenticated`, `service_role` and PUBLIC; row-level security on, no policies; only `postgres` (the owner) reaches rows. Two functions in `public` are the only doors |
| **Application permissions** (the app's staff roles) | Which signed-in person may do which editorial step | Checked **inside** `ref_review` with `public.has_permission()`: `ref_edit` (submit), `ref_review` (approve, reject), `ref_publish` (publish, retire), `ref_rights` (approve a rights statement). Given to roles only by `001a` (owner decides who) |

**Who can do what after migration 001** (database roles from the inspection):

| Database role | Read reference tables | Call `ref_published_names` | Call `ref_review` |
|---|---|---|---|
| `anon` (signed out) | no | yes (published names only; nothing while the switch is off) | no |
| `authenticated` (every signed-in player, guests included) | no | yes | yes, but each decision needs the person's app permission; nobody holds one before `001a` |
| `service_role` (server key; not used by the app) | no | no | no |
| `postgres` (owner, SQL Editor) | yes (owner of everything) | yes | yes as a call, but `auth.uid()` is empty there, so it is refused ("Sign in first") |
| `claude_readonly` | no (usage on `public` only; not changed) | no | no |
| Supabase platform roles with `pg_read_all_data` (`supabase_read_only_user`, `supabase_etl_admin`) | yes, as for every table in the database | — | — |

**Function safety.**
- `ref_published_names` and `ref_review` are `SECURITY DEFINER`, owned by `postgres`, with **`search_path` set to empty**, so every
  name is written in full and a caller cannot slip in a look-alike object. Both are `revoke`d from PUBLIC and the browser roles first,
  then granted explicitly (Supabase would otherwise grant every new `public` function to everyone; FINDINGS section 15).
- `ref_review` accepts only a fixed list of table names and decisions, builds its few dynamic statements with `format('%I')` and passes
  values as parameters (no text pasted into SQL).
- Internal functions (triggers and helpers in `wine_reference`) cannot be executed by anyone but the owner (tested).
- `ref_published_names` caps the result at 200 rows and the search text at 100 characters.

**Editorial rules enforced in the database (not only on screens).** New rows start as `draft`; status and publication change only
through `ref_review` (a plain update is refused); the author never approves their own row; a claim version is frozen once submitted
(evidence and dependencies too); publication needs supporting evidence from a verified source version, the type's required modality,
quotes with verified rights that allow quoting, published subject and object entities and published dependencies; publishing a newer
claim version retires the old one; every decision is a `review_events` row and every row change a `change_log` row, both append-only.

**Known limits (stated, not hidden).**
- The database owner (`postgres`, the SQL Editor) can do anything, including setting the flag `ref_review` uses. That is the platform's
  trust model for every table; owner-typed rows carry no author and cannot be approved through `ref_review`.
- Staff user ids are stored in the review history and change log. `privacy.html` may need a line about staff records (owner and
  lawyers; not edited).
- The live `has_permission()` body was not read; its documented behaviour is relied on.

---

## 5. Compatibility assessment

- **Existing database objects:** none changed. Tested by comparing the entire `public` schema before and after (tables, columns,
  constraints, indexes, functions and their grants, triggers, policies, table grants): the only difference is the two new `ref_*`
  functions. The inspection found no schema named `wine_reference` and no function named `ref_*`.
- **Existing data:** no row read for writing, none changed; no catalog row is imported (nothing is marked verified).
- **The app (`main` and `vwm`):** no file changes, no new calls; `?v=` numbers untouched. Both versions share the database, so both
  "have" the schema, and neither uses it.
- **Live objects the migration depends on:** the enum `public.verification_status`, `public.has_permission(text)`,
  `public.cfg_number(text, numeric)`, `auth.uid()`, `pg_trgm` in `public`, the roles `anon`, `authenticated`, `service_role`. If any of
  them is changed later, re-run `001_verify.sql` and the local tests.
- **Speed:** empty tables; nothing on the app's start-up path.

---

## 6. Rollback and forward recovery

- **The migration is one transaction.** If any statement fails, nothing is applied (begin ... commit).
- **While the reference is empty:** `001_rollback.sql` drops the schema and the two `ref_*` functions and nothing else; it **refuses**
  when any entity, source, rights statement or claim exists (tested both ways). It leaves `app_config` alone.
- **After content exists: forward recovery only.** Never drop. Fix with a new numbered migration (002 ...), retire rows instead of
  deleting them, and keep the review history. Before any later migration, export the reference's tables (SQL Editor, or the dashboard's
  backups: check what the project's plan includes).
- **Undo `001a`** (permissions) if needed:
  `update public.staff_roles set permissions = array(select p from unnest(permissions) p where p not in ('ref_edit','ref_review','ref_publish','ref_rights'));`

---

## 7. Remaining owner decisions

1. **Approve the namespace:** the dedicated private schema `wine_reference`, never added to Exposed schemas.
2. **Supply the fourteen approved knowledge domains and the ~140-subdomain taxonomy** (and the Phase 1.9 document). Until then the taxonomy stays empty.
3. **Approve the structural lists** seeded by 001: the 9 entity kinds, 8 name kinds, 9 source kinds, 7 evidence modalities, and the 6 relationship types (seeded as *proposed*; which to activate, and when).
4. **Revision 7, "assessment evidence separated by modality":** confirm whether it means claim evidence (built), learner assessments (deferred), or both.
5. **Who holds `ref_edit`, `ref_review`, `ref_publish`, `ref_rights`** (`001a` gives all four to the Owner role only; Editors are commented out). With one person holding all four, the two-person rule means nothing can be approved: a second reviewer is needed.
6. **Risk tiers:** whether tier 1 (legal, genetic, health) needs more than "author ≠ approver" (for example an official primary source, or two approvers).
7. **The first attribute types** (none are seeded).
8. **Languages** to start with (the tables accept any).
9. **`privacy.html`:** whether staff records in the review history need a line (owner and lawyers).
10. **Change log:** keep the reference's own, or later unify with `public.revisions`.
11. **When to switch the reference on** (`app_config` `reference_enabled` = 1): not before there is published content and the owner says so.

---

## 8. Approval checklist for live execution

Nothing below is done until the owner approves this design in writing in the chat. Each script runs in the Supabase **SQL Editor** as
the owner, one at a time.

**Before**
- [ ] Owner approves this design, including decisions 1, 3 and 5 above.
- [ ] Confirm a recent backup exists (dashboard: Database, Backups), or note that the plan has none.
- [ ] Confirm **Settings, API, Exposed schemas** does not list `wine_reference`; leave it unchanged.
- [ ] Use the files from the repository's `main` branch at the approved commit. Fingerprints (first 16 hex of SHA-256) as committed:
      `001_wine_reference_foundation.sql` `04aafc32e0abbe43`, `001a_reference_permissions.sql` `8cf791d1e3d0256a`,
      `001_verify.sql` `c86dc824897f1c9f`, `001_rollback.sql` `210b650d5b103a2f`.
- [ ] Re-run the local tests on that commit: `bash docs/reference/migration_001/tests/run_local_tests.sh` → 127 passed, 0 failed.

**Run**
- [ ] New query → paste the whole `001_wine_reference_foundation.sql` → Run. Expected: "Success. No rows returned". Any error: stop and
      send it; nothing was applied.
- [ ] New query → paste `001_verify.sql` → Run. Expected: every row PASS.
- [ ] Open the app (main and `/vwm/`): Discover, Journal and Learn behave as before.

**Then, separately**
- [ ] Only after decision 5: run `001a_reference_permissions.sql`, then `001_verify.sql` again.
- [ ] Keep `reference_enabled` absent or 0.
- [ ] Tell the session; it records the date and result in `docs/HANDOFF.md` and `docs/reference/results/`.

**Never:** run `tests/001_behaviour_tests.sql` or `tests/stub_supabase.sql` on Supabase (they write test rows and create stub objects).

# Migration 001: design (DRAFT, Phase 2.0B.2, 2026-10-26; Owner approval override 2026-10-26; Phase 2.0B.3 corrections 2026-10-27; final review follow-up 2026-11-01, release "001 r4"; staging corrections 2026-11-01, release candidate "001 r5")

**Status: a tested draft for the owner's approval. Nothing has been run on the live database.** Migration 001 creates the canonical
foundation of the Wine Education Master Reference in a new private schema, `wine_reference`, and two functions in `public`. It changes no
existing table, row, view, function, setting or permission, and adds no wine content.

| Deliverable | File |
|---|---|
| 1. Design document (this file) | `docs/reference/migration_001/DESIGN.md` |
| 2. Physical schema and data dictionary | `DATA_DICTIONARY.md` (column tables generated from a tested install) |
| 3. SQL migration draft | `001_wine_reference_foundation.sql` (release candidate "001 r5 (2026-11-01)"; not approved yet); the permissions step `001a_reference_permissions.sql` (approved separately) |
| 4. Verification and negative tests | `001_verify.sql` (read-only, also for the live database after migration); `tests/001_behaviour_tests.sql` (local only); `tests/run_local_tests.sh` |
| 5. Security and permissions review | section 4 below |
| 6. Compatibility assessment | section 5 below |
| 7. Local test results | `TEST_REPORT.md`: **294 passed, 0 failed** (including 13 concurrent-transaction checks), on a throwaway local PostgreSQL 16, re-run in full after the final review follow-up |
| 8. Rollback and forward recovery | section 6 below; `001a_rollback.sql`, then `001_rollback.sql` |
| 11. Phase 2.0B.3 corrections and change report | section 4b below; `CHANGE_REPORT_2_0B_3.md` |
| 13. Locking strategy and concurrency | section 4c below; `tests/concurrency_tests.sh` |
| 14. Supabase staging assessment | `STAGING_ASSESSMENT.md` |
| 12. Owner role verification | `OWNER_ROLE_VERIFICATION.md`; read-only `owner_role_check.sql` (for the owner to run) |
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
| Risk tiers | Tier 1 needs two people | Every tier: the author never approves their own row, **except the Owner** (Owner approval override, below). Tier-specific extra rules are not enforced yet | Owner decision 6; owner policy 2026-10-26 |
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
through `ref_review` (a plain update is refused); the author never approves their own row (except the Owner, below); a claim version is frozen once submitted
(evidence and dependencies too); publication needs supporting evidence from a verified source version, the type's required modality,
quotes with verified rights that allow quoting, published subject and object entities and published dependencies; publishing a newer
claim version retires the old one; every decision is a `review_events` row and every row change a `change_log` row, both append-only.

**Owner approval override (owner policy, 2026-10-26, Phase 2.0B.2 amendment).**
- **The rule:** the person whose staff role is **Owner** may approve their own contributions (any risk tier, rights statements included)
  and publish them without a second person. Everyone else, including Editors who hold `ref_review` and `ref_publish`, keeps the
  author-versus-approver separation.
- **How the Owner is identified:** inside `ref_review`, by `public.my_staff_role_code() = 'owner'`. That is the app's existing,
  authoritative, server-side lookup (inspected: present on the live database, `SECURITY DEFINER`): it reads `profiles.staff_role`, or for
  older accounts `profiles.role = 'admin'`, for the signed-in user. Players cannot change those columns (their update grant covers only
  name and consent columns), the app's staff functions refuse to grant or change the Owner role, and the Owner is only ever set by hand in
  SQL (`docs/ROLES_AND_ACCESS.md`). No frontend flag, no role passed in by the caller, no user id written in the code.
- **Revocation is immediate:** the lookup is asked on every call; removing the Owner role ends the override for the next call, even if
  the person still holds every `ref_*` permission (tested).
- **Nothing else is waived:** the Owner still needs the decision's permission (`ref_review`, `ref_publish`, `ref_rights`, given by `001a`),
  and every publication rule still applies: supporting evidence from a verified source version, the type's required evidence modality,
  quotes with verified rights that allow quoting, published subject, object and dependencies (all tested with the Owner).
- **Audit:** each use writes a `review_events` row with `owner_override = true`, the actor, the time, the decision and the optional
  justification (`note`). `owner_override` is allowed only on `approve` (a check constraint) and the table is append-only (tested).
  Publishing is not an override (publication never required a second person; it requires an approved row).
- **Rows with no recorded author** (typed in the SQL Editor) can now be approved by the Owner through the same override; they are marked
  as overrides too. Non-Owners still cannot approve them.
- **Dependency:** the migration now also needs `public.my_staff_role_code()`; its first step checks every required live object and stops,
  changing nothing, if one is missing (tested).

**Known limits (stated, not hidden).**
- The database owner (`postgres`, the SQL Editor) can do anything, including setting the flag `ref_review` uses. That is the platform's
  trust model for every table; owner-typed rows carry no author and cannot be approved through `ref_review`.
- Staff user ids are stored in the review history and change log. `privacy.html` may need a line about staff records (owner and
  lawyers; not edited).
- The live `has_permission()` and `my_staff_role_code()` bodies were not read; their documented behaviour is relied on (read the
  latter once before the live run: checklist, section 8).
- The Owner override means content can be published with only one person's judgement; the `owner_override` mark makes every such
  approval visible for later review.

---

## 4b. Phase 2.0B.3 corrections (2026-10-27, after the independent review)

| # | Finding | Correction in the SQL | Tested |
|---|---|---|---|
| 1 | A published claim stayed "verified" after its source version was retired, superseded or invalidated | **One soundness rule** (`wine_reference.version_problems`) is used to publish, to suspend and to verify: subject and object published; supporting evidence from a verified, not superseded source version of a verified source; the required modality met by such evidence; every quote under verified rights that allow quoting; every dependency published and not suspended. After every retire, supersede (retire with a replacement) and publish, `ref_review` calls `suspend_unsound`: each published version that is no longer sound gets `suspended_at` and `suspended_reason` and a `suspend` row in `review_events`. `wine_reference.is_current` / the view `current_claim_versions` is what any future read must use | Retiring a source version, a whole source, a rights statement or an entity; superseding a source version; redundant evidence keeps a claim current; suspension recorded; a suspended version cannot be published again or un-suspended by hand |
| 2 | No defined behaviour when a dependency is retired or invalid | **Fail closed, transitively.** `suspend_unsound` repeats until nothing changes, so every version that depends (at any depth) on a retired or suspended version is suspended; publishing a newer version of a dependency retires the old one and suspends its dependents (they are re-reviewed against the new version); publication refuses a dependency that is not current; `is_current` follows dependencies to any depth. **Suspension is final for that version**: a new version is written and reviewed | Chain X4 → X3 → X2: X2 loses its evidence, X3 and X4 are suspended; a newer dependency version suspends its dependent; publishing on a suspended dependency is refused |
| 3 | Approved records could be edited without review | **One guard** (`guard_row`) on entities, names, sources, source versions, rights statements, taxonomy assignments and claim versions: lifecycle columns (status, publication, retirement, `superseded_by`, rights check, suspension) change only inside `ref_review`; every other column is frozen once the row leaves draft (submitted rows too); such rows are never deleted. Claim identities, taxonomy codes and parents, and claim types in use are frozen too (`freeze_claim`, `freeze_taxonomy`, `freeze_claim_type`). **Revision process:** write a new row, have it reviewed, retire the old one (with a replacement where it applies). Also: approving a source version needs its source approved and its rights verified; a private copy is refused when written unless under verified rights that allow copying | Edits and deletes of approved names, sources, source versions, rights; `superseded_by` and suspension by hand; claim identity; taxonomy code (order may change); claim type meaning and status; drafts and rejected rows stay editable |
| 4 | Retiring names could leave a published entity with no display name | `has_display_name`: a verified name that is not a typing shortcut and has not ended. Publishing an entity needs one; retiring the **last** one of a published entity is refused (retire the entity, or approve another name first); the read door shows only entities that have one; the verify script lists any published entity without one (a name can still end by its own `valid_to` date: the read door then hides the entity rather than show it nameless) | Last name refused; second name allows it; shortcut-only entity cannot be published; read door shows the remaining name only |
| 5 | The Owner lookup is unverified | `owner_role_check.sql` (read-only, for the owner) and `OWNER_ROLE_VERIFICATION.md` | Runs in a read-only transaction on the local stand-in |
| 6 | Migration safety | Preflight in 001: stops, changing nothing, on an unexpected `ref_*` function in `public`; on `ref_*` without the schema, or the schema without its 001 registration; on a different **release** (`001 r3 (2026-10-27)`, stored in `schema_migrations.release`); on **structure drift** (`structure_fingerprint()` stored after each run and compared on replay). 001a: needs 001 at this release and the owner role row; stops if registered but partly undone; checks its own result. The verify script checks release, drift, health and 001a consistency. File SHA-256s are checked by the owner before running (section 8) | Each preflight case on its own database (nothing changed); 001a before 001; partial 001a caught by preflight and by verify |
| 7 | Recovery of 001a | `001a_rollback.sql`: removes the four `ref_*` words from every role (other permissions kept, in order), unregisters 001a, checks its result; safe any time (removing permissions only takes abilities away). `001_rollback.sql` now refuses while any role holds a `ref_*` permission or 001a is registered | Rollback twice; 001 rollback refused first; full order 001a_rollback → 001_rollback; 001a re-run after rollback |

**Unchanged:** the Owner approval override (still recorded as `owner_override`; the Owner is still refused publication on retired or superseded evidence or forbidden quotes: tested), every evidence and rights requirement, the two read and review doors, and the closed schema. `ref_review` gained an optional fifth argument, `p_replacement`.

---

## 4c. Final review follow-up (2026-11-01): names valid today, and concurrent editorial transactions (release "001 r4")

**Names.** `ref_published_names` returned every verified name of an entity that had *some* current display name, so an ended name (and a
name whose start date is still to come) could be returned. Now **each returned name must itself be valid today** (`valid_from` empty or
today or earlier, `valid_to` empty or today or later), and `has_display_name` checks the start date too (an entity whose names have all
ended or not yet started cannot be published, and its last name valid today cannot be retired). Regression tests: an ended and a future
name of an entity with a current name are not returned; exactly one name is returned; publication and retirement follow the same rule.

**Concurrency: the finding.** Every check in r3 read the current state with PostgreSQL's default isolation (READ COMMITTED) and locked only
the row being decided. Two editorial transactions running at the same time could each check a state the other was changing. Reproduced
on r3 with two real sessions (`tests/concurrency_tests.sh`: session 1 decides and holds its transaction open 1.5 s; session 2 starts
0.4 s later): **11 of 12 checks failed**: a claim published on a source version, a rights statement, a dependency or an entity that was
being retired stayed current and unsuspended (both orders); two concurrent retirements left a published entity with no display name;
both halves of a `part_of` cycle and of a dependency cycle were stored; evidence was added to a version that had just been submitted.

**The locking strategy (smallest safe correction).**
- **One editorial lock** (`wine_reference.editorial_lock()`, a transaction-level advisory lock, `pg_advisory_xact_lock(20261101, 1)`).
  `ref_review` takes it first, before any row lock; the triggers that check **other** rows take it too: `check_claim` (cycles, kinds,
  active types), `check_dependency` (cycles), `draft_version_only` (evidence and dependencies only on drafts), `check_taxonomy_node`,
  `freeze_claim`, `freeze_taxonomy`, `freeze_claim_type`. Such transactions therefore run one after another; after waiting, each statement
  takes a fresh snapshot (READ COMMITTED), so it sees what the previous decision committed. The automatic suspension runs inside the same
  locked transaction, so it sees publications that committed just before.
- **Row locks kept:** `ref_review` still locks the row it decides (`for update`); plain edits of one row are serialised by PostgreSQL's
  own row locking (an edit waiting on a submit re-checks the submitted row and is refused).
- **The private-copy check** (`check_source_copy`) takes a shared row lock on its rights statement instead of the editorial lock (the
  editorial lock there could deadlock with `ref_review` on the same source-version row): a concurrent retirement of those rights either
  waits for it or is already visible to it.
- **Reads never take the lock** (`ref_published_names`, `is_current`, the verify script).
- **Result on r4:** 13 of 13 concurrency checks pass (the 12 above plus an Owner self-approval racing a rejection); in each, session 2
  waited about 1.1 s for session 1, then either completed safely or was refused with the right reason; the review history records each
  decision once (the C1a retirement recorded one automatic suspension).

**Limitations that remain.**
- All editorial decisions are serialised: fine for a small team; a long editorial transaction (for example many `ref_review` calls in
  one SQL Editor transaction) holds the lock until it ends and makes others wait. Calls through the API are one transaction each.
- A writer that bypasses both `ref_review` and the triggers (only the database owner, by disabling triggers) is not protected; that is
  outside any database rule.
- The advisory-lock key `(20261101, 1)` must not be reused by anything else in the database (nothing in the app uses advisory locks).
- Tested with two sessions and fixed timings on local PostgreSQL 16 and (Phase 2.0B.4) on a local Supabase stack; not under load.
- *Superseded in r5 (section 4d):* direct table writes took the lock only inside row triggers, after the row was locked, and could
  deadlock with `ref_review` (found on Supabase, Phase 2.0B.4, S-1).
- A private copy whose rights are retired after it was written is still only listed by the verify script.

---

## 4d. Release candidate r5 (Phase 2.0B.5, 2026-11-01): the staging findings

The Phase 2.0B.4 local Supabase run (`STAGING_TEST_REPORT.md`) found two small defects and two policy points. r5 corrects the defects,
adds the smallest forward-only rule for the first policy point (owner to confirm, decision 14), and documents the second (decision 15).
Details and test evidence: `CHANGE_REPORT_2_0B_5.md`.

- **S-1, lock order (corrected).** Every INSERT, UPDATE or DELETE statement on the 18 editorial tables now takes the editorial lock in a
  `BEFORE ... FOR EACH STATEMENT` trigger (`<table>_lock_first`, function `lock_before_write()`), which PostgreSQL runs before the
  statement reads or locks any row. Direct writes and `ref_review` therefore take the editorial lock before any row lock, in the same
  order, and the D1 and D3 deadlocks no longer occur (both now wait about 1 s and commit). The lock is re-entrant inside a transaction,
  so `ref_review`'s own writes and the row triggers that take it again are unaffected; the function reads and writes nothing, is not
  security definer, and nobody but the owner may execute it. Remaining edge (documented, not a defect of the rule): a transaction that
  first locks rows with a plain `SELECT ... FOR UPDATE` and only then writes can still wait in the other order; PostgreSQL then detects
  and cancels one side, as before.
- **S-5, TRUNCATE (found while checking S-1's coverage; corrected).** TRUNCATE skips row triggers, so it would have got round frozen rows
  and the append-only `review_events` and `change_log`. It is now refused on the 20 reference tables (all but `schema_migrations`);
  the rollback drops the schema and never truncates.
- **S-2, audit of the automatic retirement (corrected).** When `ref_review` publishes a claim version and retires the previous live
  version of the same claim, it now writes a `retire` review event for that version: actor = the person publishing, note "replaced by the
  publication of version <id>", `owner_override` false, written just before the publish event in the same transaction. At most one such
  version exists (the unique index), so the event is written once. `change_log` is unchanged and still records the row change.
- **S-3, older versions (smallest rule; owner to confirm).** `ref_review` refuses to publish a claim version while a **newer** version
  (higher `version_no`) of the same claim is published and not retired, live or suspended. Normal publication moves forward and replaces
  the older live version (S-2). Bringing older content back stays possible with the decisions that already exist, each recorded: retire
  the newer version first (its own review event, with a note), then publish the older approved one; or write the older content as a
  new version. No new workflow or status was added. A version that was published and retired can never be published again (unchanged).
- **S-4, scaling (not changed).** Publish and retire re-check every published version (`suspend_unsound`): about 0.7 s per publish and
  1.4 s per transitive suspension at 10,000 published versions (Phase 2.0B.4 measurements, repeated on r5). Not optimized in this phase;
  a later migration should narrow the sweep before the reference approaches tens of thousands of published versions (decision 15).
- **Release label** `001 r5 (2026-11-01)` in the foundation, 001a's preflight and the verify script. The verify script gained four
  checks (the 18 lock triggers, the 20 TRUNCATE triggers, every published-then-retired version has a retire event, none has two).
  The rollback scripts are unchanged (the schema drop removes the new triggers and functions with it).
- **r4 was never run live.** r5 replaces it as the candidate; a database that holds r4 (only local or staging copies) is rolled back and
  re-installed, since the preflight refuses a different release.

---

## 5. Compatibility assessment

- **Existing database objects:** none changed. Tested by comparing the entire `public` schema before and after (tables, columns,
  constraints, indexes, functions and their grants, triggers, policies, table grants): the only difference is the two new `ref_*`
  functions. The inspection found no schema named `wine_reference` and no function named `ref_*`.
- **Existing data:** no row read for writing, none changed; no catalog row is imported (nothing is marked verified).
- **The app (`main` and `vwm`):** no file changes, no new calls; `?v=` numbers untouched. Both versions share the database, so both
  "have" the schema, and neither uses it.
- **Live objects the migration depends on:** the enum `public.verification_status`, `public.has_permission(text)`, `public.my_staff_role_code()`,
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
- **Undo `001a`** (permissions): run `001a_rollback.sql`. It is safe at any time (taking permissions away cannot open anything:
  `ref_review` then refuses every decision), safe to run twice, and touches only the four `ref_*` words in `staff_roles` and the `001a`
  register row. **Full rollback order:** `001a_rollback.sql`, then `001_rollback.sql` (which refuses until 001a is undone).
- **Never replay an edited 001.** Once 001 is live, any change is migration 002; the preflight refuses a different release.

---

## 7. Remaining owner decisions

1. **Approve the namespace:** the dedicated private schema `wine_reference`, never added to Exposed schemas.
2. **Supply the fourteen approved knowledge domains and the ~140-subdomain taxonomy** (and the Phase 1.9 document). Until then the taxonomy stays empty.
3. **Approve the structural lists** seeded by 001: the 9 entity kinds, 8 name kinds, 9 source kinds, 7 evidence modalities, and the 6 relationship types (seeded as *proposed*; which to activate, and when).
4. **Revision 7, "assessment evidence separated by modality":** confirm whether it means claim evidence (built), learner assessments (deferred), or both.
5. **Who holds `ref_edit`, `ref_review`, `ref_publish`, `ref_rights`** (`001a` gives all four to the Owner role only; Editors are commented out). *Amended 2026-10-26:* the Owner may approve their own work (Owner approval override), so a second reviewer is no longer needed for the Owner; Editors given these permissions keep the two-person rule.
6. **Risk tiers:** whether tier 1 (legal, genetic, health) needs more than "author ≠ approver" (for example an official primary source, or two approvers).
7. **The first attribute types** (none are seeded).
8. **Languages** to start with (the tables accept any).
9. **`privacy.html`:** whether staff records in the review history need a line (owner and lawyers).
10. **Change log:** keep the reference's own, or later unify with `public.revisions`.
11. **When to switch the reference on** (`app_config` `reference_enabled` = 1): not before there is published content and the owner says so.
12. **Suspension policy (Phase 2.0B.3):** confirm that a suspended claim version is final (a new version is written and reviewed), rather than a "reinstate" decision.
13. **Owner role check:** run `owner_role_check.sql` and confirm the points in `OWNER_ROLE_VERIFICATION.md` before approving the live run.
14. **Older claim versions (r5, S-3):** confirm the forward-only rule as built (an older version is not published while a newer one is
    published and not retired; restoring is "retire the newer one, then publish the older one", both recorded), or choose instead:
    (a) stricter: once a newer version has ever been published, an older one never is (restoration only as a new version); or
    (b) looser: drop the rule (r4 behaviour). Changing it after the live run means migration 002.
15. **Scaling (r5, S-4):** accept the measured decision times for now and plan a narrower suspension sweep in a later migration before
    the reference reaches tens of thousands of published versions.
16. **Approve release candidate r5** (sections 4d and 8) in place of r4.

---

## 8. Approval checklist for live execution

Nothing below is done until the owner approves this design in writing in the chat. Each script runs in the Supabase **SQL Editor** as
the owner, one at a time.

**Before**
- [ ] Owner approves this design, including decisions 1, 3 and 5 above.
- [ ] Confirm a recent backup exists (dashboard: Database, Backups), or note that the plan has none.
- [ ] Confirm **Settings, API, Exposed schemas** does not list `wine_reference`; leave it unchanged.
- [ ] Use the files from the repository's `main` branch at the approved commit. Fingerprints (first 16 hex of SHA-256) as committed:
      `001_wine_reference_foundation.sql` `62b801e9f82929e1`, `001a_reference_permissions.sql` `0f7b14de0152c2a8`,
      `001_verify.sql` `d23b64fdc065a9ea`, `001_rollback.sql` `af80fc11000f6fc1`, `001a_rollback.sql` `cc997dca39ac806c`,
      `owner_role_check.sql` `e911b62ebfba298b` (release candidate "001 r5 (2026-11-01)", Phase 2.0B.5; the last three unchanged since r4).
- [ ] Re-run the local tests on that commit: `bash docs/reference/migration_001/tests/run_local_tests.sh` → 353 passed, 0 failed
      (this includes the r5 regression tests and 20 concurrency checks, among them the deadlock probes D1-D3).
- [ ] Local Supabase stack test (done for r4 in Phase 2.0B.4 and for r5 in Phase 2.0B.5: `STAGING_TEST_REPORT.md`); repeat if the files change.
- [ ] Run `owner_role_check.sql` (read-only) and confirm every point in `OWNER_ROLE_VERIFICATION.md`, "What to confirm". If any
      point fails, stop and send the result (keep the file private).

**Run**
- [ ] New query → paste the whole `001_wine_reference_foundation.sql` → Run. Expected: "Success. No rows returned". Any error: stop and
      send it; nothing was applied.
- [ ] New query → paste `001_verify.sql` → Run. Expected: every row PASS. (A preflight stop names its reason: an unexpected `ref_*`
      function, a partial or foreign schema, a different release or drift. Nothing was changed; send the message.)
- [ ] Open the app (main and `/vwm/`): Discover, Journal and Learn behave as before.

**Then, separately**
- [ ] Only after decision 5: run `001a_reference_permissions.sql`, then `001_verify.sql` again (the 001a consistency rows must PASS).
      To undo: `001a_rollback.sql`.
- [ ] Keep `reference_enabled` absent or 0.
- [ ] Tell the session; it records the date and result in `docs/HANDOFF.md` and `docs/reference/results/`.

**Never:** run `tests/001_behaviour_tests.sql` or `tests/stub_supabase.sql` on Supabase (they write test rows and create stub objects).

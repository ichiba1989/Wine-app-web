# Wine Education Master Reference: complete briefing

**As of 2026-10-26 (updated the same day for the Owner approval override).** One document that covers the whole effort so far, written to be read on its own (no access to the code needed).
Repository: `ichiba1989/Wine-app-web`, branch `main` (latest commit at writing: `76032a4`); the venue version `vwm` has the same documents.

**Status in one paragraph.** The reference has been audited, the live database has been inspected (read-only), a reference model has
been drafted, and **migration 001** (the database foundation) has been designed, written as SQL and **tested on a throwaway local
database: 160 tests passed, 0 failed** (re-run in full after the Owner approval override was added). **Nothing has been run on the live database and nothing in the app has changed.** The next step
needs the owner: the decisions in section 10 and written approval, then the checklist in section 11.

---

## Contents

1. What the project is and what this effort adds
2. Timeline of the phases
3. The existing application (audit findings)
4. The live database (inspection findings)
5. Architecture decision
6. The reference model (principles)
7. The eight Phase 1.9 revisions and where each lives
8. Migration 001: what it builds
9. Security, compatibility, tests and recovery
10. Decisions the owner still has to make
11. Checklist for running migration 001 on the live database
12. What is missing (dependencies)
13. File index
14. Glossary

---

## 1. What the project is and what this effort adds

**The app.** A phone-first wine discovery and learning game, *"a game that learns your palate while teaching you about wine"*. Players
swipe wine cards, keep a journal of what they drink, play wine games, take quizzes, explore an atlas and get food and restaurant advice.
It is a web prototype (plain JavaScript files, no build step) on **Supabase** (a hosted PostgreSQL database with sign-in, file storage
and row-level security), published on GitHub Pages in two versions: the main app and a version for a wine shop, Vintage Wine Merchants
(`/vwm/`). Both versions share one database.

**The effort.** The **Wine Education Master Reference**: a canonical, evidence-backed body of wine knowledge that will eventually support
fourteen approved knowledge domains (the list itself is still to be supplied; the original brief mentions areas such as wine science,
geography, grapes, producers, vineyards, laws, history, service and related beverages),
vintage-specific wine records, multilingual names and definitions, facts that change over time, a citation for every fact, editorial
review before publication, layered entries from beginner to expert, navigation by hierarchy and by links, and later learning paths and
assessments. **The rule: reference database first, educational features later.**

**Non-negotiable product rules** (from the project's own instructions): verified structured data decides, a language model never does;
only facts explicit on a bottle or produced by a stored rule may become authoritative; every fact keeps its source and verification date;
wine identity, market price, purchases, preferences, perceptions, knowledge and educational content are never merged into one object;
real bottle photographs only; third-party data only with a checked licence; database changes are SQL the owner runs by hand.

---

## 2. Timeline of the phases (all on 2026-10-26)

| Phase | What happened | Result |
|---|---|---|
| Restore point | Both versions saved as frozen branches before the change (`backup/before-big-change-2026-10-26`, `backup/vwm-before-big-change-2026-10-26`) | Can always go back |
| 2.0A | Read-only repository audit | Recommendation: build inside the existing database, in its own section, additive only |
| 2.0B.1 | Read-only database inspection scripts written and tested; the owner ran them on the live database; draft reference model | `docs/REFERENCE_MODEL.md`, `docs/reference/results/FINDINGS.md` (raw results kept by the owner, not published) |
| 2.0B.2 | Migration 001 designed, written, tested locally | `docs/reference/migration_001/`: 160 of 160 tests passed; not run live |

---

## 3. The existing application (audit findings)

| Area | Finding |
|---|---|
| Frontend | About 80 plain JavaScript modules (about 17,000 lines), no framework, no package manager, works offline |
| Backend | Supabase: PostgreSQL with row-level security, sign-in (anonymous guest first, then an email), file storage; one server function on the venue version |
| Database access | No ORM; every database call is in one file (`data.js`); the app reads curated views and calls database functions for risky writes |
| Database changes | Not kept as migrations in the repository; SQL scripts are run by hand in the Supabase SQL Editor |
| Permissions | Staff roles (Player, Quiz reviewer, Editor, Owner) as bundles of permissions; the database's row-level security is the real enforcement |
| Search | Only on the phone (name-matching keys); no database text search |
| Testing | No test framework; Node and Playwright check scripts with a fake database |
| Relevant pieces already there | Rules with sources and "to check" flags (which grapes an appellation's rules name, designations, spellings); reference lists with status (suggested / in use / checked); one rule for when two names are the same; Beginner / Enthusiast / Professional wording levels; a glossary designed but parked |

**Main risks found:** the database structure was not in the repository; wine identity has only two levels (wine, vintage); duplicates
and name variants in the catalog; no language or time fields; three different status vocabularies; knowledge split between code and
database; all personal data (journals, swipes) points at vintage ids, so identities can be linked but never merged.

---

## 4. The live database (inspection findings)

Two read-only scripts were run by the owner. They read only PostgreSQL's catalog and summary counts of shared catalog tables; no
personal data, function bodies or secrets were read. **The raw results are kept by the owner and not published** (the website copies
the repository's `docs/` folder).

**Structure.**
- `public` holds 65 tables, 8 views and 88 functions; every app table has row-level security on.
- **New tables and functions in `public` are automatically granted to the browser's roles** (`anon` = signed out, `authenticated` = signed
  in). A **new separate schema starts with no grants.** This is why the reference gets its own schema.
- The list of schemas the API serves is kept in the Supabase dashboard (Settings, API, Exposed schemas), not in the database.
- Already present and useful: a change-history table (`revisions`, about 5,400 rows) with a trigger; a field-level provenance table
  (`field_provenance`, empty); an appellation-to-grape rules table with a required source (`appellation_grape_rules`); a market-price
  table (`market_observations`, empty).
- Existing vocabularies: status `draft / pending_review / verified / retired`; quiz levels `beginner / enthusiast / professional / scholar`
  (four levels: a precedent for an expert level).
- The old catalog allows **only one non-vintage row per wine**, so non-vintage editions cannot be told apart there.

**Catalog.**

| Measure | Value |
|---|---|
| Wines | 1,517 (1,506 verified, 11 waiting) |
| Vintages | 1,888 (151 non-vintage; years 1988 to 2025) |
| Producers / places / grapes | 811 / 293 / 41 |
| Where the catalog came from | 1,691 records from the Vintage Wine Merchants list, 100 from a prototype sample catalog, 97 from a supermarket sample; **no place has a source** |
| Duplicates | 6 producer names that differ only by accents; 12 groups of wines with the same producer, name, type and place |
| Grapes | 41 names, including pairs such as Syrah / Shiraz and Pinot Gris / Pinot Grigio, and the typo "Cabernet Sauvigon" (whether a pair is one variety is for an editor with a source) |
| Quiz | 250 questions (58 verified); none linked to a grape, place or wine; 2 with a source |

**Consequence:** the existing catalog cannot count as evidence. Every future link from the reference to it is marked "old catalog, not
verified" until an editor checks it against a real source.

**Noticed on the way (left untouched, owner to decide):** two older database scripts not yet run (`rank_appellations.sql`,
`restaurant_visits.sql`); a parked feature's setting (`techsheet_enabled = 2`) leaves its empty tables open to players; a read-only login
role (`claude_readonly`) whose purpose is to be confirmed.

---

## 5. Architecture decision

**Recommended, and supported by the inspection: a dedicated private schema `wine_reference` in the existing Supabase database, never
added to the API's exposed schemas.** Players and staff reach it only through a small number of curated functions in `public`.

| Point | Dedicated schema `wine_reference` | `ref_` tables in `public` |
|---|---|---|
| Default access | None; nothing is reachable until granted | Every new table and function is open to the browser's roles automatically |
| API exposure | Not served (setting unchanged) | Served at once |
| Mistakes | A missing rule leaves data closed | A missing rule leaves data open |
| Housekeeping | Everything in one place; can be listed, checked and (while empty) removed as a whole | Mixed with 65 app tables |
| The app | Unaffected (its offline layer only handles the app's own calls) | Unaffected if names never clash |

Rejected: a separate database or service (duplicates sign-in and permissions, adds a provider and cost); a broader rebuild (nothing
requires it). **Status: recommended; final owner approval pending.**

---

## 6. The reference model (principles)

Full text: `docs/REFERENCE_MODEL.md`. In short:

- **One permanent id per real-world thing** (grape variety, place, producer, brand, legal entity, person, term, taxonomy node). Ids
  are never reused or deleted; when two turn out to be one, the later is marked "superseded by" the earlier.
- **Names are not identities.** Every name is its own row: language, kind (official, as on the label, common, historical, translation,
  synonym, typing shortcut), period of validity, status. A name as written is kept exactly; official names are never translated or
  respelled.
- **Facts are claims.** A claim is a subject, a relationship or an attribute, and a value; it has **versions** (what it says, when it was
  true in the world, its risk tier, its status). A correction is a new version; old versions are kept.
- **Every published claim has evidence:** a specific source version (the exact edition or page that was read, with its retrieval date and
  a fingerprint), a locator (page, section), optionally a short quote, the evidence's modality (documentary, label, analytical, genetic,
  map, sensory, expert statement) and the rights for any quote.
- **Risk-based verification (proposal):** tier 1 for legal, genetic and health claims; tier 2 for specific facts about one product,
  producer or place; tier 3 for general explanations. Every tier: the author never approves their own work.
- **Wine identity (owner's levels; definitions to confirm):** product (the wine as a continuing thing) → edition (what is in the bottle:
  a harvest year, or a stated non-vintage identifier, else "unidentified non-vintage") → release (how an edition reaches the market) →
  release event (dated happenings). Only stated information creates a level; nothing is inferred.
- **The old catalog stays as it is.** The reference links to it with mapping rows (suggested, confirmed or rejected, by whom and when);
  legacy ids, rows and names are never changed.
- **Layers:** Beginner, Enthusiast, Professional (the app's levels), with an expert level an owner decision.
- **Rights per component:** each source version and each quote carries its own licence statement; copies are kept only where a licence
  allows.
- **Education later:** quiz questions will point at the claims they test; no CMS or WSET syllabus material without permission or a
  licence.

---

## 7. The eight Phase 1.9 revisions and where each lives

The Phase 1.9 document itself has not been supplied; the eight items below are the requirements as listed in the Phase 2.0B.2 brief.

| # | Revision | Built in migration 001 | Deferred |
|---|---|---|---|
| 1 | Evidence-backed grape genetic relationships | Grape varieties as identities; relationship types "is a genetic parent of" and "is a mutation of" (risk tier 1); **publication refused without genetic evidence** | Clones, crossing details, link to today's grape list |
| 2 | Historical ownership and asset interests | "Holds an interest in" (legal entity or person → producer, brand, legal entity or place) with dates (or an explicit "dates unknown") and a share of 0 to 100 percent | Kinds of interest; vineyard parcels as entities |
| 3 | Producers, brands and legal entities kept apart | Three separate kinds; "is a brand of", "is operated by" | Linking today's producers |
| 4 | Product, edition, release and release-event identities | Not in 001 (no technical need; keeps 001 small) | Migration 002, with the legacy mapping |
| 5 | Unified multilingual naming | One names table for every kind, language, script, period | Translations of encyclopedia text |
| 6 | Claim-version dependencies | "This version holds only if that one holds"; no loops; publication refused while a dependency is unpublished | Automatic flagging when a dependency is retired |
| 7 | Assessment evidence separated by modality | Every piece of evidence carries its modality; a claim type can require one | Learner assessments (if that is the meaning: owner to confirm) |
| 8 | Component-level licensing and rights | Licence statements on source versions (copies) and quotes; quotes must be allowed and verified before publication | Rights for images, entry text, translations, datasets |

---

## 8. Migration 001: what it builds

**One new private schema, `wine_reference`, with 21 tables, and two functions in `public`.** No existing table, row, view, function,
setting or permission is changed. No wine content is added; the taxonomy is empty; nothing from the catalog is imported.

| Group | Tables |
|---|---|
| Register | `schema_migrations` |
| Controlled lists (structural words, not facts) | `entity_kinds` (9), `name_kinds` (8), `source_kinds` (9), `evidence_modalities` (7), `relationship_types` (6, all *proposed*, i.e. unusable until the owner activates them), `attribute_types` (none) |
| Identities and names | `entities`, `entity_names` |
| Taxonomy (empty) | `taxonomy_domains`, `taxonomy_nodes`, `taxonomy_assignments` |
| Sources and rights | `sources`, `source_versions`, `rights_statements` |
| Claims | `claims`, `claim_versions`, `claim_version_dependencies`, `claim_evidence` |
| History | `review_events` (every decision), `change_log` (every row change); both append-only |

**The two doors in `public`:**
- `ref_published_names(query, language, limit)`: anyone may call it; returns published entities and their verified names (never typing
  shortcuts); **returns nothing while the reference is switched off** (setting `reference_enabled`, absent = off; the migration does not
  add it); at most 200 rows.
- `ref_review(table, id, decision, note)`: signed-in staff only; the **only** way to submit, approve, reject, publish or retire.

**Editorial life of a row:** draft → submitted (`pending_review`, content frozen) → approved (`verified`, by someone other than the
author) → published (entities and claim versions only) → retired. Rejection returns it to draft.

**Rules the database enforces itself:** new rows start as drafts; status changes only through `ref_review`; no self-approval except by the Owner (below);
publication needs supporting evidence from a verified source version, the claim type's required evidence modality, quotes with verified
rights that allow quoting, published subject and object, and published dependencies; publishing a new claim version retires the old one;
dates must be in order; shares between 0 and 100; no loops in the taxonomy, in "part of" relationships or in dependencies; a taxonomy
node's parent is in the same domain.

**Permissions (application level):** `ref_edit` (submit), `ref_review` (approve, reject), `ref_publish` (publish, retire), `ref_rights`
(approve a licence). They are given to roles by a **separate script, `001a`**, the only step that touches an existing table (the role
definitions). As drafted it gives all four to the Owner role only.

**Owner approval override (owner policy, 2026-10-26).** The person whose staff role is **Owner** may approve their own work (any risk tier)
and publish it without a second person. Everyone else keeps the two-person rule. The Owner is recognised only by the app's existing
server-side role lookup (`my_staff_role_code()`, which reads the person's staff role; players cannot change it, and the Owner role is only
ever set by hand), asked on every call, so removing the Owner role ends the override at once. No other rule is waived: evidence, verified
sources, quotation rights, required evidence modality and published dependencies still apply. Every use is recorded in the append-only
review history as `owner_override`, with who, when, the decision and an optional justification.

**Deliberately deferred:** wine product / edition / release / release-event tables and the legacy mapping (002); staff tools to create
drafts and an Owner page tab (002/003; until then rows typed in the SQL Editor have no author and cannot be approved); reconciling the
existing provenance and rules tables and the code lists; the taxonomy import; attribute types; encyclopedia entries and translations;
education; database search per language.

---

## 9. Security, compatibility, tests and recovery

**Security, two layers.**
- *Database:* the schema is closed to signed-out visitors, signed-in players and the server key; row-level security is on with no
  rules (only the owner reaches rows); internal functions cannot be run by anyone else; the two doors run with fixed, empty search
  paths and explicit grants; inputs to `ref_review` are checked against fixed lists and passed as parameters.
- *Application:* each editorial decision checks the person's permission inside the database, not only on screen.
- *Known limits:* the database owner (SQL Editor) can do anything, as for every table; staff user ids are kept in the history
  (`privacy.html` may need a line: owner and lawyers).

**Compatibility.** The whole `public` schema was compared before and after the migration in the test: the only difference is the two
new `ref_*` functions. No app file changes; neither version of the app uses the reference yet.

**Tests (local only, PostgreSQL 16, throwaway database): 160 passed, 0 failed.** Covered: fresh install; running it twice (no change,
no duplicates); backward compatibility; the read-only verify script; foreign keys and uniqueness; taxonomy loops and domains;
relationship types and loops; dates and values; editorial rules and the two-person rule; provenance (frozen versions, evidence only on
drafts); rights; dependencies; append-only history; access refused for every browser role; publication rules of the read door; rollback
(refused with content, clean when empty); the permissions script; the Owner approval override (allowed for the Owner, refused for
reviewers and publishers, no rule waived, recorded, ended at once when the role is removed); a missing live function stops the migration. *Limits:* not Supabase itself; the permission check and sign-in were
stand-ins; the verify script re-checks access on the live database after the migration.

**Recovery.** The migration is one transaction (all or nothing). While the reference is empty, a tested rollback script removes exactly
what it created. Once content exists: never drop; fix forward with a new migration and retire instead of deleting.

---

## 10. Decisions the owner still has to make

1. Approve the namespace: the dedicated private schema `wine_reference`, never exposed through the API.
2. Supply the **fourteen approved knowledge domains**, the **~140-subdomain taxonomy** and the **Phase 1.9 document**.
3. Approve the starting lists: 9 entity kinds, 8 name kinds, 9 source kinds, 7 evidence modalities, 6 relationship types (and which to activate).
4. Revision 7: does "assessment evidence separated by modality" mean claim evidence (built), learner assessments (deferred), or both?
5. Who holds `ref_edit`, `ref_review`, `ref_publish`, `ref_rights` (the Owner no longer needs a second reviewer; Editors who get them keep the two-person rule).
6. Whether tier-1 claims need more than "author ≠ approver" (for example an official primary source, or two approvers).
7. The first attribute types (for example alcohol by volume, founding year).
8. Languages to start with.
9. Whether `privacy.html` needs a line about staff records (owner and lawyers).
10. Keep the reference's own change log, or later unify with the existing `revisions` table.
11. When to switch the reference on (not before there is published content).
12. Also open from earlier: the definitions of product / edition / release / release event (and where bottle format belongs); whether to add an expert level; CMS/WSET permission; whether licensed source copies may be kept in a private bucket; the six accent-only producer duplicates; the parked feature's open setting; the `claude_readonly` role.

---

## 11. Checklist for running migration 001 on the live database

Nothing here happens until the owner approves in writing. Scripts run one at a time in the Supabase **SQL Editor**.

**Before**
- [ ] Owner approves the design, including decisions 1, 3 and 5.
- [ ] A recent database backup exists (dashboard: Database, Backups), or note that the plan has none.
- [ ] Settings, API, Exposed schemas does **not** list `wine_reference`; leave it unchanged.
- [ ] Use the approved files. Fingerprints (first 16 hex characters of SHA-256): `001_wine_reference_foundation.sql` `ae69fb54f1be71d7`,
      `001a_reference_permissions.sql` `8cf791d1e3d0256a`, `001_verify.sql` `512247ba1d83ae50`, `001_rollback.sql` `210b650d5b103a2f`.
- [ ] Read the live body of `my_staff_role_code()` once (read-only) and confirm it returns 'owner' only for the Owner role (DESIGN.md §8).
- [ ] Re-run the local tests on that commit: 160 passed, 0 failed.

**Run**
- [ ] Paste `001_wine_reference_foundation.sql`, Run: expect "Success. No rows returned". Any error: stop; nothing was applied.
- [ ] Paste `001_verify.sql`, Run: every row PASS.
- [ ] Open the app (main and `/vwm/`): it behaves as before.

**Then, separately**
- [ ] After decision 5: run `001a_reference_permissions.sql`, then the verify script again.
- [ ] Keep the reference switched off.
- [ ] Record the date and result in the hand-off notes.

**Never** run the test files (`tests/stub_supabase.sql`, `tests/001_behaviour_tests.sql`) on Supabase: they create stand-ins and test rows.

---

## 12. What is missing (dependencies)

| Missing | Effect | Needed from |
|---|---|---|
| The 14 approved knowledge domains and the ~140-subdomain taxonomy | Taxonomy tables stay empty; no codes or names are invented | Owner |
| The Phase 1.9 document | The eight revisions are taken from the brief's wording; no line-by-line comparison yet | Owner |
| Permission or licence for CMS / WSET material | No syllabus wording, numbering or mapping | Owner (and the bodies concerned) |
| Staff entry tools (migration 002/003) | Content can only be typed in the SQL Editor, and such rows cannot be approved | Next phases |

---

## 13. File index (repository `ichiba1989/Wine-app-web`, branch `main`)

| File | What it is |
|---|---|
| `docs/reference/WINE_REFERENCE_BRIEFING.md` | This briefing |
| `docs/REFERENCE_MODEL.md` | The reference model (principles, open questions) |
| `docs/reference/INSPECTION.md` | How the read-only inspection is run |
| `docs/reference/inspect_1_structure.sql`, `inspect_2_catalog.sql` | The read-only inspection scripts |
| `docs/reference/results/FINDINGS.md` | Summary of the live inspection |
| `docs/reference/migration_001/DESIGN.md` | Migration 001 design, security review, compatibility, recovery, decisions, checklist |
| `docs/reference/migration_001/DATA_DICTIONARY.md` | Every table, column, key, rule and index (generated from a tested install) |
| `docs/reference/migration_001/001_wine_reference_foundation.sql` | The migration |
| `docs/reference/migration_001/001a_reference_permissions.sql` | The permissions step (separate approval) |
| `docs/reference/migration_001/001_verify.sql` | Read-only checks for after the migration |
| `docs/reference/migration_001/001_rollback.sql` | Rollback while the reference is empty |
| `docs/reference/migration_001/TEST_REPORT.md` | The local test report with the full output |
| `docs/reference/migration_001/tests/` | The local test harness (never for Supabase) |

---

## 14. Glossary

| Term | Meaning here |
|---|---|
| Supabase | The hosted service behind the app: a PostgreSQL database with sign-in, storage and access rules |
| Schema | A named section of the database that holds tables and functions |
| Row-level security (RLS) | Database rules that decide which rows each user may see or change |
| `anon`, `authenticated`, `service_role` | The database roles for signed-out visitors, signed-in users (guests included) and the server key |
| Data API / exposed schemas | The part of Supabase that lets the browser read tables directly; only listed schemas are served |
| Migration | A numbered SQL script that changes the database's structure |
| Entity | One real-world thing with a permanent id |
| Claim / claim version | A statement about an entity / one wording of it, with its dates, status and evidence |
| Source version | The exact edition, page or file that was read |
| Evidence modality | How evidence was obtained (document, label, laboratory, genetic test, map, tasting, expert statement) |
| Risk tier | How much checking a kind of claim needs (1 = most) |
| Two-person rule | The author of a row can never approve it, except the Owner (Owner approval override, always recorded) |
| Published | Approved and released to players (separate from approved) |
| Retired | Withdrawn but kept for the record |

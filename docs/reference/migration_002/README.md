# Migration 002: the editorial door, the wine identity levels and links to the old catalog

Release `002 r1 (2026-11-08)`. **Implemented and tested locally; not run on production** (steps: `DEPLOY_002.md`).
Builds on 001 r5 and 001a, both deployed on production. `reference_enabled` stays at 0.

## Why this scope

002 does exactly what `docs/reference/migration_001/DESIGN.md` §3 put off to "002", and nothing more:

| Deferred item (DESIGN.md §3) | Done in 002 |
|---|---|
| Staff functions to create drafts, and the Owner page "Reference" tab. Rows typed in the SQL editor have no author, so `ref_review` cannot approve them. | `public.ref_draft` writes drafts **as the signed-in author**, and `public.ref_staff` reads for staff. The Owner page has a **Reference** tab. |
| Product, edition, release and release-event identities (REFERENCE_MODEL.md §4, revision 4) | Entity kinds `wine_product`, `wine_edition`, `wine_release`, `release_event`. Relationship types `product_of`, `defined_by_place`, `edition_of`, `release_of`, `event_of`, `made_from`. Attribute types `harvest_year`, `nv_identifier`, `release_date`, `event_date`, `bottle_format_ml`. All types are **proposed** until the Owner switches each one on. |
| Mapping to the old catalog, with read-only suggestion reports first, all marked "old catalog, not verified" | `wine_reference.legacy_links` and the `ref_staff('suggestions')` report. |

Still later, not in 002:
- reconciling `field_provenance`, `appellation_grape_rules` and the code lists;
- the 14 domains and the taxonomy (waiting for the owner's material);
- anything shown to players.

## The model rules kept

- Nothing is written outside `wine_reference` except the two doors, which are public functions.
- The old catalog (`producers`, `wines`, `wine_vintages`, `grapes`, `geo_areas`) is **only read**. Catalog ids are kept as text in
  `legacy_links.catalog_id`.
- **Least privilege:**
  - Both doors are `security definer` with `search_path ''`.
  - `authenticated` can execute them. `anon` cannot, nor `public` or `service_role`; each is revoked explicitly, because Supabase's
    defaults would grant them.
  - Each door checks `has_permission` and takes the editorial lock.
  - `wine_reference` stays unexposed, with RLS on and no policies.

Who may do what:

| Action | Permission (Owner only today, owner decision 5) |
|---|---|
| `ref_staff` overview and suggestions | any `ref_*` |
| `ref_draft`: create_entity, add_name, create_source (with rights), add_source_version, create_claim, new_claim_version, add_evidence, add_dependency, link_catalog | `ref_edit` |
| `ref_draft`: set_type_status, create_attribute_type | `ref_publish` |
| `ref_draft`: decide_link (confirm or reject) | `ref_review` |
| submit, approve, publish, retire, suspend | unchanged: `ref_review` (001) |

**Everything starts as a draft** (links start as "suggested"). Approval and publication go only through 001's `ref_review`, so the 001
rules hold:
- the Owner may approve their own work, recorded as `owner_override`;
- a row with no author cannot be approved;
- decision 14: an older claim version is never published once a newer one has been. `new_claim_version` writes the next version number,
  and publishing it retires the old one with a review event.

Evidence, provenance, history and audit:
- Every new row is logged in `change_log`.
- `legacy_links` has the lock, log and no-TRUNCATE triggers.
- At most one **confirmed** link per catalog row, enforced by a partial unique index.
- `decided_at` is set exactly when a link leaves "suggested".

Languages: names carry a language and a script (e.g. `ja` + `Jpan`, `zh-Hans` + `Hans`, `ja-Latn`). The tab offers English, French,
Italian, Japanese and Chinese (`WR_LANGS` in `owner.js`).

## Safety of the migration itself

- **Preflight** (inside 002, and as a read-only file):
  - needs 001 release `001 r5 (2026-11-08)` and 001a;
  - needs no drift since 001;
  - refuses any `ref_*` function in public that it does not know.
- **Replay** is allowed only for the same release with no drift (`fingerprint_002()`); an edited 002 is refused, so the fix becomes
  migration 003.
- **Rollback** works only while 002 is unused, and checks that the structure equals 001's fingerprint again.

## Files

| File | What it is |
|---|---|
| `002_preflight.sql` | read-only checks before running |
| `002_reference_editorial_identity.sql` | the migration (one transaction) |
| `002_verify.sql` | read-only, 35 checks; replaces `001_verify.sql` after 002 |
| `002_rollback.sql` | undo while unused |
| `live_post_deploy_002.mjs` | live check after deployment (public key) |
| `tests/run_002_tests.sh` | the local suite (96 checks with `UI_PORT`) |
| `tests/api_002_tests.py` | real-API workflow (57 checks) |
| `tests/owner_ui.mjs` | the Reference tab in a browser (19 checks) |
| `tests/prereq_catalog.sql` | catalog stand-ins for the test database |

App: `owner.js` (the Reference tab: `referenceTable`, `nextDecisions`, `entitySteps`, `sourceSteps`), `data.js` (`refOverview`,
`refSuggestions`, `refDraft`, `refReview`) and `app.js` (`loadOwnerReference`, `ownerReference`). These are online only and never
queued offline.

## Owner decisions still open

1. **Which identity types to switch on, and when** (Owner page → Reference → Types). The definitions of product, edition, release and
   release event come from REFERENCE_MODEL.md §4. Whether **bottle format** belongs to a release is still question 4 in §15:
   `bottle_format_ml` stays proposed until you decide.
2. **Running 002 on production:** a separate go-ahead ("approved: run Migration 002").
3. Already decided and kept: Owner-only permissions (5), the stricter version rule (14), scaling accepted for now (15).

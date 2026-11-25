# Migration 006: evidence review and full-catalog editorial navigation (release "006 r1 (2026-11-25)")

**Status:** implemented and tested locally; **not run on production**. The steps are in `DEPLOY_006.md`. Needs 005 r1 (deployed 2026-11-25).

## Why

The Reference tab had two limits:
- it read only the latest 300 things, facts and sources (`ref_staff` 'overview');
- after the grape rules were imported (005), it could not show which source each fact was waiting for.

006 adds **one read-only door**, `public.ref_browse(p_action, p_data)`, for staff holding a reference permission. It writes nothing, and
every function it adds is `STABLE`.

| Action | What it returns |
|---|---|
| `evidence` | The facts of one claim type (default `rules_name_grape`), a page at a time. For each fact: its latest version; every piece of evidence (source and source version with their status, licence status, locator, modality, role, and whether it counts); `problems`; `newer_published`; `publish_blockers`; `next` (submit / approve / publish / blocked / published / retired); and `approve_blocker`. Stages: all, draft, pending_review, approved, publishable, blocked, published, retired. |
| `evidence_sources` | The source versions those facts rely on: their source, their status, what stops each from being approved, and how many facts wait on it by status. Stages: waiting (default), all. |
| `entities` | Every thing. Search covers any name in any language, or the id. Filters: kind, status (live, draft, pending_review, approved, published, retired) and subject area (a code, or `none`). Sort: newest or name. With `assign_area`, each row also says whether it can be put in that subject area (`''` = yes, else the reason). |
| `claims` | Every fact. Search covers the subject or object name. Filters: claim type, status of the latest version (incl. suspended), the subject's kind, and facts about one thing (`entity_id`). |
| `link_compare` | One old catalog row and every live candidate link, side by side: names in every language, status, subject areas, facts, how it was found, and other catalog rows linked to the same thing. |

## Eligibility: no competing rule

- **`problems` is `wine_reference.version_problems()` verbatim** (001's one rule), and `current` is `wine_reference.is_current()`.
- `ref_review` makes three checks inline that no function exposes. 006 mirrors them so a screen never offers a step `ref_review` would
  refuse:
  - `source_version_blockers()`: the approval rules for a source version (its source first, verified rights, copy rights);
  - `author_blocker()`: the two-person rule, with the Owner exemption;
  - `newer_published()`: the forward-only publication rule (owner decision 14).

  They use `ref_review`'s own words.
- **`ref_review` still decides.** The API tests compare each mirror with `ref_review`'s real answer: the same refusal, with the same
  words, and acceptance when the mirror shows nothing in the way.

## Pages

- At most **100 rows** a page (default 50; the screens ask for 25 or 50).
- **A fixed order:** newest first by `(created_at, id)`, or by `(display name, id)`.
- **Keyset cursors:** a page starts after the last row of the previous one (`next`), so rows are never repeated or skipped. This holds
  even when rows are added while someone is paging (tested).
- The first page also gives `total`.

## Indexes

Inspected first. 001 already has:
- `entities_kind`;
- the trigram index on names (`entity_names_search`);
- `claims_subject`, `claims_object`, `claims_relationship`, `claim_evidence_version`, `claim_evidence_source`, `claim_versions_claim`.

None covers the newest-first order. Measured on the local stack with 5,343 things:

| Query | Time |
|---|---|
| a newest-first page, without an index (sequential scan) | 2.0 ms |
| the same page with `entities_created (created_at, id)` (backward index scan) | 0.19 ms |
| the whole door: `entities`, newest | 12 ms |
| the whole door: `entities`, by name | 68 ms |
| the whole door: `entities`, a search | 17 ms |
| the whole door: `claims` | 24 ms |
| the whole door: `evidence`, blocked | 15 ms |

006 adds two indexes: `entities_created` and `claims_created`. Nothing else was needed at this size. Name sorting computes each display
name, which is acceptable for thousands of rows; a stored sort key would be the next step if the reference grows past tens of thousands.

## Security

- `ref_browse`: SECURITY DEFINER, `search_path ''`, executable by `authenticated` only (revoked from public, anon and service_role).
- It needs a reference permission (`ref_edit`, `ref_review`, `ref_publish` or `ref_rights`). Signed-out visitors, guests, players and
  staff without one are refused (401/403).
- The five internal helpers are not executable by anyone but the owner role. The private schema stays unexposed: the Data API answers 406.
- The door ignores `reference_enabled`, like every staff door. `ref_published_names` still returns nothing while the switch is 0 (tested
  both ways).
- **What 006 changes:**
  - no app table, row, view or existing function;
  - no reference content: nothing published, no type switched on, no taxonomy created.

## The app (Owner page → Reference)

- **Evidence review** (new view). Work from top to bottom:
  1. review the sources;
  2. approve their versions (a version shows what it waits for: its source first, then its licence);
  3. review the facts (grouped: Blocked, Drafts, Waiting for approval, Ready to publish, Published, All);
  4. approve them;
  5. publish each one through the existing "Publish → Confirm: publish" step.

  A blocked fact lists its reasons and offers no step. Nothing is published in bulk.
- **Browse all** (new view). Places & things, and Facts, are searched and filtered on the server. Each list shows loading, error (with
  "Try again"), empty, "N of M shown · Show more" and "End of the list".
- **Put several things in a subject area** (in Browse all):
  - pick an existing subject area; things that cannot be added say why;
  - tick, or "Tick all that can be added (shown)", then "Assign N ticked" and "Confirm: assign N";
  - the run goes one by one through 003's `assign_taxonomy`, with progress, Stop, and a result line (done, refused, not tried), each
    refusal on its own line;
  - it creates no subject area.
- **Compare side by side** (Catalog links, rows with several suggestions). A table with one column per candidate, plus "Worth noticing":
  - exact name, a name equal only ignoring accents, capitals or punctuation, or no matching name;
  - draft, retired, or already confirmed for another catalog row.

  Nothing is chosen for you. "Choose this one" asks for a confirmation and then confirms that link through 003's `decide_links`; 003's
  rule rejects the others, and Undo stays possible.
- **Before 006 is run,** each of these says "This part needs migration 006", and the rest of the tab works as before (tested).
- Code:
  - `refBrowse` in `data.js`;
  - in `owner.js`: `pageMerge`, `factActions`, `sourceActions`, `compareCandidates`, `assignable`, `evidenceHtml`, `browseHtml`,
    `compareHtml`;
  - in `app.js`: `loadOwnerEvidence`, `loadOwnerBrowse`, `loadOwnerCompare`, `wrAssignMany`.

## Files

| File | |
|---|---|
| `006_preflight.sql` | read-only; 9 rows, all PASS before 006 |
| `006_reference_browse.sql` | the migration (one transaction) |
| `006_verify.sql` | read-only; 55 rows; replaces `005_verify.sql` (two of its rows fail by design after 006: drift, and the ref_* count 7 → 8) |
| `006_rollback.sql` | removes the door, helpers and indexes; always possible (006 stores nothing); `005_verify` passes again afterwards |
| `live_post_deploy_006.mjs` | the live check with the public key only; says "not deployed yet" before 006 |
| `tests/run_006_tests.sh` | the local suite: preflight refusals, install, verify, replay, the API checks, the API workflows of 003–005 on top, rollback, rules, browser |
| `tests/api_006_tests.py` | the real-API checks |
| `tests/owner_rules_006.mjs` | the pure rules |
| `tests/owner_ui_006.mjs` | the browser, with `EXPECT=full` or `none` |

## Not done (owner decisions, unchanged)

- No identity type is activated, and `rules_name_grape` stays proposed.
- `bottle_format_ml` placement is not decided.
- No taxonomy is invented or imported.
- No grape-rule conflict is resolved, and no grape rule is imported on production.
- `reference_enabled` stays 0.

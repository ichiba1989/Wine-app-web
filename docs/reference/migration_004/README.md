# Migration 004: grape and place-tree drafts from the catalog, subject-area assignments, the grape-rules check

Release `004 r1 (2026-11-13)`. **Implemented and tested locally; not run on production** (steps: `DEPLOY_004.md`). It needs 003 r1
deployed first. `reference_enabled` stays off, and no type is switched on.

## What you can do with it (Owner page → Reference)

| Where | What it does |
|---|---|
| Catalog links → **Places** → "Draft the place tree (part of)" | One draft "part of" fact per catalog place and its parent (village in region in country), made only when both places' links are confirmed. Marked "from the old catalog, not verified". |
| Catalog links → **Vintages** → "Draft grapes from the labels (made from)" | One draft "made from" fact per edition and **label** grape: wine_grapes with basis `label`, the bottle itself. A grape that came from a rule or an editor is skipped and listed, and no share is invented. It needs the edition built and the grape's link confirmed. |
| **Places & things** → open a thing | Its subject areas, each with Submit/Approve/Retire, and "Put in subject area" (pick a subject area, optionally the main one). |
| **Grape rules** (new view) | A **read-only** comparison of the database table `appellation_grape_rules` with the app's code list `aocgrapes.js`. For each code line it shows "in both", "not in the table", or "not found in the catalog by its exact name", together with the table's own row. A filter lists the table rows that no code line matches. It reads each row whole, so it works whatever the live table's columns are called. |

Facts are drafted only while their type is switched on. Each tool reports what waits: a type that is still proposed, a link that is
not yet confirmed, an edition not yet built. You still decide the switches (Types view; 003 recommends `part_of` now and
`made_from` later). Drafts need evidence from a real source before they can be published (001's rule).

## Preparing the appellation_grape_rules reconciliation (REFERENCE_MODEL.md §6 rule 5)

Ready now, with nothing changed:
- the Grape rules check (above);
- a proposed relationship type, **`rules_name_grape`**: place → grape variety, "its rules name the grape". It is tier 1, and
  publication needs documentary evidence (the rules themselves). Its qualifiers are `rule` (only/main/usual or
  sole/primary/permitted) and `min_percent`, as the text states. It is unusable until you switch it on.

**Your decision (genuine, not blocking anything else):** which list becomes the reference for appellation grape rules:
- **A.** The checked lines of `aocgrapes.js` (each has its official source and the day it was read) become `rules_name_grape`
  facts. `appellation_grape_rules` stays as it is until it is retired later.
- **B.** `appellation_grape_rules` rows become the facts, keeping their own source and status. `aocgrapes.js` remains the app's
  fallback.
- **C.** Both, line by line, after the Grape rules check shows they agree. Where they differ, you decide.

**Recommended:** C, starting from the lines marked "in both". Every fact still needs its official source as evidence. Nothing is
imported until you choose. The import itself would be a small migration (005).

## Rules kept

- The old catalog, `wine_grapes` and `appellation_grape_rules` are only read.
- No wine fact is invented:
  - a grape comes only from the label;
  - a place tree comes only from the catalog's own parent rows;
  - shares are never guessed.
- Everything drafted is marked "from the old catalog, not verified".
- `public.ref_work`: `SECURITY DEFINER` with an empty `search_path`, signed-in users only. Reads need any `ref_*` permission; drafts
  need `ref_edit` (Owner only today).
- The internal functions have no grants.

## Files

| File | What it is |
|---|---|
| `004_preflight.sql` | read-only checks before running (9 rows) |
| `004_reference_catalog_facts.sql` | the migration (one transaction) |
| `004_verify.sql` | read-only, 45 rows; replaces `003_verify.sql` after 004 |
| `004_rollback.sql` | undo while 004 is unused |
| `live_post_deploy_004.mjs` | live check after deployment (public key; 21 checks) |
| `tests/run_004_tests.sh` | the local suite: 78 checks with `UI_PORT` |
| `tests/api_004_tests.py` | real-API workflow (37) |
| `tests/owner_ui_004.mjs` | the tab in a browser (16) |
| `tests/owner_rules_004.mjs` | the tab's pure rules (6) |
| `tests/prereq_catalog_004.sql` | synthetic `wine_grapes` and `appellation_grape_rules` stand-ins (deliberately not the live column names) |

App: `owner.js` (Grape rules view, `ruleLines`, `ruleSummary`, `rowText`, `assignHtml`, the two buttons), `data.js` (`refWork`) and
`app.js` (`loadOwnerAssign`, `loadOwnerRules`, and the `wrassign`, `wrassignadd`, `wrrulefilter` and `wrtool:placetree|grapes`
actions). Before 004 is run, these parts say "needs migration 004" and the rest of the tab works as with 003.

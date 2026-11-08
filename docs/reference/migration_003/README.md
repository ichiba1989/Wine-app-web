# Migration 003: subject areas, wine identity from the old catalog, catalog matching

Release `003 r1 (2026-11-08)`. **Implemented and tested locally; not run on production** (steps: `DEPLOY_003.md`).
Builds on 001 r5, 001a and 002 r1, all deployed. `reference_enabled` stays off and no type is switched on.

## What you can do with it (Owner page → Reference)

| View | What it does |
|---|---|
| **Subject areas** (new) | Paste your approved list from a spreadsheet, **Check** it (nothing saved), then **Import** it. Each entry becomes a draft with a stable code, its place in the hierarchy, its names in every language you give, and the approved document as its source. Then **Submit all / Approve all / Publish all** per domain. You can import the same file again later: codes are kept, and only new names and orders are added. A code the file no longer lists is reported, never retired automatically. |
| **Catalog links** (reworked) | For each old catalog table, the coverage (rows, confirmed, waiting, several candidates, not linked) and these tools: **Find same-name matches**, **Make drafts for the next 50 not linked**, **Confirm the unambiguous ones**, and per row **Confirm / Reject / Undo**. Filters: Waiting, Several candidates, Not linked, Confirmed, Same thing twice. |
| Catalog links → **Vintages** | **Build product + edition** (per row, or the next 25). For each vintage it makes a draft wine product (one per old `wines` row) and a draft edition: the stated year, or "NV (unidentified non-vintage)". Each gets a suggested link, plus the draft facts that tie them together where the type is switched on. |
| **Types** | Each proposed type now shows a recommendation (below). The switch stays yours. |

Until 003 is run, the tab works as before: the Catalog links view falls back to 002's report, and Subject areas says "needs migration 003".

## Recommended identity types (your decision; switch them on in Types)

| Type | Recommendation | Why |
|---|---|---|
| `part_of` (001) | **Now** | Builds the place tree (village in region in country). |
| `product_of` | **Now** | Ties each wine product to its producer. |
| `defined_by_place` | **Now** | The place (appellation) a product is defined by, as the label states it. |
| `edition_of` | **Now** | Ties each vintage or non-vintage edition to its product: the backbone of the identity chain. |
| `harvest_year` | **Now** | The label's year for a vintage edition. The old catalog's year is offered as a draft that needs a real source before approval. |
| `nv_identifier` | **Now** | Tells non-vintage editions apart, only when the label or producer states it. |
| `release_of`, `release_date`, `event_of`, `event_date` | Later | Switch on when you record the first stated release or event. |
| `made_from` | Later | Once grape varieties are linked and confirmed; a share only when stated. |
| `bottle_format_ml` | **Your decision first** | Does bottle format belong to a release (REFERENCE_MODEL.md §15 question 4)? It stays proposed. |

Everything "Build product + edition" makes is a **draft**, marked "from the old catalog, not verified". A fact can only be published
with evidence from a real source (001's rule). A non-vintage edition never gets an invented year.

## Rules the database now enforces on every catalog link

These hold on every path: 002's door, 003's tools, and the SQL editor.

- A link's thing must be the kind its table stands for: producers → producer, wines → wine product, wine_vintages → wine edition,
  grapes → grape variety, geo_areas → place.
- The catalog row must exist. The old catalog is only read, never written.
- At most one confirmed link per catalog row, and a row with a confirmed link takes no new suggestion.
- Confirming one link rejects that row's other suggestions automatically.
- Allowed moves: suggested → confirmed or rejected; confirmed → rejected (**Undo**); rejected → suggested (reopen). A rejected link
  never jumps straight to confirmed, and what a link points at never changes.
- A retired or replaced thing cannot be linked or confirmed.
- Every change is in `change_log`. Each link records how it was found (`match_method`: editor, same name, made from this row) and a
  score (100 when it was the only same-name candidate, 50 when there were several).
- **Nothing is confirmed automatically.** "Confirm the unambiguous ones" is your click, and it only takes a row's single suggestion
  that was made from that very row or was the one thing with exactly its name.
- Two catalog rows that are the same thing (the live catalog has producers that differ only by accents) can both be linked to one
  thing. The old rows are never merged; "Same thing twice" lists them.

## Taxonomy: what is built, and what waits for you

- **Built:**
  - `ref_tools` actions: `create_domain`, `create_node`, `assign_taxonomy` and `import_taxonomy` (dry run and apply);
  - the reader for pasted tables (`parseTaxonomyTable` in `owner.js`). Columns: `domain`, `code`, `parent`, `sort`, and one `name:xx`
    per language;
  - review of whole domains (`review_many`).

  001's rules still hold: a stable code; codes and parents frozen once approved; a parent always in the same domain; no cycles. Every
  import must name the approved document's source version, so provenance is kept.
- **Waiting for you:** the 14 domains and the subdomain list themselves. Nothing is filled in.

## Security

- One new door, `public.ref_tools(text, jsonb)`: `SECURITY DEFINER` with an empty `search_path`, executable by signed-in users only.
  It checks the same permissions as 002, all Owner-only today:
  - reads need any `ref_*` permission;
  - drafts and suggestions need `ref_edit`;
  - link decisions need `ref_review`.
- Review decisions still go only through 001's `ref_review`, so self-approval is recorded as `owner_override`.
- The new internal functions have no grants.
- `wine_reference` stays unexposed.

## Files

| File | What it is |
|---|---|
| `003_preflight.sql` | read-only checks before running (9 rows) |
| `003_reference_taxonomy_identity_catalog.sql` | the migration (one transaction) |
| `003_verify.sql` | read-only, 41 rows; replaces `002_verify.sql` after 003 |
| `003_rollback.sql` | undo while 003 is unused |
| `live_post_deploy_003.mjs` | live check after deployment (public key; 17 checks) |
| `tests/run_003_tests.sh` | the local suite: 116 checks with `UI_PORT` |
| `tests/api_003_tests.py` | real-API workflow (67) |
| `tests/owner_ui_003.mjs` | the tab in a browser (20) |
| `tests/owner_rules_003.mjs` | the tab's pure rules (10) |
| `tests/prereq_catalog_003.sql` | extra synthetic catalog rows |

App: `owner.js` (Subject areas, Catalog links, type advice), `data.js` (`refTools`) and `app.js` (`loadOwnerTaxonomy`,
`loadOwnerLinks`, the `wrtax`, `wrtaxrev`, `wrtool`, `wrrow` and `wrundo` actions). These are online only.

## Not in 003 (next)

- `made_from` from the catalog's label grapes.
- Place-tree facts (`part_of`) drafted from the catalog's own place tree.
- Assigning things to subject areas from the tab (the database action exists).
- Reconciling `appellation_grape_rules` and the code lists.

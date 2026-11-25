# Running Migration 003 on production (release "003 r1 (2026-11-08)")

**Status: implemented and tested locally. NOT run on production. It needs your go-ahead** ("approved: run Migration 003").
I have no access to the production database. You run each script in the Supabase SQL editor (works from an iPhone browser).

**What it adds:** the Subject areas tools (importing your approved list; no content is included), building product and edition
drafts from the old catalog, and catalog matching with rules on every link. The design is in `README.md` here.

**What it does not change:**
- no app table, row, view or existing function;
- no type is switched on, and `reference_enabled` stays at 0.

The app is already published with the new tab parts. Until 003 runs, Subject areas says "needs migration 003" and Catalog links
shows the 002 report.

## Files (from `main`; check the SHA-256 before pasting)

| Order | File | SHA-256 (first 16) |
|---|---|---|
| 1 | `docs/reference/migration_003/003_preflight.sql` (read-only) | `829d050c14fb2335` |
| 2 | `docs/reference/migration_003/003_reference_taxonomy_identity_catalog.sql` | `0a206a614ce36bfc` |
| 3 | `docs/reference/migration_003/003_verify.sql` (read-only; replaces `002_verify.sql` from now on) | `02d2748c7451b947` |
| undo | `docs/reference/migration_003/003_rollback.sql` (only while nothing uses 003) | `970a354ae3f501c5` |
| after | `docs/reference/migration_003/live_post_deploy_003.mjs` (I run it; public key only) | `fd7546a12cf2fcca` |

## Steps (Supabase dashboard → SQL editor; about 10 minutes)

1. New query → paste **`003_preflight.sql`** → Run. **All 9 rows must say PASS.** It changes nothing. If a row says FAIL, stop
   and send me that row.
2. New query → paste the whole **`003_reference_taxonomy_identity_catalog.sql`** → Run. Expected: "Success. No rows returned". It
   is one transaction, so an error means nothing was applied. Send me the error.
3. New query → **`003_verify.sql`** → Run. **All 41 rows must say PASS.** After 003, two rows of `002_verify.sql` say FAIL by design
   (drift and the ref_* count); use `003_verify.sql` from now on.
4. In the app (Settings → Owner page → Reference):
   - **Subject areas** opens with the paste box;
   - **Catalog links** shows the coverage line for Producers;
   - **Types** shows "Recommended now" next to the identity types.
5. Tell me it is done. I then run `live_post_deploy_003.mjs`, plus `live_smoke.mjs` and `live_ui.mjs` (main and `/vwm/`), and fix
   anything they find.

**If something is wrong:**
- While nothing uses 003 (no subject areas, no link made by the 003 tools, no fact drafted from the catalog): run
  **`003_rollback.sql`**. It removes only what 003 added and checks that the structure is exactly 002's again.
- Once 003 content exists, the rollback refuses and changes nothing. The fix is then forward (migration 004).

## After deployment: first uses (none is needed for the deployment)

- **Types:** switch on the "Recommended now" types if you agree (README: `part_of`, `product_of`, `defined_by_place`, `edition_of`,
  `harvest_year`, `nv_identifier`). Leave `bottle_format_ml` proposed.
- **Catalog links → Producers:** run "Make drafts for the next 50 not linked", then "Confirm the unambiguous ones". Repeat for Grapes
  and Places.
- **Catalog links → Vintages:** run "Build product + edition for the next 25".
- **Subject areas:** when your approved list is ready:
  1. record it as a source (Sources view);
  2. paste the list;
  3. Check;
  4. Import.

## Tested before release (2026-11-08)

All on a local Supabase stack (Postgres 17.11, real Auth and Data API), starting each time from the production state: hardening
release 2, then 001 r5, 001a and 002 r1.
- **`tests/run_003_tests.sh`: 116 passed, 0 failed.**
  - The preflight passes 9 of 9 read-only.
  - 003 stops and creates nothing in three cases: a hand change since 002, a different 002 release, a foreign `ref_*` function.
  - It installs. `003_verify` passes 41 of 41. The public schema is unchanged apart from `ref_tools`. Replay works, and the hardening
    still verifies.
  - `002_verify` fails exactly its two documented rows.
  - 67 real-API checks pass, covering:
    - refusals for visitors, guests, players and editors;
    - taxonomy dry run, apply, re-apply and revision, conflicts refused, provenance, multilingual names, bulk review, frozen
      hierarchy;
    - drafts, same-name suggestions, unambiguous confirmation, auto-reject, undo and reopen;
    - the kind, row and retired-thing rules;
    - the duplicates report;
    - product and edition with the type rule, no invented NV year, no publication without evidence;
    - the catalog unchanged.
  - **002's own API workflow passes 57 of 57 with 003 installed.**
  - The rollback refuses with content, works on an empty install (002_verify passes again), and re-install works.
  - Pure rules 10 of 10; browser 20 of 20.
- **`migration_002/tests/run_002_tests.sh` against the new app: 96 passed, 0 failed** (the tab before 003 is deployed).
- **App regression** (fake database): Pairings 11, More/Food 25, Atlas 39, restaurant 29, card map 19, Morgon 13, Grand Cru 8, label
  names 7, steps 12; foods 49, restaurant rules 38. All passed.
- **`live_post_deploy_003.mjs`:** 17/0 against the local deployment. Against production it reports "not deployed yet" (2026-11-08)
  and writes nothing.

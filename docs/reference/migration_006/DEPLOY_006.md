# Running Migration 006 on production (release "006 r1 (2026-11-25)")

**Status: implemented and tested locally. NOT run on production. It needs your go-ahead.** It needs 005 r1, which is deployed
(2026-11-25). I have no access to the production database: you run each script in the Supabase SQL Editor. Per your rule of 2026-11-25,
I give each script in full in the chat, in a copyable code block, one at a time, with its expected result.

**What it adds:** one **read-only** door, `public.ref_browse`, for the Reference tab's Evidence review, Browse all, and Compare side by
side. It also adds five internal helper functions and two indexes.

**What it does not change:**
- no table, row, view or existing function;
- no reference content: nothing is published, no type is switched on, no taxonomy is created;
- `reference_enabled` stays at 0.

## Files (check the first 16 characters of the SHA-256)

| Order | File | SHA-256 (first 16) | Expected |
|---|---|---|---|
| 1 | `006_preflight.sql` (read-only) | `97128a36ca104772` | 9 rows, all PASS |
| 2 | `006_reference_browse.sql` | `947ab452c8613b0c` | "Success. No rows returned" |
| 3 | `006_verify.sql` (read-only; replaces `005_verify.sql` from now on) | `0fa722078adaa117` | 55 rows, all PASS |
| undo | `006_rollback.sql` (always possible: 006 stores nothing) | `3faab21866ecea68` | "Success. No rows returned" |
| after | `live_post_deploy_006.mjs` (I run it; public key only) | `12d73f093b40862a` | 35 passed, 0 failed |

## Deployment sequence

1. **`006_preflight.sql`** → Run. **All 9 rows PASS.** It changes nothing. A FAIL row means stop and send me the row.
2. **`006_reference_browse.sql`** (the whole script) → Run. Expected: "Success. No rows returned". It is one transaction: a failure
   changes nothing.
3. Optional (it removes the one known false alarm): run `notify pgrst, 'reload schema';`.
4. **`006_verify.sql`** → Run. **All 55 rows PASS.** After 006, two rows of `005_verify.sql` say FAIL by design: the drift row, and
   "nothing else named ref_*" (7, now 8).
5. Tell me it is done. I run `live_post_deploy_006.mjs`, `live_smoke.mjs` and `live_ui.mjs`. **The app is not changed before this point:**
   the new screens are on the unpublished branch `claude/wine-app-setup-35g1ne`.
6. With your authorisation ("deploy the 006 app"):
   - I merge the screens into `main`, then into `vwm` (the merge is already rehearsed and its checks pass);
   - I run the app checks and push both, which publishes the site;
   - I run the live checks again.

**If something is wrong:**
- Run **`006_rollback.sql`** at any time. It removes the door, the helpers and the indexes, and checks that the structure is exactly
  005's again; `005_verify.sql` then passes.
- If the app is already published, its new views then say "This part needs migration 006" and nothing else changes.

## Your first use (none is needed for the deployment)

Owner page → Reference:
- **Evidence review:** the imported grape rules and the sources they rely on, in the order of the work. Approve the source, then its
  version, then the fact; then publish it, with a confirmation.
- **Browse all:** every thing and fact, page by page, searched on the server. To fill a subject area with several things at once, use
  "Put several things in this subject area…".
- **Catalog links → Several candidates → Compare side by side:** read the columns, then "Choose this one" and confirm.

## Tested before release (2026-11-25)

On a local Supabase stack (Postgres 17.11), starting each time from the production state (hardening, 001 r5, 001a, 002 r1 to 005 r1):

- **`tests/run_006_tests.sh`: 179 passed, 0 failed.**
  - **Preflight:** 9/9 read-only, and four refusal cases (drift, another 005 release, a foreign ref_* function, a hand-made ref_browse).
  - **Install and verify:** `006_verify` 55/55. The public schema is unchanged apart from `ref_browse`. Replay works, the hardening still
    verifies 18/18, and `005_verify` fails exactly its two documented rows.
  - **81 real-API checks:**
    - refusals for signed-out visitors, guests, players and staff without a reference permission; the private schema answers 406;
    - the problems equal `version_problems()` for every fact;
    - every mirror agrees with ref_review's real answer: source before version, licence, author rule with the Owner exemption, publish
      only when eligible, forward-only;
    - 343 things over 4 pages (and 10 pages by name), and 324 facts, all with no duplicates or omissions, including a row added while
      paging;
    - filters, a literal "%", the 100-row cap;
    - assignment eligibility and a partial failure;
    - side-by-side candidates and an explicit choice;
    - no writes by the reads; staff reads the same with the switch on or off, while the public read follows the switch;
    - the catalog unchanged.
  - **Content and rollback:** `006_verify` 55/55 after content; the rollback works even with content (`005_verify` 51/51 again), and 006
    re-installs.
  - **Earlier workflows with 006 installed:** the API workflows of 002 (57/57), 003 (67/67), 004 (37/37) and 005 (43/43).
  - **The app:** pure rules 37/37; browser with 006, 29/29; browser without 006, 9/9 ("needs migration 006", the rest of the tab works).
- **Editorial suite with the new app:** 47/0.
- **App regression:**
  - `main`: atlas 39, cardmap 19, mortet 7, morgon 13, rank 8, steps 12, food 4, food_more 25, food_owner 11, restaurant 29, foods 49,
    restaurant_check 38.
  - `vwm` (rehearsed merge): atlas_v 14, cardmap_v 19, venue 17, vrev 48, sure 14, steps 12, mortet 7, morgon 13, rank 8, food 4,
    food_more 25, food_owner 11, restaurant 29.
  - All passing.
- **`live_post_deploy_006.mjs`:** 35/0 locally. On production today it reports "not deployed yet".
- **Speed with 5,343 things:** every page is under 70 ms (README.md, "Indexes").

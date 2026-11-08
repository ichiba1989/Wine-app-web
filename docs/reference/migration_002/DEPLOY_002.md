# Running Migration 002 on production (release "002 r1 (2026-11-08)")

**Status: DEPLOYED on production by the owner on 2026-11-08** (approved: "run Migration 002"; run by hand in the SQL editor). Live checks
after deployment (public key only):
- `live_post_deploy_002.mjs`: 13/0;
- `docs/security/tests/live_smoke.mjs`: 26/0;
- `live_ui.mjs`: 26/0 (main and /vwm/).

`reference_enabled` is off, and the identity types are still proposed. The results of `002_preflight.sql` and `002_verify.sql` are
reported by the owner.

Original note:
I have no access to the production database. The owner runs each script in the Supabase SQL editor (works from an iPhone browser).

**What it adds:**
- The editorial door `ref_draft`: the Owner writes drafts, signed in, as their author.
- The staff read `ref_staff`, used by the Owner page's Reference tab.
- The four wine identity levels, with their link types. These are **proposed**: switched off until the Owner switches each one on.
- `legacy_links`: links from old catalog rows to reference entities, marked "old catalog, not verified".

**What it does not change:**
- No app table, row, view or existing function; the old catalog is only read.
- `reference_enabled` stays at 0, so players see nothing.

The Reference tab is already in the app; until 002 runs it says "The reference needs migration 002".

## Files (from `main`; check the SHA-256 before pasting)

| Order | File | SHA-256 (first 16) |
|---|---|---|
| 1 | `docs/reference/migration_002/002_preflight.sql` (read-only) | `171e5a6b8df5438f` |
| 2 | `docs/reference/migration_002/002_reference_editorial_identity.sql` | `9bafdb00544e62e5` |
| 3 | `docs/reference/migration_002/002_verify.sql` (read-only; replaces `001_verify.sql` from now on) | `0cc61f35e3e724f0` |
| undo | `docs/reference/migration_002/002_rollback.sql` (only while nothing uses 002) | `2ff449361b92293a` |
| after | `docs/reference/migration_002/live_post_deploy_002.mjs` (I run it; public key only) | `20fbe63935620852` |

## Steps (Supabase dashboard → SQL editor; about 10 minutes)

**Before:**
- **a.** Settings → API → **Exposed schemas**: `wine_reference` must **not** be listed. Leave the setting as it is.
- **b.** Database → Backups: note the latest backup time.
- **c.** New query → paste **`002_preflight.sql`** → Run. **All 12 rows must say PASS.** It changes nothing. If a row says FAIL, stop
  and send me the result.

**Run:**
1. New query → paste the whole **`002_reference_editorial_identity.sql`** → Run. Expected: "Success. No rows returned". It is one
   transaction, so any error means nothing was applied. Copy the error and stop.
2. New query → **`002_verify.sql`** → Run. **All 35 rows must say PASS.**
   - From now on, use `002_verify.sql` instead of `001_verify.sql`.
   - After 002, four rows of `001_verify.sql` say FAIL by design: drift, the ref_* function count, and the lock and TRUNCATE trigger
     counts.
3. Optional: run **`docs/security/anon_hardening_verify.sql`**. Every row should still say PASS.
4. **In the app** (Settings → Owner page → **Reference** tab, signed in as the Owner):
   - the tab opens with "Not shown to players" and a "New draft" form;
   - the Types view lists the identity types as **proposed**.

   Create nothing yet unless you want to. Everything you create is a draft until you approve and publish it.
5. Send me the results of steps c and 2. I then run `live_post_deploy_002.mjs`, plus `docs/security/tests/live_smoke.mjs` and
   `live_ui.mjs` (main and `/vwm/`).

**If something is wrong:**
- While nothing uses 002 (no links, no identity-level entities, no claims with the new types): run **`002_rollback.sql`**. It removes
  only what 002 added and checks the structure is exactly 001's again; after it, `001_verify.sql` passes.
- Once 002 content exists, the rollback refuses and changes nothing. The fix is then forward (migration 003), never dropping.

## After deployment: what I run (the app's public key, no secret)

**`node docs/reference/migration_002/live_post_deploy_002.mjs`** (13 checks):
- signed-out visitors and guests are refused by `ref_staff` and `ref_draft`, and nothing is written;
- `wine_reference` (with `legacy_links`) is still not served by the Data API;
- the read door still returns nothing while `reference_enabled` is 0.

Before deployment it only reports "not deployed yet" and writes nothing. That was the result on 2026-11-08.

## Tested before release (2026-11-08)

**Local Supabase stack** (Postgres 17.11, real Auth and Data API), starting each time from the production state: the hardening
release 2, then 001 r5, then 001a. `docs/reference/migration_002/tests/run_002_tests.sh`: **96 passed, 0 failed.**
- The preflight passes 12 of 12 in a read-only transaction before 002.
- 002 stops and creates nothing when:
  - 001a is missing;
  - a hand change was made since 001;
  - the 001 release is older;
  - there is a foreign `ref_*` function.
- Install works. `002_verify` passes 35 of 35. The public schema is unchanged apart from the two doors. Replay works, and the hardening
  still verifies.
- 57 real-API workflow checks pass (`tests/api_002_tests.py`), covering:
  - refusals for visitors, guests, players and editors;
  - names in English, French, Italian, Japanese and Chinese;
  - source rights;
  - Owner self-approval recorded as `owner_override`;
  - type activation;
  - claim versions with the automatic retire event;
  - decision 14;
  - the identity levels;
  - catalog links.
- The rollback refuses with content, works on an empty install (after it, `001_verify` passes again), and refuses a second time.
- 19 Owner-page checks pass in a real browser (`tests/owner_ui.mjs`). The real app is signed in as a local Owner, and a whole workflow
  goes through the Reference tab's buttons; the old catalog row stays unchanged.

**App regression** (fake database): Owner page Pairings 11, More and Food 25, Atlas 39, restaurant 29, card map 19, Morgon 13,
Grand Cru 8, label names 7, steps 12; the food rules 49 and restaurant rules 38. All passed. `node --check` passes on every module.

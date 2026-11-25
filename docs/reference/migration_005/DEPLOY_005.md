# Running Migration 005 on production (release "005 r1 (2026-11-13)")

**Status: implemented and tested locally. NOT run on production. It needs your go-ahead** ("approved: run Migration 005"). **003
and 004 must be deployed first**, in that order: `docs/reference/migration_003/DEPLOY_003.md`, then
`docs/reference/migration_004/DEPLOY_004.md`. Each refuses to run before the one it needs. I have no access to the production
database; you run each script in the Supabase SQL editor.

**What it adds:** the Grape rules **Review and import** workflow (stage, decide, import accepted rules as draft facts) and two review
tables.

**What it does not change:**
- no app table, row, view or existing function;
- nothing is published, no type is switched on, and `reference_enabled` stays at 0.

## Files (from `main`; check the SHA-256 before pasting)

| Order | File | SHA-256 (first 16) |
|---|---|---|
| 1 | `docs/reference/migration_005/005_preflight.sql` (read-only) | `f71ed0a3ef588932` |
| 2 | `docs/reference/migration_005/005_reference_grape_rules.sql` | `c1dbe9fb0196a108` |
| 3 | `docs/reference/migration_005/005_verify.sql` (read-only; replaces `004_verify.sql` from now on) | `caee6e8b15126614` |
| undo | `docs/reference/migration_005/005_rollback.sql` (only while no review batch exists) | `3286fbe8b421f656` |
| after | `docs/reference/migration_005/live_post_deploy_005.mjs` (I run it; public key only) | `6768c1866ca0a748` |

## Steps (Supabase dashboard → SQL editor; about 5 minutes)

1. **`005_preflight.sql`** → Run. **All 9 rows PASS.** It changes nothing.
2. **`005_reference_grape_rules.sql`** (the whole file) → Run. Expected: "Success. No rows returned". It is one transaction.
3. **`005_verify.sql`** → Run. **All 51 rows PASS.** After 005, four rows of `004_verify.sql` say FAIL by design: drift, the ref_*
   count, and the lock and TRUNCATE trigger counts (two new tables).
4. Tell me it is done. I then run `live_post_deploy_005.mjs`, `live_smoke.mjs` and `live_ui.mjs`.

**If something is wrong:**
- While no review batch exists: run **`005_rollback.sql`**. It checks that the structure is exactly 004's again.
- After the first "Stage for review", the batch is review history and the rollback refuses. The fix is then forward (migration 006).

## Your first use (none is needed for the deployment)

Owner page → Reference → **Grape rules** → **Stage for review**. The first batch also records the table's real column names.
1. Go through **Conflicts** first, then **Agree**, **Code list only** and **Table only**.
2. To import, switch on **"Its rules name the grape"** in Types.
3. Make sure the appellations and grapes are linked (Catalog links: drafts, then "Confirm the unambiguous ones").
4. Press **Import accepted as drafts**.
5. Approve the sources (Sources view), then the facts.

## Tested before release (2026-11-13)

On a local Supabase stack (Postgres 17.11), starting each time from the production state plus 003 r1 and 004 r1:
- **`tests/run_005_tests.sh`: 85 passed, 0 failed.**
  - Preflight 9/9 read-only; three refusal cases; install; `005_verify` 51/51.
  - The public schema is unchanged apart from `ref_rules`. Replay works, and the hardening still verifies.
  - `004_verify` fails exactly its four documented rows.
  - 43 real-API checks pass, covering:
    - refusals;
    - all seven states told apart, with both sides kept as stored;
    - accept refused for unresolved, not importable, unchecked and missing-side candidates;
    - a conflict settled only by an explicit side;
    - no silent flip; bulk decisions checked one by one;
    - import waiting for the type, then for the links, then 4 drafts with documentary evidence;
    - sources as drafts, reused per address;
    - the chosen side's rule kept, no style invented;
    - no double import, even from a later batch; imported candidates frozen;
    - nothing published, and publishing refused before the source is approved;
    - the table and catalog unchanged;
    - TRUNCATE refused; candidate content immutable.
  - **004's own API workflow passes 37 of 37 with 005 installed.**
  - The rollback refuses with a batch and works when empty (`004_verify` passes again); re-install works.
  - Rules 8/8; browser 15/15, with the real `aocgrapes.js` list.
- **004's suite against the new app (before 005): 78 passed, 0 failed.**
- **App regression:** all passed.
- **`live_post_deploy_005.mjs`:** 25/0 locally. On production it reports "not deployed yet".

# Running Migration 004 on production (release "004 r1 (2026-11-13)")

**Status: implemented and tested locally. NOT run on production. It needs your go-ahead** ("approved: run Migration 004"), and
**Migration 003 r1 must be deployed first.** I have no access to the production database; you run each script in the Supabase SQL
editor.

**What it adds:**
- "Draft the place tree" and "Draft grapes from the labels";
- subject areas on each thing;
- the read-only Grape rules check;
- one proposed type (`rules_name_grape`).

**What it does not change:**
- no app table, row, view or existing function: `appellation_grape_rules` and `wine_grapes` are only read;
- no type is switched on, and `reference_enabled` stays at 0.

## Files (from `main`; check the SHA-256 before pasting)

| Order | File | SHA-256 (first 16) |
|---|---|---|
| 1 | `docs/reference/migration_004/004_preflight.sql` (read-only) | `031badc7f065ed6e` |
| 2 | `docs/reference/migration_004/004_reference_catalog_facts.sql` | `8bdc7cec6b06aa89` |
| 3 | `docs/reference/migration_004/004_verify.sql` (read-only; replaces `003_verify.sql` from now on) | `0481e9923fff91ef` |
| undo | `docs/reference/migration_004/004_rollback.sql` (only while nothing uses 004) | `732c5aa3ddec29cd` |
| after | `docs/reference/migration_004/live_post_deploy_004.mjs` (I run it; public key only) | `e2421869488b27b7` |

## Steps (Supabase dashboard → SQL editor; about 5 minutes)

1. New query → **`004_preflight.sql`** → Run. **All 9 rows must say PASS** (the rows marked "(information)" only report). It changes nothing.
2. New query → the whole **`004_reference_catalog_facts.sql`** → Run. Expected: "Success. No rows returned". It is one transaction,
   so an error means nothing was applied. Send me the error.
3. New query → **`004_verify.sql`** → Run. **All 45 rows must say PASS.** After 004, two rows of `003_verify.sql` say FAIL by design
   (drift and the ref_* count).
4. Tell me it is done. I then run `live_post_deploy_004.mjs`, `live_smoke.mjs` and `live_ui.mjs`.

**If something is wrong:**
- While nothing uses 004: run **`004_rollback.sql`**. It checks that the structure is exactly 003's again.
- Once a "made from" or "part of" draft from the catalog, or a `rules_name_grape` fact, exists, the rollback refuses. The fix is then
  forward (migration 005).

## Tested before release (2026-11-13)

On a local Supabase stack (Postgres 17.11), starting each time from the production state plus 003 r1:
- **`tests/run_004_tests.sh`: 78 passed, 0 failed.**
  - The preflight passes 9 of 9 read-only; three refusal cases; install; `004_verify` 45 of 45.
  - The public schema is unchanged apart from `ref_work`. Replay works, and the hardening still verifies.
  - `003_verify` fails exactly its two documented rows.
  - 37 real-API checks pass, covering:
    - refusals for visitors, guests, players and editors;
    - the place tree: waiting for links, then for the type, then 3 drafts, never twice;
    - label grapes: no edition, grape not linked, type proposed, then made; a rule grape skipped; no share invented;
    - assignments: read, primary, no doubles, review, retire;
    - the grape-rules check: whatever the column names; in both, missing, not found; extra rows named; nothing changed;
    - the catalog unchanged.
  - **003's own API workflow passes 67 of 67 with 004 installed.**
  - The rollback refuses with content, works when empty (`003_verify` passes again), and re-install works.
  - Rules 6 of 6; browser 16 of 16.
- **003's suite against the new app (before 004): 116 passed, 0 failed.**
- **App regression** (fake database): all passed.
- **`live_post_deploy_004.mjs`:** 21/0 locally. On production it reports "not deployed yet" and writes nothing.

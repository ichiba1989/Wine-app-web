# Running migrations 003 to 006 on production, in order (one page)

003, 004 and 005 were run by the owner on 2026-11-25. 006 (read-only) is next: `docs/reference/migration_006/DEPLOY_006.md`.

All three are approved by the owner, each conditional on the one before. Each is run by hand in the Supabase **SQL Editor** (an iPhone
browser works). I never run production SQL. Every file is on `main`; check the first 16 characters of its SHA-256.

The details for each migration are in its own `DEPLOY_00N.md`. This page is the short order.

| Step | File | SHA-256 (first 16) | Expected |
|---|---|---|---|
| 003 · 1 | `docs/reference/migration_003/003_preflight.sql` | `829d050c14fb2335` | 9 rows, all PASS |
| 003 · 2 | `docs/reference/migration_003/003_reference_taxonomy_identity_catalog.sql` | `0a206a614ce36bfc` | "Success. No rows returned" |
| 003 · 3 | `docs/reference/migration_003/003_verify.sql` | `02d2748c7451b947` | 41 rows, all PASS |
| 004 · 1 | `docs/reference/migration_004/004_preflight.sql` | `031badc7f065ed6e` | 9 rows, all PASS |
| 004 · 2 | `docs/reference/migration_004/004_reference_catalog_facts.sql` | `8bdc7cec6b06aa89` | "Success. No rows returned" |
| 004 · 3 | `docs/reference/migration_004/004_verify.sql` | `0481e9923fff91ef` | 45 rows, all PASS |
| 005 · 1 | `docs/reference/migration_005/005_preflight.sql` | `f71ed0a3ef588932` | 9 rows, all PASS |
| 005 · 2 | `docs/reference/migration_005/005_reference_grape_rules.sql` | `c1dbe9fb0196a108` | "Success. No rows returned" |
| 005 · 3 | `docs/reference/migration_005/005_verify.sql` | `caee6e8b15126614` | 51 rows, all PASS |

**After each migration** (it takes a few seconds):
- Optional, but it removes the one known false alarm: run `notify pgrst, 'reload schema';` in a new query. This makes the Data API see
  the new functions at once; Supabase normally does it by itself.
- Tell me. I then run that migration's `live_post_deploy_00N.mjs`, `docs/security/tests/live_smoke.mjs` and `live_ui.mjs`
  (main and `/vwm/`), and fix any regression before you go on.

**If a step fails:**
- Each migration is one transaction, so a failure changes nothing. Stop and send me the error.
- A preflight FAIL row means stop: send me the row.
- After a later migration, the previous migration's verify file shows a few FAIL rows by design. Use the newest `00N_verify.sql`.

**Undo:** each `00N_rollback.sql` works only while that migration is unused. Run them newest first: 005, then 004, then 003. After
use, a fix is forward (a new migration).

**Not done by these migrations:**
- `reference_enabled` stays 0;
- no identity type is switched on;
- no taxonomy content is imported;
- no grape rule is published.

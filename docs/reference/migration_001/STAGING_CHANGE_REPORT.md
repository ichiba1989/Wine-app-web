# Staging change report (Phase 2.0B.4, 2026-11-01)

**Bottom line:**
- **Migration 001 r4 was not changed.** The tested files are exactly those of commit `1f259ca`.
- The staging run turned up **two small defects** (S-1, S-2). A **proposed patch** for both was tested on a copy only. It is **not
  approved** and is **not a new release**.
- Two more points are **owner decisions** (S-3, S-4).
- The test harness itself needed a few fixes. All of them are listed in section 3.

## 1. Findings

| Id | Severity | What | Evidence | Proposed action |
|---|---|---|---|---|
| S-1 | Low (robustness; no wrong data, no security impact) | **Lock-order inversion.** A direct write to a reference table locks the row first and takes the editorial lock only inside a row trigger, while `public.ref_review` takes the editorial lock first and then the row. When the owner edits rows in the SQL editor while a decision runs on the same rows, PostgreSQL detects a deadlock after 1 s and cancels one transaction. | Reproduced on local Supabase: probe D1 (edit a draft version, then add evidence, while it is submitted) and D3 (record a private copy under rights R2, then add evidence, while R2 is retired). Both deadlocked; in each case the `ref_review` side was cancelled (40P01) and the data stayed consistent. D2 (the claim trigger takes the lock first) does not deadlock. | Patch **P1** |
| S-2 | Low (audit completeness) | **Supersession without a review event.** Publishing a new claim version retires the previous live one inside `ref_review`. That retirement appears in `change_log` but not in `review_events`, so the decision history does not say why the old version stopped being live. | C11a/C11b: `review_events` has 0 `retire` rows for the replaced version; `change_log` has 1. | Patch **P2** |
| S-3 | Owner decision | **An older version can replace a newer live one.** Publishing v1 after v2 makes v1 live and retires v2. Nothing compares `version_no` or `supersedes_version_id`. | C11b. | No patch. If the owner wants "never go back", a later migration can refuse to publish a version older than the live one, or require `supersedes_version_id` to name it. If going back on purpose should stay possible, leave as is. |
| S-4 | Owner decision (scaling) | **Decision time grows with the published total.** The fail-closed sweep (`suspend_unsound`) re-checks every published version after each publish or retire. At 10,000 published versions this is 0.7 s per publish and 1.4 s for a transitive suspension. Other editors wait for the editorial lock that long. | `STAGING_TEST_REPORT.md` section 7 (linear from 100 to 10,000). | **No change now**, as instructed (no premature optimization, no new indexes without evidence). Revisit before the reference approaches tens of thousands of published versions: a later migration could sweep only the versions that depend on what changed. |

No security finding. Every exposure, permission, escalation, forged-token, Owner-override and revocation test passed on the real stack
(`STAGING_TEST_REPORT.md` sections 4 and 5).

## 2. Proposed patch P1 + P2 (NOT APPROVED, not a release)

- **Diff:** `staging/proposed/P1_P2_lock_order_and_retire_event.diff`, against the r4 foundation file. It is 42 lines; SHA-256
  `023010462adee3c5…`. Applying it to `001_wine_reference_foundation.sql` (r4, `4493d49c5db0cd71`) gives exactly the tested copy
  (`c79a42a9c012b9e1`); this was checked with `patch` and `cmp`.

**P1: take the editorial lock before any row is locked.**
- Adds `wine_reference.lock_before_write()` and a `BEFORE INSERT OR UPDATE OR DELETE ... FOR EACH STATEMENT` trigger
  (`<table>_lock_first`) on the 18 editorial tables. These are the same tables that already carry the audit trigger.
- A statement-level trigger runs before the statement touches any row. Direct writes and `ref_review` therefore take the locks in the
  same order.
- The lock is transaction-scoped and re-entrant, so `ref_review`'s own updates are unaffected.
- **Trade-off for the owner:** while a decision runs, a direct write in the SQL editor now waits for it; while a SQL-editor transaction
  that wrote reference rows is still open, decisions through the app wait for it, and give up after the API's 8 s timeout. In practice:
  keep hand edits in short transactions (the SQL editor commits each run).
- **Does not change the locking design** (same single lock, same order inside `ref_review`). It only extends the existing lock to the
  start of direct writes, where S-1 showed the order was not kept.

**P2: record the automatic retirement.**
- When `ref_review` publishes a claim version, it first inserts one `retire` review event per live version it is about to retire.
- The event has the same actor, `owner_override = false`, and the note "replaced by the publication of version <id>". It changes no
  status rule.

**Before either could become a release**, the owner and the reviewer would need to approve it. The release label `001 r4 (2026-11-01)`
would then change in the foundation, in 001a's preflight and in the verify script, and `DESIGN.md` section 8 would get new
fingerprints. The release label was kept unchanged in the tested copy, so that 001a and the verify script run unmodified; that is the
only reason. **This copy is not a release.**

### Tests re-run with the patched copy (local Supabase, fresh databases)

| Suite | r4 as committed | r4 + P1 + P2 (copy) |
|---|---|---|
| Compatibility, behaviour, verify, preflight, rollback (`run_compat.sh`) | 283 passed, 0 failed | 283 passed, 0 failed |
| Concurrency C1–C12 and probes D1–D3 (`run_concurrency.sh`) | 27 passed, 0 failed; **D1 and D3 deadlock** | 27 passed, 0 failed; **no deadlock**: in D1 and D3 the decision waited about 2.2 s and went through |
| Supersession audit (C11a, C11b) | 0 `retire` events for the replaced version | 1 `retire` event each |
| Real Auth + Data API (`run_api.sh`) | 113 passed, 0 failed | 113 passed, 0 failed |
| Performance at 1,000 / 10,000: publish / retire / transitive (ms) | 59 / 64 / 127; 751 / 706 / 1,472 | 89 / 63 / 149; 704 / 672 / 1,373 (single runs; the difference is within run-to-run noise) |

## 3. Changes made to the test harness (staging only)

None of these changed a migration file.

| Change | Why |
|---|---|
| New folder `docs/reference/migration_001/staging/` (runners, stand-ins, fixture additions, inventory query, proposed patch) | Phase 2.0B.4; the existing `tests/` scripts are unchanged |
| `prereq_compat.sql` generated from `tests/stub_supabase.sql` line 21 onward | Supabase already provides the roles, the `auth` schema, `auth.uid()` and the default privileges that lines 1–20 create on plain PostgreSQL; `postgres` may not replace `auth.uid()` there |
| `run_concurrency.sh` reads scenarios C1–C10 from `tests/concurrency_tests.sh` at run time and gives each scenario a fresh `supabase db reset` instead of a template database | A template copy of Supabase's `postgres` database is not possible while Auth and the Data API are connected to it |
| Fix: the concurrency runner's `q` helper shadowed the library's (one argument vs two) | The first run stopped silently; found and fixed before any result was recorded |
| Fix: `security_inventory.sql` needed a `::text` cast on `defaclobjtype` | Query error on PostgreSQL 17 |
| Fix: three API checks were wrong, not the migration | (a) The "suspended version is never published again" check expected the word "suspended", but an already published version is refused earlier ("Cannot publish a row that is verified"); the check now accepts any refusal, and two checks were added: the suspension cannot be lifted in SQL, and the version can still be retired. (b) The timeout follow-up reused a row an earlier rolled-back step had left pending; it now uses its own draft, written before the lock is held. (c) After the API tests, verify's "no role other than owner holds a ref_* permission" check is FAIL **on purpose** (the staging-only roles hold them); the runner now asserts that verify reports it. |
| Scratch configuration: `enable_anonymous_sign_ins = true` | Production lets guests sign in anonymously |

## 4. Not done, as instructed

- No production connection or credential.
- No hosted project; no link or push.
- r4 not edited.
- No release declared.
- Locking design not changed.
- No index or optimization added.
- `reference_enabled` changed only on the local database.
- No Migration 002, no bulk content, no app change.

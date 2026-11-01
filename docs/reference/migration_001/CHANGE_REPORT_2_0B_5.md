# Migration 001 release candidate r5: change report (Phase 2.0B.5, 2026-11-01)

**Release candidate `001 r5 (2026-11-01)`. Not approved, not run on the live database.** It replaces r4 as the candidate. r4 was never
run live.

r5 corrects the confirmed findings of the Phase 2.0B.4 local Supabase run (`STAGING_TEST_REPORT.md`, `STAGING_CHANGE_REPORT.md`):
- **S-1:** the lock-order deadlock.
- **S-2:** the missing audit row when an automatic retirement happens.
- **S-5:** found while checking S-1's coverage: TRUNCATE could get round the row rules.

It also adds the smallest rule for **S-3**, so that an older version cannot silently replace a newer one; the owner must confirm it. It
leaves **S-4** (scaling) documented, and unchanged as instructed.

**Results.**
- Local PostgreSQL 16: 353 passed, 0 failed.
- Local Supabase stack, PostgreSQL 17: 335 compatibility, 20 concurrency and 113 real-API checks passed, 0 failed. All three performance
  runs completed.
- Nothing was skipped (see "Validation" for the limits).

## 1. Files

**SHA-256 fingerprints** (first 16 hex characters):

| File | r4 | r5 | Changed |
|---|---|---|---|
| `001_wine_reference_foundation.sql` | `4493d49c5db0cd71` | `62b801e9f82929e1` | yes |
| `001a_reference_permissions.sql` | `0a5878c04707e084` | `0f7b14de0152c2a8` | yes (release label in its preflight only) |
| `001_verify.sql` | `3951eeb9bc39b18d` | `d23b64fdc065a9ea` | yes (release label; 4 new checks, now 28 rows) |
| `001_rollback.sql` | `af80fc11000f6fc1` | `af80fc11000f6fc1` | no |
| `001a_rollback.sql` | `cc997dca39ac806c` | `cc997dca39ac806c` | no |
| `owner_role_check.sql` | `e911b62ebfba298b` | `e911b62ebfba298b` | no |

**Tests:**
- New: `tests/001_r5_tests.sql`.
- Changed:
  - `tests/run_local_tests.sh` runs the r5 tests on their own database.
  - `tests/concurrency_tests.sh` adds C11a, C11b, C12 and D1–D3.
  - `tests/concurrency_fixture.sql` adds F11 (version 3 of claim K2) and R2 (rights that allow copying).

**Staging runners:**
- `staging/run_concurrency.sh` now takes every scenario from the repository suite.
- `staging/fixture_extra.sql` was removed; its rows moved into the shared fixture.
- `staging/run_compat.sh` runs the r5 tests.
- Labels changed in the other runners.

**Documents:** `DESIGN.md` (new section 4d, decisions 14–16, the checklist's fingerprints and counts), `DATA_DICTIONARY.md` (regenerated
from a tested r5 install, plus the new rules), `TEST_REPORT.md`, `STAGING_TEST_REPORT.md` (section 12), `WINE_REFERENCE_BRIEFING.md`,
`docs/HANDOFF.md`, `docs/BRANCHES.md`, `CLAUDE.md` (pointer).

**Rollback:** the scripts are unchanged and behave the same. `001_rollback.sql` drops the schema, which removes the new triggers and
functions with it. It refuses while content exists or while 001a is in place (re-tested on r5).

## 2. S-1: lock-order deadlock (corrected)

**Review of the 2.0B.4 proposed patch P1.**
- **Lock order.** A `BEFORE ... FOR EACH STATEMENT` trigger runs before the statement reads or locks any row. PostgreSQL fires row-level
  BEFORE triggers only after it has locked the row. So taking the editorial lock in a statement trigger puts it **before** every row lock
  of that statement, and of every later statement in the transaction (the advisory lock is held until commit).
- **Verified by test:** a write statement that matches no row still holds the lock afterwards. On Supabase, D1 and D3 no longer deadlock.
- **Coverage.** All 18 editorial tables, for INSERT, UPDATE and DELETE. These are the same tables that carry the audit trigger: entities,
  names, taxonomy (domains, nodes, assignments), relationship and attribute types, rights statements, sources, source versions, claims,
  claim versions, dependencies, evidence, and the four controlled lists.
  - `review_events` and `change_log` are written only by the reference's own functions, so they need no lock; they refuse updates and
    deletes, and now also TRUNCATE.
  - `schema_migrations` is written only by the migration scripts.
  - Direct SQL edits (the owner's SQL editor) go through exactly these triggers.
- **No new deadlock.** Every path now takes the editorial lock first: `ref_review` explicitly, direct writes by trigger.
  - Remaining edge, documented in DESIGN.md 4d: a transaction that first locks rows with a plain `SELECT ... FOR UPDATE` and only then
    writes can still wait in the other order. PostgreSQL detects that and cancels one side, as before.
  - `check_source_copy`'s shared row lock on the rights statement now comes after the editorial lock, so the D3 cycle cannot form.
- **No recursion.** `lock_before_write()` only waits for the lock. It reads and writes no table, so it cannot fire any trigger. Taking
  the lock again inside the same transaction (`ref_review`, row triggers) returns at once.
- **No privilege change.** The function is not security definer and runs with the writer's own rights. Its search path is empty.
  Execution is revoked from PUBLIC with every other reference function. anon and authenticated still have no USAGE on the schema
  (verified by the local and Supabase runs).

**Applied:** P1 as reviewed (unchanged in substance, with comments).

**Trade-off for the owner.**
- While a decision runs, a hand edit in the SQL editor waits for it.
- While an SQL-editor transaction that wrote reference rows is open, decisions through the app wait for it; after Supabase's 8 s
  timeout they give up (measured: 57014 after 8.0 s).
- In practice, keep hand edits short. The SQL editor commits each run.

## 3. S-5: TRUNCATE (new, corrected)

**The gap.** TRUNCATE does not fire row triggers. The database owner could therefore empty `review_events` or `change_log` (both meant to
be append-only), or remove frozen approved rows, without any rule running. This came to light while checking which operations S-1's
lock covers.

**The fix.** A `BEFORE TRUNCATE` statement trigger (`refuse_truncate()`, error 42501) on the 20 reference tables, all but
`schema_migrations`.

**Tested.** TRUNCATE is refused on the history, the change log, evidence and dependencies, and with CASCADE on entities. Nothing is lost.

**Limit.** Nothing in a database stops an owner who deliberately disables triggers; that stays outside any rule (unchanged).

## 4. S-2: audit of the automatic retirement (corrected)

**What changed.** When `ref_review` publishes a claim version, it retires the previous live version of the same claim. In r5 it first
inserts one `retire` review event for that version:
- `target_table` `claim_versions`, from `verified` to `retired`;
- `actor` = the person publishing (the initiating decision);
- note `replaced by the publication of version <id>`;
- `owner_override` false.

It is written just before the publish event, in the same transaction, with the same time.

**No duplicates.** The unique index allows at most one live version per claim, and that version is retired in the same step, so it
cannot be retired twice. An explicit retirement of a version that is already retired is refused, as before.

**Tests.**
- Exactly one event, with the right actor, note, statuses and order.
- A first publication writes none.
- C11a confirms all of this under concurrency.
- Two new verify rows: every version retired after publication has a retire event, and none has two.

**`change_log` is unchanged** and still records the row change (tested).

## 5. S-3: older versions (policy; smallest rule built; owner to confirm)

**What exists.**
- `version_no` is unique per claim and at least 1. No order is enforced between versions.
- `supersedes_version_id` is optional and informational.
- Publishing a version retires the claim's live version, whatever its number.
- A version can be published only from verified-and-unpublished. Once published and retired, it can never be published again; that is
  unchanged.
- So the "historical" case is an older version that was approved but never published, published after a newer one. On r4 it replaced
  the newer one silently (C11b).

**Smallest rule (built in r5).** `ref_review` refuses to publish a claim version while a newer version (higher `version_no`) of the same
claim is published and not retired, whether live or suspended. The error says how to proceed.

**Forward publication versus intentional restoration**, without any new workflow:

| | How it works |
|---|---|
| Forward publication | Unchanged: publishing a newer version retires the older live one (with the S-2 event) |
| Intentional restoration | Two existing decisions, both recorded: first retire the newer version (`ref_review ... 'retire'`, with a note giving the reason), then publish the older approved version. Or write the older content as a new, higher-numbered version and send it through review |
| Suspended newer version | It also blocks: the deliberate step is to retire it first |

**Tests.**
- An older version is refused while a newer one is live, also for the Owner, and while a newer one is suspended but not retired.
- Retire-then-publish restoration works, and the history shows the explicit retirement with its note.
- C11b: v3 first, then v1 at the same moment → v1 refused.

**Owner decision (DESIGN.md decision 14).** Keep this rule, or choose:
- **(a) Stricter:** once a newer version has ever been published, an older one never is; restoration only as a new version.
- **(b) Looser:** remove the rule and return to r4 behaviour.

After the live run, any change would be migration 002.

## 6. S-4: scaling (documented, not changed)

**Measured on r5** (local Supabase, 4 vCPU, one run each). r4 and the 2.0B.4 copy were within run-to-run noise of these figures.

| Operation (ms) | n = 100 | n = 1,000 | n = 10,000 |
|---|---|---|---|
| Publish | 11.2 | 70.0 | 747.0 |
| Retire one version | 8.3 | 65.2 | 755.9 |
| Retire a source version (transitive suspension) | 24.6 | 132.8 | 1,376.0 |

**What drives it.** The cost is the fail-closed sweep in `suspend_unsound`, which re-checks every published version.

**Extrapolation (assumption).** The 8 s API timeout would be reached at around 100,000 published versions.

**Recommendation.** A later migration should narrow the sweep to the versions that depend on what changed, before the reference gets
near that size (DESIGN.md decision 15). The measurements are kept in `STAGING_TEST_REPORT.md` sections 7 and 12.

## 7. Validation

| Suite | Where | Result |
|---|---|---|
| Full local suite (`tests/run_local_tests.sh`): install, replay, verify, compatibility, behaviour, r5 regression, preflight and drift, 001a, rollbacks, concurrency | PostgreSQL 16.15 | **353 passed, 0 failed** |
| Control: the updated concurrency suite on the unchanged r4 SQL | PostgreSQL 16.15 | 15 passed, **5 failed as expected** (C11a, C11b, D1 ×2, D3) |
| Compatibility suite (`staging/run_compat.sh`): the same checks plus the r5 regression tests, each database a fresh `supabase db reset` | local Supabase, PostgreSQL 17.11 | **335 passed, 0 failed** |
| Concurrency (`staging/run_concurrency.sh`): C1–C12 and D1–D3, deadlock reproductions included | local Supabase | **20 passed, 0 failed**; no deadlock |
| Real Auth and Data API (`staging/run_api.sh`): exposure, grants, escalation, forged tokens, roles, Owner override and revocation, read door, lifecycle, audit, timeouts | local Supabase | **113 passed, 0 failed**; verify 28 of 28 after 001 and after 001a |
| Performance (`staging/run_perf.sh`) | local Supabase | 3 of 3 runs completed (section 6) |

**Images used** (the same digests as Phase 2.0B.4, pulled this time from Docker Hub): `supabase/postgres:17.11.0.006` (c141fd17ac6a…),
`supabase/gotrue:v2.197.0` (1736a63078f5…), `postgrest/postgrest:v16.5` (1347d7552b88…), `kong:2.8.1` (1b53405d8680…).

**Limits.**
- The real-API suite has no S-2 or S-3 check of its own. Those paths are the same database function, tested directly on Supabase.
- Production's own role functions and grants are still stand-ins.
- Two sessions with fixed timings, not load.
- No clock change to expire names.

## 8. Not done, as instructed

- Not connected to production.
- No live migration.
- `reference_enabled` changed only on local test databases, never in production.
- Migration 002 not started.
- No app file changed.
- The release candidate is not declared approved.

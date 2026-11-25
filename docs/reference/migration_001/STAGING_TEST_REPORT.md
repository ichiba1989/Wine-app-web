# Migration 001 r4 on a local Supabase stack: staging test report (Phase 2.0B.4, 2026-11-01)

> **Update (Phase 2.0B.5):** the release candidate r5 was run on the same stack; see section 12.

**Summary.** Migration 001 r4 was run unchanged on a disposable Supabase stack inside the cloud work container (PostgreSQL 17.11 as
Supabase builds it, real Supabase Auth, the Data API (PostgREST) and GraphQL). It installed, replayed, verified and rolled back cleanly,
and every security, lifecycle, concurrency and rollback test passed: **423 checks, 0 failures** (283 compatibility, 27 concurrency, 113
real-API), plus the three performance runs. The existing plain-PostgreSQL suite was also re-run: 294 passed, 0 failed.

The tests found **two real defects**, both small, and no security hole. Proposed patches are in `STAGING_CHANGE_REPORT.md`; they are
tested but **not approved**, and r4 itself was not changed.

- **Lock order (S-1).** A direct table write (the owner's SQL editor) and a decision through `ref_review` can deadlock. PostgreSQL cancels
  one of the two transactions; no data goes wrong.
- **Audit gap (S-2).** When a new version is published, the old live version is retired automatically, but this retirement is written
  only to `change_log`, not to `review_events`.

There are also two owner decisions (S-3, S-4) and some production checks that a local stack cannot do (section 10).

**Nothing touched production.** Not connected, no production credential read, no hosted project created, no `link` or `db push` run,
`reference_enabled` not changed on production, Migration 002 not started.

| Category | Status |
|---|---|
| 1. Environment isolation | PASS (notes in section 1) |
| 2. Realistic Supabase environment | PASS (real components vs recreated stand-ins listed in section 2) |
| 3. Installation, exposure, grants, replay, drift, 001a | PASS |
| 4. Authentication and authorization with real local Auth | PASS |
| 5. Lifecycle | PASS |
| 6. Concurrency | PASS for every invariant. **Finding S-1:** lock-order deadlock between direct writes and `ref_review` (resolved by PostgreSQL, one transaction cancelled) |
| 7. Performance smoke test | PASS (completed at 100 / 1,000 / 10,000). **Finding S-4:** decision time grows with the published total |
| 8. Rollback | PASS |
| Realtime, Storage, Edge Functions, Supavisor (pooler), Studio | NOT TESTED (excluded from the stack; the migration uses none of them) |
| Production-only items (section 10) | NOT TESTED (cannot be, by the rules of this phase) |

## 1. Environment and isolation

All values below were observed with commands run in the container.

| Item | Observed |
|---|---|
| Host | Cloud work container, Linux 6.18.44, 4 vCPU (Intel Xeon @ 2.10 GHz), 15 GB RAM, about 26 GB free disk at the end |
| Docker | Client and engine 29.9.2. The engine was not running at first and was started by hand (`dockerd`, as the container's root user). The container already had those rights; no security setting was changed |
| Compose | v5.6.1 |
| Supabase CLI | 2.122.0 from npm, installed in a scratch folder (never in the repository) |
| Images | `supabase/postgres:17.11.0.006` (sha256:c141fd17ac6a…), `supabase/gotrue:v2.197.0` (sha256:1736a63078f5…), `postgrest/postgrest:v16.5` (sha256:1347d7552b88…), `kong:2.8.1` (sha256:1b53405d8680…); `supabase/realtime:v2.147.1` and `supabase/storage-api:v1.84.19` were pulled because the CLI uses them while preparing the database |
| Where images came from | The CLI's default registry (public.ecr.aws) is blocked by the container's network proxy (HTTP 403), and Docker Hub refused because the shared address had used up its anonymous pull allowance (HTTP 429). The images were pulled from Google's public Docker Hub mirror (`mirror.gcr.io`) and tagged with their Docker Hub names. The digests above are those images |
| Services running | Database, Auth (GoTrue), Data API (PostgREST), gateway (Kong). Excluded: realtime, storage, imgproxy, mailpit, postgres-meta, studio, edge-runtime, logflare, vector, supavisor |
| Ports | 54321 (API gateway) and 54322 (database), on the container's own interfaces; the cloud container is not reachable from outside |
| Privileges | No container ran privileged; seccomp default profile; cgroup v1; overlayfs |
| Credentials | Only the local stack's own throwaway keys (from `supabase status -o env`), kept in a chmod-600 file in the scratch folder. They are not in the repository, the reports or the ZIP, and no script prints them |
| Remote-target safety | Every runner refuses to start if the scratch project was ever linked (`supabase/.temp/project-ref`) or if the database container is not local. The API test refuses any URL that is not 127.0.0.1 or localhost. No `supabase link`, `db push`, `db pull` or `--linked` command was run |
| Scratch configuration changes | `enable_anonymous_sign_ins = true` (production lets guests sign in anonymously). Nothing in the repository's own Supabase configuration (`config.js`) was touched |

## 2. What was real and what was recreated

| Real (from the local Supabase stack) | Recreated stand-ins (synthetic; production bodies were not read) | Needs production verification |
|---|---|---|
| PostgreSQL 17.11 built by Supabase, with its extensions and event triggers (`pgrst_ddl_watch`, `pgrst_drop_watch`, `issue_graphql_placeholder`, `issue_pg_graphql_access`, `issue_pg_cron_access`, `issue_pg_net_access`) | `public.verification_status` and `public.user_role` enums (values from `FINDINGS.md`) | The real bodies of `my_staff_role_code()` and `has_permission()` (`owner_role_check.sql`, read-only) |
| The roles `postgres` (not superuser, bypassrls), `anon`, `authenticated`, `service_role`, `authenticator`, `supabase_admin` and their settings: `authenticated` statement_timeout 8 s, `anon` 3 s, `authenticator` lock_timeout 8 s | `app_config` and `cfg_number()` (copied from `docs/import_limit.sql`) | Which schemas the production Data API exposes (Dashboard, API settings): `wine_reference` must not be listed |
| `auth.users`, sign-up, anonymous sign-in, real access tokens (HS256), `auth.uid()` reading both `request.jwt.claim.sub` and `request.jwt.claims` | `staff_roles` with the three production rows (as read on 2026-10-26) **plus three staging-only roles** (`staging_ref_editor`, `staging_ref_reviewer`, `staging_ref_publisher`) so that Editor, Reviewer and Publisher could be tested apart from the Owner | The production `profiles` grants and policies (the realistic run assumes column-level UPDATE for `authenticated` on name and consent columns only, as documented) |
| PostgREST 16.5 through Kong, with the default exposed schemas (`public`, `graphql_public`); pg_graphql | `profiles` with the live columns, the documented policies and grants, and a synthetic `handle_new_user` sign-up trigger | `rls_auto_enable()` exists on production but not locally (the migration creates no table in `public`, so it should not matter) |
| Supabase's default privileges in `public` (new tables, functions and sequences granted to anon, authenticated and service_role, as on production) | `my_staff_role_code()`, `has_permission()`, `is_editor()` written from the documented rules (`docs/roles_proposal.sql`, `docs/ROLES_AND_ACCESS.md`) | `pg_trgm` is in `public` on production and absent locally: added by the stand-ins |
| | Two catalog stand-ins (`wines`, `wine_vintages`) holding rows, to prove they stay untouched | The production timeouts (assumed to be Supabase's defaults, as observed here) |

Two sets of stand-ins were used:
- **Compatibility** (`staging/prereq_compat.sql`): the same stand-ins the plain-PostgreSQL suite uses, minus the parts Supabase really
  provides. The unchanged behaviour and concurrency suites need it (permissions from a test table).
- **Realistic** (`staging/prereq_realistic.sql`): permissions come from real staff roles held by real Auth users.

## 3. Commands (sanitized)

All commands ran in a scratch folder outside the repository. `<scratch>` stands for that folder.

```
npm install supabase@2.122.0                        # in <scratch>/cli; nothing added to the repository
supabase init                                       # in <scratch>/project (project_id "wine-ref-staging")
docker pull mirror.gcr.io/supabase/<image>:<tag>; docker tag ... <image>:<tag>     # see section 1
supabase start -x realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
supabase status -o env > <scratch>/local_env.secret; chmod 600 ...      # local keys only, never printed
export SB_PROJECT_DIR=<scratch>/project SB_CLI=<scratch>/cli/node_modules/.bin/supabase SB_ENV_FILE=<scratch>/local_env.secret
bash docs/reference/migration_001/staging/run_compat.sh        # sections 4, 5, 8
bash docs/reference/migration_001/staging/run_concurrency.sh   # section 6
bash docs/reference/migration_001/staging/run_api.sh           # sections 4 and 5 through the real API
bash docs/reference/migration_001/staging/run_perf.sh          # section 7
FOUNDATION=<scratch>/patched/001_wine_reference_foundation.sql bash .../run_compat.sh; ... run_concurrency.sh   # proposed patch, STAGING_CHANGE_REPORT.md
bash docs/reference/migration_001/tests/run_local_tests.sh     # the existing plain-PostgreSQL suite (294)
supabase stop --no-backup                                      # at the end: deletes the local databases
```

Each database is a fresh `supabase db reset --local` (about 20 s). SQL runs as `postgres`, the role the Supabase SQL editor uses, via
`docker exec` into the local database container.

## 4. Installation, exposure, grants, replay, drift and 001a: PASS

Exact files tested (SHA-256, first 16 hex characters; they match `DESIGN.md` section 8):

| File | Hash |
|---|---|
| `001_wine_reference_foundation.sql` | `4493d49c5db0cd71` |
| `001a_reference_permissions.sql` | `0a5878c04707e084` |
| `001_verify.sql` | `3951eeb9bc39b18d` |
| `001_rollback.sql` | `af80fc11000f6fc1` |
| `001a_rollback.sql` | `cc997dca39ac806c` |
| `owner_role_check.sql` | `e911b62ebfba298b` |

Commit: `1f259ca3f1e5c29ab150c6220a14e01efd4da202`.

| Test | Result |
|---|---|
| Fresh install as Supabase's `postgres` role (not superuser) | PASS, no error (only "does not exist, skipping" notices from drop-if-exists) |
| `001_verify.sql` straight after install, then after 001a | 24 of 24 PASS each time (realistic run); 24 PASS in the compatibility run |
| Replay | Runs; 0 structure changes (every object identical); no duplicate seed rows |
| Public schema | Unchanged except the two `ref_*` functions. Realistic `profiles`, its policies and grants, and the stand-in catalog rows untouched |
| Data API, schema not served | `Accept-Profile: wine_reference` refused with 406 / PGRST106 for anon, a player and the Owner; `Content-Profile: wine_reference` (calling its functions) refused the same way; no reference table under `public` (404); the API description does not name it |
| GraphQL | Introspection as a visitor and as the Owner shows no reference type |
| Browser roles | No table grant to anon, authenticated, service_role or PUBLIC; no USAGE on the schema for anon, authenticated, service_role or authenticator; direct SQL as anon and as authenticated (a player, and the Owner) refused for selects, inserts, the view and the internal functions |
| EXECUTE | anon may execute exactly `public.ref_published_names`; authenticated exactly that and `public.ref_review`; nothing in `wine_reference` |
| Ownership, search path, RLS | Schema, 21 tables, the view and every function owned by `postgres`. All 21 tables have row-level security on and no policies. Every SECURITY DEFINER function, and every other reference function, has `search_path=""` |
| Default privileges | Supabase grants new objects in `public` to the API roles. The migration revokes them on its two public functions and grants only what it means to (observed ACLs above). `wine_reference` has its own revokes |
| Drift and preflight (each on a fresh database) | Stops and changes nothing on: a foreign `public.ref_lookup`; an orphan `ref_review` with no schema; a hand-added column (drift); an edited release; an unregistered schema; a missing `my_staff_role_code()` (nothing created) |
| 001a separately | Refuses before 001; runs after 001 and again; gives the Owner role the four `ref_*` permissions once; Editor and Quiz reviewer unchanged; a partial manual undo is refused and reported FAIL by verify |
| Read-only `owner_role_check.sql` | Runs inside a read-only transaction on Supabase and finds the role lookup |

## 5. Authentication, authorization and lifecycle with real local Auth: PASS

**Users and decisions.**
- Users: eight synthetic accounts signed up through Supabase Auth (addresses `...@staging.invalid`) and one anonymous guest. Each new
  user received a player profile from the recreated sign-up trigger.
- Staff roles were set in SQL, as the owner would: production `editor` and `owner`, an older account with role `admin`, and the three
  staging-only roles.
- Every decision below went through `POST /rest/v1/rpc/ref_review` with the person's real token. Drafts were written in SQL as the
  database owner, with the author recorded; that is how drafts are written on production too, since no write door exists.

| Case | Result |
|---|---|
| Signed-out visitor | May call `ref_published_names` (empty while the switch is 0; also with the new `sb_publishable_` key); `ref_review` refused 401 / 42501 |
| Guest, player, production Editor (no `ref_*` permission) | `ref_review` refused: "Not allowed: needs ref_edit" (403) |
| Editor (`ref_edit` only) | Submits 17 drafts; cannot approve |
| Reviewer (`ref_review`) | Approves rows written by someone else; cannot approve rights (needs `ref_rights`); cannot publish |
| Publisher (all four, not Owner) | Approves rights; publishes; **cannot approve their own row** (403, two-person rule) |
| Owner | Approves their own name and entity through the API. Each approval is recorded with `owner_override = true` and the Owner as actor. None of the 39 ordinary decisions carries the flag |
| Override limits (the Owner's self-approved versions) | Publication refused for: no evidence; evidence only from an unapproved source version; a quote under rights that forbid quoting. A source version under retired rights is not approved. A sound self-approved version **is** published (the checks are not over-strict) |
| Revoked Owner, **same unexpired token** | Moved to Publisher: self-approval refused at once (author rule). With no staff role: every decision refused (needs `ref_review`). No approval recorded |
| Older account with role `admin` | Resolves to owner server-side (documented rule) |
| Escalation through the Data API (player token) | Refused 403 / 42501 for: setting own `staff_role` to owner, `role` to admin, `tier` to pro; `display_name` together with `staff_role`; inserting a profile with a staff role. Changing another person's profile: 0 rows. Rewriting `staff_roles` (player or Owner token): 0 rows, unchanged. `set_config` not callable (404). Own `display_name` still allowed. The anon key, which has table-level UPDATE on `profiles` as on production, changed nothing (row security) |
| Forged tokens | Refused 401: wrong-secret token claiming the Owner; wrong-secret `service_role`; `alg: none`; a real token whose payload was changed to the Owner |
| Direct SQL with the claims PostgREST sets (`request.jwt.claims`) | `ref_review` identifies the person the same way as with `request.jwt.claim.sub` |
| Read door (switch set to 1 **locally only**) | Returns the current names of published entities to a visitor. An ended name and a not-yet-started name of the same entity are not returned. An entity whose only name has ended is neither publishable nor returned. Switch back to 0: nothing, even to the Owner |
| Publication order | A claim version is refused before its subject and object are published, and a dependent version before the version it depends on. A source version is refused before its source is approved |
| Evidence retirement, transitive suspension | Retiring source version V suspended F and G4 (their evidence) and H (depends on F), each recorded as a `suspend` review event. None of them is current |
| Suspension is final | A suspended version cannot be published again. A suspension cannot be lifted even by the database owner in SQL. The version can still be retired |
| Frozen records and audit | Even as the database owner: an approved name cannot be edited; a status cannot be changed outside `ref_review`; `review_events` cannot be updated; `change_log` cannot be deleted |
| The full lifecycle suite (`tests/001_behaviour_tests.sql`, unchanged) | All of its cases PASS on Supabase (in the 283). They cover expired and future names, entities without a display name, dependency and relationship cycles, approved-record modification, evidence and rights retirement, audit immutability and no reinstatement |

Observed on the way (by design, not a defect): evidence from a draft source version, and a quote under rights that forbid quoting, are
accepted when written into a draft. They are refused when the version is published.

## 6. Concurrency: invariants PASS; one lock-order finding

Each scenario started from a fresh database. Session 1 holds its transaction 1.5 s; session 2 starts 0.4 s later with a 20 s timeout.

| Scenario | Result |
|---|---|
| C1a/b, C2a/b, C3a/b, C4a, C5–C10 (the repository's own scenarios, taken unchanged from `tests/concurrency_tests.sh`) | 12 of 12 PASS on Supabase; session 2 waited about 1.2 s for the editorial lock, as designed |
| **C11a** (new): two approved versions of the same claim (v1, v2) published at the same time, v1 first | PASS: both succeed one after the other (session 2 waited 1.23 s). Exactly one live published version, and it is current. The first one is retired. Each publication is in `review_events` once. The retirement is in `change_log`, **but has no `review_events` row (S-2)** |
| **C11b** (new): the same, v2 first | PASS on the same invariants. **Note S-3:** v1 published after v2 replaced it; nothing stops an older version from replacing a newer live one |
| **C12** (new): the same version published twice at once | PASS: one publication, the second refused ("Cannot publish a row that is verified") |
| **D1** (new probe): the owner edits draft version F9 in SQL (row lock, no editorial lock), waits, then adds evidence (takes the editorial lock); meanwhile `ref_review` submits F9 (editorial lock, then row lock) | **DEADLOCK detected** by PostgreSQL after `deadlock_timeout` (1 s); the `ref_review` transaction was cancelled (40P01), the owner's edit committed. Data consistent (draft, 1 evidence row, no unsound version) |
| **D2** (new probe): the owner edits a draft claim (its trigger takes the editorial lock first) then adds evidence while the version is submitted | No deadlock: the submit waited 2.2 s and went through |
| **D3** (new probe): the owner records a private copy under rights R2 (the copy check takes a shared row lock on R2), waits, then adds evidence; meanwhile `ref_review` retires R2 | **DEADLOCK detected**; the retirement was cancelled, the copy committed. Data consistent |
| Waiting through the API is bounded | With the editorial lock held 14 s in SQL, a decision through the Data API was cut off after 8.0 s (57014, Supabase's 8 s timeouts for `authenticated` / `authenticator`); after the lock was released the next decision went through in 0.01 s |
| Other unprotected cross-row operations | Every path that changes status goes through `ref_review`, which takes the editorial lock first. The one remaining inversion is between direct table writes (owner-only, SQL editor) and `ref_review`, covered by D1 and D3 |

**S-1 in plain words.** If the owner edits reference rows by hand in the SQL editor while someone else makes a decision, and the two touch
the same row in opposite order, PostgreSQL stops one of them after one second with "deadlock detected". Nothing is half-done: that
transaction is rolled back and can simply be run again.

The cause: the editorial lock is taken inside row triggers, and PostgreSQL locks the row before a row trigger runs. A direct write can
therefore hold a row and then wait for the editorial lock, while `ref_review` holds the editorial lock and waits for the row.

`STAGING_CHANGE_REPORT.md` proposes taking the lock in a statement-level trigger before any row is touched (P1). The locking design in
r4 is unchanged.

## 7. Performance smoke test: PASS

**Method.** One run per size, with no warm-up, on the shared 4-vCPU container described in section 1. The database ran with
`shared_buffers` 128 MB and `work_mem` 4 MB.

The rows were synthetic ("Perf place 1" ...). They were built as already published inside the review flag, which is a test shortcut:
every trigger still runs. The measured operations go through `ref_review` as in production.

| Measure (ms unless stated) | n = 100 | n = 1,000 | n = 10,000 |
|---|---|---|---|
| Build the published set (s) | 0.09 | 0.55 | 5.25 |
| Submit / approve one version | 2.7 / 0.9 | 3.0 / 0.9 | 4.4 / 1.3 |
| Publish a new version (retires the old one, then the fail-closed sweep) | 10.5 | 59.0 | 751.1 |
| Retire one version | 7.9 | 63.6 | 705.9 |
| Retire a source version: transitive suspension of about 100 versions, incl. a 10-deep dependency chain | 23.2 | 126.8 | 1,472.1 |
| Name lookup through `ref_published_names` as a visitor: substring / no match / first 50 | 0.46 / 0.18 / 1.67 | 2.22 / 1.62 / 0.55 | 1.35 / 9.50 / 0.57 |
| Taking the editorial lock uncontended | 0.005 | 0.003 | 0.003 |
| Database size (MB) | 13.9 | 20.2 | 82.3 |

**S-4.**
- **Observed:** publish and retire take time roughly in proportion to the number of published versions, because the fail-closed sweep
  (`suspend_unsound`) re-checks every published version. Another editor waits for the editorial lock that long.
- **Extrapolation (an assumption, not measured):** at about 100,000 published versions a decision would take roughly 7 to 8 s and reach
  the Data API's 8 s timeout.
- **Not optimized**, as instructed: there is no evidence that this volume is near. A later migration could limit the sweep to the
  versions that depend on what changed.
- Name lookups stay under 10 ms at 10,000 names (the "no match" case scans every name).

## 8. Rollback: PASS (fresh databases)

| Test | Result |
|---|---|
| 001 rollback while the reference holds content | Refused ("Refusing to roll back") |
| 001 rollback on an empty install | Runs; schema gone; the public schema exactly as before; re-install works |
| 001 rollback while 001a is in place | Refused ("run 001a_rollback.sql first") |
| 001a rollback | Runs, and runs again. Removes every `ref_*` permission from **every** role, including one added by hand to Editor, and unregisters 001a. All other permissions keep their order (Owner, Editor, Quiz reviewer compared exactly). 001a runs cleanly again afterwards |
| Full order: 001a rollback, then 001 rollback | Works. Existing app rows (staff roles, profiles, stand-in wines and vintages, app_config, the three role functions) and the public schema are identical to the state before 001 |

## 9. Compatibility differences found (local Supabase vs plain PostgreSQL 16 and vs production)

- **PostgreSQL 17.11 vs 16.15.** Same results; no change needed.
- **Supabase's `postgres` is not a superuser.** The migration installs and rolls back fine as that role. The behaviour suite's
  `set local role authenticated` works because `postgres` is a member of the API roles.
- **Event triggers.** Supabase's six event triggers fire on the migration's DDL with no effect on it. Production also has
  `rls_auto_enable`, absent here.
- **Timeouts.** Supabase sets an 8 s statement timeout on `authenticated` (3 s on `anon`) and an 8 s lock timeout on `authenticator`.
  They bound every wait for the editorial lock through the API. They do **not** apply to the SQL editor (`postgres`, no timeout).
- **`auth.uid()`.** It reads `request.jwt.claim.sub` and, failing that, `request.jwt.claims`. Both work with `ref_review`.
- **`service_role`.** It has bypassrls but no USAGE on `wine_reference`. Server-side code using the secret key cannot read the reference
  either, which is intended; any future tool would need its own grant (owner decision).
- **`pg_trgm`.** Not installed on a fresh stack (it is on production); the stand-ins add it.
- **Keys.** The new `sb_publishable_...` key works like the old anon key for the read door.

## 10. Production-only requirements (cannot be checked locally)

1. Run the read-only `owner_role_check.sql` on production. It shows the real `my_staff_role_code()` and `has_permission()`, who holds the
   Owner role, and the `profiles` grants.
2. Confirm in the Dashboard (API settings) that the exposed schemas do **not** include `wine_reference`. Run `001_verify.sql` right after
   the migration; all 24 rows must be PASS.
3. Confirm that production's `authenticated` has no table-level UPDATE on `profiles` and only column-level UPDATE on name and consent
   columns, and that `profiles` policies limit updates to the person's own row. The realistic test assumed both (documented, not read).
4. Take a backup (or note the point-in-time-recovery window) before running 001, and run it in the SQL editor in one go.
5. Keep `reference_enabled` at 0 until the owner decides; it was set to 1 only on the local staging database.
6. Supavisor (connection pooler): the editorial lock is transaction-scoped (`pg_advisory_xact_lock`), so it is safe with transaction-mode
   pooling. This was not tested here because the pooler was excluded.

## 11. Files

- **Test files:** in `docs/reference/migration_001/staging/`:
  - `sb_lib.sh`: the shared helpers and the remote-target refusal.
  - the stand-ins: `prereq_compat.sql`, `prereq_realistic.sql`, `staging_roles.sql`;
  - the runners: `run_compat.sh`, `run_concurrency.sh`, `run_api.sh` with `api_tests.py`, `run_perf.sh` with `perf.sql`;
  - `fixture_extra.sql` (for C11 and D3) and the read-only `security_inventory.sql`;
  - `proposed/`: the proposed patch.
- **Outputs:** in the review ZIP (`results/`). They contain test identifiers only, no keys.

## 12. Release candidate r5 on the same stack (Phase 2.0B.5, 2026-11-01)

**Set-up.**
- The local stack was started again in a new session: Docker 29.9.2, the same CLI and project.
- The images came straight from Docker Hub this time, with the **same digests** as in section 1.
- The r5 files were tested exactly as committed: foundation `62b801e9f82929e1`, 001a `0f7b14de0152c2a8`, verify `d23b64fdc065a9ea`;
  the rollbacks and `owner_role_check.sql` are unchanged.
- Every database was again a fresh `supabase db reset --local`.

| Suite | r4 (sections 4 to 8) | r5 |
|---|---|---|
| Compatibility (`run_compat.sh`), now with the r5 regression tests (`tests/001_r5_tests.sql`) and their verify rows | 283 passed, 0 failed | **335 passed, 0 failed** (283 + 4 new verify rows + 41 regression checks + 7 verify rows after them) |
| Concurrency (`run_concurrency.sh`): all scenarios now come from `tests/concurrency_tests.sh` | 27 passed; D1 and D3 deadlocked | **20 passed, 0 failed, no deadlock** (C1–C10, C11a, C11b, C12, D1 ×2, D2, D3) |
| Real Auth and Data API (`run_api.sh`) | 113 passed, 0 failed | **113 passed, 0 failed**; verify 28 of 28 after 001 and after 001a; API waits still cut off at 8.0 s |
| Performance (`run_perf.sh`): publish / retire / transitive suspension at 10,000 (ms) | 751 / 706 / 1,472 | 747 / 756 / 1,376 (single runs; same order as r4) |

**r5 results in plain words.**
- **S-1:** the owner's SQL edits and decisions now wait for each other instead of deadlocking.
- **S-2:** a replaced version has its retire event, attributed to the publisher of the new one.
- **S-3:** an older version publishing after a newer one is refused (C11b).
- **TRUNCATE** is refused.
- Nothing else in the security, lifecycle or rollback results changed.

Details: `CHANGE_REPORT_2_0B_5.md`.

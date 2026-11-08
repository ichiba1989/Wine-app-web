# Anonymous access hardening: change report (Phase 2.0B.6, 2026-11-01)

**Status: release 2 is final and tested; it is NOT deployed** (the owner runs it from `DEPLOY.md` after approval). The text from "Release 1" onward describes the reviewed proposal.

**Release 1 status (2026-11-01): a tested proposal.**
- **Not run on the live database.** No production connection was made.
- **No app file changed.** Migration 001 r5 is untouched.
- The owner decides whether, and when, to run it (section 9).

**Results.** On a disposable local Supabase stack, with real Auth, PostgREST and the app's own data code: **293 checks passed, 0
failed**, across three phases: before, after, and after the rollback. Background and findings: `ANON_ACCESS_AUDIT.md`.


## Release 2 (2026-11-08, implementation): the final version to deploy

**What changed from the reviewed proposal** (owner's implementation brief, items 1 to 6). The sections further down describe release 1
and stay as the record.

1. **Rollback of the private schema (corrected).**
   - Release 1 ran `revoke all on schema private from public, anon, authenticated` on every run, also on the live database's existing
     `private` schema, and the rollback did not put those privileges back.
   - Release 2 leaves an existing `private` schema's privileges alone. If the schema does not exist, release 2 creates it and records
     that, and the rollback removes it again (only when empty).
   - Tested both ways: an existing `private` schema with its own grant and table is identical after up and rollback; a created one is
     gone after rollback.
2. **`profiles`:** unchanged from release 1 (`anon` nothing; signed-in users SELECT plus UPDATE of the five name, consent and age
   columns only).
3. **TRUNCATE, REFERENCES, TRIGGER, MAINTAIN** are now removed from **signed-in users too** (release 1: `anon` only), on every `public`
   table and view `postgres` owns. Nothing in the app or the repository's SQL uses them.
4. **Sequences:** `anon` loses USAGE, SELECT and UPDATE; signed-in users lose UPDATE (`setval`) and keep USAGE and SELECT, so serial ids
   still work (tested with an Editor adding a reference-list row).
5. **Default privileges for future objects:**
   - **`postgres`:** new tables give `anon` SELECT only and give signed-in users no TRUNCATE, REFERENCES, TRIGGER or MAINTAIN; new
     sequences give `anon` nothing and signed-in users USAGE and SELECT.
   - **`supabase_admin`:** the same is attempted. The SQL editor's role is not allowed to change another role's defaults (VERIFIED
     locally: "permission denied to change default privileges", as on hosted Supabase). The script reports "NOT CHANGED", carries on,
     and the rollback likewise. Only Supabase support could change `supabase_admin`'s defaults.
   - **Unchanged:** function defaults (the policy helper functions need them; R-4 below) and default privileges for all schemas.
6. **Signed-in-only functions:** as release 1 (the guard skips any function a policy or view relies on).
7. **Objects another role owns are left alone and listed.** `postgres` cannot revoke grants on objects it does not own; release 1 would
   then have failed its own postcondition.
8. **New:** `anon_hardening_verify.sql`, a read-only post-deployment check (18 rows, all PASS on a hardened database), and `DEPLOY.md`
   with the exact SQL editor steps.

**Production inventory.** The owner's live `anon_inventory.sql` result was not available in this session (not in the repository, on any
branch, or on this machine). Release 2 therefore checks at run time everything it depends on: the PostgreSQL version (MAINTAIN), which
objects `postgres` owns, which functions exist and whether a policy or view mentions them, and whether a role's defaults can be changed.
Nothing in it depends on the inventory being read first.

**Pre-deployment safety check** (`run_anon_tests.sh` on a disposable local Supabase stack, PostgreSQL 17.11, real Auth and PostgREST):
**352 passed, 0 failed**.

| Group | Result |
|---|---|
| Real API | before 86, after 89, after rollback 86 |
| The app's own code (`data.js`, `consent.js`, `visualdata.js`) | 18 in each of the three phases |
| Script-level checks: idempotence, backup, exact rollback, guard, preflight, existing `private` schema, the `supabase_admin` result, post-deployment check (18 of 18 PASS after; refuses without the hardening), and Migration 001 r5 on a hardened database (installs, 28 of 28 verify, rolls back) | 37 |

**New in this run:**
- signed-in users cannot TRUNCATE a player table, and hold no REFERENCES, TRIGGER or MAINTAIN;
- sequences: `anon` has none and `setval` is refused, while signed-in users keep USAGE;
- tables and sequences created later get the new defaults;
- a guest saves a restaurant visit, a This or That answer and a legend word (the repository's own scripts);
- an Editor adds a reference-list row; a guest and a signed-out visitor cannot.

**Bugs found and fixed before release 2 was final.**
- The `private` schema rollback gap (item 1).
- Objects not owned by `postgres` would have failed the postcondition (item 7).
- In the new post-deployment check: PostgreSQL may evaluate a sequence-privilege function before the "is a sequence" filter, so those
  calls are now wrapped in CASE.
- Two test-only issues:
  - a `setval` probe moved a counter backwards. A rollback never undoes `setval`, which is itself a baseline finding: before the
    hardening, `anon` could move any counter permanently in direct SQL;
  - a test matched an old output label.

## 1. Files

| File | SHA-256 (first 16) | What it is |
|---|---|---|
| `docs/security/anon_hardening_up.sql` | `eddd95d7b76a8c3d` (release 2; release 1 was `b2f84af614f3a995`) | The hardening, in one transaction |
| `docs/security/anon_hardening_rollback.sql` | `3a8fe229a69a3724` (release 2; release 1 was `412eb056d64b12e5`) | Puts back exactly the saved grants |
| `docs/security/anon_hardening_verify.sql` | `18be15336d981d07` | Read-only post-deployment check (release 2) |
| `docs/security/DEPLOY.md` | | The SQL editor steps |
| `docs/security/anon_inventory.sql` | `d99f96f0d8306b83` (release 1 was `6100f8ca6e61c58c`) | Read-only inventory of `anon` and `authenticated` privileges; safe on the live database |
| `docs/security/ANON_ACCESS_AUDIT.md` | | The audit |
| `docs/security/ANON_HARDENING_CHANGE_REPORT.md` | | This report |
| `docs/security/tests/` | | `prereq_app.sql` (stand-ins), `anon_api_tests.py` (real API), `app_code_tests.mjs` (the app's own code), `run_anon_tests.sh` (the runner) |

The runner reuses the migration 001 staging helpers (`docs/reference/migration_001/staging/sb_lib.sh` and `prereq_realistic.sql`)
unchanged.

## 2. What the hardening changes (grants only)

| Part | Object | Before (documented live state, recreated) | After |
|---|---|---|---|
| A | `profiles`, `anon` | SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN; every column SELECT, INSERT, UPDATE, REFERENCES | **nothing** |
| A | `profiles`, PUBLIC | nothing | nothing (also revoked, in case the live database differs) |
| A | `profiles`, `authenticated` | SELECT, INSERT, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN; UPDATE on name and consent columns | **SELECT; UPDATE on `display_name`, `consent_version`, `consent_at`, `age_attested_at`, `age_attested_rule` only** |
| B | every `public` table and view, `anon` | TRUNCATE, REFERENCES, TRIGGER, MAINTAIN (plus SELECT, INSERT, UPDATE, DELETE) | SELECT, INSERT, UPDATE, DELETE (unchanged) |
| B | default privileges of `postgres` for new tables, `anon` | as above | without TRUNCATE, REFERENCES, TRIGGER, MAINTAIN |
| C | signed-in-only functions present and not relied on by a policy or view (locally: `staff_list`, `staff_set_role`, `staff_remove`, `set_my_plan`, `my_staff_access`, `my_import_limit`, `legend_candidates`, `delete_my_swipe`, `delete_my_restaurant_visit`) | EXECUTE for `anon` (Supabase's explicit default) and `authenticated` | EXECUTE for `authenticated` only |

**How it behaves when run:**
- **On PostgreSQL 17 or later only:** MAINTAIN, which does not exist before version 17, so the script checks the server version.
- **Guard (part C):** a function a policy, a view, or a security-invoker function mentions is skipped and listed.
- **Preflight:** it stops, changing nothing, if `profiles` or a column the app writes is missing.
- **Postconditions:** checked at the end; if any target is not met, the whole transaction is undone.
- **Backup:** saved once in `private.anon_hardening_backup` (owner only). The script is safe to run again, and keeps the first backup.

**Unchanged:**
- `anon`'s SELECT on public content, the functions policies call (`has_permission`, `is_editor`, `cfg_number`, `catalog_place_lines`),
  and every policy, table, row and function body;
- storage, Auth, the default privileges of `supabase_admin`, and migration 001's schema;
- `anon`'s INSERT, UPDATE and DELETE on other tables (a proposal only: `ANON_ACCESS_AUDIT.md` section 6).

## 3. Test environment

- **Stack:** local Supabase from the scratch project used in Phases 2.0B.4 and 2.0B.5 (CLI 2.122.0, Docker 29.9.2).
  - `supabase/postgres:17.11.0.006` (c141fd17ac6a…), `supabase/gotrue:v2.197.0` (1736a63078f5…), `postgrest/postgrest:v16.5`
    (1347d7552b88…), `kong:2.8.1` (1b53405d8680…).
  - Anonymous sign-ins switched on, as on production.
- **Fresh database:** `supabase db reset --local`.
- **Stand-ins** (`prereq_realistic.sql` + `tests/prereq_app.sql`; synthetic and labelled):
  - `profiles` with the live columns, the two documented policies, Supabase's default grants for `anon`, and column UPDATE for
    `authenticated` (as `docs/import_limit.sql` documents it);
  - the sign-up trigger; staff roles; a public catalog (`wines`, `wine_vintages`, `producers`, `wine_reference_values`, the flavor
    tables and a security-invoker `v_catalog_cards`);
  - a journal-style player table;
  - `delete_my_swipe` and `my_staff_access` in the repository's pattern.
- **The repository's own scripts, loaded unchanged:** `docs/roles_proposal.sql` (staff and plan functions), `docs/reference_lists.sql`,
  `docs/restaurant_visits.sql`, `docs/this_or_that.sql`, `docs/note_legend.sql`.
- **Synthetic users:** addresses `@staging.invalid` and anonymous guests.

## 4. Results (`run_anon_tests.sh`, last full run)

**293 passed, 0 failed, 0 skipped.**

| Group | Before | After | After rollback |
|---|---|---|---|
| Real API (`anon_api_tests.py`): public browsing, `profiles` as `anon`, direct SQL by the browser roles (rolled-back transactions), sign-up and guest profiles, own-profile reads and updates, protected columns, player data, staff management, plan switch, the Owner, signed-in-only functions | 71 passed | 74 passed | 71 passed |
| The app's own code (`app_code_tests.mjs`: `data.js`, `consent.js`, `visualdata.js` with `vendor/supabase.js`) | 18 passed | 18 passed | 18 passed |
| Set-up, apply, idempotence, backup, rollback, inventory comparisons, guard, preflight | 23 passed (once) | | |

**Before and after.** The "before" phase records the risky baseline as passing observations, labelled BASELINE. After the hardening the
same checks assert the opposite. The rollback phase repeats "before" exactly.

| Check | Before | After |
|---|---|---|
| `anon` reads `profiles` | allowed; row security returns 0 rows | **permission denied** |
| `anon` updates, inserts, deletes `profiles` through the API | 0 rows, or refused by row security | **permission denied** |
| TRUNCATE `profiles` in direct SQL (rolled back) | **succeeds for `anon` and `authenticated`** | permission denied |
| TRUNCATE a player table as `anon` in direct SQL (rolled back) | **succeeds** | permission denied |
| `anon` REFERENCES, TRIGGER, MAINTAIN on `profiles` and a player table | present | none |
| `anon` calls `staff_list`, `staff_set_role`, `staff_remove`, `set_my_plan`, `delete_my_swipe`, `delete_my_restaurant_visit`, `legend_candidates`, `my_staff_access` | allowed; each refuses inside or returns nothing | **permission denied** |
| `anon` LOCK TABLE in direct SQL | possible | **still possible** (through UPDATE/DELETE; remaining risk R-1) |

**The same in every phase** (VERIFIED):
- **Public browsing works:**
  - a signed-out visitor reads the catalog view, the vintages, the reference values, the flavor tables and the four reference lists
    (`producer_aliases` with `producers`);
  - only published wines are returned;
  - `has_permission()` stays callable, because policies need it.
- **Sign-up:**
  - a new member and a new guest each get a player profile from the sign-up trigger;
  - a player and a guest read their own profile and only that row;
  - they record age and consent, and change their display name.
- **Protected profile columns:**
  - nobody can change their own `role`, `staff_role`, `tier`, `id` or `created_at`, or insert or delete a profile;
  - nobody can change another person's profile.
- **Player data:** a guest saves a journal entry; a signed-out visitor cannot.
- **Staff and plans:**
  - the Owner lists staff, gives and removes the Editor role (both logged in `staff_audit`), and cannot be demoted from the app;
  - a player and a guest cannot manage staff;
  - `set_my_plan` works for a signed-in player.

**The app's own code works before, after and after rollback:**
- the first visit's reads before sign-in, as `anon`: `loadCards` in pieces, `loadVintageWines`, `loadReferenceRows`,
  `loadReferenceLists`, `loadVisualTables`;
- the guest sign-in (`ensureUser`), `loadProfile`, `acceptConsents`, `attestAge`, `loadAccess`, `loadCards` as a guest, and `setMyPlan`;
- the Owner's Roles tab: `loadStaff`, `setStaffRole`, `removeStaff`, with a real password sign-in;
- a guest is refused the staff list.

**Rollback and safety:**
- **Up:** runs twice; the second run keeps the first backup (140 grant rows). The backup is invisible to `anon` and `authenticated`.
- **Rollback:**
  - restores every privilege of `anon` and `authenticated` **exactly**: all 123 inventory rows are identical to "before";
  - changed no data (profiles, auth users, staff audit, journal, wines, staff roles counted before and after);
  - a second rollback refuses, changing nothing;
  - re-applying after a rollback gives identical privileges.
- **Guard:** with a probe policy that calls `my_staff_access()`, the script skipped that function and named the policy. `anon` kept
  EXECUTE on it only (`staff_list` was still closed), and a signed-out read of that table still worked.
- **Preflight:** with `profiles.consent_at` renamed, the script stopped and changed nothing.

**Found and fixed during testing** (in the proposal's own files, before the final run):
- The first rollback draft failed instead of refusing when there was nothing to roll back. PostgreSQL plans a whole condition at once;
  the fix is two separate tests.
- On PostgreSQL 17, MAINTAIN had not been covered at first; it was added to parts A and B, the backup, the rollback and the inventory.
- My test file had a misplaced line.

## 5. Application compatibility

| Area | Effect | Evidence |
|---|---|---|
| Discover's first card on a first visit (reads before sign-in) | none | app-code test, real API |
| Guest sign-in, consent page, age attestation | none | app-code test |
| Journal, swipes, quizzes, games, food, restaurant (all after sign-in, as `authenticated`) | none: their tables were not changed, except that `anon` loses TRUNCATE, REFERENCES, TRIGGER and MAINTAIN, which the API never uses | journal stand-in test; code review (every write follows `ensureUser`) |
| Settings plan row (`set_my_plan`) | none | app-code test |
| Owner page, Roles tab | none | app-code test |
| Account deletion, guest merge, photo sharing, delete-my-entry functions (signed in) | none expected: part C keeps `authenticated`'s EXECUTE | the postcondition checks; ASSUMED for the functions whose live source is not in the repository |
| Edge Function `venue-links` (venue branch) | not affected, if it uses the service role key; if it used the anon key against `profiles` or a part C function, it would be refused | ASSUMED: its source is in neither `main` nor `vwm` (checked 2026-11-08), so the owner confirms it in the Supabase dashboard (Edge Functions) |
| `vwm` | same database: affected exactly like main | |

## 6. Remaining risks

- **R-1.** `anon` keeps INSERT, UPDATE and DELETE on every other `public` table, and UPDATE on sequences. That is Supabase's default.
  - Row security protects the API's verbs, but a table with a permissive policy (or with row security off) would be open.
  - In direct SQL, LOCK TABLE stays possible through those grants.
  - Proposal: `ANON_ACCESS_AUDIT.md` section 6. It needs the live inventory first.
- **R-2.** The live grants, policies, functions and PostgreSQL version were not read, only documented. The stand-ins follow the
  documents; `anon_inventory.sql` shows the real ones.
- **R-3.** Part C acts on a list of names. A live signed-in-only function with another name is not changed (the inventory lists them).
  A live function that a policy calls under a name in the list is skipped by the guard.
- **R-4.** Functions created later by role `postgres` still get EXECUTE for `anon` by default. Each new script should keep revoking
  from `anon` explicitly. Default privileges for functions were deliberately left alone, because policy helper functions need them.
- **R-5.** Storage policies (photo buckets) were not audited in this phase.
- **R-6.** Guest data loss if a browser is cleared before an email is attached (design; recommendations in the audit, section 7).

## 7. How to run it later (owner, after approval)

1. **Read-only first:** run `docs/security/anon_inventory.sql` in the SQL editor. Keep the result private, and compare it with
   `ANON_ACCESS_AUDIT.md` section 4.
2. **Back up:** take a backup, or note the recovery window.
3. **Apply:** run `docs/security/anon_hardening_up.sql` (one transaction). Its last result lists every function changed or skipped.
4. **Check:** run `anon_inventory.sql` again. Then open the app in a private window (first visit) and as a signed-in member, and check
   Discover, consent, Settings and the Owner page.
5. **Undo if needed:** `docs/security/anon_hardening_rollback.sql`.

## 8. Restrictions kept

- No production connection, no production SQL.
- Migration 001 r5 unchanged; `reference_enabled` not enabled; Migration 002 not started.
- No change to the app, its sign-in flow or its wording.

## 9. Owner decisions

1. Approve, change or reject parts A, B and C as tested.
2. Run `anon_inventory.sql` (read-only) on the live database and send the result privately, so that the section 6 proposal (`anon`
   writes, account-only SELECT, sequences) can be written against the real grants.
3. Whether, and where, to show the "save your progress" prompts in `ANON_ACCESS_AUDIT.md` section 7 (no app change until approved).
4. Confirm that the `venue-links` Edge Function on `vwm` uses the service role key, or that it never touches `profiles` or the part C
   functions with the anon key.

# Deploying the privilege hardening (release 2, 2026-11-08)

**Status: ready, tested, NOT deployed.** I have no access to the production database: there are no credentials in this environment, and
none should be added. The owner runs it in the Supabase SQL editor after giving approval. Nothing is live until you do.

## The exact change

| What | Effect |
|---|---|
| `profiles` | Signed-out visitors (`anon`) get no access at all. Signed-in people and guests keep reading their own row, and can change only their display name, consent and age fields. Role, staff role, plan, id and created date cannot be changed by them. Nobody can insert, delete or empty the table through the browser roles |
| Every table and view in `public` that `postgres` owns | `anon` and signed-in users lose TRUNCATE, REFERENCES, TRIGGER and MAINTAIN. The app never uses them |
| Every sequence in `public` that `postgres` owns | `anon` loses all access. Signed-in users keep USAGE and SELECT (new rows still get their numbers) but lose UPDATE (`setval`) |
| Signed-in-only functions: staff, plan, import, delete-my-data, guest merge, photos, legend, places, wine delete | `anon` can no longer call them. Signed-in users still can. A function a table rule or view relies on is skipped automatically and listed |
| Objects created later in `public` by `postgres` | New tables give `anon` SELECT only. New sequences give `anon` nothing and signed-in users USAGE and SELECT. The same is attempted for `supabase_admin`, which the SQL editor is not allowed to change; the result says so (only Supabase support could change it) |
| Not changed | Public catalog browsing; the guest sign-in; journals, swipes, quizzes, games, food and restaurant visits; the Owner page; row-level security; every table, row and function body; Migration 001 |

Files, with their SHA-256 (check them before pasting):

| File | SHA-256 |
|---|---|
| `docs/security/anon_hardening_up.sql` | `eddd95d7b76a8c3db619b25890b4fedbba4e3b55db7e8c32e00c0988eba2bb72` |
| `docs/security/anon_hardening_verify.sql` | `18be15336d981d07c6f8e771d6b99e78d9300332c40c10c32b64dbee69100028` |
| `docs/security/anon_hardening_rollback.sql` | `3a8fe229a69a37243efa4376f6351e53c729277c57bc7f689ed71562b80a3ee3` |

Tested on a disposable local Supabase stack: 352 checks passed, 0 failed (`ANON_HARDENING_CHANGE_REPORT.md`).

## Steps (Supabase dashboard, SQL editor)

1. **Approve** in the chat ("approved: deploy the hardening").
2. **Backup:** Database → Backups. Note the time of the latest backup, or the point-in-time recovery window if your plan has one.
3. **New query.** Paste the whole of `anon_hardening_up.sql` and Run. You should get one small table:
   - one row per function: "anon and PUBLIC lose EXECUTE", or "SKIPPED: ..." with the reason;
   - `D defaults | postgres | changed`;
   - `D defaults | supabase_admin | NOT CHANGED: ...` (expected: see the table above);
   - possibly `B/F not owned` rows (objects another role owns, left as they are);
   - `A, B, F | profiles; N tables and views; M sequences | done`.

   An error means nothing was changed (it is one transaction). Copy the error and stop.
4. **New query.** Paste `anon_hardening_verify.sql` and Run. **Every row must say PASS.** The last row is information only (staff roles in
   use).
5. **App check** (about five minutes):
   1. In a **private browser window** (a first visit), open the app: the first Discover card appears, and the consent page works.
   2. Swipe a wine, rate one in the Journal, answer a quiz question in Learn: each one saves.
   3. Settings → Save your progress with a test email (or sign in): it works and the data stays.
   4. As the Owner: Settings → Owner page → Roles tab lists the staff. If the plan switch is open, the Plan row in Settings works.
   5. Open the app on the venue address (`/vwm/`) once.
6. **Send me** the outputs of steps 3 and 4 (no keys or passwords are in them). I will check them and fix anything that broke.

## If something is wrong

New query → paste `anon_hardening_rollback.sql` → Run. It puts back every grant exactly as it was before step 3, and changes no data.
Then run `anon_inventory.sql` if you want to see the restored state.

## Next, after this is deployed and checked: Migration 001 r5

Migration 001 r5 is unchanged. Locally it installs and verifies (28 of 28) on a hardened database, so the hardening does not block it.
What still has to happen before it runs, each the owner's step:

1. **Decisions** (`docs/reference/migration_001/DESIGN.md` §7):
   - 14: forward-only rule for older versions;
   - 15: scaling accepted for now;
   - 16: approve r5;
   - 5: who holds the `ref_*` permissions (001a gives them to the Owner only).
2. **Read-only checks on production:**
   - run `docs/reference/migration_001/owner_role_check.sql` and confirm the points in `OWNER_ROLE_VERIFICATION.md`;
   - in Settings → API → Exposed schemas, `wine_reference` must not be listed.
3. **Separate written approval** to run `001_wine_reference_foundation.sql`, then `001_verify.sql` (every row PASS), then
   `001a_reference_permissions.sql` and verify again (DESIGN.md §8).

`reference_enabled` stays at 0.

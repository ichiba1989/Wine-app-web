# Privilege hardening release 2: post-deployment validation (2026-11-08)

**Deployment.** The owner applied `anon_hardening_up.sql` to production and ran `anon_hardening_verify.sql`; the owner reported both
successful. I had no part in running them and did not see their output.

**How it was tested from here.**
- **No production credentials** were used or needed. The checks use the app's own public key from `config.js`, exactly as every
  visitor's browser does.
- **The published site's address (`github.io`) is blocked** by this work environment's network proxy. GitHub Pages copies the `main`
  and `vwm` branches as they are (no build), so the same commits were served locally, laid out as Pages lays them out (`/` and
  `/vwm/`). They talked to the **production database**.
- **No app file changed** in either branch since before the hardening work began (checked with git: 0 app files changed on `main` since
  `fb9ee00`, and on `vwm` since `825f0de`). Only database permissions changed.

**What it wrote to production.** Only what any first visitor writes, plus two saves that were hidden again straight away:

| Test guest | Rows |
|---|---|
| `6639153f-1b70-4b5f-a8b0-fd0690095f6f` (`live_smoke.mjs`) | Profile with age and consent; one Skip answer, then put back (hidden); one journal note (a `user_wines` row and a `consumptions` row), then deleted (hidden) |
| `bd036665-f1e4-4113-ad6d-5e285e3ceb8b` (`live_ui.mjs`, main) | Profile with age and consent |
| `613c000d-4c02-4365-a389-eb6347301fdb` (`live_ui.mjs`, `/vwm/`) | Profile with age and consent |

Deleting in the app only hides rows (convention 8). The owner may delete these three guest users in the dashboard (Authentication) if
wanted.

## Live results (production database)

**`docs/security/tests/live_smoke.mjs`: 26 passed, 0 failed.** It runs the app's own `data.js`, `consent.js` and `visualdata.js`.

| Area | Checks |
|---|---|
| Guest browsing before sign-in (signed-out visitor) | The catalog loads in pieces (1,877 wines); vintages, reference values, reference lists and flavor tables all load |
| Refused to the signed-out visitor (permission denied, as intended) | Reading `profiles`; `staff_list`; `set_my_plan` |
| Anonymous authentication | Guest sign-in (`ensureUser`) works |
| Profile | The guest's profile exists (sign-up trigger); age and consent are saved (`acceptConsents`); the guest sees only their own profile; the guest cannot set their own `staff_role`, `role` or `tier` (permission denied) |
| Access | `loadAccess` gives a player with no staff permissions; `staff_list` is refused to the guest by the function |
| Saved progress | A swipe answer is saved and read back, and Put back works; a journal note is saved and read back, then deleted |
| Quiz and counts | Quiz questions and progress, and the swipe and journal counts, all read |

**`docs/security/tests/live_ui.mjs`: 26 passed, 0 failed.** A headless phone-sized browser, a first visit to each of main and `/vwm/`.
For each version:
- consent page → guest signed in, with age and consent saved;
- Discover shows its deck;
- the practice card opens for a new player, as designed;
- Swipes, Journal, Profile, Learn and More all open;
- **no page errors, no database request refused (401/403), no database server errors.**

**Regressions found: none. Bugs fixed: none needed in the app or the SQL.** Two test-script issues were fixed during the run: the
consent page redraws after each tick, and the practice card covers the tabs on a first visit.

## Live checks only the owner can do (they need the owner's login or a real inbox)

1. **Account registration:** as a guest, Settings → Save your progress → your email → the 6-digit code. The data stays.
2. **Sign in on another phone**, or a private window: "I already have an account" → email code. The journal is there.
3. **Owner administration:**
   - Settings → Owner page opens;
   - Roles tab: list the staff, give a test account Editor, then remove it;
   - Config tab: save a value.
4. **Editor action** (a test Editor): Edit wine info on one wine; save. Also a reference-list row on the Lists tab.
5. **Plan row** in Settings (only while `plan_switch_open` is 1): switch to Pro and back.
6. **A photo** added to a journal entry (storage, not changed by the hardening, but worth one try).

If anything fails, send the message on screen. `anon_hardening_rollback.sql` undoes the hardening exactly.

## Readiness for Migration 001 r5

**Not blocked by the hardening.** Locally, r5 installs on a hardened database and its verify script passes 28 of 28.

Still needed, all the owner's steps:
1. **Decisions** in `docs/reference/migration_001/DESIGN.md` §7:
   - 5: who holds the `ref_*` permissions;
   - 14: forward-only publication;
   - 15: accept the scaling for now;
   - 16: approve r5.
2. **Read-only checks:**
   - run `docs/reference/migration_001/owner_role_check.sql` and confirm the points in `OWNER_ROLE_VERIFICATION.md`;
   - Settings → API → Exposed schemas: `wine_reference` must not be listed.
3. **Separate written approval to run it** (DESIGN.md §8). Migration 001 r5 is unchanged.

# Running Migration 001 r5 on production (release "001 r5 (2026-11-08)")

**Status: final and tested. NOT run. It needs the owner's explicit go-ahead** ("approved: run Migration 001"). I have no access to the
production database; the owner runs each script in the Supabase SQL editor.

**Owner decisions (2026-11-08):**
- **5:** only the Owner holds `ref_edit`, `ref_review`, `ref_publish`, `ref_rights`.
- **14:** stricter: an older claim version is never published once a newer one has been; restore as a new version.
- **15:** accept the scaling now; optimise later.
- **16:** r5 approved.

`reference_enabled` stays at 0: nothing appears in the app.

## Files (from `main`; check the SHA-256 before pasting)

| Order | File | SHA-256 (first 16) |
|---|---|---|
| check | `docs/reference/migration_001/owner_role_check.sql` (read-only) | `e911b62ebfba298b` |
| 1 | `docs/reference/migration_001/001_wine_reference_foundation.sql` | `363f4022eb2c0f6b` |
| 2, 4 | `docs/reference/migration_001/001_verify.sql` (read-only) | `35422d599935a784` |
| 3 | `docs/reference/migration_001/001a_reference_permissions.sql` | `980a8a67df975a86` |
| undo | `001a_rollback.sql`, then `001_rollback.sql` (works only while the reference is empty) | `cc997dca39ac806c`, `af80fc11000f6fc1` |

## Steps (Supabase dashboard)

**Before** (read-only, a few minutes):
- **a.** Settings → API → **Exposed schemas**: `wine_reference` must **not** be listed. Leave the setting as it is.
- **b.** Database → Backups: note the latest backup time, or the recovery window.
- **c.** SQL editor → run **`owner_role_check.sql`**. Confirm that:
  - section 1 shows `my_staff_role_code()`;
  - you are the one person with the role owner;
  - signed-in users cannot update `role`, `staff_role` or `tier` (the hardening already made this so).

  If a point looks wrong, stop and send the result privately.

**Run:**
1. New query → paste the whole **`001_wine_reference_foundation.sql`** → Run. Expected: "Success. No rows returned". Any error means
   nothing was applied (it is one transaction). Copy the error and stop.
2. New query → **`001_verify.sql`** → Run. **All 28 rows must say PASS.**
3. New query → **`001a_reference_permissions.sql`** → Run. Only the Owner role gets the four `ref_*` permissions.
4. New query → **`001_verify.sql`** again → all 28 rows PASS. One row now says "001a registered".
5. Optional: run **`docs/security/anon_hardening_verify.sql`** again. Every row should still say PASS, since 001 does not touch the
   hardening.
6. Send me the results of steps 2 and 4. I then run the live checks (below) and the app checks again.

**If something is wrong:** run `001a_rollback.sql`, then `001_rollback.sql`. The second refuses once any reference content exists;
then the fix is a new migration (forward recovery, DESIGN.md §6).

## After deployment: what I run (no secret key; the app's public key)

- **`node docs/reference/migration_001/live_post_deploy.mjs`** (11 checks):
  - the private schema is not served by the Data API;
  - the read door answers and returns nothing while `reference_enabled` is 0;
  - the review door refuses signed-out visitors and guests.
- **`node docs/security/tests/live_smoke.mjs`** and **`live_ui.mjs`**: the app's own code and both versions (main and `/vwm/`) in a
  browser, to confirm nothing changed for players.

## Tested before release (2026-11-08)

- Local PostgreSQL suite: **359 passed, 0 failed.**
- Local Supabase compatibility suite: **341 passed, 0 failed.**
- On a database with the production hardening already applied:
  - hardening suite: **352 passed, 0 failed**;
  - the exact order above (hardening → 001 → verify 28/28 → 001a (Owner only) → verify 28/28 → hardening verify all PASS → replay
    accepted): all passed;
  - `live_post_deploy.mjs` against that local deployment: **11 passed, 0 failed.**
- Production today: `live_post_deploy.mjs` reports that Migration 001 is not deployed yet (as expected).

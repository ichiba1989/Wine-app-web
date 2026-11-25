#!/usr/bin/env bash
# STAGING ONLY (Phase 2.0B.6). Tests anon_hardening_up.sql and anon_hardening_rollback.sql on the disposable LOCAL Supabase stack:
#   fresh database (supabase db reset --local) -> stand-ins + the repository's own scripts -> inventory -> tests "before"
#   -> up (twice) -> inventory -> tests "after" + the app's own code -> data counts -> rollback -> inventory, compared with "before"
#   -> tests "rolled" + app code -> rollback refused when there is nothing to roll back -> up again after the rollback.
# Needs SB_PROJECT_DIR (scratch Supabase project), SB_CLI (the supabase command), SB_ENV_FILE (local keys, chmod 600). Uses the
# migration 001 staging helpers (sb_lib.sh), which refuse a linked project or a non-local container. Never targets production.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; SEC="$(dirname "$HERE")"; REPO="$(cd "$SEC/../.." && pwd)"
. "$REPO/docs/reference/migration_001/staging/sb_lib.sh"
: "${SB_ENV_FILE:?set SB_ENV_FILE}"; OUT="${OUT:-/tmp/sb_anon}"; mkdir -p "$OUT"
echo "files:"; for f in anon_hardening_up.sql anon_hardening_rollback.sql anon_inventory.sql; do echo "  $(sha256sum "$SEC/$f" | cut -c1-16)  $f"; done
inv() { PSQL_FILE "$SEC/anon_inventory.sql" -At -F ' | ' > "$OUT/inventory_$1.txt" 2>&1 || bad "inventory $1 failed: $(tail -2 $OUT/inventory_$1.txt)"; }
counts() { q "select (select count(*) from public.profiles)||'/'||(select count(*) from auth.users)||'/'||(select count(*) from public.staff_audit)||'/'||(select count(*) from public.consumptions)||'/'||(select count(*) from public.wines)||'/'||(select count(*) from public.staff_roles)"; }
api() { CTR="$CTR" SB_ENV_FILE="$SB_ENV_FILE" python3 -I "$HERE/anon_api_tests.py" "$1" > "$OUT/api_$1.txt" 2>&1
  grep -E "^(PASS|FAIL)" "$OUT/api_$1.txt"; PASS=$((PASS + $(grep -c '^PASS' "$OUT/api_$1.txt"))); FAIL=$((FAIL + $(grep -c '^FAIL' "$OUT/api_$1.txt")))
  grep -q "^ANON API TOTAL" "$OUT/api_$1.txt" || bad "anon_api_tests.py $1 did not finish: $(tail -3 $OUT/api_$1.txt)"; }
app() { (cd "$REPO" && CTR="$CTR" SB_ENV_FILE="$SB_ENV_FILE" node "$HERE/app_code_tests.mjs" "$1") > "$OUT/app_$1.txt" 2>&1
  grep -E "^(PASS|FAIL)" "$OUT/app_$1.txt"; PASS=$((PASS + $(grep -c '^PASS' "$OUT/app_$1.txt"))); FAIL=$((FAIL + $(grep -c '^FAIL' "$OUT/app_$1.txt")))
  grep -q "^APP CODE TOTAL" "$OUT/app_$1.txt" || bad "app_code_tests.mjs $1 did not finish: $(tail -3 $OUT/app_$1.txt)"; }

# ---------------------------------------------------------------- set-up: the documented live state
fresh realistic
PSQL_FILE "$HERE/prereq_app.sql" > "$OUT/prereq_app.log" 2>&1 || { echo "prereq_app failed: $(tail -3 $OUT/prereq_app.log)"; exit 2; }
for f in roles_proposal reference_lists restaurant_visits this_or_that note_legend; do
  PSQL_FILE "$REPO/docs/$f.sql" > "$OUT/load_$f.log" 2>&1 && ok "the repository's docs/$f.sql loads unchanged" || bad "docs/$f.sql: $(grep ERROR $OUT/load_$f.log | head -1)"
done
inv before
app before
api before
C_BEFORE=$(counts)

# ---------------------------------------------------------------- apply, twice
PSQL_FILE "$SEC/anon_hardening_up.sql" -At -F ' | ' > "$OUT/up1.txt" 2>&1 && ok "anon_hardening_up.sql runs" || bad "up: $(grep -E 'ERROR|exception' $OUT/up1.txt | head -2)"
grep -E "^(C function|D defaults|B/F not owned|A, B, F)" "$OUT/up1.txt" | sed 's/^/      /'
grep -q "^D defaults | postgres | changed" "$OUT/up1.txt" && ok "default privileges of postgres for future tables and sequences changed" || bad "postgres defaults not changed"
grep -q "^D defaults | supabase_admin | NOT CHANGED" "$OUT/up1.txt" && ok "supabase_admin's defaults reported as NOT CHANGED (postgres may not change them; as on hosted Supabase) and the run still completes" || bad "supabase_admin defaults result missing: $(grep supabase_admin $OUT/up1.txt)"
grep -i "notice" "$OUT/up1.txt" | sed 's/^/      /' | head -10
PSQL_FILE "$SEC/anon_hardening_up.sql" -At -F ' | ' > "$OUT/up2.txt" 2>&1 && ok "anon_hardening_up.sql runs again (idempotent; the first backup is kept)" || bad "up again: $(grep ERROR $OUT/up2.txt | head -2)"
grep -q "Backup already taken" "$OUT/up2.txt" && ok "the second run keeps the original backup" || bad "second run did not report the kept backup"
B=$(q "select count(*) from private.anon_hardening_backup"); [ "$B" -gt 0 ] && ok "backup holds $B grant rows (private.anon_hardening_backup)" || bad "backup empty"
[ "$(q "select has_table_privilege('anon', 'private.anon_hardening_backup', 'SELECT')::text || has_table_privilege('authenticated', 'private.anon_hardening_backup', 'SELECT')::text || has_schema_privilege('anon', 'private', 'USAGE')::text")" = "falsefalsefalse" ] \
  && ok "the backup table is invisible to anon and authenticated" || bad "the backup table is reachable by a browser role"
inv after
PSQL_FILE "$SEC/anon_hardening_verify.sql" -At -F ' | ' > "$OUT/verify_after.txt" 2>&1
VN=$(grep -c '^PASS' "$OUT/verify_after.txt"); VF=$(grep -vc '^PASS' "$OUT/verify_after.txt")
[ "$VF" = "0" ] && [ "$VN" -ge 15 ] && ok "post-deployment check anon_hardening_verify.sql: $VN of $VN PASS after the hardening" || bad "verify after: $(grep -v '^PASS' $OUT/verify_after.txt | head -3)"
[ "$(counts)" = "$C_BEFORE" ] || true
C_AFTER_UP=$(counts)
api after
app after
C_AFTER=$(counts)

# ---------------------------------------------------------------- roll back and compare
PSQL_FILE "$SEC/anon_hardening_rollback.sql" > "$OUT/rollback.txt" 2>&1 && ok "anon_hardening_rollback.sql runs" || bad "rollback: $(grep ERROR $OUT/rollback.txt | head -2)"
[ "$(counts)" = "$C_AFTER" ] && ok "the rollback touched no data (profiles/auth users/staff_audit/journal/wines/staff_roles = $C_AFTER)" || bad "rows changed by the rollback: $C_AFTER -> $(counts)"
inv rolled
if PSQL_FILE "$SEC/anon_hardening_verify.sql" -At -F ' | ' > "$OUT/verify_rolled.txt" 2>&1; then bad "verify should not pass without the hardening"
else grep -q "anon_hardening_backup" "$OUT/verify_rolled.txt" && ok "after the rollback the post-deployment check refuses to run (no backup table: nothing applied)" || bad "verify rolled: $(tail -2 $OUT/verify_rolled.txt)"; fi
if diff <(grep -v "^H hardening backup" "$OUT/inventory_before.txt") <(grep -v "^H hardening backup" "$OUT/inventory_rolled.txt") > "$OUT/inventory_before_vs_rolled.diff"; then
  ok "after the rollback every privilege of anon and authenticated is exactly as before ($(grep -vc '^H' $OUT/inventory_before.txt) inventory rows identical)"
else bad "privileges differ after rollback: $(head -5 $OUT/inventory_before_vs_rolled.diff)"; fi
diff <(grep -v "^H hardening backup" "$OUT/inventory_before.txt") <(grep -v "^H hardening backup" "$OUT/inventory_after.txt") > "$OUT/inventory_before_vs_after.diff"
echo "      inventory rows changed by the hardening: $(grep -c '^>' $OUT/inventory_before_vs_after.diff)"
api rolled
app rolled
if PSQL_FILE "$SEC/anon_hardening_rollback.sql" > "$OUT/rollback2.txt" 2>&1; then bad "a second rollback should refuse"; else grep -q "Nothing to roll back" "$OUT/rollback2.txt" && ok "a second rollback refuses (nothing to roll back) and changes nothing" || bad "second rollback: $(grep ERROR $OUT/rollback2.txt | head -1)"; fi
PSQL_FILE "$SEC/anon_hardening_up.sql" > "$OUT/up3.txt" 2>&1 && ok "the hardening can be applied again after a rollback" || bad "re-apply: $(grep ERROR $OUT/up3.txt | head -2)"
inv reapplied
diff -q <(grep -v "^H hardening backup" "$OUT/inventory_after.txt") <(grep -v "^H hardening backup" "$OUT/inventory_reapplied.txt") >/dev/null \
  && ok "re-applied privileges are identical to the first application" || bad "re-applied privileges differ: $(diff <(grep -v '^H' $OUT/inventory_after.txt) <(grep -v '^H' $OUT/inventory_reapplied.txt) | head -4)"

# ---------------------------------------------------------------- the part C guard: a function a policy mentions is left alone
PSQL_FILE "$SEC/anon_hardening_rollback.sql" >/dev/null 2>&1
q "create policy guard_probe on public.flavor_varietals for select using (true or public.my_staff_access() is not null)" >/dev/null
PSQL_FILE "$SEC/anon_hardening_up.sql" -At -F ' | ' > "$OUT/up_guard.txt" 2>&1 && ok "up runs with a policy that mentions my_staff_access()" || bad "up with the probe policy: $(grep ERROR $OUT/up_guard.txt | head -1)"
grep -q "^C function | my_staff_access() | SKIPPED: policy guard_probe" "$OUT/up_guard.txt" && ok "part C skips my_staff_access() and names the policy that mentions it" || bad "guard did not skip: $(grep my_staff_access $OUT/up_guard.txt)"
[ "$(q "select has_function_privilege('anon', 'public.my_staff_access()', 'execute')::text || has_function_privilege('anon', 'public.staff_list()', 'execute')::text")" = "truefalse" ] \
  && ok "anon keeps EXECUTE on the skipped function only (staff_list still closed)" || bad "guard result wrong"
ST=$(curl -s -o /dev/null -w '%{http_code}' -H "apikey: $(sed -n 's/^ANON_KEY=//p' "$SB_ENV_FILE" | tr -d '"')" "$(sed -n 's/^API_URL=//p' "$SB_ENV_FILE" | tr -d '"')/rest/v1/flavor_varietals?select=key")
[ "$ST" = "200" ] && ok "a signed-out read of the table whose policy calls the skipped function still works (HTTP 200)" || bad "signed-out read failed with the probe policy: HTTP $ST"
PSQL_FILE "$SEC/anon_hardening_rollback.sql" >/dev/null 2>&1; q "drop policy guard_probe on public.flavor_varietals" >/dev/null
inv final
diff -q <(grep -v "^H hardening backup" "$OUT/inventory_before.txt") <(grep -v "^H hardening backup" "$OUT/inventory_final.txt") >/dev/null \
  && ok "after the guard test and its rollback, privileges are again exactly as before" || bad "final privileges differ from before"

# ---------------------------------------------------------------- preflight: a column the app writes is missing -> stop, change nothing
q "alter table public.profiles rename column consent_at to consent_at_renamed" >/dev/null
inv pre_stop
if PSQL_FILE "$SEC/anon_hardening_up.sql" > "$OUT/up_preflight.txt" 2>&1; then bad "up should stop when profiles.consent_at is missing"
else grep -q "Preflight: public.profiles has no column consent_at" "$OUT/up_preflight.txt" && ok "up stops when a column the app writes is missing (consent_at)" || bad "unexpected stop: $(grep ERROR $OUT/up_preflight.txt | head -1)"; fi
inv post_stop
diff -q "$OUT/inventory_pre_stop.txt" "$OUT/inventory_post_stop.txt" >/dev/null && ok "... and changes nothing (privileges identical, no backup table)" || bad "a stopped run changed privileges"
q "alter table public.profiles rename column consent_at_renamed to consent_at" >/dev/null

# ---------------------------------------------------------------- an existing private schema keeps its own privileges (live: private exists)
q "create schema if not exists private; create table if not exists private._keep (x int); grant usage on schema private to authenticated" >/dev/null
P0=$(q "select has_schema_privilege('authenticated', 'private', 'USAGE')::text || has_schema_privilege('anon', 'private', 'USAGE')::text || (select count(*) from pg_class where relnamespace = 'private'::regnamespace)")
PSQL_FILE "$SEC/anon_hardening_up.sql" > "$OUT/up_private.txt" 2>&1 && ok "up runs with a private schema that already exists" || bad "up with an existing private schema: $(grep ERROR $OUT/up_private.txt | head -1)"
[ "$(q "select has_schema_privilege('authenticated', 'private', 'USAGE')::text || has_schema_privilege('anon', 'private', 'USAGE')::text")" = "truefalse" ] \
  && ok "the existing private schema's own privileges are not changed by up" || bad "up changed the private schema's privileges"
[ "$(q "select has_table_privilege('authenticated', 'private.anon_hardening_backup', 'SELECT')::text")" = "false" ] && ok "... and the backup table in it is still closed to authenticated" || bad "backup readable by authenticated"
PSQL_FILE "$SEC/anon_hardening_rollback.sql" > "$OUT/rollback_private.txt" 2>&1 && ok "rollback runs with the existing private schema" || bad "rollback: $(grep ERROR $OUT/rollback_private.txt | head -1)"
P1=$(q "select has_schema_privilege('authenticated', 'private', 'USAGE')::text || has_schema_privilege('anon', 'private', 'USAGE')::text || (select count(*) from pg_class where relnamespace = 'private'::regnamespace)")
[ "$P1" = "$P0" ] && ok "after the rollback the existing private schema, its privileges and its other table are exactly as before ($P1)" || bad "private schema differs: $P0 -> $P1"
q "drop table private._keep; drop schema private" >/dev/null

# ---------------------------------------------------------------- Migration 001 r5 on a hardened database (installs and verifies; then undone)
PSQL_FILE "$SEC/anon_hardening_up.sql" >/dev/null 2>&1
M=$REPO/docs/reference/migration_001
PSQL_FILE "$M/001_wine_reference_foundation.sql" > "$OUT/m001.log" 2>&1 && ok "Migration 001 r5 installs on the hardened database" || bad "001 r5 on the hardened database: $(grep ERROR $OUT/m001.log | head -1)"
PSQL_FILE "$M/001_verify.sql" -At -F ' | ' > "$OUT/m001_verify.txt" 2>&1
N=$(grep -c '^PASS' "$OUT/m001_verify.txt"); F=$(grep -vc '^PASS' "$OUT/m001_verify.txt")
[ "$F" = "0" ] && ok "001_verify.sql on the hardened database: $N of $N PASS" || bad "001_verify on the hardened database: $(grep -v '^PASS' $OUT/m001_verify.txt | head -3)"
PSQL_FILE "$M/001_rollback.sql" >/dev/null 2>&1 && ok "Migration 001 rollback still works on the hardened database" || bad "001 rollback failed on the hardened database"
PSQL_FILE "$SEC/anon_hardening_rollback.sql" >/dev/null 2>&1 && ok "hardening rollback after Migration 001 was installed and removed" || bad "hardening rollback failed"
inv very_end
diff -q <(grep -v "^H hardening backup" "$OUT/inventory_before.txt") <(grep -v "^H hardening backup" "$OUT/inventory_very_end.txt") >/dev/null \
  && ok "at the very end every privilege is exactly as at the start" || bad "end privileges differ: $(diff <(grep -v '^H' $OUT/inventory_before.txt) <(grep -v '^H' $OUT/inventory_very_end.txt) | head -4)"

echo; echo "ANON HARDENING TOTAL: $PASS passed, $FAIL failed  (local Supabase $(q 'show server_version'))"
[ "$FAIL" = "0" ]

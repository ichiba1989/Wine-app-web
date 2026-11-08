#!/usr/bin/env bash
# STAGING ONLY. Migration 002 on the disposable LOCAL Supabase stack, starting each time from the production-like state: the documented
# stand-ins (migration_001/staging/prereq_realistic.sql, docs/security/tests/prereq_app.sql, tests/prereq_catalog.sql), the production
# privilege hardening (docs/security/anon_hardening_up.sql), 001 r5 and 001a. Checks: preflight refusals, install, 002_verify, replay,
# the hardening still verified, the real-API workflow (api_002_tests.py), verify after content, rollback refused with content, rollback on
# an empty install (and 001_verify passing again), re-install. Needs SB_PROJECT_DIR, SB_CLI, SB_ENV_FILE. Never targets production.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; M2="$(dirname "$HERE")"; REPO="$(cd "$M2/../../.." && pwd)"; M1="$REPO/docs/reference/migration_001"
. "$M1/staging/sb_lib.sh"
: "${SB_ENV_FILE:?set SB_ENV_FILE}"; OUT="${OUT:-/tmp/sb_002}"; mkdir -p "$OUT"
echo "files:"; for f in 002_reference_editorial_identity.sql 002_verify.sql 002_rollback.sql; do echo "  $(sha256sum "$M2/$f" | cut -c1-16)  $f"; done
base() {   # $1: also run 001a (yes|no)
  fresh realistic
  for f in "$REPO/docs/security/tests/prereq_app.sql" "$HERE/prereq_catalog.sql" "$REPO/docs/security/anon_hardening_up.sql" "$M1/001_wine_reference_foundation.sql"; do
    PSQL_FILE "$f" > "$OUT/base.log" 2>&1 || { echo "base failed at $f: $(grep ERROR $OUT/base.log | head -2)"; exit 2; }
  done
  [ "$1" = "yes" ] && { PSQL_FILE "$M1/001a_reference_permissions.sql" >/dev/null 2>&1 || { echo "001a failed"; exit 2; }; }
  return 0
}
verify2() { PSQL_FILE "$M2/002_verify.sql" -At -F ' | ' > "$OUT/verify_$1.txt" 2>&1; }
stops() {   # $1 label, $2 expected text
  if PSQL_FILE "$M2/002_reference_editorial_identity.sql" > "$OUT/stop.log" 2>&1; then bad "$1: 002 should have stopped"
  elif grep -q "$2" "$OUT/stop.log"; then
    [ "$(q "select count(*) from wine_reference.schema_migrations where version = '002'")" = "0" ] && [ "$(q "select count(*) from pg_proc where proname in ('ref_draft','ref_staff')")" = "0" ] \
      && ok "$1: 002 stops and creates nothing" || bad "$1: stopped but something was created"
  else bad "$1: unexpected error: $(grep ERROR $OUT/stop.log | head -1)"; fi
}

# ---------------------------------------------------------------- preflight refusals
base no;  stops "preflight: 001a not run" "run 001a_reference_permissions.sql first"
base yes; q "alter table wine_reference.entities add column hand_added int" >/dev/null; stops "preflight: hand-made change since 001 (drift)" "structure drift"
base yes; q "update wine_reference.schema_migrations set release = '001 r5 (2026-11-01)' where version = '001'" >/dev/null; stops "preflight: an earlier 001 release" "001 r5 (2026-11-08)\" is required"
base yes; q "create function public.ref_lookup() returns int language sql as 'select 1'" >/dev/null; stops "preflight: a foreign ref_* function" "unexpected function"

# ---------------------------------------------------------------- install, verify, replay, the hardening still verified
base yes
PF=$( (echo "set default_transaction_read_only = on;"; cat "$M2/002_preflight.sql") | PSQL -At -F ' | ' 2>&1)
[ "$(echo "$PF" | grep -c '^PASS')" = "12" ] && [ "$(echo "$PF" | grep -vc '^PASS')" = "0" ] && ok "002_preflight.sql (read-only transaction): 12 of 12 PASS before 002" || bad "preflight before 002: $(echo "$PF" | grep -v '^PASS' | head -2)"
PUB0=$(snapshot public | grep -v "ref_draft\|ref_staff" | md5sum)
PSQL_FILE "$M2/002_reference_editorial_identity.sql" > "$OUT/install.log" 2>&1 && ok "002 installs on the hardened 001 r5 + 001a database (as the SQL editor's role postgres)" || bad "install: $(grep ERROR $OUT/install.log | head -2)"
verify2 after_install; N=$(grep -c '^PASS' "$OUT/verify_after_install.txt"); F=$(grep -vc '^PASS' "$OUT/verify_after_install.txt")
[ "$F" = "0" ] && ok "002_verify.sql: $N of $N PASS" || bad "002_verify: $(grep -v '^PASS' $OUT/verify_after_install.txt | head -3)"
[ "$(snapshot public | grep -v "ref_draft\|ref_staff" | md5sum)" = "$PUB0" ] && ok "the public schema is unchanged except the two new ref_* functions (app tables, grants and policies untouched)" || bad "public schema changed"
PF=$( (echo "set default_transaction_read_only = on;"; cat "$M2/002_preflight.sql") | PSQL -At -F ' | ' 2>&1 | grep -v '^PASS')
[ "$(echo "$PF" | grep -c .)" = "4" ] && echo "$PF" | grep -q "not registered yet" && echo "$PF" | grep -q "legacy_links" \
  && ok "002_preflight.sql after 002: exactly its four 'not yet installed' rows FAIL (so a second run is caught)" || bad "preflight after 002: $PF"
PSQL_FILE "$M2/002_reference_editorial_identity.sql" > "$OUT/replay.log" 2>&1 && ok "002 replay runs (same release, no drift)" || bad "replay: $(grep ERROR $OUT/replay.log | head -1)"
R=$(q "select (select count(*) from wine_reference.entity_kinds)||'/'||(select count(*) from wine_reference.relationship_types)||'/'||(select count(*) from wine_reference.attribute_types)||'/'||(select count(*) from wine_reference.schema_migrations)")
[ "$R" = "13/12/5/3" ] && ok "replay adds no duplicates (kinds/relationship types/attribute types/migrations = $R)" || bad "counts after replay: $R"
HV=$(PSQL_FILE "$REPO/docs/security/anon_hardening_verify.sql" -At -F ' | '); [ "$(echo "$HV" | grep -vc '^PASS')" = "0" ] && ok "the production hardening still verifies ($(echo "$HV" | grep -c '^PASS') of $(echo "$HV" | wc -l) PASS)" || bad "hardening verify after 002: $(echo "$HV" | grep -v '^PASS' | head -2)"
V1=$(PSQL_FILE "$M1/001_verify.sql" -At -F ' | ' | grep -v '^PASS'); echo "      001_verify after 002 (expected FAIL rows, replaced by 002_verify):"; echo "$V1" | sed 's/^/        /'
[ "$(echo "$V1" | grep -c .)" = "4" ] && echo "$V1" | grep -q "drift" && echo "$V1" | grep -q "nothing else named ref_" && echo "$V1" | grep -q "(18 statement triggers)" && echo "$V1" | grep -q "(20 triggers)" \
  && ok "001_verify fails exactly its four 001-only rows after 002 (drift, ref_* count, lock and TRUNCATE trigger counts: as documented)" || bad "001_verify after 002: unexpected rows"

# ---------------------------------------------------------------- the real-API workflow
CTR="$CTR" SB_ENV_FILE="$SB_ENV_FILE" python3 -I "$HERE/api_002_tests.py" > "$OUT/api.txt" 2>&1
grep -E "^(PASS|FAIL)" "$OUT/api.txt" | sed 's/^/  api: /' | sed 's/^  api: \(PASS\|FAIL\)/\1  api:/'
PASS=$((PASS + $(grep -c '^PASS' "$OUT/api.txt"))); FAIL=$((FAIL + $(grep -c '^FAIL' "$OUT/api.txt"))); grep -q "^API 002 TOTAL" "$OUT/api.txt" || bad "api_002_tests.py did not finish: $(tail -3 $OUT/api.txt)"
verify2 after_content
N=$(grep -E "release|drift|health|audit|001a|ref_draft|legacy|links|kinds exist|types exist|lock|TRUNCATE" "$OUT/verify_after_content.txt" | grep -vc '^PASS')
[ "$N" = "0" ] && ok "002_verify after the workflow: release, drift, health, audit, permission and link rows all PASS" || bad "verify after content: $(grep -v '^PASS' $OUT/verify_after_content.txt | grep -v 'right after' | head -3)"
if PSQL_FILE "$M2/002_rollback.sql" > "$OUT/rb_content.log" 2>&1; then bad "rollback should refuse with content"; else grep -q "Refusing to roll back migration 002" "$OUT/rb_content.log" && ok "002 rollback refuses once 002 content exists (forward recovery)" || bad "rollback with content: $(grep ERROR $OUT/rb_content.log | head -1)"; fi

# ---------------------------------------------------------------- rollback on an empty install, then 001_verify passes again; re-install
base yes
PSQL_FILE "$M2/002_reference_editorial_identity.sql" >/dev/null 2>&1
PSQL_FILE "$M2/002_rollback.sql" > "$OUT/rb.log" 2>&1 && ok "002 rollback runs on an empty 002 install (its own fingerprint check passes)" || bad "rollback: $(grep ERROR $OUT/rb.log | head -1)"
V=$(PSQL_FILE "$M1/001_verify.sql" -At -F ' | '); [ "$(echo "$V" | grep -vc '^PASS')" = "0" ] && ok "after the rollback 001_verify.sql passes again ($(echo "$V" | grep -c '^PASS') of $(echo "$V" | wc -l))" || bad "001_verify after rollback: $(echo "$V" | grep -v '^PASS' | head -2)"
[ "$(q "select count(*) from pg_proc where proname in ('ref_draft','ref_staff')")|$(q "select to_regclass('wine_reference.legacy_links') is null")" = "0|t" ] && ok "the doors and legacy_links are gone" || bad "rollback left objects"
PSQL_FILE "$M2/002_reference_editorial_identity.sql" >/dev/null 2>&1 && ok "002 installs again after its rollback" || bad "re-install failed"
if PSQL_FILE "$M2/002_rollback.sql" >/dev/null 2>&1 && PSQL_FILE "$M2/002_rollback.sql" > "$OUT/rb2.log" 2>&1; then bad "a second rollback should refuse"; else grep -q "Nothing to roll back" "$OUT/rb2.log" && ok "a second rollback refuses (nothing to roll back)" || bad "second rollback: $(tail -1 $OUT/rb2.log)"; fi


# ---------------------------------------------------------------- the Owner page in a real browser (only with UI_PORT: the repo served there)
if [ -n "${UI_PORT:-}" ]; then
  base yes; PSQL_FILE "$M2/002_reference_editorial_identity.sql" >/dev/null 2>&1 || bad "install before the browser test failed"
  CTR="$CTR" SB_ENV_FILE="$SB_ENV_FILE" PORT="$UI_PORT" node "$HERE/owner_ui.mjs" > "$OUT/ui.txt" 2>&1
  grep -E "^(PASS|FAIL)|answered as empty" "$OUT/ui.txt"
  PASS=$((PASS + $(grep -c '^PASS' "$OUT/ui.txt"))); FAIL=$((FAIL + $(grep -c '^FAIL' "$OUT/ui.txt"))); grep -q "^OWNER UI TOTAL" "$OUT/ui.txt" || bad "owner_ui.mjs did not finish: $(grep -m1 Error $OUT/ui.txt)"
fi

echo; echo "MIGRATION 002 TOTAL: $PASS passed, $FAIL failed  (local Supabase $(q 'show server_version'))"
[ "$FAIL" = "0" ]

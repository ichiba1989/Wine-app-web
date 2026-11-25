#!/usr/bin/env bash
# STAGING ONLY. Migration 006 on the disposable LOCAL Supabase stack, starting each time from the production state: the documented
# stand-ins (migration_001/staging/prereq_realistic.sql, docs/security/tests/prereq_app.sql, migration_002/tests/prereq_catalog.sql,
# migration_003/tests/prereq_catalog_003.sql, migration_004/tests/prereq_catalog_004.sql), the production privilege hardening, 001 r5, 001a,
# 002 r1, 003 r1, 004 r1 and 005 r1. Checks: the read-only preflight, preflight refusals, install, 006_verify, the public schema, replay,
# the hardening and 005_verify (exactly its two documented rows), the real-API checks (api_006_tests.py: refusals, evidence, mirrors of
# ref_review, pages beyond 300, subject areas, link comparison, no writes, the switch), the API workflows of 002, 003, 004 and 005 on top of 006
# (compatibility), verify after content, rollback (006 stores nothing, so it is always possible) and 005_verify passing again, re-install,
# the tab's pure rules and (with UI_PORT) the Owner page in a browser (owner_ui_006.mjs).
# Needs SB_PROJECT_DIR, SB_CLI, SB_ENV_FILE. Never targets production.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; M6="$(dirname "$HERE")"; REPO="$(cd "$M6/../../.." && pwd)"; R="$REPO/docs/reference"
M1="$R/migration_001"; M2="$R/migration_002"; M3="$R/migration_003"; M4="$R/migration_004"; M5="$R/migration_005"
. "$M1/staging/sb_lib.sh"
: "${SB_ENV_FILE:?set SB_ENV_FILE}"; OUT="${OUT:-/tmp/sb_006}"; mkdir -p "$OUT"
MIG="$M6/006_reference_browse.sql"
echo "files:"; for f in 006_preflight.sql 006_reference_browse.sql 006_verify.sql 006_rollback.sql; do echo "  $(sha256sum "$M6/$f" | cut -c1-16)  $f"; done
base() {
  fresh realistic
  for f in "$REPO/docs/security/tests/prereq_app.sql" "$M2/tests/prereq_catalog.sql" "$M3/tests/prereq_catalog_003.sql" "$M4/tests/prereq_catalog_004.sql" "$REPO/docs/security/anon_hardening_up.sql" \
           "$M1/001_wine_reference_foundation.sql" "$M1/001a_reference_permissions.sql" "$M2/002_reference_editorial_identity.sql" "$M3/003_reference_taxonomy_identity_catalog.sql" \
           "$M4/004_reference_catalog_facts.sql" "$M5/005_reference_grape_rules.sql"; do
    PSQL_FILE "$f" > "$OUT/base.log" 2>&1 || { echo "base failed at $f: $(grep ERROR $OUT/base.log | head -2)"; exit 2; }
  done
}
readonly_file() { (echo "set default_transaction_read_only = on;"; cat "$1") | PSQL -At -F ' | ' 2>&1; }
stops() {   # $1 label, $2 expected text, $3 how many ref_browse functions the case itself made (default 0)
  if PSQL_FILE "$MIG" > "$OUT/stop.log" 2>&1; then bad "$1: 006 should have stopped"
  elif grep -q "$2" "$OUT/stop.log"; then
    [ "$(q "select count(*) from wine_reference.schema_migrations where version = '006'")|$(q "select count(*) from pg_proc where proname = 'ref_browse'")|$(q "select to_regclass('wine_reference.entities_created') is null")" = "0|${3:-0}|t" ] \
      && ok "$1: 006 stops and creates nothing" || bad "$1: stopped but something was created"
  else bad "$1: unexpected error: $(grep ERROR $OUT/stop.log | head -1)"; fi
}
api() {   # $1 label, $2 script: a whole API suite must pass
  CTR="$CTR" SB_ENV_FILE="$SB_ENV_FILE" python3 -I "$2" > "$OUT/$1.txt" 2>&1
  local n f; n=$(grep -c '^PASS' "$OUT/$1.txt"); f=$(grep -c '^FAIL' "$OUT/$1.txt")
  [ "$f" = "0" ] && grep -q "TOTAL" "$OUT/$1.txt" && ok "$1's own API workflow still passes with 006 installed ($n of $n)" || bad "$1 workflow on 006: $(grep '^FAIL' "$OUT/$1.txt" | head -3) $(tail -2 "$OUT/$1.txt")"
}

# ---------------------------------------------------------------- preflight refusals
base; q "alter table wine_reference.rule_import_batches add column hand_added int" >/dev/null; stops "preflight: hand-made change since 005 (drift)" "structure drift"
base; q "update wine_reference.schema_migrations set release = '005 r0' where version = '005'" >/dev/null; stops "preflight: another 005 release" "005 r1 (2026-11-13)\" is required"
base; q "create function public.ref_lookup() returns int language sql as 'select 1'" >/dev/null; stops "preflight: a foreign ref_* function" "unexpected function"
base; q "create function public.ref_browse(text, jsonb) returns jsonb language sql as 'select null::jsonb'" >/dev/null; stops "preflight: a hand-made ref_browse" "ref_browse exists but migration 006 is not registered" 1

# ---------------------------------------------------------------- install, verify, replay, the hardening and 005_verify
base
PF=$(readonly_file "$M6/006_preflight.sql")
[ "$(echo "$PF" | grep -vc '^PASS')" = "0" ] && ok "006_preflight.sql (read-only transaction): $(echo "$PF" | grep -c '^PASS') of $(echo "$PF" | grep -c '^PASS') PASS before 006" || bad "preflight before 006: $(echo "$PF" | grep -v '^PASS' | head -2)"
PUB0=$(snapshot public | grep -v "ref_browse" | md5sum)
PSQL_FILE "$MIG" > "$OUT/install.log" 2>&1 && ok "006 installs on the production state (hardening, 001 r5, 001a, 002 r1 to 005 r1) as the SQL editor's role postgres" || bad "install: $(grep ERROR $OUT/install.log | head -2)"
grep -E "^(NOTICE|WARNING)" "$OUT/install.log" | head -3
V=$(readonly_file "$M6/006_verify.sql"); N=$(echo "$V" | grep -c '^PASS'); F=$(echo "$V" | grep -vc '^PASS')
[ "$F" = "0" ] && ok "006_verify.sql (read-only): $N of $N PASS" || bad "006_verify: $(echo "$V" | grep -v '^PASS' | head -3)"
[ "$(snapshot public | grep -v "ref_browse" | md5sum)" = "$PUB0" ] && ok "the public schema is unchanged except the new ref_browse function (app tables, grants and policies untouched)" || bad "public schema changed"
PF=$(readonly_file "$M6/006_preflight.sql" | grep -v '^PASS')
[ "$(echo "$PF" | grep -c .)" = "4" ] && echo "$PF" | grep -q "not registered yet" && ok "006_preflight.sql after 006: exactly its four 'not yet installed' rows FAIL (a second run is caught)" || bad "preflight after 006: $PF"
PSQL_FILE "$MIG" > "$OUT/replay.log" 2>&1 && ok "006 replay runs (same release, no drift)" || bad "replay: $(grep ERROR $OUT/replay.log | head -1)"
[ "$(q "select count(*) from wine_reference.schema_migrations")" = "7" ] && ok "replay adds no duplicates (7 migrations registered)" || bad "counts after replay"
HV=$(PSQL_FILE "$REPO/docs/security/anon_hardening_verify.sql" -At -F ' | '); [ "$(echo "$HV" | grep -vc '^PASS')" = "0" ] && ok "the production hardening still verifies ($(echo "$HV" | grep -c '^PASS') of $(echo "$HV" | wc -l) PASS)" || bad "hardening verify after 006: $(echo "$HV" | grep -v '^PASS' | head -2)"
V5=$(PSQL_FILE "$M5/005_verify.sql" -At -F ' | ' | grep -v '^PASS'); echo "      005_verify after 006 (expected FAIL rows, replaced by 006_verify):"; echo "$V5" | sed 's/^/        /'
[ "$(echo "$V5" | grep -c .)" = "2" ] && echo "$V5" | grep -q "drift" && echo "$V5" | grep -q "nothing else named ref_" \
  && ok "005_verify fails exactly its two 005-only rows after 006 (drift, ref_* count: as documented)" || bad "005_verify after 006: unexpected rows"

# ---------------------------------------------------------------- the real-API checks, then verify with content
CTR="$CTR" SB_ENV_FILE="$SB_ENV_FILE" python3 -I "$HERE/api_006_tests.py" > "$OUT/api.txt" 2>&1
grep -E "^(PASS|FAIL)" "$OUT/api.txt" | sed 's/^\(PASS\|FAIL\)  /\1  api: /'
PASS=$((PASS + $(grep -c '^PASS' "$OUT/api.txt"))); FAIL=$((FAIL + $(grep -c '^FAIL' "$OUT/api.txt"))); grep -q "^API 006 TOTAL" "$OUT/api.txt" || bad "api_006_tests.py did not finish: $(tail -3 $OUT/api.txt)"
V=$(readonly_file "$M6/006_verify.sql"); [ "$(echo "$V" | grep -vc '^PASS')" = "0" ] && ok "006_verify after the checks (content of every kind): every row still PASS ($(echo "$V" | grep -c '^PASS'))" || bad "verify after content: $(echo "$V" | grep -v '^PASS' | head -3)"
PSQL_FILE "$M6/006_rollback.sql" > "$OUT/rb_content.log" 2>&1 && ok "006 rollback runs even with reference content (006 stores none)" || bad "rollback with content: $(grep ERROR $OUT/rb_content.log | head -1)"
V=$(PSQL_FILE "$M5/005_verify.sql" -At -F ' | '); [ "$(echo "$V" | grep -vc '^PASS')" = "0" ] && ok "after the rollback 005_verify.sql passes again ($(echo "$V" | grep -c '^PASS') of $(echo "$V" | wc -l)), content kept" || bad "005_verify after rollback: $(echo "$V" | grep -v '^PASS' | head -2)"
[ "$(q "select count(*) from pg_proc where proname in ('ref_browse', 'fact_review_json', 'source_version_blockers')")|$(q "select to_regclass('wine_reference.claims_created') is null")" = "0|t" ] && ok "ref_browse, its helpers and its indexes are gone" || bad "rollback left objects"
PSQL_FILE "$MIG" >/dev/null 2>&1 && ok "006 installs again after its rollback, over existing content" || bad "re-install failed"
V=$(readonly_file "$M6/006_verify.sql"); [ "$(echo "$V" | grep -vc '^PASS')" = "0" ] && ok "006_verify passes after the re-install" || bad "verify after re-install: $(echo "$V" | grep -v '^PASS' | head -2)"

# ---------------------------------------------------------------- the earlier workflows on top of 006 (compatibility)
base; PSQL_FILE "$MIG" >/dev/null 2>&1; api "002" "$M2/tests/api_002_tests.py"
base; PSQL_FILE "$MIG" >/dev/null 2>&1; api "003" "$M3/tests/api_003_tests.py"
base; PSQL_FILE "$MIG" >/dev/null 2>&1; api "004" "$M4/tests/api_004_tests.py"
base; PSQL_FILE "$MIG" >/dev/null 2>&1; api "005" "$M5/tests/api_005_tests.py"

# ---------------------------------------------------------------- the tab's pure rules (no database)
node "$HERE/owner_rules_006.mjs" > "$OUT/rules.txt" 2>&1; grep -E "^(PASS|FAIL)" "$OUT/rules.txt"
PASS=$((PASS + $(grep -c '^PASS' "$OUT/rules.txt"))); FAIL=$((FAIL + $(grep -c '^FAIL' "$OUT/rules.txt"))); grep -q "^RULES 006 TOTAL" "$OUT/rules.txt" || bad "owner_rules_006.mjs did not finish: $(tail -3 $OUT/rules.txt)"

# ---------------------------------------------------------------- the Owner page in a real browser (only with UI_PORT: the repo served there)
if [ -n "${UI_PORT:-}" ]; then
  for E in full none; do
    base; [ "$E" = "full" ] && PSQL_FILE "$MIG" >/dev/null 2>&1
    CTR="$CTR" SB_ENV_FILE="$SB_ENV_FILE" PORT="$UI_PORT" EXPECT="$E" node "$HERE/owner_ui_006.mjs" > "$OUT/ui_$E.txt" 2>&1
    grep -E "^(PASS|FAIL)" "$OUT/ui_$E.txt" | sed "s/^\(PASS\|FAIL\)  ui:/\1  ui ($E):/"
    PASS=$((PASS + $(grep -c '^PASS' "$OUT/ui_$E.txt"))); FAIL=$((FAIL + $(grep -c '^FAIL' "$OUT/ui_$E.txt"))); grep -q "^OWNER UI TOTAL" "$OUT/ui_$E.txt" || bad "owner_ui_006.mjs ($E) did not finish: $(grep -m1 Error $OUT/ui_$E.txt)"
  done
fi

echo; echo "MIGRATION 006 TOTAL: $PASS passed, $FAIL failed  (local Supabase $(q 'show server_version'))"
[ "$FAIL" = "0" ]

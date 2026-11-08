#!/usr/bin/env bash
# STAGING ONLY. Migration 003 on the disposable LOCAL Supabase stack, starting each time from the production state: the documented
# stand-ins (migration_001/staging/prereq_realistic.sql, docs/security/tests/prereq_app.sql, migration_002/tests/prereq_catalog.sql,
# tests/prereq_catalog_003.sql), the production privilege hardening, 001 r5, 001a and 002 r1. Checks: the read-only preflight, preflight
# refusals, install, 003_verify, the public schema, replay, the hardening and 002_verify (exactly its two documented rows), the real-API
# workflow (api_003_tests.py), 002's own API workflow on top of 003 (compatibility), verify after content, rollback refused with content,
# rollback on an empty install (002_verify passes again), re-install, and (with UI_PORT) the Owner page in a browser (owner_ui_003.mjs).
# Needs SB_PROJECT_DIR, SB_CLI, SB_ENV_FILE. Never targets production.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; M3="$(dirname "$HERE")"; REPO="$(cd "$M3/../../.." && pwd)"; M1="$REPO/docs/reference/migration_001"; M2="$REPO/docs/reference/migration_002"
. "$M1/staging/sb_lib.sh"
: "${SB_ENV_FILE:?set SB_ENV_FILE}"; OUT="${OUT:-/tmp/sb_003}"; mkdir -p "$OUT"
MIG="$M3/003_reference_taxonomy_identity_catalog.sql"
echo "files:"; for f in 003_preflight.sql 003_reference_taxonomy_identity_catalog.sql 003_verify.sql 003_rollback.sql; do echo "  $(sha256sum "$M3/$f" | cut -c1-16)  $f"; done
base() {
  fresh realistic
  for f in "$REPO/docs/security/tests/prereq_app.sql" "$M2/tests/prereq_catalog.sql" "$HERE/prereq_catalog_003.sql" "$REPO/docs/security/anon_hardening_up.sql" \
           "$M1/001_wine_reference_foundation.sql" "$M1/001a_reference_permissions.sql" "$M2/002_reference_editorial_identity.sql"; do
    PSQL_FILE "$f" > "$OUT/base.log" 2>&1 || { echo "base failed at $f: $(grep ERROR $OUT/base.log | head -2)"; exit 2; }
  done
}
readonly_file() { (echo "set default_transaction_read_only = on;"; cat "$1") | PSQL -At -F ' | ' 2>&1; }
stops() {   # $1 label, $2 expected text
  if PSQL_FILE "$MIG" > "$OUT/stop.log" 2>&1; then bad "$1: 003 should have stopped"
  elif grep -q "$2" "$OUT/stop.log"; then
    [ "$(q "select count(*) from wine_reference.schema_migrations where version = '003'")|$(q "select count(*) from pg_proc where proname = 'ref_tools'")" = "0|0" ] \
      && ok "$1: 003 stops and creates nothing" || bad "$1: stopped but something was created"
  else bad "$1: unexpected error: $(grep ERROR $OUT/stop.log | head -1)"; fi
}

# ---------------------------------------------------------------- preflight refusals
base; q "alter table wine_reference.legacy_links add column hand_added int" >/dev/null; stops "preflight: hand-made change since 002 (drift)" "structure drift"
base; q "update wine_reference.schema_migrations set release = '002 r0' where version = '002'" >/dev/null; stops "preflight: another 002 release" "002 r1 (2026-11-08)\" is required"
base; q "create function public.ref_lookup() returns int language sql as 'select 1'" >/dev/null; stops "preflight: a foreign ref_* function" "unexpected function"

# ---------------------------------------------------------------- install, verify, replay, the hardening and 002_verify
base
PF=$(readonly_file "$M3/003_preflight.sql")
[ "$(echo "$PF" | grep -c '^PASS')" = "9" ] && [ "$(echo "$PF" | grep -vc '^PASS')" = "0" ] && ok "003_preflight.sql (read-only transaction): 9 of 9 PASS before 003" || bad "preflight before 003: $(echo "$PF" | grep -v '^PASS' | head -2)"
PUB0=$(snapshot public | grep -v "ref_tools" | md5sum)
PSQL_FILE "$MIG" > "$OUT/install.log" 2>&1 && ok "003 installs on the production state (hardening, 001 r5, 001a, 002 r1) as the SQL editor's role postgres" || bad "install: $(grep ERROR $OUT/install.log | head -2)"
V=$(readonly_file "$M3/003_verify.sql"); N=$(echo "$V" | grep -c '^PASS'); F=$(echo "$V" | grep -vc '^PASS')
[ "$F" = "0" ] && ok "003_verify.sql (read-only): $N of $N PASS" || bad "003_verify: $(echo "$V" | grep -v '^PASS' | head -3)"
[ "$(snapshot public | grep -v "ref_tools" | md5sum)" = "$PUB0" ] && ok "the public schema is unchanged except the new ref_tools function (app tables, grants and policies untouched)" || bad "public schema changed"
PF=$(readonly_file "$M3/003_preflight.sql" | grep -v '^PASS')
[ "$(echo "$PF" | grep -c .)" = "3" ] && echo "$PF" | grep -q "not registered yet" && ok "003_preflight.sql after 003: exactly its three 'not yet installed' rows FAIL (a second run is caught)" || bad "preflight after 003: $PF"
PSQL_FILE "$MIG" > "$OUT/replay.log" 2>&1 && ok "003 replay runs (same release, no drift)" || bad "replay: $(grep ERROR $OUT/replay.log | head -1)"
[ "$(q "select count(*) from wine_reference.schema_migrations")" = "4" ] && ok "replay adds no duplicates (4 migrations registered: 001, 001a, 002, 003)" || bad "migrations after replay"
HV=$(PSQL_FILE "$REPO/docs/security/anon_hardening_verify.sql" -At -F ' | '); [ "$(echo "$HV" | grep -vc '^PASS')" = "0" ] && ok "the production hardening still verifies ($(echo "$HV" | grep -c '^PASS') of $(echo "$HV" | wc -l) PASS)" || bad "hardening verify after 003: $(echo "$HV" | grep -v '^PASS' | head -2)"
V2=$(PSQL_FILE "$M2/002_verify.sql" -At -F ' | ' | grep -v '^PASS'); echo "      002_verify after 003 (expected FAIL rows, replaced by 003_verify):"; echo "$V2" | sed 's/^/        /'
[ "$(echo "$V2" | grep -c .)" = "2" ] && echo "$V2" | grep -q "drift" && echo "$V2" | grep -q "nothing else named ref_" \
  && ok "002_verify fails exactly its two 002-only rows after 003 (drift, ref_* count: as documented)" || bad "002_verify after 003: unexpected rows"

# ---------------------------------------------------------------- the real-API workflow, and 002's workflow on top of 003
CTR="$CTR" SB_ENV_FILE="$SB_ENV_FILE" python3 -I "$HERE/api_003_tests.py" > "$OUT/api.txt" 2>&1
grep -E "^(PASS|FAIL)" "$OUT/api.txt" | sed 's/^\(PASS\|FAIL\)  /\1  api: /'
PASS=$((PASS + $(grep -c '^PASS' "$OUT/api.txt"))); FAIL=$((FAIL + $(grep -c '^FAIL' "$OUT/api.txt"))); grep -q "^API 003 TOTAL" "$OUT/api.txt" || bad "api_003_tests.py did not finish: $(tail -3 $OUT/api.txt)"
V=$(readonly_file "$M3/003_verify.sql"); [ "$(echo "$V" | grep -vc '^PASS')" = "0" ] && ok "003_verify after the workflow: every row still PASS ($(echo "$V" | grep -c '^PASS'))" || bad "verify after content: $(echo "$V" | grep -v '^PASS' | head -3)"
if PSQL_FILE "$M3/003_rollback.sql" > "$OUT/rb_content.log" 2>&1; then bad "rollback should refuse with content"; else grep -q "Refusing to roll back migration 003" "$OUT/rb_content.log" && ok "003 rollback refuses once 003 content exists (forward recovery)" || bad "rollback with content: $(grep ERROR $OUT/rb_content.log | head -1)"; fi
base; PSQL_FILE "$MIG" >/dev/null 2>&1
CTR="$CTR" SB_ENV_FILE="$SB_ENV_FILE" python3 -I "$M2/tests/api_002_tests.py" > "$OUT/api002.txt" 2>&1
N2=$(grep -c '^PASS' "$OUT/api002.txt"); F2=$(grep -c '^FAIL' "$OUT/api002.txt")
[ "$F2" = "0" ] && grep -q "^API 002 TOTAL" "$OUT/api002.txt" && ok "002's own API workflow still passes with 003 installed ($N2 of $N2)" || bad "002 workflow on 003: $(grep '^FAIL' $OUT/api002.txt | head -3)"

# ---------------------------------------------------------------- rollback on an empty install, then 002_verify passes again; re-install
base; PSQL_FILE "$MIG" >/dev/null 2>&1
PSQL_FILE "$M3/003_rollback.sql" > "$OUT/rb.log" 2>&1 && ok "003 rollback runs on an empty 003 install (its own fingerprint check passes)" || bad "rollback: $(grep ERROR $OUT/rb.log | head -1)"
V=$(PSQL_FILE "$M2/002_verify.sql" -At -F ' | '); [ "$(echo "$V" | grep -vc '^PASS')" = "0" ] && ok "after the rollback 002_verify.sql passes again ($(echo "$V" | grep -c '^PASS') of $(echo "$V" | wc -l))" || bad "002_verify after rollback: $(echo "$V" | grep -v '^PASS' | head -2)"
[ "$(q "select count(*) from pg_proc where proname = 'ref_tools'")|$(q "select count(*) from information_schema.columns where table_schema = 'wine_reference' and column_name = 'match_method'")" = "0|0" ] && ok "ref_tools and the match columns are gone" || bad "rollback left objects"
PSQL_FILE "$MIG" >/dev/null 2>&1 && ok "003 installs again after its rollback" || bad "re-install failed"

# ---------------------------------------------------------------- the tab's pure rules (no database)
node "$HERE/owner_rules_003.mjs" > "$OUT/rules.txt" 2>&1; grep -E "^(PASS|FAIL)" "$OUT/rules.txt"
PASS=$((PASS + $(grep -c '^PASS' "$OUT/rules.txt"))); FAIL=$((FAIL + $(grep -c '^FAIL' "$OUT/rules.txt")))

# ---------------------------------------------------------------- the Owner page in a real browser (only with UI_PORT: the repo served there)
if [ -n "${UI_PORT:-}" ]; then
  CTR="$CTR" SB_ENV_FILE="$SB_ENV_FILE" PORT="$UI_PORT" node "$HERE/owner_ui_003.mjs" > "$OUT/ui.txt" 2>&1
  grep -E "^(PASS|FAIL)|answered as empty" "$OUT/ui.txt"
  PASS=$((PASS + $(grep -c '^PASS' "$OUT/ui.txt"))); FAIL=$((FAIL + $(grep -c '^FAIL' "$OUT/ui.txt"))); grep -q "^OWNER UI TOTAL" "$OUT/ui.txt" || bad "owner_ui_003.mjs did not finish: $(grep -m1 Error $OUT/ui.txt)"
fi

echo; echo "MIGRATION 003 TOTAL: $PASS passed, $FAIL failed  (local Supabase $(q 'show server_version'))"
[ "$FAIL" = "0" ]

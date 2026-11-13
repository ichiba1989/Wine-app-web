#!/usr/bin/env bash
# STAGING ONLY. Migration 004 on the disposable LOCAL Supabase stack, starting each time from the production state: the documented
# stand-ins (migration_001/staging/prereq_realistic.sql, docs/security/tests/prereq_app.sql, migration_002/tests/prereq_catalog.sql,
# migration_003/tests/prereq_catalog_003.sql, tests/prereq_catalog_004.sql), the production privilege hardening, 001 r5, 001a, 002 r1 and
# 003 r1. Checks: the read-only preflight, preflight refusals, install, 004_verify, the public schema, replay, the hardening and 003_verify
# (exactly its two documented rows), the real-API workflow (api_004_tests.py), 003's own API workflow on top of 004 (compatibility),
# verify after content, rollback refused with content, rollback on an empty install (003_verify passes again), re-install, the tab's
# pure rules and (with UI_PORT) the Owner page in a browser (owner_ui_004.mjs).
# Needs SB_PROJECT_DIR, SB_CLI, SB_ENV_FILE. Never targets production.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; M4="$(dirname "$HERE")"; REPO="$(cd "$M4/../../.." && pwd)"; M1="$REPO/docs/reference/migration_001"; M2="$REPO/docs/reference/migration_002"; M3="$REPO/docs/reference/migration_003"
. "$M1/staging/sb_lib.sh"
: "${SB_ENV_FILE:?set SB_ENV_FILE}"; OUT="${OUT:-/tmp/sb_004}"; mkdir -p "$OUT"
MIG="$M4/004_reference_catalog_facts.sql"
echo "files:"; for f in 004_preflight.sql 004_reference_catalog_facts.sql 004_verify.sql 004_rollback.sql; do echo "  $(sha256sum "$M4/$f" | cut -c1-16)  $f"; done
base() {
  fresh realistic
  for f in "$REPO/docs/security/tests/prereq_app.sql" "$M2/tests/prereq_catalog.sql" "$M3/tests/prereq_catalog_003.sql" "$HERE/prereq_catalog_004.sql" "$REPO/docs/security/anon_hardening_up.sql" \
           "$M1/001_wine_reference_foundation.sql" "$M1/001a_reference_permissions.sql" "$M2/002_reference_editorial_identity.sql" "$M3/003_reference_taxonomy_identity_catalog.sql"; do
    PSQL_FILE "$f" > "$OUT/base.log" 2>&1 || { echo "base failed at $f: $(grep ERROR $OUT/base.log | head -2)"; exit 2; }
  done
}
readonly_file() { (echo "set default_transaction_read_only = on;"; cat "$1") | PSQL -At -F ' | ' 2>&1; }
stops() {   # $1 label, $2 expected text
  if PSQL_FILE "$MIG" > "$OUT/stop.log" 2>&1; then bad "$1: 004 should have stopped"
  elif grep -q "$2" "$OUT/stop.log"; then
    [ "$(q "select count(*) from wine_reference.schema_migrations where version = '004'")|$(q "select count(*) from pg_proc where proname = 'ref_work'")" = "0|0" ] \
      && ok "$1: 004 stops and creates nothing" || bad "$1: stopped but something was created"
  else bad "$1: unexpected error: $(grep ERROR $OUT/stop.log | head -1)"; fi
}

# ---------------------------------------------------------------- preflight refusals
base; q "alter table wine_reference.legacy_links add column hand_added int" >/dev/null; stops "preflight: hand-made change since 003 (drift)" "structure drift"
base; q "update wine_reference.schema_migrations set release = '003 r0' where version = '003'" >/dev/null; stops "preflight: another 003 release" "003 r1 (2026-11-08)\" is required"
base; q "create function public.ref_lookup() returns int language sql as 'select 1'" >/dev/null; stops "preflight: a foreign ref_* function" "unexpected function"

# ---------------------------------------------------------------- install, verify, replay, the hardening and 003_verify
base
PF=$(readonly_file "$M4/004_preflight.sql")
[ "$(echo "$PF" | grep -vc '^PASS')" = "0" ] && ok "004_preflight.sql (read-only transaction): $(echo "$PF" | grep -c '^PASS') of $(echo "$PF" | grep -c '^PASS') PASS before 004" || bad "preflight before 004: $(echo "$PF" | grep -v '^PASS' | head -2)"
PUB0=$(snapshot public | grep -v "ref_work" | md5sum)
PSQL_FILE "$MIG" > "$OUT/install.log" 2>&1 && ok "004 installs on the production state (hardening, 001 r5, 001a, 002 r1, 003 r1) as the SQL editor's role postgres" || bad "install: $(grep ERROR $OUT/install.log | head -2)"
V=$(readonly_file "$M4/004_verify.sql"); N=$(echo "$V" | grep -c '^PASS'); F=$(echo "$V" | grep -vc '^PASS')
[ "$F" = "0" ] && ok "004_verify.sql (read-only): $N of $N PASS" || bad "004_verify: $(echo "$V" | grep -v '^PASS' | head -3)"
[ "$(snapshot public | grep -v "ref_work" | md5sum)" = "$PUB0" ] && ok "the public schema is unchanged except the new ref_work function (app tables, grants and policies untouched)" || bad "public schema changed"
PF=$(readonly_file "$M4/004_preflight.sql" | grep -v '^PASS')
[ "$(echo "$PF" | grep -c .)" = "3" ] && echo "$PF" | grep -q "not registered yet" && ok "004_preflight.sql after 004: exactly its three 'not yet installed' rows FAIL (a second run is caught)" || bad "preflight after 004: $PF"
PSQL_FILE "$MIG" > "$OUT/replay.log" 2>&1 && ok "004 replay runs (same release, no drift)" || bad "replay: $(grep ERROR $OUT/replay.log | head -1)"
[ "$(q "select count(*) from wine_reference.schema_migrations")|$(q "select count(*) from wine_reference.relationship_types where code = 'rules_name_grape'")" = "5|1" ] && ok "replay adds no duplicates (5 migrations registered, one rules_name_grape type)" || bad "counts after replay"
HV=$(PSQL_FILE "$REPO/docs/security/anon_hardening_verify.sql" -At -F ' | '); [ "$(echo "$HV" | grep -vc '^PASS')" = "0" ] && ok "the production hardening still verifies ($(echo "$HV" | grep -c '^PASS') of $(echo "$HV" | wc -l) PASS)" || bad "hardening verify after 004: $(echo "$HV" | grep -v '^PASS' | head -2)"
V3=$(PSQL_FILE "$M3/003_verify.sql" -At -F ' | ' | grep -v '^PASS'); echo "      003_verify after 004 (expected FAIL rows, replaced by 004_verify):"; echo "$V3" | sed 's/^/        /'
[ "$(echo "$V3" | grep -c .)" = "2" ] && echo "$V3" | grep -q "drift" && echo "$V3" | grep -q "nothing else named ref_" \
  && ok "003_verify fails exactly its two 003-only rows after 004 (drift, ref_* count: as documented)" || bad "003_verify after 004: unexpected rows"

# ---------------------------------------------------------------- the real-API workflow, and 003's workflow on top of 004
CTR="$CTR" SB_ENV_FILE="$SB_ENV_FILE" python3 -I "$HERE/api_004_tests.py" > "$OUT/api.txt" 2>&1
grep -E "^(PASS|FAIL)" "$OUT/api.txt" | sed 's/^\(PASS\|FAIL\)  /\1  api: /'
PASS=$((PASS + $(grep -c '^PASS' "$OUT/api.txt"))); FAIL=$((FAIL + $(grep -c '^FAIL' "$OUT/api.txt"))); grep -q "^API 004 TOTAL" "$OUT/api.txt" || bad "api_004_tests.py did not finish: $(tail -3 $OUT/api.txt)"
V=$(readonly_file "$M4/004_verify.sql"); [ "$(echo "$V" | grep -vc '^PASS')" = "0" ] && ok "004_verify after the workflow: every row still PASS ($(echo "$V" | grep -c '^PASS'))" || bad "verify after content: $(echo "$V" | grep -v '^PASS' | head -3)"
if PSQL_FILE "$M4/004_rollback.sql" > "$OUT/rb_content.log" 2>&1; then bad "rollback should refuse with content"; else grep -q "Refusing to roll back migration 004" "$OUT/rb_content.log" && ok "004 rollback refuses once 004 content exists (forward recovery)" || bad "rollback with content: $(grep ERROR $OUT/rb_content.log | head -1)"; fi
base; PSQL_FILE "$MIG" >/dev/null 2>&1
CTR="$CTR" SB_ENV_FILE="$SB_ENV_FILE" python3 -I "$M3/tests/api_003_tests.py" > "$OUT/api003.txt" 2>&1
N3=$(grep -c '^PASS' "$OUT/api003.txt"); F3=$(grep -c '^FAIL' "$OUT/api003.txt")
[ "$F3" = "0" ] && grep -q "^API 003 TOTAL" "$OUT/api003.txt" && ok "003's own API workflow still passes with 004 installed ($N3 of $N3)" || bad "003 workflow on 004: $(grep '^FAIL' $OUT/api003.txt | head -3)"

# ---------------------------------------------------------------- rollback on an empty install, then 003_verify passes again; re-install
base; PSQL_FILE "$MIG" >/dev/null 2>&1
PSQL_FILE "$M4/004_rollback.sql" > "$OUT/rb.log" 2>&1 && ok "004 rollback runs on an empty 004 install (its own fingerprint check passes)" || bad "rollback: $(grep ERROR $OUT/rb.log | head -1)"
V=$(PSQL_FILE "$M3/003_verify.sql" -At -F ' | '); [ "$(echo "$V" | grep -vc '^PASS')" = "0" ] && ok "after the rollback 003_verify.sql passes again ($(echo "$V" | grep -c '^PASS') of $(echo "$V" | wc -l))" || bad "003_verify after rollback: $(echo "$V" | grep -v '^PASS' | head -2)"
[ "$(q "select count(*) from pg_proc where proname = 'ref_work'")|$(q "select count(*) from wine_reference.relationship_types where code = 'rules_name_grape'")" = "0|0" ] && ok "ref_work and the proposed rules_name_grape type are gone" || bad "rollback left objects"
PSQL_FILE "$MIG" >/dev/null 2>&1 && ok "004 installs again after its rollback" || bad "re-install failed"

# ---------------------------------------------------------------- the tab's pure rules (no database)
node "$HERE/owner_rules_004.mjs" > "$OUT/rules.txt" 2>&1; grep -E "^(PASS|FAIL)" "$OUT/rules.txt"
PASS=$((PASS + $(grep -c '^PASS' "$OUT/rules.txt"))); FAIL=$((FAIL + $(grep -c '^FAIL' "$OUT/rules.txt")))

# ---------------------------------------------------------------- the Owner page in a real browser (only with UI_PORT: the repo served there)
if [ -n "${UI_PORT:-}" ]; then
  CTR="$CTR" SB_ENV_FILE="$SB_ENV_FILE" PORT="$UI_PORT" node "$HERE/owner_ui_004.mjs" > "$OUT/ui.txt" 2>&1
  grep -E "^(PASS|FAIL)|answered as empty" "$OUT/ui.txt"
  PASS=$((PASS + $(grep -c '^PASS' "$OUT/ui.txt"))); FAIL=$((FAIL + $(grep -c '^FAIL' "$OUT/ui.txt"))); grep -q "^OWNER UI TOTAL" "$OUT/ui.txt" || bad "owner_ui_004.mjs did not finish: $(grep -m1 Error $OUT/ui.txt)"
fi

echo; echo "MIGRATION 004 TOTAL: $PASS passed, $FAIL failed  (local Supabase $(q 'show server_version'))"
[ "$FAIL" = "0" ]

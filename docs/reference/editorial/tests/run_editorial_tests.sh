#!/usr/bin/env bash
# STAGING ONLY. The editorial work queue (Reference tab: To do view, ticked catalog links, ticked grape-rule candidates) on the disposable
# LOCAL Supabase stack. App code only: no migration. Runs the pure rules, then the Owner page in a browser twice: on the full state
# (hardening, 001 r5, 001a, 002 r1, 003 r1, 004 r1, 005 r1) and on a 002-only state (the To do view names what it cannot count yet).
# Needs SB_PROJECT_DIR, SB_CLI, SB_ENV_FILE and UI_PORT (the repository served there). Never targets production.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; REPO="$(cd "$HERE/../../../.." && pwd)"; R="$REPO/docs/reference"
. "$R/migration_001/staging/sb_lib.sh"
: "${SB_ENV_FILE:?set SB_ENV_FILE}"; : "${UI_PORT:?set UI_PORT}"; OUT="${OUT:-/tmp/sb_editorial}"; mkdir -p "$OUT"
base() {   # $1: how far (002 | full)
  fresh realistic
  local files=("$REPO/docs/security/tests/prereq_app.sql" "$R/migration_002/tests/prereq_catalog.sql" "$R/migration_003/tests/prereq_catalog_003.sql"
               "$R/migration_004/tests/prereq_catalog_004.sql" "$REPO/docs/security/anon_hardening_up.sql" "$R/migration_001/001_wine_reference_foundation.sql"
               "$R/migration_001/001a_reference_permissions.sql" "$R/migration_002/002_reference_editorial_identity.sql")
  [ "$1" = "full" ] && files+=("$R/migration_003/003_reference_taxonomy_identity_catalog.sql" "$R/migration_004/004_reference_catalog_facts.sql" "$R/migration_005/005_reference_grape_rules.sql")
  for f in "${files[@]}"; do PSQL_FILE "$f" > "$OUT/base.log" 2>&1 || { echo "base failed at $f: $(grep ERROR $OUT/base.log | head -2)"; exit 2; }; done
}
ui() {   # $1: EXPECT
  CTR="$CTR" SB_ENV_FILE="$SB_ENV_FILE" PORT="$UI_PORT" EXPECT="$1" node "$HERE/editorial_ui.mjs" > "$OUT/ui_$1.txt" 2>&1
  grep -E "^(PASS|FAIL)" "$OUT/ui_$1.txt" | sed "s/^\(PASS\|FAIL\)  ui:/\1  ui ($1):/"
  PASS=$((PASS + $(grep -c '^PASS' "$OUT/ui_$1.txt"))); FAIL=$((FAIL + $(grep -c '^FAIL' "$OUT/ui_$1.txt")))
  grep -q "^OWNER UI TOTAL" "$OUT/ui_$1.txt" || bad "editorial_ui.mjs ($1) did not finish: $(grep -m1 Error $OUT/ui_$1.txt)"
}
node "$HERE/editorial_rules.mjs" > "$OUT/rules.txt" 2>&1; grep -E "^(PASS|FAIL)" "$OUT/rules.txt"
PASS=$((PASS + $(grep -c '^PASS' "$OUT/rules.txt"))); FAIL=$((FAIL + $(grep -c '^FAIL' "$OUT/rules.txt")))
base full; PSQL_FILE "$R/migration_005/tests/prereq_catalog_005.sql" >/dev/null 2>&1; ui full
base 002; ui 002
echo; echo "EDITORIAL TOTAL: $PASS passed, $FAIL failed  (local Supabase $(q 'show server_version'))"
[ "$FAIL" = "0" ]

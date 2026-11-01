#!/usr/bin/env bash
# STAGING ONLY (Phase 2.0B.4). Realistic run on the disposable LOCAL Supabase stack: a fresh database with the documented app structures
# (prereq_realistic.sql, tied to real Auth users), the exact migration 001 r4, its verify script, 001a, verify again, the security
# inventory, then api_tests.py (real sign-ins, real tokens, the Data API and GraphQL).
# Needs SB_ENV_FILE (the local stack's own keys, from `supabase status -o env`, kept chmod 600 outside the repository). The scratch
# project has enable_anonymous_sign_ins = true (production lets guests sign in anonymously).
. "$(dirname "$0")/sb_lib.sh"
: "${SB_ENV_FILE:?set SB_ENV_FILE}"; OUT="${OUT:-/tmp/sb_api}"; mkdir -p "$OUT"
fresh realistic
snapshot public > "$OUT/public_before.txt"
PSQL_FILE "$FOUNDATION" > "$OUT/install.log" 2>&1 && ok "migration 001 r4 installs on the realistic database" || { bad "install: $(tail -3 $OUT/install.log)"; exit 1; }
snapshot public > "$OUT/public_after.txt"
ADDED=$(diff "$OUT/public_before.txt" "$OUT/public_after.txt" | grep '^>' | sed 's/^> //'); REMOVED=$(diff "$OUT/public_before.txt" "$OUT/public_after.txt" | grep '^<')
[ -z "$REMOVED" ] && [ "$(echo "$ADDED" | grep -vc '^function ref_')" = "0" ] && ok "public schema unchanged except the 2 ref_* functions (realistic profiles, policies and grants untouched)" || bad "public changed: [$REMOVED] [$ADDED]"
verify() { PSQL_FILE "$MIG/001_verify.sql" -At -F ' | ' > "$OUT/verify_$1.txt" 2>&1
  P=$(grep -c '^PASS' "$OUT/verify_$1.txt"); F=$(grep -vc '^PASS' "$OUT/verify_$1.txt")
  [ "$F" = "0" ] && ok "001_verify.sql $1: $P checks PASS" || bad "001_verify.sql $1: $(grep -v '^PASS' $OUT/verify_$1.txt | head -3)"; }
verify after_001
PSQL_FILE "$MIG/001a_reference_permissions.sql" > "$OUT/001a.log" 2>&1 && ok "001a runs separately" || bad "001a: $(tail -2 $OUT/001a.log)"
verify after_001a
PSQL_FILE "$STAGING/staging_roles.sql" >/dev/null && ok "staging-only Editor / Reviewer / Publisher role definitions added (local only)"
PSQL_FILE "$STAGING/security_inventory.sql" -At -F ' | ' > "$OUT/security_inventory.txt" 2>&1
grep -q "^table grants to browser roles | none" "$OUT/security_inventory.txt" && ok "no table in wine_reference is granted to anon, authenticated, service_role or PUBLIC" || bad "table grants: $(grep 'table grants' $OUT/security_inventory.txt)"
grep -q "^execute by anon | ref_published_names(text,text,integer)$" "$OUT/security_inventory.txt" && ok "anon may execute exactly one function: public.ref_published_names" || bad "anon execute: $(grep 'execute by anon' $OUT/security_inventory.txt)"
grep -q "^execute by authenticated | ref_published_names(text,text,integer), ref_review(text,uuid,text,text,uuid)$\|^execute by authenticated | ref_review(text,uuid,text,text,uuid), ref_published_names(text,text,integer)$" "$OUT/security_inventory.txt" && ok "authenticated may execute exactly the two public doors" || bad "authenticated execute: $(grep 'execute by authenticated' $OUT/security_inventory.txt)"
grep -q "^schema usage | anon=false authenticated=false service_role=false authenticator=false" "$OUT/security_inventory.txt" && ok "no API role has USAGE on the wine_reference schema" || bad "schema usage: $(grep 'schema usage' $OUT/security_inventory.txt)"
grep -q "^tables | 21 tables; owner(s)=postgres; rls on=21; forced=0; policies=0" "$OUT/security_inventory.txt" && ok "21 tables, all owned by postgres, row-level security on, no policies" || bad "tables: $(grep '^tables' $OUT/security_inventory.txt)"
N=$(grep '^function' "$OUT/security_inventory.txt" | grep 'definer=true' | grep -vc "search_path=\"\"\|search_path=''")
[ "$N" = "0" ] && ok "every SECURITY DEFINER function has an empty search_path" || bad "$N definer function(s) without an empty search_path"
N=$(grep '^function' "$OUT/security_inventory.txt" | grep -vc 'owner=postgres'); [ "$N" = "0" ] && ok "every reference function is owned by postgres" || bad "$N function(s) not owned by postgres"
CTR="$CTR" SB_ENV_FILE="$SB_ENV_FILE" python3 -I "$STAGING/api_tests.py" > "$OUT/api.txt" 2>&1; cat "$OUT/api.txt" | grep -v "^SUPABASE API TOTAL"
AP=$(grep -c '^PASS' "$OUT/api.txt"); AF=$(grep -c '^FAIL' "$OUT/api.txt"); PASS=$((PASS+AP)); FAIL=$((FAIL+AF))
grep -q "^SUPABASE API TOTAL" "$OUT/api.txt" || bad "api_tests.py did not finish: $(tail -3 $OUT/api.txt)"
PSQL_FILE "$MIG/001_verify.sql" -At -F ' | ' > "$OUT/verify_after_api.txt" 2>&1
# the staging-only roles hold ref_* permissions on purpose, so the 001a "no role other than owner" check must report FAIL here
grep -q "^FAIL | 001a consistency: no role other than owner" "$OUT/verify_after_api.txt" && ok "001_verify.sql flags the staging-only roles that hold ref_* permissions (expected here; proves the check works)" || bad "verify did not flag the staging-only ref_* roles"
N=$(grep -E "release|drift|health|001a consistency" "$OUT/verify_after_api.txt" | grep -v "no role other than owner" | grep -vc '^PASS'); M=$(grep -E "release|drift|health|001a consistency" "$OUT/verify_after_api.txt" | grep -vc "no role other than owner")
[ "$N" = "0" ] && [ "$M" -gt 0 ] && ok "001_verify.sql after the API tests: the other $M release, drift, health and 001a checks still PASS" || bad "verify after API tests: $(grep -E 'release|drift|health|001a' $OUT/verify_after_api.txt | grep -v '^PASS' | head -3)"
echo; echo "SUPABASE REALISTIC TOTAL: $PASS passed, $FAIL failed  (local Supabase $(q 'show server_version'))"
[ "$FAIL" = "0" ]

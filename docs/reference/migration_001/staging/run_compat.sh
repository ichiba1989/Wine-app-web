#!/usr/bin/env bash
# STAGING ONLY (Phase 2.0B.4). The repository's own migration 001 checks (tests/run_local_tests.sh) repeated on a REAL local Supabase
# database (PostgreSQL 17 as Supabase builds it, its postgres role, event triggers, default privileges and auth.uid()), with the stand-ins
# in prereq_compat.sql. The migration files are used exactly as committed (their SHA-256 is printed first). Every database is a fresh
# `supabase db reset --local`. Never targets a hosted project (sb_lib.sh refuses).
. "$(dirname "$0")/sb_lib.sh"
echo "files:"; echo "  $(sha256sum "$FOUNDATION" | cut -c1-16)  migration under test: $FOUNDATION"; for f in 001_wine_reference_foundation.sql 001a_reference_permissions.sql 001_verify.sql 001_rollback.sql 001a_rollback.sql owner_role_check.sql; do echo "  $(sha256sum "$MIG/$f" | cut -c1-16)  $f"; done
counts() { q "select (select count(*) from public.wines)||'/'||(select count(*) from public.wine_vintages)||'/'||(select count(*) from public.app_config)"; }
OUT="${OUT:-/tmp/sb_compat}"; mkdir -p "$OUT"

# ------------------------------------------------ database 1: install, replay, verify, compatibility, behaviour, rollback refusal
fresh compat
snapshot public > "$OUT/public_before.txt"; C0=$(counts)
if PSQL_FILE "$FOUNDATION" > "$OUT/install1.log" 2>&1; then ok "fresh install runs without error (as Supabase's postgres role)"; else bad "fresh install: $(tail -3 $OUT/install1.log)"; fi
snapshot public > "$OUT/public_after.txt"; snapshot wine_reference > "$OUT/ref_after1.txt"
if PSQL_FILE "$FOUNDATION" > "$OUT/install2.log" 2>&1; then ok "replay (second run) runs without error"; else bad "replay: $(tail -3 $OUT/install2.log)"; fi
snapshot wine_reference > "$OUT/ref_after2.txt"
diff -q "$OUT/ref_after1.txt" "$OUT/ref_after2.txt" >/dev/null && ok "replay changes no structure ($(wc -l < $OUT/ref_after1.txt) objects identical)" || bad "replay changed structure: $(diff $OUT/ref_after1.txt $OUT/ref_after2.txt | head -5)"
R=$(q "select (select count(*) from wine_reference.schema_migrations)||'/'||(select count(*) from wine_reference.entity_kinds)||'/'||(select count(*) from wine_reference.relationship_types)||'/'||(select count(*) from wine_reference.name_kinds)")
[ "$R" = "1/9/6/8" ] && ok "replay adds no duplicate rows ($R)" || bad "replay row counts: $R"
ADDED=$(diff "$OUT/public_before.txt" "$OUT/public_after.txt" | grep '^>' | sed 's/^> //'); REMOVED=$(diff "$OUT/public_before.txt" "$OUT/public_after.txt" | grep '^<')
if [ -z "$REMOVED" ] && [ "$(echo "$ADDED" | grep -vc '^function ref_')" = "0" ] && [ "$(echo "$ADDED" | grep -c '^function ref_')" = "2" ]; then
  ok "backward compatibility: public schema unchanged except the 2 new ref_* functions"; else bad "public schema changed: removed [$REMOVED] added [$ADDED]"; fi
[ "$(counts)" = "$C0" ] && ok "backward compatibility: existing rows untouched ($C0)" || bad "row counts changed: $C0 -> $(counts)"
PSQL_FILE "$MIG/001_verify.sql" -At -F ' | ' > "$OUT/verify.txt" 2>&1
while IFS= read -r line; do case "$line" in PASS*) ok "verify: ${line#PASS | }";; FAIL*) bad "verify: ${line#FAIL | }";; *) [ -n "$line" ] && bad "verify output: $line";; esac; done < "$OUT/verify.txt"
docker exec -i "$CTR" psql -X -q -U postgres -d postgres < "$TESTS/001_behaviour_tests.sql" > "$OUT/behaviour.log" 2>&1
q "select count(*) from t.results" > /dev/null || bad "behaviour tests did not run"
while IFS='|' read -r passed label detail; do
  if [ "$passed" = "t" ]; then if [ "$detail" = "ok" ] || [ "$detail" = "true" ]; then ok "$label"; else ok "$label  -> refused: $detail"; fi; else bad "$label  [$detail]"; fi
done < <(PSQL -At -F '|' -c "select passed, label, detail from t.results order by n")
while read -r l; do bad "test file error: $l"; done < <(grep -i "error" "$OUT/behaviour.log" | head -3)
PSQL_FILE "$MIG/001_verify.sql" -At -F ' | ' > "$OUT/verify2.txt" 2>&1
while IFS= read -r line; do case "$line" in PASS*) ok "verify after tests: ${line#PASS | }";; *) bad "verify after tests: $line";; esac; done < <(grep -E "release|drift|health|001a consistency" "$OUT/verify2.txt")
if (echo 'begin transaction read only;'; cat "$MIG/owner_role_check.sql"; echo 'rollback;') | PSQL -At -F ' | ' > "$OUT/ownercheck.txt" 2>&1 \
   && grep -q "^1 role function | my_staff_role_code()" "$OUT/ownercheck.txt"; then ok "owner_role_check.sql runs read-only on Supabase and reports the role lookup"; else bad "owner_role_check.sql: $(tail -3 $OUT/ownercheck.txt)"; fi
if PSQL_FILE "$MIG/001_rollback.sql" > "$OUT/rollback1.log" 2>&1; then bad "rollback should refuse when content exists"; else grep -q "Refusing to roll back" "$OUT/rollback1.log" && ok "rollback refuses while the reference holds content" || bad "rollback failed oddly: $(tail -2 $OUT/rollback1.log)"; fi

# ------------------------------------------------ database 2: rollback of an empty install, re-install, 001a twice
fresh compat
snapshot public > "$OUT/p2_before.txt"
PSQL_FILE "$FOUNDATION" >/dev/null 2>&1
if PSQL_FILE "$MIG/001_rollback.sql" > "$OUT/rollback2.log" 2>&1; then ok "rollback on an empty reference runs"; else bad "rollback (empty): $(tail -2 $OUT/rollback2.log)"; fi
snapshot public > "$OUT/p2_after.txt"
diff -q "$OUT/p2_before.txt" "$OUT/p2_after.txt" >/dev/null && ok "after rollback the public schema is exactly as before" || bad "public differs after rollback: $(diff $OUT/p2_before.txt $OUT/p2_after.txt | head -4)"
[ "$(q "select count(*) from pg_namespace where nspname='wine_reference'")" = "0" ] && ok "after rollback the schema is gone" || bad "schema still there"
PSQL_FILE "$FOUNDATION" >/dev/null 2>&1 && ok "re-install after rollback runs" || bad "re-install after rollback failed"
PSQL_FILE "$MIG/001a_reference_permissions.sql" >/dev/null 2>&1 && PSQL_FILE "$MIG/001a_reference_permissions.sql" >/dev/null 2>&1 && ok "001a runs, and runs again" || bad "001a failed"
P=$(q "select (select array_to_string(permissions, ',') from public.staff_roles where code = 'owner')||' / '||(select array_to_string(permissions, ',') from public.staff_roles where code = 'editor')||' / '||(select count(*) from wine_reference.schema_migrations)")
[ "$P" = "catalog_edit,quiz_verify,feedback_read,settings_edit,remove_content,found_online_photos,import_extended,owner_page,ref_edit,ref_review,ref_publish,ref_rights / catalog_edit,quiz_verify,feedback_read,import_extended / 2" ] && ok "001a: owner gains the four ref_* permissions once; editor unchanged; registered" || bad "001a result: $P"
PSQL_FILE "$MIG/001_verify.sql" -At -F ' | ' 2>&1 | grep -E "001a consistency" | while IFS= read -r l; do echo "      $l"; done

# ------------------------------------------------ database 3: a required live function is missing
fresh compat
q "drop function public.my_staff_role_code()" >/dev/null 2>&1 || PSQL -c "drop function public.my_staff_role_code() cascade" >/dev/null
if PSQL_FILE "$FOUNDATION" > "$OUT/install3.log" 2>&1; then bad "migration should stop when my_staff_role_code() is missing"
else grep -q "Missing function public.my_staff_role_code()" "$OUT/install3.log" && ok "migration stops when my_staff_role_code() is missing" || bad "unexpected failure: $(tail -2 $OUT/install3.log)"; fi
[ "$(q "select count(*) from pg_namespace where nspname='wine_reference'")" = "0" ] && ok "after that stop nothing was created" || bad "schema exists after a stopped migration"

# ------------------------------------------------ preflight and drift, each on a fresh database
pre() {   # $1 name, $2 SQL to prepare, $3 installed|"", $4 text the stop must contain
  fresh compat
  [ "$3" = "installed" ] && PSQL_FILE "$FOUNDATION" >/dev/null 2>&1
  [ -n "$2" ] && q "$2" >/dev/null 2>&1
  B4=$(snapshot public | md5sum); R4=$(snapshot wine_reference | md5sum)
  if PSQL_FILE "$FOUNDATION" > "$OUT/$1.log" 2>&1; then bad "preflight $1: the migration should have stopped"
  elif grep -q "$4" "$OUT/$1.log"; then
    if [ "$(snapshot public | md5sum)" = "$B4" ] && [ "$(snapshot wine_reference | md5sum)" = "$R4" ]; then ok "preflight stops ($1) and changes nothing: $4"; else bad "preflight $1 stopped but something changed"; fi
  else bad "preflight $1: unexpected error: $(grep ERROR $OUT/$1.log | head -1)"; fi
}
pre pf_foreign "create function public.ref_lookup() returns int language sql as 'select 1'" "" "unexpected function"
pre pf_orphan "create function public.ref_review(text, uuid, text, text, uuid) returns text language sql as 'select null::text'" "" "partial or foreign deployment"
pre pf_drift "alter table wine_reference.entities add column hand_added int" installed "changed by hand"
pre pf_release "update wine_reference.schema_migrations set release = '001 r2 (2026-10-26)' where version = '001'" installed "Never replay an edited 001"
pre pf_unregistered "delete from wine_reference.schema_migrations where version = '001'" installed "migration 001 is not registered"

# ------------------------------------------------ 001a preflight, partial deployment, its rollback, and the full rollback order
fresh compat
APP="select (select count(*) from public.staff_roles)||'/'||(select count(*) from public.profiles)||'/'||(select count(*) from public.wines)||'/'||(select count(*) from public.wine_vintages)||'/'||(select count(*) from public.app_config)||'/'||(select count(*) from pg_proc where proname in ('my_staff_role_code','has_permission','cfg_number') and pronamespace='public'::regnamespace)"
N0=$(q "$APP"); snapshot public > "$OUT/p4_before_all.txt"
if PSQL_FILE "$MIG/001a_reference_permissions.sql" > "$OUT/p1a_0.log" 2>&1; then bad "001a should stop before 001"; else grep -q "run migration 001" "$OUT/p1a_0.log" && ok "001a stops when migration 001 has not run" || bad "001a before 001: $(grep ERROR $OUT/p1a_0.log | head -1)"; fi
PSQL_FILE "$FOUNDATION" >/dev/null 2>&1
PSQL_FILE "$MIG/001a_reference_permissions.sql" >/dev/null 2>&1 && ok "001a runs after 001" || bad "001a after 001 failed"
q "update public.staff_roles set permissions = array_remove(permissions, 'ref_rights') where code = 'owner'" >/dev/null
if PSQL_FILE "$MIG/001a_reference_permissions.sql" > "$OUT/p1a_1.log" 2>&1; then bad "001a should stop when partly undone"; else grep -q "partial or hand-edited" "$OUT/p1a_1.log" && ok "001a stops when an earlier run was partly undone" || bad "001a partial: $(grep ERROR $OUT/p1a_1.log | head -1)"; fi
V=$(PSQL_FILE "$MIG/001_verify.sql" -At -F ' | ' | grep "001a consistency: if registered"); case "$V" in FAIL*) ok "verify reports the partial 001a as FAIL";; *) bad "verify did not catch the partial 001a: $V";; esac
if PSQL_FILE "$MIG/001_rollback.sql" > "$OUT/p1a_2.log" 2>&1; then bad "001_rollback should refuse while 001a is in place"; else grep -q "run 001a_rollback.sql first" "$OUT/p1a_2.log" && ok "001_rollback refuses while 001a's permissions are in place" || bad "001_rollback: $(grep ERROR $OUT/p1a_2.log | head -1)"; fi
q "update public.staff_roles set permissions = array_append(permissions, 'ref_edit') where code = 'editor'" >/dev/null
PSQL_FILE "$MIG/001a_rollback.sql" >/dev/null 2>&1 && PSQL_FILE "$MIG/001a_rollback.sql" >/dev/null 2>&1 && ok "001a_rollback runs, and runs again" || bad "001a_rollback failed"
P=$(q "select (select count(*) from public.staff_roles where permissions && array['ref_edit','ref_review','ref_publish','ref_rights'])||' / '||(select array_to_string(permissions, ',') from public.staff_roles where code = 'owner')||' / '||(select array_to_string(permissions, ',') from public.staff_roles where code = 'editor')||' / '||(select array_to_string(permissions, ',') from public.staff_roles where code = 'quiz_reviewer')||' / '||(select count(*) from wine_reference.schema_migrations where version = '001a')")
[ "$P" = "0 / catalog_edit,quiz_verify,feedback_read,settings_edit,remove_content,found_online_photos,import_extended,owner_page / catalog_edit,quiz_verify,feedback_read,import_extended / quiz_verify / 0" ] \
  && ok "001a_rollback removed every ref_* permission from every role, kept all other permissions in order, unregistered 001a" || bad "001a_rollback result: $P"
PSQL_FILE "$MIG/001a_reference_permissions.sql" >/dev/null 2>&1 && ok "001a runs again cleanly after its rollback" || bad "001a after rollback failed"
PSQL_FILE "$MIG/001a_rollback.sql" >/dev/null 2>&1
if PSQL_FILE "$MIG/001_rollback.sql" >/dev/null 2>&1; then ok "full rollback order works: 001a_rollback, then 001_rollback"; else bad "001_rollback after 001a_rollback failed"; fi
N=$(q "$APP"); snapshot public > "$OUT/p4_after_all.txt"
[ "$N" = "$N0" ] && ok "after both rollbacks the existing app rows are as before (staff_roles/profiles/wines/vintages/app_config/role functions = $N)" || bad "app rows after rollback: $N0 -> $N"
diff -q "$OUT/p4_before_all.txt" "$OUT/p4_after_all.txt" >/dev/null && ok "after both rollbacks the public schema is exactly as before 001" || bad "public differs: $(diff $OUT/p4_before_all.txt $OUT/p4_after_all.txt | head -4)"

# ------------------------------------------------ release r5 regression tests (tests/001_r5_tests.sql) on a fresh database, then verify
fresh compat
PSQL_FILE "$FOUNDATION" >/dev/null 2>&1 && PSQL_FILE "$TESTS/concurrency_fixture.sql" >/dev/null 2>&1 || bad "r5 test database setup failed"
docker exec -i "$CTR" psql -X -q -U postgres -d postgres < "$TESTS/001_r5_tests.sql" > "$OUT/r5.log" 2>&1
while IFS='|' read -r passed label detail; do
  if [ "$passed" = "t" ]; then if [ "$detail" = "ok" ] || [ "$detail" = "true" ]; then ok "$label"; else ok "$label  -> refused: $detail"; fi; else bad "$label  [$detail]"; fi
done < <(PSQL -At -F '|' -c "select passed, label, detail from t.results order by n")
while read -r l; do bad "r5 test file error: $l"; done < <(grep -i "error" "$OUT/r5.log" | head -3)
while IFS= read -r line; do case "$line" in PASS*) ok "verify after r5 tests: ${line#PASS | }";; *) bad "verify after r5 tests: $line";; esac; done \
  < <(PSQL_FILE "$MIG/001_verify.sql" -At -F ' | ' | grep -E "release|drift|health: every published, unsuspended|audit|lock at the start|TRUNCATE")

echo; echo "SUPABASE COMPAT TOTAL: $PASS passed, $FAIL failed  (local Supabase, $(q "select setting from pg_settings where name='server_version'"))"
[ "$FAIL" = "0" ]

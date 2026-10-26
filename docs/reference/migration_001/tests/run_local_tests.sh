#!/usr/bin/env bash
# Runs every migration 001 test on a THROWAWAY local PostgreSQL (never Supabase): fresh install, replay, the read-only verify script,
# backward compatibility (public schema before and after), the behaviour and negative tests, and the rollback (refused with content,
# clean on an empty install). Needs a local PostgreSQL 15+ server binary (the cloud container has PostgreSQL 16 at the path below).
# Usage: bash docs/reference/migration_001/tests/run_local_tests.sh            (prints PASS / FAIL lines and a total)
#        DICT=/path/columns.md bash ...run_local_tests.sh                  (also writes the generated column tables of the data dictionary)
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; MIG="$(dirname "$HERE")"
BIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
WORK="$(mktemp -d /tmp/ref001.XXXX)"; chmod 755 "$WORK"; chown postgres "$WORK" 2>/dev/null
cp "$HERE"/*.sql "$MIG"/*.sql "$WORK"/; chmod 644 "$WORK"/*.sql
AS() { su postgres -s /bin/bash -c "$1"; }
PSQL="$BIN/psql -X -q -h $WORK -p 5498 -U postgres -v ON_ERROR_STOP=1"
PASS=0; FAIL=0
ok()  { echo "PASS  $1"; PASS=$((PASS+1)); }
bad() { echo "FAIL  $1"; FAIL=$((FAIL+1)); }

AS "$BIN/initdb -D $WORK/data -A trust >/dev/null && $BIN/pg_ctl -D $WORK/data -o '-p 5498 -k $WORK' -l $WORK/log start >/dev/null" || { echo "could not start PostgreSQL"; exit 2; }
trap 'AS "$BIN/pg_ctl -D $WORK/data stop -m fast >/dev/null"; rm -rf "$WORK"' EXIT

snapshot() {   # $1 database, $2 schema: structure of a schema (tables, columns, constraints, indexes, functions with grants, triggers, policies, table grants)
  AS "$PSQL -d $1 -At" <<SQL
select 'table '||c.relname||' rls='||c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='$2' and c.relkind in ('r','v','m','p')
union all select 'column '||c.relname||'.'||a.attname||' '||format_type(a.atttypid,a.atttypmod)||' '||a.attnotnull from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='$2' and a.attnum>0 and not a.attisdropped and c.relkind in ('r','v','m','p')
union all select 'constraint '||conrelid::regclass||' '||pg_get_constraintdef(oid) from pg_constraint where connamespace=(select oid from pg_namespace where nspname='$2')
union all select 'index '||indexrelid::regclass||' '||pg_get_indexdef(indexrelid) from pg_index i join pg_class c on c.oid=i.indrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='$2'
union all select 'function '||p.oid::regprocedure||' definer='||p.prosecdef||' acl='||coalesce(p.proacl::text,'default') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='$2' and p.proname not like 'gtrgm%' and p.proname not like '%trgm%' and p.proname not like 'similarity%' and p.proname not like 'word_similarity%' and p.proname not like 'strict_word%' and p.proname not like 'show_%' and p.proname not like 'set_limit'
union all select 'trigger '||tgrelid::regclass||' '||pg_get_triggerdef(t.oid) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='$2' and not tgisinternal
union all select 'policy '||tablename||'.'||policyname from pg_policies where schemaname='$2'
union all select 'grant '||table_name||' '||grantee||' '||privilege_type from information_schema.role_table_grants where table_schema='$2'
order by 1;
SQL
}
counts() { AS "$PSQL -d $1 -At -c \"select (select count(*) from public.wines)||'/'||(select count(*) from public.wine_vintages)||'/'||(select count(*) from public.app_config)\""; }

# ---------------------------------------------------------------- database 1: install, replay, verify, compatibility, behaviour, rollback refusal
AS "$BIN/createdb -h $WORK -p 5498 -U postgres reftest"
AS "$PSQL -d reftest -f $WORK/stub_supabase.sql" >/dev/null || { echo "stub failed"; exit 2; }
snapshot reftest public > "$WORK/public_before.txt"; C0=$(counts reftest)

if AS "$PSQL -d reftest -f $WORK/001_wine_reference_foundation.sql" > "$WORK/install1.log" 2>&1; then ok "fresh install runs without error"; else bad "fresh install: $(tail -3 $WORK/install1.log)"; fi
snapshot reftest public > "$WORK/public_after.txt"; snapshot reftest wine_reference > "$WORK/ref_after1.txt"

if AS "$PSQL -d reftest -f $WORK/001_wine_reference_foundation.sql" > "$WORK/install2.log" 2>&1; then ok "replay (second run) runs without error"; else bad "replay: $(tail -3 $WORK/install2.log)"; fi
snapshot reftest wine_reference > "$WORK/ref_after2.txt"
if diff -q "$WORK/ref_after1.txt" "$WORK/ref_after2.txt" >/dev/null; then ok "replay changes no structure ($(wc -l < $WORK/ref_after1.txt) objects identical)"; else bad "replay changed structure: $(diff $WORK/ref_after1.txt $WORK/ref_after2.txt | head -5)"; fi
R=$(AS "$PSQL -d reftest -At -c \"select (select count(*) from wine_reference.schema_migrations)||'/'||(select count(*) from wine_reference.entity_kinds)||'/'||(select count(*) from wine_reference.relationship_types)||'/'||(select count(*) from wine_reference.name_kinds)\"")
[ "$R" = "1/9/6/8" ] && ok "replay adds no duplicate rows (migrations/kinds/relationship types/name kinds = $R)" || bad "replay row counts: $R"

ADDED=$(diff "$WORK/public_before.txt" "$WORK/public_after.txt" | grep '^>' | sed 's/^> //'); REMOVED=$(diff "$WORK/public_before.txt" "$WORK/public_after.txt" | grep '^<')
if [ -z "$REMOVED" ] && [ "$(echo "$ADDED" | grep -vc '^function ref_')" = "0" ] && [ "$(echo "$ADDED" | grep -c '^function ref_')" = "2" ]; then
  ok "backward compatibility: public schema unchanged except the 2 new ref_* functions"
else bad "public schema changed: removed [$REMOVED] added [$ADDED]"; fi
[ "$(counts reftest)" = "$C0" ] && ok "backward compatibility: existing rows untouched (wines/vintages/app_config = $C0)" || bad "row counts changed: $C0 -> $(counts reftest)"

if [ -n "${DICT:-}" ]; then AS "$PSQL -d reftest -At -f $WORK/dictionary.sql" > "$WORK/dict.md" && cp "$WORK/dict.md" "$DICT"; fi
AS "$PSQL -d reftest -At -F ' | ' -f $WORK/001_verify.sql" > "$WORK/verify.txt" 2>&1
while IFS= read -r line; do case "$line" in PASS*) ok "verify: ${line#PASS | }";; FAIL*) bad "verify: ${line#FAIL | }";; *) [ -n "$line" ] && bad "verify output: $line";; esac; done < "$WORK/verify.txt"

AS "$BIN/psql -X -q -h $WORK -p 5498 -U postgres -d reftest -f $WORK/001_behaviour_tests.sql" > "$WORK/behaviour.log" 2>&1
AS "$PSQL -d reftest -At -F '|' -c \"select passed, label, detail from t.results order by n\"" > "$WORK/results.txt"
while IFS='|' read -r passed label detail; do
  if [ "$passed" = "t" ]; then if [ "$detail" = "ok" ] || [ "$detail" = "true" ]; then ok "$label"; else ok "$label  -> refused: $detail"; fi; else bad "$label  [$detail]"; fi
done < "$WORK/results.txt"
grep -i "error" "$WORK/behaviour.log" | head -3 | while read -r l; do bad "test file error: $l"; done

if AS "$PSQL -d reftest -f $WORK/001_rollback.sql" > "$WORK/rollback1.log" 2>&1; then bad "rollback should refuse when content exists"; else grep -q "Refusing to roll back" "$WORK/rollback1.log" && ok "rollback refuses while the reference holds content" || bad "rollback failed oddly: $(tail -2 $WORK/rollback1.log)"; fi

# ---------------------------------------------------------------- database 2: install then roll back on an empty reference
AS "$BIN/createdb -h $WORK -p 5498 -U postgres reftest2"
AS "$PSQL -d reftest2 -f $WORK/stub_supabase.sql" >/dev/null
snapshot reftest2 public > "$WORK/p2_before.txt"
AS "$PSQL -d reftest2 -f $WORK/001_wine_reference_foundation.sql" >/dev/null 2>&1
if AS "$PSQL -d reftest2 -f $WORK/001_rollback.sql" > "$WORK/rollback2.log" 2>&1; then ok "rollback on an empty reference runs"; else bad "rollback (empty): $(tail -2 $WORK/rollback2.log)"; fi
snapshot reftest2 public > "$WORK/p2_after.txt"
diff -q "$WORK/p2_before.txt" "$WORK/p2_after.txt" >/dev/null && ok "after rollback the public schema is exactly as before" || bad "public differs after rollback: $(diff $WORK/p2_before.txt $WORK/p2_after.txt | head -4)"
S=$(AS "$PSQL -d reftest2 -At -c \"select count(*) from pg_namespace where nspname='wine_reference'\""); [ "$S" = "0" ] && ok "after rollback the schema is gone" || bad "schema still there"
if AS "$PSQL -d reftest2 -f $WORK/001_wine_reference_foundation.sql" >/dev/null 2>&1; then ok "re-install after rollback runs"; else bad "re-install after rollback failed"; fi
# migration 001a (permissions): run twice; owner gets the four ref_* words once, other roles unchanged
AS "$PSQL -d reftest2 -f $WORK/001a_reference_permissions.sql" >/dev/null 2>&1 && AS "$PSQL -d reftest2 -f $WORK/001a_reference_permissions.sql" >/dev/null 2>&1 && ok "001a runs, and runs again" || bad "001a failed"
P=$(AS "$PSQL -d reftest2 -At -c \"select (select array_to_string(permissions, ',') from public.staff_roles where code = 'owner')||' / '||(select array_to_string(permissions, ',') from public.staff_roles where code = 'editor')||' / '||(select count(*) from wine_reference.schema_migrations)\"")
[ "$P" = "catalog_edit,quiz_verify,feedback_read,settings_edit,remove_content,found_online_photos,import_extended,owner_page,ref_edit,ref_review,ref_publish,ref_rights / catalog_edit,quiz_verify,feedback_read,import_extended / 2" ] && ok "001a: owner gains ref_edit, ref_review, ref_publish, ref_rights once; editor unchanged; registered" || bad "001a result: $P"

echo; echo "TOTAL: $PASS passed, $FAIL failed  (PostgreSQL $($BIN/postgres --version | awk '{print $3}'), local throwaway database)"
[ "$FAIL" = "0" ]

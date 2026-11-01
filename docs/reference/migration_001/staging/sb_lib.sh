#!/usr/bin/env bash
# STAGING ONLY. Shared helpers for the Phase 2.0B.4 runners: they talk ONLY to the disposable LOCAL Supabase stack's database container
# (docker exec into supabase_db_<project>), never to a hosted project. No password, key or URL is read or printed: psql runs inside the
# container over its local socket as the role postgres (Supabase's non-superuser owner role, as on hosted projects).
# Needs: SB_PROJECT_DIR (the scratch folder holding supabase/config.toml, never the repository) and SB_CLI (the supabase binary).
set -u
: "${SB_PROJECT_DIR:?set SB_PROJECT_DIR to the scratch Supabase project folder}"; : "${SB_CLI:?set SB_CLI to the supabase command}"
CTR="supabase_db_$(sed -n 's/^project_id *= *"\(.*\)"/\1/p' "$SB_PROJECT_DIR/supabase/config.toml")"
STAGING="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; MIG="$(dirname "$STAGING")"; TESTS="$MIG/tests"
FOUNDATION="${FOUNDATION:-$MIG/001_wine_reference_foundation.sql}"   # the migration under test (default: the committed release file)

# Safety: refuse to run if the scratch project was ever linked to a hosted project, or if the container is not a local one.
if [ -e "$SB_PROJECT_DIR/supabase/.temp/project-ref" ]; then echo "REFUSING: the scratch project is linked to a hosted project"; exit 3; fi
docker inspect "$CTR" >/dev/null 2>&1 || { echo "REFUSING: local container $CTR is not running"; exit 3; }

PASS=0; FAIL=0
ok()  { echo "PASS  $1"; PASS=$((PASS+1)); }
bad() { echo "FAIL  $1"; FAIL=$((FAIL+1)); }
PSQL() { docker exec -i "$CTR" psql -X -q -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"; }   # SQL on stdin or -c
PSQL_FILE() { PSQL "${@:2}" < "$1"; }
q() { PSQL -At -c "$1"; }

fresh() {   # $1 = compat | realistic | none: a brand-new local database (supabase db reset --local), then the stand-ins
  (cd "$SB_PROJECT_DIR" && "$SB_CLI" db reset --local >/dev/null 2>&1) || { echo "local reset failed"; exit 2; }
  for i in $(seq 1 30); do PSQL -At -c "select 1" >/dev/null 2>&1 && break; sleep 1; done
  case "$1" in compat) PSQL_FILE "$STAGING/prereq_compat.sql" >/dev/null || { echo "compat stand-ins failed"; exit 2; };;
               realistic) PSQL_FILE "$STAGING/prereq_realistic.sql" >/dev/null || { echo "realistic stand-ins failed"; exit 2; };; esac
}

snapshot() {   # $1 schema: the same structure listing as tests/run_local_tests.sh (Supabase's own extension functions left out)
  PSQL -At <<SQL
select 'table '||c.relname||' rls='||c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='$1' and c.relkind in ('r','v','m','p')
union all select 'column '||c.relname||'.'||a.attname||' '||format_type(a.atttypid,a.atttypmod)||' '||a.attnotnull from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='$1' and a.attnum>0 and not a.attisdropped and c.relkind in ('r','v','m','p')
union all select 'constraint '||conrelid::regclass||' '||pg_get_constraintdef(oid) from pg_constraint where connamespace=(select oid from pg_namespace where nspname='$1')
union all select 'index '||indexrelid::regclass||' '||pg_get_indexdef(indexrelid) from pg_index i join pg_class c on c.oid=i.indrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='$1'
union all select 'function '||p.oid::regprocedure||' definer='||p.prosecdef||' acl='||coalesce(p.proacl::text,'default') from pg_proc p join pg_namespace n on n.oid=p.pronamespace left join pg_depend d on d.objid=p.oid and d.deptype='e' where n.nspname='$1' and d.objid is null
union all select 'trigger '||tgrelid::regclass||' '||pg_get_triggerdef(t.oid) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='$1' and not tgisinternal
union all select 'policy '||tablename||'.'||policyname from pg_policies where schemaname='$1'
union all select 'grant '||table_name||' '||grantee||' '||privilege_type from information_schema.role_table_grants where table_schema='$1'
order by 1;
SQL
}

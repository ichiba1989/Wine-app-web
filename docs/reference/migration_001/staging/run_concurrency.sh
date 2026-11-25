#!/usr/bin/env bash
# STAGING ONLY (Phase 2.0B.4). Concurrent editorial transactions on the REAL local Supabase database:
#  the repository's scenarios, taken unchanged from tests/concurrency_tests.sh (extracted at run time, not copied): C1-C10, and since
#  release r5 also C11 (two versions of the same claim published at once), C12 (one version published twice) and the lock-order probes
#  D1-D3 (direct table writes by the owner against public.ref_review; they deadlocked on r4, Phase 2.0B.4 finding S-1).
# Every scenario starts from a brand-new local database (supabase db reset --local) with the stand-ins, migration 001 and the fixture.
# Session 1 holds its transaction HOLD seconds; session 2 starts DELAY seconds later, with a 20 s statement timeout.
. "$(dirname "$0")/sb_lib.sh"
HOLD="${HOLD:-1.5}"; DELAY="${DELAY:-0.4}"; WORK="${OUT:-/tmp/sb_conc}"; mkdir -p "$WORK"; 
setup() {
  fresh compat
  PSQL_FILE "$FOUNDATION" >/dev/null 2>&1 || { echo "migration failed"; exit 2; }
  PSQL_FILE "$TESTS/concurrency_fixture.sql" >/dev/null 2>&1 || { echo "fixture failed"; exit 2; }
}
U_A=aaaaaaaa-0000-0000-0000-00000000000a; U_B=aaaaaaaa-0000-0000-0000-00000000000b; U_C=aaaaaaaa-0000-0000-0000-00000000000c
staff() { echo "set local role authenticated; select set_config('request.jwt.claim.sub', '$1', true); $2"; }
owner() { echo "select set_config('request.jwt.claim.sub', '$1', true); $2"; }
pair() {   # same contract as tests/concurrency_tests.sh: sets S1, S2, W2; logs in $WORK/<name>.{1,2}.log
  DB="$1"; setup
  printf 'begin;\n%s\nselect pg_sleep(%s);\ncommit;\n' "$2" "$HOLD" > "$WORK/$DB.1.sql"
  printf 'begin;\n%s\ncommit;\n' "$3" > "$WORK/$DB.2.sql"
  PSQL < "$WORK/$DB.1.sql" > "$WORK/$DB.1.log" 2>&1 & P1=$!
  sleep "$DELAY"; T0=$(date +%s.%N)
  (echo "set statement_timeout = 20000;"; cat "$WORK/$DB.2.sql") | PSQL > "$WORK/$DB.2.log" 2>&1; S2=$?
  W2=$(echo "$(date +%s.%N) - $T0" | bc); wait $P1; S1=$?
}
q() { PSQL -At -c "${@: -1}"; }   # q [name] sql: the scenario name is ignored (each scenario has its own fresh database)
UNSOUND="select count(*) from wine_reference.claim_versions v where v.status = 'verified' and v.published_at is not null and v.suspended_at is null and not wine_reference.is_current(v.id)"
report() { echo "      session 1 exit $S1, session 2 exit $S2 after ${W2}s; $(grep -h ERROR $WORK/$1.1.log $WORK/$1.2.log | sed 's/.*ERROR: *//' | head -2 | tr '\n' ' ')"; }
inv_sound() { N=$(q $1 "$UNSOUND"); if [ "$N" = "0" ]; then ok "$2"; else bad "$2 ($N published version(s) left current although unsound)"; fi; report $1; }

# ------------------------------------------------ C1-C12 and D1-D3: the repository's scenarios, unchanged
SRC="$TESTS/concurrency_tests.sh"
eval "$(sed -n '/^# 1\. publish a claim version/,/^# 11\. the review history/p' "$SRC" | sed '$d')"

echo; echo "SUPABASE CONCURRENCY TOTAL: $PASS passed, $FAIL failed  (HOLD=${HOLD}s, DELAY=${DELAY}s, local Supabase $(q x "show server_version"))"
[ "$FAIL" = "0" ]

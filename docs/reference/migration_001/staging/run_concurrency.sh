#!/usr/bin/env bash
# STAGING ONLY (Phase 2.0B.4). Concurrent editorial transactions on the REAL local Supabase database:
#  * the repository's scenarios C1-C10, taken unchanged from tests/concurrency_tests.sh (extracted at run time, not copied),
#  * new: C11 two approved versions of the SAME claim published at the same time (both orders), C12 the same version published twice,
#  * new probes D1-D3 for lock-order inversions between direct table writes (the owner's SQL editor) and public.ref_review.
# Every scenario starts from a brand-new local database (supabase db reset --local) with the stand-ins, migration 001 and the fixture.
# Session 1 holds its transaction HOLD seconds; session 2 starts DELAY seconds later, with a 20 s statement timeout.
. "$(dirname "$0")/sb_lib.sh"
HOLD="${HOLD:-1.5}"; DELAY="${DELAY:-0.4}"; WORK="${OUT:-/tmp/sb_conc}"; mkdir -p "$WORK"
setup() {
  fresh compat
  PSQL_FILE "$FOUNDATION" >/dev/null 2>&1 || { echo "migration failed"; exit 2; }
  PSQL_FILE "$TESTS/concurrency_fixture.sql" >/dev/null 2>&1 || { echo "fixture failed"; exit 2; }
  PSQL_FILE "$STAGING/fixture_extra.sql" >/dev/null 2>&1 || { echo "extra fixture failed"; exit 2; }
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

# ------------------------------------------------ C1-C10: the repository's scenarios, unchanged
SRC="$TESTS/concurrency_tests.sh"
eval "$(sed -n '/^# 1\. publish a claim version/,/^# 11\. the review history/p' "$SRC" | sed '$d')"

# ------------------------------------------------ C11: two versions of the same claim (K2: F2 v1, F8 v2) published at the same time
F2=f0000000-0000-0000-0000-000000000002; F8=f0000000-0000-0000-0000-000000000008; K2=c0000000-0000-0000-0000-000000000002
c11_check() {   # $1 name, $2 the version published first (holding), $3 the version published second
  R=$(q $1 "select (select count(*) from wine_reference.claim_versions where claim_id = '$K2' and status = 'verified' and published_at is not null)
     ||' '||(select count(*) from wine_reference.current_claim_versions where claim_id = '$K2')
     ||' '||(select status::text||coalesce(','||(published_at is not null)::text,'') from wine_reference.claim_versions where id = '$2')
     ||' '||(select status::text||coalesce(','||(published_at is not null)::text,'') from wine_reference.claim_versions where id = '$3')
     ||' '||(select count(*) from wine_reference.review_events where decision = 'publish' and target_id in ('$2', '$3'))
     ||' '||(select count(*) from wine_reference.review_events where decision = 'retire' and target_id = '$2')
     ||' '||(select count(*) from wine_reference.change_log where table_name = 'claim_versions' and after ->> 'id' = '$2' and after ->> 'status' = 'retired')")
  echo "      [live versions, current, first, second, publish events, retire events for first, change_log retire rows for first] = $R"
  set -- $1 $2 $3 $R
  [ "$4" = "1" ] && [ "$5" = "1" ] && ok "$1: at most one live published version of the claim (exactly one; it is current)" || bad "$1: live/current = $4/$5"
  [ "$6" = "retired,true" ] && [ "$7" = "verified,true" ] && ok "$1: the version published first was retired; the one published last is live" || bad "$1: first=$6 second=$7"
  [ "$8" = "2" ] && ok "$1: both publications recorded once each in review_events" || bad "$1: publish events = $8"
  [ "${10}" -ge 1 ] && ok "$1: the automatic retirement of the first version is in change_log" || bad "$1: no change_log row for the retirement"
  [ "$9" = "0" ] && echo "      NOTE $1: the automatic retirement has NO review_events row (only change_log): see STAGING_CHANGE_REPORT.md, finding S-2" || echo "      $1: retire events = $9"
}
pair c11a "$(staff $U_B "select public.ref_review('claim_versions', '$F2', 'publish');")" "$(staff $U_C "select public.ref_review('claim_versions', '$F8', 'publish');")"
[ "$S1" = "0" ] && [ "$S2" = "0" ] && ok "C11a both publications succeed one after the other (session 2 waited ${W2}s for the editorial lock)" || bad "C11a exits $S1/$S2"; report c11a
c11_check c11a $F2 $F8
pair c11b "$(staff $U_B "select public.ref_review('claim_versions', '$F8', 'publish');")" "$(staff $U_C "select public.ref_review('claim_versions', '$F2', 'publish');")"
[ "$S1" = "0" ] && [ "$S2" = "0" ] && ok "C11b both publications succeed one after the other (session 2 waited ${W2}s)" || bad "C11b exits $S1/$S2"; report c11b
c11_check c11b $F8 $F2
echo "      NOTE C11b: version 1 (F2) published after version 2 (F8) replaces it: nothing stops an older version from replacing a newer live one (finding S-3)"
# C12: the same version published twice at the same time: one publication, the second is refused
pair c12 "$(staff $U_B "select public.ref_review('claim_versions', '$F2', 'publish');")" "$(staff $U_C "select public.ref_review('claim_versions', '$F2', 'publish');")"
N=$(q c12 "select count(*) from wine_reference.review_events where decision = 'publish' and target_id = '$F2'")
[ "$S1" = "0" ] && [ "$S2" != "0" ] && [ "$N" = "1" ] && ok "C12 the same version published twice at once: one publication, the second refused" || bad "C12 exits $S1/$S2, publish events $N"; report c12

# ------------------------------------------------ D1-D3: lock-order probes (direct writes as the database owner versus ref_review)
F9=f0000000-0000-0000-0000-000000000009; V1=51000000-0000-0000-0000-000000000001; R2=b0000000-0000-0000-0000-000000000002
deadlock_probe() {   # $1 name, $2 label; reports which session was aborted and checks that the database stayed consistent
  DL=$(grep -lh "deadlock detected" $WORK/$1.1.log $WORK/$1.2.log 2>/dev/null | wc -l)
  N=$(q $1 "$UNSOUND")
  if [ "$DL" -ge 1 ]; then echo "      $1: DEADLOCK detected by PostgreSQL (deadlock_timeout 1s); one transaction aborted and rolled back"; fi
  [ "$N" = "0" ] && ok "$2: no unsound published version afterwards (deadlocks so far: $DL)" || bad "$2: $N unsound"
  report $1
}
# D1: the owner edits draft F9 (row lock, no editorial lock), then adds evidence to it (editorial lock); meanwhile A submits F9
pair d1 "$(owner $U_A "update wine_reference.claim_versions set change_note = 'edited' where id = '$F9'; select pg_sleep(1); insert into wine_reference.claim_evidence (claim_version_id, source_version_id, modality, locator) values ('$F9', '$V1', 'documentary', 'd1');")" \
        "$(staff $U_A "select public.ref_review('claim_versions', '$F9', 'submit');")"
deadlock_probe d1 "D1 owner edits a draft version then adds evidence while it is submitted"
N=$(q d1 "select (select status::text from wine_reference.claim_versions where id = '$F9')||' '||(select count(*) from wine_reference.claim_evidence where claim_version_id = '$F9')||' '||(select change_note from wine_reference.claim_versions where id = '$F9')")
echo "      D1 outcome [status, evidence rows, change_note] = $N"
# D2: the owner touches draft claim K9 (its update triggers take the editorial lock BEFORE the row lock is kept: expected no inversion)
pair d2 "$(owner $U_A "update wine_reference.claims set object_entity_id = object_entity_id where id = 'c0000000-0000-0000-0000-000000000009'; select pg_sleep(1); insert into wine_reference.claim_evidence (claim_version_id, source_version_id, modality, locator) values ('$F9', '$V1', 'documentary', 'd2');")" \
        "$(staff $U_A "select public.ref_review('claim_versions', '$F9', 'submit');")"
deadlock_probe d2 "D2 owner edits a draft claim then adds evidence while its version is submitted"
# D3: the owner records a private copy under rights R2 (shared row lock on R2), then adds evidence (editorial lock); meanwhile C retires R2
pair d3 "$(owner $U_A "insert into wine_reference.source_versions (source_id, version_label, rights_id, storage_path) values ('50000000-0000-0000-0000-000000000001', 'v3', '$R2', 'private/x.pdf'); select pg_sleep(1); insert into wine_reference.claim_evidence (claim_version_id, source_version_id, modality, locator) values ('$F9', '$V1', 'documentary', 'd3');")" \
        "$(staff $U_C "select public.ref_review('rights_statements', '$R2', 'retire');")"
deadlock_probe d3 "D3 owner records a private copy then adds evidence while the rights are retired"

echo; echo "SUPABASE CONCURRENCY TOTAL: $PASS passed, $FAIL failed  (HOLD=${HOLD}s, DELAY=${DELAY}s, local Supabase $(q x "show server_version"))"
[ "$FAIL" = "0" ]

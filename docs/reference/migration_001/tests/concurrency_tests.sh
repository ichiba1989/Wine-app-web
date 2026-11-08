#!/usr/bin/env bash
# Concurrent editorial transactions (Phase 2.0B.3 final review, 2026-11-01). LOCAL THROWAWAY PostgreSQL ONLY; never Supabase.
# Each scenario gets a fresh copy of a fixture database (tests/concurrency_fixture.sql). Session 1 makes a change and holds its
# transaction open for HOLD seconds; session 2 starts DELAY seconds later and makes a conflicting change; then the invariants are
# checked. PostgreSQL's default isolation (READ COMMITTED), as on Supabase.
# Usage: bash concurrency_tests.sh [migration.sql]     (default: ../001_wine_reference_foundation.sql)
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; MIG="${1:-$(dirname "$HERE")/001_wine_reference_foundation.sql}"
BIN="${PGBIN:-/usr/lib/postgresql/16/bin}"; HOLD="${HOLD:-1.5}"; DELAY="${DELAY:-0.4}"
WORK="$(mktemp -d /tmp/refconc.XXXX)"; chmod 755 "$WORK"; chown postgres "$WORK" 2>/dev/null
cp "$HERE"/stub_supabase.sql "$HERE"/concurrency_fixture.sql "$WORK"/; cp "$MIG" "$WORK"/migration.sql; chmod 644 "$WORK"/*.sql
AS() { su postgres -s /bin/bash -c "$1"; }
PSQL="$BIN/psql -X -q -h $WORK -p 5496 -U postgres -v ON_ERROR_STOP=1"
PASS=0; FAIL=0; ok() { echo "PASS  $1"; PASS=$((PASS+1)); }; bad() { echo "FAIL  $1"; FAIL=$((FAIL+1)); }
AS "$BIN/initdb -D $WORK/data -A trust >/dev/null && $BIN/pg_ctl -D $WORK/data -o '-p 5496 -k $WORK' -l $WORK/log start >/dev/null" || { echo "could not start PostgreSQL"; exit 2; }
trap 'AS "$BIN/pg_ctl -D $WORK/data stop -m fast >/dev/null"; rm -rf "$WORK"' EXIT
AS "$BIN/createdb -h $WORK -p 5496 -U postgres tpl"
AS "$PSQL -d tpl -f $WORK/stub_supabase.sql" >/dev/null && AS "$PSQL -d tpl -f $WORK/migration.sql" >/dev/null 2>&1 \
  && AS "$PSQL -d tpl -f $WORK/concurrency_fixture.sql" >/dev/null 2>&1 || { echo "fixture failed"; AS "$PSQL -d tpl -f $WORK/concurrency_fixture.sql" 2>&1 | tail -3; exit 2; }

U_A=aaaaaaaa-0000-0000-0000-00000000000a; U_B=aaaaaaaa-0000-0000-0000-00000000000b; U_C=aaaaaaaa-0000-0000-0000-00000000000c
staff() { echo "set local role authenticated; select set_config('request.jwt.claim.sub', '$1', true); $2"; }   # $1 user, $2 statements
owner() { echo "select set_config('request.jwt.claim.sub', '$1', true); $2"; }                                    # as the database owner

# pair NAME "session-1 sql" "session-2 sql": runs them concurrently on a fresh copy of the fixture; sets S1, S2 (exit codes), W2 (seconds
# session 2 took: about HOLD-DELAY when it had to wait for session 1)
pair() {
  DB="$1"; AS "$BIN/createdb -h $WORK -p 5496 -U postgres -T tpl $DB"
  printf 'begin;\n%s\nselect pg_sleep(%s);\ncommit;\n' "$2" "$HOLD" > "$WORK/$DB.1.sql"
  printf 'begin;\n%s\ncommit;\n' "$3" > "$WORK/$DB.2.sql"; chmod 644 "$WORK/$DB".*.sql
  AS "$PSQL -d $DB -f $WORK/$DB.1.sql" > "$WORK/$DB.1.log" 2>&1 & P1=$!
  sleep "$DELAY"; T0=$(date +%s.%N)
  AS "$PSQL -d $DB -c 'set statement_timeout = 20000' -f $WORK/$DB.2.sql" > "$WORK/$DB.2.log" 2>&1; S2=$?
  W2=$(echo "$(date +%s.%N) - $T0" | bc); wait $P1; S1=$?
}
q() { AS "$PSQL -d $1 -At -c \"$2\""; }
UNSOUND="select count(*) from wine_reference.claim_versions v where v.status = 'verified' and v.published_at is not null and v.suspended_at is null and not wine_reference.is_current(v.id)"
report() { echo "      session 1 exit $S1, session 2 exit $S2 after ${W2}s; $(grep -h ERROR $WORK/$1.1.log $WORK/$1.2.log | sed 's/.*ERROR: *//' | head -2 | tr '\n' ' ')"; }
inv_sound() {   # $1 db, $2 label
  N=$(q $1 "$UNSOUND"); if [ "$N" = "0" ]; then ok "$2"; else bad "$2 ($N published version(s) left current although unsound)"; fi; report $1
}

# 1. publish a claim version while the source version its only evidence comes from is retired (both orders)
pair c1a "$(staff $U_B "select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000001', 'publish');")" \
         "$(staff $U_C "select public.ref_review('source_versions', '51000000-0000-0000-0000-000000000001', 'retire');")"
inv_sound c1a "C1a publish F1 (holding) while V1 (its only evidence) is retired: no unsound claim stays current"
pair c1b "$(staff $U_C "select public.ref_review('source_versions', '51000000-0000-0000-0000-000000000001', 'retire');")" \
         "$(staff $U_B "select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000001', 'publish');")"
inv_sound c1b "C1b retire V1 (holding) while F1 is published: no unsound claim stays current"
# 2. publish a version with a quote while the quote's rights statement is retired
pair c2a "$(staff $U_B "select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000002', 'publish');")" \
         "$(staff $U_C "select public.ref_review('rights_statements', 'b0000000-0000-0000-0000-000000000001', 'retire');")"
inv_sound c2a "C2a publish F2 (quote under R, holding) while R is retired"
pair c2b "$(staff $U_C "select public.ref_review('rights_statements', 'b0000000-0000-0000-0000-000000000001', 'retire');")" \
         "$(staff $U_B "select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000002', 'publish');")"
inv_sound c2b "C2b retire R (holding) while F2 is published"
# 3. publish a dependent version while the version it depends on is retired
pair c3a "$(staff $U_B "select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000004', 'publish');")" \
         "$(staff $U_C "select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000003', 'retire');")"
inv_sound c3a "C3a publish F4 (depends on F3, holding) while F3 is retired"
pair c3b "$(staff $U_C "select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000003', 'retire');")" \
         "$(staff $U_B "select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000004', 'publish');")"
inv_sound c3b "C3b retire F3 (holding) while F4 is published"
# 4. publish a claim while the entity it is about is retired
pair c4a "$(staff $U_B "select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000005', 'publish');")" \
         "$(staff $U_C "select public.ref_review('entities', 'e0000000-0000-0000-0000-000000000001', 'retire');")"
inv_sound c4a "C4a publish F5 (about E1, holding) while E1 is retired"
# 5. two editors retire the two display names of a published entity at the same time
pair c5 "$(staff $U_B "select public.ref_review('entity_names', 'a0000000-0000-0000-0000-000000000003', 'retire');")" \
        "$(staff $U_C "select public.ref_review('entity_names', 'a0000000-0000-0000-0000-000000000033', 'retire');")"
N=$(q c5 "select wine_reference.has_display_name('e0000000-0000-0000-0000-000000000003')::text")
[ "$N" = "true" ] && ok "C5 concurrent retirement of both display names of published E3: it keeps one" || bad "C5 published E3 was left with no display name"; report c5
# 6. two editors add the two halves of a cycle (E3 in E4, E4 in E3) at the same time
pair c6 "$(owner $U_A "insert into wine_reference.claims (subject_entity_id, relationship_type, object_entity_id) values ('e0000000-0000-0000-0000-000000000003', 'part_of', 'e0000000-0000-0000-0000-000000000004');")" \
        "$(owner $U_A "insert into wine_reference.claims (subject_entity_id, relationship_type, object_entity_id) values ('e0000000-0000-0000-0000-000000000004', 'part_of', 'e0000000-0000-0000-0000-000000000003');")"
N=$(q c6 "select count(*) from wine_reference.claims where relationship_type = 'part_of' and subject_entity_id in ('e0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000004') and object_entity_id in ('e0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000004')")
[ "$N" -le 1 ] && ok "C6 concurrent halves of a part_of cycle: at most one is stored" || bad "C6 a part_of cycle was stored ($N claims)"; report c6
# 7. two editors add the two halves of a dependency cycle (F7 needs F8, F8 needs F7) at the same time
pair c7 "$(owner $U_A "insert into wine_reference.claim_version_dependencies (dependent_version_id, depends_on_version_id) values ('f0000000-0000-0000-0000-000000000007', 'f0000000-0000-0000-0000-000000000008');")" \
        "$(owner $U_A "insert into wine_reference.claim_version_dependencies (dependent_version_id, depends_on_version_id) values ('f0000000-0000-0000-0000-000000000008', 'f0000000-0000-0000-0000-000000000007');")"
N=$(q c7 "select count(*) from wine_reference.claim_version_dependencies where dependent_version_id in ('f0000000-0000-0000-0000-000000000007', 'f0000000-0000-0000-0000-000000000008')")
[ "$N" -le 1 ] && ok "C7 concurrent halves of a dependency cycle: at most one is stored" || bad "C7 a dependency cycle was stored"; report c7
# 8. a version is submitted (content frozen) while evidence is being added to it
pair c8 "$(staff $U_A "select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000009', 'submit');")" \
        "$(owner $U_A "insert into wine_reference.claim_evidence (claim_version_id, source_version_id, modality, locator) values ('f0000000-0000-0000-0000-000000000009', '51000000-0000-0000-0000-000000000001', 'documentary', 'late');")"
N=$(q c8 "select (select status::text from wine_reference.claim_versions where id = 'f0000000-0000-0000-0000-000000000009') || ' ' || (select count(*) from wine_reference.claim_evidence where claim_version_id = 'f0000000-0000-0000-0000-000000000009')")
[ "$N" = "pending_review 0" ] && ok "C8 evidence added while the version is being submitted is refused (submitted content stays frozen)" || bad "C8 evidence reached a submitted version ($N)"; report c8
# 9. the same scenario in the other order: evidence added (holding), then the submit waits and includes it
pair c9 "$(owner $U_A "insert into wine_reference.claim_evidence (claim_version_id, source_version_id, modality, locator) values ('f0000000-0000-0000-0000-000000000009', '51000000-0000-0000-0000-000000000001', 'documentary', 'early');")" \
        "$(staff $U_A "select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000009', 'submit');")"
N=$(q c9 "select (select status::text from wine_reference.claim_versions where id = 'f0000000-0000-0000-0000-000000000009') || ' ' || (select count(*) from wine_reference.claim_evidence where claim_version_id = 'f0000000-0000-0000-0000-000000000009')")
[ "$N" = "pending_review 1" ] && ok "C9 evidence added first is included when the submit follows" || bad "C9 unexpected result ($N)"; report c9
# 10. the Owner self-approves (override, holding) while another editor rejects the same name: one decision wins, recorded once
U_O=aaaaaaaa-0000-0000-0000-00000000000d
pair c10 "$(staff $U_O "select public.ref_review('entity_names', 'a0000000-0000-0000-0000-000000000044', 'approve', 'owner checked');")" \
         "$(staff $U_B "select public.ref_review('entity_names', 'a0000000-0000-0000-0000-000000000044', 'reject');")"
N=$(q c10 "select (select status::text from wine_reference.entity_names where id = 'a0000000-0000-0000-0000-000000000044') || ' ' || (select count(*) from wine_reference.review_events where target_id = 'a0000000-0000-0000-0000-000000000044' and decision = 'approve' and owner_override) || ' ' || (select count(*) from wine_reference.review_events where target_id = 'a0000000-0000-0000-0000-000000000044' and decision = 'reject')")
[ "$N" = "verified 1 0" ] && ok "C10 Owner self-approval (holding) while an editor rejects the same row: the approval stands, recorded once as owner_override; the late rejection is refused" || bad "C10 unexpected result ($N)"; report c10
# 12-14 (release r5, from the Phase 2.0B.4 staging run): two versions of the SAME claim published at the same time (K2: F2 = v1,
# F11 = v3, both approved and unpublished), the same version published twice, and the lock-order probes D1-D3.
F2=f0000000-0000-0000-0000-000000000002; F11=f0000000-0000-0000-0000-000000000011; K2=c0000000-0000-0000-0000-000000000002
c11_state() { q $1 "select (select count(*) from wine_reference.claim_versions where claim_id = '$K2' and status = 'verified' and published_at is not null)
   ||' '||(select count(*) from wine_reference.current_claim_versions where claim_id = '$K2')
   ||' '||(select status::text||','||(published_at is not null)::text from wine_reference.claim_versions where id = '$F2')
   ||' '||(select status::text||','||(published_at is not null)::text from wine_reference.claim_versions where id = '$F11')
   ||' '||(select count(*) from wine_reference.review_events where decision = 'publish' and target_id in ('$F2', '$F11'))
   ||' '||(select count(*) from wine_reference.review_events where decision = 'retire' and target_id = '$F2')
   ||' '||(select count(*) from wine_reference.change_log where table_name = 'claim_versions' and after ->> 'id' = '$F2' and after ->> 'status' = 'retired')"; }
# 12a. v1 first (holding), then v3: both publish one after the other; v1 is retired with ONE retire event attributed to the second publisher
pair c11a "$(staff $U_B "select public.ref_review('claim_versions', '$F2', 'publish');")" "$(staff $U_C "select public.ref_review('claim_versions', '$F11', 'publish');")"
N=$(c11_state c11a); A=$(q c11a "select count(*) from wine_reference.review_events where decision = 'retire' and target_id = '$F2' and actor = '$U_C' and note = 'replaced by the publication of version $F11'")
[ "$S1" = "0" ] && [ "$S2" = "0" ] && [ "$N" = "1 1 retired,true verified,true 2 1 1" ] && [ "$A" = "1" ] \
  && ok "C11a v1 and v3 of one claim published at once: v3 live and current, v1 retired; one retire event (by the publisher of v3, naming v3) and the change_log row" \
  || bad "C11a [live current v1 v3 publish-events retire-events change_log] = $N, attributed $A, exits $S1/$S2"; report c11a
# 12b. v3 first (holding), then v1: the older version is refused (forward-only rule); v3 stays live; nothing retired
pair c11b "$(staff $U_B "select public.ref_review('claim_versions', '$F11', 'publish');")" "$(staff $U_C "select public.ref_review('claim_versions', '$F2', 'publish');")"
N=$(c11_state c11b)
[ "$S1" = "0" ] && [ "$S2" != "0" ] && [ "$N" = "1 1 verified,false verified,true 1 0 0" ] && grep -q "has been published, so version" "$WORK/c11b.2.log" \
  && ok "C11b v3 published, then v1 at the same time: v1 refused (newer version live), v3 stays the one current version" \
  || bad "C11b [live current v1 v3 publish-events retire-events change_log] = $N, exits $S1/$S2"; report c11b
# 13. the same version published twice at once: one publication, the second refused
pair c12 "$(staff $U_B "select public.ref_review('claim_versions', '$F2', 'publish');")" "$(staff $U_C "select public.ref_review('claim_versions', '$F2', 'publish');")"
N=$(q c12 "select count(*) from wine_reference.review_events where decision = 'publish' and target_id = '$F2'")
[ "$S1" = "0" ] && [ "$S2" != "0" ] && [ "$N" = "1" ] && ok "C12 the same version published twice at once: one publication, the second refused" || bad "C12 exits $S1/$S2, publish events $N"; report c12
# 14. lock-order probes: a direct write by the database owner (row first, then something that needs the editorial lock) against
#     ref_review (editorial lock first, then the row). On r4 D1 and D3 deadlocked; from r5 the write statement takes the lock first.
F9=f0000000-0000-0000-0000-000000000009; V1=51000000-0000-0000-0000-000000000001; R2=b0000000-0000-0000-0000-000000000002
no_deadlock() {   # $1 name, $2 label
  if grep -q "deadlock detected" "$WORK/$1.1.log" "$WORK/$1.2.log"; then bad "$2: DEADLOCK"
  elif [ "$S1" = "0" ] && [ "$S2" = "0" ] && [ "$(q $1 "$UNSOUND")" = "0" ]; then ok "$2: no deadlock, both transactions committed, nothing unsound"
  else bad "$2: exits $S1/$S2"; fi; report $1
}
pair d1 "$(owner $U_A "update wine_reference.claim_versions set change_note = 'edited' where id = '$F9'; select pg_sleep(1); insert into wine_reference.claim_evidence (claim_version_id, source_version_id, modality, locator) values ('$F9', '$V1', 'documentary', 'd1');")" \
        "$(staff $U_A "select public.ref_review('claim_versions', '$F9', 'submit');")"
no_deadlock d1 "D1 the owner edits a draft version, then adds evidence, while it is submitted"
N=$(q d1 "select (select status::text from wine_reference.claim_versions where id = '$F9')||' '||(select count(*) from wine_reference.claim_evidence where claim_version_id = '$F9')")
[ "$N" = "pending_review 1" ] && ok "D1 the submit waited for the owner's edit and includes its evidence" || bad "D1 outcome $N"
pair d2 "$(owner $U_A "update wine_reference.claims set object_entity_id = object_entity_id where id = 'c0000000-0000-0000-0000-000000000009'; select pg_sleep(1); insert into wine_reference.claim_evidence (claim_version_id, source_version_id, modality, locator) values ('$F9', '$V1', 'documentary', 'd2');")" \
        "$(staff $U_A "select public.ref_review('claim_versions', '$F9', 'submit');")"
no_deadlock d2 "D2 the owner touches a draft claim, then adds evidence, while its version is submitted"
pair d3 "$(owner $U_A "insert into wine_reference.source_versions (source_id, version_label, rights_id, storage_path) values ('50000000-0000-0000-0000-000000000001', 'v3', '$R2', 'private/x.pdf'); select pg_sleep(1); insert into wine_reference.claim_evidence (claim_version_id, source_version_id, modality, locator) values ('$F9', '$V1', 'documentary', 'd3');")" \
        "$(staff $U_C "select public.ref_review('rights_statements', '$R2', 'retire');")"
no_deadlock d3 "D3 the owner records a private copy under R2, then adds evidence, while R2 is retired"
# 11. the review history stays complete and the Owner override untouched by the locking (one approve recorded per decision)
N=$(q c1a "select count(*) from wine_reference.review_events where decision = 'suspend'")
echo "      (C1a: $N automatic suspension event(s) recorded)"
echo; echo "CONCURRENCY TOTAL: $PASS passed, $FAIL failed  (migration: $(basename "$MIG"), HOLD=${HOLD}s, DELAY=${DELAY}s)"
[ "$FAIL" = "0" ]

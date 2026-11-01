#!/usr/bin/env bash
# STAGING ONLY (Phase 2.0B.4). Performance smoke test on the LOCAL Supabase database at 100, 1,000 and 10,000 published claim versions
# (SIZES to change). Each size on a fresh database (supabase db reset --local), compat stand-ins, migration 001 r4, then perf.sql.
# Prints METRIC lines and the host's hardware. Smoke test only: one run per size, no warm-up, a 4-CPU shared container.
. "$(dirname "$0")/sb_lib.sh"
OUT="${OUT:-/tmp/sb_perf}"; mkdir -p "$OUT"
echo "host: $(nproc) CPU ($(grep -m1 'model name' /proc/cpuinfo | cut -d: -f2 | xargs)), $(free -g | awk '/Mem:/{print $2}') GB RAM, PostgreSQL $(q 'show server_version') in Docker; shared_buffers $(q 'show shared_buffers'), work_mem $(q 'show work_mem')"
for n in ${SIZES:-100 1000 10000}; do
  fresh compat
  PSQL_FILE "$FOUNDATION" >/dev/null 2>&1 || { echo "migration failed"; exit 2; }
  PSQL -v n="$n" < "$STAGING/perf.sql" > "$OUT/perf_$n.log" 2>&1 && ok "performance run at n = $n completed" || bad "performance run at n = $n: $(grep ERROR $OUT/perf_$n.log | head -2)"
  grep -o 'METRIC|.*' "$OUT/perf_$n.log" | sed "s/^METRIC|/  n=$n  /"
done
echo; echo "SUPABASE PERFORMANCE: $PASS runs completed, $FAIL failed"
[ "$FAIL" = "0" ]

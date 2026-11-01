-- STAGING ONLY (local Supabase). Performance smoke test at :n published claim versions. Synthetic rows ("Perf place 1" ...), never wine
-- facts. The bulk build is a TEST SHORTCUT: it writes the rows as published inside the review flag (wine_reference.in_review), which
-- only ref_review sets in real use; every trigger (checks, freezing, audit log) still runs on each row. The measured operations then
-- go through public.ref_review exactly as in production.
\set ON_ERROR_STOP 1
insert into public._stub_permissions select u, p from unnest(array['aaaaaaaa-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-00000000000b']::uuid[]) u,
  unnest(array['ref_edit', 'ref_review', 'ref_publish', 'ref_rights']) p on conflict do nothing;
update wine_reference.relationship_types set status = 'active' where code = 'part_of';
insert into public.app_config (key, value) values ('reference_enabled', '1') on conflict (key) do update set value = '1';
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-00000000000a', false);
\timing on
begin;
select set_config('wine_reference.in_review', 'on', true);
create temp table perf_t0 as select clock_timestamp() t;
insert into wine_reference.rights_statements (id, licence_code, status, checked_by, checked_at) values ('b0000000-0000-0000-0000-000000000001', 'perf', 'verified', 'aaaaaaaa-0000-0000-0000-00000000000b', now());
insert into wine_reference.sources (id, kind, title, status) values ('50000000-0000-0000-0000-000000000001', 'publication', 'Perf source', 'verified');
insert into wine_reference.source_versions (id, source_id, version_label, rights_id, status)
  select ('51000000-0000-0000-0000-' || lpad(k::text, 12, '0'))::uuid, '50000000-0000-0000-0000-000000000001', 'v' || k, 'b0000000-0000-0000-0000-000000000001', 'verified'
    from generate_series(1, greatest(:n / 100, 1) + 1) k;
insert into wine_reference.entities (id, kind, status, published_at, published_by)
  select ('e0000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'place', 'verified', now(), 'aaaaaaaa-0000-0000-0000-00000000000b' from generate_series(0, :n) i;
insert into wine_reference.entity_names (entity_id, name, language, name_kind, is_preferred, status)
  select ('e0000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'Perf place ' || i, 'en', 'common', true, 'verified' from generate_series(0, :n) i;
insert into wine_reference.claims (id, subject_entity_id, relationship_type, object_entity_id)
  select ('c0000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, ('e0000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'part_of', 'e0000000-0000-0000-0000-000000000000' from generate_series(1, :n) i;
insert into wine_reference.claim_versions (id, claim_id, version_no, risk_tier)
  select ('f0000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, ('c0000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 1, 2 from generate_series(1, :n) i;
insert into wine_reference.claim_evidence (claim_version_id, source_version_id, modality, locator)
  select ('f0000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, ('51000000-0000-0000-0000-' || lpad(((i - 1) / 100 + 1)::text, 12, '0'))::uuid, 'documentary', 'p. ' || i from generate_series(1, :n) i;
-- a dependency chain of 10 inside the first 100 (F2 needs F1, F3 needs F2 ... F10 needs F9)
insert into wine_reference.claim_version_dependencies (dependent_version_id, depends_on_version_id)
  select ('f0000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, ('f0000000-0000-0000-0000-' || lpad((i - 1)::text, 12, '0'))::uuid from generate_series(2, least(10, :n)) i;
update wine_reference.claim_versions set status = 'verified', published_at = now(), published_by = 'aaaaaaaa-0000-0000-0000-00000000000b';
select 'METRIC|build_seconds|' || round(extract(epoch from clock_timestamp() - t)::numeric, 2) from perf_t0;
commit;
\timing off
analyze;
select 'METRIC|published_current|' || count(*) from wine_reference.current_claim_versions;
select 'METRIC|change_log_rows|' || count(*) from wine_reference.change_log;

-- one new version of the last claim, written and approved, ready to publish
insert into wine_reference.claim_versions (id, claim_id, version_no, risk_tier) values ('f1000000-0000-0000-0000-000000000001', ('c0000000-0000-0000-0000-' || lpad(:n::text, 12, '0'))::uuid, 2, 2);
insert into wine_reference.claim_evidence (claim_version_id, source_version_id, modality, locator)
  values ('f1000000-0000-0000-0000-000000000001', ('51000000-0000-0000-0000-' || lpad((greatest(:n / 100, 1) + 1)::text, 12, '0'))::uuid, 'documentary', 'new');

create or replace function pg_temp.timed(p_user uuid, p_sql text, p_role text default 'authenticated') returns numeric language plpgsql as $f$
declare t0 timestamptz := clock_timestamp();
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  execute format('set local role %I', p_role);
  execute p_sql;
  execute 'reset role';
  return round(extract(epoch from clock_timestamp() - t0)::numeric * 1000, 1);
end $f$;
begin; select 'METRIC|submit_ms|' || pg_temp.timed('aaaaaaaa-0000-0000-0000-00000000000a', $$select public.ref_review('claim_versions', 'f1000000-0000-0000-0000-000000000001', 'submit')$$); commit;
begin; select 'METRIC|approve_ms|' || pg_temp.timed('aaaaaaaa-0000-0000-0000-00000000000b', $$select public.ref_review('claim_versions', 'f1000000-0000-0000-0000-000000000001', 'approve')$$); commit;
begin; select 'METRIC|publish_new_version_ms|' || pg_temp.timed('aaaaaaaa-0000-0000-0000-00000000000b', $$select public.ref_review('claim_versions', 'f1000000-0000-0000-0000-000000000001', 'publish')$$); commit;
select 'METRIC|old_version_retired|' || (select status::text from wine_reference.claim_versions where id = ('f0000000-0000-0000-0000-' || lpad(:n::text, 12, '0'))::uuid);
begin; select 'METRIC|retire_one_version_ms|' || pg_temp.timed('aaaaaaaa-0000-0000-0000-00000000000b', format($$select public.ref_review('claim_versions', '%s', 'retire')$$, ('f0000000-0000-0000-0000-' || lpad(greatest(:n - 1, 11)::text, 12, '0')))); commit;
begin; select 'METRIC|retire_source_version_transitive_ms|' || pg_temp.timed('aaaaaaaa-0000-0000-0000-00000000000b', $$select public.ref_review('source_versions', '51000000-0000-0000-0000-000000000001', 'retire')$$); commit;
select 'METRIC|suspended_by_that_retirement|' || count(*) from wine_reference.claim_versions where suspended_at is not null;
select 'METRIC|chain_end_F10_suspended|' || coalesce((select (suspended_at is not null)::text from wine_reference.claim_versions where id = ('f0000000-0000-0000-0000-' || lpad(least(10, :n)::text, 12, '0'))::uuid), 'n/a');
select 'METRIC|published_current_after|' || count(*) from wine_reference.current_claim_versions;
-- name lookup through the public door as a signed-out visitor: 20 calls each
begin; select 'METRIC|name_lookup_substring_avg_ms|' || round(pg_temp.timed(null, $$select count(*) from (select public.ref_published_names('Perf place 7', null, 50) from generate_series(1, 20)) x$$, 'anon') / 20, 2); commit;
begin; select 'METRIC|name_lookup_nomatch_avg_ms|' || round(pg_temp.timed(null, $$select count(*) from (select public.ref_published_names('zzz-none', null, 50) from generate_series(1, 20)) x$$, 'anon') / 20, 2); commit;
begin; select 'METRIC|name_lookup_all_first50_avg_ms|' || round(pg_temp.timed(null, $$select count(*) from (select public.ref_published_names(null, 'en', 50) from generate_series(1, 20)) x$$, 'anon') / 20, 2); commit;
-- the editorial lock: taking it uncontended (100 transactions), and how long a decision holds it (= what a second editor waits)
create or replace function pg_temp.lock_avg() returns numeric language plpgsql as $f$
declare t0 timestamptz; s numeric := 0;
begin
  for i in 1..100 loop t0 := clock_timestamp(); perform pg_advisory_xact_lock(20261101, 1); s := s + extract(epoch from clock_timestamp() - t0); end loop;
  return round(s * 1000 / 100, 4);
end $f$;
begin; select 'METRIC|editorial_lock_uncontended_avg_ms|' || pg_temp.lock_avg(); commit;
select 'METRIC|db_size_mb|' || round(pg_database_size(current_database()) / 1048576.0, 1);

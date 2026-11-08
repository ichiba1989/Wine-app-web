-- MIGRATION 001 RELEASE r5: REGRESSION TESTS for the Phase 2.0B.4 staging findings. LOCAL / DISPOSABLE TEST DATABASES ONLY: this file
-- WRITES test rows. Runs on a fresh database after the stand-ins, the migration and tests/concurrency_fixture.sql (its users A, B, C,
-- O and rows E1-E6, F1-F11, V1, V2, R, R2). Results land in t.results. Made-up test data, never wine facts.
--   S-1  lock order: every write statement on an editorial table takes the editorial lock first (statement trigger), even when it
--        changes no row; reads do not take it. (The deadlock itself is reproduced in tests/concurrency_tests.sh, probes D1-D3.)
--   S-2  the automatic retirement of the previous live version is recorded once in review_events, attributed to the publisher.
--   S-3  forward-only publication (owner decision 14, stricter): an older version is never published once a newer one has been
--        published, whatever happened to it since; older content comes back only as a new version.
--   S-5  TRUNCATE is refused on the reference tables (it skips the row rules).

create schema if not exists t;
create table if not exists t.results (n serial primary key, label text not null, passed boolean not null, detail text not null);
create or replace function t.run(p_label text, p_role text, p_uid uuid, p_sql text, p_expect text default 'ok') returns void
language plpgsql as $$
declare v_state text; v_msg text;
begin
  begin
    perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
    execute format('set local role %I', p_role);
    execute p_sql;
    execute 'reset role';
    insert into t.results (label, passed, detail)
    values (p_label, p_expect = 'ok', case when p_expect = 'ok' then 'ok' else 'expected ' || p_expect || ', but it succeeded' end);
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
    insert into t.results (label, passed, detail)
    values (p_label, p_expect <> 'ok' and (p_expect = 'error' or p_expect = v_state), v_state || ': ' || v_msg);
  end;
end $$;
create or replace function t.check(p_label text, p_role text, p_uid uuid, p_sql text) returns void
language plpgsql as $$
declare v_ok boolean; v_state text; v_msg text;
begin
  begin
    perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
    execute format('set local role %I', p_role);
    execute p_sql into v_ok;
    execute 'reset role';
    insert into t.results (label, passed, detail) values (p_label, coalesce(v_ok, false), coalesce(v_ok::text, 'null'));
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
    insert into t.results (label, passed, detail) values (p_label, false, v_state || ': ' || v_msg);
  end;
end $$;

-- ------------------------------------------------------------------ S-1: the editorial lock is taken by the write statement itself
do $$
declare v boolean;
begin
  update wine_reference.claim_versions set change_note = change_note where false;   -- a write statement that touches no row
  select exists (select 1 from pg_locks where locktype = 'advisory' and pid = pg_backend_pid() and classid = 20261101 and objid = 1 and granted) into v;
  insert into t.results (label, passed, detail) values ('r5 S-1: a write statement takes the editorial lock before touching any row (even one that changes no row)', v, v::text);
end $$;
do $$
declare v boolean; n bigint;
begin
  select count(*) into n from wine_reference.claim_versions;
  select not exists (select 1 from pg_locks where locktype = 'advisory' and pid = pg_backend_pid() and classid = 20261101 and objid = 1) into v;
  insert into t.results (label, passed, detail) values ('r5 S-1: reading the tables does not take the editorial lock', v, v::text);
end $$;
do $$
declare v boolean;
begin
  delete from wine_reference.claim_evidence where false;
  insert into wine_reference.entity_kinds (code, label, description, sort_order) select code, label, description, sort_order from wine_reference.entity_kinds where false;
  select exists (select 1 from pg_locks where locktype = 'advisory' and pid = pg_backend_pid() and classid = 20261101 and objid = 1 and granted) into v;
  insert into t.results (label, passed, detail) values ('r5 S-1: delete and insert statements (also on a controlled list) take it too', v, v::text);
end $$;
select t.check('r5 S-1: the lock trigger function is not executable by anon or authenticated', 'postgres', null,
  $q$select not has_function_privilege('anon', 'wine_reference.lock_before_write()', 'execute') and not has_function_privilege('authenticated', 'wine_reference.lock_before_write()', 'execute')$q$);
select t.check('r5 S-1: the lock trigger function is not security definer (runs with the writer''s own rights)', 'postgres', null,
  $q$select not prosecdef from pg_proc where oid = 'wine_reference.lock_before_write()'::regprocedure$q$);
select t.check('r5 S-1: every one of the 18 editorial tables has the statement-level lock trigger', 'postgres', null,
  $q$select count(*) = 18 from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'wine_reference' and t.tgname like '%\_lock\_first' and (t.tgtype & 1) = 0 and (t.tgtype & 2) = 2 and (t.tgtype & 28) = 28$q$);

-- ------------------------------------------------------------------ S-2: two versions of claim K2 published one after the other
select t.run('r5 S-2 setup: B publishes F2 (claim K2, version 1)', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b',
  $q$select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000002', 'publish')$q$);
select t.run('r5 S-2 setup: C publishes F11 (claim K2, version 3)', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000c',
  $q$select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000011', 'publish')$q$);
select t.check('r5 S-2: F2 was retired automatically and F11 is the one current version', 'postgres', null,
  $q$select (select status from wine_reference.claim_versions where id = 'f0000000-0000-0000-0000-000000000002') = 'retired'
        and (select array_agg(id) from wine_reference.current_claim_versions where claim_id = 'c0000000-0000-0000-0000-000000000002') = array['f0000000-0000-0000-0000-000000000011'::uuid]$q$);
select t.check('r5 S-2: the automatic retirement has exactly one review event', 'postgres', null,
  $q$select count(*) = 1 from wine_reference.review_events where target_id = 'f0000000-0000-0000-0000-000000000002' and decision = 'retire'$q$);
select t.check('r5 S-2: it is attributed to the person who published the replacement (C), names the replacement, verified -> retired, no override', 'postgres', null,
  $q$select actor = 'aaaaaaaa-0000-0000-0000-00000000000c' and note = 'replaced by the publication of version f0000000-0000-0000-0000-000000000011'
            and from_status = 'verified' and to_status = 'retired' and not owner_override and target_table = 'claim_versions'
       from wine_reference.review_events where target_id = 'f0000000-0000-0000-0000-000000000002' and decision = 'retire'$q$);
select t.check('r5 S-2: it is written before the publish event of the replacement, in the same transaction', 'postgres', null,
  $q$select r.id < p.id and r.acted_at = p.acted_at
       from wine_reference.review_events r, wine_reference.review_events p
      where r.target_id = 'f0000000-0000-0000-0000-000000000002' and r.decision = 'retire'
        and p.target_id = 'f0000000-0000-0000-0000-000000000011' and p.decision = 'publish'$q$);
select t.check('r5 S-2: the change_log still records the retirement (before verified, after retired)', 'postgres', null,
  $q$select exists (select 1 from wine_reference.change_log where table_name = 'claim_versions' and row_key = 'f0000000-0000-0000-0000-000000000002'
                      and before ->> 'status' = 'verified' and after ->> 'status' = 'retired')$q$);
select t.check('r5 S-2: the first publication (of F2, with nothing live before it) wrote no retire event', 'postgres', null,
  $q$select count(*) = 1 from wine_reference.review_events where decision = 'retire'$q$);
select t.run('r5 S-2: the retired F2 cannot be published again', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b',
  $q$select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000002', 'publish')$q$, '22023');

-- ------------------------------------------------------------------ S-3: forward-only publication (claim K5: F5 = v1, F7 = v2)
select t.run('r5 S-3 setup: evidence for draft F7 (claim K5, version 2)', 'postgres', 'aaaaaaaa-0000-0000-0000-00000000000a',
  $q$insert into wine_reference.claim_evidence (claim_version_id, source_version_id, modality, locator) values ('f0000000-0000-0000-0000-000000000007', '51000000-0000-0000-0000-000000000002', 'documentary', 'p. 7')$q$);
select t.run('r5 S-3 setup: A submits F7', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000a',
  $q$select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000007', 'submit')$q$);
select t.run('r5 S-3 setup: B approves F7', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b',
  $q$select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000007', 'approve')$q$);
select t.run('r5 S-3 setup: B publishes F7 (version 2) while F5 (version 1) is approved but unpublished', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b',
  $q$select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000007', 'publish')$q$);
select t.run('r5 S-3: publishing the OLDER F5 while the newer F7 is live is refused', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b',
  $q$select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000005', 'publish')$q$, '23514');
select t.run('r5 S-3: ... also for the Owner', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000d',
  $q$select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000005', 'publish')$q$, '23514');
select t.check('r5 S-3: F7 is still the one current version and F5 unpublished; no event recorded for the refusals', 'postgres', null,
  $q$select (select array_agg(id) from wine_reference.current_claim_versions where claim_id = 'c0000000-0000-0000-0000-000000000005') = array['f0000000-0000-0000-0000-000000000007'::uuid]
        and (select published_at is null from wine_reference.claim_versions where id = 'f0000000-0000-0000-0000-000000000005')
        and not exists (select 1 from wine_reference.review_events where target_id = 'f0000000-0000-0000-0000-000000000005' and decision = 'publish')$q$);
select t.run('r5 S-3: B may retire the newer F7 (its own recorded decision)', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b',
  $q$select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000007', 'retire', 'bringing version 1 content back')$q$);
select t.run('r5 S-3 (decision 14): the older F5 is still refused after the newer F7 was retired', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b',
  $q$select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000005', 'publish')$q$, '23514');
select t.run('r5 S-3 (decision 14): ... also for the Owner', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000d',
  $q$select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000005', 'publish')$q$, '23514');
select t.run('r5 S-3: restoring as a new version: F13 (claim K5, version 3) is written with evidence', 'postgres', 'aaaaaaaa-0000-0000-0000-00000000000a',
  $q$insert into wine_reference.claim_versions (id, claim_id, version_no, risk_tier, supersedes_version_id, change_note)
       values ('f0000000-0000-0000-0000-000000000013', 'c0000000-0000-0000-0000-000000000005', 3, 2, 'f0000000-0000-0000-0000-000000000007', 'restores the content of version 1');
     insert into wine_reference.claim_evidence (claim_version_id, source_version_id, modality, locator) values ('f0000000-0000-0000-0000-000000000013', '51000000-0000-0000-0000-000000000002', 'documentary', 'p. 13')$q$);
select t.run('r5 S-3: A submits F13', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000a',
  $q$select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000013', 'submit')$q$);
select t.run('r5 S-3: B approves and publishes F13 (forward publication)', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b',
  $q$select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000013', 'approve'), public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000013', 'publish')$q$);
select t.check('r5 S-3: F13 is the current version of K5; F5 was never published; F7 has exactly one retire event (the explicit one, with its note)', 'postgres', null,
  $q$select (select array_agg(id) from wine_reference.current_claim_versions where claim_id = 'c0000000-0000-0000-0000-000000000005') = array['f0000000-0000-0000-0000-000000000013'::uuid]
        and (select published_at is null from wine_reference.claim_versions where id = 'f0000000-0000-0000-0000-000000000005')
        and (select count(*) = 1 and bool_and(note = 'bringing version 1 content back') from wine_reference.review_events where target_id = 'f0000000-0000-0000-0000-000000000007' and decision = 'retire')$q$);
select t.run('r5 S-3: the retired F7 cannot be published again', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b',
  $q$select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000007', 'publish')$q$, '22023');
-- a SUSPENDED newer version also blocks an older one (claim K1: F1 = v1 approved and unpublished; F12 = v2 published, then suspended)
select t.run('r5 S-3 setup: source version V3 and version F12 (claim K1, version 2) with evidence from V3', 'postgres', 'aaaaaaaa-0000-0000-0000-00000000000a',
  $q$insert into wine_reference.source_versions (id, source_id, version_label, rights_id) values ('51000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000001', 'v3', 'b0000000-0000-0000-0000-000000000001');
     insert into wine_reference.claim_versions (id, claim_id, version_no, risk_tier) values ('f0000000-0000-0000-0000-000000000012', 'c0000000-0000-0000-0000-000000000001', 2, 2);
     insert into wine_reference.claim_evidence (claim_version_id, source_version_id, modality, locator) values ('f0000000-0000-0000-0000-000000000012', '51000000-0000-0000-0000-000000000003', 'documentary', 'p. 12')$q$);
select t.run('r5 S-3 setup: A submits V3 and F12', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000a',
  $q$select public.ref_review('source_versions', '51000000-0000-0000-0000-000000000003', 'submit'), public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000012', 'submit')$q$);
select t.run('r5 S-3 setup: B approves V3 and F12, and publishes F12', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b',
  $q$select public.ref_review('source_versions', '51000000-0000-0000-0000-000000000003', 'approve'), public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000012', 'approve'),
            public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000012', 'publish')$q$);
select t.run('r5 S-3 setup: C retires V3, which suspends F12', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000c',
  $q$select public.ref_review('source_versions', '51000000-0000-0000-0000-000000000003', 'retire')$q$);
select t.check('r5 S-3 setup check: F12 is suspended, published, not retired', 'postgres', null,
  $q$select suspended_at is not null and status = 'verified' from wine_reference.claim_versions where id = 'f0000000-0000-0000-0000-000000000012'$q$);
select t.run('r5 S-3: an older version is not published while a newer one is suspended but not retired', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b',
  $q$select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000001', 'publish')$q$, '23514');
select t.run('r5 S-3: B retires the suspended F12', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b',
  $q$select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000012', 'retire', 'its source was withdrawn')$q$);
select t.run('r5 S-3 (decision 14): the older F1 is still refused after the suspended F12 was retired', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b',
  $q$select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000001', 'publish')$q$, '23514');
select t.check('r5 S-3: K1 has no current version until its content is written again as a new version', 'postgres', null,
  $q$select not exists (select 1 from wine_reference.current_claim_versions where claim_id = 'c0000000-0000-0000-0000-000000000001')
        and (select published_at is null from wine_reference.claim_versions where id = 'f0000000-0000-0000-0000-000000000001')$q$);

-- ------------------------------------------------------------------ S-5: TRUNCATE is refused, even for the database owner
select t.run('r5 S-5: TRUNCATE review_events is refused', 'postgres', null, $q$truncate wine_reference.review_events$q$, '42501');
select t.run('r5 S-5: TRUNCATE change_log is refused', 'postgres', null, $q$truncate wine_reference.change_log$q$, '42501');
select t.run('r5 S-5: TRUNCATE claim_evidence is refused', 'postgres', null, $q$truncate wine_reference.claim_evidence$q$, '42501');
select t.run('r5 S-5: TRUNCATE claim_version_dependencies is refused', 'postgres', null, $q$truncate wine_reference.claim_version_dependencies$q$, '42501');
select t.run('r5 S-5: TRUNCATE ... CASCADE on entities is refused', 'postgres', null, $q$truncate wine_reference.entities cascade$q$, 'error');
select t.check('r5 S-5: after the attempts the history and content are all still there', 'postgres', null,
  $q$select (select count(*) from wine_reference.review_events) > 50 and (select count(*) from wine_reference.change_log) > 50
        and (select count(*) from wine_reference.entities) = 6 and (select count(*) from wine_reference.claim_evidence) > 5$q$);

-- ------------------------------------------------------------------ the verify script's new audit checks hold on this history
select t.check('r5 audit: every claim version retired after publication has a retire event, and none has two', 'postgres', null,
  $q$select not exists (select 1 from wine_reference.claim_versions v where v.status = 'retired' and v.published_at is not null
                         and not exists (select 1 from wine_reference.review_events e where e.target_id = v.id and e.decision = 'retire'))
        and not exists (select 1 from wine_reference.review_events where decision = 'retire' and target_table = 'claim_versions' group by target_id having count(*) > 1)$q$);
select t.check('r5 health: every published, unsuspended claim version is current', 'postgres', null,
  $q$select not exists (select 1 from wine_reference.claim_versions v where v.status = 'verified' and v.published_at is not null
                         and v.suspended_at is null and not wine_reference.is_current(v.id))$q$);

-- MIGRATION 001: BEHAVIOUR AND NEGATIVE TESTS. LOCAL TEST DATABASE ONLY: this file WRITES test rows and must NEVER be run on Supabase.
-- Run by tests/run_local_tests.sh after stub_supabase.sql and the migration. Each line is one test; results land in t.results and the
-- runner prints them. Staff steps pass ids directly: the signed-in role cannot read the private tables (that is one of the things tested). Users: A = author (ref_edit, ref_review), B = reviewer and publisher (ref_edit, ref_review, ref_publish, ref_rights),
-- C = signed in with no permission. The rows are made-up test data ("Test place 1" ...), never wine facts.

create schema if not exists t;
create table if not exists t.results (n serial primary key, label text not null, passed boolean not null, detail text not null);

-- Run one statement as a role and a user. p_expect: 'ok', a SQLSTATE such as '42501', or 'error' (any error).
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

-- Check a condition (a query returning one boolean) as a role and a user.
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

insert into public._stub_permissions values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'ref_edit'), ('aaaaaaaa-0000-0000-0000-00000000000a', 'ref_review'),
  ('aaaaaaaa-0000-0000-0000-00000000000b', 'ref_edit'), ('aaaaaaaa-0000-0000-0000-00000000000b', 'ref_review'),
  ('aaaaaaaa-0000-0000-0000-00000000000b', 'ref_publish'), ('aaaaaaaa-0000-0000-0000-00000000000b', 'ref_rights')
on conflict do nothing;

-- ------------------------------------------------------------------------------------------------ setup (owner, as author A)
select t.run('setup: owner activates part_of, genetic_parent_of, holds_interest_in', 'postgres', null,
  $q$update wine_reference.relationship_types set status = 'active' where code in ('part_of', 'genetic_parent_of', 'holds_interest_in')$q$);
select t.run('setup: owner adds an active test attribute type', 'postgres', null,
  $q$insert into wine_reference.attribute_types (code, label, subject_kinds, value_type, status) values ('test_number', 'Test number', '{producer}', 'number', 'active')$q$);
select t.run('setup: author A creates test entities', 'postgres', 'aaaaaaaa-0000-0000-0000-00000000000a',
  $q$insert into wine_reference.entities (id, kind) values
     ('e0000000-0000-0000-0000-000000000001', 'place'), ('e0000000-0000-0000-0000-000000000002', 'place'),
     ('e0000000-0000-0000-0000-000000000003', 'place'), ('e0000000-0000-0000-0000-000000000004', 'grape_variety'),
     ('e0000000-0000-0000-0000-000000000005', 'grape_variety'), ('e0000000-0000-0000-0000-000000000006', 'producer'),
     ('e0000000-0000-0000-0000-000000000007', 'legal_entity'), ('e0000000-0000-0000-0000-000000000008', 'brand'),
     ('e0000000-0000-0000-0000-000000000011', 'taxonomy_domain'), ('e0000000-0000-0000-0000-000000000012', 'taxonomy_domain'),
     ('e0000000-0000-0000-0000-000000000021', 'taxonomy_node'), ('e0000000-0000-0000-0000-000000000022', 'taxonomy_node'),
     ('e0000000-0000-0000-0000-000000000023', 'taxonomy_node'), ('e0000000-0000-0000-0000-000000000024', 'taxonomy_node')$q$);
select t.run('setup: names for the test entities', 'postgres', 'aaaaaaaa-0000-0000-0000-00000000000a',
  $q$insert into wine_reference.entity_names (id, entity_id, name, language, name_kind, is_preferred) values
     ('a0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'Test place 1', 'en', 'common', true),
     ('a0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000002', 'Test place 2', 'en', 'common', true),
     ('a0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000003', 'Test place 3', 'en', 'common', true),
     ('a0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000004', 'Test grape 1', 'en', 'common', true),
     ('a0000000-0000-0000-0000-000000000005', 'e0000000-0000-0000-0000-000000000005', 'Test grape 2', 'en', 'common', true),
     ('a0000000-0000-0000-0000-000000000006', 'e0000000-0000-0000-0000-000000000001', 'Testort eins', 'de', 'translation', true),
     ('a0000000-0000-0000-0000-000000000007', 'e0000000-0000-0000-0000-000000000001', 'tp1', 'en', 'shortcut', false)$q$);
select t.run('setup: a source and two versions, rights statements', 'postgres', 'aaaaaaaa-0000-0000-0000-00000000000a',
  $q$insert into wine_reference.sources (id, kind, title) values ('50000000-0000-0000-0000-000000000001', 'publication', 'Test source');
     insert into wine_reference.rights_statements (id, licence_code, allows_quote) values
       ('b0000000-0000-0000-0000-000000000001', 'test-no-quote', false), ('b0000000-0000-0000-0000-000000000002', 'test-quote-ok', true);
     insert into wine_reference.source_versions (id, source_id, version_label, rights_id) values
       ('51000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'v1', 'b0000000-0000-0000-0000-000000000002'),
       ('51000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', 'v2', null)$q$);

-- ------------------------------------------------------------------------------------------------ foreign keys and uniqueness
select t.run('FK: an entity of an unknown kind is refused', 'postgres', null,
  $q$insert into wine_reference.entities (kind) values ('wine_edition')$q$, '23503');
select t.run('unique: the same name twice for one entity, language and kind is refused', 'postgres', null,
  $q$insert into wine_reference.entity_names (entity_id, name, language, name_kind) values ('e0000000-0000-0000-0000-000000000001', 'TEST PLACE 1', 'en', 'common')$q$, '23505');
select t.run('unique: two preferred names in one language are refused', 'postgres', null,
  $q$insert into wine_reference.entity_names (entity_id, name, language, name_kind, is_preferred) values ('e0000000-0000-0000-0000-000000000001', 'Another', 'en', 'label', true)$q$, '23505');
select t.run('check: a malformed language tag is refused', 'postgres', null,
  $q$insert into wine_reference.entity_names (entity_id, name, language, name_kind) values ('e0000000-0000-0000-0000-000000000002', 'X', 'English', 'common')$q$, '23514');
select t.run('FK: a claim about a missing entity is refused', 'postgres', null,
  $q$insert into wine_reference.claims (subject_entity_id, relationship_type, object_entity_id) values ('e0000000-0000-0000-0000-000000000099', 'part_of', 'e0000000-0000-0000-0000-000000000001')$q$, '23503');
select t.run('unique: the same source version label twice is refused', 'postgres', null,
  $q$insert into wine_reference.source_versions (source_id, version_label) values ('50000000-0000-0000-0000-000000000001', 'v1')$q$, '23505');
select t.run('rights: a private copy without a rights statement is refused', 'postgres', null,
  $q$insert into wine_reference.source_versions (source_id, version_label, storage_path) values ('50000000-0000-0000-0000-000000000001', 'v3', 'x/y.pdf')$q$, '23514');
select t.run('check: a claim with both shapes (relationship and attribute) is refused', 'postgres', null,
  $q$insert into wine_reference.claims (subject_entity_id, relationship_type, object_entity_id, attribute_type) values ('e0000000-0000-0000-0000-000000000001', 'part_of', 'e0000000-0000-0000-0000-000000000002', 'test_number')$q$, '23514');
select t.run('check: a claim about itself is refused', 'postgres', null,
  $q$insert into wine_reference.claims (subject_entity_id, relationship_type, object_entity_id) values ('e0000000-0000-0000-0000-000000000001', 'part_of', 'e0000000-0000-0000-0000-000000000001')$q$, '23514');

-- ------------------------------------------------------------------------------------------------ taxonomy
select t.run('taxonomy: a domain must be an entity of kind taxonomy_domain', 'postgres', null,
  $q$insert into wine_reference.taxonomy_domains (entity_id, code, sort_order) values ('e0000000-0000-0000-0000-000000000001', 'TEST-X', 9)$q$, '23514');
select t.run('setup: two test domains and a chain of nodes N1 > N2 > N3', 'postgres', null,
  $q$insert into wine_reference.taxonomy_domains (entity_id, code, sort_order) values ('e0000000-0000-0000-0000-000000000011', 'TEST-D1', 1), ('e0000000-0000-0000-0000-000000000012', 'TEST-D2', 2);
     insert into wine_reference.taxonomy_nodes (entity_id, domain_id, parent_id, code) values
       ('e0000000-0000-0000-0000-000000000021', 'e0000000-0000-0000-0000-000000000011', null, 'TEST-N1'),
       ('e0000000-0000-0000-0000-000000000022', 'e0000000-0000-0000-0000-000000000011', 'e0000000-0000-0000-0000-000000000021', 'TEST-N2'),
       ('e0000000-0000-0000-0000-000000000023', 'e0000000-0000-0000-0000-000000000011', 'e0000000-0000-0000-0000-000000000022', 'TEST-N3')$q$);
select t.run('taxonomy: a cycle (N1 under N3) is refused', 'postgres', null,
  $q$update wine_reference.taxonomy_nodes set parent_id = 'e0000000-0000-0000-0000-000000000023' where entity_id = 'e0000000-0000-0000-0000-000000000021'$q$, '23514');
select t.run('taxonomy: a node whose parent is in another domain is refused', 'postgres', null,
  $q$insert into wine_reference.taxonomy_nodes (entity_id, domain_id, parent_id, code) values ('e0000000-0000-0000-0000-000000000024', 'e0000000-0000-0000-0000-000000000012', 'e0000000-0000-0000-0000-000000000021', 'TEST-N4')$q$, '23514');
select t.run('taxonomy: a node must be an entity of kind taxonomy_node', 'postgres', null,
  $q$insert into wine_reference.taxonomy_nodes (entity_id, domain_id, code) values ('e0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000011', 'TEST-N9')$q$, '23514');
select t.run('taxonomy: assignments, then a second primary for one entity is refused', 'postgres', null,
  $q$insert into wine_reference.taxonomy_assignments (entity_id, node_id, is_primary) values ('e0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000021', true);
     insert into wine_reference.taxonomy_assignments (entity_id, node_id, is_primary) values ('e0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000022', true)$q$, '23505');

-- ------------------------------------------------------------------------------------------------ claim types and relationship cycles
select t.run('types: a claim with a proposed (inactive) relationship type is refused', 'postgres', null,
  $q$insert into wine_reference.claims (subject_entity_id, relationship_type, object_entity_id) values ('e0000000-0000-0000-0000-000000000008', 'brand_of', 'e0000000-0000-0000-0000-000000000006')$q$, '23514');
select t.run('types: part_of between a grape and a place is refused', 'postgres', null,
  $q$insert into wine_reference.claims (subject_entity_id, relationship_type, object_entity_id) values ('e0000000-0000-0000-0000-000000000004', 'part_of', 'e0000000-0000-0000-0000-000000000001')$q$, '23514');
select t.run('setup: part_of claims P1 in P2, P2 in P3', 'postgres', 'aaaaaaaa-0000-0000-0000-00000000000a',
  $q$insert into wine_reference.claims (id, subject_entity_id, relationship_type, object_entity_id) values
     ('c0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'part_of', 'e0000000-0000-0000-0000-000000000002'),
     ('c0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000002', 'part_of', 'e0000000-0000-0000-0000-000000000003')$q$);
select t.run('cycles: P3 in P1 (closing a loop) is refused', 'postgres', null,
  $q$insert into wine_reference.claims (subject_entity_id, relationship_type, object_entity_id) values ('e0000000-0000-0000-0000-000000000003', 'part_of', 'e0000000-0000-0000-0000-000000000001')$q$, '23514');

-- ------------------------------------------------------------------------------------------------ temporal validity and values
select t.run('dates: a name valid_to before valid_from is refused', 'postgres', null,
  $q$insert into wine_reference.entity_names (entity_id, name, language, name_kind, valid_from, valid_to) values ('e0000000-0000-0000-0000-000000000002', 'Old name', 'en', 'historical', '1990-01-01', '1980-01-01')$q$, '23514');
select t.run('dates: a claim version valid_to before valid_from is refused', 'postgres', null,
  $q$insert into wine_reference.claim_versions (claim_id, version_no, risk_tier, valid_from, valid_to) values ('c0000000-0000-0000-0000-000000000001', 9, 2, '2000-01-01', '1999-01-01')$q$, '23514');
select t.run('setup: an ownership claim (legal entity holds an interest in producer)', 'postgres', 'aaaaaaaa-0000-0000-0000-00000000000a',
  $q$insert into wine_reference.claims (id, subject_entity_id, relationship_type, object_entity_id) values ('c0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000007', 'holds_interest_in', 'e0000000-0000-0000-0000-000000000006')$q$);
select t.run('dates: an ownership version with no start date and no "dates unknown" is refused', 'postgres', null,
  $q$insert into wine_reference.claim_versions (claim_id, version_no, risk_tier) values ('c0000000-0000-0000-0000-000000000003', 1, 2)$q$, '23514');
select t.run('values: a share of 150 percent is refused', 'postgres', null,
  $q$insert into wine_reference.claim_versions (claim_id, version_no, risk_tier, valid_from, qualifiers) values ('c0000000-0000-0000-0000-000000000003', 1, 2, '2001-01-01', '{"share_percent": 150}')$q$, '23514');
select t.run('dates: an ownership version with "dates unknown" stated is accepted', 'postgres', 'aaaaaaaa-0000-0000-0000-00000000000a',
  $q$insert into wine_reference.claim_versions (claim_id, version_no, risk_tier, qualifiers) values ('c0000000-0000-0000-0000-000000000003', 1, 2, '{"dates_unknown": true, "share_percent": 40}')$q$);
select t.run('values: a number attribute given only as text is refused', 'postgres', 'aaaaaaaa-0000-0000-0000-00000000000a',
  $q$insert into wine_reference.claims (id, subject_entity_id, attribute_type) values ('c0000000-0000-0000-0000-000000000009', 'e0000000-0000-0000-0000-000000000006', 'test_number');
     insert into wine_reference.claim_versions (claim_id, version_no, risk_tier, value_text) values ('c0000000-0000-0000-0000-000000000009', 1, 2, 'twelve')$q$, '23514');

-- ------------------------------------------------------------------------------------------------ editorial rules and provenance
select t.run('editorial: inserting a row already verified is refused', 'postgres', null,
  $q$insert into wine_reference.entities (kind, status) values ('place', 'verified')$q$, '42501');
select t.run('editorial: changing a status by a plain update is refused', 'postgres', null,
  $q$update wine_reference.entities set status = 'pending_review' where id = 'e0000000-0000-0000-0000-000000000001'$q$, '42501');
select t.run('setup: claim version CV1 (P1 in P2, v1) by A, with no evidence', 'postgres', 'aaaaaaaa-0000-0000-0000-00000000000a',
  $q$insert into wine_reference.claim_versions (id, claim_id, version_no, risk_tier) values ('f0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 1, 2)$q$);
select t.run('review: signed-out callers cannot use ref_review', 'anon', null,
  $q$select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000001', 'submit')$q$, '42501');
select t.run('review: a signed-in user with no permission is refused', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000c',
  $q$select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000001', 'submit')$q$, '42501');
select t.run('review: a call with no signed-in user is refused', 'authenticated', null,
  $q$select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000001', 'submit')$q$, '42501');
select t.run('review: author A submits CV1', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000a',
  $q$select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000001', 'submit')$q$);
select t.run('provenance: editing CV1 after submission is refused', 'postgres', null,
  $q$update wine_reference.claim_versions set value_text = 'changed' where id = 'f0000000-0000-0000-0000-000000000001'$q$, '42501');
select t.run('provenance: adding evidence to a submitted version is refused', 'postgres', null,
  $q$insert into wine_reference.claim_evidence (claim_version_id, source_version_id, modality, locator) values ('f0000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'documentary', 'p. 1')$q$, '42501');
select t.run('provenance: deleting a submitted version is refused', 'postgres', null,
  $q$delete from wine_reference.claim_versions where id = 'f0000000-0000-0000-0000-000000000001'$q$, '42501');
select t.run('two-person rule: author A cannot approve their own CV1', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000a',
  $q$select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000001', 'approve')$q$, '42501');
select t.run('review: B approves CV1', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b',
  $q$select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000001', 'approve')$q$);
select t.run('publication: A (no ref_publish) cannot publish', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000a',
  $q$select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000001', 'publish')$q$, '42501');
select t.run('publication: CV1 with no evidence cannot be published', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b',
  $q$select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000001', 'publish')$q$, '23514');
select t.run('setup: CV2 (P1 in P2, v2) by A with evidence from source version v1 (not yet verified)', 'postgres', 'aaaaaaaa-0000-0000-0000-00000000000a',
  $q$insert into wine_reference.claim_versions (id, claim_id, version_no, risk_tier, supersedes_version_id) values ('f0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 2, 2, 'f0000000-0000-0000-0000-000000000001');
     insert into wine_reference.claim_evidence (claim_version_id, source_version_id, modality, locator) values ('f0000000-0000-0000-0000-000000000002', '51000000-0000-0000-0000-000000000001', 'documentary', 'p. 12')$q$);
select t.run('rights: evidence with a quote but no rights statement is refused', 'postgres', 'aaaaaaaa-0000-0000-0000-00000000000a',
  $q$insert into wine_reference.claim_evidence (claim_version_id, source_version_id, modality, locator, quote) values ('f0000000-0000-0000-0000-000000000002', '51000000-0000-0000-0000-000000000001', 'documentary', 'p. 12', 'a quote')$q$, '23514');
select t.run('setup: A submits, B approves CV2', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000a',
  $q$select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000002', 'submit')$q$);
select t.run('setup: B approves CV2', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b',
  $q$select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000002', 'approve')$q$);
select t.run('publication: evidence from an unverified source version is not enough', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b',
  $q$select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000002', 'publish')$q$, '23514');
select t.run('setup: A submits the source version', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000a',
  $q$select public.ref_review('source_versions', '51000000-0000-0000-0000-000000000001', 'submit')$q$);
select t.run('approval: a source version cannot be approved before its source', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b',
  $q$select public.ref_review('source_versions', '51000000-0000-0000-0000-000000000001', 'approve')$q$, '23514');
select t.run('setup: A submits the source and the quoting-allowed rights statement; B approves both', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000a',
  $q$select public.ref_review('sources', '50000000-0000-0000-0000-000000000001', 'submit'); select public.ref_review('rights_statements', 'b0000000-0000-0000-0000-000000000002', 'submit')$q$);
select t.run('setup: B approves the source and the rights statement', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b',
  $q$select public.ref_review('sources', '50000000-0000-0000-0000-000000000001', 'approve'); select public.ref_review('rights_statements', 'b0000000-0000-0000-0000-000000000002', 'approve')$q$);
select t.run('setup: B approves the source version', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b',
  $q$select public.ref_review('source_versions', '51000000-0000-0000-0000-000000000001', 'approve')$q$);
select t.run('publication: a claim about unpublished entities cannot be published', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b',
  $q$select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000002', 'publish')$q$, '23514');
select t.run('setup: A submits entity P1', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000a',
  $q$select public.ref_review('entities', 'e0000000-0000-0000-0000-000000000001', 'submit')$q$);
select t.run('setup: B approves entity P1', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b',
  $q$select public.ref_review('entities', 'e0000000-0000-0000-0000-000000000001', 'approve')$q$);
select t.run('publication: B cannot publish P1 before one of its names is verified', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b',
  $q$select public.ref_review('entities', 'e0000000-0000-0000-0000-000000000001', 'publish')$q$, '23514');
-- names: A submits, B approves (P1 en + de, P2, P3, G1, G2; P1's shortcut too, to prove it is never shown)
select t.run('setup: names submitted by A', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000a',
  $q$select public.ref_review('entity_names', x, 'submit') from unnest(array['a0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-000000000006','a0000000-0000-0000-0000-000000000007']::uuid[]) x$q$);
select t.run('setup: names approved by B', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b',
  $q$select public.ref_review('entity_names', x, 'approve') from unnest(array['a0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-000000000006','a0000000-0000-0000-0000-000000000007']::uuid[]) x$q$);
select t.run('setup: entities P2, P3, G1, G2 submitted by A', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000a',
  $q$select public.ref_review('entities', x, 'submit') from unnest(array['e0000000-0000-0000-0000-000000000002','e0000000-0000-0000-0000-000000000003','e0000000-0000-0000-0000-000000000004','e0000000-0000-0000-0000-000000000005']::uuid[]) x$q$);
select t.run('setup: entities approved and P1, P2, G1, G2 published by B (P3 stays verified, unpublished)', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b',
  $q$select public.ref_review('entities', x, 'approve') from unnest(array['e0000000-0000-0000-0000-000000000002','e0000000-0000-0000-0000-000000000003','e0000000-0000-0000-0000-000000000004','e0000000-0000-0000-0000-000000000005']::uuid[]) x;
     select public.ref_review('entities', x, 'publish') from unnest(array['e0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000002','e0000000-0000-0000-0000-000000000004','e0000000-0000-0000-0000-000000000005']::uuid[]) x$q$);
select t.run('publication: B publishes CV2 (evidence verified, entities published)', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b',
  $q$select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000002', 'publish')$q$);
select t.run('publication: publishing an already published version again is refused', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b',
  $q$select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000002', 'publish')$q$, '22023');
-- a newer version supersedes the live one
select t.run('setup: CV3 (P1 in P2, v3) with evidence; A submits', 'postgres', 'aaaaaaaa-0000-0000-0000-00000000000a',
  $q$insert into wine_reference.claim_versions (id, claim_id, version_no, risk_tier, supersedes_version_id, change_note) values ('f0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 3, 2, 'f0000000-0000-0000-0000-000000000002', 'test correction');
     insert into wine_reference.claim_evidence (claim_version_id, source_version_id, modality, locator) values ('f0000000-0000-0000-0000-000000000003', '51000000-0000-0000-0000-000000000001', 'documentary', 'p. 13')$q$);
select t.run('setup: CV3 submitted by A', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000a', $q$select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000003', 'submit')$q$);
select t.run('setup: CV3 approved and published by B', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b',
  $q$select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000003', 'approve'); select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000003', 'publish')$q$);
select t.check('versions: publishing CV3 retired CV2, and one version of the claim is live', 'postgres', null,
  $q$select (select status from wine_reference.claim_versions where id = 'f0000000-0000-0000-0000-000000000002') = 'retired'
        and (select count(*) from wine_reference.claim_versions where claim_id = 'c0000000-0000-0000-0000-000000000001' and status = 'verified' and published_at is not null) = 1$q$);
-- genetic relationships need genetic evidence (Phase 1.9 revision 1)
select t.run('setup: G1 genetic parent of G2, CV with documentary evidence only; A submits, B approves', 'postgres', 'aaaaaaaa-0000-0000-0000-00000000000a',
  $q$insert into wine_reference.claims (id, subject_entity_id, relationship_type, object_entity_id) values ('c0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000004', 'genetic_parent_of', 'e0000000-0000-0000-0000-000000000005');
     insert into wine_reference.claim_versions (id, claim_id, version_no, risk_tier) values ('f0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000004', 1, 1);
     insert into wine_reference.claim_evidence (claim_version_id, source_version_id, modality, locator) values ('f0000000-0000-0000-0000-000000000004', '51000000-0000-0000-0000-000000000001', 'documentary', 'p. 40')$q$);
select t.run('setup: genetic CV submitted by A', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000a', $q$select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000004', 'submit')$q$);
select t.run('setup: genetic CV approved by B', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b', $q$select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000004', 'approve')$q$);
select t.run('provenance: a genetic-parent claim without genetic evidence cannot be published', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b',
  $q$select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000004', 'publish')$q$, '23514');
-- quotes need rights that allow quoting
select t.run('setup: CV for P2 in P3 with a quote under a "no quoting" rights statement', 'postgres', 'aaaaaaaa-0000-0000-0000-00000000000a',
  $q$insert into wine_reference.claim_versions (id, claim_id, version_no, risk_tier) values ('f0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000002', 1, 2);
     insert into wine_reference.claim_evidence (claim_version_id, source_version_id, modality, locator, quote, quote_rights_id) values ('f0000000-0000-0000-0000-000000000005', '51000000-0000-0000-0000-000000000001', 'documentary', 'p. 2', 'a short quote', 'b0000000-0000-0000-0000-000000000001')$q$);
select t.run('setup: quote CV submitted by A', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000a', $q$select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000005', 'submit')$q$);
select t.run('setup: quote CV approved by B; P3 published', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b',
  $q$select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000005', 'approve'); select public.ref_review('entities', 'e0000000-0000-0000-0000-000000000003', 'publish')$q$);
select t.run('rights: a claim whose quote is not allowed to be quoted cannot be published', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b',
  $q$select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000005', 'publish')$q$, '23514');
select t.run('rights: approving a rights statement needs ref_rights (A lacks it)', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000a',
  $q$select public.ref_review('rights_statements', 'b0000000-0000-0000-0000-000000000001', 'submit'); select public.ref_review('rights_statements', 'b0000000-0000-0000-0000-000000000001', 'approve')$q$, '42501');
-- dependencies (Phase 1.9 revision 6)
select t.run('setup: CV6 (ownership v2) by A depends on the unpublished genetic CV', 'postgres', 'aaaaaaaa-0000-0000-0000-00000000000a',
  $q$insert into wine_reference.claim_versions (id, claim_id, version_no, risk_tier, valid_from, valid_from_precision, qualifiers) values ('f0000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000003', 2, 2, '2001-01-01', 'year', '{"share_percent": 40}');
     insert into wine_reference.claim_version_dependencies (dependent_version_id, depends_on_version_id) values ('f0000000-0000-0000-0000-000000000006', 'f0000000-0000-0000-0000-000000000004')$q$);
select t.run('dependencies: a dependency cycle is refused', 'postgres', null,
  $q$insert into wine_reference.claim_versions (id, claim_id, version_no, risk_tier, qualifiers) values ('f0000000-0000-0000-0000-000000000007', 'c0000000-0000-0000-0000-000000000003', 3, 2, '{"dates_unknown": true}');
     insert into wine_reference.claim_version_dependencies (dependent_version_id, depends_on_version_id) values ('f0000000-0000-0000-0000-000000000007', 'f0000000-0000-0000-0000-000000000006');
     insert into wine_reference.claim_version_dependencies (dependent_version_id, depends_on_version_id) values ('f0000000-0000-0000-0000-000000000006', 'f0000000-0000-0000-0000-000000000007')$q$, '23514');
select t.run('dependencies: a dependency cannot be added to a non-draft version', 'postgres', null,
  $q$insert into wine_reference.claim_version_dependencies (dependent_version_id, depends_on_version_id) values ('f0000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000004')$q$, '42501');

-- ------------------------------------------------------------------------------------------------ append-only history
select t.check('history: every decision left a review event', 'postgres', null,
  $q$select count(*) >= 20 from wine_reference.review_events$q$);
select t.run('history: review events cannot be deleted', 'postgres', null, $q$delete from wine_reference.review_events$q$, '42501');
select t.run('history: the change log cannot be edited', 'postgres', null, $q$update wine_reference.change_log set actor = null$q$, '42501');
select t.check('history: the change log recorded the test inserts with their author', 'postgres', null,
  $q$select exists (select 1 from wine_reference.change_log where table_name = 'entities' and operation = 'INSERT' and actor = 'aaaaaaaa-0000-0000-0000-00000000000a')$q$);

-- ------------------------------------------------------------------------------------------------ unauthorized access
select t.run('access: anon cannot read the schema''s tables', 'anon', null, $q$select count(*) from wine_reference.entities$q$, '42501');
select t.run('access: authenticated cannot read the schema''s tables', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b', $q$select count(*) from wine_reference.claims$q$, '42501');
select t.run('access: service_role cannot read the schema''s tables', 'service_role', null, $q$select count(*) from wine_reference.sources$q$, '42501');
select t.run('access: authenticated cannot insert into the schema', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b',
  $q$insert into wine_reference.entities (kind) values ('place')$q$, '42501');
select t.run('access: authenticated cannot call an internal function', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b',
  $q$select wine_reference.draft_version_only('f0000000-0000-0000-0000-000000000001')$q$, '42501');
select t.run('access: the review flag set by a caller does not open the tables', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b',
  $q$select set_config('wine_reference.in_review', 'on', true); update wine_reference.entities set status = 'verified'$q$, '42501');

-- ------------------------------------------------------------------------------------------------ publication restrictions (the read door)
select t.check('read: nothing is returned while the switch is off', 'anon', null,
  $q$select count(*) = 0 from public.ref_published_names()$q$);
select t.run('setup: owner turns the test switch on', 'postgres', null,
  $q$insert into public.app_config (key, value) values ('reference_enabled', '1') on conflict (key) do update set value = '1'$q$);
select t.check('read: anon sees only published entities'' verified names (P1 en+de, P2, P3, G1, G2 = 6)', 'anon', null,
  $q$select count(*) = 6 from public.ref_published_names()$q$);
select t.check('read: a typing shortcut is never shown', 'anon', null,
  $q$select not exists (select 1 from public.ref_published_names() where name = 'tp1')$q$);
select t.check('read: language filter works (German: 1 name)', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000c',
  $q$select count(*) = 1 from public.ref_published_names(null, 'de')$q$);
select t.check('read: draft entities (producer, brand) are not shown', 'anon', null,
  $q$select not exists (select 1 from public.ref_published_names() where kind in ('producer', 'brand', 'legal_entity'))$q$);
select t.run('setup: B retires P3', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b',
  $q$select public.ref_review('entities', 'e0000000-0000-0000-0000-000000000003', 'retire')$q$);
select t.check('read: a retired entity disappears', 'anon', null,
  $q$select not exists (select 1 from public.ref_published_names() where name = 'Test place 3')$q$);
select t.check('read: the limit is capped at 200', 'anon', null,
  $q$select count(*) <= 200 from public.ref_published_names(null, null, 100000)$q$);
select t.run('setup: owner turns the test switch off again', 'postgres', null,
  $q$update public.app_config set value = '0' where key = 'reference_enabled'$q$);
select t.check('read: off again means nothing is returned', 'anon', null,
  $q$select count(*) = 0 from public.ref_published_names()$q$);

-- ------------------------------------------------------------------------------------------------ Owner approval override (amendment, 2026-10-26)
-- O = the Owner (staff role 'owner' in profiles). A and B are Editors (ordinary reviewers; B also publishes). The override is tied to the
-- ROLE: O's stub permissions stay in place when the role is removed, to show the role, not a permission, decides.
insert into public._stub_permissions values
  ('aaaaaaaa-0000-0000-0000-00000000000d', 'ref_edit'), ('aaaaaaaa-0000-0000-0000-00000000000d', 'ref_review'),
  ('aaaaaaaa-0000-0000-0000-00000000000d', 'ref_publish'), ('aaaaaaaa-0000-0000-0000-00000000000d', 'ref_rights')
on conflict do nothing;
insert into public.profiles (id, role, staff_role) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'player', 'editor'), ('aaaaaaaa-0000-0000-0000-00000000000b', 'player', 'editor'),
  ('aaaaaaaa-0000-0000-0000-00000000000c', 'player', null), ('aaaaaaaa-0000-0000-0000-00000000000d', 'player', 'owner')
on conflict (id) do nothing;

select t.run('owner setup: O writes a place P4, a grape G3, a place P5, and their names', 'postgres', 'aaaaaaaa-0000-0000-0000-00000000000d',
  $q$insert into wine_reference.entities (id, kind) values ('e0000000-0000-0000-0000-000000000031', 'place'), ('e0000000-0000-0000-0000-000000000032', 'grape_variety'), ('e0000000-0000-0000-0000-000000000033', 'place');
     insert into wine_reference.entity_names (id, entity_id, name, language, name_kind, is_preferred) values
       ('a0000000-0000-0000-0000-000000000031', 'e0000000-0000-0000-0000-000000000031', 'Test place 4', 'en', 'common', true),
       ('a0000000-0000-0000-0000-000000000032', 'e0000000-0000-0000-0000-000000000032', 'Test grape 3', 'en', 'common', true),
       ('a0000000-0000-0000-0000-000000000033', 'e0000000-0000-0000-0000-000000000033', 'Test place 5', 'en', 'common', true)$q$);
select t.run('owner setup: O submits their names and entities', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000d',
  $q$select public.ref_review('entity_names', x, 'submit') from unnest(array['a0000000-0000-0000-0000-000000000031','a0000000-0000-0000-0000-000000000032','a0000000-0000-0000-0000-000000000033']::uuid[]) x;
     select public.ref_review('entities', x, 'submit') from unnest(array['e0000000-0000-0000-0000-000000000031','e0000000-0000-0000-0000-000000000032','e0000000-0000-0000-0000-000000000033']::uuid[]) x$q$);
select t.run('owner: O approves their own name, with a justification', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000d',
  $q$select public.ref_review('entity_names', 'a0000000-0000-0000-0000-000000000031', 'approve', 'checked against the source')$q$);
select t.run('owner: O approves their own eligible drafts (names and entities P4, G3)', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000d',
  $q$select public.ref_review('entity_names', 'a0000000-0000-0000-0000-000000000032', 'approve');
     select public.ref_review('entities', x, 'approve') from unnest(array['e0000000-0000-0000-0000-000000000031','e0000000-0000-0000-0000-000000000032']::uuid[]) x$q$);
select t.run('owner: O publishes their own approved entities P4 and G3', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000d',
  $q$select public.ref_review('entities', x, 'publish') from unnest(array['e0000000-0000-0000-0000-000000000031','e0000000-0000-0000-0000-000000000032']::uuid[]) x$q$);
-- the Owner's claims: every publication rule still applies
select t.run('owner setup: O writes claim P4 in P2 with three flawed versions (no evidence; unverified source; forbidden quote)', 'postgres', 'aaaaaaaa-0000-0000-0000-00000000000d',
  $q$insert into wine_reference.claims (id, subject_entity_id, relationship_type, object_entity_id) values ('c0000000-0000-0000-0000-000000000031', 'e0000000-0000-0000-0000-000000000031', 'part_of', 'e0000000-0000-0000-0000-000000000002');
     insert into wine_reference.claim_versions (id, claim_id, version_no, risk_tier) values
       ('f0000000-0000-0000-0000-000000000031', 'c0000000-0000-0000-0000-000000000031', 1, 2),
       ('f0000000-0000-0000-0000-000000000032', 'c0000000-0000-0000-0000-000000000031', 2, 2),
       ('f0000000-0000-0000-0000-000000000033', 'c0000000-0000-0000-0000-000000000031', 3, 2);
     insert into wine_reference.claim_evidence (claim_version_id, source_version_id, modality, locator) values ('f0000000-0000-0000-0000-000000000032', '51000000-0000-0000-0000-000000000002', 'documentary', 'p. 7');
     insert into wine_reference.claim_evidence (claim_version_id, source_version_id, modality, locator, quote, quote_rights_id) values ('f0000000-0000-0000-0000-000000000033', '51000000-0000-0000-0000-000000000001', 'documentary', 'p. 8', 'a short quote', 'b0000000-0000-0000-0000-000000000001')$q$);
select t.run('owner setup: O submits and self-approves the three flawed versions', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000d',
  $q$select public.ref_review('claim_versions', x, 'submit') from unnest(array['f0000000-0000-0000-0000-000000000031','f0000000-0000-0000-0000-000000000032','f0000000-0000-0000-0000-000000000033']::uuid[]) x;
     select public.ref_review('claim_versions', x, 'approve') from unnest(array['f0000000-0000-0000-0000-000000000031','f0000000-0000-0000-0000-000000000032','f0000000-0000-0000-0000-000000000033']::uuid[]) x$q$);
select t.run('owner: O cannot publish a claim without evidence', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000d',
  $q$select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000031', 'publish')$q$, '23514');
select t.run('owner: O cannot publish on evidence from an unverified source version', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000d',
  $q$select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000032', 'publish')$q$, '23514');
select t.run('owner: O cannot publish a quote whose rights forbid quoting', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000d',
  $q$select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000033', 'publish')$q$, '23514');
-- a high-risk (tier 1) claim by the Owner with the right evidence
select t.run('owner setup: O writes a tier-1 claim, G1 genetic parent of G3, with genetic evidence from a verified source version', 'postgres', 'aaaaaaaa-0000-0000-0000-00000000000d',
  $q$insert into wine_reference.claims (id, subject_entity_id, relationship_type, object_entity_id) values ('c0000000-0000-0000-0000-000000000032', 'e0000000-0000-0000-0000-000000000004', 'genetic_parent_of', 'e0000000-0000-0000-0000-000000000032');
     insert into wine_reference.claim_versions (id, claim_id, version_no, risk_tier) values ('f0000000-0000-0000-0000-000000000034', 'c0000000-0000-0000-0000-000000000032', 1, 1);
     insert into wine_reference.claim_evidence (claim_version_id, source_version_id, modality, locator) values ('f0000000-0000-0000-0000-000000000034', '51000000-0000-0000-0000-000000000001', 'genetic', 'table 2')$q$);
select t.run('owner: O submits, self-approves and publishes their own tier-1 claim', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000d',
  $q$select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000034', 'submit');
     select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000034', 'approve', 'owner checked the genetic study');
     select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000034', 'publish')$q$);
-- ordinary reviewers and publishers keep the two-person rule
select t.run('owner setup: B (Editor, reviewer and publisher) writes and submits a version of P2 in P3', 'postgres', 'aaaaaaaa-0000-0000-0000-00000000000b',
  $q$insert into wine_reference.claim_versions (id, claim_id, version_no, risk_tier) values ('f0000000-0000-0000-0000-000000000036', 'c0000000-0000-0000-0000-000000000002', 2, 2);
     insert into wine_reference.claim_evidence (claim_version_id, source_version_id, modality, locator) values ('f0000000-0000-0000-0000-000000000036', '51000000-0000-0000-0000-000000000001', 'documentary', 'p. 9')$q$);
select t.run('owner setup: B submits it', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b', $q$select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000036', 'submit')$q$);
select t.run('two-person rule: an ordinary reviewer (B) cannot approve their own draft', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b',
  $q$select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000036', 'approve')$q$, '42501');
select t.run('two-person rule: a non-Owner publisher (B) cannot publish without independent approval', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b',
  $q$select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000036', 'publish')$q$, '22023');
select t.run('two-person rule: a user cannot claim to be Owner through a session setting', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b',
  $q$select set_config('request.jwt.claim.role', 'owner', true), set_config('app.role', 'owner', true);
     select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000036', 'approve')$q$, '42501');
-- the audit history
select t.check('audit: the Owner''s self-approvals are recorded with owner_override, actor, decision and justification', 'postgres', null,
  $q$select exists (select 1 from wine_reference.review_events where target_id = 'a0000000-0000-0000-0000-000000000031' and decision = 'approve'
                      and owner_override and actor = 'aaaaaaaa-0000-0000-0000-00000000000d' and note = 'checked against the source' and acted_at is not null)
        and exists (select 1 from wine_reference.review_events where target_id = 'f0000000-0000-0000-0000-000000000034' and decision = 'approve'
                      and owner_override and note = 'owner checked the genetic study')$q$);
select t.check('audit: no one but the Owner ever has owner_override, and never on submit or publish', 'postgres', null,
  $q$select not exists (select 1 from wine_reference.review_events where owner_override and (actor <> 'aaaaaaaa-0000-0000-0000-00000000000d' or decision <> 'approve'))
        and exists (select 1 from wine_reference.review_events where decision = 'publish' and actor = 'aaaaaaaa-0000-0000-0000-00000000000d' and not owner_override)$q$);
select t.check('audit: approvals of someone else''s work are not marked as overrides', 'postgres', null,
  $q$select not exists (select 1 from wine_reference.review_events e where e.decision = 'approve' and e.owner_override and e.actor = 'aaaaaaaa-0000-0000-0000-00000000000b')
        and exists (select 1 from wine_reference.review_events e where e.decision = 'approve' and not e.owner_override)$q$);
select t.run('audit: an override record cannot be changed', 'postgres', null,
  $q$update wine_reference.review_events set owner_override = false where owner_override$q$, '42501');
select t.run('audit: an override record cannot be deleted', 'postgres', null,
  $q$delete from wine_reference.review_events where owner_override$q$, '42501');
select t.run('audit: a hand-written override row is refused for anything but approve', 'postgres', null,
  $q$insert into wine_reference.review_events (target_table, target_id, decision, from_status, to_status, actor, owner_override)
     values ('entities', 'e0000000-0000-0000-0000-000000000033', 'publish', 'verified', 'verified', 'aaaaaaaa-0000-0000-0000-00000000000d', true)$q$, '23514');
-- revoking the Owner role ends the override at once
select t.run('owner setup: the Owner role is removed from O (O keeps every ref_* permission in this test)', 'postgres', null,
  $q$update public.profiles set staff_role = null where id = 'aaaaaaaa-0000-0000-0000-00000000000d'$q$);
select t.run('revocation: O can no longer approve their own submitted draft (name of P5)', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000d',
  $q$select public.ref_review('entity_names', 'a0000000-0000-0000-0000-000000000033', 'approve')$q$, '42501');
select t.run('revocation: O can no longer approve their own submitted entity P5', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000d',
  $q$select public.ref_review('entities', 'e0000000-0000-0000-0000-000000000033', 'approve')$q$, '42501');
select t.run('revocation: someone else (A) can still approve O''s draft the normal way', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000a',
  $q$select public.ref_review('entity_names', 'a0000000-0000-0000-0000-000000000033', 'approve')$q$);
select t.run('owner setup: the Owner role is given back through the older profiles.role ''admin'' path', 'postgres', null,
  $q$update public.profiles set role = 'admin' where id = 'aaaaaaaa-0000-0000-0000-00000000000d'$q$);
select t.run('owner: the older admin path counts as Owner again (O approves own P5)', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000d',
  $q$select public.ref_review('entities', 'e0000000-0000-0000-0000-000000000033', 'approve')$q$);

-- ================================================================================================ Phase 2.0B.3 corrections (2026-10-27)
-- Fixtures: sources S2 (versions SV21, SV22), S3 (SV31, later SV32), S4 (SV41..SV43); rights R3 (quote ok), R4 (quote ok, no copying),
-- R5 (left draft); places Q1..Q7. A writes and submits, B approves, publishes and retires. All made-up test data.
select t.run('lifecycle setup: sources, versions, rights and places Q1..Q7 with names (by A)', 'postgres', 'aaaaaaaa-0000-0000-0000-00000000000a',
  $q$insert into wine_reference.sources (id, kind, title) values
       ('50000000-0000-0000-0000-000000000002', 'publication', 'Test source 2'), ('50000000-0000-0000-0000-000000000003', 'publication', 'Test source 3'),
       ('50000000-0000-0000-0000-000000000004', 'publication', 'Test source 4');
     insert into wine_reference.rights_statements (id, licence_code, allows_quote, allows_copy) values
       ('b0000000-0000-0000-0000-000000000003', 'test-quote-3', true, false), ('b0000000-0000-0000-0000-000000000004', 'test-quote-no-copy', true, false),
       ('b0000000-0000-0000-0000-000000000005', 'test-left-draft', true, true);
     insert into wine_reference.source_versions (id, source_id, version_label) values
       ('51000000-0000-0000-0000-000000000021', '50000000-0000-0000-0000-000000000002', 's2 v1'), ('51000000-0000-0000-0000-000000000022', '50000000-0000-0000-0000-000000000002', 's2 v2'),
       ('51000000-0000-0000-0000-000000000031', '50000000-0000-0000-0000-000000000003', 's3 v1'), ('51000000-0000-0000-0000-000000000032', '50000000-0000-0000-0000-000000000003', 's3 v2'),
       ('51000000-0000-0000-0000-000000000041', '50000000-0000-0000-0000-000000000004', 's4 v1');
     insert into wine_reference.source_versions (id, source_id, version_label, rights_id) values
       ('51000000-0000-0000-0000-000000000043', '50000000-0000-0000-0000-000000000004', 's4 v3', 'b0000000-0000-0000-0000-000000000005');
     insert into wine_reference.entities (id, kind) select ('e0000000-0000-0000-0000-0000000000' || g)::uuid, 'place' from generate_series(41, 47) g;
     insert into wine_reference.entity_names (id, entity_id, name, language, name_kind, is_preferred)
       select ('a0000000-0000-0000-0000-0000000000' || g)::uuid, ('e0000000-0000-0000-0000-0000000000' || g)::uuid, 'Test place Q' || (g - 40), 'en', 'common', true
         from generate_series(41, 46) g;
     insert into wine_reference.entity_names (id, entity_id, name, language, name_kind) values
       ('a0000000-0000-0000-0000-000000000047', 'e0000000-0000-0000-0000-000000000047', 'q7', 'en', 'shortcut')$q$);
select t.run('lifecycle setup: A submits everything', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000a',
  $q$select public.ref_review('sources', x, 'submit') from unnest(array['50000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000003','50000000-0000-0000-0000-000000000004']::uuid[]) x;
     select public.ref_review('rights_statements', x, 'submit') from unnest(array['b0000000-0000-0000-0000-000000000003','b0000000-0000-0000-0000-000000000004']::uuid[]) x;
     select public.ref_review('source_versions', ('51000000-0000-0000-0000-0000000000' || g)::uuid, 'submit') from unnest(array[21,22,31,32,41,43]) g;
     select public.ref_review('entity_names', ('a0000000-0000-0000-0000-0000000000' || g)::uuid, 'submit') from generate_series(41, 47) g;
     select public.ref_review('entities', ('e0000000-0000-0000-0000-0000000000' || g)::uuid, 'submit') from generate_series(41, 47) g$q$);
select t.run('lifecycle setup: B approves sources, rights, the plain source versions, names; approves Q1..Q7 and publishes Q1..Q6', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b',
  $q$select public.ref_review('sources', x, 'approve') from unnest(array['50000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000003','50000000-0000-0000-0000-000000000004']::uuid[]) x;
     select public.ref_review('rights_statements', x, 'approve') from unnest(array['b0000000-0000-0000-0000-000000000003','b0000000-0000-0000-0000-000000000004']::uuid[]) x;
     select public.ref_review('source_versions', ('51000000-0000-0000-0000-0000000000' || g)::uuid, 'approve') from unnest(array[21,22,31,32,41]) g;
     select public.ref_review('entity_names', ('a0000000-0000-0000-0000-0000000000' || g)::uuid, 'approve') from generate_series(41, 47) g;
     select public.ref_review('entities', ('e0000000-0000-0000-0000-0000000000' || g)::uuid, 'approve') from generate_series(41, 47) g;
     select public.ref_review('entities', ('e0000000-0000-0000-0000-0000000000' || g)::uuid, 'publish') from generate_series(41, 46) g$q$);

-- ---------------------------------------------------------------- approval rules for source versions (rights and copies)
select t.run('rights: a private copy under rights that do not allow copying is refused when written', 'postgres', 'aaaaaaaa-0000-0000-0000-00000000000a',
  $q$insert into wine_reference.source_versions (id, source_id, version_label, rights_id, storage_path) values
       ('51000000-0000-0000-0000-000000000042', '50000000-0000-0000-0000-000000000004', 's4 copy', 'b0000000-0000-0000-0000-000000000004', 'private/s4.pdf')$q$, '23514');
select t.run('rights: a private copy under rights that are not yet verified is refused when written', 'postgres', 'aaaaaaaa-0000-0000-0000-00000000000a',
  $q$insert into wine_reference.source_versions (id, source_id, version_label, rights_id, storage_path) values
       ('51000000-0000-0000-0000-000000000044', '50000000-0000-0000-0000-000000000004', 's4 copy 2', 'b0000000-0000-0000-0000-000000000005', 'private/s4b.pdf')$q$, '23514');
select t.run('approval: a source version whose rights statement is still a draft is refused', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b',
  $q$select public.ref_review('source_versions', '51000000-0000-0000-0000-000000000043', 'approve')$q$, '23514');

-- ---------------------------------------------------------------- published claims X1..X5 (and their evidence and dependencies)
-- X1: Q1 in Q2, evidence SV21 only.        X2: Q2 in Q3, evidence SV21 and SV31.        X3: Q3 in Q4, evidence SV22, depends on X2.
-- X4: Q1 in Q4, evidence SV22, depends on X3 (so on X2 transitively).                       X5: Q5 in Q1, evidence SV41 with a quote under R3.
select t.run('lifecycle setup: claims X1..X5 written by A', 'postgres', 'aaaaaaaa-0000-0000-0000-00000000000a',
  $q$insert into wine_reference.claims (id, subject_entity_id, relationship_type, object_entity_id) values
       ('c0000000-0000-0000-0000-000000000041', 'e0000000-0000-0000-0000-000000000041', 'part_of', 'e0000000-0000-0000-0000-000000000042'),
       ('c0000000-0000-0000-0000-000000000042', 'e0000000-0000-0000-0000-000000000042', 'part_of', 'e0000000-0000-0000-0000-000000000043'),
       ('c0000000-0000-0000-0000-000000000043', 'e0000000-0000-0000-0000-000000000043', 'part_of', 'e0000000-0000-0000-0000-000000000044'),
       ('c0000000-0000-0000-0000-000000000044', 'e0000000-0000-0000-0000-000000000041', 'part_of', 'e0000000-0000-0000-0000-000000000044'),
       ('c0000000-0000-0000-0000-000000000045', 'e0000000-0000-0000-0000-000000000045', 'part_of', 'e0000000-0000-0000-0000-000000000041');
     insert into wine_reference.claim_versions (id, claim_id, version_no, risk_tier)
       select ('f0000000-0000-0000-0000-0000000000' || g)::uuid, ('c0000000-0000-0000-0000-0000000000' || g)::uuid, 1, 2 from generate_series(41, 45) g;
     insert into wine_reference.claim_evidence (claim_version_id, source_version_id, modality, locator) values
       ('f0000000-0000-0000-0000-000000000041', '51000000-0000-0000-0000-000000000021', 'documentary', 'p. 1'),
       ('f0000000-0000-0000-0000-000000000042', '51000000-0000-0000-0000-000000000021', 'documentary', 'p. 2'),
       ('f0000000-0000-0000-0000-000000000042', '51000000-0000-0000-0000-000000000031', 'documentary', 'p. 3'),
       ('f0000000-0000-0000-0000-000000000043', '51000000-0000-0000-0000-000000000022', 'documentary', 'p. 4'),
       ('f0000000-0000-0000-0000-000000000044', '51000000-0000-0000-0000-000000000022', 'documentary', 'p. 5');
     insert into wine_reference.claim_evidence (claim_version_id, source_version_id, modality, locator, quote, quote_rights_id) values
       ('f0000000-0000-0000-0000-000000000045', '51000000-0000-0000-0000-000000000041', 'documentary', 'p. 6', 'a short test quote', 'b0000000-0000-0000-0000-000000000003');
     insert into wine_reference.claim_version_dependencies (dependent_version_id, depends_on_version_id) values
       ('f0000000-0000-0000-0000-000000000043', 'f0000000-0000-0000-0000-000000000042'),
       ('f0000000-0000-0000-0000-000000000044', 'f0000000-0000-0000-0000-000000000043')$q$);
select t.run('lifecycle setup: A submits X1..X5', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000a',
  $q$select public.ref_review('claim_versions', ('f0000000-0000-0000-0000-0000000000' || g)::uuid, 'submit') from generate_series(41, 45) g$q$);
select t.run('lifecycle setup: B approves X1..X5 and publishes them in dependency order', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b',
  $q$select public.ref_review('claim_versions', ('f0000000-0000-0000-0000-0000000000' || g)::uuid, 'approve') from generate_series(41, 45) g;
     select public.ref_review('claim_versions', ('f0000000-0000-0000-0000-0000000000' || g)::uuid, 'publish') from unnest(array[41, 42, 43, 44, 45]) g$q$);
select t.check('lifecycle: X1..X5 are all current after publication', 'postgres', null,
  $q$select bool_and(wine_reference.is_current(('f0000000-0000-0000-0000-0000000000' || g)::uuid)) from generate_series(41, 45) g$q$);

-- ---------------------------------------------------------------- correction 1: evidence lifecycle
select t.run('evidence: B retires source version SV21', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b',
  $q$select public.ref_review('source_versions', '51000000-0000-0000-0000-000000000021', 'retire', 'test: withdrawn edition')$q$);
select t.check('evidence: X1 (supported only by SV21) is suspended and no longer current', 'postgres', null,
  $q$select (select suspended_at is not null from wine_reference.claim_versions where id = 'f0000000-0000-0000-0000-000000000041')
        and not wine_reference.is_current('f0000000-0000-0000-0000-000000000041')
        and not exists (select 1 from wine_reference.current_claim_versions where id = 'f0000000-0000-0000-0000-000000000041')$q$);
select t.check('evidence: X2 (also supported by SV31) stays current: suspension is not over-eager', 'postgres', null,
  $q$select wine_reference.is_current('f0000000-0000-0000-0000-000000000042')$q$);
select t.check('evidence: the suspension is in the review history (decision suspend, actor B, the cause)', 'postgres', null,
  $q$select exists (select 1 from wine_reference.review_events where target_id = 'f0000000-0000-0000-0000-000000000041' and decision = 'suspend'
                      and actor = 'aaaaaaaa-0000-0000-0000-00000000000b' and note like 'Suspended automatically after retire source_versions%')$q$);
select t.run('evidence: a suspended version cannot be published again', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b',
  $q$select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000041', 'publish')$q$, '22023');
select t.run('evidence: a suspension cannot be lifted by a plain update', 'postgres', null,
  $q$update wine_reference.claim_versions set suspended_at = null, suspended_reason = null where id = 'f0000000-0000-0000-0000-000000000041'$q$, '42501');
select t.run('evidence: B retires rights statement R3 (the quote''s licence)', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b',
  $q$select public.ref_review('rights_statements', 'b0000000-0000-0000-0000-000000000003', 'retire')$q$);
select t.check('evidence: X5 (quote under R3) is suspended', 'postgres', null,
  $q$select (select suspended_reason like '%quote%' from wine_reference.claim_versions where id = 'f0000000-0000-0000-0000-000000000045')$q$);
select t.run('evidence: a replacement must be a verified version of the same source', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b',
  $q$select public.ref_review('source_versions', '51000000-0000-0000-0000-000000000031', 'retire', '', '51000000-0000-0000-0000-000000000041')$q$, '23514');
select t.run('evidence: a replacement is only accepted with retire on an entity or a source version', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b',
  $q$select public.ref_review('entity_names', 'a0000000-0000-0000-0000-000000000046', 'retire', '', 'a0000000-0000-0000-0000-000000000045')$q$, '22023');
select t.run('evidence: B supersedes SV31 with SV32 (retire with a replacement)', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b',
  $q$select public.ref_review('source_versions', '51000000-0000-0000-0000-000000000031', 'retire', 'test: new edition', '51000000-0000-0000-0000-000000000032')$q$);
select t.check('evidence: SV31 records superseded_by SV32', 'postgres', null,
  $q$select superseded_by = '51000000-0000-0000-0000-000000000032' and status = 'retired' from wine_reference.source_versions where id = '51000000-0000-0000-0000-000000000031'$q$);

-- ---------------------------------------------------------------- correction 2: dependencies fail closed, transitively
select t.check('dependencies: X2 lost its last current evidence and is suspended', 'postgres', null,
  $q$select suspended_at is not null from wine_reference.claim_versions where id = 'f0000000-0000-0000-0000-000000000042'$q$);
select t.check('dependencies: X3 (its own evidence still valid) is suspended because it depends on X2', 'postgres', null,
  $q$select suspended_at is not null and suspended_reason like '%depends on%' from wine_reference.claim_versions where id = 'f0000000-0000-0000-0000-000000000043'$q$);
select t.check('dependencies: X4 is suspended too, two steps away (transitive)', 'postgres', null,
  $q$select suspended_at is not null and suspended_reason like '%depends on%' from wine_reference.claim_versions where id = 'f0000000-0000-0000-0000-000000000044'$q$);
select t.check('dependencies: each suspension is a separate review event', 'postgres', null,
  $q$select count(distinct target_id) = 3 from wine_reference.review_events where decision = 'suspend'
       and target_id in ('f0000000-0000-0000-0000-000000000042', 'f0000000-0000-0000-0000-000000000043', 'f0000000-0000-0000-0000-000000000044')$q$);
select t.run('dependencies setup: X6 (Q6 in Q4, evidence SV41) depends on the suspended X4; A writes and submits, B approves', 'postgres', 'aaaaaaaa-0000-0000-0000-00000000000a',
  $q$insert into wine_reference.claims (id, subject_entity_id, relationship_type, object_entity_id) values ('c0000000-0000-0000-0000-000000000046', 'e0000000-0000-0000-0000-000000000046', 'part_of', 'e0000000-0000-0000-0000-000000000044');
     insert into wine_reference.claim_versions (id, claim_id, version_no, risk_tier) values ('f0000000-0000-0000-0000-000000000046', 'c0000000-0000-0000-0000-000000000046', 1, 2);
     insert into wine_reference.claim_evidence (claim_version_id, source_version_id, modality, locator) values ('f0000000-0000-0000-0000-000000000046', '51000000-0000-0000-0000-000000000041', 'documentary', 'p. 7');
     insert into wine_reference.claim_version_dependencies (dependent_version_id, depends_on_version_id) values ('f0000000-0000-0000-0000-000000000046', 'f0000000-0000-0000-0000-000000000044')$q$);
select t.run('dependencies setup: X6 submitted by A', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000a', $q$select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000046', 'submit')$q$);
select t.run('dependencies setup: X6 approved by B', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b', $q$select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000046', 'approve')$q$);
select t.run('dependencies: a version depending on a suspended version cannot be published', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b',
  $q$select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000046', 'publish')$q$, '23514');
-- a newer version of a dependency retires the old one, so the dependent is suspended (it must be re-reviewed against the new version)
select t.run('dependencies setup: Y1 (Q2 in Q4, v1, evidence SV41) and Z1 (Q5 in Q4, depends on Y1) published; Y2 (v2) approved', 'postgres', 'aaaaaaaa-0000-0000-0000-00000000000a',
  $q$insert into wine_reference.claims (id, subject_entity_id, relationship_type, object_entity_id) values
       ('c0000000-0000-0000-0000-000000000047', 'e0000000-0000-0000-0000-000000000042', 'part_of', 'e0000000-0000-0000-0000-000000000044'),
       ('c0000000-0000-0000-0000-000000000048', 'e0000000-0000-0000-0000-000000000045', 'part_of', 'e0000000-0000-0000-0000-000000000044');
     insert into wine_reference.claim_versions (id, claim_id, version_no, risk_tier) values
       ('f0000000-0000-0000-0000-000000000047', 'c0000000-0000-0000-0000-000000000047', 1, 2), ('f0000000-0000-0000-0000-000000000048', 'c0000000-0000-0000-0000-000000000048', 1, 2),
       ('f0000000-0000-0000-0000-000000000049', 'c0000000-0000-0000-0000-000000000047', 2, 2);
     insert into wine_reference.claim_evidence (claim_version_id, source_version_id, modality, locator) values
       ('f0000000-0000-0000-0000-000000000047', '51000000-0000-0000-0000-000000000041', 'documentary', 'p. 8'),
       ('f0000000-0000-0000-0000-000000000048', '51000000-0000-0000-0000-000000000041', 'documentary', 'p. 9'),
       ('f0000000-0000-0000-0000-000000000049', '51000000-0000-0000-0000-000000000041', 'documentary', 'p. 10');
     insert into wine_reference.claim_version_dependencies (dependent_version_id, depends_on_version_id) values ('f0000000-0000-0000-0000-000000000048', 'f0000000-0000-0000-0000-000000000047')$q$);
select t.run('dependencies setup: Y1, Z1, Y2 submitted by A', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000a',
  $q$select public.ref_review('claim_versions', ('f0000000-0000-0000-0000-0000000000' || g)::uuid, 'submit') from generate_series(47, 49) g$q$);
select t.run('dependencies setup: B approves Y1, Z1, Y2 and publishes Y1 then Z1', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b',
  $q$select public.ref_review('claim_versions', ('f0000000-0000-0000-0000-0000000000' || g)::uuid, 'approve') from generate_series(47, 49) g;
     select public.ref_review('claim_versions', ('f0000000-0000-0000-0000-0000000000' || g)::uuid, 'publish') from unnest(array[47, 48]) g$q$);
select t.check('dependencies: Z1 is current while Y1 is the live version', 'postgres', null,
  $q$select wine_reference.is_current('f0000000-0000-0000-0000-000000000048')$q$);
select t.run('dependencies: B publishes Y2, which retires Y1', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b',
  $q$select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000049', 'publish')$q$);
select t.check('dependencies: Z1 (which depended on the retired Y1) is suspended; Y2 is current', 'postgres', null,
  $q$select (select status = 'retired' from wine_reference.claim_versions where id = 'f0000000-0000-0000-0000-000000000047')
        and (select suspended_at is not null from wine_reference.claim_versions where id = 'f0000000-0000-0000-0000-000000000048')
        and wine_reference.is_current('f0000000-0000-0000-0000-000000000049')$q$);
-- retiring an entity suspends what is said about it; retiring a whole source suspends what rests only on it
select t.run('lifecycle: B retires entity Q2 (Y2 is about Q2)', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b',
  $q$select public.ref_review('entities', 'e0000000-0000-0000-0000-000000000042', 'retire')$q$);
select t.check('lifecycle: Y2 is suspended because its subject was retired', 'postgres', null,
  $q$select suspended_at is not null and suspended_reason like '%subject%' from wine_reference.claim_versions where id = 'f0000000-0000-0000-0000-000000000049'$q$);
select t.run('lifecycle setup: W1 (Q6 in Q1, evidence SV22 only) published', 'postgres', 'aaaaaaaa-0000-0000-0000-00000000000a',
  $q$insert into wine_reference.claims (id, subject_entity_id, relationship_type, object_entity_id) values ('c0000000-0000-0000-0000-000000000050', 'e0000000-0000-0000-0000-000000000046', 'part_of', 'e0000000-0000-0000-0000-000000000041');
     insert into wine_reference.claim_versions (id, claim_id, version_no, risk_tier) values ('f0000000-0000-0000-0000-000000000050', 'c0000000-0000-0000-0000-000000000050', 1, 2);
     insert into wine_reference.claim_evidence (claim_version_id, source_version_id, modality, locator) values ('f0000000-0000-0000-0000-000000000050', '51000000-0000-0000-0000-000000000022', 'documentary', 'p. 11')$q$);
select t.run('lifecycle setup: W1 submitted by A', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000a', $q$select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000050', 'submit')$q$);
select t.run('lifecycle setup: W1 approved and published by B', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b',
  $q$select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000050', 'approve'); select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000050', 'publish')$q$);
select t.run('lifecycle: B retires the whole source S2', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b',
  $q$select public.ref_review('sources', '50000000-0000-0000-0000-000000000002', 'retire')$q$);
select t.check('lifecycle: W1 (evidence only from a version of S2) is suspended', 'postgres', null,
  $q$select suspended_at is not null from wine_reference.claim_versions where id = 'f0000000-0000-0000-0000-000000000050'$q$);
select t.check('lifecycle: no published, unsuspended version anywhere is unsound (the verify script''s health check)', 'postgres', null,
  $q$select not exists (select 1 from wine_reference.claim_versions v where v.status = 'verified' and v.published_at is not null
                          and v.suspended_at is null and not wine_reference.is_current(v.id))$q$);
select t.run('owner exception kept: O self-approves a claim resting on the superseded SV31, but cannot publish it', 'postgres', 'aaaaaaaa-0000-0000-0000-00000000000d',
  $q$insert into wine_reference.claims (id, subject_entity_id, relationship_type, object_entity_id) values ('c0000000-0000-0000-0000-000000000051', 'e0000000-0000-0000-0000-000000000045', 'part_of', 'e0000000-0000-0000-0000-000000000046');
     insert into wine_reference.claim_versions (id, claim_id, version_no, risk_tier) values ('f0000000-0000-0000-0000-000000000051', 'c0000000-0000-0000-0000-000000000051', 1, 2);
     insert into wine_reference.claim_evidence (claim_version_id, source_version_id, modality, locator) values ('f0000000-0000-0000-0000-000000000051', '51000000-0000-0000-0000-000000000031', 'documentary', 'p. 12')$q$);
select t.run('owner exception kept: O submits and self-approves it', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000d',
  $q$select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000051', 'submit'); select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000051', 'approve')$q$);
select t.run('owner exception kept: O cannot publish on a superseded source version', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000d',
  $q$select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000051', 'publish')$q$, '23514');

-- ---------------------------------------------------------------- correction 4: published entities keep a display name
select t.run('names: retiring the only display name of a published entity (Q3) is refused', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b',
  $q$select public.ref_review('entity_names', 'a0000000-0000-0000-0000-000000000043', 'retire')$q$, '23514');
select t.run('names setup: A adds a second name for Q3 and submits it; B approves', 'postgres', 'aaaaaaaa-0000-0000-0000-00000000000a',
  $q$insert into wine_reference.entity_names (id, entity_id, name, language, name_kind) values ('a0000000-0000-0000-0000-000000000053', 'e0000000-0000-0000-0000-000000000043', 'Test place Q3 (label)', 'en', 'label')$q$);
select t.run('names setup: submitted by A', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000a', $q$select public.ref_review('entity_names', 'a0000000-0000-0000-0000-000000000053', 'submit')$q$);
select t.run('names setup: approved by B', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b', $q$select public.ref_review('entity_names', 'a0000000-0000-0000-0000-000000000053', 'approve')$q$);
select t.run('names: with a second display name, the first can be retired', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b',
  $q$select public.ref_review('entity_names', 'a0000000-0000-0000-0000-000000000043', 'retire')$q$);
select t.run('names: the remaining display name cannot be retired', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b',
  $q$select public.ref_review('entity_names', 'a0000000-0000-0000-0000-000000000053', 'retire')$q$, '23514');
select t.run('names: an entity whose only verified name is a typing shortcut (Q7) cannot be published', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b',
  $q$select public.ref_review('entities', 'e0000000-0000-0000-0000-000000000047', 'publish')$q$, '23514');
select t.run('names setup: owner turns the read switch on', 'postgres', null,
  $q$update public.app_config set value = '1' where key = 'reference_enabled'$q$);
select t.check('names: the read door still shows Q3 by its remaining name, never a retired one', 'anon', null,
  $q$select exists (select 1 from public.ref_published_names('Test place Q3') where name = 'Test place Q3 (label)')
        and not exists (select 1 from public.ref_published_names('Test place Q3') where name = 'Test place Q3')$q$);
select t.run('names setup: owner turns the read switch off', 'postgres', null,
  $q$update public.app_config set value = '0' where key = 'reference_enabled'$q$);

-- ---------------------------------------------------------------- correction 3: approved records are frozen
select t.run('frozen: an approved name''s text cannot be edited', 'postgres', null,
  $q$update wine_reference.entity_names set name = 'Changed' where id = 'a0000000-0000-0000-0000-000000000053'$q$, '42501');
select t.run('frozen: an approved name cannot be deleted', 'postgres', null,
  $q$delete from wine_reference.entity_names where id = 'a0000000-0000-0000-0000-000000000053'$q$, '42501');
select t.run('frozen: an approved source''s title cannot be edited', 'postgres', null,
  $q$update wine_reference.sources set title = 'Changed' where id = '50000000-0000-0000-0000-000000000004'$q$, '42501');
select t.run('frozen: an approved source version''s link cannot be edited', 'postgres', null,
  $q$update wine_reference.source_versions set url = 'https://example.org/changed' where id = '51000000-0000-0000-0000-000000000041'$q$, '42501');
select t.run('frozen: an approved source version''s fingerprint cannot be edited', 'postgres', null,
  $q$update wine_reference.source_versions set content_sha256 = repeat('a', 64) where id = '51000000-0000-0000-0000-000000000041'$q$, '42501');
select t.run('frozen: an approved rights statement''s permissions cannot be edited', 'postgres', null,
  $q$update wine_reference.rights_statements set allows_copy = true where id = 'b0000000-0000-0000-0000-000000000004'$q$, '42501');
select t.run('frozen: superseded_by cannot be set by a plain update', 'postgres', null,
  $q$update wine_reference.source_versions set superseded_by = '51000000-0000-0000-0000-000000000032' where id = '51000000-0000-0000-0000-000000000041'$q$, '42501');
select t.run('frozen: a new claim version cannot be inserted already suspended', 'postgres', null,
  $q$insert into wine_reference.claim_versions (claim_id, version_no, risk_tier, suspended_at, suspended_reason) values ('c0000000-0000-0000-0000-000000000045', 9, 2, now(), 'x')$q$, '42501');
select t.run('frozen: a claim''s object cannot change once a version left draft', 'postgres', null,
  $q$update wine_reference.claims set object_entity_id = 'e0000000-0000-0000-0000-000000000046' where id = 'c0000000-0000-0000-0000-000000000045'$q$, '42501');
select t.run('frozen setup: taxonomy node N1''s entity is submitted by A and approved by B', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000a',
  $q$select public.ref_review('entities', 'e0000000-0000-0000-0000-000000000021', 'submit')$q$);
select t.run('frozen setup: approved by B', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b', $q$select public.ref_review('entities', 'e0000000-0000-0000-0000-000000000021', 'approve')$q$);
select t.run('frozen: an approved taxonomy node''s code cannot change', 'postgres', null,
  $q$update wine_reference.taxonomy_nodes set code = 'TEST-N1X' where entity_id = 'e0000000-0000-0000-0000-000000000021'$q$, '42501');
select t.run('frozen: its display order may still change', 'postgres', null,
  $q$update wine_reference.taxonomy_nodes set sort_order = 5 where entity_id = 'e0000000-0000-0000-0000-000000000021'$q$);
select t.run('frozen: a claim type in use cannot change its required evidence', 'postgres', null,
  $q$update wine_reference.relationship_types set required_modality = 'label' where code = 'part_of'$q$, '42501');
select t.run('frozen: a claim type in use cannot go back to proposed', 'postgres', null,
  $q$update wine_reference.relationship_types set status = 'proposed' where code = 'part_of'$q$, '42501');
select t.run('frozen: a claim type in use may change its wording', 'postgres', null,
  $q$update wine_reference.relationship_types set label = 'Lies within' where code = 'part_of'$q$);
select t.run('frozen: a draft name can still be edited', 'postgres', 'aaaaaaaa-0000-0000-0000-00000000000a',
  $q$insert into wine_reference.entity_names (id, entity_id, name, language, name_kind) values ('a0000000-0000-0000-0000-000000000054', 'e0000000-0000-0000-0000-000000000044', 'Draft name', 'en', 'common');
     update wine_reference.entity_names set name = 'Draft name, edited' where id = 'a0000000-0000-0000-0000-000000000054'$q$);
select t.run('frozen setup: the draft name is submitted by A', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000a', $q$select public.ref_review('entity_names', 'a0000000-0000-0000-0000-000000000054', 'submit')$q$);
select t.run('frozen: a submitted name cannot be edited', 'postgres', null,
  $q$update wine_reference.entity_names set name = 'x' where id = 'a0000000-0000-0000-0000-000000000054'$q$, '42501');
select t.run('frozen setup: B rejects it back to draft', 'authenticated', 'aaaaaaaa-0000-0000-0000-00000000000b', $q$select public.ref_review('entity_names', 'a0000000-0000-0000-0000-000000000054', 'reject', 'please fix')$q$);
select t.run('frozen: a rejected (draft again) name can be edited', 'postgres', null,
  $q$update wine_reference.entity_names set name = 'Draft name, fixed' where id = 'a0000000-0000-0000-0000-000000000054'$q$);

-- LOCAL TEST ONLY. NEVER RUN ON SUPABASE. Fixture for tests/concurrency_tests.sh: a small published reference that two editorial sessions
-- then act on at the same time. Made-up test data. A = author (ref_edit, ref_review); B and C = reviewers and publishers (all four
-- ref_* permissions). Runs after tests/stub_supabase.sql and the migration, as the database owner.

insert into public._stub_permissions values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'ref_edit'), ('aaaaaaaa-0000-0000-0000-00000000000a', 'ref_review'),
  ('aaaaaaaa-0000-0000-0000-00000000000b', 'ref_edit'), ('aaaaaaaa-0000-0000-0000-00000000000b', 'ref_review'),
  ('aaaaaaaa-0000-0000-0000-00000000000b', 'ref_publish'), ('aaaaaaaa-0000-0000-0000-00000000000b', 'ref_rights'),
  ('aaaaaaaa-0000-0000-0000-00000000000c', 'ref_edit'), ('aaaaaaaa-0000-0000-0000-00000000000c', 'ref_review'),
  ('aaaaaaaa-0000-0000-0000-00000000000c', 'ref_publish'), ('aaaaaaaa-0000-0000-0000-00000000000c', 'ref_rights')
on conflict do nothing;
update wine_reference.relationship_types set status = 'active' where code in ('part_of');

-- As author A: entities E1..E6 (places), names (E3 has two display names), source S with versions V1, V2, rights R (quoting allowed),
-- and claim versions (all drafts for now).
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-00000000000a', false);
insert into wine_reference.entities (id, kind) select ('e0000000-0000-0000-0000-00000000000' || g)::uuid, 'place' from generate_series(1, 6) g;
insert into wine_reference.entity_names (id, entity_id, name, language, name_kind, is_preferred)
  select ('a0000000-0000-0000-0000-00000000000' || g)::uuid, ('e0000000-0000-0000-0000-00000000000' || g)::uuid, 'Place E' || g, 'en', 'common', true
    from generate_series(1, 6) g;
insert into wine_reference.entity_names (id, entity_id, name, language, name_kind) values
  ('a0000000-0000-0000-0000-000000000033', 'e0000000-0000-0000-0000-000000000003', 'Place E3 (label)', 'en', 'label');
insert into wine_reference.sources (id, kind, title) values ('50000000-0000-0000-0000-000000000001', 'publication', 'Concurrency source');
insert into wine_reference.rights_statements (id, licence_code, allows_quote) values ('b0000000-0000-0000-0000-000000000001', 'test-quote', true);
insert into wine_reference.source_versions (id, source_id, version_label, rights_id) values
  ('51000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'v1', 'b0000000-0000-0000-0000-000000000001'),
  ('51000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', 'v2', 'b0000000-0000-0000-0000-000000000001');
-- K1: E1 in E2 (version F1, evidence V1).  K2: E4 in E2 (F2, evidence V2, quote under R).  K3: E5 in E2 (F3, evidence V2), and
-- K4: E6 in E2 (F4, evidence V2, depends on F3).  K5: E1 in E5 (F5, evidence V2).
insert into wine_reference.claims (id, subject_entity_id, relationship_type, object_entity_id) values
  ('c0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'part_of', 'e0000000-0000-0000-0000-000000000002'),
  ('c0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000004', 'part_of', 'e0000000-0000-0000-0000-000000000002'),
  ('c0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000005', 'part_of', 'e0000000-0000-0000-0000-000000000002'),
  ('c0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000006', 'part_of', 'e0000000-0000-0000-0000-000000000002'),
  ('c0000000-0000-0000-0000-000000000005', 'e0000000-0000-0000-0000-000000000001', 'part_of', 'e0000000-0000-0000-0000-000000000005');
insert into wine_reference.claim_versions (id, claim_id, version_no, risk_tier)
  select ('f0000000-0000-0000-0000-00000000000' || g)::uuid, ('c0000000-0000-0000-0000-00000000000' || g)::uuid, 1, 2 from generate_series(1, 5) g;
insert into wine_reference.claim_evidence (claim_version_id, source_version_id, modality, locator, quote, quote_rights_id) values
  ('f0000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'documentary', 'p. 1', null, null),
  ('f0000000-0000-0000-0000-000000000002', '51000000-0000-0000-0000-000000000002', 'documentary', 'p. 2', 'a short quote', 'b0000000-0000-0000-0000-000000000001'),
  ('f0000000-0000-0000-0000-000000000003', '51000000-0000-0000-0000-000000000002', 'documentary', 'p. 3', null, null),
  ('f0000000-0000-0000-0000-000000000004', '51000000-0000-0000-0000-000000000002', 'documentary', 'p. 4', null, null),
  ('f0000000-0000-0000-0000-000000000005', '51000000-0000-0000-0000-000000000002', 'documentary', 'p. 5', null, null);
insert into wine_reference.claim_version_dependencies (dependent_version_id, depends_on_version_id) values
  ('f0000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000003');
-- A draft version F9 (E3 in E2) for the evidence-versus-submit race.
insert into wine_reference.claims (id, subject_entity_id, relationship_type, object_entity_id) values
  ('c0000000-0000-0000-0000-000000000009', 'e0000000-0000-0000-0000-000000000003', 'part_of', 'e0000000-0000-0000-0000-000000000002');
insert into wine_reference.claim_versions (id, claim_id, version_no, risk_tier) values ('f0000000-0000-0000-0000-000000000009', 'c0000000-0000-0000-0000-000000000009', 1, 2);

-- Two more drafts, F7 (K5 v2) and F8 (K2 v2), for the dependency-cycle race.
insert into wine_reference.claim_versions (id, claim_id, version_no, risk_tier) values
  ('f0000000-0000-0000-0000-000000000007', 'c0000000-0000-0000-0000-000000000005', 2, 2),
  ('f0000000-0000-0000-0000-000000000008', 'c0000000-0000-0000-0000-000000000002', 2, 2);

-- The Owner O (staff role owner, all four ref_* permissions) writes a name for E2 and submits it (for the Owner-override race).
insert into public._stub_permissions values
  ('aaaaaaaa-0000-0000-0000-00000000000d', 'ref_edit'), ('aaaaaaaa-0000-0000-0000-00000000000d', 'ref_review'),
  ('aaaaaaaa-0000-0000-0000-00000000000d', 'ref_publish'), ('aaaaaaaa-0000-0000-0000-00000000000d', 'ref_rights')
on conflict do nothing;
insert into public.profiles (id, role, staff_role) values ('aaaaaaaa-0000-0000-0000-00000000000d', 'player', 'owner') on conflict (id) do nothing;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-00000000000d', false);
insert into wine_reference.entity_names (id, entity_id, name, language, name_kind) values
  ('a0000000-0000-0000-0000-000000000044', 'e0000000-0000-0000-0000-000000000002', 'Place E2 (by the Owner)', 'en', 'label');
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-00000000000a', false);

-- Reviews: A submits everything, B approves; B publishes the entities and F3 (so F4 can depend on a live F3). F1, F2, F4, F5 stay
-- approved but unpublished: the scenarios publish them while something they rest on is being retired.
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-00000000000a', false);
select public.ref_review('sources', '50000000-0000-0000-0000-000000000001', 'submit');
select public.ref_review('rights_statements', 'b0000000-0000-0000-0000-000000000001', 'submit');
select public.ref_review('source_versions', x, 'submit') from unnest(array['51000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000002']::uuid[]) x;
select public.ref_review('entity_names', x, 'submit') from unnest(array['a0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-000000000006',
  'a0000000-0000-0000-0000-000000000033']::uuid[]) x;
select public.ref_review('entities', ('e0000000-0000-0000-0000-00000000000' || g)::uuid, 'submit') from generate_series(1, 6) g;
select public.ref_review('claim_versions', ('f0000000-0000-0000-0000-00000000000' || g)::uuid, 'submit') from generate_series(1, 5) g;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-00000000000b', false);
select public.ref_review('sources', '50000000-0000-0000-0000-000000000001', 'approve');
select public.ref_review('rights_statements', 'b0000000-0000-0000-0000-000000000001', 'approve');
select public.ref_review('source_versions', x, 'approve') from unnest(array['51000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000002']::uuid[]) x;
select public.ref_review('entity_names', x, 'approve') from unnest(array['a0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-000000000006',
  'a0000000-0000-0000-0000-000000000033']::uuid[]) x;
select public.ref_review('entities', ('e0000000-0000-0000-0000-00000000000' || g)::uuid, 'approve') from generate_series(1, 6) g;
select public.ref_review('entities', ('e0000000-0000-0000-0000-00000000000' || g)::uuid, 'publish') from generate_series(1, 6) g;
select public.ref_review('claim_versions', ('f0000000-0000-0000-0000-00000000000' || g)::uuid, 'approve') from generate_series(1, 5) g;
select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000003', 'publish');
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-00000000000d', false);
select public.ref_review('entity_names', 'a0000000-0000-0000-0000-000000000044', 'submit');
reset role;

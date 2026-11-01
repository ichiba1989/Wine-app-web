-- STAGING ONLY. Added to tests/concurrency_fixture.sql for the Phase 2.0B.4 scenarios C11-C12: claim K2 gets a second version F8 (v2)
-- with its own evidence, submitted by A and approved by B, so that two approved, unpublished versions of the SAME claim exist (F2 v1,
-- F8 v2), and a rights statement R2 that allows copying (probe D3). Made-up test data. Runs as the database owner after the fixture.
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-00000000000a', false);
insert into wine_reference.claim_evidence (claim_version_id, source_version_id, modality, locator) values
  ('f0000000-0000-0000-0000-000000000008', '51000000-0000-0000-0000-000000000002', 'documentary', 'p. 8');
-- For probe D3: a second rights statement R2 that allows copying.
insert into wine_reference.rights_statements (id, licence_code, allows_copy) values ('b0000000-0000-0000-0000-000000000002', 'test-copy', true);
set role authenticated;
select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000008', 'submit');
select public.ref_review('rights_statements', 'b0000000-0000-0000-0000-000000000002', 'submit');
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-00000000000b', false);
select public.ref_review('claim_versions', 'f0000000-0000-0000-0000-000000000008', 'approve');
select public.ref_review('rights_statements', 'b0000000-0000-0000-0000-000000000002', 'approve');
reset role;

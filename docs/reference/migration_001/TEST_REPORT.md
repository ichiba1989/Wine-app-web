# Migration 001: local test report (2026-10-26, re-run after the Owner approval override amendment)

**Result: 160 tests passed, 0 failed**, on a throwaway local PostgreSQL 16.15 database in the cloud work container. The whole suite was
re-run from scratch after the amendment (the earlier 127 was the suite before it; 33 tests were added). **Nothing was run on
the live Supabase database.** Re-run at any time with `bash docs/reference/migration_001/tests/run_local_tests.sh` (it starts its own
database and deletes it afterwards).

## What the run does

| Step | What it proves |
|---|---|
| `tests/stub_supabase.sql` | Builds a stand-in for what the migration needs from Supabase: the roles `anon`, `authenticated`, `service_role`; `auth.uid()`; Supabase's default grants in `public`; `pg_trgm`; the `verification_status` enum; `app_config` and `cfg_number()` (copied from `docs/import_limit.sql`); a **stub** `has_permission()` reading a test table; two catalog stand-in tables with rows; the role definitions as read on 2026-10-26 |
| Fresh install | `001_wine_reference_foundation.sql` runs without error |
| Replay | A second run raises no error, changes no structure (every object compared) and adds no duplicate rows |
| Backward compatibility | The whole `public` schema (tables, columns, constraints, indexes, functions and their grants, triggers, policies, table grants) is compared before and after: the only change is the two new `ref_*` functions; the stand-in rows are untouched |
| `001_verify.sql` | The read-only checks meant for the live database after migration: all PASS |
| `tests/001_behaviour_tests.sql` | Foreign keys and uniqueness, taxonomy cycles and domains, relationship types and cycles, dates and values, the editorial rules, provenance, rights, dependencies, append-only history, access by each role, and the publication rules of the read function |
| Rollback | `001_rollback.sql` refuses while content exists; on an empty install it removes everything and `public` is exactly as before; a re-install then works |
| `001a_reference_permissions.sql` | Runs twice; the owner role gains the four `ref_*` permissions once; other roles unchanged |
| Owner approval override (amendment) | The Owner approves and publishes their own eligible work, including a tier-1 claim; the Owner still cannot publish without evidence, on an unverified source version, or with a quote whose rights forbid quoting; an ordinary reviewer cannot approve their own draft; a non-Owner publisher cannot publish without independent approval; a session setting cannot make someone the Owner; each override is recorded (owner_override, actor, time, decision, justification) and cannot be changed, deleted or written for other decisions; removing the Owner role ends the override at once (even with every `ref_*` permission kept); the older `profiles.role = 'admin'` path counts as Owner |
| Missing dependency | On a database without `my_staff_role_code()`, the migration stops at its first step and creates nothing |

## Limits of this test (what it does not prove)

- **It is not Supabase.** Locally the migration runs as a superuser; on Supabase it runs as `postgres`, which is not a superuser but owns
  `public` objects and bypasses row-level security (FINDINGS.md). The statements used (create schema, revoke, alter default privileges,
  security definer functions owned by the creator) are all within what `postgres` may do there, but this was **not** run on Supabase.
- `has_permission()`, `my_staff_role_code()` and `auth.uid()` are stubs. The stub `my_staff_role_code()` follows the rule in the
  repository's role scripts (`docs/roles_proposal.sql`: `profiles.role` 'admin' = Owner, else `profiles.staff_role`); the live body is
  not in the repository. **Before the live run, read the live body once** (checklist in DESIGN.md §8).
- The live `has_permission()` body is not in the repository either; the design relies only on its
  documented behaviour (true when the signed-in person's staff role lists the permission).
- Supabase's own event triggers and the dashboard's **Exposed schemas** setting are not present locally. `001_verify.sql`, run on the live
  database after the migration, re-checks the grants; the owner checks the dashboard setting by eye.
- Load and speed were not tested (the reference holds no content).

## Full output of the last run

```
PASS  fresh install runs without error
PASS  replay (second run) runs without error
PASS  replay changes no structure (578 objects identical)
PASS  replay adds no duplicate rows (migrations/kinds/relationship types/name kinds = 1/9/6/8)
PASS  backward compatibility: public schema unchanged except the 2 new ref_* functions
PASS  backward compatibility: existing rows untouched (wines/vintages/app_config = 5/5/0)
PASS  verify: (right after migration 001) no published entity yet | 
PASS  verify: (right after migration 001) relationship types are all still proposed | owner activates them
PASS  verify: (right after migration 001) taxonomy is empty until the approved list is imported | 
PASS  verify: all 21 tables exist | 
PASS  verify: migration 001 is registered | 
PASS  verify: no function in the schema is executable by anon, authenticated or PUBLIC | 
PASS  verify: no policies on the schema's tables (only the owner reaches rows) | 
PASS  verify: no table grants to anon, authenticated, service_role or PUBLIC | 
PASS  verify: nothing else named ref_* in public | 
PASS  verify: public.ref_published_names: security definer, empty search_path, executable by anon and authenticated only | 
PASS  verify: public.ref_review: security definer, empty search_path, executable by authenticated only | 
PASS  verify: review_events records owner_override (only ever on approve decisions) | 
PASS  verify: row-level security is on for every table | 
PASS  verify: schema wine_reference exists | 
PASS  verify: the Owner lookup public.my_staff_role_code() exists (used by the Owner approval override) | 
PASS  verify: the browser's roles cannot use the schema | 
PASS  verify: the reference switch is off (app_config reference_enabled absent or 0) | turn it on only after the owner approves
PASS  setup: owner activates part_of, genetic_parent_of, holds_interest_in
PASS  setup: owner adds an active test attribute type
PASS  setup: author A creates test entities
PASS  setup: names for the test entities
PASS  setup: a source and two versions, rights statements
PASS  FK: an entity of an unknown kind is refused  -> refused: 23503: insert or update on table "entities" violates foreign key constraint "entities_kind_fkey"
PASS  unique: the same name twice for one entity, language and kind is refused  -> refused: 23505: duplicate key value violates unique constraint "entity_names_one"
PASS  unique: two preferred names in one language are refused  -> refused: 23505: duplicate key value violates unique constraint "entity_names_one_preferred"
PASS  check: a malformed language tag is refused  -> refused: 23514: new row for relation "entity_names" violates check constraint "entity_names_language_check"
PASS  FK: a claim about a missing entity is refused  -> refused: 23503: insert or update on table "claims" violates foreign key constraint "claims_subject_entity_id_fkey"
PASS  unique: the same source version label twice is refused  -> refused: 23505: duplicate key value violates unique constraint "source_versions_source_id_version_label_key"
PASS  rights: a private copy without a rights statement is refused  -> refused: 23514: new row for relation "source_versions" violates check constraint "source_versions_copy_needs_rights"
PASS  check: a claim with both shapes (relationship and attribute) is refused  -> refused: 23514: new row for relation "claims" violates check constraint "claims_one_shape"
PASS  check: a claim about itself is refused  -> refused: 23514: This part_of claim would make a cycle
PASS  taxonomy: a domain must be an entity of kind taxonomy_domain  -> refused: 23514: A knowledge domain must be an entity of kind taxonomy_domain
PASS  setup: two test domains and a chain of nodes N1 > N2 > N3
PASS  taxonomy: a cycle (N1 under N3) is refused  -> refused: 23514: This would make a cycle in the taxonomy
PASS  taxonomy: a node whose parent is in another domain is refused  -> refused: 23514: A taxonomy node's parent must be in the same domain
PASS  taxonomy: a node must be an entity of kind taxonomy_node  -> refused: 23514: A taxonomy node must be an entity of kind taxonomy_node
PASS  taxonomy: assignments, then a second primary for one entity is refused  -> refused: 23505: duplicate key value violates unique constraint "taxonomy_assignments_one_primary"
PASS  types: a claim with a proposed (inactive) relationship type is refused  -> refused: 23514: Relationship type brand_of is not active
PASS  types: part_of between a grape and a place is refused  -> refused: 23514: Relationship type part_of does not connect a grape_variety to a place
PASS  setup: part_of claims P1 in P2, P2 in P3
PASS  cycles: P3 in P1 (closing a loop) is refused  -> refused: 23514: This part_of claim would make a cycle
PASS  dates: a name valid_to before valid_from is refused  -> refused: 23514: new row for relation "entity_names" violates check constraint "entity_names_dates"
PASS  dates: a claim version valid_to before valid_from is refused  -> refused: 23514: new row for relation "claim_versions" violates check constraint "claim_versions_dates"
PASS  setup: an ownership claim (legal entity holds an interest in producer)
PASS  dates: an ownership version with no start date and no "dates unknown" is refused  -> refused: 23514: A dated relationship needs valid_from, or qualifiers {"dates_unknown": true}
PASS  values: a share of 150 percent is refused  -> refused: 23514: share_percent must be between 0 and 100
PASS  dates: an ownership version with "dates unknown" stated is accepted
PASS  values: a number attribute given only as text is refused  -> refused: 23514: Attribute test_number needs a number value
PASS  editorial: inserting a row already verified is refused  -> refused: 42501: New rows start as draft; use public.ref_review to move them on
PASS  editorial: changing a status by a plain update is refused  -> refused: 42501: Status and publication change only through public.ref_review
PASS  setup: claim version CV1 (P1 in P2, v1) by A, with no evidence
PASS  review: signed-out callers cannot use ref_review  -> refused: 42501: permission denied for function ref_review
PASS  review: a signed-in user with no permission is refused  -> refused: 42501: Not allowed: needs ref_edit
PASS  review: a call with no signed-in user is refused  -> refused: 42501: Sign in first
PASS  review: author A submits CV1
PASS  provenance: editing CV1 after submission is refused  -> refused: 42501: A claim version can only be edited while it is a draft; make a new version instead
PASS  provenance: adding evidence to a submitted version is refused  -> refused: 42501: Evidence and dependencies can only change while the claim version is a draft
PASS  provenance: deleting a submitted version is refused  -> refused: 42501: Only a draft claim version can be deleted
PASS  two-person rule: author A cannot approve their own CV1  -> refused: 42501: The author cannot approve their own row (and a row with no recorded author cannot be approved here)
PASS  review: B approves CV1
PASS  publication: A (no ref_publish) cannot publish  -> refused: 42501: Not allowed: needs ref_publish
PASS  publication: CV1 with no evidence cannot be published  -> refused: 23514: A claim needs supporting evidence from a verified source version before it is published
PASS  setup: CV2 (P1 in P2, v2) by A with evidence from source version v1 (not yet verified)
PASS  rights: evidence with a quote but no rights statement is refused  -> refused: 23514: new row for relation "claim_evidence" violates check constraint "claim_evidence_quote_needs_rights"
PASS  setup: A submits, B approves CV2
PASS  setup: B approves CV2
PASS  publication: evidence from an unverified source version is not enough  -> refused: 23514: A claim needs supporting evidence from a verified source version before it is published
PASS  setup: the source version is submitted by A and approved by B
PASS  setup: B approves the source version
PASS  publication: a claim about unpublished entities cannot be published  -> refused: 23514: Publish the entities a claim is about first
PASS  setup: A submits entity P1
PASS  setup: B approves entity P1
PASS  publication: B cannot publish P1 before one of its names is verified  -> refused: 23514: An entity needs at least one verified name before it is published
PASS  setup: names submitted by A
PASS  setup: names approved by B
PASS  setup: entities P2, P3, G1, G2 submitted by A
PASS  setup: entities approved and P1, P2, G1, G2 published by B (P3 stays verified, unpublished)
PASS  publication: B publishes CV2 (evidence verified, entities published)
PASS  publication: publishing an already published version again is refused  -> refused: 22023: Cannot publish a row that is verified
PASS  setup: CV3 (P1 in P2, v3) with evidence; A submits
PASS  setup: CV3 submitted by A
PASS  setup: CV3 approved and published by B
PASS  versions: publishing CV3 retired CV2, and one version of the claim is live
PASS  setup: G1 genetic parent of G2, CV with documentary evidence only; A submits, B approves
PASS  setup: genetic CV submitted by A
PASS  setup: genetic CV approved by B
PASS  provenance: a genetic-parent claim without genetic evidence cannot be published  -> refused: 23514: This kind of claim needs evidence of its required modality
PASS  setup: CV for P2 in P3 with a quote under a "no quoting" rights statement
PASS  setup: quote CV submitted by A
PASS  setup: quote CV approved by B; P3 published
PASS  rights: a claim whose quote is not allowed to be quoted cannot be published  -> refused: 23514: A quote in the evidence has no verified rights statement that allows quoting
PASS  rights: approving a rights statement needs ref_rights (A lacks it)  -> refused: 42501: Not allowed: needs ref_rights
PASS  setup: CV6 (ownership v2) by A depends on the unpublished genetic CV
PASS  dependencies: a dependency cycle is refused  -> refused: 23514: This dependency would make a cycle
PASS  dependencies: a dependency cannot be added to a non-draft version  -> refused: 42501: Evidence and dependencies can only change while the claim version is a draft
PASS  history: every decision left a review event
PASS  history: review events cannot be deleted  -> refused: 42501: wine_reference.review_events: rows are never changed or deleted (append-only)
PASS  history: the change log cannot be edited  -> refused: 42501: wine_reference.change_log: rows are never changed or deleted (append-only)
PASS  history: the change log recorded the test inserts with their author
PASS  access: anon cannot read the schema's tables  -> refused: 42501: permission denied for schema wine_reference
PASS  access: authenticated cannot read the schema's tables  -> refused: 42501: permission denied for schema wine_reference
PASS  access: service_role cannot read the schema's tables  -> refused: 42501: permission denied for schema wine_reference
PASS  access: authenticated cannot insert into the schema  -> refused: 42501: permission denied for schema wine_reference
PASS  access: authenticated cannot call an internal function  -> refused: 42501: permission denied for schema wine_reference
PASS  access: the review flag set by a caller does not open the tables  -> refused: 42501: permission denied for schema wine_reference
PASS  read: nothing is returned while the switch is off
PASS  setup: owner turns the test switch on
PASS  read: anon sees only published entities' verified names (P1 en+de, P2, P3, G1, G2 = 6)
PASS  read: a typing shortcut is never shown
PASS  read: language filter works (German: 1 name)
PASS  read: draft entities (producer, brand) are not shown
PASS  setup: B retires P3
PASS  read: a retired entity disappears
PASS  read: the limit is capped at 200
PASS  setup: owner turns the test switch off again
PASS  read: off again means nothing is returned
PASS  owner setup: O writes a place P4, a grape G3, a place P5, and their names
PASS  owner setup: O submits their names and entities
PASS  owner: O approves their own name, with a justification
PASS  owner: O approves their own eligible drafts (names and entities P4, G3)
PASS  owner: O publishes their own approved entities P4 and G3
PASS  owner setup: O writes claim P4 in P2 with three flawed versions (no evidence; unverified source; forbidden quote)
PASS  owner setup: O submits and self-approves the three flawed versions
PASS  owner: O cannot publish a claim without evidence  -> refused: 23514: A claim needs supporting evidence from a verified source version before it is published
PASS  owner: O cannot publish on evidence from an unverified source version  -> refused: 23514: A claim needs supporting evidence from a verified source version before it is published
PASS  owner: O cannot publish a quote whose rights forbid quoting  -> refused: 23514: A quote in the evidence has no verified rights statement that allows quoting
PASS  owner setup: O writes a tier-1 claim, G1 genetic parent of G3, with genetic evidence from a verified source version
PASS  owner: O submits, self-approves and publishes their own tier-1 claim
PASS  owner setup: B (Editor, reviewer and publisher) writes and submits a version of P2 in P3
PASS  owner setup: B submits it
PASS  two-person rule: an ordinary reviewer (B) cannot approve their own draft  -> refused: 42501: The author cannot approve their own row (and a row with no recorded author cannot be approved here)
PASS  two-person rule: a non-Owner publisher (B) cannot publish without independent approval  -> refused: 22023: Cannot publish a row that is pending_review
PASS  two-person rule: a user cannot claim to be Owner through a session setting  -> refused: 42501: The author cannot approve their own row (and a row with no recorded author cannot be approved here)
PASS  audit: the Owner's self-approvals are recorded with owner_override, actor, decision and justification
PASS  audit: no one but the Owner ever has owner_override, and never on submit or publish
PASS  audit: approvals of someone else's work are not marked as overrides
PASS  audit: an override record cannot be changed  -> refused: 42501: wine_reference.review_events: rows are never changed or deleted (append-only)
PASS  audit: an override record cannot be deleted  -> refused: 42501: wine_reference.review_events: rows are never changed or deleted (append-only)
PASS  audit: a hand-written override row is refused for anything but approve  -> refused: 23514: new row for relation "review_events" violates check constraint "review_events_override_only_on_approve"
PASS  owner setup: the Owner role is removed from O (O keeps every ref_* permission in this test)
PASS  revocation: O can no longer approve their own submitted draft (name of P5)  -> refused: 42501: The author cannot approve their own row (and a row with no recorded author cannot be approved here)
PASS  revocation: O can no longer approve their own submitted entity P5  -> refused: 42501: The author cannot approve their own row (and a row with no recorded author cannot be approved here)
PASS  revocation: someone else (A) can still approve O's draft the normal way
PASS  owner setup: the Owner role is given back through the older profiles.role 'admin' path
PASS  owner: the older admin path counts as Owner again (O approves own P5)
PASS  rollback refuses while the reference holds content
PASS  rollback on an empty reference runs
PASS  after rollback the public schema is exactly as before
PASS  after rollback the schema is gone
PASS  re-install after rollback runs
PASS  001a runs, and runs again
PASS  001a: owner gains ref_edit, ref_review, ref_publish, ref_rights once; editor unchanged; registered
PASS  migration stops when a required live function (my_staff_role_code) is missing
PASS  after that stop nothing was created
TOTAL: 160 passed, 0 failed  (PostgreSQL 16.15, local throwaway database)
```

# Migration 001: local test report (2026-10-27, release "001 r3", after the Phase 2.0B.3 corrections)

**Result: 270 passed, 0 failed**, on a throwaway local PostgreSQL 16.15 database in the cloud work container, re-run in full from scratch
after the corrections. **Nothing was run on the live Supabase database.** Re-run at any time with
`bash docs/reference/migration_001/tests/run_local_tests.sh` (it starts its own database and deletes it afterwards).

History: 127 (first draft) → 160 (Owner approval override) → 270 (Phase 2.0B.3 corrections). The 270 includes the earlier tests,
adapted where a rule became stricter (a source version is now approved only after its source and its rights statement), and a fix to the
runner itself: two loops ran in a sub-shell, so their results printed but did not reach the totals (only verify-after-tests rows and
test-file errors were affected; none had failed). The PASS lines now equal the total.

## What the run does

| Step | What it proves |
|---|---|
| `tests/stub_supabase.sql` | Stand-in for the Supabase objects the migration needs: roles, `auth.uid()`, Supabase's default grants in `public`, `pg_trgm`, the `verification_status` enum, `app_config` and `cfg_number()`, stub `has_permission()` and `my_staff_role_code()`, `profiles`, `staff_roles`, catalog stand-ins with rows |
| Fresh install, replay | The migration installs; a second run passes its own preflight (same release, no drift), changes no structure and adds no duplicates |
| Backward compatibility | The whole `public` schema compared before and after: only the two `ref_*` functions are new; stand-in rows untouched |
| `001_verify.sql` | All checks PASS right after the migration, and the release, drift, health and 001a checks PASS again after all the lifecycle tests |
| Behaviour and negative tests | Keys, uniqueness, taxonomy and relationship cycles, dates, values, editorial rules, the two-person rule and the Owner override, provenance, rights, dependencies, append-only history, access by every role, the read door |
| **Corrections 1 and 2** | Retiring a source version, a whole source, a rights statement or an entity, and superseding a source version, suspend exactly the published versions that lose their support (redundant evidence keeps a claim current); suspensions are recorded; a three-step dependency chain is suspended transitively; a newer dependency version suspends its dependent; publishing on a suspended dependency is refused; a suspended version cannot be republished or un-suspended by hand; the Owner is still refused on a superseded source |
| **Correction 3** | Approved names, sources, source versions and rights statements cannot be edited or deleted; `superseded_by` and suspension cannot be set by hand; claim identity, taxonomy codes and in-use claim types are frozen (wording and order may change); drafts and rejected rows stay editable; private copies need verified copy rights when written; source versions need their source and rights approved |
| **Correction 4** | The last display name of a published entity cannot be retired; a second name allows it; a shortcut is never a display name; the read door shows only remaining names |
| **Correction 5** | `owner_role_check.sql` runs in a read-only transaction and reports the role lookup, profile grants and role counts |
| **Correction 6** | On fresh databases: an unexpected `ref_*` function, `ref_review` without the schema, hand-made drift, a different release and a missing registration each stop the migration with nothing changed; 001a stops before 001 and when partly undone; verify reports a partial 001a |
| **Correction 7** | `001a_rollback.sql` runs twice, removes every `ref_*` permission from every role (others kept, in order) and unregisters 001a; `001_rollback.sql` refuses until then; the full order works; 001a re-runs after its rollback |
| Rollback, permissions, dependencies | Rollback refused with content and clean when empty; 001a runs twice; a missing live function stops the migration |

## Limits of this test (what it does not prove)

- **It is not Supabase.** Locally the migration runs as a superuser; on Supabase it runs as `postgres` (not a superuser; bypasses
  row-level security). Supabase's event triggers and the dashboard's Exposed schemas setting are not present locally.
- `has_permission()`, `my_staff_role_code()` and `auth.uid()` are stand-ins written from the documented rules; the live bodies are not in
  the repository (`OWNER_ROLE_VERIFICATION.md`, `owner_role_check.sql`).
- Concurrency (two reviewers acting at the same moment) and speed with real volumes were not tested; the soundness and suspension
  checks scan every published version on each retire or publish, which is fine at the expected size but should be revisited with
  migration 002.
- Time-based expiry of names (`valid_to` passing) cannot be simulated without changing the clock; the read door and the verify script
  handle it, but no test moves time.

## Full output of the last run

```
PASS  fresh install runs without error
PASS  replay (second run) runs without error
PASS  replay changes no structure (628 objects identical)
PASS  replay adds no duplicate rows (migrations/kinds/relationship types/name kinds = 1/9/6/8)
PASS  backward compatibility: public schema unchanged except the 2 new ref_* functions
PASS  backward compatibility: existing rows untouched (wines/vintages/app_config = 5/5/0)
PASS  verify: (right after migration 001) no published entity yet | 
PASS  verify: (right after migration 001) relationship types are all still proposed | owner activates them
PASS  verify: (right after migration 001) taxonomy is empty until the approved list is imported | 
PASS  verify: 001a consistency: if registered, the Owner role holds all four ref_* permissions; if not, no role holds any | 001a not registered
PASS  verify: 001a consistency: no role other than owner (or editor, if the owner chose it) holds a ref_* permission | 
PASS  verify: all 21 tables exist | 
PASS  verify: health: every private source copy is under verified rights that allow copying | 
PASS  verify: health: every published entity has a current display name | 
PASS  verify: health: every published, unsuspended claim version is current (sound, with current dependencies) | 
PASS  verify: migration 001 is registered | 
PASS  verify: migration 001 release is "001 r3 (2026-10-27)" | 
PASS  verify: no function in the schema is executable by anon, authenticated or PUBLIC | 
PASS  verify: no policies on the schema's tables (only the owner reaches rows) | 
PASS  verify: no structure drift: the schema matches the fingerprint stored by the migration | 
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
PASS  rights: a private copy without a rights statement is refused  -> refused: 23514: A private copy needs verified rights that allow copying
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
PASS  editorial: changing a status by a plain update is refused  -> refused: 42501: Status, publication, retirement, supersession and suspension change only through public.ref_review
PASS  setup: claim version CV1 (P1 in P2, v1) by A, with no evidence
PASS  review: signed-out callers cannot use ref_review  -> refused: 42501: permission denied for function ref_review
PASS  review: a signed-in user with no permission is refused  -> refused: 42501: Not allowed: needs ref_edit
PASS  review: a call with no signed-in user is refused  -> refused: 42501: Sign in first
PASS  review: author A submits CV1
PASS  provenance: editing CV1 after submission is refused  -> refused: 42501: wine_reference.claim_versions: this row is pending_review and frozen; make a new row and retire this one
PASS  provenance: adding evidence to a submitted version is refused  -> refused: 42501: Evidence and dependencies can only change while the claim version is a draft
PASS  provenance: deleting a submitted version is refused  -> refused: 42501: wine_reference.claim_versions: a row that left draft is never deleted; retire it instead
PASS  two-person rule: author A cannot approve their own CV1  -> refused: 42501: The author cannot approve their own row (and a row with no recorded author cannot be approved here)
PASS  review: B approves CV1
PASS  publication: A (no ref_publish) cannot publish  -> refused: 42501: Not allowed: needs ref_publish
PASS  publication: CV1 with no evidence cannot be published  -> refused: 23514: Cannot publish this claim version: its subject is not a published entity; its object is not a published entity; no supporting evidence from a verified, current source version of a verified source
PASS  setup: CV2 (P1 in P2, v2) by A with evidence from source version v1 (not yet verified)
PASS  rights: evidence with a quote but no rights statement is refused  -> refused: 23514: new row for relation "claim_evidence" violates check constraint "claim_evidence_quote_needs_rights"
PASS  setup: A submits, B approves CV2
PASS  setup: B approves CV2
PASS  publication: evidence from an unverified source version is not enough  -> refused: 23514: Cannot publish this claim version: its subject is not a published entity; its object is not a published entity; no supporting evidence from a verified, current source version of a verified source
PASS  setup: A submits the source version
PASS  approval: a source version cannot be approved before its source  -> refused: 23514: Approve the source before its versions
PASS  setup: A submits the source and the quoting-allowed rights statement; B approves both
PASS  setup: B approves the source and the rights statement
PASS  setup: B approves the source version
PASS  publication: a claim about unpublished entities cannot be published  -> refused: 23514: Cannot publish this claim version: its subject is not a published entity; its object is not a published entity
PASS  setup: A submits entity P1
PASS  setup: B approves entity P1
PASS  publication: B cannot publish P1 before one of its names is verified  -> refused: 23514: An entity needs a current display name (a verified name that is not a typing shortcut) before it is published
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
PASS  provenance: a genetic-parent claim without genetic evidence cannot be published  -> refused: 23514: Cannot publish this claim version: no current evidence of the required modality
PASS  setup: CV for P2 in P3 with a quote under a "no quoting" rights statement
PASS  setup: quote CV submitted by A
PASS  setup: quote CV approved by B; P3 published
PASS  rights: a claim whose quote is not allowed to be quoted cannot be published  -> refused: 23514: Cannot publish this claim version: a quote has no verified rights statement that allows quoting
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
PASS  owner: O cannot publish a claim without evidence  -> refused: 23514: Cannot publish this claim version: no supporting evidence from a verified, current source version of a verified source
PASS  owner: O cannot publish on evidence from an unverified source version  -> refused: 23514: Cannot publish this claim version: no supporting evidence from a verified, current source version of a verified source
PASS  owner: O cannot publish a quote whose rights forbid quoting  -> refused: 23514: Cannot publish this claim version: a quote has no verified rights statement that allows quoting
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
PASS  lifecycle setup: sources, versions, rights and places Q1..Q7 with names (by A)
PASS  lifecycle setup: A submits everything
PASS  lifecycle setup: B approves sources, rights, the plain source versions, names; approves Q1..Q7 and publishes Q1..Q6
PASS  rights: a private copy under rights that do not allow copying is refused when written  -> refused: 23514: A private copy needs verified rights that allow copying
PASS  rights: a private copy under rights that are not yet verified is refused when written  -> refused: 23514: A private copy needs verified rights that allow copying
PASS  approval: a source version whose rights statement is still a draft is refused  -> refused: 23514: The rights statement of this source version is not verified
PASS  lifecycle setup: claims X1..X5 written by A
PASS  lifecycle setup: A submits X1..X5
PASS  lifecycle setup: B approves X1..X5 and publishes them in dependency order
PASS  lifecycle: X1..X5 are all current after publication
PASS  evidence: B retires source version SV21
PASS  evidence: X1 (supported only by SV21) is suspended and no longer current
PASS  evidence: X2 (also supported by SV31) stays current: suspension is not over-eager
PASS  evidence: the suspension is in the review history (decision suspend, actor B, the cause)
PASS  evidence: a suspended version cannot be published again  -> refused: 22023: Cannot publish a row that is verified
PASS  evidence: a suspension cannot be lifted by a plain update  -> refused: 42501: Status, publication, retirement, supersession and suspension change only through public.ref_review
PASS  evidence: B retires rights statement R3 (the quote's licence)
PASS  evidence: X5 (quote under R3) is suspended
PASS  evidence: a replacement must be a verified version of the same source  -> refused: 23514: The replacement must be a verified version of the same source
PASS  evidence: a replacement is only accepted with retire on an entity or a source version  -> refused: 22023: A replacement is only given when retiring an entity or a source version
PASS  evidence: B supersedes SV31 with SV32 (retire with a replacement)
PASS  evidence: SV31 records superseded_by SV32
PASS  dependencies: X2 lost its last current evidence and is suspended
PASS  dependencies: X3 (its own evidence still valid) is suspended because it depends on X2
PASS  dependencies: X4 is suspended too, two steps away (transitive)
PASS  dependencies: each suspension is a separate review event
PASS  dependencies setup: X6 (Q6 in Q4, evidence SV41) depends on the suspended X4; A writes and submits, B approves
PASS  dependencies setup: X6 submitted by A
PASS  dependencies setup: X6 approved by B
PASS  dependencies: a version depending on a suspended version cannot be published  -> refused: 23514: Cannot publish this claim version: a version it depends on is not published, or was retired or suspended
PASS  dependencies setup: Y1 (Q2 in Q4, v1, evidence SV41) and Z1 (Q5 in Q4, depends on Y1) published; Y2 (v2) approved
PASS  dependencies setup: Y1, Z1, Y2 submitted by A
PASS  dependencies setup: B approves Y1, Z1, Y2 and publishes Y1 then Z1
PASS  dependencies: Z1 is current while Y1 is the live version
PASS  dependencies: B publishes Y2, which retires Y1
PASS  dependencies: Z1 (which depended on the retired Y1) is suspended; Y2 is current
PASS  lifecycle: B retires entity Q2 (Y2 is about Q2)
PASS  lifecycle: Y2 is suspended because its subject was retired
PASS  lifecycle setup: W1 (Q6 in Q1, evidence SV22 only) published
PASS  lifecycle setup: W1 submitted by A
PASS  lifecycle setup: W1 approved and published by B
PASS  lifecycle: B retires the whole source S2
PASS  lifecycle: W1 (evidence only from a version of S2) is suspended
PASS  lifecycle: no published, unsuspended version anywhere is unsound (the verify script's health check)
PASS  owner exception kept: O self-approves a claim resting on the superseded SV31, but cannot publish it
PASS  owner exception kept: O submits and self-approves it
PASS  owner exception kept: O cannot publish on a superseded source version  -> refused: 23514: Cannot publish this claim version: no supporting evidence from a verified, current source version of a verified source
PASS  names: retiring the only display name of a published entity (Q3) is refused  -> refused: 23514: This is the published entity's last current display name: approve another name first, or retire the entity
PASS  names setup: A adds a second name for Q3 and submits it; B approves
PASS  names setup: submitted by A
PASS  names setup: approved by B
PASS  names: with a second display name, the first can be retired
PASS  names: the remaining display name cannot be retired  -> refused: 23514: This is the published entity's last current display name: approve another name first, or retire the entity
PASS  names: an entity whose only verified name is a typing shortcut (Q7) cannot be published  -> refused: 23514: An entity needs a current display name (a verified name that is not a typing shortcut) before it is published
PASS  names setup: owner turns the read switch on
PASS  names: the read door still shows Q3 by its remaining name, never a retired one
PASS  names setup: owner turns the read switch off
PASS  frozen: an approved name's text cannot be edited  -> refused: 42501: wine_reference.entity_names: this row is verified and frozen; make a new row and retire this one
PASS  frozen: an approved name cannot be deleted  -> refused: 42501: wine_reference.entity_names: a row that left draft is never deleted; retire it instead
PASS  frozen: an approved source's title cannot be edited  -> refused: 42501: wine_reference.sources: this row is verified and frozen; make a new row and retire this one
PASS  frozen: an approved source version's link cannot be edited  -> refused: 42501: wine_reference.source_versions: this row is verified and frozen; make a new row and retire this one
PASS  frozen: an approved source version's fingerprint cannot be edited  -> refused: 42501: wine_reference.source_versions: this row is verified and frozen; make a new row and retire this one
PASS  frozen: an approved rights statement's permissions cannot be edited  -> refused: 42501: wine_reference.rights_statements: this row is verified and frozen; make a new row and retire this one
PASS  frozen: superseded_by cannot be set by a plain update  -> refused: 42501: Status, publication, retirement, supersession and suspension change only through public.ref_review
PASS  frozen: a new claim version cannot be inserted already suspended  -> refused: 42501: New rows start as draft; use public.ref_review to move them on
PASS  frozen: a claim's object cannot change once a version left draft  -> refused: 42501: A claim whose versions left draft keeps its subject, type and object; make a new claim
PASS  frozen setup: taxonomy node N1's entity is submitted by A and approved by B
PASS  frozen setup: approved by B
PASS  frozen: an approved taxonomy node's code cannot change  -> refused: 42501: This taxonomy row's entity left draft; its code, parent and domain are frozen
PASS  frozen: its display order may still change
PASS  frozen: a claim type in use cannot change its required evidence  -> refused: 42501: Claim type part_of is in use: only its label, description and retirement may change
PASS  frozen: a claim type in use cannot go back to proposed  -> refused: 42501: Claim type part_of is in use: only its label, description and retirement may change
PASS  frozen: a claim type in use may change its wording
PASS  frozen: a draft name can still be edited
PASS  frozen setup: the draft name is submitted by A
PASS  frozen: a submitted name cannot be edited  -> refused: 42501: wine_reference.entity_names: this row is pending_review and frozen; make a new row and retire this one
PASS  frozen setup: B rejects it back to draft
PASS  frozen: a rejected (draft again) name can be edited
PASS  verify after tests: 001a consistency: if registered, the Owner role holds all four ref_* permissions; if not, no role holds any | 001a not registered
PASS  verify after tests: 001a consistency: no role other than owner (or editor, if the owner chose it) holds a ref_* permission | 
PASS  verify after tests: health: every private source copy is under verified rights that allow copying | 
PASS  verify after tests: health: every published entity has a current display name | 
PASS  verify after tests: health: every published, unsuspended claim version is current (sound, with current dependencies) | 
PASS  verify after tests: migration 001 release is "001 r3 (2026-10-27)" | 
PASS  verify after tests: no structure drift: the schema matches the fingerprint stored by the migration | 
PASS  owner_role_check.sql runs read-only and reports the role lookup, profiles grants and role counts
PASS  rollback refuses while the reference holds content
PASS  rollback on an empty reference runs
PASS  after rollback the public schema is exactly as before
PASS  after rollback the schema is gone
PASS  re-install after rollback runs
PASS  001a runs, and runs again
PASS  001a: owner gains ref_edit, ref_review, ref_publish, ref_rights once; editor unchanged; registered
PASS  migration stops when a required live function (my_staff_role_code) is missing
PASS  after that stop nothing was created
PASS  preflight stops (pf_foreign) and changes nothing: unexpected function
PASS  preflight stops (pf_orphan) and changes nothing: partial or foreign deployment
PASS  preflight stops (pf_drift) and changes nothing: changed by hand
PASS  preflight stops (pf_release) and changes nothing: Never replay an edited 001
PASS  preflight stops (pf_unregistered) and changes nothing: migration 001 is not registered
PASS  001a stops when migration 001 has not run
PASS  001a runs after 001
PASS  001a stops when an earlier run was partly undone (Owner lacks ref_rights)
PASS  verify reports the partial 001a as FAIL
PASS  001_rollback refuses while 001a's permissions are in place
PASS  001a_rollback runs, and runs again
PASS  001a_rollback removed every ref_* permission from every role (other permissions kept, in order) and unregistered 001a
PASS  001a runs again cleanly after its rollback
PASS  full rollback order works: 001a_rollback, then 001_rollback
TOTAL: 270 passed, 0 failed  (PostgreSQL 16.15, local throwaway database)
```

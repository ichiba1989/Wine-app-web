# Change report: Phase 2.0B.3 corrections to Migration 001 (2026-10-27)

**Status:** corrections made in the repository and tested on a throwaway local PostgreSQL 16: **270 passed, 0 failed**. Nothing was run on
the live database. Migration 001 was release **"001 r3 (2026-10-27)"**; after the final review follow-up below it is **"001 r4 (2026-11-01)"**. Details: `DESIGN.md` section 4b; tests: `TEST_REPORT.md`.

## The corrections

1. **Evidence lifecycle.** A single soundness rule (`wine_reference.version_problems`) now decides publication, automatic suspension and
   the verify script's health check. When a source version or a source is retired or superseded, a rights statement or an entity is
   retired, or a newer version is published, every published claim version that loses its basis is **suspended** at once
   (`suspended_at`, `suspended_reason`, a `suspend` review event). "Current" (`is_current`, view `current_claim_versions`) means verified,
   published, not suspended and sound.
2. **Dependencies.** Fail closed, transitively: suspension repeats until nothing changes, so every dependent at any depth is suspended;
   publication refuses a dependency that is not current; a newer version of a dependency suspends its dependents for re-review.
   Suspension is final for that version (a new version is written and reviewed).
3. **Immutability.** Names, sources, source versions, rights statements, claim versions, taxonomy assignments and entities are frozen once
   they leave draft (lifecycle changes only through `ref_review`; no deletes). Claim identities, taxonomy codes and in-use claim types are
   frozen too. Revision = a new row, reviewed, and the old one retired (`ref_review` retire now accepts a replacement for entities and
   source versions). Source versions are approved only after their source and rights; private copies need verified copy rights when
   written.
4. **Display names.** A published entity must always have a current display name (verified, not a typing shortcut, not ended): needed to
   publish; the last one cannot be retired; the read door and the verify script check it.
5. **Owner role.** `owner_role_check.sql` (read-only, for the owner to run) and `OWNER_ROLE_VERIFICATION.md` (what to confirm).
6. **Migration safety.** 001 preflight stops, changing nothing, on unexpected `ref_*` functions, partial or foreign deployments, a
   different release, or structure drift (a stored fingerprint). 001a checks its prerequisites, detects a partly undone earlier run and
   checks its own result. The verify script checks release, drift, health and 001a consistency. New SHA-256 fingerprints are in
   `DESIGN.md` section 8.
7. **Recovery.** New `001a_rollback.sql` (removes the four `ref_*` permissions from every role, unregisters 001a; safe any time);
   `001_rollback.sql` refuses until it has run. Order: 001a_rollback, then 001_rollback.

**Kept unchanged:** the Owner approval override and its audit, every evidence and rights requirement, the closed schema and the two doors.
`ref_review` has an optional fifth argument (`p_replacement`).

## Bugs found and fixed while testing

- Adding to the problem list used an expression PostgreSQL read as an array literal (fixed with `array_append`).
- The rollback still dropped the old four-argument `ref_review` (now drops the five-argument one too).
- 001a's array test and its "has 001 run?" test failed instead of stopping cleanly (rewritten; the same pattern fixed in `001_rollback.sql`).
- A private copy could be written under rights that forbid copying; only approval checked it (now refused when written).
- The test runner lost the counts of two loops (results printed but not totalled); fixed, and the PASS lines now equal the total.

## Remaining unresolved risks

1. **The live Owner lookup and profile protections are unverified** until the owner runs `owner_role_check.sql` and confirms the points in
   `OWNER_ROLE_VERIFICATION.md`.
2. **Not tested on Supabase itself** (different superuser model, event triggers, the Exposed schemas setting); `001_verify.sql` re-checks
   after the live run.
3. **Performance:** suspension and soundness scan every published version on each retire or publish; fine at the expected size, to revisit
   with migration 002 and real volumes. Concurrent reviewers were not tested.
4. **Names can end by date** (`valid_to`): the entity is then hidden by the read door (fail closed) and listed by the verify script; it is
   not prevented in advance.
5. **Suspension is final** by design; if the owner wants a "reinstate" decision instead, that is a later change (DESIGN.md decision 12).
6. **A private copy whose rights are retired later** is listed by the verify script for removal; the file itself is not removed by the
   database.
7. Still pending from earlier: the 14 domains, the subdomain taxonomy, the Phase 1.9 document, and the owner decisions in DESIGN.md
   section 7. The security review ZIP on the branch `claude/wine-app-setup-35g1ne` predates these corrections.

## Final review follow-up (2026-11-01, release "001 r4")

**Result: 294 passed, 0 failed** (full local suite, including 13 concurrency checks). The same suite against the unchanged r3 SQL:
**278 passed, 16 failed** (the 5 new name checks and 11 concurrency checks), which shows the tests catch both issues.

1. **Names valid today.** `ref_published_names` now returns only names that are themselves valid today (started and not ended); before,
   an entity with one current name also returned its ended (and not-yet-started) names. `has_display_name` now checks the start date too.
   Regression tests added.
2. **Concurrent editorial transactions.** Reproduced with two real sessions on r3: 11 of 12 races broke an integrity rule (claims
   published on evidence, rights, dependencies or entities being retired stayed current; a published entity lost its last name; cycles
   in places and dependencies were stored; evidence reached a submitted version). **Correction:** one transaction-level editorial lock,
   taken first by `ref_review` and by every trigger that checks other rows; the private-copy check takes a shared row lock on its rights
   statement instead (avoids a deadlock). On r4 all 13 concurrency checks pass, including an Owner self-approval racing a rejection.
   Strategy and limits: `DESIGN.md` section 4c.
3. **Supabase staging.** Possible without production credentials: a local Supabase stack via the Supabase command-line tool (recommended;
   needs approval for the tool and several GB of images; the Docker engine is not running in the work container) or an owner-created empty
   hosted project. Not done. `STAGING_ASSESSMENT.md`.

**Unchanged:** the Owner approval override and its audit, transitive suspension, rights checks, review history, the closed schema.

**Remaining risks added:** all editorial decisions are serialised (a long editorial transaction makes others wait); the advisory-lock
key must stay unique in the database; concurrency was tested with two sessions on local PostgreSQL, not under load or on Supabase.

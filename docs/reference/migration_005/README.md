# Migration 005: the grape-rule reconciliation and import workflow

Release `005 r1 (2026-11-13)`. **Implemented and tested locally; not run on production** (steps: `DEPLOY_005.md`). It needs 003 and 004
first. `reference_enabled` stays off.

It turns the read-only Grape rules check (004) into a reviewed workflow. The app's code list (`aocgrapes.js`) and the database table
`appellation_grape_rules` become reference facts of the type "Its rules name the grape" (`rules_name_grape`) **only after your
decision, with their sources, and as drafts**.

## The workflow (Owner page → Reference → Grape rules → Review and import)

1. **Stage for review.** One batch compares the whole code list with the table. Each appellation and grape becomes a candidate in one
   of seven states:

   | State | Meaning | What you can do |
   |---|---|---|
   | Agree | both lists name it with the same rule | take either side (each with its source), or reject |
   | Conflict | both name it but the rule differs, or the table names another principal grape for the same appellation | **pick a side or reject; never taken without you** |
   | Code list only | not in the table | take the code list's version (it must be checked against the official text), or reject |
   | Table only | not in the code list | take the table's version (its row must have a rule word and a source), or reject |
   | Needs a source | a code line still "to check", or a table row with no recognisable source | reject only; fix the source first, then stage again |
   | Not found | its appellation or grape is not in the catalog by its exact name | nothing; it is listed so you can see it |
   | Not importable | a "usual" line: the rules allow two grapes equally, so it is practice, not a rule | nothing; such lines are never facts |

   The candidate keeps the code line and the table row **exactly as stored**, so you see what each list really says.
2. **Decide**, one candidate at a time. A decision moves only through "Undecide", so it never flips silently. The database checks
   each decision again, and every change is in the change log.
3. **Import accepted as drafts.** Each accepted candidate becomes a **draft** fact:
   - place → grape variety, with its rule, minimum percentage (from the table) and type of wine;
   - its origin (`aocgrapes.js` or `appellation_grape_rules`);
   - **documentary evidence** from its source. The source is recorded as a draft "regulation" source, one per web address, and reused
     when another rule cites the same address.

   It waits, saying so, while:
   - the type is proposed;
   - the appellation or the grape is not linked (confirmed) to a reference thing.

   **Nothing is published.** Approve each source first, then review the facts as usual; 001 refuses to publish before that. A rule
   already in the reference is never imported twice, even from a later batch, and an imported candidate is frozen.

## Reading the table without knowing its columns

The live `appellation_grape_rules` column names are not recorded in this repository, so a row is read whole:
- **place and grape:** the values that are ids of `geo_areas` and `grapes`;
- **rule:** the value that is one of the rule words: sole, only, exclusive → sole; primary, main, principal → primary; permitted,
  accessory, secondary → permitted;
- **minimum percentage:** the number under a key that says percent, pct or min;
- **source:** a web address, else the value under a key that says source.

If a row cannot be read this way, its candidate says so ("needs a source", "no rule word") and cannot be accepted. The batch records
the table's column names, so the first real batch shows them.

## Rules kept

- `appellation_grape_rules`, `geo_areas`, `grapes` and the code list are only read.
- Nothing is published or switched on.
- Conflicts need your choice.
- Provenance is kept: the origin is in the fact's qualifiers and change note; the source is the evidence; the batch, the candidate and
  your decision are kept, and logged.
- `public.ref_rules`: `SECURITY DEFINER`, empty `search_path`, signed-in users only.
  - Reads need any `ref_*` permission.
  - Staging and import need `ref_edit`.
  - Decisions need `ref_review`.

  All are Owner only today.
- The two new tables have RLS, no policies, the editorial lock, the change log and TRUNCATE refusal.

## Files

| File | What it is |
|---|---|
| `005_preflight.sql` | read-only, 9 rows |
| `005_reference_grape_rules.sql` | the migration (one transaction) |
| `005_verify.sql` | read-only, 51 rows; replaces `004_verify.sql` after 005 |
| `005_rollback.sql` | undo while no batch exists |
| `live_post_deploy_005.mjs` | live check (public key; 25 checks) |
| `tests/run_005_tests.sh` | the local suite: 85 checks with `UI_PORT` |
| `tests/api_005_tests.py` | real-API workflow (43) |
| `tests/owner_ui_005.mjs` | the tab in a browser (15, with the real code list) |
| `tests/owner_rules_005.mjs` | which buttons a candidate shows (8) |
| `tests/prereq_catalog_005.sql` | one synthetic "table only" row, loaded by the 005 tests |

App: `owner.js` (`ruleReviewHtml`, `ruleDecisions`, `RULE_STATES`; `ruleLines` now also sends each line's read date), `data.js`
(`refRules`) and `app.js` (`loadOwnerRuleReview`, and the `wrrules`, `wrcand` and `wrcandstate` actions). Before 005 is run, this
section says "needs migration 005" and the 004 check above it works as before.

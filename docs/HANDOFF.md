# Hand-off: picking the project up in a new session (2026-10-19)

Read `CLAUDE.md` first: every owner decision is written there with its date (conventions 1–27 and the domain model). This page holds only
what is waiting and how the work is done.

## Workflow rule from the owner (2026-11-08)

Previously assigned Owner tasks (running SQL, checks, manual app tests) are **assumed completed successfully unless the owner reports
a problem**. Do not reopen completed phases, re-run old verifications or ask for old outputs that were not pasted. Interrupt the owner
only for a genuinely new decision, an actual test or implementation failure, a material security or data-integrity risk, or a
production deployment that needs authorisation. Process: one targeted safety review when needed, then the owner deploys, then
Claude tests and fixes, then the next phase.

## Standing instruction from the owner (2026-11-01)

At the end of **every** completed task: give the deliverable (if any), a short plain-language summary, and **one self-contained, copyable
text box** in a single fenced plain-text block titled `CHATGPT HANDOFF — <phase or task>` (the owner pastes it into ChatGPT). It must
state: project and phase; repository, branch and commit; what was done; files created or changed; deliverable name and where to download
it; test results (newly run vs. previously reported); security findings and unresolved risks; whether any live database or application
change happened; decisions the owner must make; the recommended next step. If a task fails, still give the box and say what failed.

**Delivering review packages (owner, 2026-11-08):** whenever a ZIP or other package is produced, attach it to the chat (send the file)
AND give its download link, and name the branch and path. Packages live on branch `claude/wine-app-setup-35g1ne` under
`review_packages/`; the direct download link is
`https://github.com/ichiba1989/Wine-app-web/raw/claude/wine-app-setup-35g1ne/review_packages/<file name>.zip`.

Latest review package: `review_packages/Wine_Reference_Migration_002_Review.zip` (Migration 002, 2026-11-08). Earlier: `review_packages/Wine_Reference_Phase_2_0B_3_Security_Review.zip` on branch `claude/wine-app-setup-35g1ne`
(Migration 001 **r4**, rebuilt after the final review follow-up on 2026-11-01; not on the website).
**Migration 004 (2026-11-13, release `004 r1 (2026-11-13)`): implemented and tested locally; NOT run on production; needs 003 first.**
- What it adds: `made_from` drafts from label grapes, `part_of` drafts from the catalog's place tree, subject areas on each thing, the
  read-only Grape rules check, and `rules_name_grape` (proposed).
- Tests: `docs/reference/migration_004/tests/run_004_tests.sh`, 78/0.
- Steps: `docs/reference/migration_004/DEPLOY_004.md`.
- Owner decision: which list becomes the reference for appellation grape rules (README there; recommended: C, line by line).

**Owner approved running Migration 003 r1 (2026-11-13).** As of 2026-11-13 `live_post_deploy_003.mjs` still reported "not deployed yet".
Once it is live, run `live_post_deploy_003.mjs`, `live_smoke.mjs` and `live_ui.mjs`.

**Migration 003 (2026-11-08, release `003 r1 (2026-11-08)`): implemented and tested locally; NOT run on production.**
- What it adds: subject-area import tools (no taxonomy content), product and edition drafts from the old catalog, and catalog matching
  with database rules on every link.
- Tests: `docs/reference/migration_003/tests/run_003_tests.sh`, 116 passed, 0 failed.
- Steps: `docs/reference/migration_003/DEPLOY_003.md` (preflight 9 PASS → 003 → verify 41 PASS). Then I run
  `live_post_deploy_003.mjs`, `live_smoke.mjs` and `live_ui.mjs`.
- Waiting for: the owner's go-ahead; the approved taxonomy; the type switches (recommendations in the migration's README).

**Migration 002 DEPLOYED (owner, 2026-11-08; release `002 r1 (2026-11-08)`).** Live checks after deployment: `live_post_deploy_002.mjs`
13/0, `live_smoke.mjs` 26/0, `live_ui.mjs` 26/0 (main and /vwm/); no regressions. `reference_enabled` is off and the identity types are
still proposed. Next step: the owner uses the Reference tab (first sources and places), or decides which identity types to switch on.
Earlier status:
- What it adds: the editorial door `ref_draft`, the staff read `ref_staff`, the Owner page **Reference** tab, the four wine identity
  levels (types proposed) and `legacy_links` to the old catalog.
- Tests: local Supabase on the hardened 001 r5 + 001a state, `docs/reference/migration_002/tests/run_002_tests.sh`, 96 passed,
  0 failed. That includes 57 API checks and 19 Owner-page browser checks.
- Steps: `docs/reference/migration_002/DEPLOY_002.md` (preflight → 002 → verify 35/35 → Reference tab). I then run
  `live_post_deploy_002.mjs`.
- Package: `review_packages/Wine_Reference_Migration_002_Review.zip` on `claude/wine-app-setup-35g1ne`.
- Waiting for the owner's go-ahead.

**Production state confirmed by the owner (2026-11-08):** hardening release 2, Migration 001 r5 and 001a are DEPLOYED (Owner-only
ref_* permissions; the reference is empty; `reference_enabled` is 0). The notes below that say 001 is "not run" predate this.
**Migration 001 r5 FINAL (2026-11-08):** owner decisions 5 (Owner only), 14 (stricter: restore as a new version; built and tested), 15 (accept now), 16 (r5 approved). Release label `001 r5 (2026-11-08)`. Local 359/0, Supabase compat 341/0, hardened-DB production order all PASS. **Not run on production: waiting for the owner's go-ahead**; steps in `docs/reference/migration_001/DEPLOY_001.md`, then the live checks there.
**Privilege hardening release 2: DEPLOYED by the owner on 2026-11-08** (up and verify reported successful). Live checks against production with the public key: `live_smoke.mjs` 26/26 and `live_ui.mjs` 26/26 (main and /vwm/), no regressions (`docs/security/POST_DEPLOY_REPORT.md`, which also lists the owner-only live checks). Next: Migration 001 r5 prerequisites. Earlier note: The owner runs it from `docs/security/DEPLOY.md` after approval (SQL editor: up → verify, every row PASS → app check; rollback script if needed). After it is deployed and checked: Migration 001 r5 prerequisites (DEPLOY.md, last section).
**Anonymous-access hardening (Phase 2.0B.6, proposal):** `docs/security/` holds the audit (`ANON_ACCESS_AUDIT.md`), a tested, reversible grant change (`anon_hardening_up.sql` / `anon_hardening_rollback.sql`), a read-only inventory to run on production first (`anon_inventory.sql`) and the change report; 293 checks passed on a local Supabase stack. **Not run live; waiting for the owner.**
**Release candidate r5 (Phase 2.0B.5, 2026-11-01):** `001 r5 (2026-11-01)` corrects the staging findings (statement-level editorial lock: no more SQL-editor/decision deadlock; a `retire` review event when publishing replaces a version; TRUNCATE refused) and adds a forward-only publication rule the owner must confirm (DESIGN.md decision 14); scaling stays documented (decision 15). Local suite 353 passed, 0 failed; Supabase results in `STAGING_TEST_REPORT.md`; change report `docs/reference/migration_001/CHANGE_REPORT_2_0B_5.md`; package `review_packages/Wine_Reference_Phase_2_0B_5_r5_Review.zip` on `claude/wine-app-setup-35g1ne`. **Not approved, not run live; waiting for the owner and ChatGPT.**
**Local Supabase staging (Phase 2.0B.4, 2026-11-01):** r4 unchanged, run on a disposable local Supabase stack (real Auth, Data API, GraphQL): 423 checks passed, 0 failed, plus performance at 100 / 1,000 / 10,000; results in `docs/reference/migration_001/STAGING_TEST_REPORT.md`. Two small defects (a lock-order deadlock between SQL-editor writes and decisions; the automatic retirement on publish has no review event) have a **proposed, unapproved** patch in `STAGING_CHANGE_REPORT.md` / `staging/proposed/`; two owner decisions (older version replacing a newer one; decision time grows with the published total). Review package: `review_packages/Wine_Reference_Phase_2_0B_4_Staging_Review.zip` on `claude/wine-app-setup-35g1ne`. **Waiting for the owner and ChatGPT; nothing deployed, `reference_enabled` untouched.**
**Final review follow-up (2026-11-01, release "001 r4"):** the read door returns only names valid today; an editorial transaction lock fixes 11 reproduced concurrent-transaction races (`tests/concurrency_tests.sh`); Supabase staging assessed (`docs/reference/migration_001/STAGING_ASSESSMENT.md`, needs approval). Suite: 294 passed, 0 failed.

## Where things stand

- **Branches.** Main working branch `main` (renamed on 2026-10-19 from `claude/wine-discovery-architecture-3pithw`; the old `main` is frozen as `archive/old-main`) (the app at the site's address) and `vwm` (Vintage Wine
  Merchants, under `/vwm/`). Both are pushed and published. Shared changes are made on the main branch first, then merged into `vwm`
  (recipe in `docs/tools/README.md`). **`docs/BRANCHES.md` is the ledger of what main has that `vwm` does not yet, and what is only in `vwm`: keep it current.** Never push to a `backup/` branch (`docs/VERSIONS.md`). No pull request unless the owner asks.
- **Restore point and new-chat prompt (2026-10-26):** the app as it was before the owner's big change is saved as `backup/before-big-change-2026-10-26` (main) and `backup/vwm-before-big-change-2026-10-26` (venue); how to go back is in `docs/VERSIONS.md`. `docs/NEW_CHAT_PROMPT.md` is a ready-made prompt for starting a new code chat.
- **Wine Education Master Reference (the big change, started 2026-10-26; nothing built yet):** Phase 2.0A audit done (shared doc "Wine Reference Audit (Phase 2.0A)"); the owner approved the direction provisionally (same Supabase database, additive, reference before education, no bulk content). Phase 2.0B.1 (docs only): `docs/REFERENCE_MODEL.md` (draft model; the 14 domains, the 140-subdomain taxonomy and the eight Phase 1.9 revisions are **pending import**, never invented) and the **read-only** inspection `docs/reference/inspect_1_structure.sql` + `inspect_2_catalog.sql` (how to run: `docs/reference/INSPECTION.md`). The owner ran both scripts on 2026-10-26; the summary is `docs/reference/results/FINDINGS.md` (raw files kept by the owner, never committed: `docs/` is published) and `docs/REFERENCE_MODEL.md` was updated with it. Found on the way: `rank_appellations.sql` and `restaurant_visits.sql` are not run yet; the parked tech sheet's `techsheet_enabled` is 2 (open to players; the owner decides whether to set 0). **Waiting for the owner:** the 14 domains, the subdomain taxonomy, the Phase 1.9 revisions, approval of the namespace (dedicated schema recommended) and the questions in `docs/REFERENCE_MODEL.md` §15. **Phase 2.0B.2 done (2026-10-26): migration 001 designed, drafted and tested on a throwaway local PostgreSQL NOT run live; amended the same day so the Owner may approve their own work (recorded as `owner_override`), suite re-run: 160 passed, 0 failed; **Phase 2.0B.3 corrections (2026-10-27, release "001 r3"): evidence lifecycle, transitive suspension, frozen approved records, display names, preflight and drift checks, `001a_rollback.sql`, read-only `owner_role_check.sql`; 270 passed, 0 failed; see `CHANGE_REPORT_2_0B_3.md`**: `docs/reference/migration_001/` (DESIGN.md with the approval checklist, DATA_DICTIONARY.md, TEST_REPORT.md, the SQL, `001a` permissions, verify, rollback, `tests/run_local_tests.sh`). Waiting for the owner's decisions in DESIGN.md §7 and written approval before anything runs live. **One-document summary for passing on: `docs/reference/WINE_REFERENCE_BRIEFING.md`** (keep it current when the reference changes).
- **Publishing.** Push, then run the GitHub Actions workflow `pages.yml` on the main branch (it publishes both branches).
- **Latest (2026-10-19, later):** **At a restaurant** (More tab): type or paste a wine list, say the dishes, occasion and how adventurous, get a "To start" toast for a celebration, three picks and the ranked list (`winelist.js`, `restaurant.js`, `restview.js`). **Photo reading is not built (needs the owner's provider choice, key, cost and a privacy line).** The feature is behind `app_config restaurant_visits_open` (0 = owner only).
- **Before that (2026-10-19):** the **More tab** (Games and Food), the Food screens (pick a wine, chart, tweak a dish, build a plate, plan a menu; `foods.js`, `foodview.js`), the owner's pairing pins, Food ideas on the rating sheet, and the Year in wine recap kept but hidden (`SHOW_RECAP`). The working branch was renamed `main` (old `main` is `archive/old-main`).
- **Earlier (2026-10-17 to 2026-10-19):** the Atlas and the card's map (INAO outlines for French AOCs), the appellation and its
  designation on the card, grapes from the appellation's rules (`aocgrapes.js`), wines shown named the way the label reads (`displayCuvee`),
  the designation shown quietly on Atlas place pages ("Wine area · AOC"), and "Grand Cru" appellations of their own (`rankaoc.js`:
  Saint-Émilion Grand Cru, Chablis Grand Cru, the Alsace grands crus).

## Database scripts the owner runs by hand (Supabase, SQL editor), in this order

Each is safe to run again. The app works before they are run; they make the catalog right.

1. `docs/catalog_speed.sql` (third version), if not run yet: Discover's catalog loads in under a second instead of 15.
2. `docs/sparkling_dosage.sql`, then `docs/sparkling_dosage_fill.sql`: sweetness terms (Brut, Extra Brut ...) in their own field; 217 names
   tidied, old names kept in `wine_name_backup`.
3. `docs/rank_appellations.sql`: makes Saint-Émilion Grand Cru, Chablis Grand Cru and the Alsace grands crus our wines need, and moves about
   23 wines (Château Beau-Séjour Bécot, Ausone, Pavie, Dauvissat Les Clos, Weinbach Furstentum ...). Its last result lists every move and why;
   the undo is at the end of the file.
4. Then regenerate and run the grape fill: `node docs/appellation_grapes.mjs` (a session does this), then run
   `docs/appellation_grapes_fill.sql` (about 280 wines get the grape their appellation's rules name; now also Chablis Grand Cru).
5. `docs/food_pairing.sql`: the owner's hand-set food pairings (Owner page, Pairings tab). The Food screens work without it.
   `docs/restaurant_visits.sql`, then `docs/retain_after_delete.sql` again: saved restaurant visits. **Keep `restaurant_visits_open` at 0 until `privacy.html` has its line.**
6. Whatever is still unticked in `docs/TEST_BEFORE_TESTERS.md` (older scripts: reactions, skip counts, tags, roles, legend, tags on wines ...).

## Open items for the owner

- The grape list has the typo "Cabernet Sauvigon" and no "Cabernet Franc" (Saumur-Champigny's rule cannot be stored until it exists).
- Grape-rule lines marked "to check" in `aocgrapes.js` show on cards now (owner's choice) but need the official texts read before they are
  marked checked and stored.
- Left for an editor: Zusslin "Pfingstberg Vendages Tardive" (not found labelled Grand Cru); Grand Barrail Lamarzelle Figeac stays at
  St.-Émilion (no source).
- Owner page, Checks, Places: "St.-Émilion -> Saint-Émilion" is now marked confirmed (INAO's list); apply it when ready.
- The map data must be refreshed every six months; next due April 2027 (`docs/DATA_REFRESH.md`). Reminders and timers for upkeep are
  deferred to the real app launch (`docs/ARCHITECTURE_PLAN.md`).
- Before launch: close the Plan switch (`app_config.plan_switch_open` = 0), and the `privacy.html` lines listed in `CLAUDE.md` (owner and lawyers).

## How the work is done

- Release checklist: `node --check` every changed file; bump `?v=` with `python3 docs/tools/cascade.py <files> --apply`; bump `app.js?v=` in
  `index.html`; run the browser checks in `docs/tools/README.md`; commit with a short imperative subject; push; publish.
- After merging into `vwm`, find modules whose content changed but whose version did not (then bump them with `cascade.py`):

      python3 - <<'EOF'
      import re, glob, subprocess
      def vers(read):
          d = {}
          for f in glob.glob('*.js') + ['index.html']:
              for m in re.finditer(r'\./([\w]+\.js)\?v=(\d+)', read(f) or ''): d.setdefault(m.group(1), set()).add(m.group(2))
          return d
      cur = vers(lambda f: open(f).read())
      old = vers(lambda f: subprocess.run(['git', 'show', 'HEAD:' + f], capture_output=True, text=True).stdout)
      print('mixed versions:', [(k, v) for k, v in cur.items() if len(v) > 1])
      for mod, v in cur.items():
          o = subprocess.run(['git', 'show', 'HEAD:' + mod], capture_output=True, text=True).stdout
          if o and o != open(mod).read() and old.get(mod) == v: print('bump', mod)
      EOF

- The public catalog can be read with the public key in `config.js` (as `docs/rank_appellations.mjs` does); never use a secret key.
- Ask the owner whether a change is for one version or all before touching the database or shared catalog data (`CLAUDE.md`).

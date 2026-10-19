# Saved versions (restore points)

Each saved version is a **backup branch** on GitHub that is never changed after it is made: a permanent copy of one exact state of every file. (A git tag would be the usual way, but this environment cannot push tags, so a frozen branch is used. Never push new work to a backup branch.)

## Three-Answer Deck, v1 (branch `backup/deck-v1-three-answers`, commit `9491ea5`) — saved 2026-10-10
The Discover deck as it works today, before the planned change to how swiping works and what it registers.

**How the deck works in this version**
- Three answers on each card: swipe right **I recognize it**, swipe left **I don't know it**, swipe up **I've had this bottle** (it also adds the wine to the journal), plus a separate **Not interested** button. The same answers are buttons under the card and double-taps near the edges. Pinch, the Zoom button and a double-tap on the middle zoom the card.
- "Recognize", "don't know" and "had" all imply interest (`try`) unless the player marks "Not interested" (`nope`). "I don't know it" is never a like or a dislike.
- The deck order comes from `deck.js` (three decks mixed by what the player knows and likes: familiar, getting warmer, new territory), using swipes, rated journal wines, quiz knowledge and community counts.

**What it registers**
- Each swipe is one row in `encounters` (event `swipe`, `familiarity` = recognize / unknown / had, `interest` = try / nope), written by the `record_swipe` RPC. A later change of interest is an `interest_change` row. Swipe up also creates a journal entry (`consumptions`, origin `swipe_up`).
- Deleting a swipe or entry only hides it (`deleted_at`, `docs/soft_delete.sql`). Views read: `v_user_wine_state`, `v_journal_entries`.
- Counts on the Discover screen come from `countSwipesAndJournal`.

**The app at this point**: `app.js?v=65`; saved from the working branch (then named `main`, now `main`) at commit `9491ea5`.

**Database scripts that were run for this version** (all are additive; older code keeps working with them): `this_or_that.sql`, `retain_after_delete.sql`, `soft_delete.sql`, plus `import_tier.sql` and `import_limit.sql` (the last two are ready but the owner has not confirmed running them). The database is **not** part of a tag: going back restores the files only, not the data or the database functions.

### How to look at it, or go back to it
- **See the files without changing anything:** `git fetch origin backup/deck-v1-three-answers && git checkout origin/backup/deck-v1-three-answers` (then `git checkout main` to return). Or on GitHub: switch the branch drop-down to `backup/deck-v1-three-answers`, and use Code, Download ZIP.
- **Make the live site use it again** (the site is served from the working branch): `git checkout -B main origin/backup/deck-v1-three-answers` then `git push --force-with-lease origin main`. This replaces the working branch with the saved version, so first save anything newer you want to keep as its own backup branch.
- **Compare with now:** `git diff origin/backup/deck-v1-three-answers main --stat`.

## Like / Dislike deck, v2 (current, from 2026-10-10)
Swipe right Like, swipe left Dislike, a button for I don't know it, swipe up / button for I've had this bottle. Likes and dislikes count toward the palate (provisional weights); I don't know it counts for nothing in the palate, pushes similar wines down the deck (never removes them) and is recorded for recommendations and quizzes. Needs `docs/reactions.sql` in the database. To go back to v1, see the steps above (the database keeps the extra `reaction` and `context` columns; v1 code ignores them and still reads the rows through the old familiarity and interest columns).

## Before the Tech sheet (branch `backup/before-tech-sheet`, commit `f0da923`) — saved 2026-10-14
The app exactly as it was before the Tech sheet (researched, sourced wine facts and the full-page sheet) was started: offline mode, roles/plans/Roles tab included, no Tech sheet. **Why it exists:** the owner asked for the Tech sheet to be fully retractable. To go back, use the same steps as above with this branch name; the database scripts for the Tech sheet only add separate tables, and `docs/tech_sheet_remove.sql` drops them (see `docs/TECHSHEET_REMOVAL.md`). The app at this point: `app.js?v=83`.

## Tech sheet, parked (branch `backup/tech-sheet-parked`, commit `524c505`) — saved 2026-10-14
The app with the whole Tech sheet in it (sourced wine facts, the full-page sheet, Off / Staff only / Everyone switch, Editors' Facts tools, the research pack with `tools/verify-research.mjs`), saved just before it was taken out at the owner's request. **Why it exists:** to revisit the feature later without rebuilding it. Its database scripts (`docs/tech_sheet.sql`, `docs/tech_sheet_research.sql`) only add separate tables and are still in `docs/`. To compare: `git diff origin/backup/tech-sheet-parked main --stat`.

## Venue test branches (live, not frozen)
- **`vwm`**: the Vintage Wine Merchants version (started 2026-10-14; "VWM" is internal only). It lives only on its own branch; this main branch does not carry its code. Same database and accounts; it adds the table `venue_wines` (script on that branch). See that branch's `CLAUDE.md`, convention 26.

## How to save a new version
`git push origin HEAD:refs/heads/backup/NAME` (a new name each time, never an existing one), and add a section here with the commit. Use clear names (for example `deck-v2-...`).

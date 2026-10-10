# Saved versions (restore points)

Each saved version is a **git tag**: a permanent name for one exact state of every file. Tags never move, so a tag is a safe place to go back to.

## Three-Answer Deck, v1 (`deck-v1-three-answers`) — saved 2026-10-10
The Discover deck as it works today, before the planned change to how swiping works and what it registers.

**How the deck works in this version**
- Three answers on each card: swipe right **I recognize it**, swipe left **I don't know it**, swipe up **I've had this bottle** (it also adds the wine to the journal), plus a separate **Not interested** button. The same answers are buttons under the card and double-taps near the edges. Pinch, the Zoom button and a double-tap on the middle zoom the card.
- "Recognize", "don't know" and "had" all imply interest (`try`) unless the player marks "Not interested" (`nope`). "I don't know it" is never a like or a dislike.
- The deck order comes from `deck.js` (three decks mixed by what the player knows and likes: familiar, getting warmer, new territory), using swipes, rated journal wines, quiz knowledge and community counts.

**What it registers**
- Each swipe is one row in `encounters` (event `swipe`, `familiarity` = recognize / unknown / had, `interest` = try / nope), written by the `record_swipe` RPC. A later change of interest is an `interest_change` row. Swipe up also creates a journal entry (`consumptions`, origin `swipe_up`).
- Deleting a swipe or entry only hides it (`deleted_at`, `docs/soft_delete.sql`). Views read: `v_user_wine_state`, `v_journal_entries`.
- Counts on the Discover screen come from `countSwipesAndJournal`.

**The app at this point**: `app.js?v=65`; branch `claude/wine-discovery-architecture-3pithw`.

**Database scripts that were run for this version** (all are additive; older code keeps working with them): `this_or_that.sql`, `retain_after_delete.sql`, `soft_delete.sql`, plus `import_tier.sql` and `import_limit.sql` (the last two are ready but the owner has not confirmed running them). The database is **not** part of a tag: going back restores the files only, not the data or the database functions.

### How to look at it, or go back to it
- **See the files without changing anything:** `git checkout deck-v1-three-answers` (then `git checkout claude/wine-discovery-architecture-3pithw` to return).
- **Make the live site use it again** (the site is served from the branch): `git checkout -B claude/wine-discovery-architecture-3pithw deck-v1-three-answers` then `git push --force-with-lease origin claude/wine-discovery-architecture-3pithw`. This replaces the branch with the saved version, so first save anything newer you want to keep under its own tag.
- **Keep the old version next to the new one:** `git branch deck-v1 deck-v1-three-answers` and push that branch.
- On GitHub: the tag is under Code, Tags (or Releases). You can download a zip of it from there.

## How to save a new version
`git tag -a NAME -m "what this version is"` then `git push origin NAME`, and add a section here. Use clear names (for example `deck-v2-...`).

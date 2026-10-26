# Main branch and venue branches: what is where

How the two kinds of branch relate (owner, 2026-10-19):

- **Main** (`main`) is where every shared change is made first.
- **Venue branches** (today only `vwm`, Vintage Wine Merchants) should receive **every main change** by merging main into them (recipe:
  `docs/tools/README.md`). The goal is that nothing on main is missing from a venue.
- A **venue may keep changes of its own** that do not belong on main (its shop's wine list, links, review tools). Those are never merged
  back into main unless the owner asks.
- So the rule for each change is: main first, then merged into every venue; venue-only work stays on that venue's branch and is listed below.

**Keep this page current.** Whenever a commit lands on main, add a line under "On main, not yet in a venue" until it is merged. When a venue
is merged, move the lines to "Merged" with the date. Whenever a venue gets something of its own, add it under that venue's own section.

## Frozen branches
- `archive/old-main` (commit `dbbae30`): the repository's original `main`, kept as it was when the working branch was renamed to `main` on 2026-10-19
  (it had diverged: 267 commits not in the working branch). Never push to it or delete it, like the `backup/` branches (`docs/VERSIONS.md`).
- The long-named working branch `claude/wine-discovery-architecture-3pithw` no longer exists; the old name appears only in history. After the rename a clone needs
  `git fetch origin && git branch -m claude/wine-discovery-architecture-3pithw main && git branch -u origin/main main`.

## Venue: `vwm` (published under `/vwm/`)

### On main, not yet merged into `vwm`
_(nothing: `vwm` has all of main as of 2026-10-26)_

### Merged (main is in `vwm` up to)
- 2026-10-26: main's **reference model draft and read-only database inspection** (Phase 2.0B.1; documents and SQL only, no app file changed:
  `docs/REFERENCE_MODEL.md`, `docs/reference/`) merged into `vwm`. No version numbers changed.
- 2026-10-26 (later): main's **database inspection findings** (`docs/reference/results/FINDINGS.md`, the model updated; documents only)
  merged into `vwm`.
- 2026-10-19 (latest): main's **At a restaurant** (convention 31, `docs/restaurant_visits.sql`) merged into `vwm`; there the matching and the taste context use the venue's own list as the catalog. Conflicts were `?v=` numbers, duplicated import lines and `CLAUDE.md`; the new files were pointed at `vwm`'s numbers (`text.js` 3, `logic.js` 25, `recommend.js` 17, `grapes.js` 3, `flavors.js` 4, `structure.js` 16, `aocgrapes.js` 3). All `vwm` browser checks pass (venue_ui 17, vrev_ui 48, sure_ui 14, atlas_v 14, cardmap_v 19, steps 12, food_more_ui 25, food_owner_ui 11, food_ui 4, restaurant_ui 29) and the Node checks (foods 49, restaurant 38).
- 2026-10-19 (later): main's **More tab, Food screens and the owner's pairing pins** (convention 30, `docs/food_pairing.sql`) merged into `vwm`. Conflicts
  were `?v=` numbers and imports plus hand-resolved lines in `app.js` (the venue's tab title and state kept, `FOOD`, `f` and the More title added),
  `owner.js` (the venue list tab kept, the Pairings tab added), `index.html` and `CLAUDE.md`. On `vwm`, `foods.js` and `foodview.js` import `rules.js?v=6`
  and `logic.js?v=25` (main: 5 and 23): the usual number differences. `venue_ui.mjs` was updated because the tab now opens on More (click Games first).
  All `vwm` browser checks pass: venue_ui 17, vrev_ui 48, sure_ui 14, atlas_v 14, cardmap_v 19, steps 12, food_more_ui 25, food_owner_ui 11, food_ui 4.
- 2026-10-19: main (branch rename to `main`, Food ideas on the rating sheet, parked recap, this ledger) merged into `vwm`. Conflicts were only `?v=`
  numbers and imports (settled with `resolve_v.py` / `resolve_imports.py`); `recap.js` was pointed at `logic.js?v=25` (the `vwm` number) and the
  changed modules re-bumped with `cascade.py`. `vwm` browser checks: venue_ui 17, vrev_ui 48, sure_ui 14, atlas_v 14, cardmap_v 19, steps 12,
  food_ui 4, all passing.
- 2026-10-19 (earlier): main `0e57e98` (hand-off notes and working tools) merged as `10d47a4`. Includes the Atlas, the card's map, label-style names,
  appellation grapes, Grand Cru appellations, the sparkling sweetness term and the paged catalog read.

### Only in `vwm` (not meant for main)
Read `git log origin/main..origin/vwm --no-merges` and `CLAUDE.md` on `vwm` for the full list. In short: the Owner **list** tab that manages
the venue's deck (filters, website link per wine, edit or review a wine, tick boxes with mass find, check, clear, tag and remove), the
Vintage Wine Merchants **review** (researched places and sweetness terms with source links, "publish the sure ones"), the `venue-links`
Edge Function and the venue's own wine list. Differences that are not features: `text.js` is `?v=3` there (`?v=2` on main), the service-worker
cache is named `vwm-app-`, and the shared pages workflow is identical.

## Before ending a session
1. `git log origin/vwm..HEAD` shows what main has that `vwm` lacks; the list above must match it.
2. Merge main into `vwm`, run the checks in `docs/tools/README.md`, push both, and run the `pages.yml` workflow.

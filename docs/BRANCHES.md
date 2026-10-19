# Main branch and venue branches: what is where

How the two kinds of branch relate (owner, 2026-10-19):

- **Main** (`claude/wine-discovery-architecture-3pithw`) is where every shared change is made first.
- **Venue branches** (today only `vwm`, Vintage Wine Merchants) should receive **every main change** by merging main into them (recipe:
  `docs/tools/README.md`). The goal is that nothing on main is missing from a venue.
- A **venue may keep changes of its own** that do not belong on main (its shop's wine list, links, review tools). Those are never merged
  back into main unless the owner asks.
- So the rule for each change is: main first, then merged into every venue; venue-only work stays on that venue's branch and is listed below.

**Keep this page current.** Whenever a commit lands on main, add a line under "On main, not yet in a venue" until it is merged. When a venue
is merged, move the lines to "Merged" with the date. Whenever a venue gets something of its own, add it under that venue's own section.

## Venue: `vwm` (published under `/vwm/`)

### On main, not yet merged into `vwm`
- 2026-10-19 `12e7910` Year in wine recap (`recap.js`, Profile). **Parked and hidden** by the next commit (`SHOW_RECAP = false` in
  `profile.js`); it is harmless to merge.
- 2026-10-19 Recap hidden from the Profile tab; this page.

### Merged (main is in `vwm` up to)
- 2026-10-19: main `0e57e98` (hand-off notes and working tools) merged as `10d47a4`. Includes the Atlas, the card's map, label-style names,
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

# Working tools (not part of the app)

Helper scripts and browser checks used while building the app. Nothing here is loaded by the app or published as part of it; there is still no
build step. Saved from the working session on 2026-10-19 so a new session can check its work the same way.

## Version numbers (convention 1 in CLAUDE.md)

- `python3 docs/tools/cascade.py a.js,b.js` shows which `?v=` numbers must go up when `a.js` and `b.js` changed (every module that imports
  them, and the ones that import those). Add `--apply` to write the bumps. Then bump `app.js?v=` in `index.html` by hand.
- After `git merge` of the main branch into `vwm`:
  1. `python3 docs/tools/resolve_v.py`: settles conflicts where only `?v=` numbers differ (takes the higher one);
  2. `python3 docs/tools/resolve_imports.py`: settles conflicts made only of import lines;
  3. settle what is left by hand; on `vwm`, `text.js` is `?v=3` (on main it is `?v=2`), so any new import of it there must say 3;
  4. `grep -rn '^<<<<<<<\|^>>>>>>>' --include='*.js' --include='*.html' --include='*.md' .` must print nothing;
  5. compare with the last `vwm` commit: a module whose content changed but whose `?v=` did not must be bumped with `cascade.py`
     (the check is in `docs/HANDOFF.md`).

## Browser checks (Playwright, the Chromium already in the cloud environment)

Each check opens the app at phone width with a fake database (`stub_quiz.js` for the main app, `stub_venue.js` for Vintage Wine Merchants)
and a fake catalog (`cards*.json`), so nothing touches the real database. Screenshots land in this folder and are ignored by git.

Serve the main branch (the repository itself works) and run:

    python3 -m http.server 8125 &              # from the repository root
    node docs/tools/atlas_ui.mjs               # the Atlas (39 checks)
    node docs/tools/cardmap_ui.mjs             # the card's map (19)
    node docs/tools/mortet_ui.mjs              # label-style names, grape rule chips (7)
    node docs/tools/morgon_ui.mjs              # appellation on the card and its map (13)
    node docs/tools/rank_ui.mjs                # Saint-Émilion Grand Cru, Chablis Grand Cru (8)
    node docs/tools/steps_ui.mjs               # the catalog arriving in pieces (12)
    node docs/tools/food_ui.mjs                # Food ideas on the rating sheet (4)

The `vwm` checks expect a copy of the `vwm` branch served on port 8124:

    git worktree add /tmp/vwm vwm && (cd /tmp/vwm && python3 -m http.server 8124 &)
    node docs/tools/atlas_v.mjs; node docs/tools/cardmap_v.mjs; node docs/tools/venue_ui.mjs; node docs/tools/vrev_ui.mjs; node docs/tools/sure_ui.mjs
    PORT=8124 node docs/tools/steps_v.mjs
    PORT=8124 LIB=stub_venue.js INIT="window.__VENUE_N = 9;" node docs/tools/mortet_ui.mjs   # also morgon_ui, rank_ui

`PORT` picks the port, `SP` the folder for stubs and screenshots (default: this folder). Each check ends with a pass/fail count.

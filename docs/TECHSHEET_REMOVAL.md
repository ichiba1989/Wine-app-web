# Tech sheet: how to switch it off, hide it, or remove it completely

The Tech sheet (researched, sourced wine facts and a full-page sheet per wine) was built to be retractable. Pick the level you need.

**Restore point:** the branch `backup/before-tech-sheet` is the whole app exactly as it was before the Tech sheet was started (see `docs/VERSIONS.md`).

## Level 1: switch it off (instant, nothing lost)
Owner page, **Config** tab: set `techsheet_enabled` to **0**. The Tech sheet button, the Editor "Facts" section and the Owner "Facts" tab disappear for everyone, and the database refuses the Tech sheet functions and hides its tables from players. The facts, sources and finds stay stored; set it back to 1 (Editors and Owner only) or 2 (everyone) to bring everything back.

## Level 2: remove it from the app (code), keep the data
1. Easiest: undo the work with git. The Tech sheet was committed as one labelled series ("Tech sheet ..."). `git log --oneline --grep="Tech sheet"` lists it; `git revert <newest>^..<oldest>` (or revert each) removes it from the app. The earlier steps of the app are untouched.
2. By hand: delete `techsheet.js` and `techsheetui.js`, then remove the hook lines. Search the files below for these words (every hook is marked or contains one of them): `TECHSHEET`, `techsheet`, `techLevel`, `tech:`, `mountFacts`, `factsHtml`, `techOn`.

| File | What to remove |
|---|---|
| `app.js` | the `TECHSHEET` block that loads `techsheetui.js` (`loadTechModule`, `TECH`, `TECHMOD`, `FACTS`); `techLevel` in `state` and in the `accessOf(...)` features; the `loadTechsheetLevel` line in `enterMain`; `flags` and `mountFacts` in `createEditor(...)`; `loadOwnerFacts` and the `factsHtml`/`techOn` fields in `ownerData`; the `tech: access().techsheet` option when the rating sheet is drawn; the `action === "tech"` branch |
| `views.js` | `techButtonHtml` and the `tech` option in `sheetHtml` (its use on the Details page) |
| `editor.js` | the `facts` entry in `SECTIONS` and `SECTION_PERMISSIONS`, `flags`, the `E.section === "facts"` line, and the `flags` argument of `sectionsFor` |
| `owner.js` | the `facts` entry in `OWNER_TABS` and the two `facts` lines (`ownerTableHtml`, the tab filter in `ownerHtml`) |
| `data.js` | everything between `TECHSHEET: researched, sourced wine facts` and `END TECHSHEET` |
| `access.js` | `techsheetShown` and the three `techsheet...` flags |
| `index.html` | the CSS between `/* TECHSHEET */` and `/* END TECHSHEET */`, and `<div id="techOverlay">` |
| docs | `CLAUDE.md` convention 24 and the layout-table entry; `docs/ROLES_AND_ACCESS.md` Tech sheet lines; section "Tech sheet" in `docs/TEST_BEFORE_TESTERS.md` |

Then bump `?v=` for every changed file and `app.js?v=` in `index.html` (this also replaces the offline cache). A player's ticked fields (`wine.techfields`) stay on their phone and do nothing.

## Level 3: remove it from the database
1. Optional, read-only: run the first lines of `docs/tech_sheet_remove.sql` (STEP 0) to see, and copy out, the confirmed facts.
2. Run `docs/tech_sheet_remove.sql` (STEP 1 hides it; STEP 2 drops the four tables, the `techsheet_*` functions and the three `techsheet_*` settings). Nothing else in the database is changed: journals, swipes, wines, notes, photos and players are untouched.
3. If the research function was deployed: delete the Edge Function `find-wine-facts` and its secret in Supabase.
4. If a line about it was added to `privacy.html`, remove it and bump `CONSENT_VERSION` (owner and lawyers).

## Check it worked
`node --check` every `.js` file; open the app: Discover, Journal, rating sheet, Editor and Owner pages look as before the Tech sheet.

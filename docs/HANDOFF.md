# Hand-off: picking the project up in a new session (2026-10-19)

Read `CLAUDE.md` first: every owner decision is written there with its date (conventions 1–27 and the domain model). This page holds only
what is waiting and how the work is done.

## Where things stand

- **Branches.** Main working branch `claude/wine-discovery-architecture-3pithw` (the app at the site's address) and `vwm` (Vintage Wine
  Merchants, under `/vwm/`). Both are pushed and published. Shared changes are made on the main branch first, then merged into `vwm`
  (recipe in `docs/tools/README.md`). **`docs/BRANCHES.md` is the ledger of what main has that `vwm` does not yet, and what is only in `vwm`: keep it current.** Never push to a `backup/` branch (`docs/VERSIONS.md`). No pull request unless the owner asks.
- **Publishing.** Push, then run the GitHub Actions workflow `pages.yml` on the main branch (it publishes both branches).
- **Last work (2026-10-17 to 2026-10-19):** the Atlas and the card's map (INAO outlines for French AOCs), the appellation and its
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
5. Whatever is still unticked in `docs/TEST_BEFORE_TESTERS.md` (older scripts: reactions, skip counts, tags, roles, legend, tags on wines ...).

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

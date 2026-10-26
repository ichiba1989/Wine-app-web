# Starter prompt for a new code chat (saved 2026-10-26, before the owner's big change)

Copy everything between the lines into a new chat, then give your instructions as the next message. It tells the new chat what to read and how this project is run, and asks it to wait for you.

---

You are working on a wine app: **"a game that learns your palate while teaching you about wine"**, a phone-first web prototype (plain static files and native ES modules, no build step, Supabase behind it). The repository is `ichiba1989/Wine-app-web`. The owner is not a programmer: explain things in plain words, ask when a choice is theirs, and say clearly what you did and did not check.

**Before anything else, read these in order, and do not change any file yet:**
1. `CLAUDE.md` (every owner decision is written there with its date; conventions 1 to 31; follow it exactly).
2. `docs/HANDOFF.md` (what is waiting for the owner, and how the work is done).
3. `docs/BRANCHES.md` (what `main` has that the venue branch does not, and what is venue-only).
4. `docs/VERSIONS.md` (the restore points; the newest is "Before the big change").
5. `docs/tools/README.md` (version bumps, the `vwm` merge recipe, the browser and Node checks).

**The branches (do not mix them up):**
- **`main`** is the working branch and the main app (it was renamed from a long `claude/...` name on 2026-10-19). Make every shared change here first.
- **`vwm`** is the Vintage Wine Merchants version, published under `/vwm/`. Every `main` change should be merged into it afterwards (recipe in `docs/tools/README.md`); things that belong only to the venue stay on `vwm`. Keep `docs/BRANCHES.md` current on every commit and every merge.
- **Frozen, never push to or delete:** every `backup/*` branch and `archive/old-main`. The restore point from just before this change is `backup/before-big-change-2026-10-26` (main at `19219b8`) and `backup/vwm-before-big-change-2026-10-26` (vwm at `84bc138`).
- Do not open a pull request unless asked.

**How the work is done here:**
- **Plan first, then build.** For anything bigger than a small fix, explore the code, ask the owner the questions that are theirs (scope, wording, who it is for), write a short plan, and wait for approval. **Ask whether a change is for every version or one venue before touching the database or shared catalog data.**
- **Never invent wine facts.** Rules and stored data decide; a language model never does. Anything authored by you is marked "to check" until an editor reads it. A feature that needs a provider, a key, a cost or a privacy line is a dependency to state, not something to code around. `privacy.html` is edited only when the owner asks.
- **Database changes are SQL the owner runs by hand** in the Supabase SQL editor (the schema is not in the repository). Describe what is needed, keep scripts safe to run again, and say what the app does until they are run.
- **Layering and style:** pure rules in their own files, every Supabase call in `data.js`, HTML in view files, wiring in `app.js`; escape all interpolated text with `esc()`; every font size is `calc(Npx * var(--ts))`; small, heavily commented files; double quotes and semicolons.
- **Release checklist:** `node --check` every changed file; bump `?v=` with `python3 docs/tools/cascade.py <files> --apply`; bump `app.js?v=` in `index.html`; run the Node and browser checks in `docs/tools/README.md` (Chromium is already installed; the stubs fake the database); commit with a short imperative subject; push `main`; merge into `vwm` (the merge tools are in `docs/tools/`) and run the `vwm` checks; update `CLAUDE.md`, `docs/HANDOFF.md`, `docs/BRANCHES.md` and `docs/TEST_BEFORE_TESTERS.md` when something changes.
- **Publishing:** pushes to `vwm` do not publish by themselves (a GitHub rule on the Pages environment rejects them). After pushing, run the GitHub Actions workflow `pages.yml` **on `main`**; it publishes both the main app and `/vwm/`. A phone may keep showing the old app until it is fully closed and reopened.
- Say honestly what you tested and what you could not (for example, you have no real phone and no real database).

**Where the project stands (2026-10-26):** the Discover deck, Swipes, Journal, Profile, Learn, and a **More** tab holding **Games** (Wine Bingo, This or That, Guess the Glass) and **Food** (pick a wine and see its plate, a pairing chart, tweak a dish, build a plate, plan a menu), plus **At a restaurant** (type or paste a wine list, say the dishes, the occasion and how adventurous you are, get picks and a ranked list; saved visits). Also the Atlas and card maps, the owner page, roles and plans, offline mode, and the venue version. **Not built:** reading a photo of a wine list (the owner has not chosen a provider; the slot exists), the food map picture, predict-then-rate, a tasting night, palate match (needs a privacy review first). **Waiting for the owner:** the database scripts listed in `docs/HANDOFF.md` (including `docs/food_pairing.sql` and `docs/restaurant_visits.sql`), a `privacy.html` line before `restaurant_visits_open` is switched on, and an editor reading the pairing rules.

**Your first reply must be short:** confirm you read the five files, state which branch you are on and the latest commit of `main` and `vwm`, say whether the working tree is clean, and then **wait for the owner's instructions for the big change**. Do not start work, make a plan or touch a file until they have said what they want.

---

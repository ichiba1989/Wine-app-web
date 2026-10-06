# CLAUDE.md

Guidance for AI assistants working in this repository. Read this before changing code.

## What this project is

A consumer wine **discovery and learning game**: *"A game that learns your palate while teaching you about wine."*
It is meant to feel like a game and a discovery experience, not a wine database, a rating app, or a shopping app.

Target loop: `DISCOVER → SWIPE → PREDICT → DRINK → RECORD → LEARN → DISCOVER AGAIN`.

**This repository is the current web prototype** (a phone-first browser app). It is not the planned native iOS/Android app.
The long-term plan and the open questions are in `docs/ARCHITECTURE_PLAN.md`. Where the prototype and the product vision
differ, see "Prototype vs. product vision" below. Do not silently "fix" one to match the other.

## Tech stack and how it runs

- **No build step, no package manager, no bundler, no tests directory.** Plain static files: `index.html` plus native ES modules (`*.js`) in the repo root.
- **Backend: Supabase** (Postgres + row-level security + auth + storage + one Edge Function `find-photos`). The client is loaded at runtime from a CDN (`esm.sh`, with `jsdelivr` fallbacks, see `app.js`).
- **Config:** `config.js` exports `SUPABASE_URL` and `SUPABASE_KEY`. Both are intentionally public (publishable/anon key, protected by RLS). **Never** put a `service_role`/secret key in this repo or in any client file.
- **Database schema/migrations are NOT in this repo.** Code references "database update N" in comments (e.g. update 21, 27), meaning SQL applied out of band in Supabase. If you need a table or column that does not exist, say so and describe the SQL; do not assume it exists. The tables/RPCs/views the client uses are visible by grepping `data.js` for `.from("` and `.rpc("`.
- **Run locally:** serve the directory with any static server (e.g. `python3 -m http.server 8000`) and open it in a phone-width browser. There is no `npm`/`make` command. The app needs network access to Supabase and the CDN.
- **Hosting/deploy** is not defined in the repo (no CI config, no workflow files). Treat it as unknown.

## Repository layout (flat, all in the root)

Convention: **pure logic files have no browser or network access**, so they can be tested alone. Controllers/DOM/network are separated.

| Layer | Files |
|---|---|
| Shell | `index.html` (CSS inline, CSP meta, boot-failure handler, loads `app.js`), `config.js`, `privacy.html` |
| Orchestration | `app.js` (state, tab routing, event wiring; ~1000 lines) |
| Pure rules | `logic.js` (verdicts, structure dims, swipe/drag math, sheet/form rules), `deck.js` (Discover deck ordering), `rules.js` + `structure.js` (suggested wine structure from grape/place/style), `catalog.js` (how player-added wines become catalog candidates), `flavors.js`, `pricing.js`, `sorting.js`, `blends.js`, `grapes.js`, `geo.js`, `wineline.js` |
| Data access | `data.js` (**every** Supabase call lives here; each function takes the client and throws on error) |
| Rendering | `views.js` (functions return HTML strings, no network), `visuals.js` (SVG bottles/flavor icons), `maps.js` + `zoommap.js` + `geodata.js` (SVG maps), `flavordata.js`, `visualdata.js` |
| Feature controllers | `learn.js` (quiz), `profile.js` (Overview/Palate/Knowledge/Explored/Trophies), `editor.js` (editor tab), `wineinfo.js`, `review.js`, `finder.js`, `winephotos.js`, `photos.js`, `sharing.js`, `account.js`, `consent.js`, `feedback.js`, `feel.js`, `tasting.js`, `mywine.js`, `winelinks.js`, `settings.js` (the Settings sheet, opened by the gear in the header) |

Tabs: Discover, Swipes, Journal, Profile, Learn, and Editor (only for users with editor permissions).

## Critical conventions

1. **Cache-busting version query strings.** Every import carries `?v=N` (e.g. `./data.js?v=15`) and `index.html` loads `app.js?v=33`. Browsers cache ES modules aggressively. **When you change a module, bump its `?v=` everywhere it is imported** (grep for the filename), and bump `app.js?v=` in `index.html` if `app.js` changed. Mismatched versions cause stale or broken loads. Commit history ("increment app version to 30") shows this is the established practice.
2. **Layering:** put rules in a pure file, Supabase calls in `data.js`, HTML in `views.js`, wiring in `app.js` or a feature controller. Keep pure files free of `document`, `fetch`, `localStorage` and Supabase imports.
3. **Escape all interpolated text** in HTML strings with `esc()` from `logic.js`. Views build HTML strings; untrusted wine/user text must never be interpolated raw.
4. **Storage access is wrapped in try/catch** (see the `get`/`set` helpers in `app.js`). Keep it that way (private browsing, blocked storage).
5. **Style of code:** small, heavily commented files; comments explain *why* in plain language and open with a header describing the file's job. Match this. The code uses double quotes, semicolons, `const`/arrow functions, and section dividers like `// ------- name`.
6. **Single-hop data rule:** the app reads curated rows/views (`v_catalog_cards`, `v_journal_entries`, `v_user_wine_state`, `v_wine_prices`, `v_wine_crowd`) rather than joining on the client.
7. **Consent/age gate:** the app requires 21+ attestation and accepted terms (`consent.js`, `CONSENT_VERSION`). Change `CONSENT_VERSION` whenever the terms wording changes. Do not bypass the gate. **Until the owner starts the pre-testing review, do not edit `consent.js` or `privacy.html` wording and do not bump `CONSENT_VERSION`**; log needed changes in `docs/PRE_TEST_REVIEW.md` instead.
8. **Accounts:** everyone starts as an anonymous guest; an email can be attached later and the user id stays the same (`account.js`). Account deletion and guest-merge go through RPCs.
9. **Permissions:** editor/owner capabilities come from `my_staff_access` (permissions such as `catalog_edit`, `quiz_verify`, `feedback_read`, `found_online_photos`). Feature tiers (e.g. the `proTasting` grid) come from `feature_access`. UI gating is convenience only; **RLS in the database is the real enforcement.**

10. **Card gestures and accessibility (Discover).** Swipe right / left / up answers (recognize / don't know / had); double-tapping near the right / left / top edge does the same; the same three answers are also visible buttons under the card. Two fingers pinch-zoom the card (up to 4x), a double-tap on the middle (or the Zoom button) zooms in and out, and **while zoomed, swiping and edge double-taps are paused** and one finger pans; the Reset zoom chip returns. All of this lives in `attachCard` in `app.js`. Do not reintroduce `user-scalable=no` in the viewport.
11. **Settings are per device**, kept in `localStorage` under `wine.settings` (text size, answer by swiping, buttons under the card, motion). Swiping off forces the buttons on. **Every font size in the stylesheet is written `calc(Npx * var(--ts))`** so the Text size setting scales it; keep doing that for new CSS. Delete my account is reachable from Settings and still from Profile, Overview (the consent text names that path; see `docs/PRE_TEST_REVIEW.md`).
## Domain model as implemented

- **Catalog:** `producers`, `wines`, `wine_vintages` (vintage or non-vintage), `wine_grapes`, `grapes`, `geo_areas` (country → region → appellation tree), `wine_images` (kinds include official, found online, verified user), `wine_reference_values` (structure baseline), `wine_source_records`, `sources`.
- **Encountered vs. consumed are separate tables:** `encounters` (swipes and interest changes) versus `consumptions` (drank it; journal). Perceptions (`perceptions`, per consumption and dimension) and tasting notes are stored separately from verdicts.
- **User-owned data:** `user_wines` (wines outside the catalog), `my_wine_info` (private per-player overrides that never change the catalog), `journal_photos` (private; optionally shared for editor review via `photo_candidates`/submissions).
- **Learning:** `quiz_questions`, `quiz_answers`, `timed_runs`, archive views, `content_flags`.
- **Structure dimensions in code:** acidity, body, tannin (1–5 sliders); sweetness, CO₂, oak (fixed choices). Defined in `logic.js` `DIMS` and mirrored by the database. Styles: red, white, sparkling, rosé, fortified.
- **Five verdict codes** (same as DB `verdict_types`): `buy`, `drink`, `none`, `respect`, `no`. Labels are in `logic.js` `VERDICTS`. `respect` ("Dislike, but understand its position") is deliberately weighted far less negatively than `no` in `deck.js`/`profile.js` (-0.5 vs -2): it must not teach the model that the person dislikes the whole category.
- **Reference structure is a baseline, not a "correct answer."** Editor scores win, then rules (`rules.js`), then defaults (`structure.js`). Players do not see structure sliders. They describe taste conversationally (`feel.js`) and the app derives perception.
- **Price:** players enter price paid on their own journal entry. `pricing.js` blends an editor "typical price" with player-entered prices only once enough different players have contributed. Price is not shown as a defining trait of a card.

## Prototype vs. product vision (known differences)

**Swipe model (current, confirmed by the owner):** the reactions are **I recognize it** (swipe right), **I don't know it** (swipe left), **I've had this bottle** (swipe up, also adds the wine to the journal), plus a separate **Not interested** button. The first three imply interest; interest is `try` unless the person marks `nope` (`logic.js` `FAMILIARITY`, `INTEREST`, `decideSwipe`; stored via the `record_swipe` RPC and `encounters`). This **replaces** the original ❤️ / 👎 / 🤷 spec, so do not reintroduce the emoji model. "I don't know it" is recorded separately and is never treated as a like or dislike. Not yet present: a pre-consumption *prediction* entity, a community-perception layer with privacy thresholds, a separate market-observation system, a bottle scanner, challenges, and native apps. Treat these as roadmap items, not bugs, and do not add them unasked.

## Product rules that constrain every change

- **Source of truth is verified structured data. AI assists, never decides.** Do not add code that has an LLM invent wine facts, infer flavor/quality/style/grape/vineyard age/production method from names, artwork, or marketing text, calculate the core preference model, or auto-publish factual content.
- Only two kinds of information may become authoritative wine data: **(1) explicit on the bottle** and **(2) inferred by a defined, stored rule** (e.g. appellation → country/region/classification/grape). Anything else is unverified and must stay out of authoritative fields. Keep provenance (source, verified date, status).
- **Keep these separate; never merge into one object:** wine identity, market price, user purchase, user preference, user perception, community perception, wine knowledge, educational content.
- **Preference ≠ perception ≠ understanding ≠ knowledge ≠ exposure.** A user can have high Bordeaux knowledge, low exposure, unknown preference.
- **Real bottle photographs only** as the official image. Never generate or substitute AI images of real wines. The design relies on photos *less*: the Discover deck does **not** prefer or require wines with photos (removed from `deck.js`), and the Discover card shows **no bottle photo at all**, only the drawn bottle silhouette from `visuals.js`. Catalog bottle photos appear only as small thumbnails in the Swipes and Journal lists (`bottleThumbHtml` in `views.js`); a player's own journal photo wins over the catalog photo there. Do not reintroduce photo-based ordering or filtering unasked. User photos stay in the user's journal unless verified through the editor flow.
- Do not invent requirements (monetization, subscriptions, ads, pricing restrictions are **not** in scope). Missing decisions go in the open-questions list in `docs/ARCHITECTURE_PLAN.md`.
- Community statistics must only appear with enough data to be meaningful and privacy-preserving (the prototype uses database-configured minimums via `app_config`).
- Images/data from third parties require researched and validated licensing. Do not assume a provider exists. The current `winelinks.js` only builds web image-search links; it does not license or store images.

## Working in this repo

- **Branching:** develop on the branch you are assigned; do not push elsewhere. Do not open a PR unless asked.
- **Commits:** short imperative subjects (see `git log`). The project has a single contributor so far.
- **Verification:** there is no test suite or linter. After edits, at minimum run `node --check <file>` on changed modules and sanity-check imports and `?v=` versions with grep. For pure modules you can import them in Node (`node --input-type=module -e "import('./logic.js').then(m=>console.log(Object.keys(m)))"`), noting that `?v=` suffixes in relative imports of other files may need to be handled. If you add tests, keep pure files pure so they stay testable, and say clearly that you added the harness.
- **Do not** commit secrets, add a build tool, introduce a framework, or reorganize the flat file layout without being asked. A migration plan (e.g. to a native client) is described in `docs/ARCHITECTURE_PLAN.md`.
- Keep user-facing copy conversational and in everyday words. **Avoid wine-specific jargon in most of the app** (e.g. the review question is "Did the wine taste as expected?", not "Was the wine balanced?"). Wine terms belong in Learn, the professional tasting grid and the Editor. When you change a question's wording, note that internal field names (e.g. `balanced`) stay as they are because they are stored data.
- When a request depends on a database change, or on an external provider, license or API that has not been confirmed, state that dependency explicitly instead of coding around it.

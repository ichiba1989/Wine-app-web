# Privacy and consent: review before testing

**Decision (owner):** revisit the privacy page and the consent text when we are ready for testing. Until then, keep notes here and do **not** change `consent.js` or `privacy.html` wording, and do **not** bump `CONSENT_VERSION`.

`CONSENT_VERSION` is currently `"2026-10-b"` (`consent.js`). Changing it makes every player accept the terms again, so bump it **once**, at the end of this review, not after each edit.

`consent.js` (what players tick) and `privacy.html` (the full page) say mostly the same thing. Keep them in step.

**Rule for anyone working in this repo until then:** if a change touches what data is collected, how it is used, or how a question is worded, add a line under "Notes" below instead of editing the consent text.

---

## Already changed, needs a decision

| # | Change | Why it matters |
|---|---|---|
| 1 | `privacy.html` line 59 now says "whether the wine tasted as expected" (was "whether it was balanced"). Made on 2026-10-06 to match the new review question. `CONSENT_VERSION` was **not** bumped. | The wording is a clarification, not new data use. Decide whether that needs a re-accept (probably not), and keep `consent.js` consistent. |

## Wording that no longer matches the app

| # | Where | Current text | App now says |
|---|---|---|---|
| 2 | `privacy.html` line 59 | "sour, fruity, sweet, thin, heavy or **drying**" | "Makes my mouth dry" |
| 3 | `consent.js` line 29, `privacy.html` line 43 | "learn your **palate**" | Profile tab and headings now say "taste" |
| 4 | `account.js` line 76 (delete-account message) | "trophies and **palate**" | "taste" |
| 5 | `privacy.html` lines 36 and 65, `consent.js` line 39 | "how it tasted", "appearance, nose, palate and conclusions" | The professional grid keeps real wine terms, so this is probably fine |
| 6 | `consent.js` line 78 (tagline) | "A game that learns your palate while teaching you about wine." | From the product spec. Decide whether the tagline keeps "palate" |

## Questions to settle during the review

1. **Age and legal rules.** The app attests "21 or older" (US rule). Confirm this is right for every place it will be tested, and for app-store rules on alcohol apps.
2. **Photos found online.** Editors can approve bottle photos found on the web as "found online" images. Confirm this is allowed for public display before testers see it. Only 10 wines have photos now, so this affects little today.
3. **Anything new that collects data.** If the pre-drinking prediction (not built yet) or market prices are added before testing, the consent text must describe them first.
4. **Community statistics.** If counts or averages from other players are shown (prices, how many recognized a wine), confirm the minimum-number rules (`app_config`: 3 players for prices, 10 journal entries for catalog candidates) are what the text promises.
5. **Delete and export.** Confirm the account-deletion text matches what the delete function really removes, including what "stays" in anonymous form.
6. **Analytics or crash tools.** None are in the code today. If any are added, they must be listed.

## Notes (add new items here)

- _2026-10-06:_ Everyday-wording pass (sections A, B, C of `COPY_REVIEW.md`) created items 2 to 4 above. Sections D, E and F of that list are not applied yet. If they are, check the consent and privacy text again for "varietal", "vintage" and "cuvée".

- _2026-10-06:_ The "Would you drink it alone or with food?" question is hidden in the rating sheet (`feel.js`, `SHOW_PAIRING = false`), and the "How did it taste?" / "How did the wine feel?" headings were removed. The consent text (`consent.js` line 24) and privacy page (line 36) still say players answer "whether you would drink it alone or with food". Decide whether to remove that phrase, or bring the question back. Old answers already saved are kept.

## Notes (continued)

- _2026-10-06:_ A Settings sheet (gear in the header) now holds text size, swiping on/off, answer buttons, motion, the account card and **Delete my account**. Settings are stored only on the phone, so no new data is collected. Delete my account is still also in Profile, Overview, because `consent.js` (line 49) and `privacy.html` (line 83) say "open Profile, then Overview". When the consent text is reviewed, update that sentence to mention Settings, then the duplicate link can stay or go.
- _2026-10-06:_ The page no longer blocks pinch-zoom (`user-scalable=no` removed). Nothing for consent, but worth a check in testing on both iPhone and Android.

- _2026-10-06:_ **Wine Bingo (Games tab) needs editor review before testers rely on it.** The tier 4 "Draft" cards (Grand Cru Burgundy, Bordeaux classified growths, Barolo and Barbaresco crus) name specific vineyards and chateaux; these lists were written without an outside source and must be checked: the Burgundy Grand Cru list, the five Médoc/Graves First Growths, the St-Émilion top rank (it is revised about every ten years; the card lists Ausone, Cheval Blanc, Angélus, Pavie), and the Piedmont vineyard names. Tiers 1 to 3 only test the catalog's own fields (style, country, region, appellation, grape) and the player's verdicts. Today's catalog fills all of tiers 1 and 2, most of tier 3, and almost none of tier 4 (no Grand Cru or classified-growth wines); wines players type in can fill them if they enter the region.
- _2026-10-06:_ Games uses no new data: the cards are worked out from the player's own journal, and the cleared list is stored only on the phone. If it is later saved to the account, add it to the consent text.

- _2026-10-06:_ **Bingo photos and recommendations.** Filled squares show the player's own journal photo, or a catalog photo only if its kind is in `LICENSED_IMAGE_KINDS` (`bingo.js`: "licensed", "own_photography", "verified_user"). Photos found online are never shown there. The exact name the database will use for licensed or producer-supplied images is not known yet; add it to that list when it exists. Confirm "verified_user" (a player-submitted photo an editor approved) is acceptable to show to other players, as the consent text describes. **Recommendations** (`recommend.js`) use only the player's own swipes, ratings and quiz answers on their own device; no new data is collected or shared. If recommendations later use other players' data, update the consent text first.

- _2026-10-06:_ **Recommendation lenses** (`recommend.js`) use the catalog, the player's own history and (quietly) price as a hidden signal for "Something different" and "Everyday pick"; prices are never named in the text. Whether wines have prices today is not known (the public database key cannot read `v_wine_prices`); with too few prices the price part simply counts as neutral. The "A stretch" lens suggests wines in areas the player has not tried, avoiding areas they are not known to like. Nothing new is collected or shared. If recommendations later use other players' data, update the consent text first.

- _2026-10-06:_ **Owner page** (opened from Settings, owner only). It writes to the live database: a wine's Reach and editor Price, and the numbers in `app_config` (Config tab; these change behavior for every player at once). Whether the owner's database role is allowed to make each of those writes is not confirmed (a refused save shows as "Could not save"). Lens weights on the page are experiments only and are not stored anywhere. Before testers arrive, decide whether Config edits should stay on this page. The catalog checks found: 187 of 197 wines have no photo (9 have only a found-online photo), 67 have no grape listed, and 9 have an unknown type.

## Launch notes (decisions to carry into the native app)

- **In-app browser sheet for "look up this wine" (liked by the owner, 2026-10-06).** In the native app, tapping the wine's name should open Google image search in an in-app browser sheet that slides up over the card, with a Done button to return (see `docs/mockups/browser-sheet-placeholder.png`). The sheet shows Google's own page; the app does not copy, frame or scrape it, and stores no images. The web prototype cannot do this (Google blocks being shown inside other pages), so it keeps opening a new tab.
- **To confirm before launch:** a lawyer's view of the link-out and of any wording near it (no suggestion that Google or any producer endorses the app); that the results page shows ads and shopping prices, which clashes with "not a shopping app"; and how each platform's in-app browser behaves (iOS and Android differ).
- **Longer term:** the cleaner fix is a licensed or permitted bottle image source, so the picture lives in the app. See the image-source questions in `docs/ARCHITECTURE_PLAN.md` section 6.

## When testing starts (checklist)

- [ ] Read `consent.js` and `privacy.html` side by side and align every sentence
- [ ] Work through items 1 to 6 and the questions above
- [ ] Decide the final wording, apply it in both files
- [ ] Bump `CONSENT_VERSION` once, and bump the `?v=` for `consent.js` and `app.js`
- [ ] Test the first-run screen, a returning player (sees the new terms once), and account deletion

## How the card works (demo)
- New walkthrough (`demo.js`) opens once for a brand-new player and from Settings. It uses a made-up sample card and collects/saves nothing; it stores only the flag `wine.demoSeen` on the phone. No consent or privacy wording changed.
- Review: read the step text in `STEPS` for tone and accuracy before testers use it.

## This or That (game)
- _2026-10-07:_ **An editor should review the pairs in `thisorthat.js` before testers use them.** Each pick is tied to a taste direction (for example ribeye leans fuller, filet mignon lighter; "historic old town" leans Old World, "sleek modern city" New World). These are commonly held associations written without an outside source, shown as "just for fun", never as wine facts. The Old World / New World country list (`WORLD`) is the usual convention; check it (for example the United States, Georgia, Brazil and Canada placements). Matched wines come only from the catalog's starting profiles (editor scores, then rules) or the wine's country, so a wine with neither never appears.
- _2026-10-07:_ **Data now collected: a player's This or That answers are saved to the database** (`this_or_that_answers`, linked to the anonymous or email account id, no name, email or wine; see `docs/this_or_that.sql`). **The consent text and `privacy.html` do not mention it yet** and must be updated (and `CONSENT_VERSION` bumped) in the pre-testing review, before testers play. They should say: answers to food and everyday-choice questions are saved with the account to study how tastes relate; **when an account is deleted, its answers are kept without any link to the person** (the owner's decision, 2026-10-07). The Delete my account wording and the privacy page must not say all data is deleted. Also decide how long to keep them, and whether the owner needs an in-app view instead of the SQL editor. The in-game note already tells players their picks are saved.
- Setup: the table must be created by running `docs/this_or_that.sql` in Supabase. Until then saves fail quietly and nothing is stored.
- Open question: should the picks ever feed the taste model? Today they do not.

## Keeping journal data and photos after an account is deleted (owner decision, 2026-10-07; NOT built yet)
- The owner wants everything a player gives us (journal entries, notes, photos, swipes) kept after they delete their account, without any link to the person. **Today the opposite is promised and done:** the consent text (`consent.js`) and `privacy.html` say deleting the account erases the journal, notes and photos, and `deleteMyAccount` in `data.js` erases the photos first. So this must not be switched on until the consent text and privacy page are rewritten, `CONSENT_VERSION` is bumped so everyone accepts the new terms, and deletion is changed to match. It must also apply only to people who accept the new terms.
- Needed first: run `docs/retain_after_delete_check.sql` (read-only) and use the results to write the database change (tables whose account link becomes empty on deletion, a replacement for `delete_my_account` that removes only the sign-in, email and profile, and the photo files staying in private storage).
- Risks to decide on: photos can show faces, homes, handwriting and places; free-text notes can name people; so "anonymous" is weaker for those than for ratings. Options: keep photos private and unshared forever, or keep only ratings and notes. Photos are re-drawn through a canvas before upload (`photos.js`), which drops the camera's location data. Photo file paths contain the account id, which after deletion matches no one.
- Also decide: a retention limit, and what happens if a player asks (for example under a privacy law) to have the retained data removed.

## Update 2026-10-07: privacy review started, retention built
- The owner started the review. `consent.js` / `privacy.html` were rewritten as the owner's ideal draft and `CONSENT_VERSION` is now "2026-10-c". See `docs/PRIVACY_DRAFT_NOTES.md` for what it promises and the questions for the lawyers. Re-acceptance is not needed (only the owner has used the app).
- Keeping data after account deletion is built: run `docs/retain_after_delete.sql` in Supabase (test with a throwaway account first). Until it is run, the app's delete screen and the consent text say data is kept, but the OLD database function still erases everything, so do not let testers in before running it.

## Update 2026-10-07 (later): owner wants in-app deletes to keep the data too
- Owner decision: deleting an entry, swipe or photo in the app should not remove the information from our records either (it disappears for the player only). Today it does remove it. This is not built: it needs the text of `delete_my_journal_entry`, `delete_my_swipe` and the views, then a `deleted_at` design. See `docs/DATA_POLICY_DRAFT.md` ("What must be built") for the plan and the Vivino-style draft policy. `consent.js` and `privacy.html` must not be changed to promise this until it works.

## Update 2026-10-07 (latest): in-app deletes now hide instead of remove
- Built from the function and view texts the owner sent: `docs/soft_delete.sql` (run it in Supabase, then test with a throwaway guest) and `data.js` (reads skip hidden rows and fall back until the script is run; deleting an entry or swipe calls the new functions; photo files are never erased; replaced hand-typed wines are no longer deleted). The old `private.retained_*` anonymous copies are no longer written.
- Live wording changed to match: `consent.js` "2026-10-d", `privacy.html`, the delete notes in `views.js`, the delete screen in `account.js`.
- Both SQL scripts (`retain_after_delete.sql`, `soft_delete.sql`) must be run before anyone else uses the app. Community counts (price, "who has had it") still include hidden rows; send those view definitions if hidden rows should be left out.

## Test checklist
- The checks to run before inviting testers are in `docs/TEST_BEFORE_TESTERS.md`. Nothing in the 2026-10-07 database work has been run against the live database yet.

## Update 2026-10-07 (consent simplified)
- The consent page is now two ticks, "I am 21 or older" and "I accept the terms and conditions" (link to `privacy.html`, renamed "Terms and privacy policy" and now holding the use rules too). `CONSENT_VERSION` "2026-10-e". The in-app explanations were removed: the "What is kept?" notes on delete, the long delete-account text (now one line plus the link), the photo-sharing note under photos, and the data note in This or That. Lawyers: the sharing of catalog photos and the keep-after-delete rule are now disclosed only on `privacy.html`, so check that is enough.

## Import wines into the journal (2026-10-09)
- New feature (`importer.js`). Owner decisions (2026-10-09): exact match to a catalog wine links to it; **new wines reach the catalog only after editor approval** (imported wines are the player's own wines and use the existing candidate flow); **limit 100 rows per file for regular users, 500 for the `pro` tier, editors and the owner**; **the rating-to-answer rule is on hold and must be revisited before testing** (`USE_RATING_RULE`).
- **Reminder for before friends and family test: try real exports from other apps (Vivino, CellarTracker and similar).** Their column names are not verified (the detection uses common header words and lets the player fix the mapping).
- To do: run `docs/import_tier.sql`; decide how users get the `pro` tier (today: the owner sets `profiles.tier` by hand in Supabase; there is no screen for it, and it is not confirmed that the tier column accepts the word `pro`). The existing tasting-grid tier is named `professional`; `pro` is a separate tier unless the owner wants them merged.
- Data: imported entries are ordinary journal entries (kept or hidden like any other; see the terms page). No photos are imported. Lawyers: the terms page does not mention importing data the player did not create (a list from another app); check whether it should.

## Import limit hardened (2026-10-09)
- Checked the `profiles` rules: players can read and update only their own row, and their column grants cover only display name and consent fields, so they cannot change their own `tier`, `role` or `staff_role` (signed-out visitors hold broader grants but the row rule blocks them; `docs/import_limit.sql` has an optional line to remove them). Still to check: who may write `feature_access` and `app_config` (the Owner page edits `app_config`); ask for the policies if not already confirmed.
- `docs/import_limit.sql` adds a database check on journal entries and own wines (24-hour window; 100, or 500 for staff and `pro`), plus `my_import_allowance` for the page. It counts all new journal entries in the window, including swipe-ups, not only imports; normal use stays far below 100 a day. Owner decision still open: whether the window should be per day (as built) or per file.
- Checked 2026-10-09: `feature_access` and `app_config` can be read by everyone but written only by people with the `settings_edit` permission (policies `feature_access_write`, `app_config_write`). So only staff holding that permission can change the tier switches or the import numbers. Keep `settings_edit` to the owner. (Note for later: anyone with `settings_edit` can also change other settings on the Config tab.)

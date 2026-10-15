# Check before inviting testers

> **REMINDERS (owner, 2026-10-09)**
> 1. **Test importing from other apps** (Vivino, CellarTracker and others) with real exports **before friends and family try the app**. This matters for testing: see section 10.
> 2. **Revisit the rating rule** for imports (`USE_RATING_RULE` in `importer.js`, currently off) before testing.
> 3. Run `docs/import_tier.sql` and `docs/import_limit.sql` and put the friends-and-family accounts that should import 500 wines on the `pro` tier.

Keep this list current. Tick each item (and date it) only after trying it on a throwaway account with the live database. Nothing here has been run against the real Supabase yet.

## 1. Run the database scripts (in this order), then reload the app twice
- [x] (2026-10-07, owner ran it) `docs/this_or_that.sql` (This or That tables; the account script needs them)
- [x] (2026-10-07, owner ran it) `docs/retain_after_delete.sql` (account deletion keeps data anonymously)
- [x] (2026-10-07, owner ran it; the two views then needed `security_invoker` set again, done) `docs/soft_delete.sql` (deleting an entry, swipe or photo only hides it). Copy it from the GitHub file if chat copying adds `<` or `[` marks. Run part 1 before part 2 (the views).
- [ ] Each script runs with no error, and a second run also finishes cleanly.

- [x] (2026-10-07, checked with the public key: all returned `[]`, and the four delete functions answered "Not signed in") **Privacy check:** with no one signed in, the public key must see nothing. Run `curl -s -H "apikey: PUBLIC_KEY" -H "Authorization: Bearer PUBLIC_KEY" "SUPABASE_URL/rest/v1/v_journal_entries?select=id&limit=1"` and the same for `v_user_wine_state`, `consumptions`, `encounters`, `journal_photos`: each must return `[]` (or a permission error). Any row means the views lost `security_invoker` (see the end of `docs/soft_delete.sql`).

## 2. Deleting in the app only hides (use a throwaway guest account)
- [ ] Swipe up on a wine (I've had it), add a photo to the entry, rate it, then delete the entry: it disappears from Journal, Swipes counts and Profile.
- [ ] In the Supabase Table editor: the `consumptions` row is still there with `deleted_at` filled in; its `journal_photos` row also has `deleted_at`; the photo file is still in the `journal-photos` bucket.
- [ ] Delete a swipe: it leaves the Swipes list, goes back into the Discover deck, and the `encounters` rows remain with `deleted_at` filled in.
- [ ] Swipe the same wine again and add the same wine to the Journal again: both work (this proves the "only one of these" rules were rebuilt).
- [ ] Delete one photo from an entry: it disappears from the entry, the file and row remain.
- [ ] A photo that was shared for the catalog: deleting the entry or the photo takes the public copy down (`wine-images` bucket) while the private file stays.
- [ ] Editing a hand-typed wine: the old version is kept in `user_wines` (not deleted) and the entry shows the new one.

## 3. Deleting the account keeps the data anonymously
- [ ] Before deleting, note the account's user id. Create data first: a swipe, a journal entry with a note and photo, an own wine, a quiz answer, a This or That answer, a private wine change (`my_wine_info`), feedback.
- [ ] Delete the account from Profile, Overview (and from Settings). The app finishes and shows the "kept without your name" message.
- [ ] In the Table editor: the rows in `consumptions`, `encounters`, `journal_photos`, `user_wines`, `quiz_answers`, `app_feedback`, `my_wine_info`, `this_or_that_answers` are still there, `user_id` is empty, and `retired_key` (or `player_key`) is the same random value across tables.
- [ ] `profiles` row, the sign-in (`auth.users`), `palate_state` and `trophy_awards` for that user are gone.
- [ ] No row still holds the old user id (search each table for it, and the photo file paths that start with it are the only trace).
- [ ] Another account's data is untouched.
- [ ] If the delete fails (for example a database trigger objects to the emptied `user_id`), the app shows "Could not delete" and nothing was lost. Report the error text.
- [ ] Anything shared for the catalog was taken back before the deletion.

## 4. This or That
- [ ] After `this_or_that.sql`, play through all 17 questions: a row per answer appears in `this_or_that_answers` with the right `axis`, `dir`, `pair_kind`; answering again replaces the row (no duplicates).
- [ ] The results page shows your journal taste (left) beside your picks (right), line by line, plus the agree/differ sentence. With no rated wines the left side is empty with "Needs more rated wines"; with rated wines it matches the Profile, Taste page (weight/zing/sweetness/grip/toast) and "where from" follows the countries of the wines you liked. A hidden (deleted) entry does not count.
- [ ] The results page shows leanings, and wines for the Old World / New World answers use the wine's country (check a few US, French and Italian wines).
- [ ] Offline or before the script is run, the game still works and the browser console shows "This or That answer not saved" only.
- [ ] Rows from a guest and from an email account both save; a second player cannot read the first player's rows (RLS).

## 5. First-time experience and the card
- [ ] A brand-new guest sees "How the card works" once after accepting the terms; Skip and Start swiping both close it; it does not return; Settings, "Practice with a sample card" reopens it.
- [ ] The practice card: swipes right, left, up, the buttons, the Zoom button, pinch and double-tap zoom all give feedback and save nothing.
- [ ] The map's magnifier badge shows and pulses on the first 3 cards; tapping the map still opens it. Check on a small phone and at the Larger text size.
- [ ] Card gestures still work on a real phone (swipe, edge double-tap, pinch, pan while zoomed).

## 6. Consent and privacy (lawyers first)
- [ ] The terms window on the consent screen loads the terms (not the app itself), scrolls on a real phone (including iPhone Safari), has no back link, and leaves room for the logo. Remove the "DRAFT, being reviewed by our lawyers" line in `privacy.html` once the lawyers sign off.
- [ ] A brand-new guest sees the two ticks with the terms window between them ("I am 21 or older", "I accept the terms and conditions"), the link opens `privacy.html` ("Terms and privacy policy") in a new tab without ticking the box, and Accept and continue works only with both ticked. No privacy or data-use text appears elsewhere in the app (delete screens, photos, games).
- [ ] The lawyers have reviewed `consent.js`, `privacy.html` and `docs/DATA_POLICY_DRAFT.md` / `docs/PRIVACY_DRAFT_NOTES.md`; their answers are in the wording; `CONSENT_VERSION` was bumped for any change.
- [ ] What the text says matches what the database does (items 2 and 3 above): hidden, not removed; account deleted, data kept without a name.
- [ ] The delete screens (`account.js`) and delete notes (`views.js`) say the same thing.
- [ ] Decide: keep photos after account deletion or not; how long data is kept; how to answer privacy-law requests when the data cannot be linked back.
- [ ] Photo file paths still start with the old account id (see the notes); decide whether that is acceptable.

## 7. Games and the Owner page
- [ ] Bingo: rate wines and watch squares fill; hidden (deleted) entries do not fill squares; tier 4 "Draft" lists are checked by an editor.
- [ ] Owner page (owner only): the tables load, search and sort work, Reach, Price and Config saves are accepted by the database or shown as failed.
- [ ] Community counts (price averages, "who has had it") still include hidden rows; decide if that is right (send the view definitions to change it).

## 8. General
- [ ] Hard reload the page twice after each deploy (cached files); the GitHub Pages build shows a green tick.
- [ ] Test on a real phone in a private window and in a normal window (storage blocked vs allowed), as a guest and with email sign-in.

## 9. Speed (changed 2026-10-09)
- [ ] On a real phone with the live database: the first Discover card appears noticeably faster than before; tapping Swipes, Journal, Profile and Games changes the screen at once; data that changed (a new swipe, a deleted entry) is there on the next visit.
- [ ] After a swipe up (I've had it), the new journal entry shows on the Journal tab on the first visit (the list is refetched in the background and the tab redraws).
- [ ] The Owner page and the first-time walkthrough still open (they load on first use).
- [ ] Optional: run the journal view timing query from the chat (`explain analyze select * from v_journal_entries` as an authenticated user) and note the time here: ____ ms.
- Measured with a stand-in database and a fixed 150 ms per request: start-up to the first card 2.6 s before, 0.9 s after; a tab tap to a changed screen about 200 ms before, 40 to 80 ms after. Real numbers depend on the phone and network.

## 10. Import wines into the journal (added 2026-10-09)
- [ ] **Other apps first (reminder): export your own data from Vivino, CellarTracker and any other app friends and family use, and import it.** Check the columns are detected (or fixable), the wines arrive right, and note which apps work. Detection uses common header words and has never been tried with a real export.
- [ ] Journal tab, "Import wines from a file": choose a CSV (try the template, and a real export from a spreadsheet). The columns are detected, the summary is right, and Add puts the wines in the Journal with the right date, price and notes. Imported wines arrive **unrated** (the rating rule is on hold).
- [ ] **Revisit the rating rule** with the owner before testers: decide whether to turn on `USE_RATING_RULE` (thresholds in `RATING_RULE`).
- [ ] A wine in the catalog (same producer, wine name and vintage) is linked to the catalog entry; other wines are the player's own, and none of them appear in Discover or the catalog until an editor approves them through the candidate flow (default: 10 entries for the same wine).
- [ ] **Run `docs/import_limit.sql`**, then check: a regular test account imports 100 wines and the next import is refused with "Limit reached" (and the sheet says it once); the same account moved to `pro` (or an editor) can add up to 500 per 24 hours; the Owner Config tab shows `import_limit_regular`, `import_limit_extended`, `import_window_hours` and changing one takes effect. Also check normal use (swiping up, adding one wine, rating) is not blocked.
- [x] (2026-10-09) Who can change the limits: only people with the `settings_edit` permission can write `feature_access` and `app_config`; players cannot edit their own `tier`, `role` or `staff_role`. Re-check that an editor without `settings_edit` cannot change them.
- [ ] Limits: a regular account is told "Up to 100 wines per file" and only the first 100 rows are used; staff accounts and accounts on the `pro` tier see 500. (Run `docs/import_tier.sql`, then `update profiles set tier = 'pro' ...` for a test account.)
- [ ] Importing the same file twice adds nothing the second time (all skipped as already in the journal).
- [ ] Imported wines appear on the Profile, Taste page and in Bingo only once rated; unrated ones offer "Rate it".
- [ ] Works on a real phone: choosing a file from Files / Google Drive, and pasting rows copied from a spreadsheet app.
- [ ] A 500-row file imports in a reasonable time and a bad row does not stop the others.

## 11. Like / Dislike deck (added 2026-10-10)
- [ ] **Run `docs/reactions.sql` in Supabase first.** Until it is run, swiping in the new app shows "Could not save that swipe".
- [ ] On a real phone: swipe right (Like), swipe left (Dislike), tap I don't know it, swipe up and tap "I've had this bottle" (adds a journal entry), double-tap the left, right and top edges. Check each creates one row in `encounters` with the right `reaction` and a `context` note (tier, fam, pref, skip).
- [ ] Likes and dislikes show on the Profile, Taste page (it moves slowly: the weights are provisional) and a wine you rated in the journal is not counted twice. **I don't know it changes nothing on the Taste page.**
- [ ] After saying I don't know it to several wines of one grape, fewer wines of that grape show up, but some still do (about one every 8 cards), and none disappear.
- [ ] Swipes tab: Liked, Disliked, I don't know it, and (if you had old swipes) "Recognized (earlier answers)". "Dislike instead", "Like instead" and "Put back" work.
- [ ] Old swipes (made before this change) still keep their wines out of the deck and still count as before for the deck.
- [ ] The practice walkthrough (Settings, Practice with a sample card) teaches the new answers.
- [ ] **Owner decisions still open:** the like and dislike weights (`swipe_like_weight`, `swipe_dislike_weight`, editable on the Config tab once `reactions.sql` has run), whether "I've had this bottle" and the journal entry it creates should stay as they are, and when quizzes should start reading what the player does not know (`gapsOf` in `deck.js`).

## 12. Quiz tags and the Swipes tab view (added 2026-10-10)
- [ ] **Run `docs/quiz_tags.sql` in Supabase** (copy it from the repo file). Check `select kind, count(*) from quiz_tags group by kind;` shows grapes, regions, countries, producers and the five styles.
- [ ] Editor tab, Quiz, open a question: 5 to 10 suggested tags appear, ticking and unticking works, the pull-down allows two more then says it is full, Save keeps them (reopen to check), and the list shows "N tags". The "No tags" chip lists only untagged questions.
- [ ] An editor **without** `settings_edit` cannot add a tag from anywhere; the owner can, on the Owner page, Tags tab, and the new tag shows in an editor's pull-down.
- [ ] Learn: after saying "I don't know it" to several wines of one grape, questions tagged with that grape come up sooner (about every other unseen question), and other questions still appear.
- [ ] Swipes tab: Like and dislike (Liked, Disliked), Don't know and All; Group by each choice; open a group; search, Type and Sort work; "How well it fits you" puts wines in three bands; Dislike instead, Like instead, Put back, Review and Delete still work; rated and had-it wines open their journal entry.
- [ ] Look at tag suggestions for 20 real questions and note where they miss (the rule only matches words on the screen).

## 13. Thumbs, Skip and the Swipes row (added 2026-10-12)
- [ ] **Run `docs/skip_count.sql` in Supabase** (after `reactions.sql`; copy it from the repo file). Check `select wine_vintage_id, reaction, skip_count from v_user_wine_state where reaction = 'dont_know' limit 5;`.
- [ ] Discover: the buttons are thumbs down, Skip, thumbs up (icons, readable by a screen reader); swiping shows the thumb icons on the card; the practice walkthrough says Skip.
- [ ] Skip a wine once: it is not the next card, but it comes back later in the deck (within the second half). Skip it again: it never comes back. Restart the app between the two skips and check it still behaves (needs the script above).
- [ ] Swipes tab: one row of thumbs up, thumbs down, skip, All with counts, plus "..."; search, group, sort and type only show after tapping "..."; a dot on it shows a filter is still on; the Skip tab says "Skipped once" or "Skipped twice"; "Put back" on a twice-skipped wine brings it back to the deck.

## 14. Voice notes and incomplete wines (added 2026-10-13)
- [ ] **Run `docs/incomplete_wines.sql` in Supabase**, then add a wine with only a name: it saves, shows "Incomplete: needs producer, vintage, type of wine" in the Journal, and the Incomplete (n) chip lists it. Add the producer, a year and a type through the pencil: the badge goes.
- [ ] Journal, Take a note: on a real phone (Chrome on Android, Safari on iPhone) tap Speak, allow the microphone, talk: the words appear with a time stamp and save as a Journal entry. Check a desktop browser without speech support (Firefox) still lets you type.
- [ ] The rating sheet's "Speak your notes" adds a time-stamped line under what is already written.
- [ ] Incomplete wines never reach the editor's candidate list (even with 10 players' entries), and do not fill Bingo squares until completed.
- [ ] **Owner and lawyers:** the browser may send the audio to its maker's speech service; add a line to `privacy.html` (and bump `CONSENT_VERSION`) before testers use it.

## 15. Modes, blind tasting and export (added 2026-10-13)
- [ ] Settings, Who is this for: switch between Beginner, Enthusiast and Professional; the Journal wording changes (search box, "No verdict yet" / "Not scored", add-a-wine title, notes box) and the taste question in the rating sheet. Nothing about the player's wines or answers changes.
- [ ] Enthusiast and Professional show "Blind tasting" and "Export my notes" in the Journal; Beginner does not.
- [ ] Blind tasting on a real phone: guess, speak notes, "Save and reveal later" (the count shows on the Journal link), come back, reveal a catalog wine and a typed-in wine, check the comparison is right against the wine, then "Rate this wine": the notes hold your words and the result line.
- [ ] Export my notes: the CSV opens in a spreadsheet app with the right columns, notes with commas or line breaks stay in one cell, and an incomplete wine is marked "yes".
- [ ] Owner decision: should these tools also need the `pro` tier, or stay open to anyone who picks Enthusiast or Professional? And the exact words for each mode (`words.js`) need the owner's eye.
- [ ] Learn, in Enthusiast or Professional mode, with `quiz_tags.sql` run and a few questions tagged: a "Focus" pick lists topics with at least 3 questions; choosing one limits the round to those questions (also in Timed). It is not shown in Beginner mode or in Review.
- [ ] Microphone permission on a real phone: the first tap on Speak shows the browser's "Allow microphone?" question, then listening starts; after Allow, Speak works at once. After "Block", the app explains how to turn the microphone back on for the site, and after you do, Speak works. Try Chrome on Android, Safari on iPhone, and the installed home-screen app; in-app browsers (inside social apps) may not allow it at all, and typing still works.
- [ ] Microphone, second pass: after allowing, an iPhone may say "The microphone is allowed now. Tap Speak once more" once, then listening works. If it says speech recognition is not allowed, switch on Dictation (Settings, General, Keyboard) and Speech Recognition (Privacy & Security), then try again. The Speak button must always go back to "Speak" after an error and be tappable, and tapping while listening must stop it.
- [ ] If Speak says the browser will not turn speech into text: the notes box opens with the keyboard, and the keyboard's microphone key dictates into it (this is the way that works on every phone). Note which phones and browsers need this, to decide whether a transcription service is worth adding (owner decision: provider, cost, privacy line).

## 16. Wine words in dictation (added 2026-10-14)
- [ ] On a real phone, dictate 10 sentences of English with Italian and French wine words (e.g. "Barolo from Cannubi, a bit of Gevrey-Chambertin on the nose, lovely cuv\u00e9e") in Chrome Android and Safari iPhone, with and without the word check. Note how many words were right before and after, and which ones still fail: add those to `winewords.js`.
- [ ] Check the chips under the notes box: a fixed word can be put back by tapping it, and "Did you mean" suggestions only change the note when tapped. Ordinary English (light, fresh, cherry, reserve) is never changed.
- [ ] "Speak in": a whole note in Italian or French is heard in that language; the pick is remembered on the phone.
- [ ] Owner: read `winewords.js` and add the words you use most (producers, places, your own tasting words).

## 17. Notes fill the tasting grid; the legend (added 2026-10-14)
- [ ] **Run `docs/note_legend.sql` in Supabase** (copy from the repo file). Check: `select count(*) from note_legend;` works; a regular test account cannot insert into `note_legend` or read others' `note_legend_mine` rows; an editor or the owner can run `select * from legend_candidates();`.
- [ ] As a professional-tier player, rate a wine and dictate or type three real notes: the grid fills itself (acidity, tannin, body, finish, aromas, flavours, colour ...), the structure sliders move, the filled answers are marked, and the matched words show when you press on one. Note which answers were wrong or missing.
- [ ] Your taps win: change a marked answer, then add to the note: your answer stays and the cleared one is not put back. "Clear what was filled in" removes only the marked ones.
- [ ] "Words I could not place": teach two words; the next note with them fills the grid at once, in the same rating and in a later one. With the script run, tick "share" on one of them.
- [ ] With three test accounts sharing the same word and answer, the owner sees it on the Owner page, Legend tab, as "ready"; approve it and check a fourth account's notes now use it. Reject one and check it does not come back.
- [ ] Owner decision: add a line to `privacy.html` (and bump `CONSENT_VERSION`) about words shared for review; decide how many players make a word "ready" (`legend_share_threshold`, default 3) and whether editors (not only the owner) should review suggestions in the Editor tab.
- [ ] Add the words your players actually use to `notelegend.js`.

## 18. Working offline (added 2026-10-14)
Needs no database script. On a real phone, in **Safari (tab and home-screen app)** and **Chrome (Android)**:
- [ ] Open the app online once, swipe a few wines, then switch on airplane mode and close and reopen the app (tab and installed): it opens, Discover shows cards, the header chip says "Offline".
- [ ] Offline: swipe 30 wines (thumbs, Skip, "I've had this bottle"), take two typed notes (Journal, Take a note), add a wine and rate it, change and delete an entry. The chip counts "N changes waiting", the Journal shows "Waiting to upload" on new entries, the Swipes tab already lists the new swipes.
- [ ] Offline: Learn (random, Timed, Review, Focus), Bingo, This or That and the practice card all play. Photo buttons are dimmed and say "Photos need a connection". Speak (dictation), sign-in, Editor, Owner and Import say they need a connection (typing and the keyboard's microphone key still work).
- [ ] Turn airplane mode off: the chip says "Syncing...", then clears. Check in Supabase that every swipe, note and entry arrived **once** (no duplicates) and in order. Settings, "Waiting to upload", shows nothing left.
- [ ] Make a change the database refuses (for example go over the import limit): it appears under "Could not upload" with the reason, and Try again / Drop it work.
- [ ] Sign out (online) clears the copy and the queue; with changes waiting, sign-out asks you to connect first. Deleting an account clears them too.
- [ ] iPhone Safari **tab** (not installed): leave changes waiting offline, see the one-time "add to your home screen" tip. Unsent changes in a tab can be erased by iOS after about a week unused; the installed app is safest.
- [ ] Release check: bump `app.js?v=` and reload online: the new files are picked up (no mix of old and new). Nothing secret is in the cache (only the public key, as before).
- [ ] Swipes made offline are dated when they upload (their order is kept). Exact dates would need a database change that is not built.
- [ ] Owner decision: add a line to `privacy.html` (and bump `CONSENT_VERSION`) that the app keeps a copy of the player's data on the device so it works offline, cleared at sign-out or deletion.

## 19. Roles, plans and the Roles tab (added 2026-10-14)
- [ ] **Open items first:** (a) hide the Plan switch before the real launch (set `plan_switch_open` to 0, Owner page, Config tab); (b) decide whether Quiz reviewer is tied to the Pro plan (`QUIZ_REVIEWER_NEEDS_PRO` in `access.js`); (c) `privacy.html` may need a line about staff records and the plan (owner and lawyers).
- [x] (2026-10-14) Discovery queries run; `docs/roles_proposal.sql` was written from the results. [ ] Run `docs/roles_proposal.sql` once in Supabase (safe to repeat), then check the three read-only selects at its end.
- [ ] After the script: one account per role (Player, Quiz reviewer, Editor, Owner) against the real rules: each sees only its tabs; a Quiz reviewer has Quiz/Flags/Feedback but not Structure/Catalog/Photos; an Editor can import 500, a Quiz reviewer 100.
- [ ] Owner page, Roles tab: list shows each staff member; add a role by email (a guest or unknown email gives "No account with that email"); change Editor to Quiz reviewer and back; remove a role; Recent changes lists each. The Owner row is locked, and calling `staff_set_role(..., 'owner')` or `staff_remove` on an Owner in the SQL editor is refused.
- [ ] Settings, Plan: switching to Pro turns on the tasting grid, 500-row import and feedback at once; switching back reverses it; with `plan_switch_open` = 0 the row disappears. Offline it says it needs a connection.
- [ ] Mode check: Professional mode alone does not show the grid or raise the import limit.

## 20. Tech sheet: PARKED (2026-10-14)
Taken out of the app; nothing to test. The code is on `backup/tech-sheet-parked`; the database tables (if the scripts were run) are kept and unused. If `techsheet_enabled` exists in `app_config`, leaving it at any value has no effect now.

## 21. Guess the Glass (added 2026-10-14)
No database script. Check on a phone:
- [ ] An editor or the owner reads the age cues once (`AGE_CUES`, `GRAPE_AGE`, `AGE_POTENTIAL` in `blindgame.js`) and the classic grape-and-place list (`CLASSICS`); fix any wording before testers rely on it.
- [ ] Games, Guess the Glass: each of the five modes plays a round of 5 at Easy and Hard; the answer, Why and the score show; the best score is still there after reopening the app.
- [ ] Learn it: with quiz questions loaded, a question about the answer's grape, place or wine ageing shows under the answer; answering it adds one row to `quiz_answers`; "More about ... in Learn" opens Learn on that topic with a "Topic: ... / Show all" chip (a Beginner too).
- [ ] Try a wine like it: the wines shown share the grape (or place) and are never ones the player has rated or turned down.
- [ ] Playing writes nothing else to the database and does not change Discover or the Profile.
- [ ] Editors: tag a few quiz questions with the theme "Wine ageing" so "How old?" has Learn questions to point to.

## Designations on places (added 2026-10-15)
- [ ] Run `docs/geo_classification.sql` once in Supabase; the check at its end lists the places that have a designation.
- [ ] Editor, Edit wine info on a Barolo wine: the Designation row shows DOCG "From our place list"; picking DOC shows "Our place list says DOCG" and saving changes nothing on the place.
- [ ] A wine at a place with no designation: pick one, save, and the wine card shows it next to the place; other wines at that place show it too.
- [ ] A wine at a new appellation: pick a designation; the new place is created with it.
- [ ] German and Austrian places: in Edit wine info, a vineyard typed as a German appellation ("Wehlener Sonnenuhr") is refused with the wine-region message; "Mosel" is found; "Kamptal DAC" becomes Kamptal with DAC under Designation; "Corton Grand Cru" as a new place is refused.
- [ ] **An editor checks the designation rule list** (`KNOWN_DESIGNATIONS` in `geo.js`, prepared 2026-10-15) against the official registers (Austrian DACs, Italian DOCG/DOC/IGT, French AOC/IGP, Spanish DO/DOCa, US AVAs). Then run `docs/geo_designations_fill.sql` once (it fills only empty designations and lists what it filled). If the list changes, regenerate the script from it.
- [ ] Edit wine info on an Austrian wine at Leithaberg (or a new Napa Valley wine): DAC (or AVA) is selected by itself, "our rule list"; saving keeps it on the place.

## Place list checks (added 2026-10-15)
- [ ] Run `docs/place_fixes.sql` once in Supabase (the check at its end should list no duplicates).
- [ ] Owner page, Checks tab, Places: Mosel is suggested as a region and St.-Julien as Saint-Julien (both "Source checked"); St.-Joseph and St.-Émilion are "To check" (confirm the official name on the INAO site before applying); Sta. Rita Hills and "American" are not listed. Apply one and the place changes for every wine there; it appears in `place_changes`.


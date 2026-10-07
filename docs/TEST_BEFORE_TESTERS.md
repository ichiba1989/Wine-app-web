# Check before inviting testers

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
- [ ] The results page shows leanings, and wines for the Old World / New World answers use the wine's country (check a few US, French and Italian wines).
- [ ] Offline or before the script is run, the game still works and the browser console shows "This or That answer not saved" only.
- [ ] Rows from a guest and from an email account both save; a second player cannot read the first player's rows (RLS).

## 5. First-time experience and the card
- [ ] A brand-new guest sees "How the card works" once after accepting the terms; Skip and Start swiping both close it; it does not return; Settings, "Practice with a sample card" reopens it.
- [ ] The practice card: swipes right, left, up, the buttons, the Zoom button, pinch and double-tap zoom all give feedback and save nothing.
- [ ] The map's magnifier badge shows and pulses on the first 3 cards; tapping the map still opens it. Check on a small phone and at the Larger text size.
- [ ] Card gestures still work on a real phone (swipe, edge double-tap, pinch, pan while zoomed).

## 6. Consent and privacy (lawyers first)
- [ ] A brand-new guest sees only the two ticks ("I am 21 or older", "I accept the terms and conditions"), the link opens `privacy.html` ("Terms and privacy policy") in a new tab without ticking the box, and Accept and continue works only with both ticked. No privacy or data-use text appears elsewhere in the app (delete screens, photos, games).
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

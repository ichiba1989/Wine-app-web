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

## When testing starts (checklist)

- [ ] Read `consent.js` and `privacy.html` side by side and align every sentence
- [ ] Work through items 1 to 6 and the questions above
- [ ] Decide the final wording, apply it in both files
- [ ] Bump `CONSENT_VERSION` once, and bump the `?v=` for `consent.js` and `app.js`
- [ ] Test the first-run screen, a returning player (sees the new terms once), and account deletion

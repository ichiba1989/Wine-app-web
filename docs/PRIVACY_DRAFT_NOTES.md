# Privacy and consent: the owner's ideal draft, for the lawyers (2026-10-07)

Status: **draft**. `privacy.html` (the single terms and privacy page) was rewritten; on 2026-10-07 the consent page was cut down to two ticks with a link to it (`CONSENT_VERSION` "2026-10-e"), and the privacy and data-use explanations were removed from the rest of the app. Earlier text was rewritten to say what the owner wants the product to do. Nobody but the owner has used the app, so no one needs to re-accept anything. These notes list what the draft promises and what the lawyers should decide. The wording is not legal advice.

## What the draft says the product does
1. **Research use.** Everything players add (swipes, journal, notes, photos, own wines, quiz and game answers, feedback) is used to study how what people eat, drink and do relates to the wines they enjoy, and to improve suggestions. Findings are published or shared only as combined results.
2. **Games.** This or That picks (food and everyday things, no wine named) are saved with the account (`this_or_that_answers`, `docs/this_or_that.sql`).
3. **After "Delete my account", the data stays, without a name.** Erased: sign-in, email, profile, consent record, palate summary, trophies, and photos shared for the catalog (taken back first). Kept: everything else, including photo files, filed under a random code (`retired_key`), with the account link cut (`docs/retain_after_delete.sql`).
4. **Deleting one entry or swipe still removes it** (with its notes and photos). Players are told to do that before deleting the account if they want something gone.
5. Players are told that after account deletion the kept data cannot be found, shown or removed later.
6. Unchanged: 21+ in the US, catalog photo sharing through editors, price averaging (3+ players), no selling, no ads, no analytics trackers, the services used (Supabase, GitHub Pages, Brevo, esm.sh, jsDelivr).

## Questions for the lawyers
- **Is "kept without your name, filed under a random code" really anonymous?** Today it is pseudonymous: rows stay together under one random key, and journals, free-text notes and photos can identify someone by content (a face, a home, a name in a note). Does that count as personal data under the laws that apply (US state privacy laws such as California's, and any user outside the US)?
- **Deletion and erasure rights.** Some laws let a person demand erasure of data about them. Can we refuse once the link is cut, and is a clear warning enough? Should the delete screen offer a choice: "delete everything" or "delete my account but keep my data anonymously"? (The owner's current plan is keep-only, with no choice.)
- **Consent for research.** Is acceptance of these terms enough consent for the research use, or is a separate tick box needed? Is "combined results only" the right promise, or should it also cover sharing data sets with partners or researchers?
- **Photos.** Keep them at all after deletion? They can show faces and homes. Consider keeping photos only if shared and approved, or stripping them at deletion. Photo files live in the private bucket `journal-photos`; their paths start with the old account id.
- **Retention.** The draft says nothing about how long data is kept. Pick a period or "indefinitely".
- **Minors.** The 21+ attestation is a tick box. Is that enough, and what do we do if kept data belongs to someone later found to be under 21?
- **Data processors and storage.** Supabase region, and a data processing agreement with Supabase, GitHub, Brevo, esm.sh and jsDelivr.
- **Wording that must stay true:** the consent text and the delete screen (`account.js`) must match what `delete_my_account` does. If the SQL changes, change the text.
- **Contact and requests.** `issei.wine@gmail.com` is the only channel today. Who answers requests, and how fast?

# Data policy draft, modelled on Vivino (2026-10-07)

Status: **draft for the lawyers, not legal advice. It is NOT the live text.** `consent.js` and `privacy.html` still say what the code does today (deleting an entry removes it). This draft describes the owner's wanted behaviour: **nothing a player gives us is ever removed from our records; deleting in the app hides it from the player and, for an account, cuts the link to the person.** Do not publish it until the app and database really work that way (see "What must be built" at the end).

## What the comparable apps say (from search summaries; their pages could not be opened from this environment, so have the lawyers read the originals)
- **Vivino** (privacy policy and terms of service, 2026): on deleting a profile, identification and contact information is kept for **6 months**, then removed. **Ratings are not deleted**, because they are "part of the overall evaluation of the wines". A person can ask for a review to be kept **without their username**, but the review text stays; Vivino keeps reviews it finds accurate unless there are "compelling individual reasons". Where content was used to train or improve analytics or machine-learning systems, those systems may keep working on what they learned, provided it cannot identify anyone. Users keep ownership of their content but give Vivino a **non-exclusive, worldwide, royalty-free, sublicensable licence** to use it (older terms: also perpetual and irrevocable). Vivino may remove content at any time and need not store it.
- **Untappd**: check-ins are generally **not deleted** except for guideline or abuse reasons (their check-in removal policy).
- **CellarTracker**: tasting notes are always public; the account-deletion treatment of notes was not found.
- Common pattern: contributions that make the service's shared data credible (ratings, reviews) stay; the person's identity goes; individual removal is possible only for stated reasons; a licence covers the kept content.

## The draft policy (plain language)

### The short version
- Our app is for people 21 and older in the United States.
- You can use it as a guest. We only ask for an email address if you choose to save your progress.
- What you add (swipes, journal entries, notes, photos, game answers, quiz answers, feedback) belongs to you, and you give us a licence to keep and use it to run the app, improve it, and do research.
- **We keep what you add.** If you delete an entry, a swipe or a photo, it disappears from your view but stays in our records, without your name. If you delete your account, we remove your sign-in, email and profile and keep everything else, without any link to you.
- We do not sell your information, show ads, or use advertising trackers.

### What we collect
A guest ID the app creates (not your name); your email, only if you save your progress; that you confirmed you are 21 or older, and when (never your birth date); what you do in the app (swipes; journal entries with the wine, verdict, how it tasted, price, food, occasion and notes; your own wines and private changes to wine details; photos; quiz answers; game answers such as This or That; trophies and your palate summary); feedback you send; and technical details such as your IP address, which our service providers see when your device connects.

### How we use it
To run the app and sign you in; to work out your palate and suggest wines; to improve wine information, quiz questions and suggestions; to keep the app safe; and **for research**, for example how what people eat, drink and do relates to the wines they enjoy. We may use what you add to build and improve analytics and suggestion systems; those systems may keep what they learned even after your data is removed, as long as it cannot identify anyone. We may publish or share what we find only as combined results about many people, never about one person.

### Your content and our licence
You keep ownership of what you add. You give us a worldwide, royalty-free, non-exclusive, sublicensable licence to store, use, copy, adapt, analyse and display it, in a form that does not name you, to operate and improve the app and for research. This licence continues after you stop using the app or delete your account, because the data stays. Please add photos only of the bottle, not people, children or other personal information, and only things you have the right to share. We may remove content that breaks the rules, and we are not required to store content forever.

### Photos of catalog wines
(Unchanged from the current text.) Photos you add to wines in our catalog are offered to our editors, who see only the picture and the wine; approved photos may appear on that wine's card for all players, without your name. You can stop sharing a photo at any time and the shared copies are taken down.

### Deleting things, and what stays
- **Delete an entry, a swipe or a photo:** it is removed from your account and your screens, and from anything shown to other players. A copy stays in our records without your name and is used only as described above. This is the same approach other wine and drink apps take for ratings and check-ins.
- **Delete your account:** we erase your sign-in, email address, profile and consent record, and any photos you shared for the catalog are taken back. Everything else you added stays in our records under a random code that cannot be traced back to you, so it remains one anonymous person's data.
- **Why we keep it:** so that ratings, suggestions and research stay credible and complete.
- **What this means for you:** once the link is gone we cannot find, show or return your data. Notes and photos can reveal things about a person, so do not add anything you would not want kept.
- **Special requests:** if you believe something we keep is harmful, unlawful or exposes private information about someone, write to us and we will review it and remove it where required. [Lawyers: decide the legal grounds and the response time.]
- We keep identifying records (email, sign-in) only as long as needed to run your account and meet legal duties, then erase them. [Lawyers: Vivino keeps identification and contact data for 6 months after deletion; decide whether we keep any.]

### Who else handles it
Supabase (database, sign-in, private photo storage), GitHub Pages (website), Brevo (sign-in emails, only if you use email sign-in), esm.sh and jsDelivr (code the app loads; they see your IP address and browser details). They handle information only to provide their service. We may also disclose information if the law requires it, to protect people or the app, or if the business is sold, in which case this policy continues to apply to it. People who run the app can technically access the database and the private photos for maintenance, support and research.

### Security
Each person's data is protected by database rules that stop other users from reading it, and photos are in private storage. No system is perfectly secure.

### Your choices and rights
You can use the app as a guest, change what you add, and delete your account at any time. Depending on where you live (for example California and other US states) you may have rights to know what we hold about you, to correct it, and to ask us to delete it. **Because kept data is not linked to you after you delete your account or an entry, we may be unable to find it to act on a request.** Write to us before you delete if you want a copy. [Lawyers: how do we honour state-law deletion and access requests under this model?]

### Age
For people 21 and older in the United States. If we learn someone under 21 has used the app, we will delete their account and the data we can link to it.

### Changes and contact
If we change this policy we will update the date and ask you to accept it again. Questions or requests: issei.wine@gmail.com

## What must be built before this is true
1. **Account deletion keeps data anonymously**: built (`docs/retain_after_delete.sql`), not yet run in the live database.
2. **Entry, swipe and photo deletion hide instead of remove**: not built. It needs a `deleted_at` marker on journal entries, swipes and photo records, screens and views that skip marked rows, `delete_my_journal_entry` / `delete_my_swipe` and the photo deletes changed to mark instead of remove (and the app no longer erasing photo files), and a check that adding the same wine again still works. The database functions' current text must be read first (see the checks in the chat).
3. Rewrite `consent.js`, `privacy.html` and the delete screens to this wording once lawyers approve it, and bump `CONSENT_VERSION`.

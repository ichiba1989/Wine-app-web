# Wording review: everyday words instead of wine terms

Goal (from the owner): a conversational tone that avoids wine-specific terms in most of the app.
Wine terms are fine in **Learn**, the **professional tasting grid** and the **Editor**.

**Status:** the review question is now "Did the wine taste as expected?". **Sections A, B and C were approved and applied.** Sections D, E and F were left as they are for now.
Each item has the current text, a *suggestion* (not a decision), and where it lives. Mark each one **Yes / No / Edit**.

**How this list was made:** a text search of the player-facing files (`views.js`, `feel.js`, `logic.js`, `profile.js`, `app.js`, `consent.js`, `account.js`). It is not exhaustive. The Discover card, tab screens and some pop-ups were only partly read, so more may turn up when we look at the running app.

**Rule for changes:** only the words people see change. Stored names and keys (`balanced`, `acidity`, `varietal`, `vintage`) stay as they are so saved data keeps working.

---

## A. Rating sheet (done) (the "How was it?" window)

| # | Current | Suggested | Where |
|---|---|---|---|
| A1 | Step title **"Verdict"** | "Your take" | `views.js` `SHEET_PAGES` |
| A2 | Step title **"Structure"** and heading **"Wine structure"** | "How it tasted" | `views.js` `SHEET_PAGES`, `structurePageHtml` |
| A3 | Step title **"Sweetness and CO₂"** (only shown to professionals) | "Sweetness and bubbles" | `views.js` `SHEET_PAGES`, `characterPageHtml` |
| A4 | "Most wines are dry and still. Change only what you noticed." | Fine as is | `views.js` |
| A5 | The five verdict labels, such as "Dislike, but understand its position" | **Keep.** These are the product's own wording | `logic.js` `VERDICTS` |

## B. "How did it taste?" questions (done)

| # | Current | Suggested | Where |
|---|---|---|---|
| B1 | **Drying** (what stood out), levels "A bit / Quite / Very grippy" | "Makes my mouth dry" and "Very strong" | `feel.js` |
| B2 | **Sharp** in "Very sharp" (under Sour) | "Very sour" | `feel.js` |
| B3 | "Dessert-like" (under Sweet) | Fine as is | `feel.js` |
| B4 | Footnote "…only shape your **palate** profile" | "…only shape your taste profile" | `feel.js` `NOTE` |

## C. Profile tab (done)

| # | Current | Suggested | Where |
|---|---|---|---|
| C1 | Tab and headings: **"Palate"**, "Your palate", "Your palate so far" | "Taste", "Your taste", "Your taste so far" | `profile.js` |
| C2 | Trophy **"Trust Your Palate"** | "Trust Your Taste" | `profile.js` |
| C3 | "There is no clear lean in **wine structure** yet." | "We can't see a clear pattern in what you like yet." | `profile.js` `palateSummary` |
| C4 | "You tend to notice acidity more/less than the **baseline**" | "You notice how tart wines are more/less than most people expect" (needs a plain name per dimension, see E) | `profile.js` |
| C5 | Learn topics: Grapes, Regions, Producers, Winemaking | **Keep.** This is wine learning | `profile.js`, `learn.js` |

## D. Adding or changing a wine (not changed)

| # | Current | Suggested | Where |
|---|---|---|---|
| D1 | **Main varietal** | "Main grape" | `views.js` |
| D2 | **Other varietals (if blended)** | "Other grapes (if it's a blend)" | `views.js` |
| D3 | **Wine or cuvée** | "Wine name" | `views.js` |
| D4 | **Vintage**, "Vintage (optional)", "Non-vintage (NV)" | "Year", "Year (optional)", "No year (NV)" | `views.js` |
| D5 | **Producer** | "Producer" is printed on labels. Keep, or "Who made it (producer)" | `views.js` |
| D6 | **Region** placeholder "For example Piedmont, or Barolo, Piedmont" | "Where it's from, for example Piedmont, Italy" | `views.js` |
| D7 | Placeholder "The grape on the label (only if you know). GSM works" | Keep. "GSM" is a bottle term, so leave it | `views.js` |

## E. Structure words (not changed) (acidity, body, tannin, oak, sweetness)

These show on the sliders (professionals) and in the Palate bars. Professionals need the real words, so the idea is a **second set of display names for ordinary players only**, keeping the real names for the professional grid and the Editor.

| Real name | Current ends of the scale | Possible everyday name |
|---|---|---|
| Acidity | soft ↔ bright | Tartness (soft ↔ zingy) |
| Body | light ↔ full | Weight (light ↔ rich) |
| Tannin | supple ↔ grippy | Dryness in the mouth (smooth ↔ drying) |
| Sweetness | dry ↔ sweet | Sweetness (Dry, Slightly sweet, Sweet, Dessert sweet) |
| Oak | no oak ↔ new oak | Oak flavor (none, a little, noticeable) |
| CO₂ | still ↔ sparkling | Bubbles (none, a few, sparkling) |

Where: `logic.js` `DIMS`. Needs a decision before anything is changed.

## F. Journal and Swipes lists (not changed)

| # | Current | Suggested | Where |
|---|---|---|---|
| F1 | Swipes sort option **"Varietal"** | "Grape" | `logic.js` `SORTS` |
| F2 | Swipes sort option **"Vintage"** | "Year" | `logic.js` `SORTS` |
| F3 | Style names: Red, White, Sparkling, Rosé, **Fortified**, "Other or unknown" | Keep Fortified, or "Fortified (port, sherry)". Your call | `logic.js` |
| F4 | "The **vintage** looks wrong" (report a wine) | "The year looks wrong" | `logic.js` |
| F5 | Journal group option **"Verdict"** | "Your take" (matches A1) | `logic.js` `GROUPS` |
| F6 | Swipes tab headings ("Wines Tried from Discover", "Had this bottle…") | Fine as is | `views.js` |

## G. Leave alone

- **Tagline** "A game that learns your palate while teaching you about wine" (from the product spec, shown on the consent page).
- Learn tab, professional tasting grid, Editor tab, and the consent/privacy text, except where it repeats a reworded phrase (check `privacy.html` and `consent.js` if B or C change).
- Card content such as producer, vintage and appellation. These are what is printed on the bottle.

## H. Not yet reviewed

Discover card text and empty states, onboarding, error messages, the account and feedback screens, and any text the app builds in `app.js`. Best checked on the running app.

## Notes on what was applied

- A2 and A3 only change what professionals see. Ordinary players already saw "How it tasted" on step 2, and step 3 is skipped for them.
- C4 now reads "You tend to notice acidity more/less than is typical" because the plain dimension names (section E) were not approved.
- B1 also changed the follow-up question to "How much does it dry your mouth?".
- Still using the old wording, on purpose: the consent and privacy text ("learn your palate", "drying"), the account-deletion list ("trophies and palate"), the tagline, the professional tasting grid and the Editor. Changing the consent or privacy wording would need a `CONSENT_VERSION` bump, which asks every player to accept again.

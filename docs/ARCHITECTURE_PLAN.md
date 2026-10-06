# Wine Discovery App: Architecture & Product Plan

Status: draft for review. Scope: turns the product concept ("a game that learns your palate while teaching you about wine") into a technically realistic plan.

Conventions in this document:
- **[Spec]** = stated in your requirements. **[Proposal]** = my recommendation. **[Open]** = a decision you have not made; I have not assumed an answer.
- **[Dependency]** = needs an external provider, license, or API that must be researched and validated. Nothing here assumes one exists.
- **[Prototype]** = already exists in this repo (web app on Supabase). Section 0 summarizes it, because the plan should build on it rather than ignore it.

---

## 0. Starting point: what the repo already proves

The current repo is a phone-first web prototype (vanilla ES modules, Supabase backend; see `CLAUDE.md`). Reading its code shows it already has working versions of much of the MVP:

| MVP need | Prototype status |
|---|---|
| Accounts | Anonymous guest → attach email, same user id; 21+ gate; consent versioning; account deletion; guest merge |
| Wine DB | producers / wines / vintages / grapes / geo tree / sources / source records, editor tab, candidate pipeline from player-added wines |
| Real bottle images | `wine_images` table + storage bucket, editor upload, a "found online" candidate review flow (Edge Function `find-photos`), verified user submissions |
| Swipe | Gesture + buttons. Records *familiarity* (recognize / don't know / had) + separate *interest* (try / nope) |
| Encountered vs consumed | Separate `encounters` and `consumptions` tables |
| 5 verdicts | Implemented as `buy / drink / none / respect / no`, with `respect` weighted weakly negative |
| Journal | Edit/delete, photos, price paid, perceptions, tasting notes |
| Palate | Profile → Palate tab; reference structure baseline from editors/rules |
| Perception ≠ preference | `perceptions` table per consumption and dimension; editors' `wine_reference_values` are a baseline |
| Learning | Quiz modes, difficulty, timed runs, review archive, flags |
| Active deck | `deck.js` mixes Familiar / Getting warmer / New territory |

**Gaps versus the spec:** (a) *(resolved: the swipe model is recognize / had / don't know + Not interested, see §9.1)*; (b) a stored pre-consumption **prediction**; (c) market-price observations as a separate system; (d) controlled-inference rule layer as explicit data; (e) content provenance/CMS workflow with approval states; (f) active-learning (information-gain) selection, not just familiarity mixing; (g) community perception with privacy floors; (h) native clients; (i) schema migrations are **not** in the repo.

**Recommendation [Proposal]:** do not discard the prototype. Treat it as the validated product spec and a working reference implementation. Its backend schema can evolve into the production one. The first engineering task is to put the existing schema under version control (see §15 and Phase 0).

---

## 1. High-level technical architecture

```
 Clients (iOS/Android, later web)
        │  HTTPS (typed API, auth token)
        ▼
 ┌─────────────────────── API / BFF ───────────────────────┐
 │ auth · swipe/deck · journal · quiz/challenge · profile  │
 └───┬──────────────┬───────────────┬──────────────┬───────┘
     │              │               │              │
 Wine Master     User data        Content        Model/Jobs
 (verified)      (events)         (facts/quiz)   (async workers)
     │              │               │              │
     └──────── Postgres (single system of record) ───┘
        + object storage (images) + search index + cache
                         ▲
                  AI/Recognition layer (assistive only, writes
                  to *candidate* tables, never to authoritative ones)
                         ▲
              Internal CMS (editors approve everything)
```

Principles **[Proposal]**:
1. **One relational system of record** (Postgres). The domain is relational, provenance matters, and the prototype already uses it.
2. **Event-style user data.** Swipes, predictions, consumptions, verdicts and perceptions are append-only facts with timestamps. Palate/knowledge models are *derived* and rebuildable from events. This is what lets the model evolve without losing history.
3. **Three data zones with different trust:** *Authoritative* (Wine Master, approved content, inference rules), *Candidate* (AI/OCR/user-submitted, awaiting verification), *Personal* (user's own records). Data only moves Candidate → Authoritative through an editor action.
4. **AI is a side-channel** that proposes; verified structured data decides (see §11).
5. **Server-side authorization (RLS)** is the real security boundary; clients are untrusted.

The 16 systems you listed map onto 7 deployable concerns at MVP; they stay separate as *modules and schemas*, not as 16 microservices (see §13).

---

## 2. Core entities and relationships

Grouped by zone. Keys omitted; every table has `id`, `created_at`, `updated_at`. "↦" means foreign key.

### 2.1 Wine Master (authoritative identity)
- `producer`
- `wine` (the cuvée: ↦producer, name, style, classification text)
- `wine_vintage` (↦wine, year or non-vintage flag, ABV if verified)
- `wine_grape` (↦wine or ↦wine_vintage, ↦grape, `basis`: `label` | `rule` , percent optional)
- `grape`, `grape_synonym`
- `geo_area` (tree: country → region → sub-region → appellation; classification, e.g. DOCG)
- `vineyard` (↦geo_area, ↦producer optional)
- `wine_reference_profile` (↦wine or vintage, dimension, value, `status`, ↦source). Baseline, **not** a right answer.
- `wine_image` (↦wine or vintage, kind: `official_licensed` | `producer` | `own_photo` | `verified_user`, storage path, ↦license/source, verification status, is_primary)
- `bottle_label_fact` (what is literally printed on the bottle, per field, so card content can be proven "explicit")

### 2.2 Provenance (applies to Master + Content)
- `source` (type, name, URL/reference, license terms, retrieved_at)
- `assertion` / `source_record` (↦entity, field, value, ↦source, `basis`: `explicit_on_bottle` | `defined_rule` | `external_dataset` | `editor_entered`, `verification_status`: `unverified` | `verified` | `retired`, verified_by, verified_at, last_reviewed_at)
- `revision` (entity, before/after JSON, actor, timestamp). Revision history for every editable authoritative table.

### 2.3 Controlled inference (rules layer)
- `inference_rule` (`antecedent` e.g. appellation=Barolo → `consequent` e.g. grape=Nebbiolo, region=Piedmont, classification=DOCG; ↦source; status; version)
- `inference_application` (↦wine, ↦rule, rule version, applied_at). Lets you answer "why does this card say Nebbiolo?" and re-run when a rule changes.

### 2.4 Personal / event data (per user)
- `user`, `profile`, `consent`
- `encounter` (user, wine_vintage, event type: swiped | scanned | viewed | …, **reaction**: `try` | `not_for_me` | `dont_know`; context e.g. deck tier, position)
- `prediction` (user, wine_vintage, ↦encounter optional, `predicted`: like | dislike | unsure; made_at). **Never overwritten** by the later experience.
- `consumption` (user, wine_vintage or ↦`user_wine`, consumed_on, occasion, food, location, ↦purchase optional, times_consumed handled as multiple rows)
- `verdict` (↦consumption, one of 5 codes). Separate row so history/edits are traceable.
- `perception` (↦consumption, dimension, perceived value)
- `tasting_note` (↦consumption, free text, optional structured tags)
- `purchase` (user, ↦consumption optional, price, currency, retailer text, date). **User purchase price lives only here.**
- `journal_photo` (private, ↦consumption)
- `user_wine` (wine outside the catalog; may become a *candidate* later)

### 2.5 Derived models (rebuildable)
- `palate_preference` (user, dimension, estimate, uncertainty, n_observations, updated_at)
- `palate_perception` (user, dimension, offset vs reference baseline, uncertainty, n)
- `palate_understanding` (user, wine category/grape/region, signal from the `respect` verdict)
- `knowledge_state` (user, topic node [grape/region/…], mastery estimate, last_seen)
- `exposure_state` (user, topic node, counts of encounters/consumptions)

Preference, perception, understanding, knowledge and exposure are **separate tables on purpose** (§10, spec §7, §11, §14).

### 2.6 Market data (separate system)
- `retailer`, `market` (location/region)
- `market_observation` (↦wine_vintage *or* ↦`unmatched_listing`, ↦retailer, ↦market, price, currency, bottle_size, observed_at, availability, promo flag, ↦source_feed)
- `unmatched_listing` (raw listing awaiting match to a wine)
- No price column on `wine`/`wine_vintage`. Any "typical price" is a *derived view* over observations.

### 2.7 Content & game (authoritative once approved)
- `fact` (↦subject wine/grape/region/producer/vineyard, text, ↦source, status, difficulty tag)
- `quiz_question` (↦fact(s), type, prompt, choices, answer, difficulty, status: `draft` | `in_review` | `approved` | `retired`, `origin`: `editor` | `ai_draft`)
- `challenge` (structured template + ordered references to wines/questions/exercises; criteria expressed as data)
- `quiz_attempt`, `challenge_progress`
- `content_revision`, `content_flag` (user reports)

### 2.8 Community (aggregates only)
- `community_perception_aggregate` (wine, dimension, n, mean, spread, computed_at). Written by a job, suppressed below a minimum n.

### 2.9 Relationship spine (from your spec §25)
```
WINE ─▶ CONSUMPTION ─▶ VERDICT
                  └──▶ PERCEPTION ─▶ PALATE MODELS
WINE ─▶ MARKET_OBSERVATION            (no link to user data)
WINE/GRAPE/REGION ─▶ FACT ─▶ QUIZ_QUESTION ─▶ CHALLENGE
```

---

## 3. MVP scope

Include **[Spec §26 + Proposal on interpretation]**:

1. User accounts (guest-first, optional email; age/consent as the prototype does it **[Open: required age/legal rules by launch market]**)
2. Wine Master DB for a **bounded launch catalog**
3. Real bottle images where available. **Design decision (owner):** the experience should rely on photos *less*. A wine without a photo still appears in the deck, at the same priority as one with a photo, and its card shows the app's drawn bottle silhouette (`visuals.js`). Photos improve a card but are neither required nor preferred by the deck. **[Open]** whether the card should say a photo is missing, and whether any wines should still be held out (e.g. wines whose label details are unverified).
4. Swipe UI with gestures **and** visible buttons: **I recognize it / I've had this bottle / I don't know it**, each implying interest, plus a separate **Not interested** button. "I don't know it" is stored distinctly and never treated as a dislike
5. Pre-consumption prediction (3 states), stored separately
6. Consumption tracking (encountered ≠ consumed)
7. Five verdicts
8. Journal with edit, search and filter
9. Basic palate model: preference + perception + understanding as separate signals, shown visually (no raw numbers)
10. Basic knowledge game: multiple choice and This-or-That from editor-approved questions
11. Minimal internal CMS: wines, sources, images, questions, approve/retire, revision history
12. Controlled-inference rules for a **small set** of appellations, as data

Include only as thin slices: rule-based "next wine" selection (deck.js-style) plus a first uncertainty-driven pick (§9).

## 4. Deferred

| Deferred | Why |
|---|---|
| Bottle scanner (OCR/recognition) | Needs a large enough catalog and a license-cleared matching source; MVP can use search/typeahead |
| Market data engine | Price is only a hidden signal; start with user purchase price only. Needs retailer data providers **[Dependency]** |
| Community perception display | Needs user volume and privacy thresholds; start collecting, do not show |
| Challenges (assembled) | Needs enough approved structured content first |
| Natural-language search, AI-drafted content, AI-personalized explanations | Assistive; add once CMS approval flow exists |
| Matching, image-identification and blind-tasting game formats; timed formats beyond what exists | After core quiz formats |
| Social features, sharing | Not specified **[Open]** |
| Monetization of any kind | Out of scope by your instruction |

---

## 5. Recommended technology stack (iOS + Android)

**Client [Proposal]:** a single cross-platform codebase, **React Native + TypeScript** (Expo/EAS), with `react-native-reanimated` + `gesture-handler` for the swipe deck, `expo-image`, `expo-camera` (scanner later), SQLite/MMKV for light offline cache.
- *Why:* one team ships both platforms; the swipe card is well within RN's capabilities; and the team already writes JS. Business logic in this repo (`logic.js`, `deck.js`, `rules.js`, etc.) is pure and can be ported to shared TypeScript packages with minimal change.
- *Alternatives:* Flutter (equally capable; different language, no reuse of existing JS logic). Fully native Swift/Kotlin (best polish, ~2× cost). **[Open: team skills/preferences decide this.]**

**Backend [Proposal]:** keep **Supabase (Postgres + Auth + Storage + Edge Functions)** for the MVP, since the prototype already runs on it and RLS is already in use.
- Move multi-step logic (deck selection, model updates, verification workflows) into **versioned server functions / a small API service** (TypeScript) rather than client-side joins.
- Background jobs/queues for model updates, aggregates, image processing. Postgres-backed queue is sufficient at MVP scale.
- *Reassess* at scale: managed Postgres + dedicated API service is a straightforward migration because the schema is plain Postgres.

**Other:** Postgres full-text/`pg_trgm` for wine search at MVP (dedicated search engine later if needed); CDN with image resizing for bottle photos; Sentry-class crash reporting; privacy-respecting product analytics **[Open: provider]**; CI with schema-migration checks (this repo has no CI today).

**CMS [Proposal]:** a separate internal web app (the prototype's Editor tab is the seed). Same database, role-based access, every write creates a `revision`.

---

## 6. Wine-data and bottle-image acquisition pipeline

Everything below that names a source type is a **[Dependency]**: I am not asserting a specific provider exists, covers your target catalog, or permits this use.

```
SOURCE (licensed DB / producer data / own data / user submission)
  → INGEST into staging (raw, immutable, with source + license + timestamp)
  → NORMALIZE (names, accents, grapes via grape+synonym table, places via geo tree)
  → MATCH to existing wine/vintage (deterministic keys first, fuzzy second)
  → DEDUPE / CONFLICT report (same wine, different values across sources)
  → EDITOR REVIEW (CMS): accept/merge/reject per field
  → PUBLISH to Wine Master with assertion rows (source, basis, verified_at)
  → APPLY inference rules (recorded in inference_application)
```

Rules:
- Unverified fields never render on a card or feed the models.
- Every field keeps *which source asserted it*. Conflicts stay visible until resolved.
- The prototype's "catalog candidate" flow (player-added wines that reach a threshold become candidates; editor approves) is the right pattern for crowd-sourced growth. Keep it.

**Images:**
1. Preferred real photographs, ranked: licensed image provider **[Dependency: licensing terms, coverage by vintage, cost]** → producer-provided with written permission **[Dependency]** → own photography → verified user submissions (explicit opt-in, as the prototype does).
2. Store: original, plus generated card-size renditions. Record license, source, vintage-specificity, verification status.
3. Vintage-specific image if available; otherwise fall back to a *wine-level* image, marked as non-vintage-specific **[Open: is a wrong-vintage label acceptable on a card, or should the wine be held out of the deck?]**.
4. **Caution:** the prototype's `find-photos` flow finds web images as *pending candidates* and requires editor approval. Whether that is legally usable for public display is **unverified**; licensing of images found online must be reviewed before production use.
5. No AI-generated bottle images for real wines (spec §18).
6. User photos stay private journal items unless submitted and approved.

Catalog bootstrap size and the first-launch catalog strategy are **[Open]** (see §15).

---

## 7. Controlled wine inference

**Goal:** show non-printed facts only when derivable by a *defined rule* with a source.

Implementation **[Proposal]**:
- Store rules as data in `inference_rule`. Example: `appellation = "Barolo"` ⇒ `country=Italy, region=Piedmont, classification=DOCG, grape=Nebbiolo`. Each rule cites a source and has an editor-approved status and version.
- The rule engine is **deterministic** (lookup on structured fields) and runs at ingest/publish time, not at render time. It writes the derived field with `basis = defined_rule` and an `inference_application` row.
- Three display classes, enforced in the data model, not just UI: `explicit_on_bottle` and `defined_rule` may be authoritative; `unverified` is never rendered on a card and never feeds a model.
- Rules are conservative. A rule fires only on an exact structured key (appellation, classification), never on free-text name similarity, never on producer names.
- If a rule changes or is retired, re-run it and diff; changes go through review.
- A **blend or appellation allowing several grapes** must not produce a single-grape rule. Such cases stay unresolved unless the rule explicitly encodes the legal composition. Editors decide which appellations are rule-safe **[Open: initial rule set and who is authorized to approve it]**.
- Explicitly **not** inferable by rule or AI: flavor profile, quality, style, vineyard age, production method, grape from a producer name, etc. (spec §3). Reference-profile values come only from an authoritative source or editor entry, marked as such.

*Note:* the prototype's `rules.js` suggests structure values (tannin, body, …) from grape/place/style. That *is* a "defined rule" mechanism but produces **characteristics**, which your spec says require an authoritative source or defined rule. Keep each such rule explicit, versioned and attributed, and keep its output marked as `rule-suggested` rather than `verified`. **[Open: do you accept rule-suggested structure as a baseline, or require an editor/external source per wine?]**

---

## 8. Market price: separate from identity and purchase

Three distinct stores **[Spec §9, §25]**:

| Concept | Table | Owner | Rule |
|---|---|---|---|
| Wine identity | `wine`, `wine_vintage` | Editors | **No price field** |
| User purchase price | `purchase` (↦consumption) | The user | Private; never written onto the wine |
| Market observation | `market_observation` | Ingestion pipeline | Own schema, own ingestion, matched to wines via a *link* table with match status |

Details:
- Observations are append-only: retailer, market, price, currency, vintage, bottle size, observed_at, availability, promo flag. History comes free from the append-only design.
- Matching a listing to a wine is its own review-able step (`unmatched_listing` → matched/rejected), because mis-matching vintage or bottle size poisons price signals.
- Consumers: (a) the personalization system reads **derived** features (e.g. price tier of a wine in the user's market) as a hidden signal, and (b) the user's *own* paid price lets the system compare "what I paid" vs. a market band.
- The swipe card does not show price. Anything price-related in the UI is secondary and optional.
- Prototype note: `pricing.js` blends an editor "typical price" with player-entered prices. Under this plan, that becomes a derived view and not a property of the wine; and player prices must not be used to infer *market* price until many players contribute (the prototype's threshold idea is good).
- **[Dependency]** Retailer/price data providers, terms of use, location coverage, refresh frequency. **[Open]** Which markets/currencies at launch.

---

## 9. Swipe / discovery engine design

**Objective [Spec §16]:** each next card is chosen for *both* likelihood of enjoyment and *information value* about the palate model.

### 9.1 The reactions (current model, confirmed by the owner)

A swipe is **familiarity + interest**, not like/dislike:

| Action | Familiarity stored | Interest | Notes |
|---|---|---|---|
| Swipe right: **I recognize it** | `recognize` | `try` | |
| Swipe up: **I've had this bottle** | `had` | `try` | Also adds the wine to the journal (done server-side by `record_swipe`) |
| Swipe left: **I don't know it** | `unknown` | `try` | Still interested; the person just lacks knowledge |
| **Not interested** button | none | `nope` | Says what they dislike, not what they know |

Visible buttons exist alongside gestures. The first three imply interest. Interest can be changed later (a separate `interest_change` event in `encounters`).

How each reaction is read (as implemented in `deck.js` `userModel`):
- `recognize` / `had` → **knowledge/exposure** evidence for the wine's producer, grape, region, country and style (`had` counts 1.5×, `recognize` 1×).
- `unknown` → **knowledge-gap** evidence for the same keys. It is never a dislike and never neutral preference.
- `try` → small positive **preference** for those keys (0.6; style 0.4). `nope` → small negative (−0.6; style −0.4).
- Journal entries and verdicts are far stronger evidence than swipes (verdict weights: `buy` 2, `drink` 1, `none` 0, `respect` −0.5, `no` −2; an unrated journal wine counts 0.25).

### 9.2 What the prototype does today

Two scores per unswiped wine, both 0 to 1:
- **`fam`** (how likely the person is to *recognize* it): editor-set "reach" (1 to 5, default 3), blended with what other players recognized (once ≥3 players have seen it), then with the person's own evidence (producer 55%, grape 25%, place 10%, quiz accuracy 10%).
- **`pref`** (how likely they are to *like* it): affinity for style, grape, place and producer, plus closeness of the wine's reference structure (acidity, body, tannin) to wines they rated well (needs ≥2 liked wines).

`fam` puts each wine into one of three decks: **Familiar** (≥ 0.55), **Getting warmer** (≥ 0.28), **New territory** (below). Each deck keeps at least 15% of the remaining wines. The deck shown is an **interleaved mix** of the three, never long runs. A new or less-certain person gets mostly familiar wines; as knowledge grows (quiz accuracy, recognition rate, journal size) the mix moves toward warmer and new. If recent swipes show they stop recognizing things, it eases back. Inside each deck, higher `pref` comes first with some randomness, and the same producer or place does not repeat back to back. A bottle photo **does not affect ordering**. An earlier version strictly put photo wines first; that was removed (deck.js v=3) because only 10 of 197 catalog wines have a photo and the design should rely on photos less. Wines without a photo show the drawn bottle silhouette.

### 9.3 Gap versus the stated goal, and the proposed next step

Today's deck optimizes **familiarity pacing and enjoyment**. It does not yet **measure how uncertain the model is**, so it cannot deliberately pick the wine that teaches it the most. Proposed additions **[Proposal]**:

**Stage C: Scoring (extend, don't replace).**
```
score(w) = α · pref(w)                           # exploit: predicted enjoyment (exists)
         + β · InformationGain(w; user model)    # explore: reduces model uncertainty (new)
         + γ · diversity(w; recent deck)         # avoid repeats (exists, as a rule)
         + δ · learning value(w; knowledge gaps) # teachable moments, fed by `unknown` swipes (new)
         + tier mix from `fam` (exists)          # familiar / warmer / new pacing stays
         − penalties (just shown, same producer back-to-back)
```
The three-tier mix stays as the pacing layer. Information gain is added *inside* each tier.

**Uncertainty.** Give each preference estimate a confidence (e.g. evidence count, or a Beta/ordinal posterior). Pick wines whose predicted outcome is most uncertain, or that **test a recent change** (e.g. the person usually avoids high tannin but liked several high-tannin wines lately → show another one). This implements the "challenge my assumptions" requirement.

**Assumption-test slots.** Reserve one card every N cards for the most informative wine, and label it internally so its outcome can be evaluated.

**Using `unknown` swipes better.** They already raise the knowledge-gap signal. Next step: feed those keys to the Learn tab (suggest quiz topics) and prefer to show explanatory content for them, without treating them as dislikes.

**Prediction step [Open].** A pre-consumption prediction entity does not exist yet; where it is captured is an open question (§15). When it exists, prediction vs. verdict becomes a calibration signal for the engine.

**Implementation staging:**
1. Now: add confidence to the existing `pref` evidence and an assumption-test slot (rules, no new model).
2. Next: Bayesian preference model with uncertainty; sampling for explore/exploit.
3. Later: learned models only after enough data, always from structured inputs.

**Cold start [Open]:** what a brand-new user sees first is not specified. Today they get mostly high-reach, familiar wines.

**Evaluation:** log every deck decision (candidates, scores, tier, chosen) so the engine can be replayed and measured offline. Nothing is logged today.

---

## 10. Preference vs. perception (and understanding, knowledge)

Five separate models; no single "taste vector."

| Model | Question | Inputs | Output |
|---|---|---|---|
| **Preference** | "What do I like?" | Reactions, verdicts (buy/drink/none/no), repeat consumption, price behavior | Per-dimension and per-key (grape/region/style/producer) liking estimate + uncertainty |
| **Perception** | "What do I notice?" | User's perception inputs vs. reference baseline | Per-dimension *offset* from baseline (e.g. perceives oak less than reference) + uncertainty |
| **Understanding** | "Do I get what this wine is doing?" | `respect` verdicts, tasting observations | Understanding per style/category, independent of preference |
| **Knowledge** | "What do I know?" | Quiz history | Mastery per topic node |
| **Exposure** | "What have I tried/seen?" | Encounters, consumptions | Counts per topic node |

Interaction rules:
- Perception *adjusts how a reference value is interpreted for that user*. When estimating preference for a dimension, use the user's perceived value if they gave one, else baseline + their typical offset. That prevents "I perceive this wine as acidic and dislike it" from being misread.
- Preference is learned against **perceived** levels where available, so a user who under-perceives oak and likes the wine is not recorded as "likes high oak."
- `respect` ("dislike but understand") updates *preference* negatively for the specific wine and its distinctive dimensions with small weight, *understanding* positively, and **does not** penalize the whole category.
- Users never type palate scores; every value is inferred from behavior and conversational inputs (as `feel.js` does). The reference profile is explicitly a baseline.
- UI: show the profile visually (maps, bars, "you tend to…") with confidence cues; hide raw numbers.
- Community comparison (§ later): "your perception vs others" is a *similarity* statement, never "correct/incorrect."

---

## 11. AI layer and verified data

**Rule: AI proposes into *candidate* tables; verified structured data is the only source of truth for authoritative reads.**

| Capability | Allowed behavior | Guardrail |
|---|---|---|
| OCR / label recognition | Extract text and a bottle embedding from a photo | Output is a *candidate*; user confirms; never writes Wine Master |
| Wine matching | Rank candidate wines from the Wine Master | Deterministic keys first; show top-N for confirmation |
| Natural-language search | Translate a query into **structured filters** over verified fields | The LLM does not answer from its own wine knowledge |
| Educational explanations | Rephrase an *approved* fact | Prompt includes only approved facts + their source IDs; output stored with those IDs; no new claims |
| Draft quiz questions | Draft from approved structured facts | Saved as `draft`, `origin=ai_draft`; editor must approve |
| Personalized challenges | Select and order *existing approved* content by rules/model | No runtime free-text generation of facts |

Do not: let AI invent facts, infer characteristics, publish content, or compute the core preference model. Required plumbing: per-call logging (inputs, source IDs, output, model/version), an output-validation step (every factual sentence must trace to a provided fact), and a kill-switch. Evaluate AI features with a labeled test set before release.

---

## 12. Major technical risks and data-quality problems

| # | Risk | Mitigation |
|---|---|---|
| 1 | **Catalog + image licensing/coverage**: no confirmed provider; cost, terms and vintage coverage unknown | Research and sign up providers before committing the content strategy; keep catalog launch bounded; track license per image |
| 2 | **Entity resolution**: same wine appears under many names/vintages/spellings | Normalization tables, deterministic keys, human review of fuzzy matches |
| 3 | **Vintage/label drift**: wrong vintage image or details on a card | Vintage-specific images where possible; explicit fallback labeling |
| 4 | **Cold start** for users and for the model | Onboarding set, rule-based deck, uncertainty-aware model |
| 5 | **Sparse signals**: users drink few wines; swipes are weak evidence | Weight by evidence strength; express confidence; don't overfit |
| 6 | **Reference profile quality**: numeric characteristics need an authoritative source; subjective by nature | Source-attributed values; treat as baselines; avoid false precision |
| 7 | **Rule errors** in inference (appellations that allow multiple grapes, regulation changes) | Conservative rules, versions, source citations, re-run + diff |
| 8 | **Editorial bottleneck**: all facts and quiz content need validation | CMS efficiency, batch review, bounded content scope per release |
| 9 | **Gamification vs. accuracy**: a "game" nudges users toward fast answers | Keep swipes as weak evidence; avoid rewarding speed over honesty |
| 10 | **Alcohol-specific compliance**: age gating, app-store policies, regional law | **[Open]** legal review per market; the prototype already gates 21+/US |
| 11 | **Privacy**: tasting/purchase/location data; community aggregates re-identification | Minimum cohort size, aggregates only, delete/export flows, consent versioning |
| 12 | **Image/OCR recognition accuracy** on real photos | Candidate-only flow; confirm with user; measure on a test set |
| 13 | **Schema drift / no migrations in repo** | Move schema to versioned migrations immediately |
| 14 | **Prototype debt** if reused as-is: client does many joins; flat files with hand-bumped `?v=` cache-busting versions | Port logic to typed shared packages; add CI |
| 15 | **Market-data matching** (vintage, bottle size, retailer SKUs) | Separate review step; never merge into identity |

---

## 13. Complexity estimates

Relative effort for a small team (S ≈ days–2 wks, M ≈ 2–6 wks, L ≈ 6–12 wks, XL ≈ 3+ months and/or ongoing). These are estimates, not commitments; they assume the prototype as a reference.

| System | MVP complexity | Full-vision complexity | Notes |
|---|---|---|---|
| 1. User accounts | S (prototype exists) | M | Adds export, social login **[Open]** |
| 2. Wine Master DB | M | XL | Schema is easy, *data acquisition* is the real cost |
| 3. Bottle image system | M | L | Licensing is the unknown |
| 4. Swipe/discovery UI | M (native gestures) | M | Prototype logic ports |
| 5. Prediction system | S | S | New, small |
| 6. Consumption/Journal | M | M | Prototype exists; search/filter facets |
| 7. Verdict & preference engine | M | L | Evidence weighting, edit-history rebuilds |
| 8. Tasting/perception engine | M | L | Conversational input design is the hard part |
| 9. Personal palate profile | M | L | Visual design + uncertainty communication |
| 10. Discovery/recommendation engine | M (rule-based) | XL (active learning) | |
| 11. Knowledge engine | M | L | |
| 12. Game/challenge engine | M (quiz) | L | Needs approved content |
| 13. Market data engine | (deferred) | L | **[Dependency]** providers |
| 14. Community data layer | (collect only) | M–L | Privacy rules |
| 15. CMS | M | L | Approval workflow, provenance |
| 16. AI/recognition layer | (deferred) | L–XL | Scanner is the largest piece |
| Cross-cutting: native client, CI, migrations, observability | M–L | | |

---

## 14. Phased roadmap

**Phase 0: Foundations (decisions + de-risking).**
Resolve the blocking open questions (§15). Put the existing Supabase schema under version-controlled migrations. Research and test **data and image provider options** with a sample of real wines. Decide the client stack. Define the event schema (`encounter`, `prediction`, `verdict`, `perception`).
*Exit:* a sourced catalog plan with known licenses and a reproducible schema.

**Phase 1: Core loop MVP (native client).**
Accounts; launch catalog with real photos; swipe (recognize / had / don't know + Not interested, gestures and buttons); prediction; consumption + 5 verdicts; journal with edit/search/filter; basic preference/perception/understanding signals; minimal CMS with provenance + approval; small inference rule set; basic quiz.
*Exit:* a tester completes SEE→SWIPE→PREDICT→DRINK→RECORD→LEARN→NEXT and sees a visible palate profile change.

**Phase 2: Validate and deepen.**
Analytics on the loop (does prediction vs. verdict change behavior? do people return?). Uncertainty-aware preference model, exploration slots in the deck, prediction-accuracy "intuition" score, richer journal filters, more quiz formats, expanded catalog and rules, CMS productivity.

**Phase 3: Reach and knowledge.**
Assembled challenges from structured content; AI-assisted drafting into the CMS (never auto-publishing); natural-language search over structured filters; first market-observation ingestion (internal use as a hidden signal).

**Phase 4: Recognition and community.**
Bottle scanner (candidate-match-confirm); community perception aggregates with privacy floors; "perception similarity" UX.

**Phase 5: Living map.**
Context-aware preferences (occasion/food/location), expectation-vs-experience analytics, richer price/behavior insights.

Phases 3–5 ordering is a recommendation; reorder based on what Phase 2 learns.

---

## 15. Requirements needing clarification before development

**Product/UX**
1. **Swipe semantics (resolved).** Reactions are recognize / don't know / had, each implying interest, plus a separate Not interested button. This replaces the original emoji spec. Sections 3, 9 and the roadmap now use the new wording. The requirements brief in the original request still describes the emoji version.
2. **Prediction timing.** Is the prediction a distinct step when the user is about to drink (e.g. after scanning/choosing a wine to drink), or collected at swipe time or both? Can a user predict without ever swiping?
3. **Repeat consumption.** Is "number of times consumed" a counter on one entry, or one journal entry per occasion (the plan assumes per-occasion rows)? Does each get its own verdict?
4. **Verdict edits.** When a user edits a historical verdict, should the model treat it as a correction (replace) or a change of mind (history)?
5. **Cold start.** What does a new user see first? Is there onboarding?
6. **Palate visualization.** What visual language (map, radar, descriptive text)?
7. **Perception input.** How should users report perception without being asked to assign numeric scores (the prototype uses "how did it taste" conversational taps)? Is the prototype's approach acceptable?
8. **Community/social.** Any sharing, friends, leaderboards? Not specified.

**Data & content**
9. **Wine/image providers.** Which licensed wine databases and image providers are acceptable? Budget? Required countries/regions? (All **[Dependency]**.)
10. **Launch catalog size and scope.** How many wines, which regions, which vintages; does a wine without a vintage-specific photo appear?
11. **Reference-profile source.** Who/what supplies numeric characteristics (acidity, body, …)? Are rule-suggested values acceptable as baselines (with labeling)?
12. **Inference rule set.** Initial appellations/rules, approver, and the policy for appellations that permit multiple grapes.
13. **Content authorship.** Who are the editors, what is the review SLA/approval policy, and who may approve AI-drafted content?
14. **Found-online images.** Is the prototype's "find bottle photos online, then editor-approves" approach legally acceptable for production? (Needs legal review.)

**Platform & compliance**
15. **Markets, languages, currencies, units** at launch.
16. **Age gate and legal rules** per market and app-store requirements for alcohol-related apps.
17. **Native stack decision** (RN vs Flutter vs native) and team skills; offline needs.
18. **Backend direction:** keep Supabase vs. move to a custom API; data residency/privacy requirements.
19. **Privacy:** data export/deletion, retention, minimum cohort size for community stats, analytics provider.
20. **Prototype disposition:** will existing prototype users/data be migrated, or is the native app a fresh start?
21. **Migrations:** where is the authoritative current schema (and RLS policies)? It is not in this repo.

**Out of scope until you say otherwise:** monetization, subscriptions, advertising, price-gated features.

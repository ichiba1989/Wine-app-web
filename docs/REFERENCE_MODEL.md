# Wine Education Master Reference: the reference model (DRAFT, Phase 2.0B.1, 2026-10-26)

**Status: draft for the owner's approval. Nothing here is built.** Updated 2026-10-26 with the database inspection
(`docs/reference/results/FINDINGS.md`); the **[Check]** points it settled are marked *Checked*. **Migration 001 is designed and tested
locally (not run live): `docs/reference/migration_001/DESIGN.md`**; where it changes this model, that file's section 1 says so and wins. No table, function, file or screen of the app was changed for it, and
no database change has been made. It follows the Phase 2.0A audit (shared as the doc "Wine Reference Audit (Phase 2.0A)") and the owner's
provisional approval (2026-10-26): integrate into the existing Supabase database; keep every existing catalog and personal-data table as
it is; add the reference beside them; build the canonical reference before any education feature; no bulk content.

Labels used below: **[Owner]** = decided by the owner (with the date). **[Proposal]** = written by Claude for approval; not decided.
**[Pending import]** = the owner's material that has not been supplied to this repository yet; it is **not** filled in here and must not
be invented. **[Check]** = must be confirmed against the database inspection (`docs/reference/INSPECTION.md`) before migration `001`.

Contents: 1 Scope · 2 Knowledge domains · 3 Canonical identity · 4 Product → edition → release → event · 5 Vintage and non-vintage ·
6 Legacy catalog mapping · 7 Claims, evidence and risk-based verification · 8 Names, languages and versions · 9 Layered reference
templates · 10 Editorial and publication roles · 11 Rights and licensing · 12 Future education, CMS and WSET · 13 The eight Phase 1.9
revisions · 14 Where the tables live (namespace options) · 15 Open questions

## 1. Scope

- **What it is [Owner, 2026-10-26]:** a canonical, evidence-backed body of wine knowledge: identities (grapes, places, producers, wine
  products and their editions), names in several languages, facts that change over time, each fact with its own citation, an editorial
  review before anything is published, and layered entries from beginner to expert. Education (learning paths, assessments, CMS/WSET
  mappings) comes later and builds on it.
- **What it is not:** a replacement of the app's catalog. The Discover deck, journals, swipes and every personal table keep reading what
  they read today (`v_catalog_cards`, `wine_vintages.id`). The reference **links** to the catalog; it never rewrites it (section 6).
- **Rules carried over from `CLAUDE.md` (they bind the reference too):** verified structured data decides, a language model never does;
  only two kinds of information may become authoritative: (1) explicit on the bottle, (2) inferred by a defined, stored rule; keep
  provenance (source, verified date, status); keep identity, market price, purchase, preference, perception, community perception,
  knowledge and educational content separate; real bottle photographs only; anything Claude authors is marked "to check" until an
  editor reads it.

## 2. Knowledge domains

- **The fourteen approved knowledge domains: [Pending import].** They have not been supplied to this repository or this session. The
  Phase 2.0A brief named some areas in passing ("wine science, geography, grapes, producers, vineyards, laws, history, service, and related
  beverages"); that is **not** the approved list and is not used as one.
- **The detailed taxonomy of about 140 subdomains: [Pending import].** Not available in the repository or the supplied specifications.
- **How they will be stored [Proposal]:** domains and subdomains are rows (a code, a name per language, a parent, an order, a status), not
  code. An entity, a claim or an entry is tagged with one or more subdomains. Changing the taxonomy later never changes an entity's id.
- **To import them:** the owner supplies the list (a document or a spreadsheet); it is committed as given under `docs/reference/` with its
  date and source, and only then turned into seed rows.

## 3. Canonical identity principles [Proposal]

1. **One permanent id per real-world thing**, whatever it is called. A grape variety, a place, a producer, a wine product, a term: each
   is an *entity* with a kind and an id that never changes and is never reused.
2. **Names are not identities.** Every name (official, as on the label, common, historical, other language, typing shortcut) is a separate
   row pointing at the entity, with its language, its kind, the time it was valid and its source. Two entities may share a name
   (Bordeaux the region and Bordeaux the appellation, `CLAUDE.md`); one entity may have many names.
3. **A name as written is kept exactly** (accents, hyphens, legal abbreviations such as "Sta. Rita Hills", `CLAUDE.md` and `text.js`).
   Match keys only *find* candidates; an editor confirms before two names are treated as one entity.
4. **Identity is decided by evidence, never by similarity alone.** "Same as" links between entities, or between an entity and a legacy
   catalog row, carry a status (suggested, confirmed, rejected), who confirmed them, when, and why.
5. **Merging never deletes.** When two entities turn out to be one, the later one is marked *superseded by* the earlier; its id keeps
   resolving. The same rule already protects journals (`wine_vintages.superseded_by`).
6. **Kinds of identity stay apart:** a producer is not a wine product; a place is not a designation (designations attach to places, with
   dates); a grape variety is not a grape name.
7. **Facts about an entity are claims** (section 7), never loose columns, so each one can carry its own evidence, dates and status.

## 4. Product → edition → release → event [Owner's levels, 2026-10-26; definitions are a Proposal]

The four levels are the owner's. The definitions below are drafts to confirm; they say what each level *holds*, not any fact about a wine.

| Level | What it is | Identified by | Example of the shape (not a fact) |
|---|---|---|---|
| **Product** | The wine as a continuing thing a producer makes under one identity | Producer + the product's name as on the label (or "unnamed") + type + the place it is defined by, as stated | "Producer X, Cuvée Y, red, Appellation Z" |
| **Edition** | One make-up of the product: what is in the bottle | For a vintage wine: the harvest year stated on the label. For a non-vintage wine: an identifier the label or producer states (edition number, base year, lot or disgorgement), else "unidentified" (section 5) | "Cuvée Y 2019"; "Cuvée Y, Edition 172" |
| **Release** | One dated or otherwise stated way an edition reaches the market | Edition + what distinguishes it as stated (release date, late or library release, bottle format if the owner wants formats here) | "Cuvée Y 2019, library release" |
| **Event** | A dated happening attached to any level | Kind + date (or year) + the level it belongs to | harvest, bottling, disgorgement, release, classification change, ownership change |

- **Harvest components** (from the Phase 2.0A brief) are *harvest events* attached to an edition: one per harvest year that went into it,
  only when stated (label, producer's own technical sheet, or an official record).
- **Only stated information creates a level.** An edition, release or event is never inferred from price, taste, artwork or a model. A
  level with nothing stated stays absent, not guessed.
- **[Check]** whether bottle format and closure belong to *release* or to a separate packaging level (owner's call, question 4).

## 5. Vintage and non-vintage handling [Proposal]

- **Vintage wine:** one edition per stated harvest year. The year comes from the label or an official record; never from a model.
- **Non-vintage wine:** editions are identified only by what the label or producer states (edition number, base year, disgorgement date,
  lot). When nothing is stated, the wine has one **"unidentified non-vintage" edition**: honest about not knowing, and splittable later
  without changing ids that journals already point at.
- **Multi-vintage blends:** one edition with several harvest events, each only when stated.
- **Legacy flag:** today a vintage row is either a year or `is_non_vintage = true` (`wine_vintages`; 151 non-vintage rows among 1,888
  on 2026-10-26). *Checked:* the database allows **at most one non-vintage row per wine** (and one row per wine and year), so non-vintage
  editions cannot be told apart in the old catalog and live only in the reference. Each legacy non-vintage row maps to an "unidentified
  non-vintage" edition until an editor links it to a stated one.
- **A vintage year is not a quality statement.** Good or poor years are claims with their own sources (section 7), never a field.

## 6. Legacy catalog mapping rules [Proposal]

The catalog (`producers`, `wines`, `wine_vintages`, `wine_grapes`, `grapes`, `geo_areas`, the reference lists) stays exactly as it is.
The reference adds **mapping rows** that point from its entities to legacy ids.

1. **Never change a legacy id, row or name** for the reference. Journals, swipes, photos, quiz answers and restaurant visits keep
   pointing at `wine_vintages.id` (audit risk 11).
2. **Mapping rows** carry: legacy table and id, reference entity id, status (suggested / confirmed / rejected), basis (exact match,
   editor, rule), who confirmed, when, and a note. *Checked:* the old catalog's own sources are prototype samples and a retailer's list
   (1,888 source records; no place has a source), so a link to it is evidence of nothing: it is marked "old catalog, not verified" until an
   editor checks the entity against a real source.
3. **Default suggestions** (nothing applied until confirmed): each `wines` row → one product; each `wine_vintages` row → one edition
   (its year, or "unidentified non-vintage"); each `producers` row → one producer entity; each `geo_areas` row → one place entity; each
   `grapes` row → one **name** (not automatically a variety: whether two grape names are one variety is an editor's decision with a source).
4. **Duplicates** (*Checked:* six producers differing only by accents; 12 groups of wines with the same producer, name, type and place;
   the old tables have no uniqueness rule on producer names or wine identities) are
   resolved by mapping two legacy rows to one entity *after* an editor confirms, never by merging legacy rows.
5. **Build on what the database already has** (*Checked*, not in this repository's scripts): the `revisions` table and its
   `log_revision()` trigger (before/after history, about 5,400 rows) for the change log; `field_provenance` (field-level source and
   verification) and `appellation_grape_rules` (appellation → grape with a required source) are reconciled with the claims model, not
   copied; `market_observations` stays separate (market price is not identity).
6. **Code lists** (`geo.js`, `aocgrapes.js`, `rankaoc.js`, `rules.js`, `grapes.js`) stay the app's fallback. They become reference claims
   only through an import that keeps each line's own source and its "to check" status; a line without a source is not imported.
7. **Read-only reports first:** before any mapping is written, a report lists the suggested mappings and the conflicts for the owner.
8. **The app reads the catalog as before** until the owner decides that a screen should read the reference instead, one screen at a time.

## 7. Claims, evidence and risk-based verification [Proposal]

- **A claim** = subject entity + property + value (or a link to another entity) + the time it was true in the world (valid from/to, or
  "unknown") + the time we recorded it + status + risk tier. Claims are never edited in place; a correction is a new claim that supersedes
  the old one.
- **A citation** = claim + source + where in the source (page, section, paragraph, URL fragment) + a short quote when the licence allows +
  the date it was retrieved + who added it. Every published claim has at least one citation.
- **A source** = what it is (official register or regulation, producer's own document, reference book, dataset, label photograph, editor's
  own tasting is *not* a source for a fact) + title + publisher + link + licence + retrieved date + a fingerprint (hash) of the copy, if a
  copy may be kept (section 11).
- **Statuses** (as built in migration 001: the live list plus a separate publish step, `published_at`, for entities and claim
  versions; see DESIGN.md §1). *Checked:* the database already has the list `verification_status` (draft, pending_review, verified, retired), used by
  wines, places, quiz questions, images and reference values. The reference **reuses it**: draft → pending_review (in review) → verified
  (shown to players) → retired, plus a *superseded by* link. The other lists (suggested / in use / checked; pending / confirmed / rejected)
  are mapped onto it in the design document for migration `001`.
- **Risk-based verification (tiers are a proposal; the owner sets them):**

| Tier | What kind of claim | Evidence needed | Review needed |
|---|---|---|---|
| 1, high | Legal and regulatory statements (designations, permitted grapes, labelling terms), anything about health or safety, rights and licences | An official primary source (regulation, register, published specification) | Two people: author and a different reviewer |
| 2, medium | Specific facts about one product, producer, vineyard or place (dates, ownership, composition, size) | The producer's own published document or an official record; otherwise two independent reliable sources (the parked tech sheet used the same idea: `docs/tech_sheet.sql`, rules `producer_source` / `two_sources`) | One reviewer |
| 3, lower | General explanations and definitions, and descriptions marked "typical" (never a fact about one bottle) | A cited reference source | One reviewer |

- **AI never decides:** a language model may *propose* a draft claim with its citation for a person to check; it never sets a status
  above draft, never publishes, and its drafts are marked as such.

## 8. Names, languages and versions [Proposal]

- **Languages:** names and entry text are stored per language (standard language tags such as `en`, `fr`, `it`, `de`, `es`, `pt`), with
  the script where it matters. Which languages come first is the owner's choice (question 5); the app is English-only today.
- **Name kinds:** official / legal, as on the label, common, historical, translation, typing shortcut (today's `grape_aliases` shortcut),
  synonym (today's `grape_aliases` synonym, used only to find rules; a label keeps its own word).
- **Legal and official names are never translated or respelled.** A translation is a separate name of kind "translation", never a
  replacement.
- **Time:** each name and each claim has a valid-from / valid-to (or "unknown"), so a renamed place or a changed rule keeps its history.
- **Content versioning:** every entry version is kept and never edited; a pointer says which version is published per language and level.
  A translation records which version of the original it was made from, and is flagged "out of date" when the original changes.

## 9. Layered reference templates [Proposal]

- **Levels:** Beginner, Enthusiast and Professional, the three the app already uses for wording (`words.js`, `CLAUDE.md` convention 19).
  *Checked:* the quiz already has a fourth level, **scholar** (`quiz_difficulty`: beginner, enthusiast, professional, scholar), a
  precedent for an expert level. Whether entries get it too is the owner's call (question 6).
- **One template per entity kind** (grape variety, place, producer, product, term, and the domain kinds once imported), each a list of
  sections, for example: identity (built from published claims), summary, detail, history, related entities, sources. A section shows
  only published claims; a section with nothing published is left out, as the Atlas place pages already do (`CLAUDE.md` convention 27).
- **Text is written per level and per language,** and every factual sentence points at the claims it rests on, so a reviewer can see why
  it says what it says.
- **Stored as plain text with a small markup** (headings, lists, links, claim references), never raw HTML; shown through `esc()`.

## 10. Editorial and publication roles [Proposal]

Built on the existing roles and permissions (`docs/ROLES_AND_ACCESS.md`, `access.js`); the code asks about permissions, never role names.

| Permission (new) | Lets a person | Suggested holders |
|---|---|---|
| `ref_edit` | write drafts: entities, names, claims, citations, sources, entries | Editor, Owner |
| `ref_review` | move a draft to verified, or send it back with a note | Editor, Owner (a reviewer may not review their own draft) |
| `ref_publish` | publish or retire verified material | Owner (and Editors if the owner says so) |
| `ref_translate` | write translations of published entries | to decide |
| `ref_rights` | record and approve a source's licence | Owner |

- Every change is logged (who, when, before and after) through the existing `revisions` table and `log_revision()` trigger.
- Players never write to the reference; their words reach it only through existing review paths.

## 11. Rights and licensing requirements [Proposal, from the rules in `CLAUDE.md`]

- **Every source records its licence** (name, link, attribution text, what it allows: quote, copy, commercial use) and who checked it.
  A source with an unknown licence may be cited by link and short quote only, and its claims stay below "published" until the licence is
  checked if they rely on more than that.
- **Copies of documents** (PDFs, page snapshots) are kept only where the licence allows, in a private storage bucket readable by staff
  only; otherwise only the link, the location in the source and a short quote are kept.
- **Images:** real bottle photographs only, never generated; third-party images only with a validated licence (`CLAUDE.md`).
- **Open data already in use** keeps its stated terms and its "for information only" notices (INAO's AOC delimitations under the Licence
  Ouverte, Natural Earth, the UC Davis AVA project: `CLAUDE.md` convention 27, `docs/DATA_REFRESH.md`).
- **Owner and lawyers decide** whether staff names on reviews need a line in `privacy.html`; it is not edited without the owner's request.

## 12. Future education, CMS and WSET integration [Proposal; not built]

- Education is built **after** the reference and only reads published claims and entries.
- **Quiz questions** will be able to point at the claims they test (today they carry free-text answers and a topic, audit risk 14), so a
  retired claim flags its questions for review.
- **Learning paths and assessments:** ordered lists of entries and questions, per level and language.
- **CMS and WSET:** their syllabi, outcomes and wording are their own. **No syllabus text, numbering or mapping is added without written
  permission or a licence** (question 7). Until then the reference keeps only its own structure, and a mapping table stays empty.

## 13. The eight revisions incorporated in Phase 1.9

**Received as requirements (2026-10-26, Phase 2.0B.2 brief):** (1) evidence-backed grape genetic relationships; (2) historical ownership
and asset interests; (3) producers, brands and legal entities kept apart; (4) wine product, edition, release and release-event identities;
(5) unified multilingual naming; (6) claim-version dependencies; (7) assessment evidence separated by modality; (8) component-level
licensing and rights. Where each lives (or is deferred) is in `docs/reference/migration_001/DESIGN.md` §1. **The Phase 1.9 document itself
is still [Pending import]**, so the wording above is the brief's, not the document's. When they are supplied they will be committed as given, and each one will be checked against the
sections above, with any section that conflicts with a revision marked for change.

## 14. Where the tables live: namespace options [Proposal]

The reference needs its own set of tables. Two places were compared; the database inspection must confirm the **[Check]** points.

| Point | A. A dedicated `wine_reference` schema | B. `ref_`-prefixed tables in `public` |
|---|---|---|
| Supabase API exposure | Not served to the browser unless added to **Settings, API, Exposed schemas** (a dashboard change). If it is *not* exposed, the browser can only reach it through views and functions in `public`, chosen one by one | Served at once, like every table in `public` |
| Default permissions | A new schema starts with **no** grants: nothing is reachable until granted (safe by default). *Checked:* no automatic grants exist outside Supabase's own schemas | *Checked:* every new table and function in `public` is granted automatically to `anon` and `authenticated` (inspection section 15); row-level security must be on from the first moment (a `rls_auto_enable()` function exists; whether it is active was not confirmed) |
| Row-level security | Same mechanism; required on every table either way | Same |
| Database functions | Existing helpers (`has_permission`, `cfg_number`) are in `public` and can be called from either | Same |
| Browser access and the app | The app's offline wrapper only catches `sb.from()` and `sb.rpc()` (`offline.js` lines 142 to 144). Calls through `sb.schema(...)` would bypass it, so the app should reach the reference only through `public` views and functions, which matches the "single hop, curated views" rule (`CLAUDE.md` convention 6) | Works with today's client and offline wrapper unchanged |
| Migration safety | All reference objects in one place: easy to list, back up, compare and remove as a whole; no name can clash with an app table | About 50 tables and views the app uses are already in `public` (`data.js`); the prefix must be kept by discipline; removal is table by table |
| Compatibility with the app | No effect on existing tables, views or the API until something in `public` points at it | No effect on existing tables if names never clash; every new table is visible in the API at once |

**Recommendation: A, a dedicated `wine_reference` schema that is *not* added to the API's exposed schemas.** Players and staff reach it
only through a small number of `public` views (players: published rows only) and `public` functions (staff writes, each checking
permissions and logging), so the dashboard setting does not need to change, the offline wrapper keeps working, nothing is open by
default, and the whole reference can be listed or removed in one place. The cost: every new kind of read needs a deliberate `public` view
or function, which is also the gate that keeps the reference curated. *Checked* (2026-10-26): the inspection confirms the default
permissions above, and the list of schemas the API serves is kept in the dashboard, not in the database (Settings, API, Exposed schemas:
the owner checks that it lists nothing unexpected). Still to test on a local copy with migration `001`: that views with
`security_invoker` over that schema work for `anon` and `authenticated` (they need `USAGE` on the schema and `SELECT` on its tables, with
row-level security still applied).

## 15. Open questions for the owner

1. The fourteen knowledge domains and the 140-subdomain taxonomy: please supply them (section 2).
2. The Phase 1.9 document with its eight revisions (section 13).
3. Namespace: approve option A as recommended, or choose B (section 14).
4. Product → edition → release → event: confirm the definitions; does bottle format belong to release (section 4)?
5. Languages to start with (section 8).
6. Levels: the app's three, or add an "Expert" level (section 9)?
7. CMS/WSET: is there permission or a licence (section 12)?
8. Risk tiers and who may publish: approve the tiers and the two-person rule for tier 1 (sections 7 and 10).
9. Source copies: may licensed copies be kept in a private bucket (section 11)?
10. The open questions in the Phase 2.0A audit doc still stand (parked tech sheet tables, the accent duplicates, a second data file).
11. From the inspection (`docs/reference/results/FINDINGS.md`): reconcile `appellation_grape_rules` with `aocgrapes.js`; close the
    parked feature's open setting; confirm the purpose of the read-only login role.

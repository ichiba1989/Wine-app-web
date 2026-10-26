# Database inspection findings (2026-10-26)

The owner ran the two read-only scripts (`docs/reference/inspect_1_structure.sql`, `inspect_2_catalog.sql`) on the live Supabase
database on 2026-10-26 and sent back the results. **The raw result files are not kept in this repository** (owner's choice, 2026-10-26):
the publishing workflow copies the whole repository, `docs/` included, onto the public website, and the raw files are a full map of the
database. The owner keeps them. This note is the summary; security observations are described in general terms only.

Part 1 (structure) and part 2 (catalog) are kept apart below. Nothing was changed in the database by the inspection.

## Part 1: structure (metadata)

**Schemas.** `public` holds 65 tables, 8 views and 88 functions. `private` holds 5 tables and 4 functions; `internal` holds 1 view. Both
are reachable only by the database owner. The rest are Supabase's own schemas (`auth`, `storage`, `realtime`, `vault` and others).

**Permissions on new objects (decides the namespace, `docs/REFERENCE_MODEL.md` §14).**
- In `public`, every new table and function is automatically granted to the browser's roles (`anon`, `authenticated`). Only row-level
  security then protects a table. A function named `rls_auto_enable()` exists, which suggests row-level security is switched on for new
  tables automatically; whether it is active was not confirmed.
- A new schema created by the database owner gets **no** automatic grants. **This confirms the recommendation of a dedicated schema.**
- Every app table in `public` has row-level security switched on.
- The list of schemas the API serves is not stored in the database (section 14 came back empty). It is set in the dashboard:
  Settings, API, Exposed schemas.

**Objects in the database that are not in this repository's scripts.** They matter because the reference should build on them, not copy them:

| Object | What it holds | Use for the reference |
|---|---|---|
| `revisions` + `log_revision()` trigger | Before/after history of every change to wines, vintages, places, quiz questions, images, reference values and appellation grape rules (about 5,400 rows) | The change log for reference tables |
| `field_provenance` | Field-level provenance: table, row, field, basis (`basis_kind`), source, rule note, verified by/at (empty) | Precedent for claim evidence; a mapping is needed |
| `appellation_grape_rules` | Appellation → grape with `sole` / `primary` / `permitted`, minimum percent, a required source, a status | Overlaps with `aocgrapes.js`; to reconcile |
| `market_observations` | Retailer prices per vintage (empty) | Stays separate (market price is not identity) |
| `quiz_topics`, `structure_dimensions`, `palate_state`, `trophy_awards`, `verdict_types` | Reference tables of the app | No change |
| `internal.prediction_vs_verdict` | A research view over swipes and ratings | No change |

**Vocabularies already in use (enums).**
- `verification_status`: draft, pending_review, verified, retired. The reference reuses it rather than adding another set of words.
- `quiz_difficulty`: beginner, enthusiast, professional, scholar (four levels: a precedent for an expert level).
- `basis_kind`: label, rule, editor, source.
- `geo_level`: country, region, appellation. `wine_style`: red, white, sparkling, rose, fortified, unknown.
- `image_kind`: official, producer, own_photography, verified_user, found_online.
- Other status lists are text with checks: suggested / in use / checked (reference lists, food pins), pending / confirmed / rejected
  (parked tech sheet).

**Identity rules in the old catalog.**
- `wine_vintages`: one row per wine and year, and **at most one non-vintage row per wine**. A year is present if and only if the row is
  not non-vintage. Non-vintage editions therefore cannot be told apart in the old catalog; they live in the reference.
- `wines`: no uniqueness rule on producer + name + type + place. `producers`: no uniqueness rule on the name.
- `geo_areas`: unique by parent + level + name (also ignoring capitals); country names unique; only countries have no parent.
- `grapes`: unique name; colour red or white only.
- `sources`: kind is one of publication, website, producer, importer, retailer, editor, rule, other; fields name, url, license_note.
  There is no retrieved date, licence status or fingerprint.

**Security observations (general terms; the details stay with the owner).**
- Row access is protected by row-level security on every table. Table-level grants to the browser's roles are broad, which is
  Supabase's default; the API offers no way to use the broadest of them.
- Functions that run with the owner's rights and can be called by anyone check the caller's permission first in the versions kept in
  this repository. The live function bodies were not read, so it is assumed they match. One such function has no source in this
  repository; only signed-in users can call it.
- Two community views run with the owner's rights by design (totals only, with minimum counts) and are closed to signed-out visitors.
- A setting leaves a parked feature's tables open to all players (empty and unused by the app). The owner was told which one and
  decides whether to close it.
- A read-only login role exists whose purpose the owner is to confirm.

## Part 2: catalog observations

| Measure | Value |
|---|---|
| Wines | 1,517 (1,506 verified, 11 waiting for review) |
| Wine types | red 854, white 391, sparkling 240, rosé 15, fortified 8, unknown 9 |
| Wines with no name / no appellation / a vineyard text | 359 / 2 / 1 |
| Type decided by an editor / not recorded | 1,325 / 192 |
| Vintages | 1,888 (151 non-vintage; years 1988 to 2025; none archived or replaced) |
| Wines with more than one vintage | 249 |
| Same producer + name + type + place (groups) | 12 |
| Producers / with a name that differs only by accents or capitals | 811 / 6 pairs |
| Grapes | 41 (includes pairs such as Syrah / Shiraz, Pinot Gris / Pinot Grigio, Pinot Noir / Pinot Nero, Pinot Blanc / Weissburgunder, Zinfandel / Primitivo, Moscato / Moscato Bianco, and the typo "Cabernet Sauvigon"; whether a pair is one variety is for an editor to decide with a source) |
| Grape links | 719 (label 477, rule 242) |
| Places | 293 (14 countries, 42 regions, 237 appellations); all verified; **none has a source** |
| Names used at two levels | Beaujolais, Bordeaux, Champagne, Rioja, Veneto (region and appellation) |
| Sources | 6: "Vintage Wine Merchants list", "Sample catalog (prototype data)", "Supermarket and chain-store sample (prototype data)", "Appellation rules (draft, needs editor verification)", "Book", "Me" |
| Source records | 1,888: Vintage Wine Merchants list 1,691, sample catalog 100, supermarket sample 97 |
| Reference values | 236, all editor / verified |
| Images | 10 (9 found online, 1 own photograph) |
| Quiz | 250 questions (58 verified, 192 draft); 5 topics × 50; beginner 60, enthusiast 80, professional 65, scholar 45; none linked to a grape, place or wine; 2 with a source; none tagged |
| Quiz tags | 358 (producer 180, region 126, grape 35, country 12, style 5) |
| Reference lists | place designation rules 288 (in use), broad places 35 (5 checked), grape aliases 53, producer aliases 1 |
| Database scripts not run yet | `rank_appellations.sql` and `restaurant_visits.sql` (their tables are missing) |

**What it means for the reference.** The old catalog's provenance is prototype samples and a retailer's list, so it cannot serve as
evidence: every link from the reference to it is marked "old catalog, not verified" until an editor checks it against a real source.

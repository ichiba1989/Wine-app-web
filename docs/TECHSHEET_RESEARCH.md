# Tech sheet research: how Claude researches, and how the results get in

> **PARKED 2026-10-14:** the Tech sheet was taken out of the app. This page describes the parked design (code on `backup/tech-sheet-parked`); `tools/verify-research.mjs` and the app screens it mentions are not on the working branch.

Research is **pushed by Editors and the Owner**. Players never trigger it, and **no player data is sent anywhere**: only catalog wine names (producer, wine, vintage, place). There is no scheduled job and no API key in this version; you run it by hand, whenever you like. (An automatic scheduled runner can be added later; it would produce the same files and use the same import. Not built.)

## The steps
1. **Work list.** In the app: Editor tab, **Facts**, **Research**. Optionally type a name to narrow it, set how many wines (default 25), press **Download work list**. You get `techsheet-worklist-DATE.json` (schema `techsheet-worklist/1`): the wines and producers, and the fields wanted.
2. **Claude researches.** Open a Claude Code session on this repository (start on Sonnet if you want to keep cost down) and give it the work list file with this request: *"Research this Tech sheet work list following docs/TECHSHEET_RESEARCH.md and write techsheet-results.json."* The standing rules are below and are also copied by **Copy instructions for Claude** in the app.
3. **Check the quotes against the real pages.** Claude runs, or you run:
   `node tools/verify-research.mjs techsheet-results.json --worklist techsheet-worklist-DATE.json`
   This fetches each cited page itself and writes `techsheet-results.verified.json`. Claude never marks its own work as checked.
4. **Import.** In the app: Facts, Research, **Import checked results**: choose the `.verified.json` file (or paste it), press **Check the file**, read the preview (what will be filed, what was rejected and why), then **Add to the waiting list**.
5. **The rule decides.** A find becomes a confirmed fact only by the stored rule (`confirmRule` in `techsheet.js`, run in the database by `techsheet_confirm_by_rule`): a producer's own site alone, or two different Editor/Owner-approved sites that agree. Disagreement goes to an Editor (Facts, Waiting). Suggested producer sites appear in **Suggested sites**: approve one only after looking at it; approving it re-checks everything waiting.
6. Keep or delete the downloaded files as you like; they are not stored in the repository by default.

## Standing instructions for Claude (the same text the app copies)
- Return only facts that a page states in words. Never guess, estimate, convert or infer a fact (no ABV from the grape, no sugar from the style).
- For every fact give the page address (`url`), the exact words of the page that contain the value (`quote`, copied character for character, 6 to 300 characters) and the value as the page writes it (`raw_value`).
- Use a different page address for each source; never invent addresses. If a fact cannot be found, leave it out (list it under `not_found`).
- Producer-level fields (founded, owner_winemaker, estate_size, website, awards) are asked once per producer: `subject_type` "producer" with the work list's `producer_key`. Wine-level fields use `subject_type` "vintage" with the work list's `subject_key`.
- Also suggest each producer's official website once under `producer_sites`, with the page that shows it is the producer's own.
- Prefer the producer's own site and technical sheet. Write one JSON file in the format below, then run the check tool.

## File formats
**Results (`techsheet-research/1`), written by Claude:**
```json
{ "schema": "techsheet-research/1", "researched_at": "2026-10-14T10:00:00Z", "researcher": "Claude Code (model name)",
  "items": [ { "subject_type": "vintage", "subject_key": "<wine id from the work list>", "fact_key": "abv",
               "raw_value": "13,5% vol", "url": "https://producer.example/les-vignes.html", "quote": "Alcohol: 13,5% vol." } ],
  "producer_sites": [ { "producer_key": "<from the work list>", "url": "https://producer.example/", "quote": "optional words from the page" } ],
  "not_found": [ { "subject_key": "<id>", "fact_key": "ph" } ] }
```
**After `verify-research.mjs`:** the same file plus `verified_by`, and per item `quote_checked` (true only if the page was fetched and the quote is on it), `fetched_at`, `page_sha256`; items whose quote is not on the page are removed (listed under `dropped`); items that could not be checked (PDF, unreachable, too large) are kept with `quote_checked: false`.

## What "checked" means, and what it does not
- `quote_checked: true` means: the page was fetched by the tool, the quote is on it, the value is inside the quote, the value is in range, and the page names the producer (and the wine, for vintage facts).
- It does **not** mean the page is right or that two pages are independent: that is what the producer-site and approved-site lists, and the Editors, are for.
- PDFs (often the real technical sheets) cannot be checked by the tool; those finds wait for an Editor to approve them by hand.
- The tool does not read `robots.txt`. Whether quoting third-party pages is acceptable is an open legal question for the owner and lawyers (`docs/ARCHITECTURE_PLAN.md`).

## Database
`docs/tech_sheet.sql` (part 1), then `docs/tech_sheet_research.sql` (part 2). Both are additive and removed by `docs/tech_sheet_remove.sql`.

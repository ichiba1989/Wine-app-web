# The editorial work queue and review-to-publication workflow (Reference tab), 2026-11-17 / 2026-11-25

App code only: no migration. It works on any deployed state, and each part lights up as its migration is deployed (002, then 003,
then 005). Published with the app; nothing in it publishes reference content.

## What the owner can do

| Where | What |
|---|---|
| Reference → **To do** (first view button) | One list of everything waiting, each line with **Open** (the right view), and where it is safe a bulk review step. Before a migration is deployed, its part is named under "Not counted yet" instead of guessed. |
| To do → **Submit them / Approve them** | Applies the same review step to each listed row, one by one: through 003's `review_many` when deployed, else one `ref_review` call per row. Every refusal is listed. **Publishing is never offered in bulk.** |
| Catalog links → **tick boxes** on suggested links | "Confirm ticked" or "Reject ticked" (003's `decide_links`); the database rules still apply to each link. |
| Grape rules → Review and import → **tick boxes** | "Use the code list's", "Use the table's" or "Reject" for the ticked candidates (005's `decide`). **A conflict has no tick box**: it is decided one by one. Unresolved and not-importable candidates cannot be ticked. |

What the To do list counts:

| Area | Counted |
|---|---|
| Places & things | names written but not submitted; names waiting for approval; things still drafts; things waiting for approval; approved things not yet published |
| Sources | drafts, and sources waiting for approval |
| Facts | drafts; waiting for approval; approved and ready to publish; approved but blocked (with their notes) |
| Grape rules | imported facts still drafts (their sources must be approved first); candidates of the latest batch still to decide (conflicts named) |
| Catalog links | per table, the rows waiting for a decision (and how many have several candidates) |
| Subject areas | drafts, and those waiting for approval |
| Types | those recommended now (advice only) |

## Code

- `owner.js`: `workQueue` (pure: builds the list from the overview, coverage, taxonomy and batches), `ruleTickable`, the To do view,
  and the tick boxes and bulk bars.
- `app.js`: `loadOwnerTodo` (the reads in parallel; a missing migration is named), and the `wrtodo`, `wrtick`, `wrticked`,
  `wrrtick` and `wrrticked` actions.

## Tests (2026-11-17, local Supabase 17.11)

`tests/run_editorial_tests.sh`: **30 passed, 0 failed**.
- The pure rules: 11.
- The full state (003, 004 and 005), in a browser:
  - the To do list on an empty reference;
  - bulk Submit/Approve of names, then things; publishing left alone;
  - two ticked links confirmed together;
  - a conflict without a tick box;
  - a ticked agreeing candidate decided;
  - nothing published; the catalog unchanged.
- A 002-only state, in a browser: the To do view names migrations 003 and 005 as not counted yet.

With the new app: the 005 suite 85/0, the 002 suite 96/0, and all app checks pass.

Tests, 2026-11-25: `tests/run_editorial_tests.sh` **47 passed, 0 failed**. That is pure rules 13, the full-state browser test,
`editorial_ui2.mjs` (long runs, evidence, publish one by one, merge) and the 002-only browser test. With the new app: the 005 suite
85/0, the 002 suite 96/0, and all app checks pass.

## Migration 006 screens (2026-11-25; need migration 006, which is read-only)

These close steps 1–4 of the list below. Details are in `docs/reference/migration_006/README.md`.

- **Evidence review:** sources, then versions, then facts, then publishing one by one, with the reasons a fact is blocked.
- **Browse all:** every thing and fact, page by page, searched on the server.
- **Many things into one subject area:** with confirmation, progress, Stop and per-item results.
- **Compare side by side:** for catalog rows with several candidates.

Before 006 is run, each says "This part needs migration 006".

## Next practical steps (independent of the owner's pending decisions)

1. **Grape rules after import:** each imported fact with its source's status, and "Approve this source, then this fact" in one
   place. This needs a small read of evidence and sources, which would be a migration (006).
2. **Catalog links:** a side-by-side view of a row with several candidates (names in every language, kind, status) before ticking.
3. **Subject areas:** assign many things to one subject area at once (the database action exists; only the screen is missing).
4. **Scale:** the overview reads the latest 300 things. A paged, searchable read for thousands of drafts would also be a migration
   (006).

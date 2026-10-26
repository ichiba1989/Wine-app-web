# Reading the database's structure (read-only), Phase 2.0B.1

Two scripts, run by hand by the owner in the Supabase SQL Editor. **They only read; they change nothing.** Their results let the next step
(migration `001` for the Wine Education Master Reference) be written against the real database instead of guesses, because the database's
structure is not kept in this repository (`docs/REFERENCE_MODEL.md`, audit risk 1).

| File | What it reads | What it never reads |
|---|---|---|
| `docs/reference/inspect_1_structure.sql` | The database's **structure** only, from PostgreSQL's own catalog: schemas, tables, columns, keys, indexes, row-level security and its rules, function signatures and security modes, triggers, views and what they read, lists of allowed words (enums), what the browser's roles may do, extensions, which schemas the API serves, default permissions, database role names, storage bucket names | Any row of any app table; function bodies; database settings other than the API schema list; passwords (PostgreSQL never shows them) |
| `docs/reference/inspect_2_catalog.sql` | **Observations about the shared catalog:** counts and summaries of wines, vintages, producers, grapes, places, sources (kind and name only), quiz questions and tags, the reference lists, role and plan definitions, `app_config` | Journals, tastings, notes, swipes, photos, restaurant visits, game answers, profiles, emails, sign-ins, who holds which staff role, licence notes and document text |

Both were tested on 2026-10-26 on a throwaway local PostgreSQL 16 holding a mock of the known tables (never on Supabase): each ran inside
a **read-only transaction** (which refuses any write) without error, and planted test values (a session secret, a function body, a vault
secret, a private note, a person's name and an email) did not appear in the results. A scan of both files finds no insert, update, delete,
create, alter, drop, grant, revoke, truncate, copy, execute, call or set outside the comments.

## How to run them (about five minutes)

1. Open the project in Supabase, then **SQL Editor** in the left bar, then **New query**.
2. Open `docs/reference/inspect_1_structure.sql` on GitHub (the repository, branch `main`), use the **Copy raw file** button, and paste
   the whole text into the editor. Before running, you can read it: every part begins with a comment saying what it reads.
3. If the editor shows a **row limit** choice next to Run, pick **No limit** (part 1 returns a few thousand rows). Leave the role as
   `postgres`.
4. Press **Run**. One table of results appears, with the columns `section`, `schema_name`, `object_name`, `detail`.
5. Use the results' **Export / Download CSV** button and save the file as `inspect_1_structure.csv`.
6. Open a **new query** tab and repeat steps 2 to 5 with `docs/reference/inspect_2_catalog.sql` (it returns about 70 rows; columns
   `section`, `check_name`, `result`). Save it as `inspect_2_catalog.csv`.
7. Send both CSV files back in this chat. They will be read, summarised and saved in the repository under `docs/reference/results/`
   (structure and catalog observations kept apart), and nothing will be changed in the database.

**If something goes wrong**
- *An error appears:* copy its text into the chat. Nothing was changed: a read that fails changes nothing.
- *The results look cut short:* change the last lines of part 1 from `where section like '%'` to one section at a time
  (`where section = '03 columns'`), run each, and download each.
- *A section is empty:* that is a result too (for example, section 14 is empty if the API schema list is kept outside the database).

## What the results may contain, so you can check before sending
- Names of tables, columns, functions, policies, roles and buckets; the rules inside row-level security policies; the text of views.
- Catalog facts that the app already shows players (wine, producer, grape and place names; counts), the role and plan definitions,
  and `app_config` values (players' phones already read `app_config`).
- **No** personal data, no email, no journal or tasting content, no secret. If you see anything that looks like a key or a person's
  details, do not send it; tell me which section it is in and it will be excluded.

## Not done
- The scripts have not been run on the real database; only the owner runs them (no permission was given to run them from here, and this
  session has only the public key, which cannot read the database's structure).
- Section 14 reads the API schema list only if Supabase keeps it as a database setting; the dashboard's **Settings, API, Exposed schemas**
  shows the same list if section 14 is empty.

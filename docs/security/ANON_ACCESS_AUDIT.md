# Anonymous access audit (Phase 2.0B.6, 2026-11-01)

**What this is.** An audit of what a signed-out visitor (the database role `anon`) can do. It comes with a proposal to cut that down to
what the app needs; the proposal is `anon_hardening_up.sql`, with its undo `anon_hardening_rollback.sql`.

**Nothing has been run on the live database, and the app is unchanged.** All tests ran on a disposable local Supabase stack
(`ANON_HARDENING_CHANGE_REPORT.md`).

**How sure each statement is.** Every finding is marked:
- **VERIFIED**: observed in the repository's code or in a test on the local stack.
- **DOCUMENTED**: taken from the owner's read-only inspection (`docs/reference/results/FINDINGS.md`) or from the repository's SQL
  comments.
- **ASSUMED**: not checked. Above all, the live database's exact grants are not in the repository. `anon_inventory.sql` (read-only)
  lists them when the owner runs it.

## 1. Summary

1. **Guests are not `anon`.** VERIFIED in code, and by the app-code test.
   - The app signs every visitor in as a guest straight away (`data.js` `ensureUser` → Supabase anonymous sign-in).
   - A guest's requests use the `authenticated` role, exactly like a member's.
   - `anon` is used only by the reads a first visit sends before that sign-in finishes, and again after a sign-out:
     - the public catalog (`app.js` `startEarlyLoads`): `v_catalog_cards`, `wine_vintages`, `wine_reference_values`, `flavor_varietals`,
       `flavor_regions`;
     - the four reference lists: `grape_aliases`, `producer_aliases` with `producers`, `place_designation_rules`, `broad_places`.
   - The app never reads or writes `profiles`, calls an RPC, or writes anything as `anon`.
2. **`profiles`.** On a Supabase database `anon` holds every table privilege on `profiles` (Supabase's defaults; DOCUMENTED in
   `docs/import_limit.sql`). Row security stops `anon` reading or changing rows through the API (VERIFIED). But row security does not
   apply to `TRUNCATE`: in direct SQL both `anon` and `authenticated` **could empty the table** (VERIFIED locally, inside a
   rolled-back transaction).
   - There is no API route to direct SQL, so a visitor cannot do this from the app or the API. It is still a privilege nobody needs.
3. **The same defaults on every other table.** `anon` holds TRUNCATE, REFERENCES, TRIGGER and (on PostgreSQL 17) MAINTAIN on every
   table and view in `public`, plus INSERT, UPDATE and DELETE (VERIFIED on the local stack; DOCUMENTED for production in general terms).
   Row security protects the rows for the API's verbs, but not against TRUNCATE.
4. **Signed-in-only functions are executable by `anon`.** VERIFIED in the repository's SQL and on the local stack.
   - The repository's scripts run `revoke ... from public` but not `from anon`. Supabase gives `anon` its own EXECUTE on every new
     function, so the staff, plan, delete-my-data and legend functions stay callable by a signed-out visitor.
   - Each one refuses inside ("Only the owner ...", "Sign in first", "Not signed in"). VERIFIED for the repository's own
     `roles_proposal.sql`, `restaurant_visits.sql` and `note_legend.sql`, loaded unchanged. Not exploitable as written; excess privilege.
5. **What the proposal changes** (tested before, after and after rollback; 291 checks passed, 0 failed):

   | Part | Change |
   |---|---|
   | A | `profiles`: no privilege at all for `anon` or PUBLIC. `authenticated` keeps SELECT, and UPDATE of the name, consent and age columns only |
   | B | No TRUNCATE, REFERENCES, TRIGGER or MAINTAIN for `anon` anywhere in `public`, also for future tables |
   | C | No EXECUTE for `anon` on the signed-in-only functions, with a guard that leaves alone any function a policy or view relies on |

   **Public browsing is unchanged**, and so is everything a guest, a player, an editor or the Owner does (section 7 of the change report).
6. **Not proposed yet** (it needs the live inventory first): removing `anon`'s INSERT, UPDATE and DELETE on the other tables, and its
   SELECT on account-only tables (section 6).

## 2. Sources and method

| Source | What it gave | Status |
|---|---|---|
| The app's code: `data.js`, `app.js`, `consent.js`, `account.js`, `visualdata.js` and every `sb.from()` / `sb.rpc()` call | Which requests run before sign-in, which run after, and which `profiles` columns the app writes | VERIFIED (read in full where it matters) |
| The repository's SQL scripts (`docs/*.sql`) | The functions they define, their `security definer` flags, and their `grant` and `revoke` lines (a scan of every script) | VERIFIED for what is in the repository |
| `docs/reference/results/FINDINGS.md` (the owner's read-only inspection, 2026-10-26) | Supabase's default grants in `public`; row-level security on every table; broad table grants; 88 functions in `public` | DOCUMENTED (general terms; the detailed results stay with the owner) |
| `docs/import_limit.sql` lines 3 and 84 to 86 | "anon is granted update and insert on every profiles column"; players' update grant covers only name and consent columns | DOCUMENTED, not re-read from the live database |
| The local Supabase stack (PostgreSQL 17.11, GoTrue v2.197.0, PostgREST v16.5): stand-ins built from those documents, plus five of the repository's scripts loaded unchanged (`roles_proposal.sql`, `reference_lists.sql`, `restaurant_visits.sql`, `this_or_that.sql`, `note_legend.sql`) | The exact privilege inventory before, after and after rollback; behaviour through the real API and the app's own code | VERIFIED on staging; the live database may differ |

**Not available, and therefore ASSUMED:**
- the live bodies of `handle_new_user`, `my_staff_access`, `prepare_guest_merge`, `claim_guest_merge`, the photo functions and the catalog
  view's helpers;
- the live policies other than the two documented ones on `profiles`;
- the live PostgreSQL version.

## 3. Anonymous capabilities, classified

**What the classes mean:**
- **Required:** the app needs it today.
- **Optional:** useful but not needed.
- **Unnecessary:** never used by the app.
- **Unsafe:** unnecessary, and harmful if reachable.

| Capability of `anon` | Used by | Class | In the proposal |
|---|---|---|---|
| SELECT on the public catalog: `v_catalog_cards` (and the tables and helper functions its security-invoker rows need), `wine_vintages`, `wine_reference_values` | `app.js` `startEarlyLoads` on a first visit, before sign-in | **Required** for the current first-visit speed. Without it the first card waits for the guest sign-in (one round trip) | Kept |
| SELECT on `flavor_varietals`, `flavor_regions`, `grape_aliases`, `producer_aliases`, `producers`, `place_designation_rules`, `broad_places` | the same early reads | **Required** (same reason) | Kept |
| EXECUTE on functions that policies or views call, such as `has_permission()` (the reference lists' write policies are evaluated on every read), `is_editor()`, `cfg_number()`, `catalog_place_lines()` | row security and views during the reads above | **Required** | Kept. The part C guard skips any function a policy, a view or an invoker function mentions (tested with a probe policy) |
| Supabase Auth: anonymous sign-in, email code, sign-up | `ensureUser`, `account.js` (GoTrue, not database grants) | **Required** | Not affected |
| Public bottle photos (storage bucket `wine-images`, public URLs) | thumbnails | **Required** (public by design) | Not affected (storage was not audited here) |
| Any privilege on `profiles` (SELECT, INSERT, UPDATE, DELETE, REFERENCES; TRUNCATE, TRIGGER, MAINTAIN) | nothing: the app touches `profiles` only after sign-in | Unnecessary. **Unsafe** for TRUNCATE (row security does not apply), and for INSERT/UPDATE (the safety rests on row security alone) | **Removed (part A)** |
| TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on every `public` table and view | nothing (the API cannot issue them) | **Unsafe** (TRUNCATE skips row security; MAINTAIN allows locking and vacuuming) | **Removed (part B)**, also for future tables of role `postgres` |
| EXECUTE on `staff_list`, `staff_set_role`, `staff_remove`, `set_my_plan`, `my_staff_access`, `my_import_limit`, `my_import_allowance`, `delete_my_*`, `record_reaction`, `record_swipe`, guest-merge, photo, legend, place and wine-delete functions | nothing before sign-in (every `sb.rpc` call follows `ensureUser`) | **Unnecessary**: each refuses a caller with no sign-in, but one missing check would be a hole | **Removed (part C)** for those present and not mentioned by a policy or view. On the local stack: 9 functions |
| INSERT, UPDATE, DELETE on every other `public` table (`consumptions`, `encounters`, `staff_audit`, `staff_roles`, `app_config`, `this_or_that_answers`, `restaurant_visits` ...) | nothing: the app never writes as `anon` | **Unnecessary**; protected by row security today. A table with a permissive policy (or with row security off) would be open | **Proposed, not applied** (section 6) |
| SELECT on account-only tables (journal, swipes, quiz answers, staff audit, legend, visits, feedback ...) | nothing as `anon` | **Unnecessary**; row security returns no rows (`auth.uid()` is empty) | **Proposed, not applied** (section 6) |
| USAGE, SELECT, UPDATE on sequences (`setval` included) | nothing as `anon` | **Unnecessary** (UPDATE lets direct SQL move a counter; no API route) | **Proposed, not applied** |

## 4. `public.profiles`: privileges before and after (local stack, exact)

**Before.** This is the documented live state, recreated: Supabase's defaults for `anon`; for `authenticated`, no table-wide UPDATE and
column UPDATE on name and consent. On the live database `authenticated`'s column grants are DOCUMENTED, not read.

| Role | Table privileges before | After |
|---|---|---|
| `anon` | SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER (and MAINTAIN, shown by `has_table_privilege` on PostgreSQL 17) | **none** |
| PUBLIC | none | none |
| `authenticated` | SELECT, INSERT, DELETE, TRUNCATE, REFERENCES, TRIGGER (and MAINTAIN); UPDATE only through column grants | **SELECT only** |

**Column privileges:**

| Column | `anon` before | `anon` after | `authenticated` before | `authenticated` after |
|---|---|---|---|---|
| `id` | SELECT, INSERT, UPDATE, REFERENCES | none | SELECT, INSERT, REFERENCES | SELECT |
| `role`, `staff_role`, `tier`, `created_at` | SELECT, INSERT, UPDATE, REFERENCES | none | SELECT, INSERT, REFERENCES | SELECT |
| `display_name`, `consent_version`, `consent_at`, `age_attested_at`, `age_attested_rule` | SELECT, INSERT, UPDATE, REFERENCES | none | SELECT, INSERT, UPDATE, REFERENCES | **SELECT, UPDATE** |

**Policies (documented, unchanged):**
- `profiles_self_read`: SELECT `using (id = auth.uid() or is_editor())`.
- `profiles_self_update`: UPDATE `using (id = auth.uid())`.

**Sign-up.** The sign-up trigger `on_auth_user_created` → `handle_new_user()` runs as security definer (the stand-in), so it needs no
grant on `profiles`. The live trigger's mode is ASSUMED: `anon_inventory.sql` section F shows it. If it is security invoker, it runs as
Supabase's auth service role, which this proposal does not touch.

**What role, staff role and tier can still change through.** Only `staff_set_role` / `staff_remove` (Owner only, logged in
`staff_audit`), `set_my_plan` (while the plan switch is open), and the owner in SQL. VERIFIED by tests: a player or guest cannot change
their own `role`, `staff_role`, `tier`, `id` or `created_at`, before or after.

## 5. Functions in the repository's SQL: who may execute them

From a scan of `docs/*.sql`. Supabase's default privileges give `anon` and `authenticated` an explicit EXECUTE on new functions, so
`revoke ... from public` alone leaves `anon` able to call them.

| Function (file) | Security definer | Revokes from PUBLIC | Revokes from `anon` | Effect |
|---|---|---|---|---|
| `apply_place_fix` (`place_fixes.sql`), `fill_place_designation` (`geo_classification.sql`, `designations_appellation_only.sql`) | yes | yes | yes | Already closed to `anon` |
| `catalog_place_lines` (`catalog_speed.sql`) | yes | yes | granted to `anon` on purpose | **Required** by the public catalog view |
| `staff_list`, `staff_set_role`, `staff_remove`, `set_my_plan` (`roles_proposal.sql`) | yes | yes | **no** | `anon` can call them; they refuse (VERIFIED). Part C closes them |
| `legend_candidates` (`note_legend.sql`) | yes | yes | **no** | Refuses ("Not allowed"). Part C closes it |
| `delete_my_restaurant_visit` (`restaurant_visits.sql`) | yes | no | **no** | Refuses ("Not signed in"). Part C closes it |
| `delete_my_account` (`retain_after_delete.sql`); `delete_my_journal_entry`, `delete_my_photo`, `delete_my_swipe`, `record_swipe` (`soft_delete.sql`); `record_reaction` (`reactions.sql`) | yes | no | **no** | Each checks for a signed-in user (read in the source). Part C closes them on the live database (not loaded locally, except a `delete_my_swipe` stand-in) |
| `my_import_allowance`, `my_import_limit`, `guard_bulk_add`, `cfg_number` (`import_limit.sql`) | yes | no | no | `cfg_number` must stay open (read by policies and checks). `guard_bulk_add` is a trigger. The import functions are closed by part C |
| `techsheet_*` (parked; `tech_sheet*.sql`) | yes | yes | **no** | Parked feature. Part C closes any not mentioned by a policy (on the live database a policy may call `techsheet_visible`; the guard then leaves it) |
| `this_or_that_set_key` (`this_or_that.sql`) | yes | no | no | A trigger function; cannot be called through the API. Left alone |

On the live database there are 88 functions in `public` (DOCUMENTED), and only some are in the repository. Part C acts by name on a
list of signed-in-only functions, and passes over any name that does not exist. The other functions need the live inventory before
anything is decided about them.

## 6. Least-privilege proposal for the rest (NOT applied; needs the live inventory)

| Category | Tables and functions (from the app's code) | `anon` should hold | `authenticated` should hold |
|---|---|---|---|
| **Public read-only content** | `v_catalog_cards` and what it reads (`wines`, `wine_vintages`, `producers`, `geo_areas`, `grapes`, `wine_grapes`, `wine_images`, `wine_default_values`, `wine_reference_values`, `wine_source_records`, `sources`), `flavor_varietals`, `flavor_regions`, the four reference lists, `quiz_questions` / `quiz_tags` / `quiz_question_tags` if quizzes are to be public, `v_wine_prices`, `v_wine_crowd` (closed to `anon` today, DOCUMENTED) | SELECT only; EXECUTE only on the functions their policies and views call | SELECT; writes only where an editor policy allows |
| **Account-required (guest or member)** | `profiles`, `consumptions`, `encounters`, `perceptions`, `tasting_notes`, `journal_photos`, `user_wines`, `my_wine_info`, `quiz_answers`, `timed_runs`, `quiz_archive_removals`, `this_or_that_answers`, `restaurant_visits`, `note_legend_mine`, `app_feedback`, `content_flags`, `catalog_candidates`, the `v_journal_entries` / `v_user_wine_state` / `v_quiz_*` views, and the `delete_my_*` / `record_*` / merge functions | **nothing** | what each table's policies allow today (own rows) |
| **Staff-only** | `staff_roles` (definitions), `staff_audit`, `note_legend_review`, `food_pairing_overrides` writes, `wine_tags` / `wine_tag_links` writes, `place_changes`, the Owner's functions | **nothing** | SELECT and writes gated by `has_permission` policies (as today) |
| **Internal service** | `revisions`, `field_provenance`, `market_observations`, `rule_grape_fill_log`, `rank_appellation_moves`, the backup tables (`wine_name_backup`, `geo_area_designation_backup` ...), `private.*`, `internal.*` | **nothing** | nothing, or SELECT for editors where the Owner page reads them |

**Suggested next step (owner to approve).** The owner runs `anon_inventory.sql` on the live database (read-only) and sends the result
privately. A follow-up script then removes `anon`'s INSERT, UPDATE and DELETE on every `public` table, and its SELECT on the
account-required, staff-only and internal tables, keeping the public list above. It would be tested the same way. That is a larger
change, and the live inventory must confirm no feature depends on it, so it is not in this proposal.

## 7. Account-creation experience (recommendations only; no app change in this phase)

**Today** (VERIFIED in code). Everyone is a guest from the first second and can do everything a member can: swipe, rate, keep a
journal, play, learn. "Save your progress" (`account.js`) attaches an email to the same account, and the data stays.

**The real risk.** It is losing a guest's data, not anonymous access:
- clearing the browser, a new phone, or iPhone's seven-day erase of browser-tab data (convention 22) loses the guest's sign-in, and
  with it the data;
- guests are also invisible to the Owner's Roles tab, which finds people by email.

**Where a gentle, dismissible prompt helps,** without blocking browsing:

1. **After the first rating or journal entry** that is saved: one line under the confirmation, "Saved on this phone. Add your email so
   it is never lost." Shown once.
2. **When the journal reaches a few entries**, or quiz progress builds up (for example after a first full round in Learn): the same
   line in Profile, Overview.
3. **Before something only an email can carry over:** export, an import of more than a few rows, moving to another phone (the "I
   already have an account" path), and in the offline "N changes waiting" tip.
4. **In Settings, at all times:** the existing Save your progress row.
5. **Never:** a pop-up on start-up, a wall in front of Discover, the Atlas, Learn or the games, or a prompt on every save.

**Two other points:**
- Public discovery and learning stay open, because guests are signed in. If the owner ever wants true signed-out browsing (no
  anonymous sign-in until the person saves something), that is a different design, and it would need public read access to quizzes
  and a few more tables (section 6, public list). It is not recommended now.
- Any new wording goes through `words.js` and the owner. Privacy text stays in `privacy.html` (convention 7).

## 8. Findings

| Id | Severity | Finding | Status |
|---|---|---|---|
| A-1 | Medium (no API route) | `anon` and `authenticated` can TRUNCATE `profiles`, and `anon` can TRUNCATE every `public` table, in direct SQL. Row security does not apply to TRUNCATE | VERIFIED locally; DOCUMENTED defaults on the live database. Fixed by parts A and B |
| A-2 | Low | `anon` holds INSERT, UPDATE, DELETE and SELECT on `profiles`; only row security keeps it out | VERIFIED locally (refused through the API before and after). Fixed by part A |
| A-3 | Low | `authenticated` holds INSERT, DELETE, REFERENCES, TRIGGER (and MAINTAIN) on `profiles`, which the app never uses | VERIFIED locally. Fixed by part A |
| A-4 | Low | Signed-in-only functions are executable by `anon` (`revoke from public` misses Supabase's explicit `anon` grant). They refuse inside | VERIFIED. Fixed by part C for the listed names |
| A-5 | Low (no API route) | On PostgreSQL 17 `anon` holds MAINTAIN on every table (LOCK TABLE, VACUUM, ANALYZE, REFRESH) | VERIFIED locally. Fixed by part B, but **LOCK TABLE stays possible** while `anon` holds UPDATE or DELETE (A-6) |
| A-6 | Low | `anon` keeps INSERT, UPDATE, DELETE on the other tables and UPDATE on sequences | VERIFIED locally. Proposed (section 6), not applied |
| A-7 | Info | The first visit's public reads run as `anon` before sign-in. They are required for speed and harmless (published wines only) | VERIFIED in code and by the app-code test |
| A-8 | Info | Guest data is lost if the browser is cleared before an email is attached | VERIFIED in code (design). Recommendation in section 7 |

## 9. What must be checked on the live database (read-only) before anything is run

1. `anon_inventory.sql`. Compare it with section 4:
   - every `profiles` grant;
   - the sign-up trigger's mode (section F);
   - the PostgreSQL version (MAINTAIN rows);
   - the functions part C would change, and whether any is mentioned by a live policy or view (the script checks this itself and skips
     such functions, but the owner should see the list first).
2. `docs/reference/migration_001/owner_role_check.sql` (the role functions and the `profiles` grants).
3. Whether any tool outside the app (an Edge Function, a dashboard report, a script) uses the anon key against `profiles` or the
   part C functions. Nothing in this repository does. An Edge Function using the service role key is not affected.

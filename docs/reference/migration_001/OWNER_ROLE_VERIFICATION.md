# Owner role verification: public.my_staff_role_code()

Written for the Phase 2.0B.3 review package on 2026-10-26; kept in the repository and updated on 2026-10-27 (Phase 2.0B.3 corrections). **The definition of `public.my_staff_role_code()` is NOT in the repository.** It was created
by hand in Supabase ("database update 13", per `docs/ROLES_AND_ACCESS.md`). No connection to the production database was made for this
package, and the live definition was not retrieved.

## What is known about it, and from where

| Fact | Source in this package |
|---|---|
| It exists on the live database in schema `public`, returns `text`, takes no arguments, is `SECURITY DEFINER`, `stable`, language `sql`, `search_path=public`, and is executable by PUBLIC, `anon`, `authenticated` and `service_role` | `docs/reference/results/FINDINGS.md` summarises the owner's read-only structure inspection of 2026-10-26 (section 07 of `inspect_1_structure.sql`); the raw output was kept by the owner and is not included |
| Documented rule: a person's role is `profiles.staff_role`, or for older accounts `profiles.role` = `admin` means Owner and `editor` means Editor | `docs/roles_proposal.sql` header (line 4) and `docs/ROLES_AND_ACCESS.md` ("Where the database part lives") |
| The same rule is written inline in the repository's own staff functions: `coalesce(case when role = 'admin' then 'owner' end, staff_role, case when role = 'editor' then 'editor' end)` | `docs/roles_proposal.sql` (`staff_list`, `staff_set_role`, `staff_remove`) |
| `has_permission()` and `my_staff_access()` find the person's role through `my_staff_role_code()` | `docs/ROLES_AND_ACCESS.md`; `docs/roles_discovery_two.sql` header |
| The Owner role cannot be granted or changed by the app's staff functions; it is set only by hand in SQL | `docs/roles_proposal.sql` (`staff_set_role` refuses roles other than editor / quiz_reviewer and refuses to touch an owner; `staff_remove` likewise); `docs/ROLES_AND_ACCESS.md` |
| Players cannot change `profiles.role` or `profiles.staff_role` | Live grants as inspected (raw output, summarised in FINDINGS part 1): `authenticated` (every signed-in player, guests included) has **no table-level UPDATE** on `profiles`; project notes say its update grant is column-level, covering only name and consent columns (column-level grants were not part of the inspection). `anon` (signed out) **does** hold table-level UPDATE on `profiles` (Supabase's default grant); the row-level policy `profiles_self_update` (`using id = auth.uid()`, no `with check`) is what blocks it, since a signed-out caller has no user id |
| `profiles.staff_role` references `staff_roles(code)`; `profiles.role` is enum `user_role` (`player, contributor, editor, admin`) | FINDINGS part 1 (constraints, enums) |
| The function body was read once on 2026-10-14 with `docs/roles_discovery_two.sql` (read-only); the result was not saved in the repository | `docs/roles_discovery_two.sql` |

## Where migration 001 calls it

- `docs/reference/migration_001/001_wine_reference_foundation.sql`, step 0: `to_regprocedure('public.my_staff_role_code()')` must exist, or the
  migration stops before changing anything.
- Same file, inside `public.ref_review(...)`, only on an `approve` decision where the actor is the author (or the author is unknown):
  `if coalesce(public.my_staff_role_code(), '') = 'owner' then v_override := true; else raise ...`. The result is recorded as
  `review_events.owner_override`.
- `docs/reference/migration_001/001_verify.sql`: checks the function exists.
- Tests: `tests/stub_supabase.sql` defines a **stand-in** with the documented rule; `tests/001_behaviour_tests.sql` (owner section) exercises it.

## What the migration assumes it returns

1. `'owner'` if and only if the **signed-in caller** (`auth.uid()`) has the Owner role (`profiles.staff_role = 'owner'`, or `profiles.role = 'admin'`).
2. Something other than `'owner'` (another role code, or `NULL`) for everyone else, including signed-out callers and users with no profile row.
3. It reads only server-side data (`profiles`) for `auth.uid()`; it does not read request headers, session settings, JWT claims other
   than the user id, or any value the caller can supply.
4. It is evaluated afresh on every call (no caching), so removing the Owner role takes effect on the next call.

## What cannot be verified without the live definition

- The exact body: whether it uses `auth.uid()` (and not, for example, a JWT `role` claim or `request.jwt.claims` fields a client could
  influence), and whether the precedence of `role = 'admin'` over `staff_role` matches the documented rule.
- Whether it can return `'owner'` for any path other than the two documented ones (for example a third legacy value, or a default).
- Its exact `search_path` handling inside the body (the inspection shows `search_path=public`; whether objects are schema-qualified is unknown).
- Whether any other role or function can set `profiles.staff_role = 'owner'` (the repository's staff functions cannot; other live
  functions or triggers not in the repository were not read; `protect_profile_columns` is named in `roles_discovery_two.sql` but its body
  is not in the repository).
- Column-level grants on `profiles` (not part of the inspection).
- That `profiles_self_update` (no `with check` clause) cannot be used by a signed-in user to change their own `role` or `staff_role`:
  this rests on the column-level grant described in the project notes, which the inspection did not read.

## The read-only check (Phase 2.0B.3 correction 5)

`docs/reference/migration_001/owner_role_check.sql` (one select; tested in a read-only transaction on the local stand-in; **not run on the
live database by Claude**). The owner runs it in the SQL Editor and keeps the CSV private. It returns: the definitions of the named role
functions (`my_staff_role_code`, `has_permission`, `my_staff_access`, `is_editor`, `is_contributor`, `protect_profile_columns`,
`staff_set_role`, `staff_remove`, `handle_new_user`, those that exist); the triggers on `profiles` and their functions; column- and
table-level privileges on `profiles`; its row-level security and policies; the names of other functions whose code mentions `staff_role`
or `'admin'`; the role definitions; the `user_role` enum; and counts of accounts per role (no ids, names or emails).

## What to confirm from its result (all must hold before the live run)

1. Section 1, `my_staff_role_code()`: returns `'owner'` only when, for `auth.uid()`, `profiles.staff_role = 'owner'` or
   `profiles.role = 'admin'`; it reads no JWT claim other than the user id (through `auth.uid()`), no request header and no session
   setting; it is `SECURITY DEFINER` with a fixed `search_path`.
2. Section 3: neither `role` nor `staff_role` appears in the UPDATE (or INSERT) column grants of `anon` or `authenticated`.
3. Sections 4 and 5: `authenticated` has no table-level UPDATE on `profiles`; for `anon`, which does, the update policy requires
   `id = auth.uid()` (empty for signed-out callers).
4. Section 2: no trigger on `profiles` sets `role` or `staff_role` from data a player supplies (for example `handle_new_user` must
   create new profiles as `player` with no staff role).
5. Section 6: every other function that writes `staff_role` or `role` checks `has_permission('settings_edit')` (or is not executable by
   `anon` / `authenticated`), and none can grant `owner` (the repository's `staff_set_role` refuses it).
6. Section 8: the number of accounts with the Owner role is what the owner expects (normally one).

## Assumptions that stay unverified until then

- Everything in the list above: the migration's test suite uses a stand-in `my_staff_role_code()` written from the documented rule.
- `has_permission()` is assumed to read the same role through `my_staff_role_code()` and `staff_roles.permissions`.
- No other path (a direct grant, a service-key process, an Edge Function) assigns roles: a service-role key bypasses everything by design
  and is outside what the database can check.

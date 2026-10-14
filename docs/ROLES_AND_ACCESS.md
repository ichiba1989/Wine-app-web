# Who can do what: accounts, modes, plans and roles

The one place that defines it. In code it is `access.js` (pure; `accessOf(...)` answers every "may this person see/do this" question); the database enforces it with row-level security. **The screens only decide what to show.** Written 2026-10-14.

There are **four separate ideas**. They are independent: having one never gives another.

| # | Idea | Values | Where it lives | Changes |
|---|---|---|---|---|
| 1 | **Account** | Guest, Member | Supabase sign-in | account features only (save progress, sign out, carry over) |
| 2 | **Mode** ("Who is this for") | Beginner, Enthusiast, Professional | this phone (`wine.settings.mode`) | **words and extra tools only** (Blind tasting, Export my notes, Practice a topic). Never data, never what is switched on |
| 3 | **Plan** | Standard (`default`), Pro (`pro`) | database `profiles.tier` + `feature_access` | switches on features (below) |
| 4 | **Role** | Player, Quiz reviewer, Editor, Owner | database staff access (`my_staff_access`) | which staff tools and edits are allowed (permissions below) |

> Professional **mode** is not the **Pro plan**. Mode changes how the app talks; the plan switches features on.

## 1. Account
| State | How you get it | Notes |
|---|---|---|
| Guest | the app signs you in anonymously the first time | everything a player does; tied to this browser; a nudge offers to save with an email |
| Member | attach an email to the same user (`account.js`) | survives clearing the browser or changing phone; can sign out; guest progress can be carried over |
| Not yet admitted | no 21+ tick / terms not accepted (`consent.js`) | nothing past the consent page |
| Offline | no connection | the offline set works; sign-in, staff tools, import, photos, plan and roles need a connection |

## 2. Mode (this phone only)
Beginner (default), Enthusiast, Professional. Enthusiast and Professional add: Blind tasting, Export my notes, Learn "Practice a topic", and wine-term wording (`words.js`). Nothing else changes.

## 3. Plan
Shown in Settings as **Standard / Pro** while the owner keeps `app_config.plan_switch_open` = 1 (a **testing aid**: it will be hidden after testing; the Owner page, Config tab, carries a reminder). No prices, payments or limits exist; monetization is not in scope.

| Feature switch | Pro gets | Standard gets |
|---|---|---|
| `proTasting` | the professional tasting grid, notes filling the grid, "Words I could not place" | the simple taste questions |
| `importLarge` | import up to 500 rows at once | up to 100 |
| `contentFeedback` | "report a problem" on wines and quiz (set by the owner per plan; may be on for everyone) | per the switch |

Players cannot change `tier`, `role` or `staff_role` themselves. The Plan row calls `set_my_plan()`, which changes only your own plan and only while the switch is open.

## 4. Roles and permissions
A role is only a named bundle of permissions; **code asks about permissions, never role names.** There are four roles.

| Role | Who | Permissions |
|---|---|---|
| **Player** | everyone | none |
| **Quiz reviewer** | trusted players the owner picks | `quiz_verify` only (as in the database). *Tie to the Pro plan: undecided* (`QUIZ_REVIEWER_NEEDS_PRO` in `access.js` is the one switch) |
| **Editor** | as before | `catalog_edit`, `quiz_verify`, `feedback_read`, `import_extended` |
| **Owner** | the owner only | all of them, including `found_online_photos`, `remove_content`, `settings_edit`, `owner_page` |

| Permission | What it opens |
|---|---|
| `catalog_edit` | Editor tab: Structure, Catalog, Photos, Flags; wine details; catalog photos |
| `quiz_verify` | Editor: Quiz, Flags; tagging quiz questions; reviewing the note legend |
| `feedback_read` | Editor: Feedback |
| `found_online_photos` | adding photos found online; the photo finder |
| `remove_content` | deleting a wine |
| `settings_edit` | changing app settings and plans; adding quiz tags; Owner page writes |
| `owner_page` | the Owner page and Settings' Owner button |
| `import_extended` | importing up to 500 wines at once (the Pro plan also gives this) |

### Giving roles (Owner page, Roles tab)
The Owner sees everyone with a role other than Player: name, email, role, what it allows, since when. The Owner can **add** a role by typing a player's email (Editor or Quiz reviewer), **change** an Editor/Quiz reviewer to the other, or **remove** the role. Only people who have signed in with an email can be found. **The Owner role is locked**: it shows a lock, has no buttons, is not in the role list, and the database functions (`staff_set_role`, `staff_remove`) refuse to grant or change it even if called directly. Owner is only ever set by hand in the Supabase SQL editor. Each change is written to `staff_audit`.

## Who sees what (summary)
| Function | Guest / Member | Pro plan | Quiz reviewer | Editor | Owner |
|---|---|---|---|---|---|
| Discover, Swipes, Journal, Profile, Learn, Games, notes, offline | yes | yes | yes | yes | yes |
| Blind tasting, Export notes, Practice a topic | by Mode (Enthusiast/Professional) | by Mode | by Mode | by Mode | by Mode |
| Tasting grid + notes-to-grid | no | yes | per plan | per plan | per plan |
| Import 500 rows | no | yes | no (unless Pro) | yes | yes |
| Editor tab: Quiz, Flags, Feedback | no | no | yes | yes | yes |
| Editor tab: Structure, Catalog, Photos | no | no | no | yes | yes |
| Found-online photos, delete a wine | no | no | no | no | yes |
| Owner page (Wines, Lenses, Bingo, Checks, Tags, Legend, Roles, Config) | no | no | no | no | yes |
| Tech sheet (when `techsheet_enabled` is 2; staff only at 1; off at 0) | yes | yes | yes | yes | yes |
| Editor tab: Facts (research work lists and import, suggested sites, waiting finds, sources, enter a fact; players never trigger research) | no | no | no | yes | yes |
| Owner page: Facts tab | no | no | no | no | yes |
| Plan switch in Settings | while open | while open | while open | while open | while open |

## Where the database part lives
Not in the app's repository (created by hand, database update 13), read out on 2026-10-14: `staff_roles` holds the role definitions (code, label, permissions); a person's role is `profiles.staff_role` (older accounts: `profiles.role` admin = owner, editor = editor), found by `my_staff_role_code()`; `has_permission()` checks it. `docs/roles_proposal.sql` is the update (run once; safe to repeat): adds `owner_page` and `import_extended` to the role rows, makes the import limit follow `import_extended`, renames the plan `professional` to `pro`, and adds `staff_audit`, the Roles functions and the Plan switch. **Until it is run the app works as before**: Owner and Editor are recognised the old way, the Roles tab and Plan row say the update has not been run.

## How to change this
- **New permission:** add it to `PERMISSIONS` and the roles that hold it in `access.js`, to this file, and to the database.
- **New role:** add it to `ROLES` (and `ASSIGNABLE_ROLES` if the Owner page may give it), to this file, and to the database. Never assignable: Owner.
- **New plan feature:** add a row to `feature_access`, read it with `loadFeature`, pass it into `accessOf` as a feature flag, add it to the Plan table above.
- Keep UI checks on `accessOf(...)` (`access()` in `app.js`); never test a label such as "Owner".

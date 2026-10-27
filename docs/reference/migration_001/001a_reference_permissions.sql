-- MIGRATION 001a: give the reference's editorial permissions to staff roles. DRAFT; NOT RUN ON THE LIVE DATABASE.
-- Separate from 001 on purpose: it is the ONLY step that changes an existing table (public.staff_roles, the role definitions), so the owner
-- approves it on its own. Without it, nobody holds a ref_* permission and public.ref_review refuses everyone (safe).
--
-- The permissions (docs/reference/migration_001/DESIGN.md, Security):
--   ref_edit     submit drafts for review
--   ref_review   approve or reject what someone else wrote (never their own)
--   ref_publish  publish and retire
--   ref_rights   approve a rights statement (licence)
-- Who holds them is the OWNER'S DECISION. This draft gives all four to the Owner role only; the Editor lines are left commented out.
-- Safe to run again: a permission already present is not added twice. Nothing is removed. To undo: 001a_rollback.sql.
-- After running: add the four words to PERMISSIONS in access.js and to docs/ROLES_AND_ACCESS.md (the app does not use them yet).

begin;

-- Preflight (Phase 2.0B.3 correction 6): stop, changing nothing, unless migration 001 (this release) is registered and the Owner role
-- row exists. If 001a is already registered, every one of the four permissions must still be on the Owner role; if one is missing,
-- the earlier run was partly undone by hand: stop, run 001a_rollback.sql, then this file again.
do $$
declare v_missing text;
begin
  if to_regclass('wine_reference.schema_migrations') is null then
    raise exception 'Preflight: run migration 001 (release "001 r3 (2026-10-27)") first';
  end if;
  if not exists (select 1 from wine_reference.schema_migrations where version = '001' and release = '001 r3 (2026-10-27)') then
    raise exception 'Preflight: run migration 001 (release "001 r3 (2026-10-27)") first';
  end if;
  if to_regclass('public.staff_roles') is null or not exists (select 1 from public.staff_roles where code = 'owner') then
    raise exception 'Preflight: public.staff_roles has no owner row';
  end if;
  if exists (select 1 from wine_reference.schema_migrations where version = '001a') then
    select string_agg(p, ', ') into v_missing from unnest(array['ref_edit', 'ref_review', 'ref_publish', 'ref_rights']) p
     where not coalesce((select permissions from public.staff_roles where code = 'owner') @> array[p], false);
    if v_missing is not null then
      raise exception 'Preflight: 001a is registered but the Owner role lacks %: partial or hand-edited. Run 001a_rollback.sql, then 001a again.', v_missing;
    end if;
  end if;
end $$;

update public.staff_roles r
   set permissions = r.permissions || array(select p from unnest(array['ref_edit', 'ref_review', 'ref_publish', 'ref_rights']) p where not (p = any (r.permissions)))
 where r.code = 'owner';

-- Editors (owner to decide; uncomment to apply):
-- update public.staff_roles r
--    set permissions = r.permissions || array(select p from unnest(array['ref_edit', 'ref_review']) p where not (p = any (r.permissions)))
--  where r.code = 'editor';

insert into wine_reference.schema_migrations (version, name, notes)
values ('001a', 'reference permissions', 'ref_edit, ref_review, ref_publish, ref_rights given to the owner role')
on conflict (version) do nothing;

-- Postcondition: the Owner role now holds all four.
do $$ begin
  if exists (select 1 from unnest(array['ref_edit', 'ref_review', 'ref_publish', 'ref_rights']) p
              where not coalesce((select permissions from public.staff_roles where code = 'owner') @> array[p], false)) then
    raise exception 'Postcondition failed: the Owner role does not hold all four ref_* permissions';
  end if;
end $$;

commit;

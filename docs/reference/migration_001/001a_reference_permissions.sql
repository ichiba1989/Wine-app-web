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
-- Safe to run again: a permission already present is not added twice. Nothing is removed.
-- After running: add the four words to PERMISSIONS in access.js and to docs/ROLES_AND_ACCESS.md (the app does not use them yet).

begin;

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

commit;

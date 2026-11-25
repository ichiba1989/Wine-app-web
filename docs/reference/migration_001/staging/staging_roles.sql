-- STAGING ONLY (local Supabase). Three role definitions that exist ONLY in the staging database, so that an Editor, a Reviewer and a
-- Publisher of the reference can be tested apart from the Owner (production gives the ref_* permissions to the Owner role only,
-- migration 001a; who else gets them is an owner decision). Never run on production.
insert into public.staff_roles (code, label, description, permissions, sort_order) values
  ('staging_ref_editor', 'STAGING reference editor', 'staging only', '{ref_edit}', 90),
  ('staging_ref_reviewer', 'STAGING reference reviewer', 'staging only', '{ref_review}', 91),
  ('staging_ref_publisher', 'STAGING reference publisher', 'staging only', '{ref_edit,ref_review,ref_publish,ref_rights}', 92)
on conflict (code) do nothing;

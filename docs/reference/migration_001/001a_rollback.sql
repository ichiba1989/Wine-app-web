-- MIGRATION 001a: ROLLBACK. Takes the four reference permissions back from EVERY staff role and unregisters 001a. DRAFT; NOT RUN ON THE
-- LIVE DATABASE. (Phase 2.0B.3 correction 7.)
--
-- Safe at any time and safe to run again: removing a permission can only take abilities away (fail closed); with none of the four,
-- public.ref_review refuses every decision. It touches only the words ref_edit, ref_review, ref_publish and ref_rights in
-- public.staff_roles.permissions (every other permission stays exactly as it was) and the '001a' row of wine_reference.schema_migrations.
-- It does not change anyone's role (profiles), any reference content, or review history.
-- Order for a full rollback: this file first, then 001_rollback.sql (which refuses while any role still holds a ref_* permission).

begin;

update public.staff_roles r
   set permissions = array(select p from unnest(r.permissions) with ordinality u(p, i)
                            where p not in ('ref_edit', 'ref_review', 'ref_publish', 'ref_rights') order by i)
 where r.permissions && array['ref_edit', 'ref_review', 'ref_publish', 'ref_rights'];

do $$ begin
  if to_regclass('wine_reference.schema_migrations') is not null then
    delete from wine_reference.schema_migrations where version = '001a';
  end if;
  if exists (select 1 from public.staff_roles where permissions && array['ref_edit', 'ref_review', 'ref_publish', 'ref_rights']) then
    raise exception 'Postcondition failed: a ref_* permission is still on a role';
  end if;
end $$;

commit;

-- MIGRATION 001: ROLLBACK. Removes everything migration 001 created, and nothing else. DRAFT; NOT RUN ON THE LIVE DATABASE.
--
-- Use it only while the reference holds NO content (right after migration 001, or after a failed first try). It refuses to run when any
-- entity, source, rights statement or claim exists, because those are editors' work; then use forward recovery instead
-- (docs/reference/migration_001/DESIGN.md, "Rollback and forward recovery"): fix with migration 002, never by dropping.
-- It changes no existing table, row or setting: the two public functions it drops were created by migration 001 (both named ref_*),
-- and it leaves app_config alone (if the owner added 'reference_enabled', remove that row by hand).

begin;

do $$
declare n bigint;
begin
  if exists (select 1 from pg_namespace where nspname = 'wine_reference') then
    select (select count(*) from wine_reference.entities) + (select count(*) from wine_reference.sources)
         + (select count(*) from wine_reference.rights_statements) + (select count(*) from wine_reference.claims)
      into n;
    if n > 0 then
      raise exception 'Refusing to roll back: the reference holds % content rows. Use forward recovery (DESIGN.md).', n;
    end if;
  end if;
end $$;

drop function if exists public.ref_review(text, uuid, text, text);
drop function if exists public.ref_published_names(text, text, integer);
drop schema if exists wine_reference cascade;

commit;

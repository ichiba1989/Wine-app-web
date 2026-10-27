-- MIGRATION 001: ROLLBACK. Removes everything migration 001 created, and nothing else. DRAFT; NOT RUN ON THE LIVE DATABASE.
--
-- Run 001a_rollback.sql first if 001a was applied (this file refuses otherwise).
-- Use it only while the reference holds NO content (right after migration 001, or after a failed first try). It refuses to run when any
-- entity, source, rights statement or claim exists, because those are editors' work; then use forward recovery instead
-- (docs/reference/migration_001/DESIGN.md, "Rollback and forward recovery"): fix with migration 002, never by dropping.
-- It changes no existing table, row or setting: the two public functions it drops were created by migration 001 (both named ref_*),
-- and it leaves app_config alone (if the owner added 'reference_enabled', remove that row by hand).

begin;

do $$
declare n bigint;
begin
  -- 001a must be undone first (Phase 2.0B.3 correction 7): otherwise staff roles keep ref_* permission words that point at nothing.
  if to_regclass('wine_reference.schema_migrations') is not null then
    if exists (select 1 from wine_reference.schema_migrations where version = '001a') then
      raise exception 'Refusing to roll back: run 001a_rollback.sql first (001a is registered).';
    end if;
  end if;
  if to_regclass('public.staff_roles') is not null then
    if exists (select 1 from public.staff_roles where permissions && array['ref_edit', 'ref_review', 'ref_publish', 'ref_rights']) then
      raise exception 'Refusing to roll back: run 001a_rollback.sql first (reference permissions are still in place).';
    end if;
  end if;
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
drop function if exists public.ref_review(text, uuid, text, text, uuid);
drop function if exists public.ref_published_names(text, text, integer);
drop schema if exists wine_reference cascade;

commit;

-- MIGRATION 006: ROLLBACK. Removes what migration 006 added (one read door, five internal functions, two indexes), and nothing else.
-- NOT RUN LIVE. 006 stores no content (it only reads), so the rollback is always possible; the app's Reference tab then says that its
-- browsers and the evidence review need migration 006. After it, 005_verify.sql applies again.

begin;

do $$
begin
  if to_regclass('wine_reference.schema_migrations') is null or not exists (select 1 from wine_reference.schema_migrations where version = '006') then
    raise exception 'Nothing to roll back: migration 006 is not registered';
  end if;
end $$;

drop function if exists public.ref_browse(text, jsonb);
drop function if exists wine_reference.fact_review_json(uuid);
drop function if exists wine_reference.source_version_blockers(uuid);
drop function if exists wine_reference.newer_published(uuid);
drop function if exists wine_reference.author_blocker(uuid);
drop function if exists wine_reference.like_pattern(text);
drop function if exists wine_reference.fingerprint_006();
drop index if exists wine_reference.entities_created;
drop index if exists wine_reference.claims_created;
delete from wine_reference.schema_migrations where version = '006';

-- The structure must be exactly as migration 005 left it again.
do $$
begin
  if wine_reference.fingerprint_005() is distinct from (select structure_md5 from wine_reference.schema_migrations where version = '005') then
    raise exception 'Rollback check: the structure does not match migration 005''s fingerprint; nothing was changed (the transaction is undone)';
  end if;
end $$;

commit;

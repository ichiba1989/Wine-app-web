-- MIGRATION 003: ROLLBACK. Removes what migration 003 added, and nothing else, while none of it is in use. NOT RUN LIVE.
-- Refuses (changing nothing) once 003 content exists: a taxonomy entry, a link found by a 003 tool (match_method other than editor), or
-- a draft made from the catalog by 003 (its note says so). Then the fix is forward (migration 004), never dropping. After it,
-- 002_verify.sql applies again. Links made through 002's door keep working; their match columns are dropped with no loss (they were all
-- 'editor').

begin;

do $$
declare n bigint;
begin
  if to_regclass('wine_reference.schema_migrations') is null or not exists (select 1 from wine_reference.schema_migrations where version = '003') then
    raise exception 'Nothing to roll back: migration 003 is not registered';
  end if;
  select (select count(*) from wine_reference.taxonomy_domains) + (select count(*) from wine_reference.taxonomy_nodes)
       + (select count(*) from wine_reference.legacy_links where match_method <> 'editor')
       + (select count(*) from wine_reference.claim_versions where change_note like 'from the old catalog, not verified%')
    into n;
  if n > 0 then
    raise exception 'Refusing to roll back migration 003: % rows already use it. Use forward recovery (migration 004).', n;
  end if;
end $$;

drop function if exists public.ref_tools(text, jsonb);
drop trigger if exists legacy_links_check on wine_reference.legacy_links;
drop trigger if exists legacy_links_settle on wine_reference.legacy_links;
drop function if exists wine_reference.check_legacy_link();
drop function if exists wine_reference.settle_legacy_link();
drop function if exists wine_reference.import_taxonomy(jsonb);
drop function if exists wine_reference.catalog_identity(text);
drop function if exists wine_reference.catalog_fact(uuid, text, uuid, text, jsonb);
drop function if exists wine_reference.linked_entity(text, text);
drop function if exists wine_reference.suggest_link(text, text, uuid, text, smallint, text);
drop function if exists wine_reference.add_names(uuid, jsonb, text);
drop function if exists wine_reference.make_entity(text, text, text, text, text);
drop function if exists wine_reference.catalog_rows(text);
drop function if exists wine_reference.catalog_row_name(text, text);
drop function if exists wine_reference.catalog_row_exists(text, text);
drop function if exists wine_reference.catalog_kind(text);
drop function if exists wine_reference.display_name(uuid);
drop function if exists wine_reference.names_json(uuid);
drop function if exists wine_reference.fingerprint_003();
alter table wine_reference.legacy_links drop constraint if exists legacy_links_match_method_check;
alter table wine_reference.legacy_links drop constraint if exists legacy_links_match_score_check;
alter table wine_reference.legacy_links drop column if exists match_score;
alter table wine_reference.legacy_links drop column if exists match_method;
delete from wine_reference.schema_migrations where version = '003';

-- The structure must be exactly as migration 002 left it again.
do $$
begin
  if wine_reference.fingerprint_002() is distinct from (select structure_md5 from wine_reference.schema_migrations where version = '002') then
    raise exception 'Rollback check: the structure does not match migration 002''s fingerprint; nothing was changed (the transaction is undone)';
  end if;
end $$;

commit;

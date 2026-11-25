-- MIGRATION 004: ROLLBACK. Removes what migration 004 added, and nothing else, while none of it is in use. NOT RUN LIVE.
-- Refuses (changing nothing) once 004 content exists: a claim of the type rules_name_grape, or a draft fact 004 made from the catalog
-- (made_from or part_of with the note "from the old catalog, not verified"). Then the fix is forward (migration 005), never dropping.
-- After it, 003_verify.sql applies again.

begin;

do $$
declare n bigint;
begin
  if to_regclass('wine_reference.schema_migrations') is null or not exists (select 1 from wine_reference.schema_migrations where version = '004') then
    raise exception 'Nothing to roll back: migration 004 is not registered';
  end if;
  select (select count(*) from wine_reference.claims where relationship_type = 'rules_name_grape')
       + (select count(*) from wine_reference.claims c join wine_reference.claim_versions v on v.claim_id = c.id
           where c.relationship_type in ('made_from', 'part_of') and v.change_note like 'from the old catalog, not verified%')
    into n;
  if n > 0 then
    raise exception 'Refusing to roll back migration 004: % rows already use it. Use forward recovery (migration 005).', n;
  end if;
end $$;

drop function if exists public.ref_work(text, jsonb);
drop function if exists wine_reference.catalog_grapes(text[], integer);
drop function if exists wine_reference.catalog_place_tree(integer);
drop function if exists wine_reference.rule_grape_report(jsonb);
drop function if exists wine_reference.fingerprint_004();
delete from wine_reference.relationship_types where code = 'rules_name_grape';
delete from wine_reference.schema_migrations where version = '004';

-- The structure must be exactly as migration 003 left it again.
do $$
begin
  if wine_reference.fingerprint_003() is distinct from (select structure_md5 from wine_reference.schema_migrations where version = '003') then
    raise exception 'Rollback check: the structure does not match migration 003''s fingerprint; nothing was changed (the transaction is undone)';
  end if;
end $$;

commit;

-- MIGRATION 005: ROLLBACK. Removes what migration 005 added, and nothing else, while none of it is in use. NOT RUN LIVE.
-- Refuses (changing nothing) once a review batch exists (staged candidates are review history). Then the fix is forward (migration 006).
-- After it, 004_verify.sql applies again.

begin;

do $$
declare n bigint;
begin
  if to_regclass('wine_reference.schema_migrations') is null or not exists (select 1 from wine_reference.schema_migrations where version = '005') then
    raise exception 'Nothing to roll back: migration 005 is not registered';
  end if;
  select (select count(*) from wine_reference.rule_import_batches) + (select count(*) from wine_reference.rule_import_candidates) into n;
  if n > 0 then
    raise exception 'Refusing to roll back migration 005: % rows already use it. Use forward recovery (migration 006).', n;
  end if;
end $$;

drop function if exists public.ref_rules(text, jsonb);
drop function if exists wine_reference.import_rules(uuid);
drop function if exists wine_reference.rule_source_version(text, text, date);
drop function if exists wine_reference.stage_rules(jsonb, text);
drop function if exists wine_reference.code_rule(text);
drop function if exists wine_reference.row_source(jsonb);
drop function if exists wine_reference.row_min_pct(jsonb);
drop function if exists wine_reference.row_rule(jsonb);
drop table if exists wine_reference.rule_import_candidates;
drop table if exists wine_reference.rule_import_batches;
drop function if exists wine_reference.check_rule_candidate();
drop function if exists wine_reference.fingerprint_005();
delete from wine_reference.schema_migrations where version = '005';

-- The structure must be exactly as migration 004 left it again.
do $$
begin
  if wine_reference.fingerprint_004() is distinct from (select structure_md5 from wine_reference.schema_migrations where version = '004') then
    raise exception 'Rollback check: the structure does not match migration 004''s fingerprint; nothing was changed (the transaction is undone)';
  end if;
end $$;

commit;

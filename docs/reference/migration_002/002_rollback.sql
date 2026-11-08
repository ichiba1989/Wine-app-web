-- MIGRATION 002: ROLLBACK. Removes everything migration 002 added, and nothing else, while none of it is in use. DRAFT; NOT RUN LIVE.
-- Refuses (changing nothing) once any 002 content exists: an old catalog link, an entity of the four wine identity kinds, a claim that uses
-- one of the six identity relationship types or any attribute type, or an attribute type added through ref_draft. Then the fix is forward
-- (migration 003), never dropping (docs/reference/migration_001/DESIGN.md, forward recovery). After it, 001_verify.sql applies again.

begin;

do $$
declare n bigint;
begin
  if to_regclass('wine_reference.schema_migrations') is null or not exists (select 1 from wine_reference.schema_migrations where version = '002') then
    raise exception 'Nothing to roll back: migration 002 is not registered';
  end if;
  select (select count(*) from wine_reference.legacy_links)
       + (select count(*) from wine_reference.entities where kind in ('wine_product', 'wine_edition', 'wine_release', 'release_event'))
       + (select count(*) from wine_reference.claims where relationship_type in ('product_of', 'defined_by_place', 'edition_of', 'release_of', 'event_of', 'made_from')
                                                        or attribute_type is not null)
       + (select count(*) from wine_reference.attribute_types where code not in ('harvest_year', 'nv_identifier', 'release_date', 'event_date', 'bottle_format_ml'))
    into n;
  if n > 0 then
    raise exception 'Refusing to roll back migration 002: % rows already use it. Use forward recovery (migration 003).', n;
  end if;
end $$;

drop function if exists public.ref_draft(text, jsonb);
drop function if exists public.ref_staff(text, jsonb);
drop function if exists wine_reference.write_claim_version(uuid, jsonb);
drop function if exists wine_reference.require_permission(text);
drop function if exists wine_reference.fingerprint_002();
drop table if exists wine_reference.legacy_links;
delete from wine_reference.attribute_types where code in ('harvest_year', 'nv_identifier', 'release_date', 'event_date', 'bottle_format_ml');
delete from wine_reference.relationship_types where code in ('product_of', 'defined_by_place', 'edition_of', 'release_of', 'event_of', 'made_from');
delete from wine_reference.entity_kinds where code in ('wine_product', 'wine_edition', 'wine_release', 'release_event');
delete from wine_reference.schema_migrations where version = '002';

-- The structure must be exactly as migration 001 left it again.
do $$
begin
  if wine_reference.structure_fingerprint() is distinct from (select structure_md5 from wine_reference.schema_migrations where version = '001') then
    raise exception 'Rollback check: the structure does not match migration 001''s fingerprint; nothing was changed (the transaction is undone)';
  end if;
end $$;

commit;

-- DESIGNATIONS ONLY ON APPELLATIONS (owner, 2026-10-16; all versions). Run once in the Supabase SQL editor (New query, paste all, Run). Safe to run again.
--
-- Why: a designation (AOC, DOC, DOCG ...) belongs to an appellation. A region holds wines of different designations: Domaine du Jaugaret is a
-- Vin de France from Bordeaux, beside AOC Bordeaux wines, so the REGION Bordeaux must not say AOC (Bordeaux AOC is the appellation "Bordeaux").
-- The one-time fill (docs/geo_designations_fill.sql, first version) and the editor screens also wrote designations on regions (Bordeaux, Beaujolais,
-- Champagne, Douro, Central Valley, Colchagua Valley) and on the country France ("Vin de France").
--
-- What this does:
--   1. keeps a copy of every region and country designation in geo_area_designation_backup (nothing is lost; put one back by hand if needed);
--   2. takes the designation off regions and countries (appellations keep theirs);
--   3. lets fill_place_designation fill appellations only, so it cannot happen again.
-- The app already ignores a region's designation (logic.js cardFromRow, geo.js designationPlan), so cards are right even before this is run.

-- 0. Look first: the region and country designations, and how many wines point straight at each place.
select a.name, a.level, a.classification,
       (select count(*) from public.wines w where w.appellation_id = a.id) as wines_pointing_here
from public.geo_areas a
where a.level::text <> 'appellation' and a.classification is not null and btrim(a.classification) <> ''
order by a.level, a.name;

-- 1. The copy.
create table if not exists public.geo_area_designation_backup (
  area_id        uuid not null,
  name           text not null,
  level          text not null,
  classification text not null,
  saved_at       timestamptz not null default now(),
  primary key (area_id, saved_at)
);
alter table public.geo_area_designation_backup enable row level security;
drop policy if exists geo_area_designation_backup_read on public.geo_area_designation_backup;
create policy geo_area_designation_backup_read on public.geo_area_designation_backup for select using (has_permission('settings_edit'::text));

insert into public.geo_area_designation_backup (area_id, name, level, classification)
select a.id, a.name, a.level::text, a.classification
from public.geo_areas a
where a.level::text <> 'appellation' and a.classification is not null and btrim(a.classification) <> ''
  and not exists (select 1 from public.geo_area_designation_backup b where b.area_id = a.id and b.classification = a.classification);

-- 2. Off regions and countries.
update public.geo_areas set classification = null
where level::text <> 'appellation' and classification is not null;

-- 3. From now on an editor can only fill an appellation's designation.
create or replace function public.fill_place_designation(p_area uuid, p_value text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v text := nullif(btrim(coalesce(p_value, '')), '');
  n int;
begin
  if not has_permission('catalog_edit'::text) then
    raise exception 'Only editors can fill in a designation.';
  end if;
  if v is null or length(v) > 30 then
    return false;
  end if;
  update geo_areas set classification = v
  where id = p_area and level::text = 'appellation' and (classification is null or btrim(classification) = '');
  get diagnostics n = row_count;
  return n > 0;
end;
$$;
revoke all on function public.fill_place_designation(uuid, text) from public, anon;
grant execute on function public.fill_place_designation(uuid, text) to authenticated;

-- Check: no region or country keeps a designation; the copy lists what was taken off.
select (select count(*) from public.geo_areas where level::text <> 'appellation' and classification is not null) as left_on_regions,
       (select count(*) from public.geo_area_designation_backup) as kept_in_backup;

-- Designations (DOC, DOCG, AOC ...) kept on places (owner, 2026-10-15). Run once in the Supabase SQL editor; safe to run again.
--
-- A designation belongs to a place (geo_areas.classification): Barolo is DOCG for every Barolo. The wine card already reads it from the place a wine
-- points at (v_catalog_cards.classification, region or appellation). Editors pick it in "Edit wine info" and in the Vintage Wine Merchants review.
--
-- New places: editors already create places (geo.js savePlace); the designation is written with the new row, so nothing is needed for that.
-- Existing places: this function lets an editor FILL an empty designation. It never changes one that is already set (a place's designation is the
-- same for every wine there; changing one is done here, by hand, by the owner). It returns true when it filled one, false otherwise.

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
  update geo_areas set classification = v where id = p_area and (classification is null or btrim(classification) = '');
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

revoke all on function public.fill_place_designation(uuid, text) from public, anon;
grant execute on function public.fill_place_designation(uuid, text) to authenticated;

-- Check: the places that have a designation.
select name, level, classification from geo_areas where classification is not null order by name;

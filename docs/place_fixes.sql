-- Place list fixes, applied by the owner one at a time from the Owner page, Checks tab, "Places" (owner, 2026-10-15). Run once; safe to run again.
-- The app only SUGGESTS (geo.js placeChecks: official spellings with their source, places filed at the wrong level). Nothing changes until the owner
-- taps Apply, which calls apply_place_fix below. Wines keep pointing at the same place id, so renaming or re-filing a place moves nothing else.
-- Every change is written to place_changes (who, when, from what, to what).

create table if not exists public.place_changes (
  id bigserial primary key,
  area_id uuid not null,
  old_name text, new_name text,
  old_level text, new_level text,
  changed_by uuid default auth.uid(),
  changed_at timestamptz not null default now()
);
alter table public.place_changes enable row level security;
drop policy if exists place_changes_read on public.place_changes;
create policy place_changes_read on public.place_changes for select using (has_permission('settings_edit'::text));

create or replace function public.apply_place_fix(p_area uuid, p_name text default null, p_level text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  a geo_areas%rowtype;
  new_name text;
  new_level text;
begin
  if not has_permission('settings_edit'::text) then
    raise exception 'Only the owner can change a place.';
  end if;
  select * into a from geo_areas where id = p_area;
  if not found then raise exception 'That place no longer exists.'; end if;
  new_name := coalesce(nullif(btrim(coalesce(p_name, '')), ''), a.name);
  new_level := coalesce(nullif(btrim(coalesce(p_level, '')), ''), a.level::text);
  if new_level not in ('country', 'region', 'appellation') then raise exception 'Unknown level: %', new_level; end if;
  if length(new_name) > 120 then raise exception 'The name is too long.'; end if;
  if exists (select 1 from geo_areas g where g.id <> a.id and g.parent_id is not distinct from a.parent_id
             and lower(g.name) = lower(new_name) and g.level::text = new_level) then
    raise exception 'A place called % already exists there.', new_name;
  end if;
  update geo_areas set name = new_name, level = new_level::geo_level where id = a.id;
  insert into place_changes (area_id, old_name, new_name, old_level, new_level) values (a.id, a.name, new_name, a.level::text, new_level);
  return true;
end;
$$;
revoke all on function public.apply_place_fix(uuid, text, text) from public, anon;
grant execute on function public.apply_place_fix(uuid, text, text) to authenticated;

-- No two places with exactly the same name and level under the same parent (spelling differences such as "Saint-Julien" / "St.-Julien" are
-- allowed until the owner decides). The live list had no exact duplicates on 2026-10-15; if this line fails, the check below lists them.
create unique index if not exists geo_areas_same_name on public.geo_areas (parent_id, lower(name), level);

-- Check: exact duplicates (should be none) and the changes made so far.
select parent_id, lower(name) as name, level, count(*) from geo_areas group by 1, 2, 3 having count(*) > 1;
select * from place_changes order by changed_at desc limit 20;

-- Restaurant visits (owner, 2026-10-19; every version). Run once in the Supabase SQL editor; safe to run again.
-- "At a restaurant" (More tab) lets a player say what they will eat and the occasion, give a wine list, and get picks. A VISIT is what they chose to save:
-- the wine lines as the player checked them (text only, the words the list stated, never a photo), the dishes, the occasion, how adventurous they were,
-- what was suggested and what they ordered, and an optional place name they typed. Until this script is run the screens still work; saving a visit says
-- it needs the update.
--
-- Rules the app follows (CLAUDE.md conventions 8 and 22):
--   * Deleting a visit only hides it from the player (deleted_at); nothing is removed.
--   * When an account is deleted the visits stay, anonymously: user_id turns to null (and docs/retain_after_delete.sql adds a random retired_key).
--   * The feature is shown to players only while app_config restaurant_visits_open is 1 (the owner always sees it): switch it on after privacy.html has its line.

create table if not exists public.restaurant_visits (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null default auth.uid(),
  retired_key uuid,
  visited_on date not null default current_date,
  place_name text,
  occasion text,
  adventure smallint,
  dishes jsonb not null default '[]'::jsonb,
  list_lines jsonb not null default '[]'::jsonb,
  picks jsonb not null default '[]'::jsonb,
  ordered jsonb not null default '[]'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists restaurant_visits_user on public.restaurant_visits (user_id, created_at desc);
create index if not exists restaurant_visits_retired_key on public.restaurant_visits (retired_key);

-- A player reads and adds only their own visits; hiding goes through the function below.
alter table public.restaurant_visits enable row level security;
drop policy if exists restaurant_visits_read on public.restaurant_visits;
create policy restaurant_visits_read on public.restaurant_visits for select using (user_id = auth.uid() and deleted_at is null);
drop policy if exists restaurant_visits_add on public.restaurant_visits;
create policy restaurant_visits_add on public.restaurant_visits for insert with check (user_id = auth.uid());
grant select, insert on public.restaurant_visits to authenticated;
grant usage on all sequences in schema public to authenticated;

-- delete = hide
create or replace function public.delete_my_restaurant_visit(p_id bigint)
returns void language plpgsql security definer set search_path to 'public', 'private', 'extensions'
as $function$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not signed in'; end if;
  update restaurant_visits set deleted_at = now() where id = p_id and user_id = uid and deleted_at is null;
  if not found then raise exception 'Visit not found'; end if;
end $function$;
grant execute on function public.delete_my_restaurant_visit(bigint) to authenticated;

-- the switch (0 = hidden from players, 1 = shown); the owner can change it on the Owner page, Config tab
insert into app_config (key, value, note)
select 'restaurant_visits_open', to_jsonb(0), 'Show At a restaurant to players (1) or only to the owner (0). Switch on after privacy.html has its line about restaurant visits.'
where not exists (select 1 from app_config where key = 'restaurant_visits_open');

-- After this, run docs/retain_after_delete.sql again so deleting an account also gives these visits their random retired_key (without it they are
-- still kept anonymously: user_id turns to null on its own).

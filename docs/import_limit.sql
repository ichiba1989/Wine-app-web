-- ENFORCE THE JOURNAL IMPORT LIMIT IN THE DATABASE. Run once in the Supabase SQL editor (New query, paste all, Run). Safe to run twice.
-- Before this, the 100 / 500 limit only existed in the page. Now the database refuses to add more journal entries (or own wines) than the player's allowance within a
-- window, whatever the page or a hand-made request says. It reads the player's tier and staff access from the database (a player cannot change those: the profiles
-- rules only let them edit their name and consent fields).
--   regular players:                          100 new entries per window
--   staff (editors, owner) and the "pro" tier: 500 per window   (the tier list is the importLarge row in feature_access, see import_tier.sql)
--   window:                                   24 hours
-- The three numbers live in app_config, so the owner can change them on the Owner page, Config tab: import_limit_regular, import_limit_extended, import_window_hours.

-- 1. the numbers (only added if they are not there yet)
insert into app_config (key, value, note)
select v.key, v.value, v.note from (values
  ('import_limit_regular',  to_jsonb(100), 'Most journal entries a regular player can add in one window (see import_window_hours)'),
  ('import_limit_extended', to_jsonb(500), 'Most journal entries staff and pro-tier players can add in one window'),
  ('import_window_hours',   to_jsonb(24),  'Length of that window in hours')
) as v(key, value, note)
where not exists (select 1 from app_config c where c.key = v.key);

-- 2. helper: read one number from app_config (a plain number, or {"value": n}), or a default
create or replace function public.cfg_number(p_key text, p_default numeric)
returns numeric language sql stable security definer set search_path to 'public'
as $$
  select coalesce((select (case when jsonb_typeof(to_jsonb(c.value)) = 'object' then to_jsonb(c.value) ->> 'value' else trim(both '"' from to_jsonb(c.value)::text) end)::numeric
                   from app_config c where c.key = p_key), p_default)
$$;

-- 3. how many entries this player may add in a window
create or replace function public.my_import_limit()
returns integer language plpgsql stable security definer set search_path to 'public'
as $$
declare uid uuid := auth.uid(); p record; big boolean := false;
begin
  if uid is null then return null; end if;   -- no signed-in player (a database job): no limit
  select role, staff_role, tier into p from profiles where id = uid;
  if p.role in ('admin', 'editor') or p.staff_role is not null then big := true; end if;
  if not big then
    begin
      big := coalesce((select bool_or(f.all_tiers or (p.tier is not null and coalesce(to_jsonb(f.tiers) ? p.tier, false))) from feature_access f where f.feature = 'importLarge'), false);
    exception when others then big := false;
    end;
  end if;
  return (case when big then cfg_number('import_limit_extended', 500) else cfg_number('import_limit_regular', 100) end)::integer;
end $$;

-- 4. the check that runs whenever a journal entry or an own wine is added
create or replace function public.guard_bulk_add()
returns trigger language plpgsql security definer set search_path to 'public'
as $$
declare lim integer; hrs numeric; used integer;
begin
  lim := my_import_limit();
  if lim is null or new.user_id is null or new.user_id is distinct from auth.uid() then return new; end if;
  hrs := cfg_number('import_window_hours', 24);
  if tg_table_name = 'consumptions' then
    select count(*) into used from consumptions where user_id = new.user_id and created_at > now() - make_interval(secs => (hrs * 3600)::int);
  else
    select count(*) into used from user_wines where user_id = new.user_id and created_at > now() - make_interval(secs => (hrs * 3600)::int);
  end if;
  if used >= lim then
    raise exception 'Limit reached: you can add up to % wines every % hours.', lim, trim(trailing '.' from trim(trailing '0' from hrs::text)) using errcode = 'P0001', hint = 'import_limit';
  end if;
  return new;
end $$;

create index if not exists consumptions_user_created on public.consumptions (user_id, created_at);
create index if not exists user_wines_user_created on public.user_wines (user_id, created_at);
drop trigger if exists guard_bulk_add on public.consumptions;
create trigger guard_bulk_add before insert on public.consumptions for each row execute function public.guard_bulk_add();
drop trigger if exists guard_bulk_add on public.user_wines;
create trigger guard_bulk_add before insert on public.user_wines for each row execute function public.guard_bulk_add();

-- 5. what the page asks before an import: the limit, how much is used, how much is left
create or replace function public.my_import_allowance()
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $$
declare uid uuid := auth.uid(); lim integer := my_import_limit(); hrs numeric := cfg_number('import_window_hours', 24); used integer;
begin
  if uid is null then return null; end if;
  select count(*) into used from consumptions where user_id = uid and created_at > now() - make_interval(secs => (hrs * 3600)::int);
  return jsonb_build_object('limit', lim, 'used', used, 'remaining', greatest(lim - used, 0), 'hours', hrs);
end $$;
grant execute on function public.my_import_allowance() to authenticated;

-- Optional tidy-up (not needed for the limit): signed-out visitors (the "anon" role) are granted update and insert on every profiles column. The row rules already stop
-- them, but removing the grants is safer. Uncomment to apply:
--   revoke insert, update on public.profiles from anon;

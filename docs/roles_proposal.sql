-- Roles, plans and the Roles tab (docs/ROLES_AND_ACCESS.md). Written against the real database as read by docs/roles_discovery_one.sql and
-- docs/roles_discovery_two.sql on 2026-10-14. Run the WHOLE script once in the Supabase SQL editor; every step can safely be run again.
-- What the database looked like: staff_roles holds the role definitions (code, label, description, permissions[], sort_order);
-- a person's role is profiles.staff_role (or, for older accounts, profiles.role admin = owner, editor = editor), found by my_staff_role_code().
--
-- What this script does:
--   1. gives the roles two new permissions: owner_page (owner) and import_extended (editor, owner)
--   2. makes the 500-row import follow import_extended (so a Quiz reviewer gets 100, as decided) or the importLarge plan switch
--   3. makes the plan names agree: the tasting grid was listed under "professional" and the larger import under "pro"; both become "pro"
--   4. adds staff_audit and the three functions behind the Owner page's Roles tab: staff_list(), staff_set_role(), staff_remove()
--      (the Owner role can never be given, changed or removed by them)
--   5. adds the Plan switch: app_config plan_switch_open (1 = shown in Settings) and set_my_plan()

-- 1. New permissions on the role rows.
update public.staff_roles set permissions = array_append(permissions, 'import_extended')
 where code in ('editor', 'owner') and not ('import_extended' = any (permissions));
update public.staff_roles set permissions = array_append(permissions, 'owner_page')
 where code = 'owner' and not ('owner_page' = any (permissions));

-- 2. The import limit: staff who hold import_extended, or a plan listed in the importLarge switch, get the larger number.
create or replace function public.my_import_limit() returns integer
language plpgsql stable security definer set search_path to 'public' as $$
declare uid uuid := auth.uid(); p record; big boolean := false;
begin
  if uid is null then return null; end if;
  select tier into p from profiles where id = uid;
  if has_permission('import_extended') then big := true; end if;
  if not big then
    begin
      big := coalesce((select bool_or(f.all_tiers or (p.tier is not null and coalesce(to_jsonb(f.tiers) ? p.tier, false))) from feature_access f where f.feature = 'importLarge'), false);
    exception when others then big := false;
    end;
  end if;
  return (case when big then cfg_number('import_limit_extended', 500) else cfg_number('import_limit_regular', 100) end)::integer;
end $$;

-- 3. One name for the paid-style plan: "pro". Handles tiers stored either as a text array or as json.
do $$
declare t text;
begin
  select data_type into t from information_schema.columns where table_schema = 'public' and table_name = 'feature_access' and column_name = 'tiers';
  if t = 'ARRAY' then
    update public.feature_access set tiers = array_replace(tiers, 'professional', 'pro') where 'professional' = any (tiers);
  else
    update public.feature_access set tiers = (select jsonb_agg(case when v = 'professional' then 'pro' else v end) from jsonb_array_elements_text(to_jsonb(tiers)) v)
     where to_jsonb(tiers) ? 'professional';
  end if;
end $$;
update public.profiles set tier = 'pro' where tier = 'professional';

-- 4. Audit trail and the Roles functions. Only a person with settings_edit (the owner) can use them; they are also the only way the app writes roles.
create table if not exists public.staff_audit (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  changed_by uuid references auth.users(id) on delete set null,
  target_user_id uuid,
  target_email text,
  old_role text,
  new_role text
);
alter table public.staff_audit enable row level security;
drop policy if exists staff_audit_read on public.staff_audit;
create policy staff_audit_read on public.staff_audit for select using (has_permission('settings_edit'::text));

-- Everyone who has a staff role (owner included), with email.
create or replace function public.staff_list() returns table (user_id uuid, display_name text, email text, role text, label text, permissions text[], since timestamptz)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not has_permission('settings_edit'::text) then raise exception 'Only the owner can see the roles.' using errcode = '42501'; end if;
  return query
    select pr.id, pr.display_name::text, u.email::text, r.code::text, r.label::text, r.permissions::text[],
           coalesce((select max(a.created_at) from staff_audit a where a.target_user_id = pr.id and a.new_role is not null), pr.created_at)
      from profiles pr
      join staff_roles r on r.code = coalesce(case when pr.role = 'admin' then 'owner' end, pr.staff_role, case when pr.role = 'editor' then 'editor' end)
      left join auth.users u on u.id = pr.id
     order by r.sort_order, pr.display_name;
end $$;

-- Gives an existing player (found by email) the role editor or quiz_reviewer, or changes it. Never owner; never touches an owner.
create or replace function public.staff_set_role(p_email text, p_role text) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid; v_old text;
begin
  if not has_permission('settings_edit'::text) then raise exception 'Only the owner can change roles.' using errcode = '42501'; end if;
  if p_role is null or p_role not in ('editor', 'quiz_reviewer') then
    raise exception 'Only Editor or Quiz reviewer can be given here. The Owner role cannot be given from the app.';
  end if;
  select id into v_uid from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if v_uid is null or not exists (select 1 from profiles where id = v_uid) then
    raise exception 'No account with that email. They need to save their progress with that email first.';
  end if;
  select coalesce(case when role = 'admin' then 'owner' end, staff_role, case when role = 'editor' then 'editor' end) into v_old from profiles where id = v_uid;
  if v_old = 'owner' then raise exception 'The Owner role cannot be changed from the app.'; end if;
  update profiles set staff_role = p_role where id = v_uid;
  insert into staff_audit (changed_by, target_user_id, target_email, old_role, new_role) values (auth.uid(), v_uid, lower(trim(p_email)), v_old, p_role);
  return jsonb_build_object('user_id', v_uid, 'role', p_role);
end $$;

-- Takes the staff role away (the person is a player again). Never an owner.
create or replace function public.staff_remove(p_user_id uuid) returns void
language plpgsql security definer set search_path to 'public' as $$
declare v_old text; v_email text;
begin
  if not has_permission('settings_edit'::text) then raise exception 'Only the owner can change roles.' using errcode = '42501'; end if;
  select coalesce(case when role = 'admin' then 'owner' end, staff_role, case when role = 'editor' then 'editor' end) into v_old from profiles where id = p_user_id;
  if v_old is null then return; end if;
  if v_old = 'owner' then raise exception 'The Owner role cannot be removed from the app.'; end if;
  select email into v_email from auth.users where id = p_user_id;
  update profiles set staff_role = null, role = case when role = 'editor' then 'player'::user_role else role end where id = p_user_id;
  insert into staff_audit (changed_by, target_user_id, target_email, old_role, new_role) values (auth.uid(), p_user_id, lower(v_email), v_old, null);
end $$;

revoke all on function public.staff_list() from public;               grant execute on function public.staff_list() to authenticated;
revoke all on function public.staff_set_role(text, text) from public; grant execute on function public.staff_set_role(text, text) to authenticated;
revoke all on function public.staff_remove(uuid) from public;         grant execute on function public.staff_remove(uuid) to authenticated;

-- 5. The Plan switch (a testing aid). plan_switch_open = 1 shows the Standard/Pro row in Settings; set it to 0 (Owner page, Config tab) to hide it for everyone.
insert into public.app_config (key, value, note)
select 'plan_switch_open', to_jsonb(1), 'REMINDER: 1 shows the Standard/Pro plan row in Settings so testers can try Pro features. Set to 0 before the real launch, and decide whether Quiz reviewer needs Pro.'
where not exists (select 1 from public.app_config where key = 'plan_switch_open');

create or replace function public.set_my_plan(p_plan text) returns text
language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if p_plan is null or p_plan not in ('default', 'pro') then raise exception 'Choose Standard or Pro.'; end if;
  if cfg_number('plan_switch_open', 0) <> 1 then raise exception 'The plan switch is closed.'; end if;
  update profiles set tier = p_plan where id = auth.uid();
  return p_plan;
end $$;
revoke all on function public.set_my_plan(text) from public;
grant execute on function public.set_my_plan(text) to authenticated;

-- Check afterwards (read-only):
--   select code, permissions from staff_roles order by sort_order;
--   select feature, tiers from feature_access;
--   select key, value from app_config where key = 'plan_switch_open';

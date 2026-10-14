-- ============================================================================================================================
-- DRAFT. DO NOT RUN YET.
-- Step 2 of the roles update (docs/ROLES_AND_ACCESS.md). The staff tables and my_staff_access were created outside this repository, so this
-- script was written WITHOUT seeing them. First run docs/roles_discovery.sql and send the results; then the placeholders marked ADAPT below
-- are filled in against the real tables and this banner is removed. Running it as it stands could fail or, worse, replace a working
-- my_staff_access with a wrong one.
-- ============================================================================================================================
-- Section 4 (the Plan switch) does not depend on the staff tables and can be run on its own once you are ready for testers to switch plans.
-- What it adds (the app works without it: the Plan row and the Roles tab simply say the update has not been run):
--   * four roles: player, quiz_reviewer, editor, owner (owner is only ever set by hand, here in the SQL editor)
--   * two new permissions: owner_page (Owner only) and import_extended (Editor, Owner) -> replace "any staff" for the 500-row import
--   * staff_list(), staff_set_role(email, role), staff_remove(user_id): used by the Owner page, Roles tab; callable only with settings_edit;
--     they refuse to grant "owner" and refuse to change or remove an Owner, even when called directly
--   * staff_audit: who changed whom, from what to what
--   * app_config plan_switch_open (1 = the Plan row shows in Settings) and set_my_plan('default' | 'pro'): changes only the caller's own tier,
--     and only while plan_switch_open is 1. Closing the switch after testing = set plan_switch_open to 0 on the Owner page, Config tab.

-- ADAPT: the table that says which staff role a user has. Placeholder: public.staff_roles (user_id uuid primary key, role text, created_at timestamptz).
-- ADAPT: the table or function that maps a role to its permissions (my_staff_access reads it). Placeholder: public.role_permissions (role text, permission text).

-- 1. Roles and permissions (idempotent).
-- insert into public.role_permissions (role, permission) values
--   ('quiz_reviewer', 'quiz_verify'), ('quiz_reviewer', 'feedback_read'),
--   ('editor', 'import_extended'),
--   ('owner', 'owner_page'), ('owner', 'import_extended')
-- on conflict do nothing;

-- 2. Audit trail of role changes (owner can read; written only by the functions below).
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

-- 3. The three functions behind the Owner page's Roles tab. The Owner role is locked in all of them.
-- create or replace function public.staff_list() returns table (user_id uuid, display_name text, email text, role text, label text, permissions text[], since timestamptz)
-- language plpgsql security definer set search_path = public as $$
-- begin
--   if not has_permission('settings_edit'::text) then raise exception 'Only the owner can see the roles.'; end if;
--   return query select s.user_id, p.display_name, u.email::text, s.role, initcap(replace(s.role, '_', ' ')),
--     coalesce((select array_agg(rp.permission order by rp.permission) from public.role_permissions rp where rp.role = s.role), '{}'),
--     s.created_at
--   from public.staff_roles s join auth.users u on u.id = s.user_id left join public.profiles p on p.id = s.user_id;   -- ADAPT
-- end $$;
--
-- create or replace function public.staff_set_role(p_email text, p_role text) returns jsonb
-- language plpgsql security definer set search_path = public as $$
-- declare v_uid uuid; v_old text;
-- begin
--   if not has_permission('settings_edit'::text) then raise exception 'Only the owner can change roles.'; end if;
--   if p_role not in ('editor', 'quiz_reviewer') then raise exception 'Only Editor or Quiz reviewer can be given here. The Owner role cannot be given from the app.'; end if;
--   select id into v_uid from auth.users where lower(email) = lower(trim(p_email)) limit 1;
--   if v_uid is null then raise exception 'No account with that email. They need to save their progress with that email first.'; end if;
--   select role into v_old from public.staff_roles where user_id = v_uid;                                                  -- ADAPT
--   if v_old = 'owner' then raise exception 'The Owner role cannot be changed from the app.'; end if;
--   insert into public.staff_roles (user_id, role) values (v_uid, p_role)
--     on conflict (user_id) do update set role = excluded.role;                                                           -- ADAPT
--   insert into public.staff_audit (changed_by, target_user_id, target_email, old_role, new_role) values (auth.uid(), v_uid, lower(trim(p_email)), v_old, p_role);
--   return jsonb_build_object('user_id', v_uid, 'role', p_role);
-- end $$;
--
-- create or replace function public.staff_remove(p_user_id uuid) returns void
-- language plpgsql security definer set search_path = public as $$
-- declare v_old text; v_email text;
-- begin
--   if not has_permission('settings_edit'::text) then raise exception 'Only the owner can change roles.'; end if;
--   select role into v_old from public.staff_roles where user_id = p_user_id;                                              -- ADAPT
--   if v_old is null then return; end if;
--   if v_old = 'owner' then raise exception 'The Owner role cannot be removed from the app.'; end if;
--   select email into v_email from auth.users where id = p_user_id;
--   delete from public.staff_roles where user_id = p_user_id;                                                               -- ADAPT
--   insert into public.staff_audit (changed_by, target_user_id, target_email, old_role, new_role) values (auth.uid(), p_user_id, lower(v_email), v_old, null);
-- end $$;
-- revoke all on function public.staff_list() from public;           grant execute on function public.staff_list() to authenticated;
-- revoke all on function public.staff_set_role(text, text) from public; grant execute on function public.staff_set_role(text, text) to authenticated;
-- revoke all on function public.staff_remove(uuid) from public;     grant execute on function public.staff_remove(uuid) to authenticated;

-- 4. The Plan switch (a testing aid; closed after testing by setting plan_switch_open to 0).
insert into public.app_config (key, value, note)
select 'plan_switch_open', to_jsonb(1), 'REMINDER: 1 shows the Standard/Pro plan row in Settings so testers can try Pro features. Set to 0 before the real launch, and decide whether Quiz reviewer needs Pro.'
where not exists (select 1 from public.app_config where key = 'plan_switch_open');

create or replace function public.set_my_plan(p_plan text) returns text
language plpgsql security definer set search_path = public as $$
declare v_open numeric;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if p_plan not in ('default', 'pro') then raise exception 'Choose Standard or Pro.'; end if;
  select case when jsonb_typeof(value) = 'object' then (value->>'value')::numeric else (value #>> '{}')::numeric end into v_open from public.app_config where key = 'plan_switch_open';
  if coalesce(v_open, 0) <> 1 then raise exception 'The plan switch is closed.'; end if;
  update public.profiles set tier = p_plan where id = auth.uid();
  return p_plan;
end $$;
revoke all on function public.set_my_plan(text) from public;
grant execute on function public.set_my_plan(text) to authenticated;

-- 5. ADAPT: the import trigger (docs/import_limit.sql) gives 500 to "any staff" and to tier pro. With import_extended it should read
--    has_permission('import_extended') or tier pro instead of "any staff". Re-issue that function once the discovery output shows its current text.

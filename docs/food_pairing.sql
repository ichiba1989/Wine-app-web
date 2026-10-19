-- Food pairing pins (owner, 2026-10-19; every version). Run once in the Supabase SQL editor; safe to run again.
-- The Food screens in the More tab rate each dish against each kind of wine from rules in the app's code (foods.js). A "pin" is the owner
-- saying: for this dish and this kind of wine the rating is Ideal / Good / Okay / Avoid, with a reason players can read. A pin always wins over the
-- rules, but only while its status is 'in use' or 'checked' (the same idea as docs/reference_lists.sql). Without this table the app uses its rules
-- alone and the Owner page, Pairings tab, says the update is needed.
--   food_id   the dish's id in foods.js (for example 'steak', 'oysters')
--   kind_id   the kind of wine's id in foods.js (for example 'full-red', 'crisp-white')

create table if not exists public.food_pairing_overrides (
  id bigserial primary key,
  food_id text not null,
  kind_id text not null,
  rating text not null check (rating in ('ideal', 'good', 'okay', 'avoid')),
  reason text not null default '',
  status text not null default 'in use' check (status in ('suggested', 'in use', 'checked')),
  basis text not null default 'owner',
  source_url text,
  checked_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (food_id, kind_id)
);

-- Everyone reads (the pins shape what players see); only the owner changes them.
alter table public.food_pairing_overrides enable row level security;
drop policy if exists food_pairing_overrides_read on public.food_pairing_overrides;
create policy food_pairing_overrides_read on public.food_pairing_overrides for select using (true);
drop policy if exists food_pairing_overrides_write on public.food_pairing_overrides;
create policy food_pairing_overrides_write on public.food_pairing_overrides for all using (has_permission('settings_edit'::text)) with check (has_permission('settings_edit'::text));
grant select on public.food_pairing_overrides to anon, authenticated;
grant insert, update, delete on public.food_pairing_overrides to authenticated;
grant usage on all sequences in schema public to authenticated;

-- This or That answers (the owner's food-and-wine research). RUN THIS ONCE in the Supabase SQL editor; it is not applied automatically.
-- Until it is run, the game still works: saving an answer fails quietly (the browser console says "This or That answer not saved").
--
-- Kept after the account is deleted, anonymously: each answer carries a random player_key (not the account id). When an account is deleted,
-- its user_id turns to null, so the answers stay together under the player_key but nothing links them to a person.
-- (The link between account and key lives only in this_or_that_players, and that link is cut at the same moment.)

-- 1. who a random key belongs to (clients cannot read or write this table: no policies)
create table if not exists public.this_or_that_players (
  player_key uuid primary key default gen_random_uuid(),
  user_id    uuid unique references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.this_or_that_players enable row level security;

-- 2. the answers: one row per player and pair; answering again replaces the row
create table if not exists public.this_or_that_answers (
  id          bigint generated always as identity primary key,
  user_id     uuid references auth.users(id) on delete set null default auth.uid(),
  player_key  uuid not null,                          -- filled in by the trigger below
  pair_id     text not null,
  pair_kind   text not null check (pair_kind in ('food', 'other')),
  choice      text not null check (choice in ('a', 'b', 'skip')),
  picked      text,                                   -- the words of the thing picked, e.g. 'Ribeye' (null when skipped)
  axis        text check (axis in ('body', 'acidity', 'sweetness', 'tannin', 'oak', 'world')),
  dir         smallint check (dir in (-1, 1)),        -- which end of the line the pick leans toward (world: -1 Old World, +1 New World)
  answered_at timestamptz not null default now()
);
-- the app saves with on conflict (user_id, pair_id); rows whose user_id became null never conflict
create unique index if not exists this_or_that_answers_user_pair on public.this_or_that_answers (user_id, pair_id);
create index if not exists this_or_that_answers_player on public.this_or_that_answers (player_key);

-- 3. give each new answer the player's random key (and keep it from being changed later)
create or replace function public.this_or_that_set_key() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    select player_key into new.player_key from public.this_or_that_players where user_id = new.user_id;
    if new.player_key is null then
      insert into public.this_or_that_players (user_id) values (new.user_id)
        on conflict (user_id) do update set user_id = excluded.user_id returning player_key into new.player_key;
    end if;
  else
    new.player_key := old.player_key;
  end if;
  return new;
end $$;
drop trigger if exists this_or_that_key on public.this_or_that_answers;
create trigger this_or_that_key before insert or update on public.this_or_that_answers
  for each row execute function public.this_or_that_set_key();

-- 4. a player can read and write only their own answers. You read everything in the Supabase dashboard (SQL editor), which bypasses these rules.
alter table public.this_or_that_answers enable row level security;
drop policy if exists "own answers: read" on public.this_or_that_answers;
drop policy if exists "own answers: add" on public.this_or_that_answers;
drop policy if exists "own answers: change" on public.this_or_that_answers;
create policy "own answers: read"   on public.this_or_that_answers for select to authenticated using (user_id = auth.uid());
create policy "own answers: add"    on public.this_or_that_answers for insert to authenticated with check (user_id = auth.uid());
create policy "own answers: change" on public.this_or_that_answers for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---- Questions to ask the data (run in the SQL editor) ----
-- How many players answered each pair, and how they split:
--   select pair_id, picked, count(*) from public.this_or_that_answers where choice <> 'skip' group by 1, 2 order by 1, 3 desc;
-- How each player leans on each line (negative = low end, positive = high end), including players whose account is gone:
--   select player_key, axis, sum(dir) as lean, count(*) as picks from public.this_or_that_answers where axis is not null group by 1, 2;
-- Next step, once the journal columns are confirmed: join a player's leans to the verdicts and countries on their journal entries
-- (v_journal_entries) to see whether, for example, "Ribeye" players rate New World wines higher. After an account is deleted its journal
-- is gone too, so that join works only for players who still have an account.

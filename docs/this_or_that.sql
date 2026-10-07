-- This or That answers (the owner's food-and-wine research). RUN THIS ONCE in the Supabase SQL editor; it is not applied automatically.
-- Until it is run, the game still works: saving an answer fails quietly (the browser console says "This or That answer not saved").
-- One row per player and pair; answering a pair again replaces the row. Deleting the account deletes the rows (on delete cascade).
create table if not exists public.this_or_that_answers (
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  pair_id     text not null,
  pair_kind   text not null check (pair_kind in ('food', 'other')),
  choice      text not null check (choice in ('a', 'b', 'skip')),
  picked      text,                                   -- the words of the thing picked, e.g. 'Ribeye' (null when skipped)
  axis        text check (axis in ('body', 'acidity', 'sweetness', 'tannin', 'oak', 'world')),
  dir         smallint check (dir in (-1, 1)),        -- which end of the line the pick leans toward (world: -1 Old World, +1 New World)
  answered_at timestamptz not null default now(),
  primary key (user_id, pair_id)
);
alter table public.this_or_that_answers enable row level security;
-- A player can read and write only their own answers. The owner studies the data in the Supabase dashboard (SQL editor), which bypasses these rules.
create policy "own answers: read"   on public.this_or_that_answers for select to authenticated using (user_id = auth.uid());
create policy "own answers: add"    on public.this_or_that_answers for insert to authenticated with check (user_id = auth.uid());
create policy "own answers: change" on public.this_or_that_answers for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---- Questions to ask the data (run in the SQL editor) ----
-- How many players answered each pair, and how they split:
--   select pair_id, picked, count(*) from public.this_or_that_answers where choice <> 'skip' group by 1, 2 order by 1, 3 desc;
-- How each player leans on each line (negative = low end, positive = high end):
--   select user_id, axis, sum(dir) as lean, count(*) as picks from public.this_or_that_answers where axis is not null group by 1, 2;
-- Next step, once the journal columns are confirmed: join a player's leans to the verdicts and countries on their journal entries
-- (v_journal_entries) to see whether, for example, "Ribeye" players rate New World wines higher.

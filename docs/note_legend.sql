-- NOTE LEGEND: the words players use in tasting notes and which tasting-grid answer each one means. Run once in the Supabase SQL editor (New query, paste all, Run). Safe to run twice.
-- Why: the app reads a player's notes into the professional tasting grid (notegrid.js). It knows a starting list in the code; this script lets the list GROW:
--   note_legend         the shared legend everyone's app reads. Only editors (quiz_verify) and the owner (settings_edit) can add, change or remove lines.
--   note_legend_mine    each player's own legend: words they taught the app ("zippy" means high acidity), and answers they pushed back on (rejected). Private to the player.
--                       A line can be marked "share": then only the word and the answer (never a note, a wine or a name) is offered to editors as a suggestion.
--   note_legend_review  what editors decided about suggestions (approved or rejected), so a rejected suggestion does not come back.
--   legend_candidates() editors and the owner call this to see suggestions: each word and answer with how many different players suggested it (the players themselves are not shown).
-- When an account is deleted the player's lines stay anonymously like other player data (user_id becomes empty), but only lines with a user count as suggestions.
-- The app works without this script (the starting list and the player's own words kept on the phone); it uses these tables once they exist.

create table if not exists public.note_legend (
  id          uuid primary key default gen_random_uuid(),
  phrase      text not null check (length(trim(phrase)) between 2 and 60),
  field       text not null check (length(field) between 2 and 40),
  value       text not null check (length(value) between 1 and 60),
  language    text,
  source      text not null default 'learned' check (source in ('seed', 'learned', 'owner')),
  approved_by uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create unique index if not exists note_legend_uq on public.note_legend (lower(phrase), field, value);

create table if not exists public.note_legend_mine (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete set null,
  phrase     text not null check (length(trim(phrase)) between 2 and 60),
  field      text not null check (length(field) between 2 and 40),
  value      text not null check (length(value) between 1 and 60),
  rejected   boolean not null default false,
  share      boolean not null default false,
  created_at timestamptz not null default now()
);
-- (the app stores phrases already lower-case, so a plain unique index lets it save a line again without a duplicate)
create unique index if not exists note_legend_mine_uq on public.note_legend_mine (user_id, phrase, field, value);

create table if not exists public.note_legend_review (
  phrase     text not null,
  field      text not null,
  value      text not null,
  decision   text not null check (decision in ('approved', 'rejected')),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz not null default now(),
  primary key (phrase, field, value)
);

alter table public.note_legend enable row level security;
alter table public.note_legend_mine enable row level security;
alter table public.note_legend_review enable row level security;

drop policy if exists note_legend_read on public.note_legend;
drop policy if exists note_legend_write on public.note_legend;
drop policy if exists note_legend_mine_own on public.note_legend_mine;
drop policy if exists note_legend_review_staff on public.note_legend_review;
create policy note_legend_read on public.note_legend for select using (true);
create policy note_legend_write on public.note_legend for all using (has_permission('quiz_verify'::text) or has_permission('settings_edit'::text)) with check (has_permission('quiz_verify'::text) or has_permission('settings_edit'::text));
create policy note_legend_mine_own on public.note_legend_mine for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy note_legend_review_staff on public.note_legend_review for all using (has_permission('quiz_verify'::text) or has_permission('settings_edit'::text)) with check (has_permission('quiz_verify'::text) or has_permission('settings_edit'::text));

-- Suggestions for editors and the owner: how many different players shared each word and answer. Runs with elevated rights so it can count across players, and returns counts only.
create or replace function public.legend_candidates()
returns table (phrase text, field text, value text, players bigint)
language plpgsql security definer set search_path to 'public' as $function$
begin
  if not (has_permission('quiz_verify'::text) or has_permission('settings_edit'::text)) then
    raise exception 'Not allowed';
  end if;
  return query
    select lower(m.phrase), m.field, m.value, count(distinct m.user_id)
    from note_legend_mine m
    where m.share and not m.rejected and m.user_id is not null
      and not exists (select 1 from note_legend l where lower(l.phrase) = lower(m.phrase) and l.field = m.field and l.value = m.value)
      and not exists (select 1 from note_legend_review r where lower(r.phrase) = lower(m.phrase) and r.field = m.field and r.value = m.value)
    group by lower(m.phrase), m.field, m.value
    order by 4 desc, 1;
end $function$;
revoke all on function public.legend_candidates() from public;
grant execute on function public.legend_candidates() to authenticated;

-- How many different players must suggest a word before it is flagged as ready to review (a hint on the Owner page; a person still decides).
insert into app_config (key, value, note)
select 'legend_share_threshold', to_jsonb(3), 'How many different players must suggest the same word and answer before it shows as ready to review (Owner page, Legend tab)'
where not exists (select 1 from app_config where key = 'legend_share_threshold');

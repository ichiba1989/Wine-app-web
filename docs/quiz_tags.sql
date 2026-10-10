-- QUIZ TAGS: link quiz questions to the grapes, places, producers and styles they are about. Run once in the Supabase SQL editor (New query, paste all, Run). Safe to run twice.
-- Why: when a player says "I don't know it" to wines, the app learns which grapes and places they have not met. A tag on a question is the link that lets the quiz
-- ask about those first. Editors tag questions in the Editor tab (Quiz); the owner adds new tags on the Owner page (Tags tab).
--   quiz_tags           the list of tags (kind: grape, region, country, producer, style, theme)
--   quiz_question_tags  which tags a question has
-- Everyone can read both (the quiz needs them). Editors with the quiz_verify permission can tag questions. Only people with settings_edit (the owner) can add tags.

create table if not exists public.quiz_tags (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('grape', 'region', 'country', 'producer', 'style', 'theme')),
  name       text not null check (length(trim(name)) > 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists quiz_tags_kind_name on public.quiz_tags (kind, lower(name));

create table if not exists public.quiz_question_tags (
  question_id uuid not null references public.quiz_questions(id) on delete cascade,
  tag_id      uuid not null references public.quiz_tags(id) on delete cascade,
  tagged_by   uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (question_id, tag_id)
);
create index if not exists quiz_question_tags_tag on public.quiz_question_tags (tag_id);

alter table public.quiz_tags enable row level security;
alter table public.quiz_question_tags enable row level security;

drop policy if exists quiz_tags_read on public.quiz_tags;
drop policy if exists quiz_tags_write on public.quiz_tags;
drop policy if exists quiz_question_tags_read on public.quiz_question_tags;
drop policy if exists quiz_question_tags_write on public.quiz_question_tags;
create policy quiz_tags_read on public.quiz_tags for select using (true);
create policy quiz_tags_write on public.quiz_tags for all using (has_permission('settings_edit'::text)) with check (has_permission('settings_edit'::text));
create policy quiz_question_tags_read on public.quiz_question_tags for select using (true);
create policy quiz_question_tags_write on public.quiz_question_tags for all using (has_permission('quiz_verify'::text) or has_permission('settings_edit'::text)) with check (has_permission('quiz_verify'::text) or has_permission('settings_edit'::text));

-- The starting list, taken from what the catalog already knows. (The owner can add more later; these never change on their own.)
insert into public.quiz_tags (kind, name) select 'grape', g.name from grapes g on conflict do nothing;
insert into public.quiz_tags (kind, name) select 'country', a.name from geo_areas a where a.level::text = 'country' on conflict do nothing;
insert into public.quiz_tags (kind, name) select 'region', a.name from geo_areas a where a.level::text in ('region', 'appellation') on conflict do nothing;
insert into public.quiz_tags (kind, name) select 'producer', p.name from producers p on conflict do nothing;
insert into public.quiz_tags (kind, name) values ('style', 'Red'), ('style', 'White'), ('style', 'Sparkling'), ('style', 'Rosé'), ('style', 'Fortified') on conflict do nothing;

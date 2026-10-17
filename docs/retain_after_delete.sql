-- KEEP A PLAYER'S DATA ANONYMOUSLY AFTER THEY DELETE THEIR ACCOUNT. Run once in the Supabase SQL editor (New query, paste all, Run).
-- It is safe to run twice. Written from the check results on 2026-10-07. Read the notes at the bottom before relying on it.
--
-- What it does
--   * Every table that holds what a player gave us (journal, swipes, own wines, photo records, quiz answers, timed rounds, feedback, flags,
--     private wine changes) now KEEPS its rows when the account is deleted. The link to the account is emptied (user_id becomes null) and the
--     rows are tagged with a random retired_key (the same random key This or That uses), so one player's data still groups together.
--   * Deleted with the account: the profile (email and consent record), the sign-in, the palate summary and trophies (both are re-made from the journal).
--   * Photo files stay in private storage; their database rows are kept with the other data.
--   * Deleting a single journal entry or swipe still removes it (delete_my_journal_entry / delete_my_swipe are not touched).

-- 1. a place for the random key on each kept table
do $$
declare t text;
begin
  foreach t in array array['user_wines','encounters','consumptions','journal_photos','quiz_answers','quiz_archive_removals','timed_runs','content_flags','app_feedback','my_wine_info']
  loop
    execute format('alter table public.%I add column if not exists retired_key uuid', t);
    execute format('create index if not exists %I on public.%I (retired_key)', t || '_retired_key', t);
  end loop;
end $$;

-- 2. my_wine_info is keyed by the account, so give it its own row number and keep the old uniqueness as an ordinary unique index
do $$
declare pkname text; cols text;
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'my_wine_info' and column_name = 'id') then
    select c.conname, string_agg(quote_ident(a.attname), ', ' order by array_position(c.conkey, a.attnum)) into pkname, cols
      from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
      where c.conrelid = 'public.my_wine_info'::regclass and c.contype = 'p' group by c.conname;
    execute 'alter table public.my_wine_info add column id bigint generated always as identity';
    execute format('alter table public.my_wine_info drop constraint %I', pkname);
    execute 'alter table public.my_wine_info add primary key (id)';
    execute format('create unique index if not exists my_wine_info_natural_key on public.my_wine_info (%s)', cols);
  end if;
end $$;

-- 3. those tables may now have an empty user_id when the account is gone: the link says "set to empty" instead of "delete the rows"
do $$
declare r record;
begin
  for r in
    select c.conrelid::regclass as tbl, c.conname, a.attname as col
    from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.contype = 'f' and c.confrelid = 'auth.users'::regclass and c.connamespace = 'public'::regnamespace
      and a.attname = 'user_id'
      and c.conrelid::regclass::text in ('user_wines','encounters','consumptions','journal_photos','quiz_answers','quiz_archive_removals','timed_runs','content_flags','app_feedback','my_wine_info')
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    execute format('alter table %s add constraint %I foreign key (%I) references auth.users(id) on delete set null', r.tbl, r.conname, r.col);
    execute format('alter table %s alter column %I drop not null', r.tbl, r.col);
  end loop;
end $$;

-- 4. "Delete my account" now keeps the data anonymously
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path to 'public', 'private', 'extensions'
as $function$
declare
  uid uuid := auth.uid();
  k uuid;
begin
  if uid is null then raise exception 'Not signed in'; end if;

  -- the random key that stands in for this player from now on (made if they never played This or That)
  select player_key into k from this_or_that_players where user_id = uid;
  if k is null then
    insert into this_or_that_players (user_id) values (uid) returning player_key into k;
  end if;

  -- erased: things only useful with the account (the palate and trophies are re-made from the journal)
  delete from palate_state where user_id = uid;
  delete from trophy_awards where user_id = uid;
  delete from private.guest_merge_tokens where guest_id = uid;

  -- kept, with the link to the person cut and the random key added
  update user_wines            set retired_key = k, user_id = null where user_id = uid;
  update encounters            set retired_key = k, user_id = null where user_id = uid;
  update consumptions          set retired_key = k, user_id = null where user_id = uid;
  update journal_photos        set retired_key = k, user_id = null where user_id = uid;
  update quiz_answers          set retired_key = k, user_id = null where user_id = uid;
  update quiz_archive_removals set retired_key = k, user_id = null where user_id = uid;
  update timed_runs            set retired_key = k, user_id = null where user_id = uid;
  update content_flags         set retired_key = k, user_id = null where user_id = uid;
  update app_feedback          set retired_key = k, user_id = null where user_id = uid;
  update my_wine_info          set retired_key = k, user_id = null where user_id = uid;
  update this_or_that_answers  set user_id = null where user_id = uid;
  update this_or_that_players  set user_id = null where user_id = uid;

  -- An editor's name is cleared from the content they handled. The revision log is cleared last, because the updates above add log rows.
  update content_flags set resolved_by = null where resolved_by = uid;
  update quiz_questions set created_by = null where created_by = uid;
  update quiz_questions set verified_by = null where verified_by = uid;
  update wine_reference_values set verified_by = null where verified_by = uid;
  update field_provenance set verified_by = null where verified_by = uid;
  update wines set created_by = null where created_by = uid;
  update revisions set changed_by = null where changed_by = uid;

  -- The sign-in and the profile (email, consent record) go.
  delete from auth.users where id = uid;
end $function$;

-- Notes
--  * TEST FIRST with a throwaway guest account: add a swipe, a journal entry with a photo and a This or That answer, delete the account,
--    then check in the Table editor that the rows are still there with user_id empty and a retired_key filled in
--    (e.g.  select user_id, retired_key from consumptions order by created_at desc limit 5;).
--  * Anyone with database access can still see the kept rows and photos. They are filed under a random key, not under a name, but a journal,
--    free-text notes and photos can identify a person by their content (a face, a home, a name in a note). That is "pseudonymous", not guaranteed anonymous.
--  * Photo file paths in storage start with the old account id. After deletion that id matches no account.
--  * Photos the player had SHARED for the catalog are taken back by the app before the account is deleted (data.js deleteMyAccount).

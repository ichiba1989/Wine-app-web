-- READ-ONLY checks (they change nothing). Run each in the Supabase SQL editor and send back the results.
-- Needed before writing "delete hides instead of removing" for journal entries, swipes and photos.
select pg_get_functiondef('public.delete_my_journal_entry'::regproc);
select pg_get_functiondef('public.delete_my_swipe'::regproc);
select pg_get_functiondef('public.record_swipe'::regproc);
select viewname, definition from pg_views where schemaname = 'public' and viewname in ('v_journal_entries', 'v_user_wine_state') order by viewname;

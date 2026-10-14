-- REMOVES THE TECH SHEET from the database (docs/TECHSHEET_REMOVAL.md). Run the blocks in order in the Supabase SQL editor.
-- It touches only the objects docs/tech_sheet.sql created. Journals, swipes, wines, notes, photos and players are NOT touched.

-- STEP 0 (optional, read-only): look at what would be lost. Copy the result first if you want to keep the facts.
--   select 'wine_facts' as t, count(*) from wine_facts union all select 'candidates', count(*) from wine_fact_candidates
--   union all select 'sources', count(*) from fact_sources union all select 'player entries', count(*) from my_wine_facts;
--   select * from wine_facts order by subject_type, subject_key, fact_key;     -- the confirmed facts, to copy out before dropping

-- STEP 1: hide it first (instant, loses nothing). Do this alone if you only want it off for now.
update public.app_config set value = to_jsonb(0) where key = 'techsheet_enabled';

-- STEP 2: drop it for good.
drop function if exists public.techsheet_decide_suggestion(uuid, boolean);
drop function if exists public.techsheet_import(jsonb, jsonb);
drop function if exists public.techsheet_recheck_all();
drop function if exists public.techsheet_confirm_by_rule(text, text, text);
drop table if exists public.fact_source_suggestions;
drop function if exists public.techsheet_reject_candidate(uuid);
drop function if exists public.techsheet_approve_candidate(uuid);
drop function if exists public.techsheet_enter_fact(text, text, text, text, text, text, text);
drop function if exists public.techsheet_remove_source(uuid);
drop function if exists public.techsheet_set_source(text, text, text, text);
drop table if exists public.my_wine_facts;
drop table if exists public.wine_facts;
drop table if exists public.wine_fact_candidates;
drop table if exists public.fact_sources;
drop function if exists public.techsheet_visible();
drop function if exists public.techsheet_level();
delete from public.app_config where key in ('techsheet_enabled', 'techsheet_daily_limit', 'techsheet_batch_max');   -- (daily_limit is no longer used by the app)

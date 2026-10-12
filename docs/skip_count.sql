-- SKIP COUNT. Run once in the Supabase SQL editor (New query, paste all, Run), AFTER docs/reactions.sql. Safe to run twice.
--
-- What it does
--   * v_user_wine_state gets a new last column, skip_count: how many times the player has skipped each wine ("Skip" is stored as the answer dont_know).
--     The app shows a wine again, later in the deck, after the first skip, and stops showing it after the second.
--   * Nothing else changes. Hidden (deleted) swipes are left out of the count, so "Put back" in the Swipes tab starts a wine fresh.
-- Until it is run the app counts the skips it sees itself, so a wine skipped once in an earlier visit would come back again.

create or replace view public.v_user_wine_state with (security_invoker = true) as
 SELECT user_id,
    wine_vintage_id,
    (array_agg(familiarity ORDER BY created_at DESC, id DESC) FILTER (WHERE (familiarity IS NOT NULL)))[1] AS familiarity,
    (array_agg(interest ORDER BY created_at DESC, id DESC) FILTER (WHERE (interest IS NOT NULL)))[1] AS interest,
    min(created_at) FILTER (WHERE (event = 'swipe'::encounter_event)) AS first_swiped_at,
    max(created_at) FILTER (WHERE (event = 'swipe'::encounter_event)) AS last_swiped_at,
    (array_agg(reaction ORDER BY created_at DESC, id DESC) FILTER (WHERE (reaction IS NOT NULL)))[1] AS reaction,
    (count(*) FILTER (WHERE (reaction = 'dont_know')))::int AS skip_count
   FROM encounters
  WHERE deleted_at IS NULL
  GROUP BY user_id, wine_vintage_id;

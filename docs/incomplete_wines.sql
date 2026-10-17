-- INCOMPLETE WINES. Run once in the Supabase SQL editor (New query, paste all, Run). Safe to run twice.
--
-- What it does
--   * user_wines.producer may be empty. Until now every wine a player typed in needed a producer; now a player can save a wine with only a name (or only
--     what they know) and finish it later. Wines with a missing producer, vintage or type are "incomplete": the app keeps them in the player's own
--     journal and never offers them as catalog candidates, Bingo squares or community numbers until they are complete (isComplete in catalog.js).
--   * Nothing else changes. The check that decides what is complete lives in the app (one place), not in the database.
-- If you have a database view or function that lists catalog candidates, make it skip rows where producer is null or empty, the same way the app does.

alter table public.user_wines alter column producer drop not null;

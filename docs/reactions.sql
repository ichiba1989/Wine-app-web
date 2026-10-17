-- LIKE, DISLIKE, I DON'T KNOW IT. Run once in the Supabase SQL editor (New query, paste all, Run). Safe to run twice. Run it BEFORE people use the new deck:
-- until then, swiping in the new app shows "Could not save that swipe".
--
-- What it does
--   * encounters gets two columns: reaction (like | dislike | dont_know | had) and context (a small note of what the deck knew when the wine was shown).
--   * record_reaction saves one answer. It also fills in the old familiarity and interest columns the way the first version of the deck understood them
--     (like = recognize + try, dislike = recognize + nope, dont_know = unknown + try, had = had + try), so backup/deck-v1-three-answers can still read these rows.
--     "had" also adds the wine to the journal, as before.
--   * v_user_wine_state shows each wine's latest reaction.
--   * app_config gets the numbers the owner can tune on the Owner page, Config tab (provisional, see reactions.js).
-- Older swipes are left exactly as they are.

alter table public.encounters add column if not exists reaction text;
alter table public.encounters add column if not exists context jsonb;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'encounters_reaction_check') then
    alter table public.encounters add constraint encounters_reaction_check check (reaction is null or reaction in ('like', 'dislike', 'dont_know', 'had'));
  end if;
end $$;

create or replace function public.record_reaction(p_wine_vintage_id uuid, p_reaction text, p_context jsonb default null)
returns void language plpgsql set search_path to 'public'
as $function$
declare v_fam familiarity_kind; v_int interest_kind;
begin
  if p_reaction is null or p_reaction not in ('like', 'dislike', 'dont_know', 'had') then
    raise exception 'Unknown answer: %', p_reaction;
  end if;
  v_fam := (case p_reaction when 'dont_know' then 'unknown' when 'had' then 'had' else 'recognize' end)::familiarity_kind;
  v_int := (case when p_reaction = 'dislike' then 'nope' else 'try' end)::interest_kind;
  insert into encounters (user_id, wine_vintage_id, event, familiarity, interest, reaction, context)
  values (auth.uid(), p_wine_vintage_id, 'swipe', v_fam, v_int, p_reaction, p_context);
  if p_reaction = 'had' and not exists (
    select 1 from consumptions where user_id = auth.uid() and wine_vintage_id = p_wine_vintage_id and deleted_at is null
  ) then
    insert into consumptions (user_id, wine_vintage_id, origin) values (auth.uid(), p_wine_vintage_id, 'swipe_up');
  end if;
end $function$;
grant execute on function public.record_reaction(uuid, text, jsonb) to authenticated;

create or replace view public.v_user_wine_state with (security_invoker = true) as
 SELECT user_id,
    wine_vintage_id,
    (array_agg(familiarity ORDER BY created_at DESC, id DESC) FILTER (WHERE (familiarity IS NOT NULL)))[1] AS familiarity,
    (array_agg(interest ORDER BY created_at DESC, id DESC) FILTER (WHERE (interest IS NOT NULL)))[1] AS interest,
    min(created_at) FILTER (WHERE (event = 'swipe'::encounter_event)) AS first_swiped_at,
    max(created_at) FILTER (WHERE (event = 'swipe'::encounter_event)) AS last_swiped_at,
    (array_agg(reaction ORDER BY created_at DESC, id DESC) FILTER (WHERE (reaction IS NOT NULL)))[1] AS reaction
   FROM encounters
  WHERE deleted_at IS NULL
  GROUP BY user_id, wine_vintage_id;

insert into app_config (key, value, note)
select v.key, v.value, v.note from (values
  ('swipe_like_weight',       to_jsonb(0.5),  'How much a swipe-right Like counts toward the taste profile (a rated "would buy again" counts 2). Provisional.'),
  ('swipe_dislike_weight',    to_jsonb(-0.5), 'How much a swipe-left Dislike counts against (a rated "do not like" counts -2). Provisional.'),
  ('unknown_demote_strength', to_jsonb(0.6),  'How far down the deck wines like the ones the player did not know are pushed (0 = not at all)'),
  ('unknown_teach_every',     to_jsonb(8),    'About one wine like the ones the player did not know is still shown every this many cards, so they can learn')
) as v(key, value, note)
where not exists (select 1 from app_config c where c.key = v.key);

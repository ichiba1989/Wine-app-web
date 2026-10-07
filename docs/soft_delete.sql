-- DELETING IN THE APP ONLY HIDES THINGS. Run once in the Supabase SQL editor (New query, paste all, Run). Safe to run twice.
-- Written from the function and view texts sent on 2026-10-07. Run it soon after the matching app version loads: until then,
-- deleting an entry or swipe still removes it the old way (and the old anonymous-rating copy is made as before).
--
-- What changes
--   * consumptions (journal entries), encounters (swipes) and journal_photos get a deleted_at column. "Delete" in the app fills it in; nothing is removed,
--     and the photo files stay in storage.
--   * The two views the app reads (v_journal_entries, v_user_wine_state) skip hidden rows, so the player no longer sees them.
--   * record_swipe ignores a hidden journal entry, so swiping "had it" again after a delete makes a fresh entry.
--   * A new delete_my_photo function hides one photo.
--   * The old private.retained_* anonymous copies are no longer written (the full row now stays), but the tables and their rows are left alone.

-- 1. the column
alter table public.consumptions   add column if not exists deleted_at timestamptz;
alter table public.encounters     add column if not exists deleted_at timestamptz;
alter table public.journal_photos add column if not exists deleted_at timestamptz;

-- 2. any "only one of these" rule (unique index or constraint) must ignore hidden rows, or a player could not add the same wine again after deleting it.
--    Each one is rebuilt as a partial unique index that only looks at rows that are not hidden.
do $$
declare r record; def text;
begin
  for r in
    select i.indexrelid::regclass::text as idx, i.indrelid::regclass::text as tbl, c.conname, pg_get_indexdef(i.indexrelid) as indexdef, i.indpred is not null as has_where
    from pg_index i left join pg_constraint c on c.conindid = i.indexrelid and c.contype = 'u'
    where i.indisunique and not i.indisprimary and i.indrelid in ('public.consumptions'::regclass, 'public.encounters'::regclass, 'public.journal_photos'::regclass)
  loop
    continue when r.has_where;
    def := r.indexdef || ' where deleted_at is null';
    if r.conname is not null then execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    else execute format('drop index %s', r.idx); end if;
    execute def;
  end loop;
end $$;

-- 3. delete = hide
create or replace function public.delete_my_journal_entry(p_consumption_id uuid)
returns void language plpgsql security definer set search_path to 'public', 'private', 'extensions'
as $function$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not signed in'; end if;
  update consumptions set deleted_at = now() where id = p_consumption_id and user_id = uid and deleted_at is null;
  if not found then raise exception 'Entry not found'; end if;
  update journal_photos set deleted_at = now() where consumption_id = p_consumption_id and deleted_at is null;
end $function$;

create or replace function public.delete_my_swipe(p_wine_vintage_id uuid)
returns void language plpgsql security definer set search_path to 'public', 'private', 'extensions'
as $function$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not signed in'; end if;
  update encounters set deleted_at = now() where user_id = uid and wine_vintage_id = p_wine_vintage_id and deleted_at is null;
  if not found then raise exception 'Swipe not found'; end if;
end $function$;

create or replace function public.delete_my_photo(p_photo_id uuid)
returns void language plpgsql security definer set search_path to 'public', 'private', 'extensions'
as $function$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not signed in'; end if;
  update journal_photos set deleted_at = now() where id = p_photo_id and user_id = uid and deleted_at is null;
  if not found then raise exception 'Photo not found'; end if;
end $function$;

-- 4. a "had it" swipe makes a journal entry unless there is already a visible one
create or replace function public.record_swipe(p_wine_vintage_id uuid, p_familiarity familiarity_kind, p_interest interest_kind)
returns void language plpgsql set search_path to 'public'
as $function$
begin
  insert into encounters (user_id, wine_vintage_id, event, familiarity, interest)
  values (auth.uid(), p_wine_vintage_id, 'swipe', p_familiarity, p_interest);

  if p_familiarity = 'had' and not exists (
    select 1 from consumptions where user_id = auth.uid() and wine_vintage_id = p_wine_vintage_id and deleted_at is null
  ) then
    insert into consumptions (user_id, wine_vintage_id, origin)
    values (auth.uid(), p_wine_vintage_id, 'swipe_up');
  end if;
end $function$;

-- 5. the two views the app reads skip hidden rows
create or replace view public.v_journal_entries as
 SELECT c."id",
    c.user_id,
    c.consumed_on,
    c.verdict,
    c.origin,
    c."food",
    c.occasion,
    c.notes,
    c.purchase_price_cents,
    c.wine_vintage_id,
    c.user_wine_id,
    (c.user_wine_id IS NOT NULL) AS is_outside_wine,
    COALESCE(p."name", uw.producer) AS producer,
    COALESCE(w."name", uw.wine_name) AS wine_name,
    COALESCE(wv.vintage_year, uw.vintage_year) AS vintage_year,
    COALESCE(wv.is_non_vintage, uw.is_non_vintage) AS is_non_vintage,
    COALESCE(c.style_override, w."style", uw."style") AS style,
    ( SELECT geo_areas."name"
           FROM geo_areas
          WHERE (geo_areas."id" = geo_ancestor(w.appellation_id, 'country'::geo_level))) AS country,
    COALESCE(( SELECT geo_areas."name"
           FROM geo_areas
          WHERE (geo_areas."id" = geo_ancestor(w.appellation_id, 'region'::geo_level))), uw.region_text) AS region,
    COALESCE(( SELECT g."name"
           FROM (wine_grapes wg
             JOIN grapes g ON ((g."id" = wg.grape_id)))
          WHERE (wg.wine_id = w."id")
          ORDER BY g."name"
         LIMIT 1), uw.grape_text) AS grape,
    ( SELECT jp.storage_path
           FROM journal_photos jp
          WHERE (jp.consumption_id = c."id") AND jp.deleted_at IS NULL
          ORDER BY jp.created_at
         LIMIT 1) AS first_photo_path,
    c.created_at,
    COALESCE(w."style", uw."style") AS catalog_style
   FROM ((((consumptions c
     LEFT JOIN wine_vintages wv ON ((wv."id" = c.wine_vintage_id)))
     LEFT JOIN wines w ON ((w."id" = wv.wine_id)))
     LEFT JOIN producers p ON ((p."id" = w.producer_id)))
     LEFT JOIN user_wines uw ON ((uw."id" = c.user_wine_id)))
  WHERE c.deleted_at IS NULL;

create or replace view public.v_user_wine_state as
 SELECT user_id,
    wine_vintage_id,
    (array_agg(familiarity ORDER BY created_at DESC, id DESC) FILTER (WHERE (familiarity IS NOT NULL)))[1] AS familiarity,
    (array_agg(interest ORDER BY created_at DESC, id DESC) FILTER (WHERE (interest IS NOT NULL)))[1] AS interest,
    min(created_at) FILTER (WHERE (event = 'swipe'::encounter_event)) AS first_swiped_at,
    max(created_at) FILTER (WHERE (event = 'swipe'::encounter_event)) AS last_swiped_at
   FROM encounters
  WHERE deleted_at IS NULL
  GROUP BY user_id, wine_vintage_id;

-- Notes
--  * TEST with a throwaway guest: add a swipe and a journal entry with a photo, delete both in the app, confirm they vanish from the app, then in the Table editor
--    confirm the rows are still there with deleted_at filled in and the photo file is still in the journal-photos bucket. Then swipe the same wine again.
--  * Other database objects that read consumptions or encounters directly (for example the community price and "who has had it" views) still count hidden rows.
--    That matches the rule that nothing is removed; if you want hidden rows left out of those counts, send me their definitions.
--  * If step 2 changed an index you rely on, it is now partial (ignores hidden rows); the app does not use "on conflict" on these tables, so nothing else is affected.

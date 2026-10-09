-- BIGGER IMPORTS FOR THE "pro" TIER. Run once in the Supabase SQL editor (New query, paste, Run). Safe to run twice.
-- Everyone can import up to 100 wines per file. Editors and the owner get 500 automatically (anyone with staff access). People on a tier listed in the
-- feature switch below also get 500. This adds the switch "importLarge" for the tier "pro". (Add more tiers to the list later, for example 'professional'.)
do $$
declare udt text;
begin
  if exists (select 1 from feature_access where feature = 'importLarge') then
    raise notice 'importLarge is already there; nothing changed';
    return;
  end if;
  select c.udt_name into udt from information_schema.columns c where c.table_schema = 'public' and c.table_name = 'feature_access' and c.column_name = 'tiers';
  if udt = 'jsonb' then
    execute $q$insert into feature_access (feature, all_tiers, tiers) values ('importLarge', false, '["pro"]'::jsonb)$q$;
  elsif udt = 'json' then
    execute $q$insert into feature_access (feature, all_tiers, tiers) values ('importLarge', false, '["pro"]'::json)$q$;
  else
    execute $q$insert into feature_access (feature, all_tiers, tiers) values ('importLarge', false, array['pro'])$q$;
  end if;
end $$;

-- To put someone on the pro tier (their account ID is on their Profile, Overview page):
--   update profiles set tier = 'pro' where id = 'THEIR-ACCOUNT-ID';
-- If that is refused ("violates check constraint" or "invalid input value for enum"), the tier column only allows certain words. Run these two checks and send the results:
--   select data_type, udt_name from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'tier';
--   select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.profiles'::regclass and contype = 'c';
-- To take it away again:  update profiles set tier = 'default' where id = 'THEIR-ACCOUNT-ID';

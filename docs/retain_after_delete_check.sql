-- READ-ONLY checks (they change nothing). Run each in the Supabase SQL editor and send back the results.
-- Needed before writing the change that keeps journal entries and photos anonymously after an account is deleted.

-- A. every table in the app that points at an account, and what happens to its rows when the account is deleted
select c.conrelid::regclass as table_name, a.attname as column_name,
       case c.confdeltype when 'c' then 'delete the rows' when 'n' then 'set to empty' when 'a' then 'block' when 'r' then 'block' else c.confdeltype::text end as on_account_delete,
       a.attnotnull as column_required,
       exists (select 1 from pg_index i where i.indrelid = c.conrelid and i.indisprimary and a.attnum = any (i.indkey)) as part_of_primary_key
from pg_constraint c
join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
where c.contype = 'f' and c.confrelid = 'auth.users'::regclass and c.connamespace = 'public'::regnamespace
order by 1, 2;

-- B. exactly what "Delete my account" does today
select pg_get_functiondef('public.delete_my_account'::regproc);

-- C. the photo storage buckets and whether they are public
select id, public from storage.buckets order by id;

-- ROLLBACK of anon_hardening_up.sql (release 2, 2026-11-08). Tested on a disposable local Supabase stack.
-- Puts back exactly the grants anon_hardening_up.sql saved in private.anon_hardening_backup before its first run (same objects, same
-- grantees), including the default privileges for future tables and sequences, then removes the backup table, and the private schema
-- too if the hardening created it and it is now empty. The private schema's own privileges were never changed, so nothing to restore
-- there. Grants only: no row of data is touched. Objects removed since then are passed over. Stops, changing nothing, if there is no backup.

begin;

do $$
begin
  -- two separate tests: PostgreSQL plans a whole condition at once, so the table must be known to exist before it is read
  if to_regclass('private.anon_hardening_backup') is null then
    raise exception 'Nothing to roll back: private.anon_hardening_backup is missing (anon_hardening_up.sql was not applied)';
  end if;
  if not exists (select 1 from private.anon_hardening_backup) then
    raise exception 'Nothing to roll back: private.anon_hardening_backup is empty';
  end if;
end $$;

do $$
declare r record; v17 boolean := current_setting('server_version_num')::int >= 170000;
        b_privs text := case when current_setting('server_version_num')::int >= 170000 then 'truncate, references, trigger, maintain' else 'truncate, references, trigger' end;
        who text; v_with text;
begin
  -- A: profiles. Clear what the three grantees hold now, then grant back what they held before (table, then columns).
  if to_regclass('public.profiles') is not null and exists (select 1 from private.anon_hardening_backup where part = 'A') then
    revoke all on table public.profiles from anon, authenticated, public;
    for r in select * from private.anon_hardening_backup where part = 'A' and privilege is not null order by object_kind desc, id loop
      who := case when r.grantee = 'PUBLIC' then 'public' else quote_ident(r.grantee) end;
      v_with := case when r.grantable then ' with grant option' else '' end;
      if r.object_kind = 'table' then
        execute format('grant %s on table public.profiles to %s%s', r.privilege, who, v_with);
      elsif exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = r.column_name) then
        execute format('grant %s (%I) on table public.profiles to %s%s', r.privilege, r.column_name, who, v_with);
      end if;
    end loop;
  end if;

  -- B: TRUNCATE, REFERENCES, TRIGGER, MAINTAIN of anon and authenticated on the other tables and views.
  for r in select distinct object_name from private.anon_hardening_backup where part = 'B' loop
    if to_regclass(r.object_name) is not null then execute format('revoke %s on table %s from anon, authenticated', b_privs, r.object_name); end if;
  end loop;
  for r in select * from private.anon_hardening_backup where part = 'B' and privilege is not null loop
    if to_regclass(r.object_name) is not null and (r.privilege <> 'MAINTAIN' or v17) then
      execute format('grant %s on table %s to %I%s', r.privilege, r.object_name, r.grantee, case when r.grantable then ' with grant option' else '' end);
    end if;
  end loop;

  -- F: sequences.
  for r in select distinct object_name from private.anon_hardening_backup where part = 'F' loop
    if to_regclass(r.object_name) is not null then
      execute format('revoke usage, select, update on sequence %s from anon', r.object_name);
      execute format('revoke update on sequence %s from authenticated', r.object_name);
    end if;
  end loop;
  for r in select * from private.anon_hardening_backup where part = 'F' and privilege is not null loop
    if to_regclass(r.object_name) is not null then
      execute format('grant %s on sequence %s to %I%s', r.privilege, r.object_name, r.grantee, case when r.grantable then ' with grant option' else '' end);
    end if;
  end loop;

  -- C: EXECUTE on the signed-in-only functions.
  for r in select distinct object_name from private.anon_hardening_backup where part = 'C' loop
    if to_regprocedure(r.object_name) is not null then execute format('revoke execute on function %s from anon, authenticated, public', r.object_name); end if;
  end loop;
  for r in select * from private.anon_hardening_backup where part = 'C' and privilege is not null loop
    if to_regprocedure(r.object_name) is not null then
      execute format('grant execute on function %s to %s%s', r.object_name, case when r.grantee = 'PUBLIC' then 'public' else quote_ident(r.grantee) end,
                     case when r.grantable then ' with grant option' else '' end);
    end if;
  end loop;

  -- D: default privileges of postgres and supabase_admin for future tables and sequences in public. A role whose defaults the SQL editor
  -- may not change was not changed by the hardening either, so its rows are passed over.
  for r in select * from private.anon_hardening_backup where part = 'D' and privilege is not null loop
    begin
      execute format('alter default privileges for role %I in schema public grant %s on %s to %I', split_part(r.object_name, ':', 1), r.privilege,
                     case when split_part(r.object_name, ':', 2) = 'S' then 'sequences' else 'tables' end, r.grantee);
    exception when insufficient_privilege then
      raise notice 'Default privileges of % not restored (not allowed from this role; they were not changed by the hardening either)', split_part(r.object_name, ':', 1);
    end;
  end loop;
end $$;

-- The backup goes; the private schema too, if the hardening created it and nothing else is in it now.
do $$
declare v_created boolean := exists (select 1 from private.anon_hardening_backup where part = 'E');
begin
  drop table private.anon_hardening_backup;
  if v_created and not exists (select 1 from pg_class c where c.relnamespace = 'private'::regnamespace)
     and not exists (select 1 from pg_proc p where p.pronamespace = 'private'::regnamespace) then
    drop schema private;
  end if;
end $$;

commit;

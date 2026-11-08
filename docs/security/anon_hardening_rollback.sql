-- ROLLBACK of anon_hardening_up.sql (Phase 2.0B.6, 2026-11-01). PROPOSAL; tested on a disposable local Supabase stack only.
-- Puts back exactly the grants that anon_hardening_up.sql saved in private.anon_hardening_backup before its first run, for the same
-- objects and the same three grantees (anon, authenticated, PUBLIC), then removes the backup table. Grants only: no row of data is
-- touched. Objects removed since then are passed over. Tables created after the hardening keep the grants they got (the default
-- privileges are restored too, so tables created later get anon's old grants again). Stops, changing nothing, if there is no backup.

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
declare r record; v_with text;
begin
  -- A: profiles. Clear what the three grantees hold now, then grant back what they held before (table, then columns).
  if to_regclass('public.profiles') is not null and exists (select 1 from private.anon_hardening_backup where part = 'A') then
    revoke all on table public.profiles from anon, authenticated, public;
    for r in select * from private.anon_hardening_backup where part = 'A' and privilege is not null order by object_kind desc, id loop
      v_with := case when r.grantable then ' with grant option' else '' end;
      if r.object_kind = 'table' then
        execute format('grant %s on table public.profiles to %s%s', r.privilege, case when r.grantee = 'PUBLIC' then 'public' else quote_ident(r.grantee) end, v_with);
      elsif r.object_kind = 'column' and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = r.column_name) then
        execute format('grant %s (%I) on table public.profiles to %s%s', r.privilege, r.column_name, case when r.grantee = 'PUBLIC' then 'public' else quote_ident(r.grantee) end, v_with);
      end if;
    end loop;
  end if;

  -- B: anon's TRUNCATE, REFERENCES, TRIGGER on the other public tables and views.
  for r in select distinct object_name from private.anon_hardening_backup where part = 'B' loop
    if to_regclass(r.object_name) is not null then
      execute format('revoke %s on table %s from anon',
                     case when current_setting('server_version_num')::int >= 170000 then 'truncate, references, trigger, maintain' else 'truncate, references, trigger' end, r.object_name);
    end if;
  end loop;
  for r in select * from private.anon_hardening_backup where part = 'B' and privilege is not null loop
    if to_regclass(r.object_name) is not null then
      execute format('grant %s on table %s to anon%s', r.privilege, r.object_name, case when r.grantable then ' with grant option' else '' end);
    end if;
  end loop;

  -- C: EXECUTE on the signed-in-only functions.
  for r in select distinct object_name from private.anon_hardening_backup where part = 'C' loop
    if to_regprocedure(r.object_name) is not null then
      execute format('revoke execute on function %s from anon, authenticated, public', r.object_name);
    end if;
  end loop;
  for r in select * from private.anon_hardening_backup where part = 'C' and privilege is not null loop
    if to_regprocedure(r.object_name) is not null then
      execute format('grant execute on function %s to %s%s', r.object_name, case when r.grantee = 'PUBLIC' then 'public' else quote_ident(r.grantee) end,
                     case when r.grantable then ' with grant option' else '' end);
    end if;
  end loop;

  -- D: the default privileges role postgres gives anon on new tables in public.
  for r in select * from private.anon_hardening_backup where part = 'D' and privilege is not null loop
    execute format('alter default privileges for role postgres in schema public grant %s on tables to anon', r.privilege);
  end loop;
end $$;

drop table private.anon_hardening_backup;   -- the private schema itself is left (it existed on the live database before)

commit;

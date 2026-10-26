-- Read-only: prints the wine_reference schema as Markdown (tables, their descriptions, columns, keys and constraints, indexes, triggers).
-- Used by run_local_tests.sh (DICT=path) to regenerate DATA_DICTIONARY.md from a tested install, so the dictionary always matches the SQL.
with t as (
  select c.oid, c.relname, obj_description(c.oid, 'pg_class') as descr,
         row_number() over (order by c.relname) as n
    from pg_class c join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'wine_reference' and c.relkind = 'r'
),
lines as (
  select t.relname as k, 0 as part, 0 as ord, '## `' || t.relname || '`' || E'\n\n' || coalesce(t.descr, '') || E'\n\n| Column | Type | Null | Default |\n|---|---|---|---|' as line from t
  union all
  select t.relname, 1, a.attnum, '| `' || a.attname || '` | ' || format_type(a.atttypid, a.atttypmod) || ' | ' ||
         case when a.attnotnull then 'not null' else 'null' end || ' | ' ||
         coalesce('`' || replace(pg_get_expr(d.adbin, d.adrelid), '|', '\|') || '`', case when a.attidentity <> '' then 'identity' else '' end) || ' |'
    from t join pg_attribute a on a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  union all
  select t.relname, 2, 0, E'\n**Keys and rules**\n' from t
  union all
  select t.relname, 3, row_number() over (partition by t.relname order by con.contype, con.conname),
         '- ' || case con.contype when 'p' then 'Primary key' when 'f' then 'Foreign key' when 'u' then 'Unique' when 'c' then 'Check' else con.contype::text end ||
         ' `' || con.conname || '`: `' || replace(pg_get_constraintdef(con.oid, true), '|', '\|') || '`'
    from t join pg_constraint con on con.conrelid = t.oid
  union all
  select t.relname, 4, row_number() over (partition by t.relname order by ic.relname),
         '- Index `' || ic.relname || '`: `' || replace(regexp_replace(pg_get_indexdef(i.indexrelid), '^.* USING ', 'USING '), '|', '\|') || '`'
    from t join pg_index i on i.indrelid = t.oid join pg_class ic on ic.oid = i.indexrelid
   where not i.indisprimary and not exists (select 1 from pg_constraint c2 where c2.conindid = i.indexrelid)
  union all
  select t.relname, 5, row_number() over (partition by t.relname order by tg.tgname),
         '- Trigger `' || tg.tgname || '` runs `' || tg.tgfoid::regproc::text || '`'
    from t join pg_trigger tg on tg.tgrelid = t.oid and not tg.tgisinternal
  union all
  select t.relname, 9, 0, '' from t
)
select line from lines order by k, part, ord;

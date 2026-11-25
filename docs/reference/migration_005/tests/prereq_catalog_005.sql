-- STAGING ONLY (disposable LOCAL Supabase stack). NEVER RUN ON PRODUCTION. Migration 005 tests, 2026-11-13.
-- One more SYNTHETIC row in the stand-in appellation_grape_rules (migration_004/tests/prereq_catalog_004.sql): a rule no code line names,
-- with a web address as its source (a "table only" candidate).
insert into public.appellation_grape_rules (place, variety, role, source_text)
select '71000000-0000-0000-0000-000000000002', g.id, 'sole', 'https://example.org/standin-valley-rules' from public.grapes g where g.name = 'Stand-in Noir'
 and not exists (select 1 from public.appellation_grape_rules r where r.place = '71000000-0000-0000-0000-000000000002');

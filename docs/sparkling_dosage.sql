-- HOW SWEET A SPARKLING WINE IS, AS ITS LABEL SAYS (owner, 2026-10-17; all versions). Run once in the Supabase SQL editor (New query, paste all,
-- Run). Safe to run again. Then run docs/sparkling_dosage_fill.sql, which fills it in for the sparkling wines already in the catalog.
--
-- Sparkling wines carry one of these terms on the label (EU rules for sparkling wine, Regulation (EU) 2019/33, Annex III part B; the app's list is
-- logic.js DOSAGES): Brut Nature, Extra Brut, Brut, Extra Dry, Sec, Demi-Sec, Doux. It is kept in its own field on the wine, not in the wine's name.
--   dosage         the term (one of the ids below), or empty
--   dosage_basis   where it came from: 'label' (written in the wine's name or the shop's title), 'source' (a page that states it, see
--                  dosage_source) or 'editor' (picked by an editor in Edit wine info)
--   dosage_source  the address of that page, for 'source'
-- Editors already may change wines (the same rules as the other wine columns), so nothing else is needed.

alter table public.wines add column if not exists dosage text;
alter table public.wines add column if not exists dosage_basis text;
alter table public.wines add column if not exists dosage_source text;

alter table public.wines drop constraint if exists wines_dosage_check;
alter table public.wines add constraint wines_dosage_check
  check (dosage is null or dosage in ('brut_nature', 'extra_brut', 'brut', 'extra_dry', 'sec', 'demi_sec', 'doux'));
alter table public.wines drop constraint if exists wines_dosage_basis_check;
alter table public.wines add constraint wines_dosage_basis_check
  check (dosage_basis is null or dosage_basis in ('label', 'source', 'editor'));

-- Players read the term with the wine (the app reads it beside the catalog view; data.js loadDosages).
grant select (dosage, dosage_basis, dosage_source) on public.wines to anon, authenticated;
grant update (dosage, dosage_basis, dosage_source) on public.wines to authenticated;   -- row-level security still decides who (editors)

-- Check: the three columns are there.
select column_name from information_schema.columns where table_schema = 'public' and table_name = 'wines' and column_name like 'dosage%' order by 1;

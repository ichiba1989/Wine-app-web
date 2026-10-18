// Writes docs/rank_appellations.sql from rankaoc.js (the "Grand Cru" appellations that lie on the same land as a wider one), for the owner to run
// by hand in the Supabase SQL editor. Run:  node docs/rank_appellations.mjs   (reads the public place and wine lists with the public key in config.js).
// The SQL (1) keeps the list itself in the database (rank_appellations), (2) creates the appellations our wines need, with the official name and
// AOC, under the same parent as the wider appellation, and (3) moves the wines:
//   by the label's words, worked out in the database itself so wines waiting for review are fixed too: a wine at Saint-Émilion, Chablis or Banyuls
//   whose name holds "Grand Cru"; a wine at Alsace whose name holds "Grand Cru" and a grand cru's name;
//   by a cited source, for a wine whose stored name does not say it (SOURCED below; each line keeps its page).
// Every move is logged in rank_appellation_moves with the place it came from; the undo is at the end of the file, commented out. Names are not changed.
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { RANK_APPELLATIONS, RANK_SOURCE } from "../rankaoc.js";
import { matchKey } from "../text.js";
import { SUPABASE_URL, SUPABASE_KEY } from "../config.js";

// Wines whose stored name does not carry the words, moved only on a page that states the appellation (looked up 2026-10-18).
const CLASSEMENT = "https://www.inao.gouv.fr/en/saint-emilion-grand-cru-classement-next-decade";
const CLASSED = "In the 2022 Saint-Émilion classification (approved by INAO on 8 September 2022), which is open only to wines of the AOC Saint-Émilion Grand Cru";
export const SOURCED = [
  { producer: "Château Beau-Séjour Bécot", name: "", within: "St.-Émilion", appellation: "Saint-Émilion Grand Cru", source: CLASSEMENT, note: `${CLASSED}: Premier Grand Cru Classé B.` },
  { producer: "Chateau Pavie", name: "", within: "St.-Émilion", appellation: "Saint-Émilion Grand Cru", source: CLASSEMENT, note: `${CLASSED}: Premier Grand Cru Classé A.` },
  { producer: "Chateau Beausejour", name: "Heritiers Duffau Lagarrosse", within: "St.-Émilion", appellation: "Saint-Émilion Grand Cru", source: CLASSEMENT, note: `${CLASSED}: Château Beauséjour (Héritiers Duffau-Lagarrosse), Premier Grand Cru Classé B.` },
  { producer: "Chateau Pavie", name: "Aromes de Pavie", within: "St.-Émilion", appellation: "Saint-Émilion Grand Cru", source: "https://www.ventealapropriete.com/en/vente/ficheproduitprint/PR21453", note: "The second wine of Château Pavie, sold as \"Arômes de Pavie - Saint-Emilion Grand Cru\"." },
  { producer: "Domaine Valentin Zusslin", name: "Pfingstberg", within: "Alsace", appellation: "Alsace Grand Cru Pfingstberg", source: "https://www.jancisrobinson.com/tastings/234269", note: "Reviewed as \"Valentin Zusslin, Pfingstberg Riesling 2017, Alsace Grand Cru\"; Decanter lists it as Riesling Grand Cru Pfingstberg." },
  { producer: "Domaine Weinbach", name: "Mambourg La Butte du Calvaire", within: "Alsace", appellation: "Alsace Grand Cru Mambourg", source: "https://www.internationalfinewines.com.au/products/weinbach-alsace-grand-cru-mambourg-la-butte-du-calvaire-riesling-2023-1500ml", note: "Sold as \"Weinbach Alsace Grand Cru Mambourg La Butte du Calvaire Riesling\"; a Riesling parcel in the Mambourg grand cru." },
];
// Looked at and left for an editor (no page found that states the appellation).
const LEFT = ["Domaine Valentin Zusslin, \"Pfingstberg Vendages Tardive Hommage a JMZX\" (Alsace): a late-harvest wine from the Pfingstberg; not found labelled Grand Cru."];

async function all(path) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Range: `${from}-${from + 999}` } });
    if (!r.ok) throw new Error(`${path}: ${r.status}`);
    const j = await r.json(); rows.push(...j); if (j.length < 1000) break;
  }
  return rows;
}
const [areas, wines] = await Promise.all([all("geo_areas?select=id,name,level,parent_id"), all("wines?select=id,name,appellation_id,producers(name)")]);
const byId = new Map(areas.map((g) => [g.id, g]));
const countryOf = (g) => { for (let x = g, i = 0; x && i < 6; x = byId.get(x.parent_id), i++) if (x.level === "country") return x.name; return ""; };
const appArea = (name) => areas.find((g) => g.level === "appellation" && matchKey(g.name) === matchKey(name) && countryOf(g) === "France") || null;
const q = (s) => (s == null || s === "" ? "null" : `'${String(s).replace(/'/g, "''")}'`);
// A Postgres pattern for a name, whole words, accents optional, a hyphen read as a hyphen or a space ("Kirchberg de Ribeauvillé", "Wineck-Schlossberg").
const ACC = { a: "aàâä", e: "eéèêë", i: "iîï", o: "oôö", u: "uùûü", c: "cç" };
const pattern = (s) => "\\m" + [...s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()].map((ch) => (ACC[ch] ? `[${ACC[ch]}]` : ch === "-" || ch === " " ? "[- ]+" : /[a-z0-9]/.test(ch) ? ch : `\\${ch}`)).join("") + "\\M";

// The rules, one line per wider appellation we have and narrower appellation it holds.
const rules = [], missingWithin = new Set();
for (const r of RANK_APPELLATIONS) {
  const w = appArea(r.within);
  if (!w) { missingWithin.add(r.within); continue; }
  rules.push(`  (${q(w.id)}::uuid, ${q(w.parent_id)}::uuid, ${q(r.appellation)}, ${r.vineyard ? q(pattern(r.vineyard)) : "null"}, ${r.vineyard.length})`);
}
const sourced = [], notFound = [];
for (const s of SOURCED) {
  const w = appArea(s.within);
  const wine = w && wines.find((x) => x.appellation_id === w.id && matchKey(x.producers && x.producers.name) === matchKey(s.producer) && matchKey(x.name || "") === matchKey(s.name));
  if (!wine) { notFound.push(`${s.producer} ${s.name}`.trim()); continue; }
  sourced.push(`  (${q(wine.id)}::uuid, ${q(w.id)}::uuid, ${q(w.parent_id)}::uuid, ${q(s.appellation)}, ${q(s.source)}, ${q(s.note)})`);
}
const seed = RANK_APPELLATIONS.map((r) => `  (${q(r.appellation)}, ${q(r.within)}, ${q(r.country)}, ${q(r.inao)}, ${q(r.words)}, ${q(r.vineyard)}, ${q(r.source)}, ${q(r.read)}::date)`);

const sql = `-- "GRAND CRU" APPELLATIONS ON THE SAME LAND AS A WIDER ONE (owner, 2026-10-18; all versions). GENERATED by docs/rank_appellations.mjs on ${new Date().toISOString().slice(0, 10)}
-- from rankaoc.js: do not edit by hand. Run once in the Supabase SQL editor (New query, paste all, Run). Safe to run again.
-- Saint-Émilion Grand Cru, Chablis Grand Cru, Banyuls Grand Cru and each Alsace grand cru are AOCs of their own in INAO's list (${RANK_SOURCE}),
-- on the same ground as Saint-Émilion, Chablis, Banyuls and Alsace. Wines whose label names one were filed under the wider appellation with
-- "Grand Cru" left in the name, so the card said "St.-Émilion AOC" for Château Beau-Séjour Bécot. This script:
--   1. keeps the list in public.rank_appellations (readable by everyone; the app uses the same list from rankaoc.js);
--   2. creates the appellations our wines need, with AOC as designation, under the same parent as the wider appellation (an existing one is reused);
--   3. moves wines (all of them, also those waiting for review) by the label's words, and the few listed below by a cited source;
--   4. logs every move in public.rank_appellation_moves. Wine names are not changed; the app shows "Saint-Émilion Grand Cru", "Chablis Grand Cru Les Clos".
${missingWithin.size ? `-- Wider appellations not in our place list (their lines are skipped): ${[...missingWithin].join(", ")}.\n` : ""}${notFound.length ? `-- Sourced lines whose wine was not found: ${notFound.join("; ")}.\n` : ""}-- Left for an editor: ${LEFT.join(" ")}
-- Afterwards: the Atlas shows INAO's outline for the new places; Chablis Grand Cru's grape rule (Chardonnay only) shows on the card already.

begin;

create table if not exists public.rank_appellations (
  appellation text primary key, within text not null, country text not null, inao_name text not null, words text not null,
  vineyard text, source text not null, read_at date not null, status text not null default 'checked'
);
alter table public.rank_appellations enable row level security;
drop policy if exists rank_appellations_read on public.rank_appellations;
create policy rank_appellations_read on public.rank_appellations for select using (true);
grant select on public.rank_appellations to anon, authenticated;
insert into public.rank_appellations (appellation, within, country, inao_name, words, vineyard, source, read_at) values
${seed.join(",\n")}
on conflict (appellation) do update set within = excluded.within, inao_name = excluded.inao_name, words = excluded.words, vineyard = excluded.vineyard,
  source = excluded.source, read_at = excluded.read_at;

create table if not exists public.rank_appellation_moves (
  wine_id uuid primary key, from_area uuid not null, to_area uuid not null, appellation text not null, basis text not null, source text, note text,
  moved_at timestamptz not null default now()
);
alter table public.rank_appellation_moves enable row level security;   -- the owner's record only: no policy, so only the SQL editor reads it

-- The wines to move: by the label's words (in the database, so every wine is looked at), then the sourced ones.
create temp table rank_moves on commit drop as
with rules (within_id, parent_id, appellation, vineyard_re, vlen) as (values
${rules.join(",\n")}
), by_words as (
  select distinct on (w.id) w.id as wine_id, w.appellation_id as from_area, r.parent_id, r.appellation, 'label'::text as basis,
    null::text as source, ('The name "' || w.name || '" says it') as note
  from public.wines w join rules r on r.within_id = w.appellation_id
  where w.name ~* '\\mgrand[[:space:]]+cru\\M' and (r.vineyard_re is null or w.name ~* r.vineyard_re)
  order by w.id, r.vlen desc
), by_source (wine_id, from_area, parent_id, appellation, source, note) as (values
${sourced.length ? sourced.join(",\n") : "  (null::uuid, null::uuid, null::uuid, null::text, null::text, null::text)"}
)
select * from by_words
union all
select s.wine_id, s.from_area, s.parent_id, s.appellation, 'source', s.source, s.note from by_source s
where s.wine_id is not null and not exists (select 1 from by_words b where b.wine_id = s.wine_id);

-- The places, made once (an existing appellation of that name anywhere in France's tree is reused).
insert into public.geo_areas (id, name, level, parent_id, classification, status)
select gen_random_uuid(), m.appellation, 'appellation', m.parent_id, 'AOC', 'verified'
from (select distinct appellation, parent_id from rank_moves) m
where not exists (select 1 from public.geo_areas g where g.level = 'appellation' and lower(g.name) = lower(m.appellation));

-- The moves, logged first; a wine already moved (or moved by hand since) is left alone.
with target as (
  select m.*, (select g.id from public.geo_areas g where g.level = 'appellation' and lower(g.name) = lower(m.appellation) limit 1) as to_area
  from rank_moves m
), logged as (
  insert into public.rank_appellation_moves (wine_id, from_area, to_area, appellation, basis, source, note)
  select t.wine_id, t.from_area, t.to_area, t.appellation, t.basis, t.source, t.note from target t
  join public.wines w on w.id = t.wine_id and w.appellation_id = t.from_area
  on conflict (wine_id) do nothing
  returning wine_id, to_area, from_area
)
update public.wines w set appellation_id = l.to_area from logged l where w.id = l.wine_id and w.appellation_id = l.from_area;

commit;

-- Check: what moved, and why.
select m.appellation, m.basis, count(*) as wines from public.rank_appellation_moves m group by 1, 2 order by 1, 2;
select p.name as producer, w.name as wine, m.appellation, m.basis, coalesce(m.source, m.note) as why
from public.rank_appellation_moves m join public.wines w on w.id = m.wine_id left join public.producers p on p.id = w.producer_id order by 3, 1;

-- UNDO (only if the owner wants these wines back under the wider appellation; the new places stay, unused):
-- update public.wines w set appellation_id = m.from_area from public.rank_appellation_moves m where w.id = m.wine_id and w.appellation_id = m.to_area;
-- delete from public.rank_appellation_moves;
`;
writeFileSync(join(dirname(fileURLToPath(import.meta.url)), "rank_appellations.sql"), sql);
console.log(`rank_appellations.sql: ${rules.length} rules, ${sourced.length} sourced wines; not found: ${notFound.join("; ") || "none"}; wider places missing: ${[...missingWithin].join(", ") || "none"}`);

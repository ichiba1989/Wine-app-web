// Builds atlasdata.js (the Atlas) and atlaslite.js (the card's map: lighter), the borders and wine-area boundaries they draw, from open map data. Run by hand when the data should be refreshed:
//   1. Download into an empty folder (keep it outside the repository):
//        https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson
//        https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson
//        https://raw.githubusercontent.com/UCDavisLibrary/ava/master/avas_aggregated_files/avas.geojson
//      and the French AOCs: INAO's "Délimitation parcellaire des AOC viticoles" (the shapefile zip on
//        https://www.data.gouv.fr/datasets/delimitation-parcellaire-des-aoc-viticoles-de-linao ; Licence Ouverte / Open Licence, "fr-lo"),
//      unzipped and merged into one outline per AOC with mapshaper (npm package, version 0.6; each AOC on its own, because AOCs overlap: Margaux
//      lies inside Bordeaux and a merge of all of them together would give each piece of land to one AOC only):
//        npx mapshaper@0.6 <the .shp> -filter 'type_prod === "Vins" && type_denom === "appellation"' -proj wgs84 -split app \
//          -dissolve2 app target=* gap-fill-area=1km2 -merge-layers target=* force -o perapp.json format=geojson precision=0.00001
//        npx mapshaper@0.6 perapp.json -simplify interval=120 keep-shapes -o <that folder>/aoc_france.geojson format=geojson precision=0.0001
//      (needs a lot of memory: NODE_OPTIONS=--max-old-space-size=14000; the first step takes about 20 minutes and writes about 700 MB). The named sub-areas ("dénominations géographiques
//      complémentaires") are left out; only appellations are kept. Without the file the French AOCs are simply left out.
//   2. node docs/atlas_data.mjs <that folder>          (writes atlasdata.js in the repository root)
//   3. Bump atlasdata.js?v= and atlaslite.js?v= where they are imported (atlasview.js, app.js).
//   4. Write the new dates in docs/DATA_REFRESH.md (refresh every six months: INAO and the AVA list change several times a year).
// Licences: Natural Earth is in the public domain (naturalearthdata.com/about/terms-of-use). The AVA boundaries are from the UC Davis American
// Viticultural Areas project, CC0 1.0 (github.com/UCDavisLibrary/ava). The French AOC outlines are INAO's, Licence Ouverte (reuse allowed with the
// source named); INAO says its published shapes are for information only (the legal plans are the ones filed with INAO and the town halls), and some
// AOCs are not published yet (Champagne among them). Nothing here is drawn by hand or guessed.
// The shapes are simplified (Douglas-Peucker) so the file stays small: the world's countries roughly, the wine countries closer, AVAs closer still.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PLACES } from "../flavordata.js";
import { matchKey } from "../text.js";

const dir = process.argv[2];
if (!dir) { console.error("usage: node docs/atlas_data.mjs <folder with the three downloads>"); process.exit(1); }
const read = (f) => JSON.parse(readFileSync(join(dir, f), "utf8"));

// The countries our catalog names, as Natural Earth names them (the app says "USA").
const WINE = { USA: "United States of America", France: "France", Italy: "Italy", Spain: "Spain", Portugal: "Portugal", Germany: "Germany", Austria: "Austria",
  Argentina: "Argentina", Chile: "Chile", Australia: "Australia", "New Zealand": "New Zealand", "South Africa": "South Africa", Canada: "Canada", China: "China",
  Hungary: "Hungary", Greece: "Greece", Switzerland: "Switzerland", Slovenia: "Slovenia", Croatia: "Croatia", Georgia: "Georgia", Lebanon: "Lebanon", Israel: "Israel",
  Uruguay: "Uruguay", Romania: "Romania", Moldova: "Moldova", Bulgaria: "Bulgaria", "Czech Republic": "Czechia", Slovakia: "Slovakia", Japan: "Japan", "United Kingdom": "United Kingdom", Mexico: "Mexico", Brazil: "Brazil" };
// Province lines are drawn only inside the countries the catalog holds wines from (they cost the most bytes).
const PROVINCE_COUNTRIES = ["USA", "France", "Italy", "Spain", "Portugal", "Germany", "Austria", "Argentina", "Chile", "Australia", "New Zealand", "South Africa"];

// ---------------------------------------------------------------- simplify
const COS = (lat) => Math.cos((lat * Math.PI) / 180);
function dp(pts, tol) {   // Douglas-Peucker on [lon, lat], x scaled by the cosine of the ring's latitude
  if (pts.length < 4) return pts;
  const [f, l] = [pts[0], pts[pts.length - 1]];
  if (f[0] === l[0] && f[1] === l[1]) {   // a closed ring: split it at the point farthest from its start, or every point would be "on the line"
    let far = 1, best = -1;
    pts.forEach((p, i) => { const d = Math.hypot(p[0] - f[0], p[1] - f[1]); if (d > best) { best = d; far = i; } });
    return [...dp(pts.slice(0, far + 1), tol).slice(0, -1), ...dp(pts.slice(far), tol)];
  }
  const c = COS(pts.reduce((a, p) => a + p[1], 0) / pts.length), keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = [pts[a][0] * c, pts[a][1]], [bx, by] = [pts[b][0] * c, pts[b][1]], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1e-12;
    let best = -1, bi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * (pts[i][0] * c - ax) - dx * (pts[i][1] - ay)) / L;
      if (d > best) { best = d; bi = i; }
    }
    if (best > tol) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const rings = (geom) => (geom.type === "Polygon" ? [geom.coordinates[0]] : geom.type === "MultiPolygon" ? geom.coordinates.map((p) => p[0]) : []);
// A ring as a flat list of integers: lon and lat times `scale` (100 = about 1 km, 1000 = about 100 m). Rings smaller than the tolerance are dropped.
// keepOne: a wine area whose pieces are all small (Château-Grillet is a few hectares) keeps its biggest piece, drawn ten times finer, so it never vanishes.
function pack(geom, tol, scale, keepOne = false, anySize = false) {
  const out = [];
  for (const r of rings(geom)) {
    const lons = r.map((p) => p[0]), lats = r.map((p) => p[1]);
    if (!anySize && Math.max(...lons) - Math.min(...lons) < tol * 3 && Math.max(...lats) - Math.min(...lats) < tol * 3) continue;
    const s = dp(r, tol);
    if (s.length < 4) continue;
    const flat = [];
    let px = 0, py = 0;
    for (const [lon, lat] of s) {   // the first point as it is, then each point as the step from the one before (small numbers, a smaller file)
      const x = Math.round(lon * scale), y = Math.round(lat * scale);
      if (flat.length && x === px && y === py) continue;
      flat.push(x - px, y - py); px = x; py = y;
    }
    if (flat.length >= 8) out.push(flat);
  }
  if (!out.length && keepOne) {
    const all = rings(geom), size = (r) => { const xs = r.map((p) => p[0]), ys = r.map((p) => p[1]); return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)); };
    const big = all.sort((a, b) => size(b) - size(a))[0];
    if (big) return pack({ type: "Polygon", coordinates: [big] }, tol / 10, scale, false, true);   // La Romanée is under one hectare
  }
  return out;
}

// ---------------------------------------------------------------- the sources, read once
const byNe = Object.fromEntries(Object.entries(WINE).map(([app, ne]) => [ne, app]));
const RAW_COUNTRIES = read("ne_50m_admin_0_countries.geojson").features.filter((f) => f.properties.CONTINENT !== "Antarctica");
const RAW_PROVINCES = read("ne_10m_admin_1_states_provinces.geojson").features;
const RAW_AVAS = read("avas.geojson").features.filter((f) => !f.properties.valid_end && !f.properties.removed);   // only areas still in force
const RAW_AOCS = existsSync(join(dir, "aoc_france.geojson")) ? read("aoc_france.geojson").features.filter((f) => f.geometry && f.properties && f.properties.app) : [];
const spanOf = (geom) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rings(geom)) for (const [x, y] of r) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return Math.max(x1 - x0, y1 - y0);
};

// ---------------------------------------------------------------- one data file
// T: the tolerances (degrees) for each layer. keepArea(name, aka, country, kind): which wine areas go in.
function build(T, keepArea = () => true) {
  const countries = {};
  for (const f of RAW_COUNTRIES) {
    const app = byNe[f.properties.NAME] || byNe[f.properties.ADMIN], wine = !!app;
    countries[app || f.properties.NAME] = { wine, polys: pack(f.geometry, wine ? T.wine : T.other, 100) };
  }
  // Provinces (states, departments, regions) inside the wine countries
  const provinces = {};
  for (const f of RAW_PROVINCES) {
    const app = PROVINCE_COUNTRIES.find((c) => WINE[c] === f.properties.admin);
    if (!app) continue;
    const polys = pack(f.geometry, T.province, 100);
    if (polys.length) (provinces[app] = provinces[app] || []).push({ name: f.properties.name, polys });
  }
  const areas = [];
  // American Viticultural Areas. Other names the source gives (Los Carneros: "Carneros"); only short names, not the notes some rows carry there.
  for (const f of RAW_AVAS) {
    const p = f.properties, name = p.name.trim();
    const aka = String(p.aka || "").split(",").map((x) => x.trim()).filter((x) => x && x.split(/\s+/).length <= 4 && !/["“”]/.test(x));
    if (!keepArea(name, aka, "USA", "ava")) continue;
    const polys = pack(f.geometry, T.ava, 1000, true);
    if (polys.length) areas.push({ name, ...(aka.length ? { aka } : {}), country: "USA", kind: "ava", source: "ava", polys });
  }
  // French AOCs (INAO). INAO writes the allowed alternatives into one name ("Alsace ou Vin d'Alsace", "Hermitage ou Ermitage ..."): the name
  // stays whole, the alternatives are kept as other names to match on. A wide AOC (more than about 60 km across: Bordeaux, Crémant de Bourgogne,
  // Languedoc ...) is drawn only when its page is open, so it is kept coarse; the others finer. Pieces smaller than three times the tolerance are
  // left out (AOCs are patchy vineyard land); a grand cru of a hectare keeps its own finer grid ("scale").
  for (const f of RAW_AOCS) {
    const name = String(f.properties.app).trim(), aka = name.includes(" ou ") ? name.split(" ou ").map((x) => x.trim()).filter(Boolean) : [];
    if (!keepArea(name, aka, "France", "aoc")) continue;
    let polys = pack(f.geometry, spanOf(f.geometry) > 0.8 ? T.aocWide : T.aoc, 1000, true), scale = null;
    if (!polys.length) { polys = pack(f.geometry, 0.00007, 100000, true); scale = 100000; }
    if (polys.length) areas.push({ name, ...(aka.length ? { aka } : {}), country: "France", kind: "aoc", source: "inao", ...(scale ? { scale } : {}), polys });
    else console.log(`left out (no shape): ${name}`);
  }
  areas.sort((a, b) => a.name.localeCompare(b.name));
  return { countries, provinces, areas };
}

// ---------------------------------------------------------------- write
const SOURCES = [
  { id: "ne", name: "Natural Earth", licence: "Public domain", url: "https://www.naturalearthdata.com/" },
  { id: "ava", name: "UC Davis American Viticultural Areas project", licence: "CC0 1.0", url: "https://github.com/UCDavisLibrary/ava" },
  { id: "inao", name: "INAO, Délimitation parcellaire des AOC viticoles", licence: "Licence Ouverte / Open Licence", url: "https://www.data.gouv.fr/datasets/delimitation-parcellaire-des-aoc-viticoles-de-linao" },
];
function write(file, what, note, d) {
  const head = `// ${what} GENERATED by docs/atlas_data.mjs on ${new Date().toISOString().slice(0, 10)}: do not edit by hand.
// Sources: Natural Earth 1:50m countries and 1:10m states and provinces (public domain, naturalearthdata.com);
// American Viticultural Areas from the UC Davis AVA project (CC0 1.0, github.com/UCDavisLibrary/ava); French AOCs from INAO's parcel delimitation
// (Licence Ouverte, data.gouv.fr; for information only, the legal plans are INAO's). Simplified for size.
// Each polygon is a flat list of integers: degrees times SCALE (countries and provinces) or AREA_SCALE (wine areas), the first [lon, lat]
// as it is and every later one as the step from the point before (atlas.js unpack). An area with its own "scale" uses that instead (a tiny grand cru).
// ${note}
`;
  const js = head + `export const SCALE = 100;\nexport const AREA_SCALE = 1000;\n` + `export const SOURCES = ${JSON.stringify(SOURCES)};\n` +
    `export const COUNTRIES = ${JSON.stringify(d.countries)};\n` + `export const PROVINCES = ${JSON.stringify(d.provinces)};\n` + `export const AREAS = ${JSON.stringify(d.areas)};\n`;
  writeFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", file), js);
  console.log(`${file}: ${(js.length / 1024).toFixed(0)} KB; ${Object.keys(d.countries).length} countries, ${Object.values(d.provinces).flat().length} provinces, ${d.areas.length} wine areas`);
}

// The Atlas: everything, for zooming down to a village. Loaded only when the Atlas opens (atlasview.js).
write("atlasdata.js", "The Atlas's borders and wine-area boundaries.", "Pure data: loaded only when the Atlas opens (atlasview.js).", build({ wine: 0.025, other: 0.15, province: 0.04, ava: 0.006, aoc: 0.003, aocWide: 0.012 }));

// The card's map: coarser borders, and only the outlines of places the app knows (flavordata.js PLACES, matched like atlas.js areaFor: the name or
// one of its other names, with text.js matchKey; a French AOC never for a region). Its zoom stops at about 60 km across (atlas.js CARD), so it
// needs less detail. Loaded only when a card's map is tapped.
// It also holds every appellation the catalog uses (the database's public place list, geo_areas, read with the public key in config.js), so a
// card's map can show its own appellation's outline (Morgon, Meursault ...); run this again when the catalog gains appellations.
const PLACE_KEYS = new Set(PLACES.map((p) => `${p.country}|${p.kind}|${matchKey(p.name)}`));
try {
  const { SUPABASE_URL, SUPABASE_KEY } = await import("../config.js");
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/geo_areas?select=id,name,level,parent_id`, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Range: `${from}-${from + 999}` } });
    if (!r.ok) throw new Error(`geo_areas: ${r.status}`);
    const j = await r.json(); rows.push(...j); if (j.length < 1000) break;
  }
  const byId = new Map(rows.map((g) => [g.id, g]));
  const countryOf = (g) => { for (let x = g, i = 0; x && i < 6; x = byId.get(x.parent_id), i++) if (x.level === "country") return x.name; return ""; };
  let n = 0;
  for (const g of rows) if (g.level === "appellation") { const c = countryOf(g); if (c) { PLACE_KEYS.add(`${c}|appellation|${matchKey(g.name)}`); n += 1; } }
  console.log(`catalog appellations read: ${n}`);
} catch (e) { console.log(`catalog appellations not read (${e.message}): the card map keeps only the PLACES outlines`); }
const known = (name, aka, country, kind) => [name, ...aka].some((n) => ["appellation", ...(kind === "aoc" ? [] : ["region"])].some((k) => PLACE_KEYS.has(`${country}|${k}|${matchKey(n)}`)));
write("atlaslite.js", "The card map's borders and wine-area boundaries (a lighter copy of atlasdata.js).", "Pure data: loaded only when a card's map is tapped (app.js openZoom).", build({ wine: 0.05, other: 0.25, province: 0.08, ava: 0.008, aoc: 0.004, aocWide: 0.02 }, known));

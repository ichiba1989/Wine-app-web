// Builds atlasdata.js, the borders and wine-area boundaries the Atlas draws, from open map data. Run by hand when the data should be refreshed:
//   1. Download into an empty folder (keep it outside the repository):
//        https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson
//        https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson
//        https://raw.githubusercontent.com/UCDavisLibrary/ava/master/avas_aggregated_files/avas.geojson
//      and the French AOCs: INAO's "Délimitation parcellaire des AOC viticoles" (the shapefile zip on
//        https://www.data.gouv.fr/datasets/delimitation-parcellaire-des-aoc-viticoles-de-linao ; Licence Ouverte / Open Licence, "fr-lo"),
//      unzipped and merged into one outline per AOC with mapshaper (npm package, version 0.6; each AOC on its own, because AOCs overlap: Margaux
//      lies inside Bordeaux and a merge of all of them together would give each piece of land to one AOC only):
//        npx mapshaper@0.6 <the .shp> -filter 'type_prod === "Vins" && type_denom === "appellation"' -proj wgs84 -split app \
//          -dissolve2 target=* gap-fill-area=1km2 -merge-layers target=* force -o <that folder>/aoc_france.geojson format=geojson precision=0.00001
//      (needs a lot of memory: NODE_OPTIONS=--max-old-space-size=14000; a few minutes). The named sub-areas ("dénominations géographiques
//      complémentaires") are left out; only appellations are kept. Without the file the French AOCs are simply left out.
//   2. node docs/atlas_data.mjs <that folder>          (writes atlasdata.js in the repository root)
//   3. Bump atlasdata.js?v= where it is imported (atlasview.js).
// Licences: Natural Earth is in the public domain (naturalearthdata.com/about/terms-of-use). The AVA boundaries are from the UC Davis American
// Viticultural Areas project, CC0 1.0 (github.com/UCDavisLibrary/ava). The French AOC outlines are INAO's, Licence Ouverte (reuse allowed with the
// source named); INAO says its published shapes are for information only (the legal plans are the ones filed with INAO and the town halls), and some
// AOCs are not published yet (Champagne among them). Nothing here is drawn by hand or guessed.
// The shapes are simplified (Douglas-Peucker) so the file stays small: the world's countries roughly, the wine countries closer, AVAs closer still.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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
function pack(geom, tol, scale) {
  const out = [];
  for (const r of rings(geom)) {
    const lons = r.map((p) => p[0]), lats = r.map((p) => p[1]);
    if (Math.max(...lons) - Math.min(...lons) < tol * 3 && Math.max(...lats) - Math.min(...lats) < tol * 3) continue;
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
  return out;
}

// ---------------------------------------------------------------- countries
const byNe = Object.fromEntries(Object.entries(WINE).map(([app, ne]) => [ne, app]));
const countries = {};
for (const f of read("ne_50m_admin_0_countries.geojson").features) {
  const ne = f.properties.NAME, app = byNe[ne] || byNe[f.properties.ADMIN], wine = !!app;
  const name = app || f.properties.NAME;
  if (f.properties.CONTINENT === "Antarctica") continue;
  countries[name] = { wine, polys: pack(f.geometry, wine ? 0.025 : 0.15, 100) };
}

// ---------------------------------------------------------------- provinces (states, departments, regions) inside the wine countries
const provinces = {};
const neOf = (app) => WINE[app];
for (const f of read("ne_10m_admin_1_states_provinces.geojson").features) {
  const app = PROVINCE_COUNTRIES.find((c) => neOf(c) === f.properties.admin);
  if (!app) continue;
  const polys = pack(f.geometry, 0.04, 100);
  if (polys.length) (provinces[app] = provinces[app] || []).push({ name: f.properties.name, polys });
}

// ---------------------------------------------------------------- American Viticultural Areas
const areas = [];
for (const f of read("avas.geojson").features) {
  const p = f.properties;
  if (p.valid_end || p.removed) continue;   // only areas still in force
  const polys = pack(f.geometry, 0.006, 1000);
  // Other names the source gives (Los Carneros: "Carneros"); only short names, not the notes some rows carry there.
  const aka = String(p.aka || "").split(",").map((x) => x.trim()).filter((x) => x && x.split(/\s+/).length <= 4 && !/["“”]/.test(x));
  if (polys.length) areas.push({ name: p.name.trim(), ...(aka.length ? { aka } : {}), country: "USA", kind: "ava", source: "ava", polys });
}
// ---------------------------------------------------------------- French AOCs (INAO), when the merged file is there
if (existsSync(join(dir, "aoc_france.geojson"))) {
  let n = 0;
  for (const f of read("aoc_france.geojson").features) {
    if (!f.geometry || !f.properties || !f.properties.app) continue;
    const name = String(f.properties.app).trim();
    // INAO writes the allowed alternatives into one name ("Alsace ou Vin d'Alsace", "Hermitage ou Ermitage ..."): the name stays whole, the
    // alternatives are kept as other names to match on.
    const aka = name.includes(" ou ") ? name.split(" ou ").map((x) => x.trim()).filter(Boolean) : [];
    const polys = pack(f.geometry, 0.004, 1000);
    if (polys.length) { areas.push({ name, ...(aka.length ? { aka } : {}), country: "France", kind: "aoc", source: "inao", polys }); n += 1; }
  }
  console.log(`French AOCs: ${n}`);
}
areas.sort((a, b) => a.name.localeCompare(b.name));

// ---------------------------------------------------------------- write
const head = `// The Atlas's borders and wine-area boundaries. GENERATED by docs/atlas_data.mjs on ${new Date().toISOString().slice(0, 10)}: do not edit by hand.
// Sources: Natural Earth 1:50m countries and 1:10m states and provinces (public domain, naturalearthdata.com);
// American Viticultural Areas from the UC Davis AVA project (CC0 1.0, github.com/UCDavisLibrary/ava); French AOCs from INAO's parcel delimitation
// (Licence Ouverte, data.gouv.fr; for information only, the legal plans are INAO's). Simplified for size.
// Each polygon is a flat list of integers: degrees times SCALE (countries and provinces) or AREA_SCALE (wine areas), the first [lon, lat]\n// as it is and every later one as the step from the point before (atlas.js unpack).
// Pure data: loaded only when the Atlas opens (atlasview.js).
`;
const js = head + `export const SCALE = 100;\nexport const AREA_SCALE = 1000;\n` +
  `export const SOURCES = ${JSON.stringify([
    { id: "ne", name: "Natural Earth", licence: "Public domain", url: "https://www.naturalearthdata.com/" },
    { id: "ava", name: "UC Davis American Viticultural Areas project", licence: "CC0 1.0", url: "https://github.com/UCDavisLibrary/ava" },
    { id: "inao", name: "INAO, Délimitation parcellaire des AOC viticoles", licence: "Licence Ouverte / Open Licence", url: "https://www.data.gouv.fr/datasets/delimitation-parcellaire-des-aoc-viticoles-de-linao" },
  ])};\n` +
  `export const COUNTRIES = ${JSON.stringify(countries)};\n` +
  `export const PROVINCES = ${JSON.stringify(provinces)};\n` +
  `export const AREAS = ${JSON.stringify(areas)};\n`;
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "atlasdata.js");
writeFileSync(out, js);
console.log(`atlasdata.js: ${(js.length / 1024).toFixed(0)} KB; ${Object.keys(countries).length} countries, ${Object.values(provinces).flat().length} provinces, ${areas.length} wine areas`);

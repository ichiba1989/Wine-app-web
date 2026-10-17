// The Atlas: a map of the wine world the player can move around in, with their own wines on it and a page for each place.
//   Projection: Web Mercator, the world 1000 units wide (W). The map is one SVG whose viewBox is the view { x, y, w, h } in those units, so zooming and
//   panning only change four numbers; lines keep their width (vector-effect in the CSS) and labels and pins are drawn in screen pixels on top.
//   Borders come from open map data (atlasdata.js, built by docs/atlas_data.mjs: Natural Earth, public domain; US wine areas from the UC Davis AVA
//   project, CC0; French AOCs from INAO's published parcel delimitation, Licence Ouverte). Places are the ones the app already knows with a position (flavors.js tables, flavordata.js PLACES); village names are geodata.js VILLAGES.
//   A place page holds only what is stored: the catalog's wines from there, the grapes its rule names (rule_grapes), its designation (appellations only),
//   the climate rule (rules.js climateOf) and the flavour notes the place adds (flavordata.js). Nothing is guessed about a wine or a place.
// Pure: no browser, no network. atlasview.js draws it and handles the fingers.
import { tables, placeFor } from "./flavors.js?v=4";
import { LABEL, fold, placeKey } from "./flavordata.js?v=4";
import { VILLAGES } from "./geodata.js?v=1";
import { climateOf, norm } from "./rules.js?v=6";
import { matchKey } from "./text.js?v=3";
import { reactionOf } from "./reactions.js?v=3";

// ---------------------------------------------------------------- projection
export const W = 1000;
const RAD = Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const project = (lon, lat) => { const p = clamp(lat, -82, 82) * RAD; return [((lon + 180) / 360) * W, ((1 - Math.log(Math.tan(Math.PI / 4 + p / 2)) / Math.PI) / 2) * W]; };
export const unproject = (x, y) => [(x / W) * 360 - 180, Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / W))) / RAD];
// One polygon from atlasdata.js (the first point, then steps) as [[lon, lat], ...].
export function unpack(flat, scale) {
  const out = []; let x = 0, y = 0;
  for (let i = 0; i + 1 < flat.length; i += 2) { x += flat[i]; y += flat[i + 1]; out.push([x / scale, y / scale]); }
  return out;
}
const r3 = (n) => Math.round(n * 1000) / 1000;
const ringD = (pts) => "M" + pts.map(([lon, lat]) => { const [x, y] = project(lon, lat); return r3(x) + " " + r3(y); }).join("L") + "z";
function bboxOf(rings) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const r of rings) for (const [lon, lat] of r) { a = Math.min(a, lon); b = Math.min(b, lat); c = Math.max(c, lon); d = Math.max(d, lat); }
  return [a, b, c, d];
}
// The middle of a country's biggest piece (where its name goes).
function labelPoint(rings) {
  let best = null, size = -1;
  for (const r of rings) { const [a, b, c, d] = bboxOf([r]); const s = (c - a) * (d - b); if (s > size) { size = s; best = [(a + c) / 2, (b + d) / 2]; } }
  return best;
}

// ---------------------------------------------------------------- the map's shapes, worked out once from atlasdata.js
// data: the atlasdata.js module. Returns { countries, provinces, areas } with SVG paths in map units.
export function buildShapes(data) {
  const countries = Object.entries(data.COUNTRIES).map(([name, c]) => {
    const rings = c.polys.map((p) => unpack(p, data.SCALE));
    return { name, wine: !!c.wine, d: rings.map(ringD).join(""), bbox: bboxOf(rings), label: labelPoint(rings) };
  });
  const provinces = Object.entries(data.PROVINCES).flatMap(([country, list]) => list.map((p) => ({ country, name: p.name, d: p.polys.map((q) => ringD(unpack(q, data.SCALE))).join("") })));
  const areas = data.AREAS.map((a) => {
    const rings = a.polys.map((p) => unpack(p, a.scale || data.AREA_SCALE));   // a tiny area carries its own finer grid
    return { name: a.name, aka: a.aka || [], country: a.country, kind: a.kind, source: a.source || a.kind, d: rings.map(ringD).join(""), bbox: bboxOf(rings), label: labelPoint(rings) };
  });
  return { countries, provinces, areas };
}
// The boundary on file for a place: an area with the same name (or one of its other names) in the same country. Names are compared with text.js
// matchKey, so our "St.-Julien" finds INAO's "Saint-Julien" (nothing is renamed). A French AOC outline goes only to an appellation, never to a
// region: the region Bordeaux holds wines of other designations, and its outline is not the AOC Bordeaux's.
export function areaFor(shapes, place) {
  if (!shapes || !place) return null;
  const n = matchKey(place.name), c = fold(place.country);
  return shapes.areas.find((a) => fold(a.country) === c && !(a.kind === "aoc" && place.kind === "region") && (matchKey(a.name) === n || a.aka.some((k) => matchKey(k) === n))) || null;
}
// What the page says about an outline's source.
export const AREA_SOURCE = {
  ava: "Outline: the official American Viticultural Area (UC Davis AVA project).",
  inao: "Outline: the AOC's vineyard land as published by INAO, simplified. For information only: the legal plans are INAO's.",
};

// ---------------------------------------------------------------- the view
export const MIN_W = 0.4;    // about a village (a few km across)
export const MAX_W = W;      // the whole world
export const WORLD_VIEW = { x: 0, y: 120, w: W, h: W };
// How far the view may zoom: the Atlas goes from the world to a village; the card's map (CARD) from a continent to about 60 km across, which is
// what its lighter data (atlaslite.js) is drawn for.
export const FULL = { min: MIN_W, max: MAX_W };
export const CARD = { min: 2, max: 140 };
// Keeps the view inside the world and its zoom within the limits. aspect = screen height / width.
export function clampView(v, aspect = 1, lim = FULL) {
  const w = clamp(v.w, lim.min, lim.max), h = w * aspect, cx = v.x + v.w / 2, cy = v.y + v.h / 2;
  const x = clamp(cx - w / 2, -w / 2, W - w / 2), y = clamp(cy - h / 2, -h / 2, W - h / 2);
  return { x, y, w, h };
}
// Zoom by f (2 = twice as close) keeping the point at screen fraction (fx, fy) where it is.
export function zoomView(v, f, fx = 0.5, fy = 0.5, aspect = 1, lim = FULL) {
  const w = clamp(v.w / f, lim.min, lim.max), k = w / v.w, px = v.x + fx * v.w, py = v.y + fy * v.h;
  return clampView({ x: px - fx * w, y: py - fy * v.h * k, w, h: v.h * k }, aspect, lim);
}
// Move by a fraction of the screen (dragging a finger right by half the screen: dx = 0.5).
export const panView = (v, dx, dy, aspect = 1, lim = FULL) => clampView({ ...v, x: v.x - dx * v.w, y: v.y - dy * v.h }, aspect, lim);
// A view that shows a box of [lonMin, latMin, lonMax, latMax] with a margin around it, at least minW wide.
export function fitView(bbox, aspect = 1, pad = 0.2, minW = 3, lim = FULL) {
  const [x0, y1] = project(bbox[0], bbox[1]), [x1, y0] = project(bbox[2], bbox[3]);
  const bw = Math.max(x1 - x0, 1e-6), bh = Math.max(y1 - y0, 1e-6);
  const w = Math.max(minW, bw * (1 + 2 * pad), (bh * (1 + 2 * pad)) / aspect), h = w * aspect;
  return clampView({ x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - h / 2, w, h }, aspect, lim);
}
// A view centred on a point at a width.
export const viewAt = (lon, lat, w, aspect = 1, lim = FULL) => { const [x, y] = project(lon, lat); return clampView({ x: x - w / 2, y: y - (w * aspect) / 2, w, h: w * aspect }, aspect, lim); };
// How close the view is, for which layers and labels show.
export const levelOf = (v) => (v.w > 220 ? "world" : v.w > 30 ? "country" : v.w > 5 ? "region" : "local");
// Screen pixels of a point in a view drawn into a box of width px.
export const toScreen = (v, px, lon, lat) => { const [x, y] = project(lon, lat); const k = px / v.w; return [(x - v.x) * k, (y - v.y) * k]; };
// Kilometres for a scale bar about a quarter of the screen wide, and its length in pixels.
export function scaleFor(v, px) {
  const [, lat] = unproject(v.x + v.w / 2, v.y + v.h / 2), kmPerPx = ((v.w / W) * 40075 * Math.cos(lat * RAD)) / px;
  const want = kmPerPx * px * 0.25, km = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000].find((n) => n >= want * 0.6) || 5000;
  return { km, px: km / kmPerPx };
}

// ---------------------------------------------------------------- places
// Every place we know a position for: { key, name, kind, country, lat, lon }.
export function atlasPlaces() {
  return [...tables().REGION.entries()].filter(([, p]) => Number.isFinite(p.lat) && Number.isFinite(p.lon)).map(([key, p]) => ({ key, name: p.name, kind: p.kind || "appellation", country: p.country, lat: p.lat, lon: p.lon }));
}
// The catalog's own appellations that have an outline in the loaded map data (atlasdata.js or atlaslite.js) but no position in PLACES: Morgon,
// Meursault, Pomerol ... Each becomes a place at the middle of its outline's biggest piece, so nothing is placed by hand. The name is the catalog's
// own spelling; a place already in PLACES (same country, same name by text.js matchKey) is not repeated.
export function catalogPlaces(shapes, cards = [], known = atlasPlaces()) {
  if (!shapes) return [];
  const have = new Set(known.map((p) => fold(p.country) + "|" + matchKey(p.name))), out = [], seen = new Set();
  for (const c of cards) {
    if (!c || !c.appellation || !c.country) continue;
    const k = fold(c.country) + "|" + matchKey(c.appellation);
    if (have.has(k) || seen.has(k)) continue;
    seen.add(k);
    const area = areaFor(shapes, { name: c.appellation, country: c.country, kind: "appellation" });
    if (area && area.label) out.push({ key: placeKey(c.country, c.appellation), name: c.appellation, kind: "appellation", country: c.country, lat: area.label[1], lon: area.label[0], fromOutline: true });
  }
  return out;
}
// The place a wine is from on the map: its appellation first, then its region (each looked up in `places`, same country, by matchKey), else null.
// Where no map data is loaded (the 64 px map on the card), flavors.js placeFor is used instead.
export function placeOfCard(card, places) {
  if (!card || !card.country) return null;
  const c = fold(card.country), find = (name, kinds) => name && places.find((p) => fold(p.country) === c && kinds.includes(p.kind) && matchKey(p.name) === matchKey(name));
  return find(card.appellation, ["appellation", "region"]) || find(card.region, ["region", "appellation"]) || null;
}

// Village names for the close views (geodata.js VILLAGES): only names and positions, for orientation; they are not places with a page.
export const villages = () => Object.entries(VILLAGES).flatMap(([key, v]) => v.villages.map(([name, lat, lon]) => ({ key: key + "|" + fold(name), name, lat, lon })));
// Which places show at a level: regions from the country view on, appellations from the region view on.
export const placeShows = (p, level) => (level === "world" ? false : level === "country" ? p.kind === "region" : true);

// ---------------------------------------------------------------- the player's wines on the map
export const SHOW = [
  { id: "journal", label: "My journal" },
  { id: "liked", label: "Liked swipes" },
  { id: "catalog", label: "All wines" },
];
export const STYLES = [
  { id: "red", label: "Red" }, { id: "white", label: "White" }, { id: "sparkling", label: "Sparkling" }, { id: "rose", label: "Rosé" }, { id: "fortified", label: "Fortified" },
];
// Pin colours by the player's verdict (a journal wine with no verdict, a liked swipe and a catalog wine have their own).
export const PIN_COLOR = { buy: "#2f6b45", drink: "#5f8f4e", none: "#8a8f86", respect: "#b98a2c", no: "#a3333d", unrated: "#4d6070", liked: "#7b2d43", catalog: "#6b7c86" };
// The card-like facts of a journal entry, for finding its place: the catalog wine when there is one, else what the player typed in.
const entryCard = (e, cardsById) => (e.wine_vintage_id && cardsById.get(e.wine_vintage_id)) || { country: e.country || "", region: e.region || "", appellation: e.appellation || "", style: e.catalog_style || e.style || "" };
// Every wine to pin: { id, kind ("entry" | "card"), cardId, name, style, color, place }. Wines with no known place are left off (and counted in `unplaced`).
// opts: { show, style, journal, states, cards, cardsById, nameOf(card), entryName(entry), placeOf(card) (default flavors.js placeFor) }
export function pinsOf({ show = "journal", style = "", journal = [], states = [], cards = [], cardsById = new Map(), nameOf = (c) => c.producer || "", entryName = (e) => e.wine_name || "", placeOf = placeFor }) {
  const out = [];
  let unplaced = 0;
  const add = (card, pin) => {
    const place = placeOf(card);
    if (style && card.style !== style) return;
    if (!place) { unplaced += 1; return; }
    out.push({ ...pin, style: card.style || "", place });
  };
  if (show === "journal") journal.forEach((e) => add(entryCard(e, cardsById), { id: e.id, kind: "entry", cardId: e.wine_vintage_id || null, name: entryName(e), color: PIN_COLOR[e.verdict] || PIN_COLOR.unrated, verdict: e.verdict || null }));
  else if (show === "liked") states.filter((s) => reactionOf(s) === "like").forEach((s) => { const c = cardsById.get(s.wine_vintage_id); if (c) add(c, { id: c.id, kind: "card", cardId: c.id, name: nameOf(c), color: PIN_COLOR.liked }); });
  else cards.forEach((c) => add(c, { id: c.id, kind: "card", cardId: c.id, name: nameOf(c), color: PIN_COLOR.catalog }));
  return { pins: out, unplaced };
}
// The pins gathered by place: [{ place, pins, color }] (the colour of the most common pin there).
export function byPlace(pins) {
  const m = new Map();
  for (const p of pins) { const g = m.get(p.place.key) || { place: p.place, pins: [] }; g.pins.push(p); m.set(p.place.key, g); }
  return [...m.values()].map((g) => {
    const n = {}; g.pins.forEach((p) => { n[p.color] = (n[p.color] || 0) + 1; });
    return { ...g, color: Object.entries(n).sort((a, b) => b[1] - a[1])[0][0] };
  });
}
// Groups that would overlap on the screen are joined (greedy, biggest first). xy(group) -> [x, y] in pixels; cell = how close is too close.
// Returns [{ x, y, groups, count }]: one group is a place; several are a cluster the player can tap to zoom into.
export function clusterScreen(groups, xy, cell = 30) {
  const out = [];
  for (const g of [...groups].sort((a, b) => b.pins.length - a.pins.length)) {
    const [x, y] = xy(g);
    const near = out.find((c) => Math.hypot(c.x - x, c.y - y) < cell);
    if (near) { near.groups.push(g); near.count += g.pins.length; }
    else out.push({ x, y, groups: [g], count: g.pins.length });
  }
  return out;
}
// The places the player has had no wine from yet (for the "Not tried yet" chip): every known place whose key has no journal pin.
export function untriedPlaces(places, journalPins) {
  const had = new Set(journalPins.map((p) => p.place.key)), hadCountry = new Set(journalPins.map((p) => fold(p.place.country)));
  return places.filter((p) => !had.has(p.key)).map((p) => ({ ...p, countryTried: hadCountry.has(fold(p.country)) }));
}

// ---------------------------------------------------------------- labels that do not overlap (screen pixels)
const textW = (t, size, caps = false) => t.length * size * (caps ? 0.78 : 0.56);   // capitals with letter spacing (country names) are wider
const overlaps = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
// items: [{ x, y, text, size, dot }] in order of importance; dot = the label sits beside a dot rather than on its point. Returns the ones that fit,
// each with { x, y, anchor }; a label that fits nowhere is left out. taken: boxes already used (pins, buttons).
export function fitLabels(items, width, height, taken = []) {
  const used = [...taken], out = [];
  for (const it of items) {
    const w = textW(it.text, it.size, it.caps), h = it.size, g = it.dot ? it.gap || 6 : 0;   // gap: how far from its point (a pin or a ring needs more)
    const tries = it.dot ? [[g, 3.5, "start"], [-g, 3.5, "end"], [0, -g - 2, "middle"], [0, g + it.size, "middle"]] : [[0, h * 0.35, "middle"]];
    for (const [dx, dy, anchor] of tries) {
      const x = it.x + dx, y = it.y + dy, x0 = anchor === "start" ? x : anchor === "end" ? x - w : x - w / 2;
      const box = { x0: x0 - 2, x1: x0 + w + 2, y0: y - h * 0.85, y1: y + h * 0.3 };
      if (box.x0 < 2 || box.x1 > width - 2 || box.y0 < 2 || box.y1 > height - 2) continue;
      if (used.some((b) => overlaps(box, b))) continue;
      used.push(box); out.push({ ...it, x, y, anchor });
      break;
    }
  }
  return out;
}

// ---------------------------------------------------------------- a place's page
const CLIMATE_WORDS = {
  cool: "Cool climate: wines from here tend to be fresher and lighter, with crisper acidity.",
  moderate: "Moderate climate: wines from here tend to sit in the middle, neither very fresh nor very ripe.",
  warm: "Warm climate: wines from here tend to be riper and fuller, with softer acidity.",
  hot: "Hot climate: wines from here tend to be very ripe and full, with low acidity.",
};
const sameName = (a, b) => !!a && !!b && fold(a) === fold(b);
// Catalog wines from a place: its appellation or region has the place's name, in the same country.
export const cardsAt = (cards, place) => cards.filter((c) => sameName(c.country, place.country) && (sameName(c.appellation, place.name) || sameName(c.region, place.name)));
const top = (names, n) => { const m = new Map(); names.filter(Boolean).forEach((x) => m.set(x, (m.get(x) || 0) + 1)); return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([x]) => x); };
// Everything the page says about a place. places: atlasPlaces(); cards: the catalog (or the venue's list); shapes: buildShapes() or null.
// Each part is present only when something stored supports it.
export function placeFacts(key, { places, cards = [], shapes = null }) {
  const place = places.find((p) => p.key === key);
  if (!place) return null;
  const here = cardsAt(cards, place);
  // Where it sits: the region the catalog files its wines under (an appellation's), then the country.
  const region = place.kind === "region" ? null : top(here.filter((c) => sameName(c.appellation, place.name)).map((c) => c.region), 1)[0] || null;
  const regionPlace = region && places.find((p) => p.kind === "region" && sameName(p.country, place.country) && sameName(p.name, region));
  const chain = [{ name: place.country, kind: "country", key: null }, ...(region ? [{ name: region, kind: "region", key: regionPlace ? regionPlace.key : null }] : []), { name: place.name, kind: place.kind, key: place.key }];
  // The designation is kept on the appellation (never on a region or a country): read from the catalog's rows for that appellation.
  const designation = place.kind === "region" ? "" : (here.find((c) => sameName(c.appellation, place.name) && c.raw && c.raw.classification) || { raw: {} }).raw.classification || "";
  const ruleGrapes = top(here.flatMap((c) => c.ruleGrapes || []), 6);
  const labelGrapes = top(here.flatMap((c) => c.grapes || []), 8);
  const styles = top(here.map((c) => c.style), 5);
  const cl = climateOf({ appellation: norm(place.kind === "region" ? "" : place.name), region: norm(place.kind === "region" ? place.name : region || ""), country: norm(place.country) });   // the rule reads plain words
  const climate = cl.sure ? { zone: cl.zone, text: CLIMATE_WORDS[cl.zone] } : null;
  const nudges = (tables().REGION.get(key) || {}).add || {};
  const flavors = Object.keys(nudges).filter((f) => LABEL[f]).map((f) => LABEL[f]);
  const c0 = Math.cos(place.lat * RAD);
  const nearby = places.filter((p) => p.key !== key && sameName(p.country, place.country)).map((p) => ({ ...p, km: Math.hypot(p.lat - place.lat, (p.lon - place.lon) * c0) * 111 }))
    .filter((p) => p.km < (place.kind === "region" ? 400 : 120)).sort((a, b) => a.km - b.km).slice(0, 6);
  const area = areaFor(shapes, place);
  return { place, chain, designation, ruleGrapes, labelGrapes, styles, climate, flavors, nearby, area: area ? { name: area.name, kind: area.kind, source: area.source } : null, wineCount: here.length };
}
// The topics a place page can send to Learn (learn.js questionsAbout): the place, then its region.
export const topicsOf = (facts) => (facts ? [{ kind: "region", name: facts.place.name }, ...facts.chain.filter((s) => s.kind === "region" && s.name !== facts.place.name).map((s) => ({ kind: "region", name: s.name }))] : []);
// A country's page (tapping a country's name): its regions we know and the catalog's wines from there.
export function countryFacts(country, { places, cards = [] }) {
  const regions = places.filter((p) => sameName(p.country, country) && p.kind === "region").sort((a, b) => a.name.localeCompare(b.name));
  const here = cards.filter((c) => sameName(c.country, country));
  return { country, regions, labelGrapes: top(here.flatMap((c) => c.grapes || []), 8), styles: top(here.map((c) => c.style), 5), wineCount: here.length };
}
// The key of the place a wine is from (for "Show on map" from the journal), or null.
export const placeKeyOf = (card) => { const p = card && placeFor(card); return p ? p.key : null; };
export { placeKey };

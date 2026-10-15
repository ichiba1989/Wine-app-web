// The venue version of the app: a shop, restaurant or bar whose own wines make up the deck. This branch is for Vintage Wine Merchants.
// Everything the app picks from the catalog to SHOW or SUGGEST (the Discover deck, Bingo help, This or That wines, Guess the Glass wines and suggestions)
// uses only the venue's list. What a player records about their own drinking (adding a wine they drank, typing one in, import, blind tasting, their
// journal and swipes) still uses the whole catalog, and wines a player adds by hand are never touched.
// "VWM" is only the internal short name (the branch, venue_id "vwm", code and docs); every screen says the full name.
// The list is kept in the database (venue_wines, docs/venue_decks.sql): the owner uploads the venue's file and adds or removes wines by hand on the Owner page.
// Pure: no browser, no network. The file reading itself is done by importer.js, loaded on the Owner page.
import { grapeFor } from "./rules.js?v=4";
import { planPlace } from "./geo.js?v=3";
import { duplicateGroups } from "./catalog.js?v=3";

// ---------------------------------------------------------------- the venue (the one line a new venue branch changes)
export const VENUE = { id: "vwm", name: "Vintage Wine Merchants" };
export const DECK_LABEL = `${VENUE.name} selection`;

// ---------------------------------------------------------------- matching a file row to a catalog wine
// The same exact rule as the journal import: producer, wine name and vintage, ignoring accents, case and punctuation. Nothing is guessed: a row that does not
// match exactly stays on the list as "not in our catalog yet" until an editor adds the wine (Editor tab), and Re-check links it.
const norm = (s) => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export function vintageOf(v) {
  const t = String(v == null ? "" : v).trim();
  if (/^\d{4}$/.test(t)) return t;
  if (/^(n\.?\s*v\.?|non[\s-]*vintage)$/i.test(t)) return "NV";
  return "";
}
const keyOf = (producer, name) => `${norm(producer)}|${norm(name)}`;
// catalog index: "producer|wine" -> [cards] (archived wines left out)
export function catalogIndex(cards) {
  const m = new Map();
  (cards || []).forEach((c) => { if (c.archived) return; const k = keyOf(c.producer, c.cuvee); if (!m.has(k)) m.set(k, []); m.get(k).push(c); });
  return m;
}
// ---------------------------------------------------------------- shop lists with one "Title" column (Vintage Wine Merchants' export)
// A title such as "2018 Roagna Barbaresco Asili Vecchie Viti DOCG 1.5L" holds the vintage, producer, wine and bottle size together. The vintage is read
// from the start, the bottle size and stock codes such as "(18)" are set aside, and the rest is the wine's words. It matches a catalog wine of the SAME vintage
// only when every word of that wine's producer AND wine name is in the title (a catalog wine with no wine name must equal the title exactly). When two catalog
// wines fit, the one naming more of the title wins; a tie is left for the owner to pick by hand. Nothing else is guessed.
const SIZE = /\b\d+(?:[.,]\d+)?\s?(?:ml|l|cl)\b|\bmagnum\b|\bcan\b|\(\s*[a-z]?\d{2,4}\s*\)/gi;
export function parseTitle(title) {
  let t = String(title == null ? "" : title).replace(/\s+/g, " ").trim(), vintage = "";
  const m = t.match(/^(\d{4})\s+(.*)$/);
  if (m) { vintage = m[1]; t = m[2]; }
  const size = (t.match(SIZE) || []).join(" ").trim();
  return { vintage, size, text: t.replace(SIZE, " ").replace(/\s+/g, " ").replace(/[\s,;:-]+$/, "").trim() };
}
// Things a wine shop sells that are not wine: they never join a wine list. Words are matched whole in the title, or the shop's own category.
export const NOT_WINE_TYPES = ["accessories", "sake"];
const NOT_WINE = /\b(spirits?|liqueur|whisk(?:e)?y|bourbon|scotch|mezcal|tequila|calvados|distillato|grappa|cognac|armagnac|brandy|vodka|gin|rum|sake|olive oil|corkscrew|decanter|glass(?:es)?|carafe|gift set|non alcoholic|perlage|wine bar|encyclopedia|guide|atlas|companion|zalto|coravin|riedel|pulltex|bullet)\b/i;
export const isWine = (title, type = "") => !NOT_WINE_TYPES.includes(norm(type)) && !NOT_WINE.test(String(title || "")) && /[a-z]/i.test(String(title || ""));
const words = (s) => new Set(norm(s).split(" ").filter(Boolean));
// catalog cards prepared for title matching: { card, need: words that must all be in the title, exact: the whole name when there is no wine name }
export function titleIndex(cards) {
  return (cards || []).filter((c) => !c.archived && c.producer).map((c) => ({ card: c, need: [...words(`${c.producer} ${c.cuvee}`)], exact: c.cuvee ? "" : norm(c.producer) }));
}
export function matchTitle(text, vintage, tindex) {
  const have = words(text), whole = norm(text);
  const fits = tindex.filter((x) => (x.card.vintage || "") === (vintage || "NV") || (!vintage && (x.card.vintage || "") === ""))
    .filter((x) => (x.exact ? whole === x.exact : x.need.every((w) => have.has(w))));
  if (!fits.length) return { id: null, status: "missing" };
  fits.sort((a, b) => b.need.length - a.need.length);
  if (fits.length > 1 && fits[0].need.length === fits[1].need.length) return { id: null, status: "several" };
  return { id: fits[0].card.id, status: "matched" };
}

// One row -> { producer, wine_name, vintage, wine_vintage_id | null, status: "matched" | "missing" | "several" | "blank" }.
// A row with no producer is a title row (above). No vintage in the file: matched only when the catalog has exactly one vintage of that wine.
export function matchRow(row, index, tindex = null) {
  const producer = String(row.producer || "").trim(), wine_name = String(row.wine_name || "").trim(), vintage = vintageOf(row.vintage);
  if (!producer && !wine_name) return { producer, wine_name, vintage, wine_vintage_id: null, status: "blank" };
  if (!producer) { const t = matchTitle(wine_name, vintage, tindex || []); return { producer, wine_name, vintage, wine_vintage_id: t.id, status: t.status }; }
  const found = index.get(keyOf(producer, wine_name)) || [];
  const pick = vintage ? found.filter((c) => (c.vintage || "") === vintage) : found;
  if (pick.length === 1) return { producer, wine_name, vintage, wine_vintage_id: pick[0].id, status: "matched" };
  return { producer, wine_name, vintage, wine_vintage_id: null, status: !vintage && pick.length > 1 ? "several" : "missing" };
}
// A file already split into cells (importer.js parseCsv) and its columns (importer.js detectMapping) -> { rows: [matchRow results, without blanks and repeats], skipped, error }.
// Two layouts: Producer / Wine name / Vintage columns, or one Title column (a shop's export; a "Product type" column, when there, helps leave out non-wine).
export function readList(table, mapping, cards) {
  if (!table || table.length < 2) return { rows: [], skipped: 0, error: "The file needs a header row and at least one wine." };
  const heads = table[0].map(norm), titleCol = heads.findIndex((h) => h === "title" || h === "product" || h === "product name" || h === "item"), typeCol = heads.findIndex((h) => h === "product type" || h === "type" || h === "category");
  const byTitle = (!mapping || mapping.producer == null) && titleCol >= 0;
  if (!byTitle && (!mapping || mapping.producer == null)) return { rows: [], skipped: 0, error: "No Producer or Title column was found. Name the columns Producer, Wine name and Vintage, or give one Title column." };
  const get = (r, f) => (mapping[f] == null ? "" : r[mapping[f]] || "");
  const index = catalogIndex(cards), tindex = byTitle ? titleIndex(cards) : null, seen = new Set(), rows = [];
  let skipped = 0;
  table.slice(1).forEach((r) => {
    let m;
    if (byTitle) {
      const title = r[titleCol] || "";
      if (!String(title).trim()) return;
      if (!isWine(title, typeCol >= 0 ? r[typeCol] : "")) { skipped++; return; }
      const p = parseTitle(title);
      m = { ...matchRow({ producer: "", wine_name: p.text, vintage: p.vintage }, index, tindex), shop_type: typeCol >= 0 ? String(r[typeCol] || "").trim().slice(0, 60) : "" };
    } else m = matchRow({ producer: get(r, "producer"), wine_name: get(r, "wine_name"), vintage: get(r, "vintage") }, index);
    if (m.status === "blank") return;
    const k = m.wine_vintage_id || `${keyOf(m.producer, m.wine_name)}|${m.vintage}`;
    if (seen.has(k)) return;   // the same wine in two bottle sizes is one wine on the list
    seen.add(k); rows.push(m);
  });
  return { rows, skipped, error: rows.length ? "" : "No wines were found in the file." };
}
export const summary = (rows) => ({
  total: rows.length,
  matched: rows.filter((r) => r.wine_vintage_id).length,
  missing: rows.filter((r) => !r.wine_vintage_id).length,
});
// Re-check: rows not linked yet are matched again against the catalog as it is now (an editor may have added them). Returns [{ id, wine_vintage_id }] to update.
export function recheck(list, cards) {
  const index = catalogIndex(cards), tindex = titleIndex(cards);
  return (list || []).filter((r) => !r.wine_vintage_id).map((r) => ({ id: r.id, m: matchRow(r, index, tindex) })).filter((x) => x.m.wine_vintage_id).map((x) => ({ id: x.id, wine_vintage_id: x.m.wine_vintage_id }));
}

// ---------------------------------------------------------------- the venue's wines
// The catalog cards on the list. An archived or unpublished wine (not in the loaded catalog) simply does not appear.
// Older vintages (owner, 2026-10-15): when the list holds several vintages of the same wine, only the most recent one is shown, in the deck and in
// everything else built from these cards. The older ones are not removed: they stay on the list (venue_wines) and in the catalog, on record.
// "The same wine" is the catalog's own rule (catalog.js duplicateGroups: producer, wine name, type, grapes and place, numeric vintages only), the one
// Editor, Catalog uses for "Same wine, different vintages". Non-vintage wines are never treated as older.
export const listIds = (list) => new Set((list || []).filter((r) => r.wine_vintage_id).map((r) => r.wine_vintage_id));
export const olderVintageIds = (cards) => new Set(duplicateGroups(cards).flatMap((g) => g.archive.map((c) => c.id)));
export function venueCardsOf(cards, list) {
  const ids = listIds(list);
  const listed = (cards || []).filter((c) => ids.has(c.id) && !c.archived);
  const older = olderVintageIds(listed);
  return listed.filter((c) => !older.has(c.id));
}
// Catalog wines that could be added by hand: matching the search, not on the list yet.
export function addable(cards, list, q, limit = 20) {
  const t = norm(q), ids = listIds(list);
  if (t.length < 2) return [];
  return (cards || []).filter((c) => !c.archived && !ids.has(c.id) && norm(`${c.vintage} ${c.producer} ${c.cuvee} ${c.appellation} ${c.region}`).includes(t)).slice(0, limit);
}
// The Owner page list: matched wines first (A to Z), then the ones not in the catalog yet. Search over producer, wine and vintage.
// A newer vintage of the same wine on the list puts an older one "on record" (not shown; see venueCardsOf).
export function listRows(list, cardsById, q = "") {
  const t = norm(q);
  const older = olderVintageIds((list || []).map((r) => r.wine_vintage_id && cardsById.get(r.wine_vintage_id)).filter((c) => c && !c.archived));
  return (list || []).map((r) => {
    const c = r.wine_vintage_id ? cardsById.get(r.wine_vintage_id) : null;
    const name = c ? [c.vintage, c.producer, c.cuvee].filter(Boolean).join(" ") : [r.vintage, r.producer, r.wine_name].filter(Boolean).join(" ");
    return { id: r.id, name, linked: !!c, older: !!c && older.has(c.id), unpublished: !!r.wine_vintage_id && !c, source: r.source || "file" };
  }).filter((x) => !t || norm(x.name).includes(t)).sort((a, b) => (b.linked - a.linked) || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------- reviewing the shop's wines that are not in the catalog yet (Editor tab)
// Each row is reviewed by an editor, one at a time. The app only SUGGESTS, from the words of the title and lists the app already holds; the editor confirms
// or changes every field before a wine is created (convention: AI or rules assist, a person decides). Nothing is looked up anywhere else.
//   producer: the longest producer already in the catalog that the title starts with (else no suggestion: the editor taps where the producer's name ends)
//   type:     words that name a type on the label (Champagne, Crémant, Rosé, Port ...), else the shop's own category, else the colour of a grape named in the title
//   place:    the longest place in the place list (geo_areas) named as whole words in the title
//   grapes:   grape names that appear in the title (they are printed on the label)
const STYLE_WORDS = [
  { style: "sparkling", words: ["champagne", "cremant", "cava", "prosecco", "spumante", "sekt", "petillant", "pet nat", "franciacorta", "alta langa", "blanc de blancs", "blanc de noirs", "sparkling", "brut nature", "extra brut", "brut"] },
  { style: "fortified", words: ["port", "porto", "madeira", "marsala", "sherry", "tawny", "vintage port"] },
  { style: "rose", words: ["rose", "rosato", "rosado"] },
];
const has = (text, phrase) => ` ${norm(text)} `.includes(` ${norm(phrase)} `);
// How many title words make up a name at the start of the title (0 when the title does not start with it).
function prefixWords(words, name) {
  const want = norm(name); if (!want) return 0;
  for (let k = 1; k <= words.length; k++) { const got = norm(words.slice(0, k).join(" ")); if (got === want) return k; if (!want.startsWith(got)) return 0; }
  return 0;
}
export function suggestRow(title, { producers = [], areas = [], shopType = "" } = {}) {
  const text = String(title || "").trim(), words = text.split(/\s+/).filter(Boolean);
  // producer
  let split = 0, producer = null;
  for (const p of producers) { const k = prefixWords(words, p.name); if (k > split) { split = k; producer = p; } }
  // grapes named in the title (one to three words at a time, longest first)
  const grapes = [];
  for (let i = 0; i < words.length; i++) {
    for (let n = 3; n >= 1; n--) {
      if (i + n > words.length) continue;
      const g = grapeFor(words.slice(i, i + n).join(" "));
      if (g && !grapes.some((x) => x.name === g.name)) { grapes.push(g); i += n - 1; break; }
    }
  }
  // type
  let style = "", styleWhy = "";
  for (const s of STYLE_WORDS) { const w = s.words.find((x) => has(text, x)); if (w) { style = s.style; styleWhy = `"${w}" in the title`; break; } }
  if (!style && /sparkling/.test(norm(shopType))) { style = "sparkling"; styleWhy = "the shop's category"; }
  if (!style && grapes.length && grapes.every((g) => g.color === grapes[0].color)) { style = grapes[0].color; styleWhy = `${grapes[0].name} is a ${grapes[0].color} grape`; }
  // place
  let area = null;
  for (const a of areas) { if (norm(a.name).length >= 3 && has(text, a.name) && (!area || norm(a.name).length > norm(area.name).length)) area = a; }
  return { split, producerId: producer ? producer.id : null, style, styleWhy, grapes: grapes.map((g) => g.name), areaId: area ? area.id : null, areaWhy: area ? `"${area.name}" in the title` : "" };
}
// The producer and wine name for a split point (how many title words belong to the producer).
export function splitTitle(title, k) {
  const words = String(title || "").trim().split(/\s+/).filter(Boolean), n = Math.max(0, Math.min(words.length, k));
  return { producer: words.slice(0, n).join(" "), wine: words.slice(n).join(" ") };
}
// The rows still waiting: on the list, not linked to a catalog wine; skipped ones (this session) go last.
// sortKey(row) -> [country, region, producer, wine] (from the prepared suggestions) keeps one place and one producer together, so an editor checks
// a producer's wines one after another; without it the order is A to Z by title. Rows with no country come after the others.
export function reviewQueue(list, skipped = new Set(), sortKey = null) {
  const keys = new Map();
  const key = (r) => { if (!keys.has(r.id)) keys.set(r.id, [...(sortKey ? sortKey(r) : []), String(r.wine_name || ""), String(r.vintage || "")].map((x) => norm(x))); return keys.get(r.id); };
  const cmp = (a, b) => {
    const ka = key(a), kb = key(b);
    if (sortKey && !ka[0] !== !kb[0]) return ka[0] ? -1 : 1;
    for (let i = 0; i < ka.length; i++) { const c = ka[i].localeCompare(kb[i]); if (c) return c; }
    return 0;
  };
  const rows = (list || []).filter((r) => !r.wine_vintage_id).sort(cmp);
  return [...rows.filter((r) => !skipped.has(r.id)), ...rows.filter((r) => skipped.has(r.id))];
}

// ---------------------------------------------------------------- prepared suggestions (vwmprep.js) and places
// vwmprep.js holds suggestions worked out once from the shop's titles (unverified; see its header). They are read here row by row; an editor still checks them.
export function prepIndex(prep) {
  const m = new Map();
  (prep || []).forEach((r) => m.set(norm(r[0]), {
    producer: r[1] || "", wine: r[2] || "", style: r[3] || "", place: { appellation: r[4] || "", region: r[5] || "", country: r[6] || "" },
    grapes: r[7] ? String(r[7]).split("|") : [], notWine: !!r[8], styleWhy: r[9] ? `${r[9]} in the title` : "", placeWhy: placeWhyOf(r[10]),
  }));
  return m;
}
const placeWhyOf = (w) => (!w ? "" : w === "producer" ? "where the producer is" : w === "shop category" ? "the shop's category" : `"${w}" in the title`);
export const prepOf = (index, title) => (index && index.get(norm(title))) || null;
// Place names compared loosely: accents, case and punctuation ignored, and "St." read as "Saint" ("St.-Julien" = "Saint-Julien").
const placeKey = (s) => norm(s).replace(/\bst\b/g, "saint").replace(/\bste\b/g, "sainte").replace(/\bsta\b/g, "santa");
// A place given by name { country, region, appellation } with each name replaced by the place already in the list when there is one, so nothing is
// created twice. An appellation filed straight under the country (or under another region of it) is found too, and then its own region is used.
export function canonPlace(areas, place) {
  const p = { country: String(place.country || "").trim(), region: String(place.region || "").trim(), appellation: String(place.appellation || "").trim() };
  const find = (name, level, parentIds) => (name ? (areas || []).find((a) => a.level === level && placeKey(a.name) === placeKey(name) && (!parentIds || parentIds.includes(a.parent_id))) : null);
  const country = find(p.country, "country");
  if (!country) return p;
  p.country = country.name;
  const regions = (areas || []).filter((a) => a.level === "region" && a.parent_id === country.id);
  let region = find(p.region, "region", [country.id]);
  const app = find(p.appellation, "appellation", region ? [region.id] : [country.id, ...regions.map((r) => r.id)]);
  if (app) { p.appellation = app.name; if (!region || app.parent_id !== region.id) region = regions.find((r) => r.id === app.parent_id) || null; p.region = region ? region.name : (app.parent_id === country.id ? "" : p.region); }
  else if (region) p.region = region.name;
  return p;
}
// "Barolo, Piedmont, Italy" for the screen; "" for no place.
export const placeText = (place) => [place.appellation, place.region, place.country].filter((x) => String(x || "").trim()).join(", ");
// What adding the wine will do with its place: { error } or { notes: ["A new appellation will be created in Piedmont."] } (geo.js planPlace).
export function placePlan(areas, place) {
  const p = planPlace(areas || [], canonPlace(areas, place));
  return p.error ? { error: p.error, notes: [] } : { error: "", notes: p.notes };
}
// The place search: every word typed must be in the place's full name ("barolo", "piedmont barolo", "st julien"). Places whose own name starts with the
// search come first, then shorter names. options: [{ id, label }] (wineinfo.js placeOptions).
export function searchPlaces(options, q, limit = 8) {
  const t = placeKey(q).split(" ").filter(Boolean);
  if (!t.length) return [];
  return (options || []).map((o) => {
    const k = placeKey(o.label), own = placeKey(String(o.label).split(",")[0]);
    if (!t.every((w) => ` ${k}`.includes(` ${w}`))) return null;
    return { o, rank: own.startsWith(t.join(" ")) ? 0 : own.includes(t[0]) ? 1 : 2, len: k.length };
  }).filter(Boolean).sort((a, b) => a.rank - b.rank || a.len - b.len || a.o.label.localeCompare(b.o.label)).slice(0, limit).map((x) => x.o);
}
// The wine name without the words that already fill their own fields (owner, 2026-10-15): a grape in the grapes field and a place in the place field
// are taken out of the name ("Pinot Noir Cuvee Catherine Sonoma Coast" with Pinot Noir and Sonoma Coast -> "Cuvee Catherine"), together with the place's
// label term (DOC, DOCG, AOC ...) once its place is out. A rank always stays ("Corton Grand Cru" -> "Grand Cru", "Clos St Jacques 1er Cru"):
// Grand Cru, Premier Cru, Villages, Riserva and the like are an important distinction on the label (owner, 2026-10-15). Words are matched whole, accents, case and punctuation ignored, "St." read as "Saint".
// Leftover joining words at either end ("de", "di", "of" ...) go too. The name may end up empty: the wine is then known by its producer, type, place
// and grapes (a catalog wine's name can be empty; adding one reuses an existing wine only when those all agree, data.js addVenueCatalogWine).
const PLACE_TERMS = ["doc", "docg", "doca", "docq", "aoc", "aop", "ac", "do", "dop", "igt", "igp", "ava", "qba", "dac", "vdp"];
const JOINERS = new Set(["de", "di", "du", "des", "del", "della", "dei", "da", "la", "le", "les", "el", "of", "from", "and", "et", "e", "y", "und"]);
export function wineNameOf(text, { grapes = [], place = {} } = {}) {
  let words = String(text || "").trim().split(/\s+/).filter(Boolean);
  const placeNames = [place.appellation, place.region, place.country].map((x) => String(x || "").trim()).filter(Boolean);
  const phrases = [...(grapes || []), ...placeNames].map((x) => placeKey(x)).filter(Boolean).sort((a, b) => b.length - a.length);
  let placeOut = false;
  for (const ph of phrases) {
    for (let i = 0; i < words.length; i++) {
      for (let j = i + 1; j <= Math.min(words.length, i + 6); j++) {
        if (placeKey(words.slice(i, j).join(" ")) === ph) {
          if (placeNames.some((n) => placeKey(n) === ph)) placeOut = true;
          words = [...words.slice(0, i), ...words.slice(j)]; i--; break;
        }
      }
    }
  }
  if (placeOut) words = words.filter((w) => !PLACE_TERMS.includes(norm(w)));
  while (words.length && (JOINERS.has(norm(words[0])) || !norm(words[0]))) words.shift();
  while (words.length && (JOINERS.has(norm(words[words.length - 1])) || !norm(words[words.length - 1]))) words.pop();
  return words.join(" ");
}
// How many title words make up the producer's name (for the word chips).
export const splitOf = (title, producer) => prefixWords(String(title || "").trim().split(/\s+/).filter(Boolean), producer);

// Checks the editor's form before anything is saved. Returns { ok, why }.
export function checkReview(f) {
  if (!String(f.producer || "").trim()) return { ok: false, why: "Write the producer (tap the word where the producer's name ends)." };
  if (!["red", "white", "rose", "sparkling", "fortified"].includes(f.style)) return { ok: false, why: "Choose the type of wine." };
  if (f.vintage && !/^(\d{4}|NV)$/.test(f.vintage)) return { ok: false, why: "The vintage must be a year or NV." };
  return { ok: true, why: "" };
}


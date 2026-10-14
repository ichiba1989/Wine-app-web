// The venue version of the app: a shop, restaurant or bar whose own wines make up the deck. This branch is for Vintage Wine Merchants.
// Everything the app picks from the catalog to SHOW or SUGGEST (the Discover deck, Bingo help, This or That wines, Guess the Glass wines and suggestions)
// uses only the venue's list. What a player records about their own drinking (adding a wine they drank, typing one in, import, blind tasting, their
// journal and swipes) still uses the whole catalog, and wines a player adds by hand are never touched.
// "VWM" is only the internal short name (the branch, venue_id "vwm", code and docs); every screen says the full name.
// The list is kept in the database (venue_wines, docs/venue_decks.sql): the owner uploads the venue's file and adds or removes wines by hand on the Owner page.
// Pure: no browser, no network. It imports nothing, so the start of the app stays light (the file reading itself is done by importer.js, loaded on the Owner page).

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
const NOT_WINE = /\b(whisk(?:e)?y|bourbon|scotch|mezcal|tequila|calvados|distillato|grappa|cognac|brandy|vodka|gin|rum|sake|olive oil|corkscrew|decanter|glass(?:es)?|carafe|gift set|non alcoholic|perlage|wine bar|encyclopedia|guide|atlas|companion|zalto|coravin|riedel|pulltex|bullet)\b/i;
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
      m = matchRow({ producer: "", wine_name: p.text, vintage: p.vintage }, index, tindex);
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
export const listIds = (list) => new Set((list || []).filter((r) => r.wine_vintage_id).map((r) => r.wine_vintage_id));
export function venueCardsOf(cards, list) {
  const ids = listIds(list);
  return (cards || []).filter((c) => ids.has(c.id) && !c.archived);
}
// Catalog wines that could be added by hand: matching the search, not on the list yet.
export function addable(cards, list, q, limit = 20) {
  const t = norm(q), ids = listIds(list);
  if (t.length < 2) return [];
  return (cards || []).filter((c) => !c.archived && !ids.has(c.id) && norm(`${c.vintage} ${c.producer} ${c.cuvee} ${c.appellation} ${c.region}`).includes(t)).slice(0, limit);
}
// The Owner page list: matched wines first (A to Z), then the ones not in the catalog yet. Search over producer, wine and vintage.
export function listRows(list, cardsById, q = "") {
  const t = norm(q);
  return (list || []).map((r) => {
    const c = r.wine_vintage_id ? cardsById.get(r.wine_vintage_id) : null;
    const name = c ? [c.vintage, c.producer, c.cuvee].filter(Boolean).join(" ") : [r.vintage, r.producer, r.wine_name].filter(Boolean).join(" ");
    return { id: r.id, name, linked: !!c, unpublished: !!r.wine_vintage_id && !c, source: r.source || "file" };
  }).filter((x) => !t || norm(x.name).includes(t)).sort((a, b) => (b.linked - a.linked) || a.name.localeCompare(b.name));
}

// The flavor engine: which six flavors a wine shows, and in what order.
//   Base rule (no player data):  score(flavor) = the grape's weight + the place's nudge; the top six, ties broken by position in the grape's list, then the place's list.
//   Shared rule (database-wide): once a wine has enough journal entries (minEntries), what players wrote and tapped can swap up to maxSwaps of the six
//   (never fewer than two stay from the base rule), and the six are ordered by confidence. It is applied only to published stats and is never explained to the player.
// stats = { n, flavors: { flavor: entries that mention it }, tags: { tag: entries with that tag } } (nothing supplies this yet; without it the base rule is used).
// Pure: no browser, no network.
import { VAR as VAR0, VAR_ALIASES, PLACES, CATS, SYN, LABEL, fold, varKey, placeKey } from "./flavordata.js?v=1";

export const S = { minEntries: 10, fullEntries: 30, fullShare: 0.5, cap: 3, catWeight: 1, offProfile: 0.5, maxSwaps: 4, margin: 0.5 };
export { LABEL, CATS };

// ---------------------------------------------------------------- tables (the built-in set, then whatever the database has)
const T = { VAR: {}, REGION: new Map() };
function resetTables() {
  T.VAR = { ...VAR0 };
  T.REGION = new Map(PLACES.map((p) => [placeKey(p.country, p.name), { ...p }]));
}
resetTables();
export { resetTables };
// rows from the database: varietals [{ key, label, type, shape, weights: [[flavor, weight], ...] }], regions [{ key, name, country, kind, lat, lon, nudges }]
export function setTables({ varietals = [], regions = [] } = {}) {
  varietals.forEach((r) => {
    if (!r || !r.key || !Array.isArray(r.weights)) return;
    T.VAR[r.key] = { label: r.label || r.key, type: r.type || "red", shape: r.shape || "bordeaux", f: Object.fromEntries(r.weights.filter(([f, w]) => f in LABEL && w >= 1 && w <= 5)) };
  });
  regions.forEach((r) => {
    if (!r || !r.country || !r.name) return;
    T.REGION.set(r.key || placeKey(r.country, r.name), { country: r.country, name: r.name, kind: r.kind || "appellation", lat: r.lat, lon: r.lon, add: r.nudges || {} });
  });
}
export const tables = () => T;

// ---------------------------------------------------------------- finding the grape and the place for a card
const STYLE_VAR = { rose: "genericrose", sparkling: "genericsparkling", white: "genericwhite", fortified: "genericfortified" };
// The grape's profile, or for a sparkling or rosé wine the variant made for that type, else a profile for the type (a red grape's pepper and licorice do not
// belong on a rosé, and Champagne is not oaky). A white sparkling grape such as Glera or Moscato keeps its own profile.
export function varKeyFor(card) {
  const name = (card.grapes && card.grapes[0]) || (card.ruleGrapes && card.ruleGrapes[0]) || "";
  let k = varKey(name); k = VAR_ALIASES[k] || k;
  if (!T.VAR[k]) return STYLE_VAR[card.style] || "genericred";
  if (card.style === "sparkling") return T.VAR[k + "sparkling"] ? k + "sparkling" : T.VAR[k].type === "white" ? k : "genericsparkling";
  if (card.style === "rose") return T.VAR[k + "rose"] ? k + "rose" : "genericrose";
  return k;
}
export function placeKeysFor(card) {
  return [card.appellation, card.region].filter(Boolean).map((n) => placeKey(card.country, n)).filter((k) => T.REGION.has(k));
}
// The most specific place that is known: its name, kind (appellation or region), and where it is. null when the card gives none.
export function placeFor(card) {
  const keys = placeKeysFor(card);
  for (const k of keys) { const p = T.REGION.get(k); if (p && Number.isFinite(p.lat) && Number.isFinite(p.lon)) return { key: k, name: p.name, kind: p.kind, lat: p.lat, lon: p.lon, country: p.country }; }
  return null;
}
export const typeFor = (card, key) => (["red", "white", "rose", "sparkling", "fortified"].includes(card.style) ? card.style : (T.VAR[key] || {}).type || "red");
export const shapeFor = (card, key) => (card.style === "sparkling" ? "champagne" : (T.VAR[key] || T.VAR.genericred).shape);

// ---------------------------------------------------------------- the base rule
export function ruleScores(vk, placeKeys = []) {
  const vr = T.VAR[vk] || T.VAR.genericred, score = {}, order = [];
  Object.entries(vr.f).forEach(([f, w]) => { score[f] = w; order.push(f); });
  const nudge = {};
  placeKeys.forEach((k) => { const p = T.REGION.get(k); if (p) Object.entries(p.add || {}).forEach(([f, n]) => { nudge[f] = (nudge[f] || 0) + n; }); });
  Object.entries(nudge).forEach(([f, n]) => { score[f] = (score[f] || 0) + Math.min(2, n); if (!order.includes(f)) order.push(f); });
  return { score, order };
}
export const rank = (score, order, n) => [...order].filter((f) => score[f] > 0).sort((a, b) => score[b] - score[a] || order.indexOf(a) - order.indexOf(b)).slice(0, n);

// ---------------------------------------------------------------- signals
// Which categories a tag points at, depending on the type of wine.
export function tagCats(tag, type) {
  if (tag === "fruity") return type === "white" ? ["citrus", "orchard", "tropical"] : type === "rose" ? ["redfruit", "citrus", "tropical"] : type === "sparkling" ? ["citrus", "orchard"] : ["redfruit", "darkfruit"];
  if (tag === "sour") return ["citrus", "green"];
  if (tag === "sweet") return ["sweet", "orchard", "tropical"];
  return [];   // thin, heavy, drying: nothing
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
let RX = null;
// A word ending in y also matches its -ies plural (cherry, cherries; blackberry, blackberries).
const forms = (words) => words.flatMap((w) => (w.endsWith("y") ? [w, w.slice(0, -1) + "ie"] : [w]));
const regexes = () => RX || (RX = Object.fromEntries(Object.entries(SYN).map(([f, words]) => [f, new RegExp(`(?:^|[^a-z])(?:${forms(words.map((w) => w.toLowerCase())).map((w) => esc(w).replace(/ /g, "\\s+")).join("|")})(?:s|es|y|ed)?(?![a-z])`)])));
// The flavors a piece of text mentions: whole words with a simple ending, so "tart" is not tar and "limestone" is not lime. Each flavor counts once.
export function matchFlavors(text) {
  const t = String(text || "").toLowerCase(), rx = regexes();
  return Object.keys(rx).filter((f) => rx[f].test(t));
}
// stats from a list of entries { notes, tags }: how many entries there are and how many mention each flavor or carry each tag (each entry once).
export function buildStats(entries) {
  const stats = { n: 0, flavors: {}, tags: {} };
  (entries || []).forEach((e) => {
    stats.n += 1;
    matchFlavors(e.notes).forEach((f) => { stats.flavors[f] = (stats.flavors[f] || 0) + 1; });
    [...new Set(e.tags || [])].forEach((t) => { stats.tags[t] = (stats.tags[t] || 0) + 1; });
  });
  return stats;
}

// ---------------------------------------------------------------- the shared rule
export function sharedFlavors(vk, placeKeys, stats, type) {
  type = type || (T.VAR[vk] || {}).type;
  const { score: rule, order } = ruleScores(vk, placeKeys);
  const base = rank(rule, order, 6);
  if (!stats || stats.n < S.minEntries) return { picks: base, base, swaps: [], final: rule };
  const n = stats.n, size = Math.min(1, n / S.fullEntries);
  const ev = {};
  Object.entries(stats.flavors || {}).forEach(([f, c]) => {
    const share = Math.min(1, (c / n) / S.fullShare), w = rule[f] > 0 ? 1 : S.offProfile;
    ev[f] = (ev[f] || 0) + S.cap * share * w;
    if (!order.includes(f)) order.push(f);
  });
  Object.entries(stats.tags || {}).forEach(([tag, c]) => {
    const share = Math.min(1, (c / n) / S.fullShare);
    tagCats(tag, type).forEach((cat) => CATS[cat].forEach((f) => { if (rule[f] > 0) ev[f] = (ev[f] || 0) + S.catWeight * share; }));
  });
  const final = {};
  order.forEach((f) => { final[f] = (rule[f] || 0) + Math.min(S.cap, ev[f] || 0) * size; });
  let keep = [...base]; const swaps = [];
  const newcomers = order.filter((f) => !base.includes(f)).sort((a, b) => final[b] - final[a] || order.indexOf(a) - order.indexOf(b));
  for (const nc of newcomers) {
    if (swaps.length >= S.maxSwaps) break;
    const weakest = [...keep].sort((a, b) => final[a] - final[b] || order.indexOf(b) - order.indexOf(a))[0];
    // at least two of the six always come from the base rule
    const stillBase = keep.filter((f) => base.includes(f)).length - (base.includes(weakest) ? 1 : 0);
    if (final[nc] - final[weakest] >= S.margin && stillBase >= 2) { keep = keep.filter((f) => f !== weakest); keep.push(nc); swaps.push({ in: nc, out: weakest }); }
  }
  const picks = keep.sort((a, b) => final[b] - final[a] || order.indexOf(a) - order.indexOf(b));
  return { picks, base, swaps, final };
}

// ---------------------------------------------------------------- for a card
// { picks: [{ key, label }], shape, type, grape, ... }. stats is null until players have written enough about the wine.
export function flavorsForCard(card, stats = null) {
  const vk = varKeyFor(card), type = typeFor(card, vk), r = sharedFlavors(vk, placeKeysFor(card), stats, type === "fortified" ? "red" : type);
  return { grape: vk, type, shape: shapeFor(card, vk), picks: r.picks.map((key) => ({ key, label: LABEL[key] })), base: r.base, swaps: r.swaps };
}

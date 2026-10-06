// Recommendations: which catalog wines to suggest to this player, from different ANGLES ("lenses"). Built to be reused by any game or screen:
// pick a lens (or several), say which wines are allowed (accept), which to leave out (exclude) and how many you want.
// Pure: no page, no network. Everything is worked out from the catalog and the player's own swipes, ratings and quiz answers (the same taste model the
// Discover deck uses: deck.js userModel, prefOf, famOf). It never guesses facts about a wine, and the reasons only say things the data supports.
//
// The lenses
//   confident  "Safe bet"            Fits what they like on most fronts at once: style, grape, place, producer, how it feels and its flavors.
//   unique     "Something different" Hard to find, made from a rare grape, or unlike the usual wines of its style. Price counts quietly (it is never named).
//   challenge  "A stretch"           Something they have not tried yet (a new grape, region, country or style), kept to areas they are not known to dislike.
//   similar    "More like this"      Close to one wine they give (the seed): shared grape and place, how it feels, and flavors in common.
//   value      "Everyday pick"       Likely to be liked, easy to find, and gentle on the budget (a missing price counts as neutral).
// Add a lens by adding one entry to LENSES: score(ctx, card) returns { score, reason }.
import { prefOf, famOf, cardKeys, isLive, reachOf, VERDICT_WEIGHT, UNRATED_WEIGHT } from "./deck.js?v=4";
import { flavorsForCard } from "./flavors.js?v=1";
import { splitGrapeText } from "./grapes.js?v=1";
import { splitPlace } from "./blends.js?v=1";
import { wineName } from "./logic.js?v=10";

const fold = (s) => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const keyOf = (kind, v) => (v ? kind + ":" + fold(v) : "");   // the same key shape deck.js uses
const aff = (map, k) => { const v = map.get(k) || 0; return v / (Math.abs(v) + 1); };   // -1 to 1
const to01 = (a) => (a + 1) / 2;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const styleWord = (s) => (s === "rose" ? "rosé" : s || "wine");
const HIT = 0.6;                                            // a category counts as "fits" at this score or more
// How far each structure line can differ (the scales in logic.js DIMS), so differences are comparable.
const DIM_RANGE = { acidity: 4, body: 4, tannin: 4, sweetness: 3, oak: 2 };
const DIM_WORDS = { acidity: ["softer", "tarter"], body: ["lighter", "fuller"], tannin: ["smoother", "grippier"], sweetness: ["drier", "sweeter"], oak: ["less oaky", "oakier"] };

// How much each ingredient counts in each lens. The owner page lets these be tried out; pass a partial object as `weights` to buildContext to override some.
export const DEFAULT_WEIGHTS = {
  confident: { taste: 0.8, hits: 0.05, ease: 0.15 },
  unique: { rare: 0.35, grape: 0.25, odd: 0.25, price: 0.15 },
  challenge: { grape: 0.35, region: 0.25, country: 0.15, style: 0.1, taste: 0.15 },
  similar: { keys: 0.4, flavors: 0.3, structure: 0.3 },
  value: { taste: 0.5, ease: 0.2, cheap: 0.3 },
};
export function mergeWeights(over) {
  const out = {};
  Object.keys(DEFAULT_WEIGHTS).forEach((lens) => {
    out[lens] = { ...DEFAULT_WEIGHTS[lens] };
    Object.keys((over && over[lens]) || {}).forEach((k) => { const v = Number(over[lens][k]); if (k in out[lens] && Number.isFinite(v) && v >= 0) out[lens][k] = v; });
  });
  return out;
}

// ---------------------------------------------------------------- the context (worked out once, shared by every lens)
// cards: catalog cards. model: userModel(...). refs: structureMap(...). journal / states: the player's own. seed: a card, for the "similar" lens.
export function buildContext({ cards = [], model, refs = new Map(), crowd = null, journal = [], states = [], seed = null, weights = null }) {
  const live = cards.filter(isLive), byId = new Map(cards.map((c) => [c.id, c]));
  const flavorCache = new Map();
  const flavorsOf = (c) => {
    if (!flavorCache.has(c.id)) { let keys = []; try { keys = flavorsForCard(c).picks.map((p) => p.key); } catch (_) { /* a card that cannot be read has no flavors */ } flavorCache.set(c.id, keys); }
    return flavorCache.get(c.id);
  };
  // Flavors they like: the flavors of the catalog wines they rated well (weights as in the deck: buy 2 ... no -2).
  const flavorPref = new Map();
  (journal || []).forEach((e) => {
    const c = byId.get(e.wine_vintage_id); if (!c) return;
    const w = e.verdict ? (VERDICT_WEIGHT[e.verdict] ?? 0) : UNRATED_WEIGHT;
    flavorsOf(c).forEach((k) => flavorPref.set(k, (flavorPref.get(k) || 0) + w));
  });
  // What they have tried: every wine in the journal (rated or not) and every wine they swiped "I've had this bottle".
  const tried = new Set();
  const addKeys = (k) => [...k.grapes, k.region, k.country, k.style, k.producer].filter(Boolean).forEach((x) => tried.add(x));
  (journal || []).forEach((e) => {
    const c = byId.get(e.wine_vintage_id);
    if (c) { addKeys(cardKeys(c)); return; }
    const p = splitPlace(e.region || e.region_text || "");     // a wine typed in by hand
    splitGrapeText(e.grape || e.grape_text || "").forEach((g) => tried.add(keyOf("grape", g)));
    [keyOf("region", p.region), keyOf("country", p.country || e.country), keyOf("style", e.style), keyOf("producer", e.producer)].filter(Boolean).forEach((x) => tried.add(x));
  });
  (states || []).filter((s) => s.familiarity === "had").forEach((s) => { const c = byId.get(s.wine_vintage_id); if (c) addKeys(cardKeys(c)); });
  // Rarity of grapes, and the usual structure of each style, across the live catalog.
  const grapeCount = new Map(); live.forEach((c) => cardKeys(c).grapes.forEach((g) => grapeCount.set(g, (grapeCount.get(g) || 0) + 1)));
  const maxCount = Math.max(1, ...grapeCount.values());
  const centroid = {};
  live.forEach((c) => { const r = refs.get(c.id); if (!r) return; const s = c.style || "unknown"; centroid[s] = centroid[s] || { n: {}, sum: {} };
    Object.keys(DIM_RANGE).forEach((d) => { if (typeof r[d] === "number") { centroid[s].n[d] = (centroid[s].n[d] || 0) + 1; centroid[s].sum[d] = (centroid[s].sum[d] || 0) + r[d]; } }); });
  // Where each price sits among the priced wines (0 cheapest, 1 dearest). Too few prices and it says nothing: everything is neutral.
  const priced = live.filter((c) => typeof c.price === "number").map((c) => c.price).sort((a, b) => a - b);
  return { weights: mergeWeights(weights), cards: live, byId, model, refs, crowd, tried, flavorPref, flavorsOf, grapeCount, maxCount, centroid, priced, seed, seedFlavors: seed ? flavorsOf(seed) : [], hasPrices: priced.length >= 5 };
}
export function pricePct(ctx, c) {
  if (!ctx.hasPrices || typeof c.price !== "number") return 0.5;
  const below = ctx.priced.filter((p) => p < c.price).length, same = ctx.priced.filter((p) => p === c.price).length;
  return clamp01((below + (same - 1) / 2) / Math.max(1, ctx.priced.length - 1));
}
// How unlike the usual wine of its style this one is (0 to 1), and which line differs most and which way.
export function oddness(ctx, c) {
  const r = ctx.refs.get(c.id), g = ctx.centroid[c.style || "unknown"];
  if (!r || !g) return { value: 0, dim: null, dir: 0 };
  let total = 0, count = 0, best = { dim: null, dir: 0, gap: 0 };
  Object.keys(DIM_RANGE).forEach((d) => {
    if (typeof r[d] !== "number" || !g.n[d]) return;
    const diff = (r[d] - g.sum[d] / g.n[d]) / DIM_RANGE[d];
    total += Math.abs(diff); count++;
    if (Math.abs(diff) > best.gap) best = { dim: d, dir: diff > 0 ? 1 : 0, gap: Math.abs(diff) };
  });
  return { value: count ? clamp01(mean([total / count]) * 2) : 0, dim: best.dim, dir: best.dir };   // x2: even a clear difference averages out low across five lines
}
const grapeRarity = (ctx, c) => { const g = cardKeys(c).grapes; if (!g.length) return { value: 0.4, grape: null }; let best = { value: 0, grape: null }; g.forEach((k) => { const v = 1 - Math.log(1 + (ctx.grapeCount.get(k) || 1)) / Math.log(2 + ctx.maxCount); if (v > best.value) best = { value: v, grape: k }; }); return best; };
const grapeLabel = (c, key) => [...(c.grapes || []), ...(c.ruleGrapes || [])].find((n) => keyOf("grape", n) === key) || "";
const joinList = (xs) => (xs.length <= 1 ? xs.join("") : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1]);

// How close two wines are in structure (0 to 1), or null when either has no structure.
function structureCloseness(refs, a, b) {
  const ra = refs.get(a.id), rb = refs.get(b.id); if (!ra || !rb) return null;
  const ds = Object.keys(DIM_RANGE).filter((d) => typeof ra[d] === "number" && typeof rb[d] === "number");
  return ds.length ? 1 - mean(ds.map((d) => Math.abs(ra[d] - rb[d]) / DIM_RANGE[d])) : null;
}

// ---------------------------------------------------------------- the lenses
export const LENSES = {
  confident: {
    label: "Safe bet", blurb: "Fits what you like on most fronts.",
    score(ctx, c) {
      const { model, refs } = ctx, k = cardKeys(c), P = model.pref;
      const cats = [];                                      // [name, 0 to 1 or null]
      cats.push(["style", k.style ? to01(aff(P, k.style)) : null]);
      cats.push(["grape", k.grapes.length ? to01(Math.max(...k.grapes.map((g) => aff(P, g)))) : null]);
      const reg = k.region ? aff(P, k.region) : 0, cty = k.country ? 0.7 * aff(P, k.country) : 0;
      cats.push(["where it's from", k.region || k.country ? to01(Math.abs(reg) >= Math.abs(cty) ? reg : cty) : null]);
      cats.push(["producer", k.producer ? to01(aff(P, k.producer)) : null]);
      const r = refs.get(c.id);
      const ds = model.palateDims && r ? Object.keys(model.palate).filter((d) => typeof r[d] === "number") : [];
      cats.push(["how it feels", ds.length ? 1 - ds.reduce((s, d) => s + Math.abs(model.palate[d] - r[d]), 0) / ds.length / 4 : null]);
      const fl = ctx.flavorsOf(c);
      cats.push(["flavors", fl.length ? mean(fl.map((f) => to01(aff(ctx.flavorPref, f)))) : null]);
      const known = cats.filter((x) => x[1] !== null), hits = known.filter((x) => x[1] >= HIT).map((x) => x[0]);
      const w = ctx.weights.confident;
      const score = w.taste * (known.length ? mean(known.map((x) => x[1])) : 0.5) + w.hits * Math.min(4, hits.length) + w.ease * famOf(c, model, ctx.crowd);
      const reason = hits.length >= 2 ? `Matches your taste in ${joinList(hits.slice(0, 3))}.` : hits.length === 1 ? `Matches your taste in ${hits[0]}.` : (Number(c.reach) >= 4 ? "Easy to find, a good place to start." : "");
      return { score, reason, hits: hits.length };
    },
  },
  unique: {
    label: "Something different", blurb: "Rare, or unlike the usual wines of its style.",
    score(ctx, c) {
      const rare = (5 - reachOf(c)) / 4, gr = grapeRarity(ctx, c), odd = oddness(ctx, c), pr = pricePct(ctx, c);
      const taste = 0.5 + 0.5 * prefOf(c, ctx.model, ctx.refs);            // never something they are known to dislike
      const w = ctx.weights.unique, parts = [["rare", w.rare * rare], ["grape", w.grape * gr.value], ["odd", w.odd * odd.value], ["price", w.price * pr]];
      const score = parts.reduce((s, p) => s + p[1], 0) * taste;
      const top = [...parts].sort((a, b) => b[1] - a[1])[0][0];            // the price is used in the score but never named
      const names = { rare: rare >= 0.5 ? "Hard to find, not on every shelf." : "", grape: gr.grape && gr.value >= 0.5 ? `Made from a rare grape in our catalog: ${grapeLabel(c, gr.grape)}.` : "",
        odd: odd.dim && odd.value >= 0.15 ? `Unusual for a ${styleWord(c.style)}: ${DIM_WORDS[odd.dim][odd.dir]} than most of ours.` : "" };
      const reason = names[top] || names.rare || names.grape || names.odd || "Not your everyday bottle.";
      return { score, reason };
    },
  },
  challenge: {
    label: "A stretch", blurb: "Something you have not tried yet.",
    score(ctx, c) {
      const k = cardKeys(c), t = ctx.tried, pref = prefOf(c, ctx.model, ctx.refs);
      const newGrapes = k.grapes.filter((g) => !t.has(g)), grapeNew = k.grapes.length ? (newGrapes.length === k.grapes.length ? 1 : 0) : 0.5;
      const regionNew = k.region && !t.has(k.region) ? 1 : 0, countryNew = k.country && !t.has(k.country) ? 1 : 0, styleNew = k.style && !t.has(k.style) ? 1 : 0;
      const w = ctx.weights.challenge;
      let score = w.grape * grapeNew + w.region * regionNew + w.country * countryNew + w.style * styleNew + w.taste * pref;
      if (pref < 0.3) score *= 0.5;                                          // keep to a stretch they might enjoy, not something they are known to dislike
      const bits = [];
      if (grapeNew === 1 && k.grapes.length) bits.push(`you have not tried ${grapeLabel(c, newGrapes[0]) || "this grape"} yet`);
      if (regionNew) bits.push(`it is a new region for you (${c.appellation || c.region})`);
      else if (countryNew) bits.push(`it is your first wine from ${c.country}`);
      if (styleNew && !bits.length) bits.push(`you have not tried a ${styleWord(c.style)} yet`);
      return { score, reason: bits.length ? `New for you: ${joinList(bits)}.` : "" };
    },
  },
  similar: {
    label: "More like this", blurb: "Close to a wine you give.",
    score(ctx, c) {
      const seed = ctx.seed;
      if (!seed || seed.id === c.id) return { score: -1, reason: "" };
      const a = cardKeys(seed), b = cardKeys(c);
      const setA = new Set([...a.grapes, a.region, a.country, a.style, a.producer].filter(Boolean)), setB = new Set([...b.grapes, b.region, b.country, b.style, b.producer].filter(Boolean));
      const inter = [...setA].filter((x) => setB.has(x)).length, union = new Set([...setA, ...setB]).size;
      const fa = new Set(ctx.seedFlavors), fb = ctx.flavorsOf(c), sharedFl = fb.filter((f) => fa.has(f));
      const flavorJ = fa.size || fb.length ? sharedFl.length / new Set([...fa, ...fb]).size : null;
      const st = structureCloseness(ctx.refs, seed, c);
      const w = ctx.weights.similar, parts = [[w.keys, union ? inter / union : 0], [w.flavors, flavorJ], [w.structure, st]].filter((p) => p[1] !== null);
      const wsum = parts.reduce((s, p) => s + p[0], 0) || 1;
      const score = parts.reduce((s, p) => s + p[0] * p[1], 0) / wsum;
      const same = [];
      const sharedGrape = b.grapes.find((g) => a.grapes.includes(g)); if (sharedGrape) same.push(`grape (${grapeLabel(c, sharedGrape)})`);
      if (b.region && b.region === a.region) same.push(`region (${c.appellation || c.region})`); else if (b.country && b.country === a.country) same.push(`country (${c.country})`);
      if (b.style && b.style === a.style) same.push("style");
      const flavors = joinList(sharedFl.slice(0, 2).map((f) => String(f).replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()));
      const reason = same.length ? `Like ${wineName(seed)}: same ${joinList(same.slice(0, 2))}.${flavors ? ` Flavors in common: ${flavors}.` : ""}` : flavors ? `Like ${wineName(seed)}. Flavors in common: ${flavors}.` : "";
      return { score, reason };
    },
  },
  value: {
    label: "Everyday pick", blurb: "Likely to be liked, easy to find, gentle on the budget.",
    score(ctx, c) {
      const pct = pricePct(ctx, c);
      const w = ctx.weights.value;
      const score = w.taste * prefOf(c, ctx.model, ctx.refs) + w.ease * famOf(c, ctx.model, ctx.crowd) + w.cheap * (1 - pct);
      return { score, reason: ctx.hasPrices && typeof c.price === "number" && pct <= 0.35 ? "Easy on the wallet." : (Number(c.reach) >= 4 ? "Easy to find, a good everyday pick." : "") };
    },
  },
};
export const LENS_IDS = Object.keys(LENSES);

// ---------------------------------------------------------------- picking
// One lens. cards, model, refs (and journal, states, crowd, seed) build the context, or pass a ready ctx to share it between calls.
// exclude: Set of card ids to skip. accept: card => true to keep it. The same producer is not suggested twice.
export function recommend({ lens = "confident", ctx = null, exclude = new Set(), accept = () => true, limit = 3, ...rest }) {
  const L = LENSES[lens];
  if (!L) throw new Error("Unknown recommendation lens: " + lens);
  const context = ctx || buildContext(rest);
  const scored = [];
  context.cards.forEach((c) => {
    if (exclude.has(c.id) || !accept(c)) return;
    const r = L.score(context, c);
    if (r.score >= 0 || lens !== "similar") scored.push({ card: c, lens, label: L.label, ...r });
  });
  scored.sort((a, b) => b.score - a.score || String(a.card.id).localeCompare(String(b.card.id)));
  const out = [], producers = new Set();
  for (const r of scored) {
    const p = cardKeys(r.card).producer;
    if (p && producers.has(p)) continue;
    producers.add(p); out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}
// The best wine from each of several lenses, never the same wine twice (a wine taken by an earlier lens is skipped by the later ones).
export function recommendMix({ lenses = ["confident", "unique", "challenge"], exclude = new Set(), ...rest }) {
  const ctx = rest.ctx || buildContext(rest), taken = new Set(exclude), out = [];
  lenses.forEach((lens) => {
    const [pick] = recommend({ ...rest, ctx, lens, exclude: taken, limit: 1 });
    if (pick) { taken.add(pick.card.id); out.push(pick); }
  });
  return out;
}

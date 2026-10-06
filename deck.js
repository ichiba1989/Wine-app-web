// The Discover deck. Pure logic: no page, no network, so it can be tested on its own.
//
// Idea: every wine the person has not swiped yet is given
//   fam  (0 to 1)  how likely they are to RECOGNIZE it: how easy it is to find, plus what they already know
//                  (producers, grapes, places they recognized or have had; quiz answers; what other players recognized)
//   pref (0 to 1)  how likely they are to LIKE it: styles, grapes, places and producers they enjoyed or marked
//                  swiped (not marked not interested), and how close its structure is to the wines they rated well
// and is put into one of three decks by fam:
//   high    "I might know this"    (familiar)
//   medium  "Maybe"                (some connection)
//   low     "New territory"        (little connection)
// The deck they swipe is a MIX of the three, interleaved evenly, never in long runs. A newer or less certain person gets
// mostly familiar wines; as they show more knowledge the mix moves toward medium and low. If they stop recognizing things the mix
// eases back toward familiar; if they recognize everything it moves toward new territory. Inside each deck the wines they are
// likelier to like come first, with some randomness so it never feels fixed, and the same producer or place does not repeat back to back.

export const TIERS = ["high", "medium", "low"];
export const TIER_LABEL = { high: "Familiar", medium: "Getting warmer", low: "New territory" };
// A wine with fam at or above HIGH_AT goes in the high deck; at or above MEDIUM_AT in the medium deck; below that, low.
export const HIGH_AT = 0.55, MEDIUM_AT = 0.28;
// Whatever the numbers say, each deck holds at least this share of the wines left to swipe, so there is always something familiar
// and always something new. The wines moved are the ones nearest the line: the least familiar go to low, the most familiar to high.
export const MIN_SHARE = 0.15;
// "How easy to find" (reach, set by editors, 1 to 5; 3 when nobody has set it) is the starting point for familiarity.
export const DEFAULT_REACH = 3;

export const clamp01 = (v) => Math.max(0, Math.min(1, v));
const fold = (s) => String(s == null ? "" : s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const keyOf = (kind, v) => (v ? kind + ":" + fold(v) : "");

// Everything about a card that the deck cares about, as keys.
export function cardKeys(c) {
  const grapes = [...new Set([...(c.grapes || []), ...(c.ruleGrapes || [])].map((g) => keyOf("grape", g)).filter(Boolean))];
  return {
    producer: keyOf("producer", c.producer), grapes, country: keyOf("country", c.country), region: keyOf("region", c.region || c.appellation),
    style: keyOf("style", c.style),
  };
}
export const reachOf = (c) => { const r = Number(c.reach); return r >= 1 && r <= 5 ? r : DEFAULT_REACH; };
export const isLive = (c) => !c.archived && (!c.wineStatus || c.wineStatus === "verified");

// ---------------------------------------------------------------- what we know about the person
// states: [{ wine_vintage_id, familiarity: 'recognize'|'unknown'|'had', interest: 'try'|'nope', last_swiped_at }]
// journal: [{ wine_vintage_id, verdict, is_outside_wine, producer, style, ... }]
// quiz: { Grapes: { correct, answered }, Regions: {...}, Producers: {...} } (optional)
export function userModel({ cards, states = [], journal = [], quiz = null, refs = new Map() }) {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const rec = new Map(), unk = new Map(), pref = new Map();
  const add = (m, k, v) => { if (k) m.set(k, (m.get(k) || 0) + v); };
  const eachKey = (c, fn) => { const k = cardKeys(c); [k.producer, k.country, k.region, k.style, ...k.grapes].forEach((x) => x && fn(x, x.split(":")[0])); };
  let recognized = 0, unknown = 0;
  const ordered = [...states].sort((a, b) => String(b.last_swiped_at || "").localeCompare(String(a.last_swiped_at || "")));
  states.forEach((s) => {
    const c = byId.get(s.wine_vintage_id); if (!c) return;
    // A wine only marked "not interested" has no familiarity: it says what they dislike, not what they know.
    if (s.familiarity === "unknown") { unknown++; eachKey(c, (k) => add(unk, k, 1)); }
    else if (s.familiarity) { recognized++; eachKey(c, (k) => add(rec, k, s.familiarity === "had" ? 1.5 : 1)); }
    if (s.interest === "try") eachKey(c, (k, kind) => add(pref, k, kind === "style" ? 0.4 : 0.6));
    else if (s.interest === "nope") eachKey(c, (k, kind) => add(pref, k, kind === "style" ? -0.4 : -0.6));
  });
  // The journal: a wine in it is a wine they know. Verdicts say how much they liked it.
  const liked = [];
  journal.forEach((e) => {
    const c = e.wine_vintage_id ? byId.get(e.wine_vintage_id) : null;
    const w = e.verdict ? (VERDICT_WEIGHT[e.verdict] ?? 0) : UNRATED_WEIGHT;
    if (c) {
      eachKey(c, (k) => { add(rec, k, 2); add(pref, k, w); });
      if (w > 0) liked.push({ w, id: c.id, style: c.style });
    } else if (e.producer) {   // a wine they typed in
      const pk = keyOf("producer", e.producer); add(rec, pk, 2); add(pref, pk, w);
      const sk = keyOf("style", e.style); if (sk) add(pref, sk, w * 0.5);
    }
  });
  // The structure of the wines they liked, as a palate to compare new wines with (needs at least two).
  const dims = ["acidity", "body", "tannin"];
  const sums = { acidity: [0, 0], body: [0, 0], tannin: [0, 0] };
  liked.forEach(({ w, id }) => { const r = refs.get(id); if (!r) return; dims.forEach((d) => { if (typeof r[d] === "number") { sums[d][0] += w * r[d]; sums[d][1] += w; } }); });
  const palate = {}; let palateDims = 0;
  dims.forEach((d) => { if (sums[d][1] > 0 && liked.filter((l) => refs.get(l.id) && typeof refs.get(l.id)[d] === "number").length >= 2) { palate[d] = sums[d][0] / sums[d][1]; palateDims++; } });
  // Knowledge from the quiz: share correct with a little shrinkage so two answers do not decide everything.
  const topics = quiz ? ["Grapes", "Regions", "Producers"].map((t) => quiz[t]).filter((q) => q && q.answered > 0) : [];
  const quizAnswered = topics.reduce((n, q) => n + q.answered, 0);
  const quizAcc = topics.length ? topics.reduce((s, q) => s + (q.correct + 1) / (q.answered + 2), 0) / topics.length : null;
  const swipeCount = recognized + unknown;
  const recRate = swipeCount >= 5 ? recognized / swipeCount : null;
  // Overall knowledge, 0 to 1. A brand new person starts around a quarter.
  const knowledge = clamp01(0.35 * (quizAnswered >= 5 && quizAcc != null ? quizAcc : 0.3) + 0.35 * (recRate != null ? recRate : 0.4) + 0.30 * Math.min(1, journal.length / 25));
  // How the last ten swipes went: the share they recognized (only once there are at least four).
  const recent = ordered.filter((s) => s.familiarity).slice(0, 10);
  const recentRate = recent.length >= 4 ? recent.filter((s) => s.familiarity !== "unknown").length / recent.length : null;
  return { rec, unk, pref, palate, palateDims, quizAcc, quizAnswered, knowledge, recentRate, swipeCount, journalCount: journal.length };
}

// ---------------------------------------------------------------- scoring one wine
const evidence = (m, n, k) => { const r = m.get(k) || 0, u = n.get(k) || 0; return r / (r + u + 1); };   // 0 with no evidence, toward 1 as they keep recognizing
const affinity = (pref, k) => { const v = pref.get(k) || 0; return v / (Math.abs(v) + 1); };                 // -1 to 1
export function famOf(c, model, crowd) {
  const k = cardKeys(c);
  const base = (reachOf(c) - 1) / 4;
  const cr = crowd && crowd.get(c.id);
  const prior = cr && cr.seen >= 3 ? 0.5 * base + 0.5 * ((cr.recognized + 2 * base) / (cr.seen + 2)) : base;
  const producerKnown = k.producer ? evidence(model.rec, model.unk, k.producer) : 0;
  const grapeKnown = k.grapes.length ? Math.max(...k.grapes.map((g) => evidence(model.rec, model.unk, g))) : 0;
  const placeKnown = Math.max(k.region ? evidence(model.rec, model.unk, k.region) : 0, 0.6 * (k.country ? evidence(model.rec, model.unk, k.country) : 0));
  const quizKnow = model.quizAcc == null ? 0.4 : model.quizAcc;
  const user = clamp01(0.55 * producerKnown + 0.25 * grapeKnown + 0.10 * placeKnown + 0.10 * quizKnow);
  return clamp01(0.65 * prior + 0.35 * user);
}
export function prefOf(c, model, refs) {
  const k = cardKeys(c), P = model.pref;
  const to01 = (a) => (a + 1) / 2;
  const parts = [];
  parts.push([0.20, to01(affinity(P, k.style))]);
  parts.push([0.30, k.grapes.length ? to01(Math.max(...k.grapes.map((g) => affinity(P, g)))) : 0.5]);
  const regA = k.region ? affinity(P, k.region) : 0, ctyA = k.country ? 0.7 * affinity(P, k.country) : 0;
  parts.push([0.20, to01(Math.abs(regA) >= Math.abs(ctyA) ? regA : ctyA)]);   // the place they feel most strongly about
  parts.push([0.10, k.producer ? to01(affinity(P, k.producer)) : 0.5]);
  const r = refs && refs.get(c.id);
  if (model.palateDims && r) {
    const ds = Object.keys(model.palate).filter((d) => typeof r[d] === "number");
    if (ds.length) parts.push([0.20, 1 - ds.reduce((s, d) => s + Math.abs(model.palate[d] - r[d]), 0) / ds.length / 4]);
  }
  const wsum = parts.reduce((s, p) => s + p[0], 0);
  return clamp01(parts.reduce((s, p) => s + p[0] * p[1], 0) / wsum);
}
export const tierOf = (fam) => (fam >= HIGH_AT ? "high" : fam >= MEDIUM_AT ? "medium" : "low");
// entries: [{ fam, tier, tie }] changed in place. Does nothing for fewer than 6 wines.
export function balanceTiers(entries, minShare = MIN_SHARE) {
  const n = entries.length;
  if (n < 6) return entries;
  const need = Math.ceil(minShare * n);
  const count = (t) => entries.filter((e) => e.tier === t).length;
  const asc = [...entries].sort((a, b) => a.fam - b.fam || a.tie - b.tie);
  for (const e of asc) { if (count("low") >= need) break; if (e.tier !== "low") e.tier = "low"; }
  for (const e of [...asc].reverse()) { if (count("high") >= need) break; if (e.tier === "medium" || (e.tier === "low" && count("low") > need)) e.tier = "high"; }
  return entries;
}

// ---------------------------------------------------------------- how much of each deck
// Weights sum to 1. The more someone knows, the more medium and low; the last ten swipes nudge it.
export function mixFor(model) {
  const L = model.knowledge;
  let high = 0.60 - 0.35 * L, low = 0.08 + 0.27 * L;
  const r = model.recentRate;
  if (r != null && r < 0.30) { const s = Math.min(low - 0.03, 0.12); high += s; low -= s; }          // not recognizing much: ease back
  else if (r != null && r > 0.80) { const s = Math.min(high - 0.15, 0.12); high -= s; low += s; }     // recognizing everything: stretch
  high = clamp01(high); low = clamp01(low);
  return { high, medium: Math.max(0, 1 - high - low), low };
}

// ---------------------------------------------------------------- the deck
// Returns { deck: [card], info: Map(id -> { tier, fam, pref }), mix, model }.
export function buildDeck({ cards, states = [], journal = [], quiz = null, refs = new Map(), crowd = null }, { rnd = Math.random, size = Infinity } = {}) {
  const swiped = new Set(states.map((s) => s.wine_vintage_id));
  const model = userModel({ cards, states, journal, quiz, refs });
  const info = new Map();
  const queues = { high: [], medium: [], low: [] };
  const entries = [];
  cards.forEach((c) => {
    if (swiped.has(c.id) || !isLive(c)) return;
    const fam = famOf(c, model, crowd), pref = prefOf(c, model, refs);
    entries.push({ c, fam, pref, tier: tierOf(fam), tie: rnd() });
  });
  balanceTiers(entries);
  entries.forEach((e) => {
    info.set(e.c.id, { tier: e.tier, fam: e.fam, pref: e.pref });
    queues[e.tier].push({ c: e.c, score: e.pref + 0.35 * rnd() });   // likelier favourites first, with enough randomness to stay fresh (a bottle photo does not change the order)
  });
  TIERS.forEach((t) => queues[t].sort((a, b) => b.score - a.score));
  const mix = mixFor(model);
  const credits = { high: 0, medium: 0, low: 0 };
  const deck = [], recent = [];
  const total = queues.high.length + queues.medium.length + queues.low.length;
  const want = Math.min(size, total);
  const conflicts = (c) => {
    const k = cardKeys(c);
    return recent.slice(-3).some((r) => r.producer && r.producer === k.producer) || recent.slice(-2).some((r) => r.country && r.country === k.country && r.style === k.style && r.grape === (k.grapes[0] || ""));
  };
  while (deck.length < want) {
    const open = TIERS.filter((t) => queues[t].length);
    const sum = open.reduce((s, t) => s + mix[t], 0) || 1;
    open.forEach((t) => { credits[t] += (mix[t] || 0.0001) / sum; });
    const pick = open.reduce((best, t) => (credits[t] > credits[best] ? t : best), open[0]);
    credits[pick] -= 1;
    const q = queues[pick];
    // Avoid repeating a producer or place back to back: take the first of the next few wines that does not repeat.
    let i = q.slice(0, 6).findIndex((x) => !conflicts(x.c)); if (i < 0) i = 0;
    const [{ c }] = q.splice(i, 1);
    deck.push(c);
    const k = cardKeys(c); recent.push({ producer: k.producer, country: k.country, style: k.style, grape: k.grapes[0] || "" });
  }
  return { deck, info, mix, model };
}

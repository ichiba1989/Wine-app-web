// This or That: a quick game of food pairs ("Ribeye or filet mignon?"). Each pick quietly leans toward one side of a wine's structure
// (fuller or lighter, zesty or soft, ...). The player is only ever asked about FOOD: wine is not named in a question. At the end the game says
// what the picks lean toward, in everyday words, and lists a few catalog wines whose starting profile points the same way.
// This file is pure (no browser, no network). The screens are in games.js; app.js holds the clicks and remembers the answers on the phone.
//
// What the data means: a "lean" is { axis, dir }. It says that choosing this food nudges toward the high (+1) or low (-1) end of one structure line
// (the same lines as DIMS in logic.js). These nudges are a game's best guess about taste, NOT wine facts and not a score of the player; they are not saved to the
// database and do not change the Discover deck. An editor should read the list before testers use it (docs/PRE_TEST_REVIEW.md).

// axis words: what each end means to a player, in everyday language (no wine terms).
export const AXES = {
  body: { lo: "lighter, easy-going wines", hi: "bolder, fuller wines", range: [1, 5] },
  acidity: { lo: "soft, mellow wines", hi: "zesty, mouth-watering wines", range: [1, 5] },
  tannin: { lo: "smooth wines", hi: "dry, grippy reds", range: [1, 5] },
  sweetness: { lo: "dry wines", hi: "sweeter wines", range: [0, 3] },
  oak: { lo: "clean, fresh wines", hi: "toasty, buttery wines", range: [0, 2] },
};
export const AXIS_ORDER = ["body", "acidity", "sweetness", "tannin", "oak"];

const L = (axis, dir) => ({ axis, dir });
// Pairs are plain data: add one by adding an entry. Keep both foods ordinary and the difference clear. emoji is only decoration.
export const PAIRS = [
  { id: "steak", a: { label: "Ribeye", emoji: "🥩", lean: L("body", 1) }, b: { label: "Filet mignon", emoji: "🥩", lean: L("body", -1) } },
  { id: "candy", a: { label: "Sour candy", emoji: "🍬", lean: L("acidity", 1) }, b: { label: "Sweet candy", emoji: "🍭", lean: L("sweetness", 1) } },
  { id: "choc", a: { label: "Dark chocolate", emoji: "🍫", lean: L("tannin", 1) }, b: { label: "Milk chocolate", emoji: "🍫", lean: L("tannin", -1) } },
  { id: "fruit", a: { label: "Grapefruit", emoji: "🍊", lean: L("acidity", 1) }, b: { label: "Ripe peach", emoji: "🍑", lean: L("acidity", -1) } },
  { id: "coffee", a: { label: "Black coffee", emoji: "☕", lean: L("tannin", 1) }, b: { label: "Sweet latte", emoji: "🥛", lean: L("sweetness", 1) } },
  { id: "bread", a: { label: "Buttery croissant", emoji: "🥐", lean: L("oak", 1) }, b: { label: "Crusty plain baguette", emoji: "🥖", lean: L("oak", -1) } },
  { id: "meal", a: { label: "Burger", emoji: "🍔", lean: L("body", 1) }, b: { label: "Grilled fish", emoji: "🐟", lean: L("body", -1) } },
  { id: "salty", a: { label: "Dill pickles", emoji: "🥒", lean: L("acidity", 1) }, b: { label: "Candied nuts", emoji: "🥜", lean: L("sweetness", 1) } },
  { id: "dinner", a: { label: "Creamy pasta", emoji: "🍝", lean: L("body", 1) }, b: { label: "Crisp green salad", emoji: "🥗", lean: L("body", -1) } },
  { id: "cook", a: { label: "Charred barbecue", emoji: "🔥", lean: L("oak", 1) }, b: { label: "Steamed vegetables", emoji: "🥦", lean: L("oak", -1) } },
  { id: "cheese", a: { label: "Aged sharp cheddar", emoji: "🧀", lean: L("body", 1) }, b: { label: "Fresh mozzarella", emoji: "🧀", lean: L("body", -1) } },
  { id: "cold", a: { label: "Lemon sorbet", emoji: "🍨", lean: L("acidity", 1) }, b: { label: "Vanilla ice cream", emoji: "🍦", lean: L("acidity", -1) } },
];
export const pairById = (id) => PAIRS.find((p) => p.id === id) || null;

// ---------------------------------------------------------------- answers: { pairId: "a" | "b" | "skip" }
export const emptyAnswers = () => ({});
export function parseAnswers(text) {
  try {
    const r = JSON.parse(text), out = {};
    for (const p of PAIRS) if (r && (r[p.id] === "a" || r[p.id] === "b" || r[p.id] === "skip")) out[p.id] = r[p.id];
    return out;
  } catch (_) { return emptyAnswers(); }
}
// A new object each time (the old one is not touched). An unknown pair or choice changes nothing.
export function answer(answers, pairId, choice) {
  if (!pairById(pairId) || !["a", "b", "skip"].includes(choice)) return answers;
  return { ...answers, [pairId]: choice };
}
export const nextPair = (answers) => PAIRS.find((p) => !answers[p.id]) || null;
export const answeredCount = (answers) => PAIRS.filter((p) => answers[p.id]).length;
export const pickedCount = (answers) => PAIRS.filter((p) => answers[p.id] === "a" || answers[p.id] === "b").length;
export const isDone = (answers) => !nextPair(answers);

// ---------------------------------------------------------------- what the picks lean toward
// One entry per line that at least one pick touched: { axis, score (-n..n), n (picks on this line), dir (-1, 0, 1), strength ("hint" | "lean"), words }.
// Picks on one line that pull opposite ways cancel out (dir 0, "no clear lean"). One pick is only a hint.
export function leanings(answers) {
  const by = {};
  for (const p of PAIRS) {
    const ch = answers[p.id]; if (ch !== "a" && ch !== "b") continue;
    const { axis, dir } = p[ch].lean;
    by[axis] = by[axis] || { axis, score: 0, n: 0 };
    by[axis].score += dir; by[axis].n += 1;
  }
  return AXIS_ORDER.filter((k) => by[k]).map((k) => {
    const e = by[k], dir = Math.sign(e.score);
    return { ...e, dir, strength: e.n >= 2 && dir !== 0 ? "lean" : "hint", words: dir === 0 ? "" : AXES[k][dir > 0 ? "hi" : "lo"] };
  });
}

// ---------------------------------------------------------------- wines whose starting profile points the same way
// structure: Map(wine id -> { body, acidity, ... }) from structure.js structureMap (editor scores, then rules). A wine with no profile for any leaning line is skipped.
// Each line scores from -1 (the wrong end) to +1 (the right end), weighted by how firmly the picks lean. Reasons only name lines where the wine really sits at the matching end.
const place = (axis, v) => { const [lo, hi] = AXES[axis].range; return typeof v === "number" ? (v - (lo + hi) / 2) / ((hi - lo) / 2) : null; };
export function matchWines({ answers, cards, structure, exclude = new Set(), limit = 3, accept = () => true }) {
  const leans = leanings(answers).filter((l) => l.dir !== 0);
  if (!leans.length) return [];
  const out = [];
  for (const c of cards || []) {
    if (exclude.has(c.id) || !accept(c)) continue;
    const prof = structure && structure.get(c.id); if (!prof) continue;
    let total = 0, weight = 0; const why = [];
    for (const l of leans) {
      const p = place(l.axis, prof[l.axis]); if (p === null) continue;
      const w = Math.min(l.n, 3);   // the more picks on a line, the more it counts, up to three
      total += p * l.dir * w; weight += w;
      if (p * l.dir >= 0.4) why.push(AXES[l.axis][l.dir > 0 ? "hi" : "lo"]);
    }
    if (!weight || total / weight < 0.35 || !why.length) continue;
    out.push({ card: c, score: total / weight, why });
  }
  // best fit first; a tie goes to the name, so the list does not shuffle between visits
  out.sort((x, y) => y.score - x.score || String(x.card.producer).localeCompare(String(y.card.producer)));
  return out.slice(0, limit).map((m) => ({ card: m.card, reason: "Its profile points to " + m.why.slice(0, 2).join(" and ") + "." }));
}

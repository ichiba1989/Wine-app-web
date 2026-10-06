// Wine Bingo: nine-square cards that fill up as a player rates wines. Pure logic: no page, no network, so it can be tested on its own.
//
// How it works
//   * A square is filled by a wine the player has RATED (a journal entry with a verdict). Having had the bottle is not enough; rating it is the point.
//   * One wine fills at most one square on a card, so a card takes nine different wines. (If a wine could fit two squares, the cards are filled
//     so that as many squares as possible are filled.) Rating the same wine twice still counts once.
//   * Three squares in a row, column or diagonal is a bingo. A card is CLEARED with its first bingo. All nine is a blackout.
//   * Cards come in four tiers, easy to nerdy. Clearing CLEARS_TO_UNLOCK cards of a tier opens the next tier.
//   * Progress is worked out from the journal each time. Which cards have been cleared is remembered on the phone so deleting an old journal entry
//     never closes a tier again.
//
// What a square is allowed to ask (all matched against facts the app already holds, never guessed):
//   style, verdict, country, place (region, appellation or country text), grape, text (producer, wine name, vineyard), age, decade, nv, all, any.
// "Draft" cards (the very specific ones) name particular vineyards and growths. Those lists are facts, so an editor must check them against a
// source before testers rely on them; see docs/PRE_TEST_REVIEW.md.
import { fold as foldText, splitGrapeText } from "./grapes.js?v=1";
import { splitPlace } from "./blends.js?v=1";

export const CLEARS_TO_UNLOCK = 3;
export const TIERS = [
  { n: 1, title: "First sips", blurb: "Colors, countries and your honest verdicts." },
  { n: 2, title: "Getting curious", blurb: "Famous grapes and famous places." },
  { n: 3, title: "Wine nerd", blurb: "Specific appellations, lesser-known grapes and older bottles." },
  { n: 4, title: "Specialist", blurb: "Named vineyards and classified growths." },
];

// ---------------------------------------------------------------- the cards (data)
const sq = (id, label, test, hint) => ({ id, label, test, hint: hint || `Rate a wine that fits "${label}".` });
const style = (s, label) => sq(`style-${s}`, label, { style: s });
const verdict = (v, label) => sq(`verdict-${v}`, label, { verdict: [v] }, `Rate a wine and choose "${label}".`);
const country = (name, label) => sq(`country-${name}`, label || name, { country: name }, `Rate a wine from ${name}.`);
const place = (names, label) => sq(`place-${names[0]}`, label || names[0], { place: names }, `Rate a wine from ${label || names[0]}.`);
const grape = (names, label) => sq(`grape-${names[0]}`, label || names.join(" or "), { grape: names }, `Rate a wine made from ${label || names.join(" or ")}.`);
const mix = (s, c, label) => sq(`mix-${s}-${c}`, label, { all: [{ style: s }, { country: c }] }, `Rate a ${label.toLowerCase()}.`);

export const CARDS = [
  // ---- tier 1
  { id: "color-wheel", tier: 1, title: "Color wheel", blurb: "Every kind of wine, plus three big countries.",
    squares: [style("red", "Red wine"), style("white", "White wine"), style("rose", "Rosé"), style("sparkling", "Sparkling"), style("fortified", "Fortified (like port)"),
      sq("nv", "Non-vintage (NV)", { nv: true }, 'Rate a wine with "NV" instead of a year.'), country("USA"), country("France"), country("Italy")] },
  { id: "your-verdicts", tier: 1, title: "Say what you think", blurb: "Use all five verdicts, and try four kinds of wine.",
    squares: [verdict("buy", "Would buy again"), verdict("drink", "Would drink again"), verdict("none", "No preference"), verdict("respect", "Dislike, but understand"), verdict("no", "Did not like"),
      style("red", "Red wine"), style("white", "White wine"), style("sparkling", "Sparkling"), style("rose", "Rosé")] },
  { id: "around-the-world", tier: 1, title: "Around the world", blurb: "Nine countries, nine bottles.",
    squares: [country("USA"), country("France"), country("Italy"), country("Spain"), country("Germany"), country("Australia"), country("Argentina"), country("Chile"), country("New Zealand")] },
  { id: "mix-and-match", tier: 1, title: "Mix and match", blurb: "Colors from different countries.",
    squares: [mix("red", "France", "Red from France"), mix("red", "Italy", "Red from Italy"), mix("red", "USA", "Red from the USA"), mix("white", "France", "White from France"),
      mix("white", "Italy", "White from Italy"), mix("white", "USA", "White from the USA"), style("sparkling", "Sparkling"), style("rose", "Rosé"), country("Spain")] },
  // ---- tier 2
  { id: "famous-grapes", tier: 2, title: "Famous grapes", blurb: "The grapes you see on shelves everywhere.",
    squares: [grape(["Cabernet Sauvignon"]), grape(["Pinot Noir"]), grape(["Chardonnay"]), grape(["Merlot"]), grape(["Sauvignon Blanc"]), grape(["Riesling"]), grape(["Syrah", "Shiraz"]), grape(["Malbec"]), grape(["Zinfandel"])] },
  { id: "old-world", tier: 2, title: "Old World tour", blurb: "Classic regions of Europe.",
    squares: [place(["Bordeaux"]), place(["Burgundy", "Bourgogne"], "Burgundy"), place(["Champagne"]), place(["Rhône", "Rhone"], "Rhône"), place(["Loire"]), place(["Tuscany", "Toscana"], "Tuscany"),
      place(["Piedmont", "Piemonte"], "Piedmont"), place(["Rioja"]), place(["Mosel"])] },
  { id: "new-world", tier: 2, title: "New World tour", blurb: "Famous regions outside Europe.",
    squares: [place(["Napa Valley"]), place(["Sonoma", "Russian River Valley", "Dry Creek Valley"], "Sonoma"), place(["Willamette Valley"]), place(["Marlborough"]), place(["Mendoza"]),
      place(["Columbia Valley"]), place(["Santa Barbara County"]), place(["South Australia", "Barossa"], "South Australia"), place(["Colchagua", "Apalta"], "Colchagua")] },
  { id: "bubbles-and-more", tier: 2, title: "Bubbles and beyond", blurb: "Sparkling, rosé and fortified.",
    squares: [style("sparkling", "Sparkling"), place(["Champagne"]), place(["Prosecco"]), mix("sparkling", "USA", "Sparkling from the USA"), mix("sparkling", "Italy", "Sparkling from Italy"),
      mix("sparkling", "France", "Sparkling from France"), style("rose", "Rosé"), mix("rose", "France", "Rosé from France"), style("fortified", "Fortified (like port)")] },
  // ---- tier 3
  { id: "italy-deep-dive", tier: 3, title: "Italy deep dive", blurb: "Nine Italian appellations.",
    squares: [place(["Barolo"]), place(["Barbaresco"]), place(["Brunello di Montalcino"]), place(["Chianti Classico"]), place(["Vino Nobile di Montepulciano"]), place(["Amarone"], "Amarone della Valpolicella"),
      place(["Etna"]), place(["Soave"]), place(["Prosecco"])] },
  { id: "france-deep-dive", tier: 3, title: "France deep dive", blurb: "Nine French appellations.",
    squares: [place(["Chablis"]), place(["Sancerre"]), place(["Margaux"]), place(["Pauillac"]), place(["Saint-Émilion", "St Emilion", "Saint Emilion"], "Saint-Émilion"), place(["Pomerol"]),
      place(["Châteauneuf-du-Pape", "Chateauneuf du Pape"], "Châteauneuf-du-Pape"), place(["Hermitage"]), place(["Vouvray"])] },
  { id: "grape-detective", tier: 3, title: "Grape detective", blurb: "Grapes you will not find in every shop.",
    squares: [grape(["Nebbiolo"]), grape(["Sangiovese"]), grape(["Tempranillo"]), grape(["Grenache", "Garnacha"]), grape(["Gamay"]), grape(["Chenin Blanc"]), grape(["Albariño", "Albarino"], "Albariño"),
      grape(["Carmenère", "Carmenere"], "Carmenère"), grape(["Grüner Veltliner", "Gruner Veltliner"], "Grüner Veltliner")] },
  { id: "time-traveler", tier: 3, title: "Time traveler", blurb: "Wines with some age on them.",
    squares: [sq("age-5", "5+ years old", { age: 5 }, "Rate a wine that was at least 5 years old when you drank it."), sq("age-10", "10+ years old", { age: 10 }, "Rate a wine at least 10 years old."),
      sq("age-15", "15+ years old", { age: 15 }, "Rate a wine at least 15 years old."), sq("age-20", "20+ years old", { age: 20 }, "Rate a wine at least 20 years old."),
      sq("decade-2010", "A 2010s vintage", { decade: 2010 }, "Rate a wine from 2010 to 2019."), sq("decade-2000", "A 2000s vintage", { decade: 2000 }, "Rate a wine from 2000 to 2009."),
      sq("decade-1990", "A 1990s vintage", { decade: 1990 }, "Rate a wine from 1990 to 1999."),
      sq("old-red", "Red, 10+ years old", { all: [{ style: "red" }, { age: 10 }] }, "Rate a red wine at least 10 years old."),
      sq("old-white", "White, 10+ years old", { all: [{ style: "white" }, { age: 10 }] }, "Rate a white wine at least 10 years old.")] },
  // ---- tier 4: draft (named vineyards and growths: facts an editor must verify)
  { id: "grand-cru-burgundy", tier: 4, draft: true, title: "Grand Cru Burgundy", blurb: "Famous Grand Cru vineyards of Burgundy.",
    note: "Enter Burgundy as the region and the vineyard in the wine's name or vineyard field, so the card can find it.",
    squares: ["Chambertin", "Clos de Vougeot", "Musigny", "Románée-Conti|Romanee Conti", "La Tâche|La Tache", "Échezéaux|Echezeaux", "Bonnes-Mares|Bonnes Mares", "Montrachet", "Corton-Charlemagne|Corton Charlemagne"]
      .map((n) => { const names = n.split("|"); return sq(`gc-${names[names.length - 1]}`, names[0].replace("Románée", "Romanée"), { all: [{ text: names }, { place: ["Burgundy", "Bourgogne"] }] }, `Rate a ${names[0].replace("Románée", "Romanée")} (Burgundy).`); }) },
  { id: "bordeaux-growths", tier: 4, draft: true, title: "Bordeaux classified growths", blurb: "First Growths of the Médoc and top-ranked St-Émilion.",
    note: "Classifications change over time (St-Émilion is revised about every ten years). An editor must check this list against the current official classification.",
    squares: [
      sq("bx-lafite", "Château Lafite Rothschild", { all: [{ text: ["Chateau Lafite Rothschild", "Lafite Rothschild"] }, { place: ["Bordeaux", "Pauillac"] }] }),
      sq("bx-latour", "Château Latour", { all: [{ text: ["Chateau Latour"] }, { place: ["Bordeaux", "Pauillac"] }] }),
      sq("bx-margaux", "Château Margaux", { all: [{ text: ["Chateau Margaux"] }, { place: ["Bordeaux", "Margaux"] }] }),
      sq("bx-haut-brion", "Château Haut-Brion", { all: [{ text: ["Chateau Haut Brion"], not: ["La Mission", "Laville"] }, { place: ["Bordeaux", "Pessac"] }] }),
      sq("bx-mouton", "Château Mouton Rothschild", { all: [{ text: ["Mouton Rothschild"] }, { place: ["Bordeaux", "Pauillac"] }] }),
      sq("bx-ausone", "Château Ausone", { all: [{ text: ["Chateau Ausone"] }, { place: ["Bordeaux", "Saint Emilion", "St Emilion"] }] }),
      sq("bx-cheval-blanc", "Château Cheval Blanc", { all: [{ text: ["Cheval Blanc"] }, { place: ["Bordeaux", "Saint Emilion", "St Emilion"] }] }),
      sq("bx-angelus", "Château Angélus", { all: [{ text: ["Chateau Angelus"] }, { place: ["Bordeaux", "Saint Emilion", "St Emilion"] }] }),
      sq("bx-pavie", "Château Pavie", { all: [{ text: ["Chateau Pavie"], not: ["Macquin", "Decesse"] }, { place: ["Bordeaux", "Saint Emilion", "St Emilion"] }] })] },
  { id: "barolo-crus", tier: 4, draft: true, title: "Barolo and Barbaresco crus", blurb: "Single vineyards of Piedmont.",
    note: "Enter Piedmont as the region and the vineyard in the wine's name or vineyard field, so the card can find it.",
    squares: ["Cannubi", "Brunate", "Cerequio", "Monprivato", "Rocche dell'Annunziata", "Bussia", "Vigna Rionda", "Asili", "Rabajà|Rabaja"]
      .map((n) => { const names = n.split("|"); return sq(`bc-${names[names.length - 1]}`, names[0], { all: [{ text: names }, { place: ["Piedmont", "Piemonte", "Barolo", "Barbaresco"] }] }, `Rate a wine from the ${names[0]} vineyard.`); }) },
];
export const cardById = (id) => CARDS.find((c) => c.id === id) || null;
export const cardsOfTier = (n) => CARDS.filter((c) => c.tier === n);

// ---------------------------------------------------------------- facts about a rated wine
const norm = (s) => foldText(s).replace(/[^a-z0-9]+/g, " ").trim();
// whole-word match: "latour" is not found in "Latouraine"; "Bordeaux" is found in "Bordeaux Superieur"
const has = (hay, needle) => { const n = norm(needle); return !!n && (" " + hay + " ").includes(" " + n + " "); };
const yearOf = (text) => { const m = /^(\d{4})/.exec(String(text || "")); return m ? Number(m[1]) : null; };

// Everything a square may ask about one rated wine. entry: a journal entry; card: its catalog card (or null for a wine typed in by hand).
export function factsOf(entry, card, today = new Date()) {
  const raw = (card && card.raw) || {};
  let grapes, region, appellation, countryName, vineyard, classification;
  if (card) {
    grapes = [...(card.grapes || []), ...(card.ruleGrapes || [])];
    region = card.region || ""; appellation = card.appellation || ""; countryName = card.country || "";
    vineyard = card.vineyard || raw.vineyard || ""; classification = raw.classification || "";
  } else {
    grapes = splitGrapeText(entry.grape || entry.grape_text || "");
    const p = splitPlace(entry.region || entry.region_text || "");
    region = p.region || ""; appellation = ""; countryName = p.country || entry.country || ""; vineyard = ""; classification = "";
  }
  const year = entry.is_non_vintage ? null : (Number(entry.vintage_year) || null);
  const drankYear = yearOf(entry.consumed_on) || today.getFullYear();
  return {
    key: entry.wine_vintage_id ? "w:" + entry.wine_vintage_id : entry.user_wine_id ? "u:" + entry.user_wine_id : "t:" + norm([entry.producer, entry.wine_name, entry.vintage_year].join(" ")),
    name: [entry.is_non_vintage ? "NV" : entry.vintage_year, entry.producer, entry.wine_name].filter(Boolean).join(" "),
    style: entry.style || (card && card.style) || "unknown", verdict: entry.verdict || null,
    grapes: grapes.map(norm), country: norm(countryName), placeText: norm([region, appellation, countryName, classification].join(" | ")),
    text: norm([entry.producer, entry.wine_name, vineyard, appellation].join(" ")),
    nv: !!entry.is_non_vintage, year, age: year ? drankYear - year : null,
  };
}
// The rated wines, one per wine (the latest rating wins), oldest first. A journal entry with no verdict is not rated yet and does not count.
export function ratedWines(journal, cardsById = new Map(), today = new Date()) {
  const sorted = [...(journal || [])].filter((e) => e && e.verdict).sort((a, b) => String(a.consumed_on || "").localeCompare(String(b.consumed_on || "")) || String(a.created_at || "").localeCompare(String(b.created_at || "")));
  const byKey = new Map();
  sorted.forEach((e) => { const f = factsOf(e, e.wine_vintage_id ? cardsById.get(e.wine_vintage_id) || null : null, today); byKey.delete(f.key); byKey.set(f.key, f); });
  return [...byKey.values()];
}

// ---------------------------------------------------------------- matching
export function matches(test, w) {
  if (!test) return false;
  if (test.all) return test.all.every((t) => matches(t, w));
  if (test.any) return test.any.some((t) => matches(t, w));
  if (test.style !== undefined) return w.style === test.style;
  if (test.verdict) return !!w.verdict && test.verdict.includes(w.verdict);
  if (test.country !== undefined) return w.country === norm(test.country);
  if (test.place) return test.place.some((n) => has(w.placeText, n));
  if (test.grape) return test.grape.some((n) => w.grapes.includes(norm(n)));
  if (test.text) return test.text.some((n) => has(w.text, n)) && !(test.not || []).some((n) => has(w.text, n));
  if (test.age !== undefined) return w.age !== null && w.age >= test.age;
  if (test.decade !== undefined) return w.year !== null && w.year >= test.decade && w.year < test.decade + 10;
  if (test.nv !== undefined) return w.nv === test.nv;
  return false;
}

// ---------------------------------------------------------------- filling a card
export const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
// One wine per square, filling as many squares as possible (squares in order, wines oldest first, so the result is the same every time).
export function fillSquares(squares, wines) {
  const canFill = squares.map((s) => wines.map((w, i) => (matches(s.test, w) ? i : -1)).filter((i) => i >= 0));
  const squareOfWine = new Array(wines.length).fill(-1);
  const place = (si, seen) => {
    for (const wi of canFill[si]) {
      if (seen.has(wi)) continue;
      seen.add(wi);
      if (squareOfWine[wi] < 0 || place(squareOfWine[wi], seen)) { squareOfWine[wi] = si; return true; }
    }
    return false;
  };
  squares.forEach((_, si) => place(si, new Set()));
  const filled = new Array(squares.length).fill(null);
  squareOfWine.forEach((si, wi) => { if (si >= 0) filled[si] = wines[wi]; });
  return filled;
}
export function cardProgress(card, wines) {
  const filled = fillSquares(card.squares, wines);
  const done = filled.map((f) => !!f);
  const lines = LINES.filter((l) => l.every((i) => done[i]));
  return { filled, done, count: done.filter(Boolean).length, lines, bingo: lines.length > 0, blackout: done.every(Boolean) };
}
export function allProgress(wines, cards = CARDS) {
  const m = new Map();
  cards.forEach((c) => m.set(c.id, cardProgress(c, wines)));
  return m;
}

// ---------------------------------------------------------------- unlocking (remembered on the phone)
export const emptyMemory = () => ({ cleared: {}, blackout: {} });
export function parseMemory(text) {
  try {
    const r = JSON.parse(text);
    const pick = (o) => Object.fromEntries(Object.keys(o || {}).filter((k) => cardById(k) && o[k] === 1).map((k) => [k, 1]));
    return { cleared: pick(r && r.cleared), blackout: pick(r && r.blackout) };
  } catch (_) { return emptyMemory(); }
}
// Adds any newly cleared card to the memory. news says which ones are new this time, so the screen can celebrate them once.
// Only cards in OPEN tiers earn credit (tiers are checked in order, and a tier that just opened is checked in the same pass). A card in a locked tier
// still shows its progress once the tier opens, but it cannot be cleared, or unlock anything, before then.
export function mergeMemory(memory, progress) {
  const next = { cleared: { ...memory.cleared }, blackout: { ...memory.blackout } }, news = [];
  for (const t of TIERS) {
    if (!tierOpen(t.n, next)) break;
    cardsOfTier(t.n).forEach((c) => {
      const p = progress.get(c.id);
      if (!p) return;
      if (p.bingo && !next.cleared[c.id]) { next.cleared[c.id] = 1; news.push({ id: c.id, kind: "bingo" }); }
      if (p.blackout && !next.blackout[c.id]) { next.blackout[c.id] = 1; news.push({ id: c.id, kind: "blackout" }); }
    });
  }
  return { memory: news.length ? next : memory, news };
}
export const clearedIn = (tier, memory) => cardsOfTier(tier).filter((c) => memory.cleared[c.id]).length;
// Tier 1 is always open; each later tier opens when CLEARS_TO_UNLOCK cards of the one before it are cleared.
export function tierOpen(tier, memory) { return tier <= 1 || clearedIn(tier - 1, memory) >= CLEARS_TO_UNLOCK; }

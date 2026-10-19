// At a restaurant: from the dishes, the occasion, how adventurous tonight is, the wine list and the player's own taste to three picks and a ranked list.
// Pure (no browser, no network). The list lines come from winelist.js (card-shaped, so the same taste model and lenses as Discover read them); the food
// ratings come from foods.js. Every reason said to the player is built from stored facts: a pairing reason from foods.js, what the player's own history
// likes (the lens reasons in recommend.js), the occasion's plain note, and for a list wine the words the list itself stated. Nothing is invented.
// A list line with too little (winelist.js confidence "low") is shown last as "not enough on the list to judge" and is never a pick.
import { LENSES, buildContext, oddness } from "./recommend.js?v=15";
import { structureMap } from "./structure.js?v=14";
import { FOODS, WINE_KINDS, kindById, kindOfValues, pair, ratingOf, fitOf, RATING_LABEL } from "./foods.js?v=2";
import { plainKey } from "./text.js?v=2";
import { wineName } from "./logic.js?v=23";

// ---------------------------------------------------------------- dishes: everyday words to a dish in foods.js
// Each entry is a list of words or phrases (whole words, accents and capitals ignored). The longest phrase that matches wins, so "fried calamari" is fried
// fish and "bbq ribs" is sticky glazed ribs. Add words freely; a dish nobody matches is simply offered to build with the plate parts. Every line is to check.
const DISH_WORDS = {
  oysters: ["oyster", "oysters", "raw bar", "clams", "clam"],
  sushi: ["sushi", "sashimi", "crudo", "ceviche", "poke", "tuna tartare"],
  "fried-fish": ["fried", "tempura", "fish and chips", "fritto", "fritti", "fried calamari", "calamari", "fish fry"],
  "grilled-fish": ["sea bass", "branzino", "cod", "halibut", "snapper", "trout", "sole", "grilled fish", "baked fish", "white fish", "shrimp", "prawn", "prawns", "scallop", "scallops", "monkfish", "mussels", "fish"],
  salmon: ["salmon", "tuna", "swordfish", "arctic char"],
  lobster: ["lobster", "crab", "crayfish", "langoustine", "butter sauce"],
  chicken: ["chicken", "turkey", "poulet", "pollo", "quail", "roast chicken"],
  pork: ["pork", "pork chop", "porchetta", "schnitzel", "roast pork", "ham"],
  duck: ["duck", "goose", "confit", "pheasant", "duck breast"],
  burger: ["burger", "hamburger", "cheeseburger", "hot dog", "brisket"],
  steak: ["steak", "ribeye", "rib eye", "filet", "fillet", "sirloin", "strip", "beef", "tenderloin", "wagyu", "prime rib", "t bone", "porterhouse"],
  lamb: ["lamb", "rack of lamb", "venison", "game", "veal", "roast lamb"],
  stew: ["stew", "braise", "braised", "short rib", "short ribs", "ragu", "ragù", "osso buco", "bourguignon", "pot roast", "cassoulet", "bolognese"],
  charcuterie: ["charcuterie", "salumi", "prosciutto", "cured meat", "cured meats", "salami", "jamon", "antipasti", "antipasto"],
  salad: ["salad", "greens", "arugula", "caprese", "goat cheese", "beet salad"],
  tomato: ["pizza", "margherita", "marinara", "tomato", "pomodoro", "pasta", "spaghetti", "lasagna", "arrabbiata", "penne"],
  "creamy-pasta": ["carbonara", "alfredo", "risotto", "creamy", "cream sauce", "mac and cheese", "gnocchi", "quiche", "cacio e pepe"],
  mushroom: ["mushroom", "mushrooms", "truffle", "porcini"],
  veg: ["vegetable", "vegetables", "roasted vegetables", "eggplant", "aubergine", "cauliflower", "squash", "vegetarian", "tofu"],
  "soft-cheese": ["brie", "camembert", "burrata", "mozzarella", "ricotta", "soft cheese"],
  "hard-cheese": ["parmesan", "parmigiano", "cheddar", "gouda", "manchego", "aged cheese", "gruyere", "cheese board", "cheese plate", "cheese"],
  "blue-cheese": ["blue cheese", "gorgonzola", "roquefort", "stilton"],
  curry: ["curry", "vindaloo", "tikka", "masala", "spicy", "chili", "chilli", "jerk", "szechuan", "sichuan", "mapo", "indian"],
  thai: ["thai", "pad thai", "stir fry", "stir-fry", "pho", "satay", "laksa", "vietnamese", "banh mi", "noodles"],
  "bbq-glaze": ["ribs", "bbq", "barbecue", "glazed", "teriyaki", "hoisin", "honey glazed", "pulled pork"],
  chocolate: ["chocolate", "brownie", "lava cake", "tiramisu", "mole", "cocoa"],
  "fruit-tart": ["tart", "tarte", "fruit", "apple pie", "crumble", "sorbet", "panna cotta", "cheesecake", "creme brulee", "dessert"],
  nuts: ["nuts", "chips", "crisps", "popcorn", "olives", "pretzels", "fries", "snacks"],
};
const padded = (t) => ` ${plainKey(t)} `;
// One dish from a few typed words, or null. Returns { id, word } (the word that matched).
export function matchDish(text) {
  const t = padded(text); let best = null;
  for (const [id, words] of Object.entries(DISH_WORDS)) {
    for (const w of words) {
      const k = ` ${plainKey(w)} `;
      if (t.includes(k) && (!best || k.length > best.len)) best = { id, word: w, len: k.length };
    }
  }
  return best ? { id: best.id, word: best.word } : null;
}

// ---------------------------------------------------------------- occasions
// Small, plain adjustments: they change the order, never say a wine is bad. `odd` is how unlike the usual wine of its style (0 to 1), from recommend.js.
export const OCCASIONS = [
  { id: "casual", label: "Casual night", blurb: "Easy, versatile wines. Nothing precious." },
  { id: "celebration", label: "Celebration", blurb: "A sparkling toast to start, then something special." },
  { id: "date", label: "Date night", blurb: "A wine to linger over, not the lightest." },
  { id: "business", label: "Business dinner", blurb: "Well-liked styles; the most unusual wines are held back." },
];
export const occasionById = (id) => OCCASIONS.find((o) => o.id === id) || null;
const LIGHT = ["crisp-white", "light-red", "rose"], WELL_LIKED = ["medium-red", "crisp-white", "rich-white"], LINGER = ["medium-red", "full-red", "rich-white", "sparkling"];
export function occasionAdjust(occasion, kindId, odd, versatile) {
  switch (occasion) {
    case "casual": { const adj = 0.1 * versatile - 0.15 * odd; return { adj, note: odd >= 0.4 ? "A little unusual for a casual night." : versatile >= 0.7 ? "Easy and versatile for a casual night." : "" }; }
    case "celebration": {
      if (kindId === "sparkling") return { adj: 0.3, note: "A sparkling wine for a toast to start the celebration." };
      return { adj: LINGER.includes(kindId) ? 0.1 : 0, note: LINGER.includes(kindId) ? "A bottle with some occasion about it." : "" };
    }
    case "date": return LIGHT.includes(kindId) ? { adj: -0.12, note: "" } : { adj: LINGER.includes(kindId) ? 0.1 : 0, note: LINGER.includes(kindId) ? "Something to linger over." : "" };
    case "business": { const adj = -0.4 * Math.max(0, odd - 0.2) + (WELL_LIKED.includes(kindId) ? 0.1 : 0); return { adj, note: WELL_LIKED.includes(kindId) && odd < 0.35 ? "A well-liked style for a business dinner." : odd >= 0.35 ? "On the unusual side for a business dinner." : "" }; }
    default: return { adj: 0, note: "" };
  }
}
export const ADVENTURES = [
  { id: 0, label: "My usual", blurb: "Stay close to what you already like." },
  { id: 1, label: "A little different", blurb: "Mostly your taste, with something new." },
  { id: 2, label: "Surprise me", blurb: "Lean towards the new and unusual." },
];

// ---------------------------------------------------------------- the advice
const RATE = { ideal: 1, good: 0.75, okay: 0.4, avoid: 0 };
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const norm = (vals) => { const lo = Math.min(...vals), hi = Math.max(...vals); return vals.map((v) => (hi > lo ? (v - lo) / (hi - lo) : 0.5)); };
// How much each lens's taste score counts at each level of "how adventurous": a usual wine matters more when staying close, a new one when feeling bold.
const LENS_MULT = { confident: [1.3, 1, 0.8], unique: [0.6, 1, 1.4], challenge: [0.6, 1, 1.4] };
const PICKS = [{ lens: "confident", label: "Safe bet" }, { lens: "unique", label: "Something different" }, { lens: "challenge", label: "A stretch" }];

// list: [{ line, card }] from winelist.readList. dishes: [dish profile from foods.js] (one per diner; may be empty). catalog: the catalog cards (taste context and
// how unusual a wine is are measured against them). Returns { picks, ranked, unjudged, notes }.
export function advise({ list, dishes = [], occasion = "casual", adventure = 1, catalog = [], model, refs = new Map(), crowd = null, journal = [], states = [] }) {
  const cards = list.map((x) => x.card);
  const listRefs = structureMap(cards.filter((c) => c.source !== "catalog"), null);
  const allRefs = new Map([...refs, ...listRefs]);
  const ctx = buildContext({ cards: catalog, model, refs: allRefs, crowd, journal, states });
  const eligible = cards.filter((c) => c.confidence !== "low"), unjudged = cards.filter((c) => c.confidence === "low");
  const notes = [];
  if (!eligible.length) return { picks: [], ranked: [], unjudged: unjudged.map((c) => ({ card: c })), notes: ["None of the lines say enough to judge. Add the type, a grape or a place."] };
  if (!dishes.length) notes.push("No dishes chosen, so the order is by your taste and the occasion.");
  const a = Math.max(0, Math.min(2, Number(adventure) || 0));
  // per wine: its kind, its fit with each dish, its taste scores in each lens, and the occasion's say
  const rows = eligible.map((c) => {
    const values = allRefs.get(c.id) || null, style = c.style, kind = kindOfValues(values, style);
    const dishRows = kind ? dishes.map((d) => { const p = pair(d, kind); return { dish: d, rating: p.rating, reasons: p.reasons, score: RATE[p.rating] }; }) : [];
    const foodMean = dishRows.length ? mean(dishRows.map((r) => r.score)) : 0.5, foodWorst = dishRows.length ? Math.min(...dishRows.map((r) => r.score)) : 0.5;
    const odd = oddness(ctx, c).value;
    const occ = kind ? occasionAdjust(occasion, kind.id, odd, 0.5 * foodMean + 0.5 * foodWorst) : { adj: 0, note: "" };
    const taste = {}; PICKS.forEach((p) => { taste[p.lens] = LENSES[p.lens].score(ctx, c); });
    return { card: c, kind, dishRows, foodMean, foodWorst, odd, occ, taste };
  });
  const tn = {}; PICKS.forEach((p) => { const n = norm(rows.map((r) => r.taste[p.lens].score)); rows.forEach((r, i) => { r.taste[p.lens].norm = n[i]; }); tn[p.lens] = true; });
  const totalFor = (r, lens) => 0.45 * (0.5 * r.foodMean + 0.5 * r.foodWorst) + 0.35 * LENS_MULT[lens][a] * r.taste[lens].norm + r.occ.adj;
  const overall = (r) => (a === 0 ? totalFor(r, "confident") : a === 1 ? (totalFor(r, "confident") + totalFor(r, "unique")) / 2 : (totalFor(r, "unique") + totalFor(r, "challenge")) / 2);
  // a pick must suit the food when there are dishes: good or better if any wine does, else okay (and never worse)
  const suits = (r, min) => !dishes.length || r.foodMean >= min;
  const taken = new Set(), picks = [];
  PICKS.forEach((p) => {
    const order = (min) => rows.filter((r) => !taken.has(r.card.id) && suits(r, min)).sort((x, y) => totalFor(y, p.lens) - totalFor(x, p.lens))[0];
    const best = order(RATE.good - 1e-9) || order(RATE.okay);
    if (!best) return;
    taken.add(best.card.id); picks.push(decorate(best, { pick: p.label, lens: p.lens, dishes, occasion }));
  });
  // a celebration starts with a toast: the best sparkling wine on the list (by taste and the food), whatever the dishes, apart from the three picks
  let toast = null;
  if (occasion === "celebration") {
    const sp = rows.filter((r) => r.kind && r.kind.id === "sparkling" && !taken.has(r.card.id)).sort((x, y) => (0.5 * y.foodMean + 0.5 * y.taste.confident.norm) - (0.5 * x.foodMean + 0.5 * x.taste.confident.norm))[0];
    if (sp) toast = decorate(sp, { pick: "To start", lens: "confident", dishes, occasion });
  }
  if (a === 2) picks.reverse();   // feeling bold: the stretch comes first
  const ranked = rows.sort((x, y) => overall(y) - overall(x) || String(x.card.id).localeCompare(String(y.card.id))).map((r) => decorate(r, { lens: a === 2 ? "challenge" : a === 1 ? "unique" : "confident", dishes, occasion }));
  return { picks, toast, ranked, unjudged: unjudged.map((c) => ({ card: c, why: ["Not enough on the list to judge: " + (c.known.style ? "" : "the type") + (!c.known.style && !c.known.grape && !c.known.place ? " and " : "") + (!c.known.grape && !c.known.place ? "a grape or a place" : "") + "."] })), notes };
}

// The lens reasons about shelves and wallets are for shopping (catalog reach and price); they mean nothing on a restaurant list.
const SHOP_TALK = /hard to find|easy to find|on every shelf|wallet|good everyday|shelf/i;
// The words said about one wine: only facts (see the header).
function decorate(r, { pick = "", lens, dishes, occasion }) {
  const why = [];
  if (r.dishRows.length) {
    const best = [...r.dishRows].sort((x, y) => y.score - x.score)[0], worst = [...r.dishRows].sort((x, y) => x.score - y.score)[0];
    why.push(`${r.kind.label} with ${best.dish.name.toLowerCase()}: ${RATING_LABEL[best.rating].toLowerCase()}.${best.reasons[0] ? " " + best.reasons[0] : ""}`);
    if (r.dishRows.length > 1 && worst.rating !== best.rating) why.push(`With ${worst.dish.name.toLowerCase()} it is ${RATING_LABEL[worst.rating].toLowerCase()}, so it covers the table less well.`);
  } else if (r.kind) why.push(`${r.kind.label}.`);
  const t = r.taste[lens] && r.taste[lens].reason; if (t && !SHOP_TALK.test(t)) why.push(t);
  if (r.occ.note) why.push(r.occ.note);
  if (r.card.source === "list" && r.card.said && r.card.said.length) why.push(`Judged from what the list says: ${r.card.said.join(", ")}.`);
  return { card: r.card, name: r.card.source === "catalog" ? wineName(r.card) : r.card.cuvee, pick, kind: r.kind, dishes: r.dishRows.map((d) => ({ name: d.dish.name, rating: d.rating })), foodMean: r.foodMean, why };
}
export { FOODS, WINE_KINDS, kindById, ratingOf, fitOf };

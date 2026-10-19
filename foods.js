// Food and wine: which kinds of wine suit which dishes, and how to change a plate so it suits a wine. Pure (no browser, no network).
// This is the one place for the food rules (owner, 2026-10-19). It reads like the structure rules in rules.js: a few plain principles,
// each with its reason, and nothing here is a fact about one bottle or about taste. Every dish and every principle is `checked: false`
// until an editor has read it. A hand-set pin from the database (food_pairing_overrides, setPairingOverrides) always beats the score.
//
// How a rating is made:
//   1. a dish is a small profile (weight, richness, acidity, sweetness, spice, saltiness, char, crispness);
//   2. needsOf(profile) turns it into what the dish asks of a wine (ranges of body, acidity, tannin, sweetness);
//   3. each KIND of wine (Crisp white, Full red ...) has its own structure, in the same lines the rest of the app uses (logic.js DIMS);
//   4. fitOf measures how far the kind sits from the ranges, and rate() says Ideal, Good, Okay or Avoid.
import { GRAPES } from "./rules.js?v=6";

// ---------------------------------------------------------------- wine kinds
// The structure of each kind is the middle of what that kind of wine usually is (the same scales as DIMS: acidity, body, tannin 1-5;
// sweetness 0-3; co2 0-2; oak 0-2). `none` means the line does not apply (white wines have no tannin line).
export const WINE_KINDS = [
  { id: "crisp-white", label: "Crisp white", style: "white", acidity: 4.5, body: 2, tannin: 0, sweetness: 0, co2: 0, oak: 0, hint: "light, zippy, no oak" },
  { id: "rich-white", label: "Rich white", style: "white", acidity: 3, body: 4.5, tannin: 0, sweetness: 0, co2: 0, oak: 1.5, hint: "full, creamy, often oaked" },
  { id: "offdry-white", label: "Off-dry white", style: "white", acidity: 4, body: 2.5, tannin: 0, sweetness: 1.5, co2: 0, oak: 0, hint: "a touch of sweetness, still fresh" },
  { id: "rose", label: "Rosé", style: "rose", acidity: 4, body: 2.5, tannin: 0, sweetness: 0, co2: 0, oak: 0, hint: "light, dry, fresh" },
  { id: "sparkling", label: "Dry sparkling", style: "sparkling", acidity: 4.5, body: 2.5, tannin: 0, sweetness: 0, co2: 2, oak: 0, hint: "bubbles, dry, bright" },
  { id: "light-red", label: "Light red", style: "red", acidity: 4, body: 2, tannin: 2, sweetness: 0, co2: 0, oak: 0, hint: "pale, juicy, soft tannin" },
  { id: "medium-red", label: "Medium red", style: "red", acidity: 3.5, body: 3.5, tannin: 3, sweetness: 0, co2: 0, oak: 1, hint: "balanced, some tannin" },
  { id: "full-red", label: "Full red", style: "red", acidity: 3.5, body: 5, tannin: 4.5, sweetness: 0, co2: 0, oak: 1.5, hint: "big, grippy, often oaked" },
  { id: "sweet", label: "Sweet wine", style: "white", acidity: 4, body: 3.5, tannin: 0, sweetness: 3, co2: 0, oak: 0, hint: "dessert sweet" },
  { id: "fortified", label: "Fortified", style: "fortified", acidity: 3, body: 4.5, tannin: 3, sweetness: 3, co2: 0, oak: 1, hint: "rich, sweet, strong" },
];
export const kindById = (id) => WINE_KINDS.find((k) => k.id === id) || null;

// The grapes whose stored structure (rules.js) sits closest to a kind of the same colour. Only kinds that are one colour of grape list any;
// grapes the rules do not know are simply not here.
const GRAPE_KINDS = { white: ["crisp-white", "rich-white"], red: ["light-red", "medium-red", "full-red"] };
export function grapesOf(kindId) {
  const out = [];
  for (const g of Object.values(GRAPES)) {
    const options = (GRAPE_KINDS[g.color] || []).map(kindById);
    if (!options.some((k) => k.id === kindId)) continue;
    const dist = (k) => Math.abs(k.acidity - g.acidity) + Math.abs(k.body - g.body) * 1.2 + (g.color === "red" ? Math.abs(k.tannin - g.tannin) : 0);
    const best = options.reduce((a, b) => (dist(b) < dist(a) ? b : a));
    if (best.id === kindId) out.push(g.name);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

// The kind of wine nearest to a structure ({ acidity, body, tannin, sweetness, oak }) among the kinds of that style, or null when the style is not one of
// ours or no structure is known. Used by the restaurant advice to rate a list wine against a dish; nothing is invented, it only names the closest kind.
const STYLE_KINDS = { red: ["light-red", "medium-red", "full-red"], white: ["crisp-white", "rich-white", "offdry-white", "sweet"], rose: ["rose"], sparkling: ["sparkling", "sweet"], fortified: ["fortified"] };
export function kindOfValues(values, style) {
  const ids = STYLE_KINDS[style]; if (!ids || !values) return null;
  const known = ["acidity", "body", "tannin", "sweetness", "oak"].filter((d) => typeof values[d] === "number");
  if (!known.length) return null;
  const W = { acidity: 1, body: 1.3, tannin: 0.9, sweetness: 1.6, oak: 0.5 };
  let best = null, bestD = Infinity;
  for (const id of ids) {
    const k = kindById(id);
    const d = known.reduce((sum, dim) => sum + Math.abs((k[dim] || 0) - values[dim]) * W[dim] * (dim === "tannin" && k.style !== "red" ? 0 : 1), 0);
    if (d < bestD) { best = k; bestD = d; }
  }
  return best;
}

// ---------------------------------------------------------------- dishes
// weight 1-5 (light to heavy), richness 0-5 (fat, cream, oil), acidity 0-5 (lemon, vinegar, tomato), sweetness 0-3 (same scale as wine),
// spice 0-5 (heat), salt 0-5, char 0-5 (grilled, smoked, roasted), crisp 0-3 (fried, crunchy).
const dish = (id, name, group, weight, richness, acidity, sweetness, spice, salt, char, crisp) => ({ id, name, group, weight, richness, acidity, sweetness, spice, salt, char, crisp, checked: false });
export const GROUPS = [{ id: "fish", label: "Fish and shellfish" }, { id: "meat", label: "Meat and poultry" }, { id: "veg", label: "Vegetables and grains" }, { id: "cheese", label: "Cheese" }, { id: "spicy", label: "Spicy and aromatic" }, { id: "sweet", label: "Desserts" }, { id: "snack", label: "Snacks and starters" }];
export const FOODS = [
  dish("oysters", "Oysters and raw shellfish", "fish", 1.5, 0, 3, 0, 0, 4, 0, 0),
  dish("sushi", "Sushi and light raw fish", "fish", 1.5, 1, 2, 0, 1, 3, 0, 0),
  dish("grilled-fish", "Grilled or baked white fish", "fish", 2, 1, 2, 0, 0, 2, 2, 0),
  dish("fried-fish", "Fried fish and chips, tempura", "fish", 3, 3, 1, 0, 0, 3, 1, 3),
  dish("salmon", "Roast or grilled salmon", "fish", 3.5, 3, 1, 0, 0, 2, 2, 0),
  dish("lobster", "Lobster, crab, butter sauces", "fish", 4, 4, 1, 0, 0, 2, 0, 0),
  dish("chicken", "Roast chicken and turkey", "meat", 3.5, 2, 1, 0, 0, 2, 2, 0),
  dish("pork", "Pork chops and roast pork", "meat", 3, 3, 1, 0, 0, 2, 2, 0),
  dish("duck", "Duck and goose", "meat", 3.5, 4, 1, 1, 0, 2, 2, 0),
  dish("burger", "Burgers and barbecue", "meat", 4, 3, 1, 1, 1, 3, 4, 0),
  dish("steak", "Steak and grilled red meat", "meat", 5, 3, 0, 0, 0, 2, 4, 0),
  dish("lamb", "Lamb and roasts", "meat", 5, 3, 0, 0, 0, 2, 3, 0),
  dish("stew", "Slow-cooked stews and braises", "meat", 5, 4, 1, 0, 0, 3, 1, 0),
  dish("charcuterie", "Cured meats and charcuterie", "snack", 3, 3, 1, 0, 0, 5, 0, 0),
  dish("salad", "Green salads and goat cheese", "veg", 1.5, 1, 4, 0, 0, 1, 0, 0),
  dish("tomato", "Tomato sauces, pasta and pizza", "veg", 3, 2, 4, 0, 0, 2, 1, 0),
  dish("creamy-pasta", "Creamy pasta and risotto", "veg", 4, 4, 1, 0, 0, 2, 0, 0),
  dish("mushroom", "Mushrooms and earthy dishes", "veg", 3, 2, 1, 0, 0, 2, 2, 0),
  dish("veg", "Roasted vegetables", "veg", 2, 1, 2, 0, 0, 1, 2, 0),
  dish("soft-cheese", "Soft and creamy cheese", "cheese", 2, 4, 1, 0, 0, 2, 0, 0),
  dish("hard-cheese", "Hard, aged cheese", "cheese", 4, 4, 0, 0, 0, 4, 0, 0),
  dish("blue-cheese", "Blue cheese", "cheese", 4, 4, 0, 0, 0, 5, 0, 0),
  dish("curry", "Spicy curry and chili dishes", "spicy", 3, 3, 1, 0, 4, 3, 1, 0),
  dish("thai", "Thai and aromatic stir-fries", "spicy", 2, 2, 3, 1, 3, 3, 1, 0),
  dish("bbq-glaze", "Sticky glazed ribs and sweet BBQ", "spicy", 4, 3, 1, 2, 2, 3, 4, 0),
  dish("chocolate", "Chocolate desserts", "sweet", 4, 4, 0, 3, 0, 1, 0, 0),
  dish("fruit-tart", "Fruit tarts and light desserts", "sweet", 2, 2, 3, 2, 0, 0, 0, 0),
  dish("nuts", "Salty nuts, crisps and party snacks", "snack", 2, 3, 0, 0, 0, 5, 0, 3),
];
export const foodById = (id) => FOODS.find((f) => f.id === id) || null;

// ---------------------------------------------------------------- what a dish asks of a wine
// Each principle adds to a range the wine should fall in; the reasons are what the app says. Ranges are on the same scales as DIMS.
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export function needsOf(p) {
  const why = [];
  const need = { body: [clamp(p.weight - 0.5, 1, 5), clamp(p.weight + 0.5, 1, 5)], acidity: [1, 5], tannin: [0, 5], sweetness: [0, 3] };
  why.push({ dim: "body", text: p.weight >= 4 ? "A heavy dish needs a wine with enough weight to keep up." : p.weight <= 2 ? "A delicate dish needs a light wine that will not take over." : "A medium dish suits a medium-weight wine." });
  if (p.sweetness >= 2) need.body = [1, 5];   // a sweet dish is matched on sweetness first, not on weight
  // acid: the wine should be at least as sharp as the dish, and fat wants freshness to cut it
  const minAcid = Math.max(p.acidity, p.richness >= 4 ? 3 : p.richness >= 3 ? 2.5 : 0, 2);
  need.acidity = [Math.min(minAcid, 5), 5];
  if (p.acidity >= 3) why.push({ dim: "acidity", text: "A sharp dish makes a soft wine taste flat, so the wine needs matching acidity." });
  else if (p.richness >= 3) why.push({ dim: "acidity", text: "Rich or fatty food likes a wine with enough acidity to refresh the mouth." });
  // tannin: loves fat and protein, hates spice and delicate fish
  if (p.sweetness >= 2) need.tannin = [0, 5];   // a sweet dish is matched on sweetness
  else if (p.salt >= 5 && p.richness >= 4) { need.tannin = [0, 2.5]; why.push({ dim: "tannin", text: "Tannin clashes with very salty, pungent food, so keep it soft." }); }
  else if (p.group === "fish") { need.tannin = [0, p.weight <= 2 ? 0.5 : 2]; why.push({ dim: "tannin", text: "Tannin can taste metallic beside fish, so keep it soft." }); }
  else if (p.weight >= 4 && p.richness >= 3 && p.spice < 3) { need.tannin = [3, 5]; why.push({ dim: "tannin", text: "Tannin loves fat and protein: the food softens the wine and the wine cleans the plate." }); }
  else if (p.weight >= 3 && p.char >= 3 && p.spice < 3) { need.tannin = [2, 5]; why.push({ dim: "tannin", text: "Grilled, smoky food stands up to some tannin." }); }
  else if (p.weight <= 2 || p.spice >= 3) { need.tannin = [0, 2]; why.push({ dim: "tannin", text: p.spice >= 3 ? "Strong tannin makes heat feel sharper, so keep it soft." : "Tannin can taste metallic beside delicate food, so keep it soft." }); }
  else need.tannin = [0, 3.5];
  // sweetness: the wine must be at least as sweet as the dish
  if (p.sweetness >= 2) { need.sweetness = [p.sweetness, 3]; why.push({ dim: "sweetness", text: "The wine should be at least as sweet as the food, or it tastes sour." }); }
  else if (p.spice >= 3) { need.sweetness = [0.5, 2]; why.push({ dim: "sweetness", text: "A little sweetness in the wine cools the heat." }); }
  else if (p.sweetness === 1) { need.sweetness = [0, 2]; }
  else if (p.salt >= 5 && p.richness >= 4) { need.sweetness = [1, 3]; why.push({ dim: "sweetness", text: "Sweet wine against salty, strong food is a classic contrast." }); }
  else need.sweetness = [0, 1];
  // bubbles help with salt and crunch (a bonus, not a need)
  const bubbles = p.crisp >= 2 || p.salt >= 4;
  if (bubbles) why.push({ dim: "co2", text: "Bubbles refresh the mouth after salt or crunch." });
  return { need, bubbles, why };
}

// ---------------------------------------------------------------- rating
const WEIGHT = { body: 1.3, acidity: 1, tannin: 0.9, sweetness: 1.6 };
const RATINGS = [{ id: "ideal", label: "Ideal", max: 0.45 }, { id: "good", label: "Good", max: 1.2 }, { id: "okay", label: "Okay", max: 2.1 }, { id: "avoid", label: "Avoid", max: Infinity }];
export const RATING_LABEL = Object.fromEntries(RATINGS.map((r) => [r.id, r.label]));
export const RATING_ORDER = ["ideal", "good", "okay", "avoid"];
const distTo = (v, [lo, hi]) => (v < lo ? lo - v : v > hi ? v - hi : 0);

// Hand-set pins from the database: { "food|kind": { rating, reason, status } }. Only rows in use or checked count.
let OVERRIDES = {};
export function setPairingOverrides(rows) {
  OVERRIDES = {};
  (rows || []).forEach((r) => { if (r && (r.status === "in use" || r.status === "checked") && RATING_ORDER.includes(r.rating)) OVERRIDES[`${r.food_id}|${r.kind_id}`] = { rating: r.rating, reason: r.reason || "", status: r.status }; });
}
export const overrideFor = (foodId, kindId) => OVERRIDES[`${foodId}|${kindId}`] || null;

// How far a kind of wine is from what the profile asks (0 is a perfect fit), and the lines that cost it points.
export function fitOf(profile, kind) {
  const { need, bubbles, why } = needsOf(profile);
  let score = 0; const costs = [];
  for (const dim of Object.keys(WEIGHT)) {
    const d = distTo(kind[dim], need[dim]) * WEIGHT[dim];
    if (d > 0) { score += d; costs.push({ dim, d }); }
  }
  if (bubbles && kind.co2 === 2) score = Math.max(0, score - 0.6);
  if (profile.sweetness >= 2 && kind.sweetness + 0.5 < profile.sweetness) score += 2;   // a wine drier than the dessert is never a good match
  return { score, costs, why, need };
}
export const ratingOf = (score) => RATINGS.find((r) => score <= r.max).id;

// The rating of one dish with one kind of wine, with the reasons (a pin from the database wins and says so).
export function pair(food, kind) {
  const pin = !food.custom && overrideFor(food.id, kind.id);
  const f = fitOf(food, kind);
  const rating = pin ? pin.rating : ratingOf(f.score);
  const costDims = new Set(f.costs.map((c) => c.dim));
  const reasons = f.why.filter((w) => rating === "avoid" || rating === "okay" ? costDims.has(w.dim) : !costDims.has(w.dim) || w.dim === "co2").map((w) => w.text);
  return { food: food.id, kind: kind.id, rating, score: f.score, reasons: pin && pin.reason ? [pin.reason, ...reasons] : reasons, pinned: !!pin };
}

// The shelves for one kind of wine: every dish sorted into Ideal, Good, Okay, Avoid (best fits first inside a shelf).
export function plateFor(kindId, foods = FOODS) {
  const kind = kindById(kindId); if (!kind) return null;
  const shelves = Object.fromEntries(RATING_ORDER.map((r) => [r, []]));
  foods.forEach((fd) => { const p = pair(fd, kind); shelves[p.rating].push({ ...p, name: fd.name, group: fd.group }); });
  RATING_ORDER.forEach((r) => shelves[r].sort((a, b) => a.score - b.score));
  return { kind, shelves };
}

// The whole chart: one row per dish, one cell per kind of wine.
export function chartOf(foods = FOODS, kinds = WINE_KINDS) {
  return foods.map((fd) => ({ food: fd, cells: kinds.map((k) => pair(fd, k)) }));
}

// The best kinds for one dish, best first.
export function bestKinds(food, limit = 3) {
  return WINE_KINDS.map((k) => pair(food, k)).sort((a, b) => a.score - b.score).slice(0, limit);
}

// ---------------------------------------------------------------- Edit food: tweaks
// Each tweak is a small change to a dish with its reason. tweaksFor tries each on the dish and keeps those that move the rating towards
// the chosen kind of wine, best first; nothing is suggested that does not help.
const bump = (p, d) => { const q = { ...p }; for (const [k, v] of Object.entries(d)) q[k] = clamp((q[k] || 0) + v, k === "weight" ? 1 : 0, k === "sweetness" || k === "crisp" ? 3 : 5); return q; };
export const TWEAKS = [
  { id: "lemon", label: "Add a squeeze of lemon or a splash of vinegar", why: "Acidity in the food lets a sharp wine feel at home.", delta: { acidity: 1 } },
  { id: "cream", label: "Finish with cream or butter", why: "A richer sauce gives a full, creamy wine something to match.", delta: { richness: 1, weight: 1 } },
  { id: "lighten", label: "Swap a heavy sauce for olive oil and herbs", why: "A lighter plate sits better with a light, fresh wine.", delta: { richness: -1, weight: -1 } },
  { id: "noglaze", label: "Leave off the sweet glaze or sauce", why: "Sweetness in the food makes a dry wine taste thin and sour.", delta: { sweetness: -1 } },
  { id: "honey", label: "Add a touch of honey, fruit or glaze", why: "A little sweetness suits an off-dry or sweet wine.", delta: { sweetness: 1 } },
  { id: "lessspice", label: "Tone down the chili", why: "Heat fights tannin and alcohol, so less spice makes a bigger wine easier.", delta: { spice: -2 } },
  { id: "steam", label: "Poach or steam it instead of frying", why: "Taking out the crunch and oil suits a delicate wine.", delta: { crisp: -3, richness: -1, weight: -1 } },
  { id: "grill", label: "Grill or roast it for a little char", why: "Smoke and char stand up to a wine with more weight and tannin.", delta: { char: 2, weight: 1 } },
  { id: "salty", label: "Add something salty (cured meat, parmesan, capers)", why: "Salt flatters bubbles and crisp, sharp wines.", delta: { salt: 2 } },
  { id: "smaller", label: "Serve a smaller portion with the sauce on the side", why: "A lighter plate lets a lighter wine be heard.", delta: { weight: -1 } },
  { id: "heartier", label: "Serve it with a hearty side (mushrooms, beans, potatoes)", why: "A heavier plate gives a bigger wine something to hold on to.", delta: { weight: 1 } },
];
export function tweaksFor(food, kindId, limit = 4) {
  const kind = kindById(kindId); if (!kind) return [];
  const base = fitOf(food, kind).score;
  return TWEAKS.map((t) => { const changed = bump(food, t.delta); const s = fitOf(changed, kind).score; return { ...t, after: ratingOf(s), score: s, gain: base - s, profile: changed }; })
    .filter((t) => t.gain > 0.15).sort((a, b) => b.gain - a.gain).slice(0, limit);
}

// A dish with several tweaks applied, one after the other (ids that are not tweaks are ignored).
export function applyTweaks(food, ids) {
  if (!ids || !ids.length) return food;   // nothing changed: still the stored dish, so a pin still applies
  let p = { ...food };
  for (const id of ids || []) { const t = TWEAKS.find((x) => x.id === id); if (t) p = bump(p, t.delta); }
  return { ...p, custom: true };
}

// ---------------------------------------------------------------- Edit food: build a plate from parts
// A plate starts from the protein or main part, and each other part changes the profile (same lines as a dish).
const part = (id, label, d) => ({ id, label, d });
export const PARTS = {
  main: [
    { id: "chicken", label: "Chicken", base: { weight: 3, richness: 2, acidity: 1, sweetness: 0, spice: 0, salt: 2, char: 0, crisp: 0 } },
    { id: "pork", label: "Pork", base: { weight: 3, richness: 3, acidity: 1, sweetness: 0, spice: 0, salt: 2, char: 0, crisp: 0 } },
    { id: "beef", label: "Beef", base: { weight: 5, richness: 3, acidity: 0, sweetness: 0, spice: 0, salt: 2, char: 0, crisp: 0 } },
    { id: "lamb", label: "Lamb", base: { weight: 5, richness: 3, acidity: 0, sweetness: 0, spice: 0, salt: 2, char: 0, crisp: 0 } },
    { id: "whitefish", label: "White fish", base: { weight: 2, richness: 1, acidity: 1, sweetness: 0, spice: 0, salt: 2, char: 0, crisp: 0 } },
    { id: "salmon", label: "Salmon", base: { weight: 3, richness: 3, acidity: 1, sweetness: 0, spice: 0, salt: 2, char: 0, crisp: 0 } },
    { id: "shellfish", label: "Shellfish", base: { weight: 2, richness: 1, acidity: 2, sweetness: 0, spice: 0, salt: 3, char: 0, crisp: 0 } },
    { id: "veg", label: "Vegetables or tofu", base: { weight: 2, richness: 1, acidity: 1, sweetness: 0, spice: 0, salt: 1, char: 0, crisp: 0 } },
  ],
  sauce: [
    part("plain", "No sauce", {}), part("oil", "Olive oil and herbs", { acidity: 0, richness: 0 }), part("cream", "Cream or butter sauce", { richness: 2, weight: 1 }),
    part("tomato", "Tomato sauce", { acidity: 3, weight: 0 }), part("jus", "Red wine sauce or gravy", { richness: 1, weight: 1, acidity: 1 }),
    part("lemon", "Lemon or vinegar dressing", { acidity: 3 }), part("chili", "Chili or curry sauce", { spice: 4, richness: 1 }),
    part("glaze", "Sweet glaze or BBQ", { sweetness: 2, char: 1, weight: 1 }), part("soy", "Soy and ginger", { salt: 2, acidity: 1, spice: 1 }),
  ],
  side: [
    part("none", "Nothing extra", {}), part("salad", "Green salad", { acidity: 1, weight: -1 }), part("roasted", "Roasted vegetables", { char: 1 }),
    part("potato", "Potatoes or fries", { richness: 1, weight: 1 }), part("rice", "Rice or pasta", { weight: 0 }), part("mushroom", "Mushrooms", { char: 1, weight: 1 }),
  ],
  cook: [
    part("raw", "Raw or cured", { weight: -1, char: 0 }), part("steam", "Steamed or poached", { weight: -1 }), part("grill", "Grilled", { char: 3 }),
    part("roast", "Roasted", { char: 2, richness: 1 }), part("fry", "Fried", { crisp: 3, richness: 1, weight: 1 }), part("braise", "Braised", { weight: 1, richness: 1, char: 0 }),
  ],
};
export function plateProfile(sel) {
  const main = PARTS.main.find((m) => m.id === sel.main); if (!main) return null;
  let p = { ...main.base };
  for (const slot of ["sauce", "side", "cook"]) { const x = PARTS[slot].find((y) => y.id === sel[slot]); if (x) p = bump(p, x.d); }
  return { id: "plate", name: "Your plate", group: ["whitefish", "salmon", "shellfish"].includes(sel.main) ? "fish" : "meat", ...p, custom: true, checked: false };
}
export const platePairs = (sel) => { const p = plateProfile(sel); return p ? WINE_KINDS.map((k) => pair(p, k)).sort((a, b) => a.score - b.score) : []; };

// ---------------------------------------------------------------- Edit food: plan a menu
// The natural order of a meal: bubbles, light whites, richer whites, rosé, light to full reds, then sweet.
const FLOW = ["sparkling", "crisp-white", "offdry-white", "rose", "rich-white", "light-red", "medium-red", "full-red", "sweet", "fortified"];
export const flowIndex = (kindId) => FLOW.indexOf(kindId);
// From dishes (in the order the player wants to serve them) to a wine for each course, with notes when the order works against the wines.
export function menuFromDishes(foodIds) {
  const courses = foodIds.map((id) => foodById(id)).filter(Boolean).map((fd) => { const best = bestKinds(fd, 3); return { food: fd, kind: kindById(best[0].kind), rating: best[0].rating, others: best.slice(1).map((b) => ({ kind: kindById(b.kind), rating: b.rating })) }; });
  const notes = [];
  for (let i = 1; i < courses.length; i++) {
    const a = flowIndex(courses[i - 1].kind.id), b = flowIndex(courses[i].kind.id);
    if (b < a && !(courses[i].kind.id === "sparkling")) notes.push({ at: i, text: `${courses[i].kind.label} after ${courses[i - 1].kind.label} can taste thin. Try serving ${courses[i].food.name.toLowerCase()} earlier, or choose the next best wine.` });
  }
  return { courses, notes, suggestedOrder: [...courses].sort((x, y) => flowIndex(x.kind.id) - flowIndex(y.kind.id)).map((c) => c.food.id) };
}
// From wines (in serving order) to the dishes that suit each one best.
export function menuFromWines(kindIds, perCourse = 3) {
  const kinds = kindIds.map(kindById).filter(Boolean);
  const notes = [];
  for (let i = 1; i < kinds.length; i++) if (flowIndex(kinds[i].id) < flowIndex(kinds[i - 1].id) && kinds[i].id !== "sparkling") notes.push({ at: i, text: `${kinds[i].label} after ${kinds[i - 1].label} can taste thin. Serve lighter wines first.` });
  return { courses: kinds.map((k) => ({ kind: k, dishes: plateFor(k.id).shelves.ideal.concat(plateFor(k.id).shelves.good).slice(0, perCourse) })), notes, suggestedOrder: [...kinds].sort((a, b) => flowIndex(a.id) - flowIndex(b.id)).map((k) => k.id) };
}

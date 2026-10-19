// Checks reading a restaurant wine list (winelist.js) and the advice (restaurant.js). Run: node docs/tools/restaurant_check.mjs
import * as W from "../../winelist.js";
import { PLACES } from "../../flavordata.js";
import fs from "fs";
import * as R from "../../restaurant.js";
import { FOODS, foodById } from "../../foods.js";
import { userModel } from "../../deck.js";
import { structureMap } from "../../structure.js";
import { cardFromRow } from "../../logic.js";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
const LIST = `WINE LIST
Sparkling
Champagne Brut NV ........ 95
Prosecco  12 / 48
Whites
2021 Sancerre, Domaine X 62
Chablis Premier Cru 2019   78
Pouilly-Fumé 2022 55
Chardonnay, Sonoma Coast 2020  70
Reds
2018 Barolo  120
Pinot Noir Willamette Valley 2020 68
House Red 9 / 34
Château Beau-Séjour Bécot 2019 140
Rosé
Provence Rosé 2023 52
1999
Thank you for dining with us`;
const cards = JSON.parse(fs.readFileSync(new URL("./cards_r.json", import.meta.url), "utf8")).map((r) => ({ id: r.wine_vintage_id, vintage: String(r.vintage_year || ""), producer: r.producer, cuvee: r.wine_name || "", style: r.style, appellation: r.appellation || "", region: r.region || "", country: r.country || "", grape: (r.label_grapes || []).join("-"), grapes: r.label_grapes || [], archived: !!r.archived_at }));
const r = W.readList(LIST, { catalog: cards, places: PLACES });
const by = (name) => r.cards.find((x) => x.line.name.includes(name));
// reading
ok(r.cards.length === 11, "11 wine lines: " + r.cards.length + " " + r.cards.map((x) => x.line.name).join(" | "));
ok(r.skipped.some((s) => /section/.test(s.why)) && r.skipped.length >= 5, "headings are skipped, not wines: " + r.skipped.map((s) => s.raw).join(" | "));
ok(by("Champagne").card.style === "sparkling" && by("Champagne").line.vintage === "NV" && by("Champagne").line.price.text === "95", "Champagne: sparkling, NV, 95");
ok(JSON.stringify(by("Prosecco").line.price.amounts) === "[12,48]", "glass / bottle prices kept: " + JSON.stringify(by("Prosecco").line.price));
ok(by("Sancerre").card.style === "white" && by("Sancerre").card.known.place && by("Sancerre").card.country === "France", "Sancerre: white (section), place known, France");
ok(by("Sancerre").card.confidence === "medium", "Sancerre has enough to judge");
ok(by("Chablis").card.appellation === "Chablis" && by("Chablis").card.ruleGrapes.includes("Chardonnay"), "Chablis: the appellation's own rule names Chardonnay: " + JSON.stringify(by("Chablis").card.ruleGrapes));
ok(by("Chardonnay").card.grapes.includes("Chardonnay") && by("Chardonnay").card.style === "white", "a stated grape is read");
ok(by("Barolo").card.style === "red" && by("Barolo").card.country === "Italy", "Barolo is red from Italy");
ok(by("Pinot Noir").card.grapes.includes("Pinot Noir") && by("Pinot Noir").card.style === "red", "Pinot Noir stated");
// nothing is guessed
const house = by("House Red");
ok(house.card.confidence === "low" && !house.card.known.grape && !house.card.known.place, "'House Red' has a type from its section but nothing else: not enough to judge");
ok(W.missingWords(house.card).includes("grape or a place"), "it says what is missing: " + W.missingWords(house.card));
ok(by("Pouilly").card.style === "white" && !by("Pouilly").card.grapes.length, "Pouilly-Fumé: no grape is invented from its name (no stored rule)");
// the catalog
const bec = by("Beau-S");
ok(bec.card.source === "catalog" && bec.card.confidence === "high" && bec.card.id === "bbbbbbbb-0000-4000-8000-000000000009", "an exact catalog wine uses the catalog card: " + bec.card.source);
// fixes by the player
const fixed = W.toCard({ ...house.line, fix: { style: "red", grape: "Merlot" } }, { placeIdx: [], catalogIdx: [] });
ok(fixed.known.grape && fixed.grapes.includes("Merlot") && fixed.confidence === "medium", "the player can say the grape: " + JSON.stringify(fixed.grapes));
// no wine line is made from plain noise
ok(!r.cards.some((x) => /thank you|wine list/i.test(x.line.name)), "noise lines are not wines");
ok(!r.cards.some((x) => x.line.name === "1999"), "a bare year is not a wine");
// ---------------------------------------------------------------- dishes
const dish = (t) => (R.matchDish(t) || {}).id;
ok(dish("Ribeye steak") === "steak" && dish("grilled salmon") === "salmon" && dish("Fried calamari") === "fried-fish", "dish words: " + [dish("Ribeye steak"), dish("grilled salmon"), dish("Fried calamari")]);
ok(dish("BBQ ribs") === "bbq-glaze" && dish("pasta carbonara") === "creamy-pasta" && dish("Thai green curry") === "curry", "longest phrase wins: " + [dish("BBQ ribs"), dish("pasta carbonara"), dish("Thai green curry")]);
ok(dish("grandma's secret dish") === undefined, "an unknown dish is not guessed");
// ---------------------------------------------------------------- advice
const catalog = JSON.parse(fs.readFileSync(new URL("./cards_r.json", import.meta.url), "utf8")).map((r) => cardFromRow(r));
const refs = structureMap(catalog, new Map());
const model = userModel({ cards: catalog, states: [], journal: [], quiz: null, refs });
const steak = foodById("steak"), salmon = foodById("salmon");
const go = (o) => R.advise({ list: r.cards, dishes: [], occasion: "casual", adventure: 1, catalog, model, refs, ...o });
const a = go({ dishes: [steak] });
ok(a.picks.length === 3 && new Set(a.picks.map((x) => x.card.id)).size === 3, "three different picks: " + a.picks.map((x) => x.pick + "=" + x.card.cuvee).join(" | "));
ok(a.picks.every((x) => x.why.length >= 1 && x.why.every((t) => typeof t === "string" && t.length > 5)), "every pick says why");
ok(!a.picks.some((x) => /House Red/.test(x.card.cuvee)) && !a.ranked.some((x) => /House Red/.test(x.card.cuvee)), "an unknown-feel line is never a pick or in the ranking");
ok(a.unjudged.some((x) => /House Red/.test(x.card.cuvee)) && /Not enough/.test(a.unjudged[0].why[0]), "it is listed as not enough to judge: " + JSON.stringify(a.unjudged.map((x) => x.why)));
const posOf = (res, name) => res.ranked.findIndex((x) => x.card.cuvee.includes(name));
ok(posOf(a, "Barolo") < posOf(a, "Provence"), "with steak, Barolo ranks above a rosé: " + a.ranked.map((x) => x.card.cuvee.slice(0, 14)).join(", "));
ok(a.picks.every((x) => x.foodMean >= 0.4), "every pick suits the food (okay or better)");
// occasion
const casual = go({ dishes: [steak], occasion: "casual" }), celeb = go({ dishes: [steak], occasion: "celebration" });
ok(posOf(celeb, "Champagne") < posOf(casual, "Champagne") || posOf(celeb, "Champagne") === 0, "celebration lifts the Champagne: " + posOf(casual, "Champagne") + " -> " + posOf(celeb, "Champagne"));
ok(R.occasionAdjust("business", "full-red", 0.8, 0.5).adj < R.occasionAdjust("business", "full-red", 0.1, 0.5).adj, "business dinner holds back an unusual wine");
ok(R.occasionAdjust("date", "crisp-white", 0.1, 0.5).adj < 0 && R.occasionAdjust("date", "full-red", 0.1, 0.5).adj > 0, "date night: not the lightest, something to linger over");
// a table of two dishes: the worse dish matters
const two = go({ dishes: [steak, salmon] });
ok(two.ranked.some((x) => /covers the table less well/.test(x.why.join(" "))), "one bottle for two dishes says when it suits one less");
// adventure
const bold = go({ dishes: [steak], adventure: 2 }), usual = go({ dishes: [steak], adventure: 0 });
ok(bold.picks[0].pick === "A stretch" && usual.picks[0].pick === "Safe bet", "adventure sets which pick comes first: " + bold.picks[0].pick + " / " + usual.picks[0].pick);
// a pick never talks about shelves or wallets; a catalog wine has its name
ok(!a.picks.some((x) => x.why.some((w) => /shelf|wallet|hard to find/i.test(w))), "no shopping talk in a restaurant");
ok(a.ranked.every((x) => x.name && x.name.length > 3), "every wine has a name to show: " + a.ranked.map((x) => x.name).join(" | "));
ok(a.picks.every((x) => x.foodMean >= 0.75) || a.picks.some((x) => x.foodMean >= 0.4), "picks prefer a good match for the food");
// a celebration toasts with a sparkling wine whatever the dishes
ok(celeb.toast && celeb.toast.kind.id === "sparkling" && celeb.toast.pick === "To start" && !celeb.picks.some((x) => x.card.id === celeb.toast.card.id), "celebration: a sparkling 'To start', not among the three");
ok(casual.toast === null, "no toast for a casual night");
// no dishes
const nodish = go({ dishes: [] });
ok(nodish.picks.length === 3 && nodish.notes.some((n) => /No dishes/.test(n)), "with no dishes it still advises, and says so");
// nothing judgeable
const none = R.advise({ list: r.cards.filter((x) => /House Red/.test(x.card.cuvee)), dishes: [steak], catalog, model, refs });
ok(none.picks.length === 0 && none.notes.length === 1, "a list with nothing to judge gives no picks");
console.log(`restaurant_check: ${pass} pass ${fail} fail`);
process.exit(fail ? 1 : 0);

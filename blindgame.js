// Guess the Glass: the blind tasting game on the Games tab. The app shows a wine's profile and the player picks the wine from four choices,
// plus mini-games where one part of the profile is played on its own (the grape, the place, the age, the feel).
// Every clue comes from something the app already holds: the flavor rules (flavordata.js through flavors.js), the structure rules (rules.js through
// structure.js, where an editor's score wins), the climate list (rules.js climateOf), the catalog's own grape, place and vintage year, and the
// age rule below (AGE_CUES). Nothing is guessed about a wine. The profile is "typical for this grape, place and age", never a fact about one bottle.
// The game's answers never touch the palate profile, the Discover deck or the taste model; the best scores are kept on the phone (wine.guess).
// Pure: no browser, no network.
import { flavorsForCard, varKeyFor, placeKeysFor, tables, ruleScores, LABEL, CATS } from "./flavors.js?v=3";
import { climateOf, factsOf, suggestStructure, dimsForStyle, grapeFor, norm } from "./rules.js?v=4";
import { startingValues } from "./structure.js?v=7";

// ---------------------------------------------------------------- the classics
// Well-known grape and place pairs, so the game works with any catalog. Each is only a grape and a place that the flavor and structure rules
// already know (VAR / PLACES in flavordata.js, GRAPES / CLIMATES / PROFILES in rules.js); the profile is worked out from those rules.
// blend: true when the wine is usually more than one grape (left out of "Which grape?"). label: how the grape part is written.
const K = (id, grapes, style, country, region, appellation, opts = {}) => ({ id, grapes, style, country, region, appellation, ...opts });
export const CLASSICS = [
  K("napa-cab", ["Cabernet Sauvignon"], "red", "USA", "California", "Napa Valley"),
  K("maipo-cab", ["Cabernet Sauvignon"], "red", "Chile", "Central Valley", "Maipo Valley"),
  K("stemilion-merlot", ["Merlot"], "red", "France", "Bordeaux", "St.-Émilion"),
  K("burgundy-pinot", ["Pinot Noir"], "red", "France", "Burgundy", "Bourgogne Côte d'Or"),
  K("willamette-pinot", ["Pinot Noir"], "red", "USA", "Oregon", "Willamette Valley"),
  K("otago-pinot", ["Pinot Noir"], "red", "New Zealand", "South Island", "Central Otago"),
  K("rrv-pinot", ["Pinot Noir"], "red", "USA", "California", "Russian River Valley"),
  K("barolo", ["Nebbiolo"], "red", "Italy", "Piedmont", "Barolo"),
  K("stjoseph-syrah", ["Syrah"], "red", "France", "Rhône Valley", "St.-Joseph"),
  K("barossa-shiraz", ["Shiraz"], "red", "Australia", "South Australia", "Barossa"),
  K("mendoza-malbec", ["Malbec"], "red", "Argentina", "Mendoza", ""),
  K("rioja", ["Tempranillo"], "red", "Spain", "Rioja", ""),
  K("ribera", ["Tempranillo"], "red", "Spain", "Castilla y León", "Ribera del Duero"),
  K("chianti", ["Sangiovese"], "red", "Italy", "Tuscany", "Chianti Classico"),
  K("brunello", ["Sangiovese"], "red", "Italy", "Tuscany", "Brunello di Montalcino"),
  K("drycreek-zin", ["Zinfandel"], "red", "USA", "California", "Dry Creek Valley"),
  K("calatayud-garnacha", ["Garnacha"], "red", "Spain", "Aragón", "Calatayud"),
  K("beaujolais", ["Gamay"], "red", "France", "Beaujolais", "Beaujolais-Villages"),
  K("taurasi", ["Aglianico"], "red", "Italy", "Campania", "Taurasi"),
  K("colchagua-carmenere", ["Carmenère"], "red", "Chile", "Central Valley", "Colchagua Valley"),
  K("salento-primitivo", ["Primitivo"], "red", "Italy", "Puglia", "Salento"),
  K("abruzzo-montepulciano", ["Montepulciano"], "red", "Italy", "Abruzzo", "Montepulciano d'Abruzzo"),
  K("jumilla-monastrell", ["Monastrell"], "red", "Spain", "", "Jumilla"),
  K("marlborough-sb", ["Sauvignon Blanc"], "white", "New Zealand", "South Island", "Marlborough"),
  K("sancerre", ["Sauvignon Blanc"], "white", "France", "Loire Valley", "Sancerre"),
  K("chablis", ["Chardonnay"], "white", "France", "Burgundy", "Chablis"),
  K("rrv-chardonnay", ["Chardonnay"], "white", "USA", "California", "Russian River Valley"),
  K("mosel-riesling", ["Riesling"], "white", "Germany", "", "Mosel"),
  K("fingerlakes-riesling", ["Riesling"], "white", "USA", "New York", "Finger Lakes"),
  K("savennieres", ["Chenin Blanc"], "white", "France", "Loire Valley", "Savennières"),
  K("riasbaixas", ["Albariño"], "white", "Spain", "Galicia", "Rías Baixas"),
  K("gruner", ["Grüner Veltliner"], "white", "Austria", "", "Niederösterreich"),
  K("pinotgrigio", ["Pinot Grigio"], "white", "Italy", "Trentino-Alto Adige", "Trentino"),
  K("muscadet", ["Melon de Bourgogne"], "white", "France", "Loire Valley", "Muscadet de Sèvre et Maine Clisson"),
  K("gavi", ["Cortese"], "white", "Italy", "Piedmont", "Gavi"),
  K("vermentino", ["Vermentino"], "white", "Italy", "Liguria", "Colli di Luni"),
  K("champagne", ["Chardonnay", "Pinot Noir"], "sparkling", "France", "Champagne", "", { blend: true, label: "Chardonnay and Pinot Noir" }),
  K("prosecco", ["Glera"], "sparkling", "Italy", "Veneto", "Prosecco"),
  // Cava: the rules know only Viura (Macabeo) of its three grapes, so the profile is read from that one; the label names all three.
  K("cava", ["Viura"], "sparkling", "Spain", "Catalonia", "Cava", { blend: true, label: "Macabeo, Xarel·lo and Parellada" }),
  K("provence-rose", ["Grenache", "Cinsault"], "rose", "France", "Provence", "Côtes de Provence", { blend: true, label: "Grenache and Cinsault" }),
];
// A classic as a card, so the same rules read it as they read a catalog wine.
export const classicCard = (k) => ({
  id: "classic:" + k.id, producer: "", cuvee: "", vintage: "", style: k.style, country: k.country, region: k.region || "", appellation: k.appellation || "",
  grapes: [...k.grapes], ruleGrapes: [], grape: k.grapes.join("-"), raw: { label_grapes: [...k.grapes] },
});

// ---------------------------------------------------------------- age (what time in the bottle does)
// The usual teaching (WSET-style): young wines show "primary" fruit and flowers; with time the fruit softens, oak and yeast notes blend in, and then
// "tertiary" notes grow (dried fruit, leather, earth in reds; honey, nuts, toast in whites). Colour moves too: reds lose purple and turn garnet then
// brick at the rim; whites deepen from pale lemon to gold and amber. Tannin softens and acidity feels gentler. These are typical changes, not facts about a bottle.
export const AGE_BANDS = [
  { id: "young", label: "Young", years: "1 to 3 years", min: 0, max: 3 },
  { id: "developing", label: "Developing", years: "4 to 9 years", min: 4, max: 9 },
  { id: "mature", label: "Mature", years: "10 years or more", min: 10, max: Infinity },
];
export const bandById = (id) => AGE_BANDS.find((b) => b.id === id) || null;
export const bandOf = (years) => (Number.isFinite(years) && years >= 0 ? AGE_BANDS.find((b) => years >= b.min && years <= b.max) : null);
// How old a catalog wine is this year, from its vintage year. null for non-vintage or a missing year.
export function ageOf(card, now = new Date()) {
  const y = /^\d{4}$/.test(String((card && card.vintage) || "")) ? Number(card.vintage) : null;
  if (!y) return null;
  const a = now.getFullYear() - y;
  return a >= 0 && a <= 80 ? a : null;
}
// look: the colour, read after "In the glass it is ..."; smell: things it smells and tastes of, read after "It smells and tastes of ..."; feel: whole
// clauses read after "In the mouth, ...". Written so each band reads as a short paragraph in everyday words.
export const AGE_CUES = {
  red: {
    young: { look: ["deep purple to ruby, the same colour right to the rim"], smell: ["fresh, juicy red and black fruit", "flowers such as violet"], feel: ["the tannins feel firm, even a little rough"] },
    developing: { look: ["ruby moving toward garnet, a little lighter at the rim"], smell: ["softer, riper fruit, like cooked or jammy fruit", "a first savoury note"], feel: ["the tannins are rounder and smoother"] },
    mature: { look: ["garnet with a brick or tawny rim, paler at the edge"], smell: ["dried fruit such as prune, fig and raisin", "leather, tobacco, forest floor and mushroom"], feel: ["the tannins are silky and soft and the fruit is fading", "there may be sediment in the bottle"] },
  },
  white: {
    young: { look: ["pale lemon, often with a green tint"], smell: ["fresh citrus, green apple and pear", "white flowers"], feel: ["it is crisp and zesty"] },
    developing: { look: ["lemon to light gold"], smell: ["riper stone fruit such as peach and apricot", "the first hint of honey"], feel: ["it is rounder and a little softer"] },
    mature: { look: ["deep gold, even amber"], smell: ["honey and nuts such as almond and hazelnut", "dried apricot, marmalade and beeswax"], feel: ["the acidity feels softer and the texture fuller, almost waxy"] },
  },
  sparkling: {
    young: { look: ["pale lemon with lively, steady bubbles"], smell: ["fresh apple, pear and citrus"], feel: ["the bubbles are bright and energetic"] },
    developing: { look: ["lemon to light gold"], smell: ["biscuit and bread dough (from resting on the yeast)", "riper fruit"], feel: ["the bubbles feel creamier"] },
    mature: { look: ["deeper gold, with fewer and finer bubbles"], smell: ["toast, brioche, nuts and honey", "dried or baked apple"], feel: ["the bubbles are gentle and soft"] },
  },
  rose: {
    young: { look: ["pale pink, bright and clear"], smell: ["fresh strawberry, raspberry and citrus"], feel: ["it is crisp and refreshing"] },
    developing: { look: ["a deeper pink turning orange at the edge (onion skin)"], smell: ["fading berry fruit", "a dried or nutty note"], feel: ["it is softer and less lively"] },
    mature: { look: ["orange to copper"], smell: ["little fruit, mostly dried fruit and nuts"], feel: ["it feels flat and soft"] },
  },
};
// What a few grapes are known for as they age. from: the first band where it shows. Keys are the flavor rules' grape keys (varKeyFor).
export const GRAPE_AGE = {
  riesling: { from: "developing", notes: ["petrol (kerosene)", "honey"] },
  nebbiolo: { from: "developing", notes: ["tar and roses", "an orange tint at the rim"] },
  cheninblanc: { from: "developing", notes: ["honey", "wax (lanolin)"] },
  cabernetsauvignon: { from: "developing", notes: ["cedar and cigar box", "pencil shavings"] },
  pinotnoir: { from: "developing", notes: ["forest floor and mushroom", "a gamey note"] },
  syrah: { from: "developing", notes: ["smoked meat", "black olive", "leather"] },
  shiraz: { from: "developing", notes: ["leather", "dark chocolate", "dried plum"] },
  sangiovese: { from: "developing", notes: ["dried cherry", "tea leaf", "leather"] },
  tempranillo: { from: "developing", notes: ["leather", "dried fig", "tobacco"] },
  chardonnay: { from: "developing", notes: ["hazelnut", "toast", "butterscotch"] },
  chardonnaysparkling: { from: "developing", notes: ["toast and brioche", "hazelnut"] },
  aglianico: { from: "mature", notes: ["leather", "tar", "dried black fruit"] },
  merlot: { from: "developing", notes: ["fruit cake", "cedar", "truffle"] },
};
// How long a grape usually keeps getting better. young: usually drunk within a few years (so it is never asked as Mature); long: made to age for years.
export const AGE_POTENTIAL = {
  young: ["gamay", "pinotgris", "sauvignonblanc", "moscato", "glera", "albarino", "vermentino", "melon", "cortese", "genericrose", "garnacharose", "pinotnoirrose"],
  long: ["nebbiolo", "cabernetsauvignon", "riesling", "cheninblanc", "syrah", "shiraz", "tempranillo", "sangiovese", "aglianico", "saperavi"],
};
export const potentialOf = (vk) => (AGE_POTENTIAL.young.includes(vk) ? "young" : AGE_POTENTIAL.long.includes(vk) ? "long" : "medium");
// The bands a grape may honestly be asked at: a drink-young wine is not asked as Mature.
export const bandsFor = (vk, type) => (potentialOf(vk) === "young" || type === "rose" ? AGE_BANDS.filter((b) => b.id !== "mature") : AGE_BANDS);
const AGE_TYPES = ["red", "white", "sparkling", "rose"];

// ---------------------------------------------------------------- how it feels (words for each kind of player)
// Four steps on the 1 to 5 scales (up to 2, up to 3, 3.5, 4 and up), then the fixed choices. Beginner words are everyday; Enthusiast and Professional
// use tasting words (Professional follows the WSET style, "medium(+)"). The data underneath is the same for everyone.
const STEP = (v) => (v <= 2 ? 0 : v <= 3 ? 1 : v <= 3.5 ? 2 : 3);
export const FEEL_WORDS = {
  acidity: { beginner: ["soft and mellow", "fresh", "bright and lively", "mouth-watering and zesty"], enthusiast: ["low acidity", "medium acidity", "medium-plus acidity", "high acidity"], pro: ["low acidity", "medium acidity", "medium(+) acidity", "high acidity"] },
  body: { beginner: ["light-feeling", "medium weight", "fairly full", "full and rich"], enthusiast: ["light-bodied", "medium-bodied", "medium-plus body", "full-bodied"], pro: ["light body", "medium body", "medium(+) body", "full body"] },
  tannin: { beginner: ["smooth, no grip", "a little grip", "firm grip", "very grippy and drying"], enthusiast: ["soft tannins", "medium tannins", "firm tannins", "high tannins"], pro: ["low tannin", "medium tannin", "medium(+) tannin", "high tannin"] },
  sweetness: { beginner: ["dry", "a touch sweet", "sweet", "very sweet"], enthusiast: ["dry", "off-dry", "medium-sweet", "sweet"], pro: ["dry", "off-dry", "medium-sweet", "sweet (dessert)"] },
  oak: { beginner: ["no oak taste", "a little oak", "oaky: vanilla and toast"], enthusiast: ["unoaked", "neutral oak", "new oak"], pro: ["unoaked", "neutral oak", "new oak"] },
  co2: { beginner: ["still", "slightly fizzy", "bubbly"], enthusiast: ["still", "frizzante (lightly sparkling)", "sparkling"], pro: ["still", "frizzante", "fully sparkling"] },
};
const modeKey = (m) => (m === "enthusiast" || m === "pro" ? m : "beginner");
export function feelWord(dim, v, mode = "beginner") {
  const w = FEEL_WORDS[dim]; if (!w || typeof v !== "number") return "";
  const list = w[modeKey(mode)];
  const i = dim === "acidity" || dim === "body" || dim === "tannin" ? STEP(v) : Math.max(0, Math.min(list.length - 1, Math.round(v)));
  return list[i];
}
// The feel of a wine as a list of words, in a fixed order. Bubbles only when there are some; sweetness only when it is not dry (a dry wine is the usual case).
export function feelLine(values, style, mode = "beginner") {
  const dims = dimsForStyle(style === "unknown" ? "red" : style);
  const out = [];
  ["body", "acidity", "tannin", "co2", "sweetness", "oak"].forEach((d) => {
    if (!dims.includes(d) || typeof values[d] !== "number") return;
    if (d === "co2" && !values[d]) return;
    if (d === "sweetness" && !values[d]) return;
    out.push(feelWord(d, values[d], mode));
  });
  return out;
}
// The same feel written as a sentence for the profile: "It is full and rich, with mouth-watering, zesty freshness, a firm grip and an oaky note of
// vanilla and toast." BODY_WORDS start the sentence; WITH_WORDS follow "with". Same steps as FEEL_WORDS.
const BODY_WORDS = { beginner: ["light and delicate", "of medium weight", "fairly full", "full and rich"], enthusiast: ["light-bodied", "medium-bodied", "medium-plus in body", "full-bodied"], pro: ["light-bodied", "medium-bodied", "medium(+) in body", "full-bodied"] };
const WITH_WORDS = {
  acidity: { beginner: ["soft, mellow freshness", "gentle freshness", "bright, lively freshness", "mouth-watering, zesty freshness"], enthusiast: ["low acidity", "medium acidity", "medium-plus acidity", "high acidity"], pro: ["low acidity", "medium acidity", "medium(+) acidity", "high acidity"] },
  tannin: { beginner: ["a smooth, silky feel", "a little grip", "a firm grip", "a very grippy, drying feel"], enthusiast: ["soft tannins", "medium tannins", "firm tannins", "high tannins"], pro: ["low tannin", "medium tannin", "medium(+) tannin", "high tannin"] },
  sweetness: { beginner: ["", "a touch of sweetness", "noticeable sweetness", "dessert sweetness"], enthusiast: ["", "an off-dry touch", "medium sweetness", "full sweetness"], pro: ["", "off-dry sweetness", "medium-sweet", "sweet (dessert) style"] },
  co2: { beginner: ["", "a light spritz", "lively bubbles"], enthusiast: ["", "a frizzante spritz", "a fully sparkling mousse"], pro: ["", "a frizzante spritz", "a fully sparkling mousse"] },
  oak: { beginner: ["no oak taste", "a light touch of oak", "an oaky note of vanilla and toast"], enthusiast: ["no oak", "a little neutral oak", "new oak (vanilla, toast)"], pro: ["no oak", "neutral oak", "new oak (vanilla, toast)"] },
};
export function feelSentence(values, style, mode = "beginner") {
  const m = modeKey(mode), dims = dimsForStyle(style === "unknown" ? "red" : style);
  const body = typeof values.body === "number" ? BODY_WORDS[m][STEP(values.body)] : "";
  const parts = [];
  ["acidity", "tannin", "co2", "sweetness", "oak"].forEach((d) => {
    if (!dims.includes(d) || typeof values[d] !== "number") return;
    const list = WITH_WORDS[d][m];
    const w = d === "acidity" || d === "tannin" ? list[STEP(values[d])] : list[Math.max(0, Math.min(list.length - 1, Math.round(values[d])))];
    if (w) parts.push(w);
  });
  if (!body && !parts.length) return "";
  return `It is ${body || "balanced"}${parts.length ? `, with ${listText(parts)}` : ""}.`;
}
// The profile as a short paragraph, in pieces so the screen can bold the clue words: [{ t: text, b: true for a clue }].
export function profileText(item, mode = "full", { band = null, mode: words = "beginner", level = "easy" } = {}) {
  const seg = [], say = (t, b = false) => seg.push({ t, b });
  const list = (arr) => arr.forEach((x, i) => { say(x, true); if (i < arr.length - 2) say(", "); else if (i === arr.length - 2) say(" and "); });
  if (mode === "age" && band) {
    const cues = AGE_CUES[item.type][band];
    if (level !== "hard") { say("In the glass it is "); say(cues.look[0], true); say(". "); }
    say("It smells and tastes of "); list(cues.smell); say(". ");
    say("In the mouth, "); list(cues.feel); say(". ");
    const g = GRAPE_AGE[item.vk];
    if (g && AGE_BANDS.findIndex((b) => b.id === band) >= AGE_BANDS.findIndex((b) => b.id === g.from)) { say(`It also shows what ${item.grapeName} gains with time: `); list(g.notes); say(". "); }
    return seg;
  }
  const type = TYPE_WORDS[item.type].toLowerCase().replace(/^rosé$/, "rosé wine");
  say(an(type)); say(". ");
  if (mode === "full" || mode === "grape" || mode === "place") {
    const shown = item.clues.slice(0, mode === "place" ? 5 : 4);
    // Where the grapes grew is told through the fruit, as a taster finds it: tart and zippy in a cool place, jammy and cooked in a hot one
    // (Full blind and Where from? only; Which grape? keeps to the grape's own notes).
    const ripe = mode === "full" || mode === "place" ? RIPENESS[item.climate] : null;
    const fruit = shown.filter((f) => FRUIT.has(f)), other = shown.filter((f) => !FRUIT.has(f));
    const names = (a) => a.map((f) => LABEL[f].toLowerCase());
    if (ripe && fruit.length) {
      say("It smells and tastes of "); say(ripe.words, true); say(" fruit ("); list(names(fruit)); say(")");
      if (other.length) { say(", with "); list(names(other)); }
      say(". ");
    } else {
      say("It smells and tastes of "); list(names(shown)); say(". ");
      if (ripe) { say("The fruit feels "); say(ripe.words, true); say(". "); }
    }
    say(feelSentence(item.values, item.type, words));
  }
  return seg;
}
// The fruit groups of the flavor list (flavordata.js CATS): only these carry the ripeness words.
const FRUIT = new Set([...CATS.darkfruit, ...CATS.redfruit, ...CATS.citrus, ...CATS.orchard, ...CATS.tropical]);
// How ripe the fruit tastes, from the climate rule (rules.js climateOf). This is the usual teaching: slow ripening in a cool place keeps fruit tart and
// zippy; sun and heat give juicy, then jammy, cooked fruit. The same line is in the professional tasting grid ("Fruit ripeness", tasting.js).
export const RIPENESS = {
  cool: { words: "tart, zippy, just-ripe", grid: "under-ripe" },
  moderate: { words: "fresh, ripe", grid: "just ripe" },
  warm: { words: "ripe, juicy", grid: "ripe" },
  hot: { words: "jammy, cooked", grid: "over-ripe" },
};
const CLIMATE_WORDS = {
  cool: { hint: "from a cool place", feel: "Cool places keep acidity bright and the body lighter.", why: "Tart, zippy fruit points to a cool place: the grapes ripen slowly and keep their acidity, and the body stays lighter." },
  moderate: { hint: "from a mild place", feel: "A mild climate gives a middle path: ripe fruit with fresh acidity.", why: "Fresh, ripe fruit points to a mild place: ripe fruit that still keeps fresh acidity." },
  warm: { hint: "from a warm, sunny place", feel: "Warm, sunny places give a fuller body and softer tannins.", why: "Ripe, juicy fruit points to a warm, sunny place: the grapes ripen fully, giving a fuller body and softer tannins." },
  hot: { hint: "from a hot place", feel: "Hot places give a full body and gentle acidity.", why: "Jammy, cooked fruit points to a hot place: very ripe grapes give a full body and gentle acidity." },
};
export const TYPE_WORDS = { red: "Red wine", white: "White wine", sparkling: "Sparkling wine", rose: "Rosé", fortified: "Fortified wine" };

// ---------------------------------------------------------------- which flavors to show (hallmarks, not shared notes)
// A clue is only useful if it points to one grape. Notes that come from how a wine is MADE (new oak gives vanilla, toast and cedar; a buttery feel comes
// from a softening step; brioche from resting on yeast) say "oak" or "method", not "this grape", and many grapes share them, so they are never shown as
// the grape's flavors. Oak is told by the feel instead ("an oaky note of vanilla and toast"), so a Tempranillo's vanilla is not mistaken for its fruit.
export const WINEMAKING = ["vanilla", "toast", "butter", "cedar", "chocolate", "brioche"];
// For sparkling wine, the bread and toast of resting on the yeast IS the classic marker of the method, so it stays.
const KEEP_FOR = { sparkling: ["brioche", "toast"] };
// The textbook marker of each grape (only flavors already in that grape's own list in flavordata.js, so nothing new is claimed; this only says which
// of its notes to show first). Shown first, then the grape's other notes that few other grapes share.
export const HALLMARKS = {
  cabernetsauvignon: ["blackcurrant", "bellpepper", "mint"], merlot: ["plum", "cherry"], pinotnoir: ["cherry", "strawberry", "earth"],
  nebbiolo: ["tar", "rose"], syrah: ["pepper", "blackberry"], shiraz: ["blackberry", "pepper", "licorice"], malbec: ["violet", "plum"],
  tempranillo: ["leather", "cherry"], sangiovese: ["cherry", "herb"], zinfandel: ["raspberry", "blackberry", "pepper"], garnacha: ["strawberry", "herb"],
  aglianico: ["tar", "earth"], carmenere: ["bellpepper"], gamay: ["strawberry", "raspberry", "violet"], monastrell: ["leather", "blackberry"],
  montepulciano: ["cherry", "licorice"], primitivo: ["plum", "raspberry"], saperavi: ["blackberry", "pepper"],
  chardonnay: ["apple", "lemon"], sauvignonblanc: ["grass", "gooseberry", "grapefruit"], riesling: ["petrol", "lime", "slate"], pinotgris: ["pear", "almond"],
  cheninblanc: ["honey", "apple"], viognier: ["apricot", "flowers"], albarino: ["peach", "lemon"], gruner: ["pepper"], vermentino: ["lime", "herb"],
  glera: ["pear", "apple"], cortese: ["lemon", "almond"], melon: ["chalk", "lemon"], manzoni: ["pear", "peach"], moscato: ["flowers", "peach", "orange"],
  chardonnaysparkling: ["brioche", "apple"], pinotnoirsparkling: ["strawberry", "brioche"], pinotnoirrose: ["strawberry", "cherry"], garnacharose: ["strawberry", "herb"],
};
// How few grapes of the same type share a flavor: log(grapes / grapes with it). A note every red has (plum) scores low; tar or petrol scores high.
function rarity(type) {
  const V = tables().VAR, keys = Object.keys(V).filter((k) => !/^generic/.test(k) && V[k].type === type);
  const out = {};
  Object.keys(LABEL).forEach((f) => { const n = keys.filter((k) => (V[k].f || {})[f]).length; out[f] = Math.log((keys.length + 1) / (n + 1)); });
  return out;
}
// The flavors to show for a wine, best clue first: hallmarks, then the rest by weight times rarity, never a winemaking note (except a sparkling
// wine's yeast notes). The place's nudges (flavordata.js) count as they do on the card, so a Chablis still shows its chalk.
export function clueFlavors(vk, placeKeys, type) {
  const { score, order } = ruleScores(vk, placeKeys), rare = rarity(type), keep = KEEP_FOR[type] || [];
  const allowed = order.filter((f) => score[f] > 0 && (!WINEMAKING.includes(f) || keep.includes(f)));
  const marks = (HALLMARKS[vk] || []).filter((f) => allowed.includes(f));
  const rest = allowed.filter((f) => !marks.includes(f)).sort((a, b) => score[b] * (0.5 + (rare[b] || 0)) - score[a] * (0.5 + (rare[a] || 0)) || order.indexOf(a) - order.indexOf(b));
  // A faint note (weight under 3, such as the pineapple a warm Chardonnay can show) would mislead in a cool Chablis, so it is used only to fill up to three.
  const strong = rest.filter((f) => score[f] >= 3), faint = rest.filter((f) => score[f] < 3);
  const list = [...marks, ...strong];
  return { list: list.length >= 3 ? list : [...list, ...faint.slice(0, 3 - list.length)], marks };
}

// ---------------------------------------------------------------- items: everything a question can be about
// An item is a classic or a catalog wine, with everything worked out once: the grape key and name, the place, the type, the flavors, the structure.
const placeName = (c) => c.appellation || c.region || "";
const placeLabel = (c) => [placeName(c), c.country].filter(Boolean).join(", ");
function makeItem(card, { classic = null, ref = null, now = new Date() } = {}) {
  const vk = varKeyFor(card);
  if (/^generic/.test(vk) && !(classic && classic.blend)) return null;   // the rules know nothing particular about this grape
  const fl = flavorsForCard(card);
  if (!fl.picks.length || !card.country) return null;
  const type = fl.type;
  if (!TYPE_WORDS[type] || type === "fortified") return null;
  const values = startingValues(card, ref);
  if (!Object.keys(values).length) return null;
  const grapeName = classic ? (classic.label || classic.grapes[0]) : ((card.grapes && card.grapes.length === 1 && card.grapes[0]) || (!card.grapes.length && card.ruleGrapes && card.ruleGrapes.length === 1 && card.ruleGrapes[0]) || "");
  if (!grapeName) return null;
  const facts = factsOf(card), climate = climateOf(facts), clue = clueFlavors(vk, placeKeysFor(card), type);
  if (!clue.list.length) return null;
  return {
    id: card.id, kind: classic ? "classic" : "catalog", card, vk, grapeName, blend: !!(classic && classic.blend), type,
    place: placeName(card), country: card.country, placeLabel: placeLabel(card), answer: `${grapeName} · ${placeLabel(card)}`,
    flavors: fl.picks.map((p) => p.key), clues: clue.list, marks: clue.marks, values, climate: climate.zone, climateSure: climate.sure, edited: !!(ref && Object.keys(ref).length),
    age: classic ? null : ageOf(card, now),
  };
}
// All the items: the classics, then the catalog wines that have one known grape, a country and a type the game plays (no fortified, no archived).
// refs: Map(card id -> editor structure); an editor's score wins over the rules.
// classics: false leaves the teaching profiles out (a venue version plays with the venue's own wines only).
export function buildItems(cards = [], refs = new Map(), now = new Date(), { classics = true } = {}) {
  const out = [];
  if (classics) CLASSICS.forEach((k) => { const it = makeItem(classicCard(k), { classic: k, now }); if (it) out.push(it); });
  (cards || []).forEach((c) => {
    if (!c || c.archived || c.style === "fortified" || c.style === "unknown") return;
    const it = makeItem(c, { ref: refs && refs.get ? refs.get(c.id) : null, now });
    if (it) out.push(it);
  });
  return out;
}

// ---------------------------------------------------------------- how alike two items are (for choosing the wrong answers)
const vec = (it) => { const v = {}; it.flavors.forEach((f, i) => { v[f] = 6 - i; }); return v; };
function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  Object.keys(a).forEach((k) => { na += a[k] * a[k]; if (b[k]) dot += a[k] * b[k]; });
  Object.values(b).forEach((x) => { nb += x * x; });
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
const STRUCT_DIMS = ["acidity", "body", "tannin"];
export function feelDistance(a, b) {
  let d = 0, n = 0;
  STRUCT_DIMS.forEach((k) => { if (typeof a[k] === "number" && typeof b[k] === "number") { d += Math.abs(a[k] - b[k]); n++; } });
  ["oak", "sweetness", "co2"].forEach((k) => { if (typeof a[k] === "number" && typeof b[k] === "number") { d += Math.abs(a[k] - b[k]) * 0.75; n++; } });
  return n ? d / n : 0;
}
// 0 (nothing alike) to 1 (the same): mostly the flavors, then the feel.
export const similarity = (a, b) => 0.7 * cosine(vec(a), vec(b)) + 0.3 * (1 - Math.min(1, feelDistance(a.values, b.values) / 2));

// ---------------------------------------------------------------- the games
export const MODES = [
  { id: "full", label: "Full blind", blurb: "The whole profile: flavors, how ripe the fruit is, and how it feels. Name the grape and the place." },
  { id: "grape", label: "Which grape?", blurb: "Only the flavors and the feel. Which grape is it?" },
  { id: "place", label: "Where from?", blurb: "You know the grape. Find the place from how ripe the fruit is, the feel and the flavors." },
  { id: "age", label: "How old?", blurb: "Colour, smell and feel that come with age. How old is it?" },
  { id: "feel", label: "How does it feel?", blurb: "You know the wine. Pick how it feels in the mouth." },
];
export const modeById = (id) => MODES.find((m) => m.id === id) || null;
export const LEVELS = [{ id: "easy", label: "Easy" }, { id: "hard", label: "Hard" }];
export const ROUND = 5;
export const CHOICES = 4;

// A small seeded random number source, so a round can be repeated in tests.
export function rngOf(seed = Date.now()) {
  let a = (Number(seed) >>> 0) || 1;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const shuffled = (list, rng) => { const b = [...list]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

// The three wrong answers: candidates [{ text, score }] (score: how alike they are to the answer, higher is closer). Hard takes from the closest half,
// Easy from the furthest half, each a little at random. Texts are never repeated and never the answer.
function pickWrong(answer, candidates, level, rng, n = CHOICES - 1) {
  const seen = new Set([answer]), uniq = [];
  [...candidates].sort((a, b) => b.score - a.score).forEach((c) => { if (c.text && !seen.has(c.text)) { seen.add(c.text); uniq.push(c); } });
  if (uniq.length < n) return null;
  // Hard: the closest few (about the top sixth, at least five); Easy: anything in the further half.
  const near = Math.min(uniq.length, Math.max(n + 2, Math.ceil(uniq.length / 6))), half = Math.max(n, Math.ceil(uniq.length / 2));
  const from = level === "hard" ? uniq.slice(0, near) : uniq.slice(uniq.length - half);
  return shuffled(from, rng).slice(0, n).map((c) => c.text);
}

// The profile the player sees, as clue groups. Each clue says where it comes from (source), so the "Why" can be honest.
export function profileOf(item, mode = "full", { band = null, mode: words = "beginner", level = "easy" } = {}) {
  const groups = [];
  const flavorList = item.clues.slice(0, mode === "place" ? 5 : 4);
  if (mode !== "age") groups.push({ id: "type", title: "In the glass", lines: [TYPE_WORDS[item.type]], source: "type" });
  if (mode === "full" || mode === "grape" || mode === "place") groups.push({ id: "feel", title: "How it feels", lines: feelLine(item.values, item.type, words), source: item.edited ? "editor" : "rules" });
  if (mode === "full" || mode === "grape" || mode === "place") groups.push({ id: "flavors", title: "Smells and tastes like", lines: flavorList.map((f) => LABEL[f]), keys: flavorList, source: "flavors" });
  if (mode === "full" || mode === "place") groups.push({ id: "climate", title: "How ripe the fruit is", lines: [RIPENESS[item.climate].words], source: "climate" });
  if (mode === "age" && band) {
    const cues = AGE_CUES[item.type][band];
    if (level !== "hard") groups.push({ id: "look", title: "In the glass", lines: cues.look, source: "age" });
    groups.push({ id: "smell", title: "Smells and tastes like", lines: cues.smell, source: "age" });
    groups.push({ id: "mouth", title: "How it feels", lines: cues.feel, source: "age" });
    const g = GRAPE_AGE[item.vk];
    if (g && AGE_BANDS.findIndex((b) => b.id === band) >= AGE_BANDS.findIndex((b) => b.id === g.from)) groups.push({ id: "grapeage", title: `Also, as ${item.grapeName} ages`, lines: g.notes, source: "age" });
  }
  return groups;
}
// What the question says above the profile (the part the player is told).
// "A Pinot Noir", "An Albariño"; a blend is written by its place: "A wine from Champagne, France (Chardonnay and Pinot Noir)".
const an = (w) => (/^[aeiouAEIOU]/.test(w) ? "An " : "A ") + w;
const wineOf = (item, withPlace) => (item.blend ? `A wine of ${item.grapeName}` : an(item.grapeName)) + (withPlace ? ` from ${item.placeLabel}` : "");
function promptOf(item, mode) {
  if (mode === "full") return "Which wine is this?";
  if (mode === "grape") return "Which grape is this?";
  if (mode === "place") return `${wineOf(item, false)}. Where is it from?`;
  if (mode === "age") return `${wineOf(item, true)}. How old is it?`;
  return `${wineOf(item, true)}. How does it feel?`;
}

// Two places where one lies inside the other (Sonoma County is in California) are both right, so they are never offered together.
function overlaps(a, b) {
  if (a.country !== b.country) return false;
  const ra = a.card.region || "", rb = b.card.region || "";
  return (ra && (ra === b.place || (ra === rb && (!a.card.appellation || !b.card.appellation)))) || (rb && rb === a.place);
}
// One question. items: all items (buildItems). Returns null when there are not enough different answers to choose from.
// { mode, itemId, prompt, profile, choices: [text], answer, band, why: [text], topics }
export function makeQuestion(mode, item, items, { level = "easy", rng = Math.random, words = "beginner", band: wantBand = null } = {}) {
  const same = items.filter((x) => x !== item && x.type === item.type);
  let answer, wrong, band = null;
  if (mode === "full") {
    answer = item.answer;
    wrong = pickWrong(answer, same.filter((x) => x.vk !== item.vk && x.grapeName !== item.grapeName && x.placeLabel !== item.placeLabel).map((x) => ({ text: x.answer, score: similarity(item, x) })), level, rng);
  } else if (mode === "grape") {
    if (item.blend) return null;
    answer = item.grapeName;
    wrong = pickWrong(answer, same.filter((x) => !x.blend && x.vk !== item.vk && x.grapeName !== item.grapeName).map((x) => ({ text: x.grapeName, score: similarity(item, x) })), level, rng);
  } else if (mode === "place") {
    answer = item.placeLabel;
    // Hard: the same grape grown somewhere else counts as the closest (Pinot Noir from Burgundy or from Oregon); Easy keeps away from the same climate.
    wrong = pickWrong(answer, same.filter((x) => x.placeLabel !== item.placeLabel && x.place !== item.place && !overlaps(item, x)).map((x) => ({ text: x.placeLabel, score: (x.vk === item.vk ? 1 : 0) + (x.climate === item.climate ? 0.5 : 0) + 0.5 * similarity(item, x) })), level, rng);
  } else if (mode === "age") {
    if (!AGE_TYPES.includes(item.type)) return null;
    const allowed = bandsFor(item.vk, item.type);
    if (item.age !== null && item.age !== undefined) { const b = bandOf(item.age); if (!b || !allowed.includes(b)) return null; band = b.id; }
    else band = wantBand && allowed.some((b) => b.id === wantBand) ? wantBand : allowed[Math.floor(rng() * allowed.length)].id;
    answer = bandById(band).label;
    wrong = AGE_BANDS.filter((b) => b.id !== band).map((b) => b.label);
  } else if (mode === "feel") {
    answer = feelLine(item.values, item.type, words).join(", ");
    wrong = pickWrong(answer, same.map((x) => ({ text: feelLine(x.values, x.type, words).join(", "), score: -feelDistance(item.values, x.values) })), level, rng);
  } else return null;
  if (!answer || !wrong) return null;
  const choices = mode === "age" ? AGE_BANDS.map((b) => b.label) : shuffled([answer, ...wrong], rng);
  return {
    mode, level, itemId: item.id, kind: item.kind, prompt: promptOf(item, mode), profile: profileOf(item, mode, { band, mode: words, level }),
    choices, answer, band, why: whyLines(item, mode, band, words), text: profileText(item, mode, { band, mode: words, level }), topics: topicsOf(item, mode), reveal: revealOf(item, band),
  };
}
// What the answer was, in full, shown after the pick.
function revealOf(item, band) {
  const c = item.card;
  const name = item.kind === "catalog" ? [c.vintage, c.producer, c.cuvee].filter(Boolean).join(" ") : "";
  const b = band ? bandById(band) : null;
  return { title: item.answer, wine: name, cardId: item.kind === "catalog" ? item.id : null, age: b ? `${b.label} (${b.years})` : "", typical: item.kind === "classic" };
}

// ---------------------------------------------------------------- why (each line only repeats what a rule or the catalog says)
export function whyLines(item, mode, band = null, words = "beginner") {
  const out = [];
  const T = tables();
  if (mode === "full" || mode === "grape" || mode === "place") {
    // Each flavor shown is explained once: the grape's hallmark, then what the place adds (flavordata.js nudges), then the grape's other notes.
    const shown = item.clues.slice(0, mode === "place" ? 5 : 4);
    const who = item.blend ? item.place || item.grapeName : item.grapeName;
    const nudged = new Set();
    placeKeysFor(item.card).forEach((k) => { const p = T.REGION.get(k); if (p) Object.keys(p.add || {}).forEach((f) => nudged.add(f)); });
    const marks = shown.filter((f) => item.marks.includes(f));
    const fromPlace = shown.filter((f) => !marks.includes(f) && nudged.has(f));
    const rest = shown.filter((f) => !marks.includes(f) && !fromPlace.includes(f));
    const names = (a) => sentence(listText(a.map((f) => LABEL[f])));
    if (marks.length) out.push(`${names(marks)}: the hallmark of ${who}.`);
    if (fromPlace.length && item.place) out.push(`${names(fromPlace)}: ${fromPlace.length === 1 ? "a note" : "notes"} ${item.place} often adds.`);
    if (rest.length) out.push(`${names(rest)}: also typical of ${who}.`);
  }
  if (mode === "full" || mode === "place" || mode === "grape" || mode === "feel") {
    const s = safeSuggest(item.card);
    if (s) {
      const seen = new Set();
      Object.values(s.dims).forEach((d) => { if (d.layer === "appellation" && d.why[0] && !seen.has(d.why[0])) { seen.add(d.why[0]); out.push(d.why[0] + "."); } });
      if (!seen.size) out.push(`${item.grapeName} is usually ${feelLine(item.values, item.type, words).slice(0, 3).join(", ")}.`);
    }
    if (item.edited) out.push("Our editors scored how this wine feels.");
    if (item.values.oak === 2 && mode !== "feel") out.push("Vanilla and toast come from new oak barrels, not from the grape: any oaked wine can show them, so they do not point to one grape.");
  }
  if (mode === "full" || mode === "place") out.push(CLIMATE_WORDS[item.climate].why);
  if (mode === "feel") out.push(CLIMATE_WORDS[item.climate].feel);
  if (mode === "age" && band) {
    const b = bandById(band), cues = AGE_CUES[item.type][band];
    out.push(`${b.label} (${b.years}): ${cues.look[0]}; ${cues.smell[0]}; ${cues.feel[0]}.`);
    const g = GRAPE_AGE[item.vk];
    if (g) out.push(`${item.grapeName} with age: ${listText(g.notes)}.`);
    const pot = potentialOf(item.vk);
    if (pot === "young" || item.type === "rose") out.push(`${item.grapeName} is usually enjoyed young, while its fruit is fresh.`);
    else if (pot === "long") out.push(`${item.grapeName} is often made to age for many years.`);
    if (item.kind === "catalog" && Number.isFinite(item.age)) out.push(`This wine's vintage makes it about ${item.age} ${item.age === 1 ? "year" : "years"} old.`);
  }
  return out;
}
function safeSuggest(card) { try { return suggestStructure(card); } catch (_) { return null; } }
// "Strawberry, Raspberry and Violet" reads as "Strawberry, raspberry and violet".
const sentence = (t) => (t ? t.charAt(0) + t.slice(1).toLowerCase() : t);
const listText = (a) => (a.length <= 1 ? a[0] || "" : `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`);

// What to learn more about after a question: the grape, the place, the country, or wine ageing. kind and name match quiz tags (tags.js refOf).
// words: extra whole words that count as the topic in a question without tags.
export function topicsOf(item, mode) {
  const grape = item.blend ? null : { kind: "grape", name: item.grapeName };
  const place = item.place ? { kind: "region", name: item.place } : null;
  const country = { kind: "country", name: item.country };
  const ageing = { kind: "theme", name: "Wine ageing", words: ["ageing", "aging", "tertiary", "bottle age", "cellaring", "cellar"] };
  const order = mode === "age" ? [ageing, grape] : mode === "place" ? [place, country, grape] : [grape, place, country];
  return order.filter(Boolean);
}

// Whether a catalog wine is about a topic (for "Try a wine like it"): the same grape (other names count: Shiraz is Syrah), the same place, or the same country.
// Only the catalog's own grape and place fields are read.
export function cardFitsTopic(card, topic) {
  if (!card || !topic) return false;
  if (topic.kind === "grape") {
    const want = grapeFor(topic.name), names = [...(card.grapes || []), ...(card.ruleGrapes || [])];
    return names.length === 1 && (want ? (grapeFor(names[0]) || {}).name === want.name : norm(names[0]) === norm(topic.name));
  }
  if (topic.kind === "region") return [card.appellation, card.region].some((x) => x && norm(x) === norm(topic.name));
  if (topic.kind === "country") return !!card.country && norm(card.country) === norm(topic.name);
  return false;
}
export const topicName = (t) => (t ? t.name : "");

// ---------------------------------------------------------------- a round
// Five questions, each about a different answer. Catalog wines and classics are mixed (about half from the catalog when it has enough).
export function makeRound(mode, items, { level = "easy", rng = Math.random, words = "beginner", size = ROUND } = {}) {
  const pool = mode === "age" ? items.filter((x) => AGE_TYPES.includes(x.type)) : items;
  const catalog = shuffled(pool.filter((x) => x.kind === "catalog"), rng), classics = shuffled(pool.filter((x) => x.kind === "classic"), rng);
  const order = [];
  for (let i = 0; i < Math.max(catalog.length, classics.length); i++) { if (i < classics.length) order.push(classics[i]); if (i < catalog.length) order.push(catalog[i]); }
  const out = [], used = new Set();
  for (const it of order) {
    if (out.length >= size) break;
    const q = makeQuestion(mode, it, items, { level, rng, words });
    if (!q) continue;
    const key = mode === "age" ? `${it.vk}|${q.band}` : q.answer;
    if (used.has(key)) continue;
    used.add(key); out.push(q);
  }
  return out;
}
export const isRight = (q, choice) => !!q && choice === q.answer;
export const scoreOf = (round, picks) => round.reduce((n, q, i) => n + (isRight(q, picks[i]) ? 1 : 0), 0);
// The topics missed in a round, each once, in order (the first topic of each missed question).
export function missedTopics(round, picks) {
  const out = [], seen = new Set();
  round.forEach((q, i) => {
    if (isRight(q, picks[i]) || !q.topics.length) return;
    const t = q.topics[0], k = t.kind + ":" + t.name.toLowerCase();
    if (!seen.has(k)) { seen.add(k); out.push(t); }
  });
  return out;
}

// ---------------------------------------------------------------- what the phone remembers: best scores only
export const emptyMemory = () => ({ best: {}, rounds: 0 });
export function parseMemory(text) {
  try {
    const m = JSON.parse(text || "null");
    if (!m || typeof m !== "object") return emptyMemory();
    const best = {};
    Object.entries(m.best || {}).forEach(([k, v]) => { if (/^[a-z]+:[a-z]+$/.test(k) && Number.isFinite(v) && v >= 0 && v <= ROUND) best[k] = v; });
    return { best, rounds: Number.isFinite(m.rounds) && m.rounds >= 0 ? Math.floor(m.rounds) : 0 };
  } catch (_) { return emptyMemory(); }
}
export function recordRound(memory, mode, level, score) {
  const k = `${mode}:${level}`, best = { ...memory.best };
  if (!Number.isFinite(best[k]) || score > best[k]) best[k] = score;
  return { best, rounds: (memory.rounds || 0) + 1 };
}
export const bestOf = (memory, mode, level) => (Number.isFinite((memory.best || {})[`${mode}:${level}`]) ? memory.best[`${mode}:${level}`] : null);

// Structure rules: suggest a wine's structure (acidity, body, tannin or CO2, sweetness, oak) from what the catalog knows
// about it: grape, appellation, region, style, classification and label words.
//
// The result is a STARTING POINT with a reason and a confidence, never a fact. Editors confirm or correct it.
//
// Layers, first match wins for each dimension:
//   1. label words      "Brut", "Kabinett", "Reserva", "Dry", "Tawny" ...
//   2. appellation      Barolo, Chablis, Margaux ... where the place itself defines the style
//   3. grape + climate  the grape's typical profile, shifted for how warm or cool the place is
//   4. style default    a plain red, white, rose, sparkling or fortified wine
//
// Scales: acidity, body, tannin and sweetness run 1 to 5 in steps of 0.5. Oak is 0 or 1. CO2 is 0 none, 1 frizzy, 2 sparkling.
// This file is pure: no browser, no network. Everything it uses is listed here so it can be reviewed and tuned.

export const RULES_VERSION = "1";

// ---------------------------------------------------------------- helpers
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round5 = (v) => Math.round(v * 2) / 2;
// Lowercase, no accents, no punctuation: "St.-Émilion" becomes "saint emilion".
export function norm(s) {
  return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/\bst\b/g, "saint").replace(/\bste\b/g, "sainte");
}
const hasPhrase = (text, phrase) => ` ${text} `.includes(` ${norm(phrase)} `);
const anyPhrase = (text, phrases) => (phrases || []).some((p) => hasPhrase(text, p));

// ---------------------------------------------------------------- grapes
// name: [color, acidity, body, tannin]. White grapes have no tannin. Values are for a moderate climate.
const GRAPE_ROWS = {
  "Cabernet Sauvignon": ["red", 3.5, 4, 4.5], "Merlot": ["red", 3, 3.5, 3], "Cabernet Franc": ["red", 3.5, 3.5, 3.5],
  "Petit Verdot": ["red", 3.5, 4.5, 4.5], "Malbec": ["red", 3, 4, 4], "Carmenère": ["red", 3, 3.5, 3.5],
  "Pinot Noir": ["red", 4, 2.5, 2], "Syrah": ["red", 3.5, 4, 4], "Grenache": ["red", 2.5, 3.5, 2.5],
  "Mourvèdre": ["red", 3, 4, 4.5], "Carignan": ["red", 3.5, 3.5, 3.5], "Cinsault": ["red", 3, 2.5, 2],
  "Tempranillo": ["red", 3, 3.5, 3.5], "Sangiovese": ["red", 4, 3, 3.5], "Nebbiolo": ["red", 4.5, 3.5, 5],
  "Barbera": ["red", 4.5, 3, 2], "Dolcetto": ["red", 2.5, 3, 3], "Montepulciano": ["red", 3, 3.5, 3.5],
  "Aglianico": ["red", 4, 4, 4.5], "Nero d'Avola": ["red", 3, 4, 3.5], "Negroamaro": ["red", 3, 4, 3.5],
  "Zinfandel": ["red", 3, 4, 3.5], "Gamay": ["red", 3.5, 2, 1.5], "Zweigelt": ["red", 3, 3, 2],
  "Blaufränkisch": ["red", 4, 3.5, 3.5], "Saperavi": ["red", 4, 4.5, 4.5], "Pinotage": ["red", 3.5, 4, 4],
  "Tannat": ["red", 3.5, 4.5, 5], "Touriga Nacional": ["red", 3.5, 4.5, 4.5], "Corvina": ["red", 4, 2.5, 2.5],
  "Mencía": ["red", 3.5, 3, 2.5], "Petite Sirah": ["red", 3.5, 5, 5], "Xinomavro": ["red", 4.5, 3.5, 4.5],
  "Chardonnay": ["white", 3.5, 3.5], "Sauvignon Blanc": ["white", 4.5, 2.5], "Riesling": ["white", 4.5, 2.5],
  "Chenin Blanc": ["white", 4.5, 3], "Pinot Gris": ["white", 3, 3], "Viognier": ["white", 2.5, 4],
  "Gewürztraminer": ["white", 2.5, 4], "Albariño": ["white", 4, 2.5], "Grüner Veltliner": ["white", 4, 3],
  "Vermentino": ["white", 3.5, 2.5], "Melon de Bourgogne": ["white", 4.5, 2], "Garganega": ["white", 3.5, 2.5],
  "Glera": ["white", 4, 2], "Moscato": ["white", 3, 2], "Sémillon": ["white", 3.5, 3.5], "Marsanne": ["white", 3, 4],
  "Roussanne": ["white", 3, 4], "Trebbiano": ["white", 3.5, 2], "Verdejo": ["white", 4, 3], "Godello": ["white", 3.5, 3.5],
  "Fiano": ["white", 4, 3.5], "Greco": ["white", 4, 3.5], "Furmint": ["white", 4.5, 3.5], "Assyrtiko": ["white", 5, 3.5],
  "Silvaner": ["white", 3.5, 3], "Müller-Thurgau": ["white", 3, 2.5], "Pinot Blanc": ["white", 3.5, 3],
  "Manzoni Bianco": ["white", 4, 3], "Cortese": ["white", 3.5, 2.5], "Arneis": ["white", 3, 3], "Ribolla Gialla": ["white", 4, 3],
  "Friulano": ["white", 3.5, 3], "Viura": ["white", 3.5, 2.5], "Torrontés": ["white", 3, 3],
};
export const GRAPES = {};
for (const [name, r] of Object.entries(GRAPE_ROWS)) GRAPES[norm(name)] = { name, color: r[0], acidity: r[1], body: r[2], tannin: r[3] };
// Other names for the same grape.
const ALIASES = {
  "garnacha": "Grenache", "grenache noir": "Grenache", "cannonau": "Grenache", "pinot nero": "Pinot Noir", "spätburgunder": "Pinot Noir",
  "blauburgunder": "Pinot Noir", "shiraz": "Syrah", "pinot grigio": "Pinot Gris", "grauburgunder": "Pinot Gris", "primitivo": "Zinfandel",
  "tinta de toro": "Tempranillo", "tinto fino": "Tempranillo", "cencibel": "Tempranillo", "monastrell": "Mourvèdre", "mataro": "Mourvèdre",
  "cariñena": "Carignan", "ugni blanc": "Trebbiano", "weissburgunder": "Pinot Blanc", "pinot bianco": "Pinot Blanc", "sangiovese grosso": "Sangiovese",
  "brunello": "Sangiovese", "prugnolo gentile": "Sangiovese", "durif": "Petite Sirah", "macabeo": "Viura", "semillon": "Sémillon",
  "tocai friulano": "Friulano", "muscat": "Moscato", "moscato bianco": "Moscato", "gruner veltliner": "Grüner Veltliner", "muller thurgau": "Müller-Thurgau",
};
const GRAPE_LOOKUP = {};
for (const [k, g] of Object.entries(GRAPES)) GRAPE_LOOKUP[k] = k;
for (const [alias, target] of Object.entries(ALIASES)) GRAPE_LOOKUP[norm(alias)] = norm(target);
export const grapeFor = (name) => GRAPES[GRAPE_LOOKUP[norm(name)]] || null;

// ---------------------------------------------------------------- climate
// How warm or cool a place is changes acidity, body and tannin. First match wins: appellation, then region, then country.
export const CLIMATE_SHIFT = {
  cool: { acidity: 0.5, body: -0.25, tannin: -0.25 },
  moderate: { acidity: 0, body: 0, tannin: 0 },
  warm: { acidity: -0.5, body: 0.5, tannin: 0.25 },
  hot: { acidity: -1, body: 0.75, tannin: 0.5 },
};
const C = (zone, places) => ({ zone, places });
export const CLIMATES = [
  C("cool", ["eola amity hills", "dundee hills", "yamhill carlton", "willamette valley", "oregon", "russian river valley", "sonoma coast", "west sonoma coast", "fort ross seaview", "sta rita hills", "anderson valley", "finger lakes", "new york", "marlborough", "central otago", "casablanca", "tasmania", "burgundy", "bourgogne", "beaune", "cote d or", "chablis", "champagne", "loire", "sancerre", "muscadet", "savennieres", "vouvray", "alsace", "mosel", "rheingau", "germany", "austria", "niederosterreich", "wachau", "kamptal", "conegliano valdobbiadene", "trentino alto adige", "vigneti delle dolomiti", "franciacorta", "new zealand"]),
  C("warm", ["dry creek valley", "napa valley", "rutherford", "oakville", "paso robles", "columbia valley", "walla walla valley", "walla walla", "chateauneuf du pape", "gigondas", "rhone valley", "provence", "coteaux varois", "cassis", "maipo", "colchagua", "apalta", "mendoza", "agrelo", "barossa", "south australia", "stellenbosch", "western cape", "australia", "campo de borja", "calatayud", "montsant", "priorat", "catalonia", "lazio", "maremma", "brunello di montalcino", "douro", "portugal", "chile", "argentina", "south africa", "spain", "arizona"]),
  C("moderate", ["spring mountain district", "sonoma valley", "santa barbara county", "eagle peak", "mendocino", "clarksburg", "bordeaux", "margaux", "saint julien", "saint emilion", "saint estephe", "pauillac", "pomerol", "pessac leognan", "saint joseph", "piedmont", "barolo", "barbaresco", "tuscany", "chianti classico", "chianti rufina", "toscana", "liguria", "colli di luni", "lombardy", "oltrepo pavese", "campania", "taurasi", "sicily", "etna", "veneto", "rioja", "ribera del duero", "vinos de madrid", "madrid", "paraje altamira", "gualtallary", "castilla y leon", "california", "washington", "usa", "france", "italy"]),
];
// Check order matters: a specific place beats a broad one, so each place is looked up across all zones, longest phrase first.
const CLIMATE_INDEX = [];
for (const c of CLIMATES) for (const p of c.places) CLIMATE_INDEX.push({ zone: c.zone, phrase: norm(p) });
CLIMATE_INDEX.sort((a, b) => b.phrase.length - a.phrase.length);
export function climateOf(f) {
  for (const field of [f.appellation, f.region, f.country]) {
    if (!field) continue;
    const hit = CLIMATE_INDEX.find((c) => hasPhrase(field, c.phrase));
    if (hit) return { zone: hit.zone, place: hit.phrase, sure: field !== f.country };
  }
  return { zone: "moderate", place: "", sure: false };
}

// ---------------------------------------------------------------- appellation profiles
// Where the place itself defines the style. Only the dimensions the place really defines are listed.
// styles: which wine styles it applies to. conf: dimensions that are less certain than usual.
const P = (places, set, why, opts = {}) => ({ places: places.map(norm), set, why, styles: opts.styles || null, conf: opts.conf || {}, styleHint: opts.styleHint || null });
export const PROFILES = [
  P(["margaux"], { acidity: 3.5, body: 3.5, tannin: 4, oak: 1 }, "Margaux: elegant Cabernet-based red, firm tannins, aged in barrel", { styles: ["red", "unknown"], styleHint: "red" }),
  P(["saint julien"], { acidity: 3.5, body: 4, tannin: 4, oak: 1 }, "Saint-Julien: classic Cabernet-based red, balanced, barrel-aged", { styles: ["red", "unknown"], styleHint: "red" }),
  P(["pauillac"], { acidity: 3.5, body: 4.5, tannin: 4.5, oak: 1 }, "Pauillac: powerful Cabernet-based red, barrel-aged", { styles: ["red", "unknown"], styleHint: "red" }),
  P(["saint estephe"], { acidity: 3.5, body: 4, tannin: 4.5, oak: 1 }, "Saint-Estèphe: firm, structured red, barrel-aged", { styles: ["red", "unknown"], styleHint: "red" }),
  P(["saint emilion"], { acidity: 3.5, body: 4, tannin: 3.5, oak: 1 }, "Saint-Émilion: Merlot-led red, rounder tannins, barrel-aged", { styles: ["red", "unknown"], styleHint: "red" }),
  P(["pomerol"], { acidity: 3, body: 4, tannin: 3.5, oak: 1 }, "Pomerol: plush Merlot-led red, barrel-aged", { styles: ["red", "unknown"], styleHint: "red" }),
  P(["pessac leognan"], { acidity: 3.5, body: 4, tannin: 4, oak: 1 }, "Pessac-Léognan red: structured Cabernet-based, barrel-aged", { styles: ["red"] }),
  P(["pessac leognan"], { acidity: 4, body: 3.5, oak: 1, sweetness: 1 }, "Pessac-Léognan white: Sauvignon/Sémillon, usually barrel-fermented and dry", { styles: ["white"] }),
  P(["haut medoc", "medoc"], { acidity: 3.5, body: 3.5, tannin: 4, oak: 1 }, "Médoc: Cabernet-based red, barrel-aged", { styles: ["red", "unknown"], styleHint: "red" }),
  P(["sauternes", "barsac"], { acidity: 4, body: 4, sweetness: 5, oak: 1 }, "Sauternes: botrytis dessert wine, very sweet, barrel-aged", { styles: ["white", "unknown"] }),
  P(["chateauneuf du pape"], { acidity: 3, body: 4.5, tannin: 3.5, oak: 0 }, "Châteauneuf-du-Pape: warm, Grenache-led, full-bodied. Many use large old casks, so oak is uncertain", { styles: ["red", "unknown"], conf: { oak: "low" }, styleHint: "red" }),
  P(["gigondas"], { acidity: 3, body: 4.5, tannin: 4 }, "Gigondas: warm, Grenache-led, full and structured", { styles: ["red", "unknown"], styleHint: "red" }),
  P(["saint joseph"], { acidity: 3.5, body: 3.5, tannin: 3.5 }, "Saint-Joseph red: northern Rhône Syrah, medium-bodied", { styles: ["red"] }),
  P(["saint joseph"], { acidity: 3, body: 4, oak: 1 }, "Saint-Joseph white: Marsanne/Roussanne, full, often oak-aged", { styles: ["white"], conf: { oak: "low" } }),
  P(["cote rotie", "hermitage", "cornas"], { acidity: 3.5, body: 4.5, tannin: 4.5, oak: 1 }, "Northern Rhône Syrah: full, firm, barrel-aged", { styles: ["red"] }),
  P(["bourgogne", "bourgogne cote d or"], { acidity: 4, body: 2.5, tannin: 2, oak: 1 }, "Regional red Burgundy: light Pinot Noir, usually some oak", { styles: ["red"], conf: { oak: "low" } }),
  P(["bourgogne", "bourgogne cote d or"], { acidity: 4, body: 3 }, "Regional white Burgundy: Chardonnay, medium body", { styles: ["white"] }),
  P(["beaune", "gevrey chambertin", "chambolle musigny", "nuits saint georges", "vosne romanee", "pommard", "volnay", "morey saint denis", "aloxe corton"], { acidity: 4, body: 3, tannin: 3, oak: 1 }, "Côte d'Or red Burgundy: Pinot Noir, barrel-aged", { styles: ["red", "unknown"], styleHint: "red" }),
  P(["meursault", "puligny montrachet", "chassagne montrachet", "corton charlemagne", "montrachet"], { acidity: 4, body: 4, oak: 1, sweetness: 1 }, "Côte de Beaune white Burgundy: Chardonnay, barrel-fermented", { styles: ["white", "unknown"] }),
  P(["chablis"], { acidity: 4.5, body: 2.5, oak: 0, sweetness: 1 }, "Chablis: cool, steely Chardonnay, usually unoaked", { styles: ["white", "unknown"] }),
  P(["sancerre", "pouilly fume", "menetou salon"], { acidity: 4.5, body: 2.5, oak: 0, sweetness: 1 }, "Upper Loire Sauvignon Blanc: crisp, dry, unoaked", { styles: ["white", "unknown"] }),
  P(["muscadet"], { acidity: 4.5, body: 2, oak: 0, sweetness: 1 }, "Muscadet: very light, saline, dry, unoaked", { styles: ["white", "unknown"] }),
  P(["savennieres"], { acidity: 5, body: 3.5, oak: 0, sweetness: 1 }, "Savennières: high-acid dry Chenin Blanc, little oak influence", { styles: ["white", "unknown"], conf: { oak: "low" } }),
  P(["chinon", "bourgueil", "saumur champigny"], { acidity: 4, body: 3, tannin: 3, oak: 0 }, "Loire Cabernet Franc: fresh, medium-bodied, little oak", { styles: ["red"] }),
  P(["champagne"], { co2: 2, acidity: 4.5, body: 3, oak: 0 }, "Champagne: sparkling, high acid, mostly unoaked", { styles: ["sparkling"] }),
  P(["coteaux varois", "cotes de provence", "provence", "cassis"], { acidity: 3.5, body: 2, oak: 0 }, "Provence rosé: pale, dry, light, unoaked", { styles: ["rose"] }),
  P(["barolo"], { acidity: 4.5, body: 4, tannin: 5, oak: 1, sweetness: 1 }, "Barolo: Nebbiolo, high acid and very firm tannin, aged in oak", { styles: ["red", "unknown"], styleHint: "red" }),
  P(["barbaresco"], { acidity: 4.5, body: 3.5, tannin: 4.5, oak: 1, sweetness: 1 }, "Barbaresco: Nebbiolo, high acid and firm tannin, a little lighter than Barolo", { styles: ["red", "unknown"], styleHint: "red" }),
  P(["brunello di montalcino"], { acidity: 4, body: 4, tannin: 4.5, oak: 1 }, "Brunello di Montalcino: Sangiovese, long oak aging required", { styles: ["red", "unknown"], styleHint: "red" }),
  P(["chianti classico", "chianti rufina", "chianti"], { acidity: 4, body: 3, tannin: 3.5 }, "Chianti: Sangiovese, high acid, medium body", { styles: ["red", "unknown"], styleHint: "red" }),
  P(["taurasi"], { acidity: 4.5, body: 4.5, tannin: 5, oak: 1 }, "Taurasi: Aglianico, powerful, long oak aging required", { styles: ["red", "unknown"], styleHint: "red" }),
  P(["maremma toscana", "toscana", "bolgheri"], { acidity: 3.5, body: 4, tannin: 4, oak: 1 }, "Tuscan coastal red: Bordeaux-style blend, full, barrel-aged", { styles: ["red", "unknown"], conf: { acidity: "low", body: "low", tannin: "low", oak: "low" }, styleHint: "red" }),
  P(["valpolicella"], { acidity: 4, body: 2.5, tannin: 2.5 }, "Valpolicella: light, fresh, cherry-fruited red", { styles: ["red"] }),
  P(["amarone"], { acidity: 3.5, body: 5, tannin: 4, oak: 1, sweetness: 1.5 }, "Amarone: dried-grape red, very full, high alcohol", { styles: ["red", "unknown"] }),
  P(["conegliano valdobbiadene", "prosecco"], { co2: 2, acidity: 4, body: 2, oak: 0 }, "Prosecco: light, fresh sparkling, unoaked", { styles: ["sparkling"] }),
  P(["rioja"], { acidity: 3.5, body: 3.5, tannin: 3.5 }, "Rioja red: Tempranillo, medium-full; oak depends on the aging level on the label", { styles: ["red", "unknown"], styleHint: "red" }),
  P(["rioja"], { acidity: 3.5, body: 3 }, "Rioja white: Viura, medium body", { styles: ["white"] }),
  P(["ribera del duero"], { acidity: 3.5, body: 4.5, tannin: 4.5, oak: 1 }, "Ribera del Duero: Tempranillo, powerful, barrel-aged", { styles: ["red", "unknown"], styleHint: "red" }),
  P(["priorat"], { acidity: 3.5, body: 4.5, tannin: 4.5, oak: 1 }, "Priorat: Garnacha and Cariñena on slate, concentrated, barrel-aged", { styles: ["red", "unknown"], styleHint: "red" }),
  P(["montsant"], { acidity: 3, body: 4, tannin: 3.5 }, "Montsant: warm Garnacha and Cariñena, full", { styles: ["red", "unknown"], styleHint: "red" }),
  P(["calatayud", "campo de borja"], { acidity: 3, body: 4, tannin: 3 }, "Aragón Garnacha: warm, full-bodied, softer tannins", { styles: ["red", "unknown"], styleHint: "red" }),
  P(["rias baixas"], { acidity: 4, body: 2.5, oak: 0, sweetness: 1 }, "Rías Baixas: Albariño, fresh, unoaked", { styles: ["white", "unknown"] }),
  P(["rueda"], { acidity: 4, body: 3, oak: 0, sweetness: 1 }, "Rueda: Verdejo, fresh, unoaked", { styles: ["white", "unknown"] }),
  P(["cava"], { co2: 2, acidity: 4, body: 2, oak: 0 }, "Cava: light, dry sparkling, unoaked", { styles: ["sparkling"] }),
  P(["douro"], { acidity: 3.5, body: 4, tannin: 4 }, "Douro red: Touriga blends, warm, structured", { styles: ["red", "unknown"], styleHint: "red" }),
  P(["napa valley", "rutherford", "oakville", "stags leap district", "howell mountain", "spring mountain district", "mount veeder"], { oak: 1 }, "Napa reds are almost always barrel-aged", { styles: ["red"], conf: { oak: "medium" } }),
];
export function profileFor(f) {
  const places = [f.appellation, f.region].filter(Boolean);
  for (const p of PROFILES) {
    if (p.styles && !p.styles.includes(f.style)) continue;
    if (places.some((pl) => p.places.some((k) => hasPhrase(pl, k)))) return p;
  }
  return null;
}

// ---------------------------------------------------------------- label words
// Words in the wine's name or classification that say something definite. Checked first.
export const SWEETNESS_WORDS = [
  { words: ["extra dry", "extra sec"], value: 2.5, conf: "high", why: "Extra Dry is slightly sweeter than Brut" },
  { words: ["halbtrocken", "off dry", "demi sec", "semi secco", "abboccato"], value: 3, conf: "high", why: "label says off-dry to medium" },
  { words: ["brut nature", "zero dosage", "pas dose", "extra brut"], value: 1, conf: "high", why: "label says bone dry" },
  { words: ["brut"], value: 1.5, conf: "high", why: "Brut is dry, with a touch of sugar" },
  { words: ["kabinett"], value: 2.5, conf: "medium", why: "Kabinett Riesling is light and often slightly sweet" },
  { words: ["spatlese"], value: 3, conf: "medium", why: "Spätlese is usually medium sweet" },
  { words: ["auslese"], value: 4, conf: "medium", why: "Auslese is usually sweet" },
  { words: ["beerenauslese", "trockenbeerenauslese", "eiswein", "ice wine", "sauternes", "tokaji aszu", "late harvest", "vendange tardive", "doux", "dolce", "passito"], value: 5, conf: "high", why: "dessert-style label" },
  { words: ["pedro ximenez", "cream"], value: 5, conf: "high", why: "Pedro Ximénez and cream styles are very sweet" },
  { words: ["tawny", "ruby", "lbv", "late bottled vintage", "vintage port", "port"], value: 4, conf: "high", why: "Port is a sweet fortified wine" },
  { words: ["fino", "manzanilla"], value: 1, conf: "high", why: "Fino and Manzanilla Sherry are dry" },
  { words: ["moscato d asti"], value: 4, conf: "high", why: "Moscato d'Asti is lightly sweet" },
  { words: ["dry", "sec", "trocken"], value: 1, conf: "high", why: "label says dry" },
];
export const CO2_WORDS = [
  { words: ["frizzante", "petillant", "spritz", "vinho verde", "moscato d asti", "pet nat"], value: 1, conf: "medium", why: "label points to a light fizz" },
];
export const OAK_WORDS = [
  { words: ["unoaked", "no oak", "stainless steel", "stainless"], value: 0, conf: "high", why: "label says unoaked" },
  { words: ["barrique", "barrel aged", "barrel fermented", "oak aged", "oaked"], value: 1, conf: "high", why: "label mentions barrel or oak" },
  { words: ["gran reserva", "reserva", "riserva", "gran selezione", "crianza"], value: 1, conf: "high", why: "Reserva and Riserva wines are aged in oak by rule", countries: ["spain", "italy", "portugal"] },
  { words: ["gran reserva", "grand reserve", "reserve", "reserva", "riserva", "old vine reserve", "estate reserve"], value: 1, conf: "medium", why: "a Reserve wine is usually oak-aged" },
  { words: ["cru classe", "grand cru"], value: 1, conf: "medium", why: "classified Burgundy and Bordeaux wines are normally barrel-aged", countries: ["france"] },
];
// Fortified wines have their own profile.
export const FORTIFIED = [
  { words: ["tawny"], set: { acidity: 3, body: 4, tannin: 2, oak: 1 }, why: "Tawny Port: aged for years in cask, mellow, soft tannin" },
  { words: ["ruby", "lbv", "late bottled vintage", "vintage port"], set: { acidity: 3.5, body: 4.5, tannin: 4, oak: 0 }, why: "Ruby and vintage Port: young, fruity, firm tannin, little cask time" },
];

// ---------------------------------------------------------------- oak norms for wines without a definite label word
// First match wins. region lists are matched against the appellation, region and country.
export const OAK_NORMS = [
  { style: "red", places: ["napa valley", "sonoma", "paso robles", "dry creek valley", "russian river valley", "santa barbara county", "sta rita hills", "washington", "columbia valley", "walla walla", "willamette valley", "oregon", "california"], value: 1, conf: "medium", why: "quality US reds are usually barrel-aged" },
  { style: "red", places: ["barossa", "south australia", "australia", "chile", "mendoza", "argentina", "central otago", "stellenbosch", "south africa"], value: 1, conf: "medium", why: "quality New World reds are usually barrel-aged" },
  { style: "white", grapes: ["chardonnay"], places: ["california", "sonoma coast", "napa valley", "australia", "south africa", "oregon", "washington"], value: 1, conf: "low", why: "New World Chardonnay is often barrel-fermented, but unoaked styles exist" },
  { style: "white", grapes: ["chenin blanc"], places: ["stellenbosch", "western cape", "south africa"], value: 1, conf: "low", why: "South African Chenin is often barrel-fermented" },
  { style: "white", grapes: ["marsanne", "roussanne", "sémillon"], value: 1, conf: "low", why: "these grapes are often fermented or aged in barrel" },
];

// ---------------------------------------------------------------- style defaults (last resort)
export const STYLE_DEFAULTS = {
  red: { acidity: 3.5, body: 3.5, tannin: 3.5, sweetness: 1, oak: 1, co2: 0 },
  white: { acidity: 3.5, body: 3, sweetness: 1, oak: 0, co2: 0 },
  rose: { acidity: 3.5, body: 2, sweetness: 1.5, oak: 0, co2: 0 },
  sparkling: { acidity: 4, body: 2.5, sweetness: 1.5, oak: 0, co2: 2 },
  fortified: { acidity: 3, body: 4, tannin: 3, sweetness: 4, oak: 1, co2: 0 },
};

// How sure we are of a plain default. A red wine is almost always dry; a white or sparkling wine is less certain.
export const SWEETNESS_DEFAULT_CONF = { red: "high", white: "medium", rose: "medium", sparkling: "low", fortified: "low", other: "low" };

// ---------------------------------------------------------------- facts about one wine
const WHITE_WORDS = ["blanc", "white", "bianco", "weiss"];
export function factsOf(card) {
  const raw = (card && card.raw) || {};
  let labelGrapes = raw.label_grapes, ruleGrapes = raw.rule_grapes;
  if (!labelGrapes && !ruleGrapes) labelGrapes = String((card && card.grape) || "").split(/[-,]/).map((x) => x.trim()).filter(Boolean);
  const grapeNames = [...(labelGrapes || []), ...(ruleGrapes || [])];
  const grapes = [];
  for (const n of grapeNames) { const g = grapeFor(n); if (g && !grapes.some((x) => x.name === g.name)) grapes.push(g); }
  const name = [card && card.cuvee, raw.wine_name].filter(Boolean).join(" ");
  const classification = raw.classification || "";
  const appellation = norm((card && card.appellation) || raw.appellation || "");
  const region = norm((card && card.region) || raw.region || "");
  const country = norm((card && card.country) || raw.country || "");
  const text = norm(`${name} ${classification} ${(card && card.producer) || ""}`);
  let style = (card && card.style) || raw.style || "unknown";
  let styleGuess = null;
  if (style === "unknown") {
    const prof = profileFor({ appellation, region, style: "unknown" });
    const colors = grapes.map((g) => g.color);
    if (colors.length && colors.every((c) => c === colors[0])) styleGuess = colors[0];
    else if (prof && prof.styleHint) styleGuess = prof.styleHint;
    else if (anyPhrase(text, WHITE_WORDS)) styleGuess = "white";
  }
  return { grapes, grapeNames, text, name: norm(name), classification: norm(classification), appellation, region, country, style, styleGuess, effStyle: style === "unknown" ? (styleGuess || "red") : style };
}

// ---------------------------------------------------------------- the engine
const SCALE_DIMS = ["acidity", "body", "tannin", "sweetness"];
export const dimsForStyle = (style) => (["white", "sparkling", "rose"].includes(style) ? ["acidity", "body", "co2", "sweetness", "oak"] : ["acidity", "body", "tannin", "sweetness", "oak"]);

function weightedGrape(grapes, dim) {
  let sum = 0, w = 0;
  grapes.forEach((g, i) => { if (typeof g[dim] === "number") { const k = i === 0 ? 2 : 1; sum += g[dim] * k; w += k; } });
  return w ? sum / w : null;
}
const CONF_RANK = { low: 0, medium: 1, high: 2 };
const minConf = (a, b) => (CONF_RANK[a] <= CONF_RANK[b] ? a : b);
const labelHit = (f, rules) => rules.find((r) => anyPhrase(f.text, r.words) && (!r.countries || r.countries.includes(f.country)));

function solve(dim, f, ctx) {
  const prof = ctx.prof;
  // 1. label words
  if (dim === "sweetness") { const h = labelHit(f, SWEETNESS_WORDS); if (h) return { value: h.value, confidence: h.conf, why: [`${h.why}`], layer: "label" }; }
  if (dim === "co2" && f.effStyle === "sparkling") { const h = labelHit(f, CO2_WORDS); if (h) return { value: 1, confidence: "medium", why: [h.why], layer: "label" }; }
  if (dim === "co2" && f.effStyle !== "sparkling") { const h = labelHit(f, CO2_WORDS); if (h) return { value: 1, confidence: h.conf, why: [h.why], layer: "label" }; }
  if (dim === "oak") { const h = OAK_WORDS.find((r) => anyPhrase(f.text, r.words) && (!r.countries || r.countries.includes(f.country)) && (r.value === 0 || !(prof && typeof prof.set.oak === "number" && prof.set.oak === 0 && r.conf !== "high"))); if (h) return { value: h.value, confidence: h.conf, why: [h.why], layer: "label" }; }
  // fortified wines
  if (f.effStyle === "fortified") {
    const fh = FORTIFIED.find((r) => anyPhrase(f.text, r.words));
    if (fh && typeof fh.set[dim] === "number") return { value: fh.set[dim], confidence: "high", why: [fh.why], layer: "label" };
  }
  // 2. appellation
  if (prof && typeof prof.set[dim] === "number") return { value: prof.set[dim], confidence: prof.conf[dim] || "high", why: [prof.why], layer: "appellation" };
  // 3. dimension-specific norms and grape + climate
  if (dim === "co2") return f.effStyle === "sparkling" ? { value: 2, confidence: "high", why: ["sparkling wine"], layer: "style" } : { value: 0, confidence: f.style === "unknown" ? "low" : "high", why: ["still wine"], layer: "style" };
  if (dim === "oak") {
    const norm1 = OAK_NORMS.find((r) => r.style === f.effStyle && (!r.grapes || f.grapes.some((g) => r.grapes.includes(norm(g.name)) || r.grapes.includes(g.name.toLowerCase()))) && anyPhrase(`${f.appellation} ${f.region} ${f.country}`, r.places || [""]));
    if (norm1) return { value: norm1.value, confidence: norm1.conf, why: [norm1.why], layer: "region" };
  }
  if ((dim === "acidity" || dim === "body" || dim === "tannin") && f.grapes.length) {
    const g = f.grapes.filter((x) => typeof x[dim] === "number" || dim !== "tannin");
    const base = weightedGrape(g, dim);
    if (base !== null) {
      const shift = CLIMATE_SHIFT[ctx.climate.zone][dim] || 0;
      const names = f.grapes.map((x) => x.name).join(" and ");
      const why = [`${names}: typical ${dim} ${round5(base)}`];
      if (shift) why.push(`${ctx.climate.zone} climate${ctx.climate.place ? " (" + ctx.climate.place + ")" : ""} ${shift > 0 ? "+" : ""}${shift}`);
      let conf = f.grapes.length === 1 ? "medium" : f.grapes.length === 2 ? "medium" : "low";
      if (!ctx.climate.sure) conf = minConf(conf, "low");
      return { value: clamp(round5(base + shift), 1, 5), confidence: conf, why, layer: "grape" };
    }
  }
  // 4. style default, still shifted for climate
  const d = STYLE_DEFAULTS[f.effStyle] || STYLE_DEFAULTS.red;
  let v = typeof d[dim] === "number" ? d[dim] : 3;
  const why = [f.style === "unknown" ? (f.styleGuess ? `style unknown, guessed ${f.styleGuess}: typical ${f.styleGuess} wine` : "style unknown: typical red wine") : `a typical ${f.effStyle} wine`];
  const shift = (dim === "acidity" || dim === "body" || dim === "tannin") ? (CLIMATE_SHIFT[ctx.climate.zone][dim] || 0) : 0;
  if (shift) { v += shift; why.push(`${ctx.climate.zone} climate${ctx.climate.place ? " (" + ctx.climate.place + ")" : ""} ${shift > 0 ? "+" : ""}${shift}`); }
  return { value: v, confidence: SWEETNESS_DEFAULT_CONF[dim === "sweetness" ? f.effStyle : "other"] || "low", why, layer: "style" };
}

// Returns the suggestion for one wine card. The card carries the raw catalog row in card.raw when available.
export function suggestStructure(card) {
  const f = factsOf(card);
  const prof = profileFor({ appellation: f.appellation, region: f.region, style: f.effStyle });
  const climate = climateOf(f);
  const ctx = { prof, climate };
  const dims = {};
  for (const d of dimsForStyle(f.style)) {
    const r = solve(d, f, ctx);
    const v = d === "oak" ? (r.value >= 0.5 ? 1 : 0) : d === "co2" ? clamp(Math.round(r.value), 0, 2) : clamp(round5(r.value), 1, 5);
    dims[d] = { ...r, value: v };
  }
  const ranks = Object.values(dims).map((x) => CONF_RANK[x.confidence]);
  const avg = ranks.reduce((a, b) => a + b, 0) / ranks.length;
  const overall = avg >= 1.5 ? "high" : avg >= 0.75 ? "medium" : "low";
  return { style: f.style, styleGuess: f.styleGuess, dims, overall };
}
export const values = (s) => Object.fromEntries(Object.entries(s.dims).map(([k, v]) => [k, v.value]));
export const CONFIDENCE_LABEL = { high: "high", medium: "medium", low: "low" };

// ---------------------------------------------------------------- the gold set: 25 wines editors score blind
// group "tune": the rules may be adjusted using these. group "holdout": kept aside to check the result honestly.
// A wine is identified by producer, wine name and vintage year, so the list works in any copy of the catalog.
export const GOLD = [
  ["Château Giscours", "", 2022, "tune"], ["Williams Selyem", "Eastside Road Neighbors", 2023, "holdout"], ["Produttori del Barbaresco", "", 2021, "tune"],
  ["Castello di Ama", "San Lorenzo Gran Selezione", 2021, "tune"], ["Le Vieux Donjon", "", 2022, "holdout"], ["Viña Tarapacá", "Etiqueta Negra Gran Reserva", 2022, "tune"],
  ["La Granja Nuestra Señora de Remelluri", "Reserva", 2016, "holdout"], ["Lamadrid", "Single Vineyard Reserva", 2023, "tune"], ["Burn Cottage", "Moonlight Race", 2023, "holdout"],
  ["Caterwaul", "", 2023, "tune"], ["Damilano", "Cannubi", 2021, "holdout"], ["Hartford Family", "Old Vine", 2022, "tune"], ["Elderton", "", 2022, "tune"],
  ["Reynvaan", "In The Rocks", 2022, "holdout"], ["Bodegas Protos", "Carroa", 2021, "tune"],
  ["Rimapere", "Single Vineyard", 2024, "tune"], ["Patz & Hall", "", 2022, "holdout"], ["Diatom", "", 2024, "tune"], ["Dr. Loosen", "Kabinett Erdener Treppchen", 2023, "holdout"],
  ["Famille Lieubeau", "", 2022, "tune"], ["Claude Riffault", "Les Boucauds", 2023, "tune"], ["Ken Forrester", "Old Vine Reserve", 2024, "holdout"],
  ["Ployez-Jacquemart", "Brut Extra Quality", null, "tune"], ["Château d'Estoublon", "Roseblood Rosé", 2024, "holdout"], ["Graham", "Tawny Port 20 Year Old", null, "tune"],
].map(([producer, wineName, year, group]) => ({ producer, wineName, year, group, key: `${norm(producer)}|${norm(wineName)}|${year || "nv"}` }));
const GOLD_BY_KEY = new Map(GOLD.map((g) => [g.key, g]));
export function goldKeyOf(card) {
  const raw = (card && card.raw) || {};
  const producer = raw.producer || (card && card.producer) || "";
  const wineName = raw.wine_name != null ? raw.wine_name : (card && card.cuvee) || "";
  const year = raw.is_non_vintage ? null : raw.vintage_year != null ? raw.vintage_year : (card && /^\d{4}$/.test(card.vintage || "") ? Number(card.vintage) : null);
  return `${norm(producer)}|${norm(wineName)}|${year || "nv"}`;
}
export const goldInfo = (card) => GOLD_BY_KEY.get(goldKeyOf(card)) || null;
export const isGold = (card) => !!goldInfo(card);

// ---------------------------------------------------------------- testing the rules against what editors scored
export const TARGETS = { scale: { good: 0.6, ok: 0.8 }, choice: { good: 0.85, ok: 0.7 } };
// pairs: [{ editor: { dim: value }, rules: { dim: value } }]. Returns per-dimension results.
export function evaluateRules(pairs) {
  const keys = ["acidity", "body", "tannin", "co2", "sweetness", "oak"];
  const out = {};
  for (const k of keys) {
    const rows = pairs.filter((p) => typeof p.editor[k] === "number" && typeof p.rules[k] === "number");
    if (!rows.length) continue;
    const diffs = rows.map((p) => p.rules[k] - p.editor[k]);
    const abs = diffs.map(Math.abs);
    const n = rows.length;
    if (k === "oak" || k === "co2") {
      const right = abs.filter((a) => a === 0).length;
      const rate = right / n;
      out[k] = { kind: "choice", n, right, accuracy: rate, verdict: rate >= TARGETS.choice.good ? "good" : rate >= TARGETS.choice.ok ? "ok" : "needs work" };
    } else {
      const mae = abs.reduce((a, b) => a + b, 0) / n;
      out[k] = {
        kind: "scale", n, mae, bias: diffs.reduce((a, b) => a + b, 0) / n,
        within05: abs.filter((a) => a <= 0.5).length / n, within1: abs.filter((a) => a <= 1).length / n,
        verdict: mae <= TARGETS.scale.good ? "good" : mae <= TARGETS.scale.ok ? "ok" : "needs work",
      };
    }
  }
  return out;
}
// A plain-text report editors can copy and paste to share.
export function reportText(results, rows) {
  const lines = [`Structure rules ${RULES_VERSION}: test on ${rows.length} scored wines`];
  for (const g of ["tune", "holdout"]) {
    const sub = rows.filter((r) => r.group === g);
    if (!sub.length) continue;
    lines.push("", `${g === "tune" ? "Tuning group" : "Held-back group"} (${sub.length} wines)`);
    const res = evaluateRules(sub);
    for (const [k, r] of Object.entries(res)) {
      lines.push(r.kind === "scale"
        ? `  ${k}: average error ${r.mae.toFixed(2)}, bias ${r.bias >= 0 ? "+" : ""}${r.bias.toFixed(2)}, within 0.5: ${Math.round(r.within05 * 100)}%, ${r.verdict}`
        : `  ${k}: ${r.right} of ${r.n} exactly right (${Math.round(r.accuracy * 100)}%), ${r.verdict}`);
    }
  }
  lines.push("", "Wine by wine (editor / rules)");
  for (const r of rows) lines.push(`  [${r.group}] ${r.name}: ` + Object.keys(r.rules).map((k) => `${k} ${r.editor[k] ?? "-"}/${r.rules[k]}`).join(", "));
  return lines.join("\n");
}

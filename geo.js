// Country, region and appellation as three separate fields in Edit wine info.
// The database keeps places as a tree (country, then region, then appellation) and a wine points at the most specific one it has.
// The rules at the top are pure (no browser, no network). savePlace at the bottom creates any missing places.
import { caseKey, plainKey, matchKey } from "./text.js?v=2";
const fold = caseKey;   // text.js: accents and capitals ignored, punctuation still counts
const byName = (a, b) => fold(a).localeCompare(fold(b));

// areas: [{ id, name, level: 'country' | 'region' | 'appellation', parent_id, classification }]
export const countriesOf = (areas) => areas.filter((a) => a.level === "country").map((a) => a.name).sort(byName);
const findCountry = (areas, name) => areas.find((a) => a.level === "country" && fold(a.name) === fold(name)) || null;
const childrenOf = (areas, parent, level) => (parent ? areas.filter((a) => a.parent_id === parent.id && a.level === level) : []);
export const regionsOf = (areas, countryName) => childrenOf(areas, findCountry(areas, countryName), "region").map((a) => a.name).sort(byName);
// Appellations under the region; with no region, under the country.
export function appellationsOf(areas, countryName, regionName) {
  const country = findCountry(areas, countryName);
  if (!country) return [];
  const region = String(regionName || "").trim() ? childrenOf(areas, country, "region").find((a) => fold(a.name) === fold(regionName)) : null;
  if (String(regionName || "").trim() && !region) return [];
  return childrenOf(areas, region || country, "appellation").map((a) => a.name).sort(byName);
}

// The three fields for a wine's place id: walk up the tree.
export function placeFromArea(areas, id) {
  const out = { country: "", region: "", appellation: "" };
  const byId = new Map(areas.map((a) => [a.id, a]));
  for (let a = byId.get(id), n = 0; a && n < 6; a = byId.get(a.parent_id), n++) {
    if (a.level === "country") out.country = a.name;
    else if (a.level === "region") out.region = a.name;
    else if (a.level === "appellation") out.appellation = out.appellation || a.name;
  }
  return out;
}

// ---------------------------------------------------------------- what may be a place (owner, 2026-10-15; every version)
// Germany and Austria: the village and the vineyard are part of the wine's classification ("Wehlener Sonnenuhr", "Ried Heiligenstein 1ÖTW") and stay in
// the wine's name; the place is only the broad wine region. This is the fixed list of places a German or Austrian wine may point at (Germany: the 13
// wine regions; Austria: the four regions and the wine areas and DACs in them). Places already in the database are never changed by it.
export const BROAD_PLACES = {
  germany: ["Ahr", "Baden", "Franken", "Hessische Bergstraße", "Mittelrhein", "Mosel", "Nahe", "Pfalz", "Rheingau", "Rheinhessen", "Saale-Unstrut", "Sachsen", "Württemberg"],
  austria: ["Niederösterreich", "Burgenland", "Steiermark", "Wien", "Wachau", "Kremstal", "Kamptal", "Traisental", "Wagram", "Weinviertel", "Carnuntum", "Thermenregion",
    "Neusiedlersee", "Leithaberg", "Rosalia", "Mittelburgenland", "Eisenberg", "Vulkanland Steiermark", "Südsteiermark", "Weststeiermark", "Wiener Gemischter Satz", "Ruster Ausbruch"],
};
const key = plainKey;
// The lists in use: the ones above, or the reference lists read from the database (docs/reference_lists.sql) through setPlaceLists.
let BROAD = BROAD_PLACES;
const broadList = (country) => BROAD[key(country)] || null;
const isBroad = (country, name) => { const l = broadList(country); return !l || l.some((x) => key(x) === key(name)); };
// A German or Austrian place cut down to what is on the list (a village or vineyard is dropped: it stays in the wine name). Other countries unchanged.
export function broadPlace(place) {
  const p = { country: String(place.country || ""), region: String(place.region || ""), appellation: String(place.appellation || "") };
  if (!broadList(p.country)) return p;
  if (p.region && !isBroad(p.country, p.region)) p.region = "";
  if (p.appellation && !isBroad(p.country, p.appellation)) p.appellation = "";
  if (!p.region && p.appellation) { p.region = p.appellation; p.appellation = ""; }   // one broad name is the region
  return p;
}
// Classification words never belong in a place name: they say something about one wine or one vineyard ("Erste Lage", "Grand Cru", "Kabinett").
const RANKS = ["grand cru", "grands crus", "premier cru", "1er cru", "erste lage", "grosse lage", "grosses gewachs", "gg", "otw", "1otw", "vdp",
  "kabinett", "spatlese", "auslese", "beerenauslese", "trockenbeerenauslese", "eiswein", "ausbruch", "smaragd", "federspiel", "steinfeder",
  "riserva", "reserva", "gran reserva", "crianza", "cru classe", "grand cru classe"];
// A designation written at the end of a place name is moved out of it ("Kamptal DAC" -> Kamptal, DAC); the screen offers it under Designation.
export function splitDesignation(name) {
  const t = String(name || "").trim(), d = designationFromText(t);
  if (!d) return { name: t, designation: "" };
  const words = t.split(/\s+/);
  const last = words.length > 1 && designationFromText(words[words.length - 1]) ? words.slice(0, -1).join(" ") : null;
  return last != null ? { name: last, designation: d } : { name: t, designation: d, inside: true };
}
// Why a NEW place's name cannot be used, or "" when it can. country: the place's country (for the broad-place rule).
export function placeNameProblem(name, country = "", level = "") {
  const n = String(name || "").trim();
  if (!n) return "";
  const sp = splitDesignation(n);
  if (sp.inside) return `${sp.designation} is a designation, not part of a place's name: leave it out and pick it under Designation.`;
  const k = ` ${key(sp.name)} `, rank = RANKS.find((r) => k.includes(` ${r} `));
  if (rank && !(broadList(country) && isBroad(country, sp.name))) return `"${sp.name}" holds a classification (${rank}): that stays in the wine name, not in the place.`;
  if (level && level !== "country" && !isBroad(country, sp.name)) return `For ${key(country) === "austria" ? "Austrian" : "German"} wines choose the wine region (for example ${key(country) === "austria" ? "Kamptal or Wachau" : "Mosel or Rheingau"}): the village and vineyard stay in the wine name.`;
  return "";
}

// What saving these three fields would do. { error } when the fields do not make sense, otherwise { areaId, creates, notes }:
//   areaId   the existing place the wine will point at (null when it points at one that will be created)
//   creates  the places that do not exist yet, in the order to create them: { name, level, parent: <existing id> | <index in creates> | null }
//   notes    plain sentences for the screen ("A new region will be created in Italy.")
// A designation at the end of a typed name is left out of the place (splitDesignation); a new place's name must pass placeNameProblem.
export function planPlace(areas, { country = "", region = "", appellation = "" } = {}) {
  const c = String(country).trim(), r = splitDesignation(region).name, ap = splitDesignation(appellation).name;
  if (!c && !r && !ap) return { areaId: null, creates: [], notes: [], classification: "" };
  if (!c) return { error: "Choose the country first." };
  const creates = [], notes = [];
  const countryArea = findCountry(areas, c);
  let parent = null, parentName = c;   // parent: an existing place id, or { index } of a place that will be created
  if (countryArea) parent = countryArea.id;
  else { creates.push({ name: c, level: "country", parent: null }); parent = { index: 0 }; notes.push(`A new country will be created: ${c}.`); }
  let problem = "";
  const add = (name, level) => {
    // A broad region filed as an appellation straight under the country (Mosel in Germany) is the same place as the region of that name.
    const existing = typeof parent === "string" ? areas.find((a) => a.parent_id === parent && (a.level === level || (level === "region" && a.level === "appellation")) && fold(a.name) === fold(name)) : null;
    if (existing) { parent = existing.id; parentName = existing.name; return existing; }
    problem = problem || placeNameProblem(name, c, level);
    creates.push({ name, level, parent });
    parent = { index: creates.length - 1 };
    notes.push(`A new ${level} will be created in ${parentName}.`);
    parentName = name;
    return null;
  };
  const regionArea = r ? add(r, "region") : null;
  const appArea = ap ? add(ap, "appellation") : null;
  if (problem) return { error: problem };
  const areaId = typeof parent === "string" ? parent : null;   // the existing place the wine will point at
  return { areaId, creates, notes, classification: (appArea && appArea.classification) || "" };
}

// Notes for the screen while typing (nothing is saved).
export function placeNotes(areas, place) {
  const p = planPlace(areas, place);
  return p.error ? [] : p.notes;
}
export function placeClassification(areas, place) {
  const p = planPlace(areas, place);
  return p.error ? "" : p.classification;
}

// ---------------------------------------------------------------- designation (DOC, DOCG, AOC ...), kept on the place (owner, 2026-10-15)
// A designation belongs to a place, not to one wine: Barolo is DOCG for every Barolo. It is stored in geo_areas.classification of the place a wine
// points at (an appellation, or a region such as Rioja), and the wine card shows it next to the place (logic.js cardFromRow).
// The choices offered follow the place's country; any other country gets the general set.
export const DESIGNATIONS = {
  france: ["AOC", "AOP", "IGP", "Vin de France"],
  italy: ["DOCG", "DOC", "IGT", "Vino d'Italia"],
  spain: ["DOCa", "DOQ", "DO", "VP", "IGP"],
  portugal: ["DOC", "IPR", "Vinho Regional"],
  germany: [],   // Germany has no place designation: its quality words (Kabinett, Grosse Lage ...) belong to one wine and stay in its name
  austria: ["DAC"],   // Kamptal DAC; Erste Lage and 1ÖTW belong to one vineyard and stay in the wine name
  usa: ["AVA"],
  "united states": ["AVA"],
  greece: ["PDO", "PGI"],
  chile: ["DO"],
  canada: ["VQA"],
  "south africa": ["WO"],
  australia: ["GI"],
  "new zealand": ["GI"],
};
const GENERAL = ["PDO", "PGI", "AVA", "GI", "WO", "DO"];

// ---------------------------------------------------------------- known designations: the stored rule (owner, 2026-10-15; every version)
// A place on this list gets its designation filled in automatically (Leithaberg -> DAC, Barolo -> DOCG, Napa Valley -> AVA): the rule
// "appellation -> classification" the product rules allow. Prepared 2026-10-15 for the places in our place list and in Vintage Wine Merchants' list;
// AN EDITOR MUST CHECK IT before testers rely on it (docs/TEST_BEFORE_TESTERS.md). Only names whose designation is the same for every wine there are
// listed: a place where it depends on the wine (Montefalco: Rosso DOC, Sagrantino DOCG; Valtellina; Verdicchio) is left out, so nothing is guessed.
// A place's own designation in the database always wins over this list. docs/geo_designations_fill.sql fills existing empty places from the same list.
// Add a place by adding its name (as spelled in the place list) under its country and designation.
export const KNOWN_DESIGNATIONS = {
  austria: {
    DAC: ["Kamptal", "Kremstal", "Wachau", "Traisental", "Weinviertel", "Carnuntum", "Leithaberg", "Neusiedlersee", "Rosalia", "Mittelburgenland", "Eisenberg",
      "Ruster Ausbruch", "Vulkanland Steiermark", "Südsteiermark", "Weststeiermark", "Wiener Gemischter Satz"],
  },
  france: {
    AOC: [
      // regions used for the generic wine of the same name
      "Alsace", "Beaujolais", "Bordeaux", "Champagne",
      // Bordeaux
      "Bordeaux Supérieur", "Côtes de Bordeaux", "Francs Côtes de Bordeaux", "Fronsac", "Haut-Médoc", "Margaux", "Pauillac", "Pessac-Léognan", "Pomerol",
      "Saint-Estèphe", "St.-Julien", "Saint-Julien", "St.-Émilion", "Saint-Émilion", "Sauternes",
      // Burgundy and Beaujolais
      "Bourgogne", "Bourgogne Aligoté", "Bourgogne Côte d'Or", "Bourgogne Hautes-Côtes de Beaune", "Bourgogne Hautes-Côtes de Nuits", "Bourgogne Passe-Tout-Grains",
      "Coteaux Bourguignons", "Crémant de Bourgogne", "Auxey-Duresses", "Beaune", "Bienvenues-Bâtard-Montrachet", "Blagny", "Bonnes-Mares", "Bouzeron",
      "Bâtard-Montrachet", "Chablis", "Petit Chablis", "Chambertin", "Chambertin-Clos de Bèze", "Chambolle-Musigny", "Chapelle-Chambertin", "Charmes-Chambertin",
      "Chassagne-Montrachet", "Chevalier-Montrachet", "Clos Saint-Denis", "Clos de Vougeot", "Clos de la Roche", "Clos des Lambrays", "Corton", "Corton-Charlemagne",
      "Criots-Bâtard-Montrachet", "Côte de Nuits-Villages", "Fixin", "Gevrey-Chambertin", "Grands-Échezeaux", "Échezeaux", "Griotte-Chambertin", "Irancy",
      "Latricières-Chambertin", "Marsannay", "Mazis-Chambertin", "Mazoyères-Chambertin", "Mercurey", "Meursault", "Monthélie", "Montrachet", "Morey-Saint-Denis",
      "Musigny", "Mâcon", "Nuits-Saint-Georges", "Pommard", "Pouilly-Fuissé", "Puligny-Montrachet", "Richebourg", "Romanée-Saint-Vivant", "Rully", "Saint-Aubin",
      "Saint-Romain", "Santenay", "Savigny-lès-Beaune", "Viré-Clessé", "Volnay", "Vosne-Romanée", "Vougeot",
      "Beaujolais-Villages", "Brouilly", "Chiroubles", "Chénas", "Fleurie", "Morgon", "Moulin-à-Vent", "Régnié", "Saint-Amour",
      // Rhône
      "Châteauneuf-du-Pape", "Condrieu", "Cornas", "Crozes-Hermitage", "Côte-Rôtie", "Côtes du Rhône", "Côtes du Rhône Villages", "Gigondas", "Hermitage",
      "St.-Joseph", "Saint-Joseph", "Vacqueyras",
      // Loire
      "Chinon", "Muscadet de Sèvre et Maine Clisson", "Pouilly-Fumé", "Sancerre", "Saumur", "Saumur-Champigny", "Savennières", "Touraine", "Vouvray", "Coteaux du Giennois",
      // elsewhere
      "Crémant d'Alsace", "Coteaux Champenois", "Rosé des Riceys", "Bandol", "Cassis", "Côtes de Provence", "Coteaux Varois en Provence", "Arbois", "Côtes du Jura",
      "Bugey", "Cahors", "Bergerac", "Jurançon", "Languedoc", "Limoux", "Vin de Corse"],
    IGP: ["Alpilles", "Collines Rhodaniennes", "Pays d'Hérault", "Vaucluse"],
  },
  italy: {
    DOCG: ["Alta Langa", "Amarone della Valpolicella", "Asti", "Barbaresco", "Barolo", "Brunello di Montalcino", "Chianti Classico", "Chianti Rufina",
      "Conegliano Valdobbiadene Prosecco Superiore", "Fiano di Avellino", "Gattinara", "Gavi", "Greco di Tufo", "Moscato d'Asti", "Roero", "Taurasi",
      "Vernaccia di San Gimignano"],
    DOC: ["Alto Adige", "Barbera d'Alba", "Barbera del Monferrato", "Bolgheri", "Bolgheri Sassicaia", "Carema", "Carso", "Colli di Luni", "Collio", "Costa d'Amalfi",
      "Delle Venezie", "Dolcetto d'Alba", "Eloro", "Etna", "Friuli Colli Orientali", "Irpinia", "Langhe", "Maremma Toscana", "Marsala", "Montepulciano d'Abruzzo",
      "Nebbiolo d'Alba", "Oltrepò Pavese", "Prosecco", "Rosso Piceno", "Rosso di Montalcino", "Soave", "Trentino", "Valdadige", "Valle d'Aosta", "Valpolicella",
      "Valpolicella Ripasso", "Vin Santo del Chianti Classico"],
    IGT: ["Colli della Toscana Centrale", "Colli di Salerno", "Colline Pescaresi", "Emilia", "Lazio", "Rosso del Veronese", "Salento", "Salina", "Terre Siciliane",
      "Toscana", "Venezia Giulia", "Vigneti delle Dolomiti"],
  },
  spain: {
    DOCa: ["Rioja", "Priorat"],
    DO: ["Bierzo", "Calatayud", "Campo de Borja", "Cava", "Jumilla", "Montsant", "Ribeira Sacra", "Ribera del Duero", "Rías Baixas", "Terra Alta", "Vinos de Madrid",
      "Vinos de Madrid Sierra de Gredos"],
  },
  portugal: { DOC: ["Douro", "Madeira", "Port", "Porto", "Vinho Verde"] },
  usa: {
    AVA: ["Alexander Valley", "Anderson Valley", "Bennett Valley", "Carneros", "Central Coast", "Chehalem Mountains", "Clarksburg", "Columbia Valley", "Coombsville",
      "Diamond Mountain District", "Dry Creek Valley", "Dundee Hills", "Eagle Peak", "El Dorado", "Eola-Amity Hills", "Finger Lakes", "Fort Ross-Seaview",
      "Howell Mountain", "Knights Valley", "Mendocino", "Monterey", "Mount Veeder", "Napa Valley", "North Coast", "Oakville", "Paso Robles",
      "Paso Robles Willow Creek District", "Ribbon Ridge", "Rogue Valley", "Russian River Valley", "Rutherford", "Santa Cruz Mountains", "Santa Lucia Highlands",
      "Santa Maria Valley", "Santa Ynez Valley", "Sonoma Coast", "Sonoma Valley", "Spring Mountain District", "Sta. Rita Hills", "Stags Leap District",
      "Suisun Valley", "Walla Walla Valley", "West Sonoma Coast", "Willamette Valley", "Yamhill-Carlton"],
  },
  chile: { DO: ["Maipo Valley", "Colchagua Valley", "Central Valley"] },
  canada: { VQA: ["Niagara Peninsula"] },
  "south africa": { WO: ["Constantia", "Stellenbosch"] },
  australia: { GI: ["Barossa", "Barossa Valley", "South Eastern Australia"] },
  "new zealand": { GI: ["Marlborough", "Central Otago", "Hawke's Bay"] },
  greece: { PDO: ["Archanes"] },
};
KNOWN_DESIGNATIONS["united states"] = KNOWN_DESIGNATIONS.usa;
// The designation the rule list gives a place: its most specific part that is listed (the appellation, else the region). null when none is.
let KNOWN = KNOWN_DESIGNATIONS;
// Replaces the built-in lists with the database's (only rows in use). broad: { country: [names] }; designations: { country: { designation: [names] } }.
// An empty or missing list keeps the built-in one, so the app works before the update is run and offline.
export function setPlaceLists({ broad, designations } = {}) {
  if (broad && Object.keys(broad).length) BROAD = broad;
  if (designations && Object.keys(designations).length) { KNOWN = designations; if (KNOWN.usa && !KNOWN["united states"]) KNOWN["united states"] = KNOWN.usa; }
}
export function ruleDesignation(place) {
  const list = KNOWN[fold((place && place.country) || "")];
  if (!list) return null;
  for (const name of [place.appellation, place.region].map((x) => splitDesignation(x).name).filter(Boolean)) {
    for (const [d, names] of Object.entries(list)) if (names.some((n) => key(n) === key(name))) return { designation: d, name };
    return null;   // the most specific part decides: a region's designation never stands in for an unlisted appellation inside it
  }
  return null;
}
export const designationChoices = (country) => DESIGNATIONS[fold(country)] || GENERAL;
// Every term any country uses, longest first, for reading one out of a title or name.
const ALL_TERMS = [...new Set([...Object.values(DESIGNATIONS).flat(), ...GENERAL, "AC", "DOP", "QbA"])].sort((a, b) => b.length - a.length);
const SAME = { ac: "AOC", dop: "DOP", qba: "Qualitätswein" };
// The designation written as a whole word in a title or name ("Barolo Cerequio DOCG" -> "DOCG"); "" when there is none.
// Short terms count only in capitals as printed ("DO", not "do"), so ordinary words are never read as one.
export function designationFromText(text) {
  const t = String(text || "");
  for (const term of ALL_TERMS) {
    const esc = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+");
    const re = term.length <= 3 ? new RegExp(`(^|[^\\p{L}\\d])${esc}(?=$|[^\\p{L}\\d])`, "u") : new RegExp(`(^|[^\\p{L}\\d])${esc}(?=$|[^\\p{L}\\d])`, "iu");
    if (re.test(t)) return SAME[fold(term)] || term;
  }
  return "";
}
// The place a wine will point at, once saving has created what is missing: the existing area, or null for one still to be made.
const targetArea = (areas, place) => { const p = planPlace(areas, place); return p.error || p.creates.length ? null : (areas.find((a) => a.id === p.areaId) || null); };
// What saving a designation would do for this place:
//   { existing }       the place already has this designation (or has one and none was picked): nothing to write
//   { set }            write it (on a place still to be created, or one with none yet)
//   { conflict }       the place already has a DIFFERENT one: nothing is written; a place's designation is changed for every wine, never from one wine's form
//   {}                 no place, or nothing picked
export function designationPlan(areas, place, chosen) {
  const a = targetArea(areas, place), have = (a && a.classification) || "";
  const want = designationChoices(place.country).length ? String(chosen || "").trim() : "";   // a country with no place designations (Germany) never gets one
  if (!a && planPlace(areas, place).error) return {};
  if (!a && !String(place.country || place.region || place.appellation || "").trim()) return {};
  if (have && (!want || fold(have) === fold(want))) return { existing: have };
  if (have) return { conflict: have };
  return want ? { set: want } : {};
}
// The designation a place already has ("" for none or a place still to be created).
export const placeDesignation = (areas, place) => { const a = targetArea(areas, place); return (a && a.classification) || ""; };

// Creates what is missing (a place an editor adds is verified straight away, so players see it) and returns the id the wine should point at.
// opts.classification: the designation to write on the most specific place created (savePlaceDesignation in data.js fills an existing place).
export async function savePlace(sb, areas, place, opts = {}) {
  const plan = planPlace(areas, place);
  if (plan.error) throw new Error(plan.error);
  if (!plan.creates.length) return plan.areaId;
  const made = [];
  for (const [i, c] of plan.creates.entries()) {
    const parent_id = c.parent == null ? null : typeof c.parent === "string" ? c.parent : made[c.parent.index];
    const row = { name: c.name, level: c.level, parent_id, status: "verified" };
    if (opts.classification && i === plan.creates.length - 1 && c.level !== "country") row.classification = opts.classification;
    const { data, error } = await sb.from("geo_areas").insert(row).select("id").single();
    if (error) throw new Error(`Could not add the ${c.level} ${c.name}: ${error.message || error}`);
    made.push(data.id);
  }
  return made[made.length - 1];
}

// ---------------------------------------------------------------- checks on the place list: suggestions the OWNER applies one by one (owner, 2026-10-15)
// Nothing here changes a place. Each finding carries a suggestion and where it comes from; the owner taps Apply (data.js applyPlaceFix) or Dismiss.
// Names that the law requires as written are listed with their source so they are never suggested for change.
export const LEGAL_NAMES = [
  { country: "USA", name: "Sta. Rita Hills", why: "Official AVA name since 2006: TTB changed \"Santa Rita Hills\" to \"Sta. Rita Hills\" (TTB-37, 70 FR 72710).", source: "https://origin.winespectator.com/articles/santa-rita-hills-appellation-changes-its-name-to-settle-conflict-2859" },
  { country: "USA", name: "American", why: "\"American\" is a legal appellation of origin for wine from the United States (27 CFR 4.25).", source: "https://www.law.cornell.edu/cfr/text/27/4.25" },
];
// Official spellings that differ from what may be stored. confirmed: true only when a source was checked (2026-10-15).
export const OFFICIAL_SPELLINGS = [
  { country: "France", from: "St.-Julien", to: "Saint-Julien", confirmed: true, why: "INAO names the appellation \"Saint-Julien\" (decree of 14 November 1936).", source: "https://www.inao.gouv.fr/node/1782/printable/pdf" },
  { country: "France", from: "St.-Joseph", to: "Saint-Joseph", confirmed: false, why: "Probably written out in full like Saint-Julien; check the name on the INAO site before applying.", source: "https://www.inao.gouv.fr/" },
  { country: "France", from: "St.-Émilion", to: "Saint-Émilion", confirmed: false, why: "Probably written out in full like Saint-Julien; check the name on the INAO site before applying.", source: "https://www.inao.gouv.fr/" },
];
// Places filed as appellations straight under their country that are broad wine regions.
export const REGION_LEVEL = [
  { country: "Germany", name: "Mosel", confirmed: true, why: "Mosel is one of Germany's 13 wine regions (Anbaugebiete).", source: "https://en.wikipedia.org/wiki/List_of_German_wine_regions" },
];
const legalName = (country, name) => LEGAL_NAMES.find((l) => caseKey(l.country) === caseKey(country) && caseKey(l.name) === caseKey(name));
// areas: the place list; wineAreaIds: ids of places that wines point at (to find unused ones; optional).
// Returns [{ id, areaId, kind, title, suggestion, why, source, confirmed, fix: { name?, level? } | null }].
export function placeChecks(areas, wineAreaIds = null) {
  const byId = new Map((areas || []).map((a) => [a.id, a])), out = [];
  const countryOf = (a) => { for (let x = a, n = 0; x && n < 6; x = byId.get(x.parent_id), n++) if (x.level === "country") return x.name; return ""; };
  for (const a of areas || []) {
    const country = countryOf(a), parent = byId.get(a.parent_id);
    if (a.level === "country" || legalName(country, a.name)) continue;
    const sp = OFFICIAL_SPELLINGS.find((o) => caseKey(o.country) === caseKey(country) && caseKey(o.from) === caseKey(a.name));
    if (sp) out.push({ id: `spell:${a.id}`, areaId: a.id, kind: "spelling", title: `${a.name} (${country})`, suggestion: `Rename to ${sp.to}`, why: sp.why, source: sp.source, confirmed: sp.confirmed, fix: { name: sp.to } });
    const rl = REGION_LEVEL.find((r) => caseKey(r.country) === caseKey(country) && caseKey(r.name) === caseKey(a.name));
    if (rl && a.level !== "region") out.push({ id: `level:${a.id}`, areaId: a.id, kind: "level", title: `${a.name} (${country})`, suggestion: "File it as a region", why: rl.why, source: rl.source, confirmed: rl.confirmed, fix: { level: "region" } });
    else if (!rl && a.level === "appellation" && parent && parent.level === "country") out.push({ id: `under:${a.id}`, areaId: a.id, kind: "level", title: `${a.name} (${country})`, suggestion: "Level to confirm: an appellation filed straight under its country", why: "No source checked yet. It may be right (an appellation with no region in our tree) or it may be a region.", source: "", confirmed: false, fix: null });
    const problem = placeNameProblem(a.name, "", "");
    if (problem && !(broadList(country) && isBroad(country, a.name))) out.push({ id: `word:${a.id}`, areaId: a.id, kind: "word", title: `${a.name} (${country})`, suggestion: "Take the classification word out of the name", why: problem, source: "", confirmed: false, fix: null });
    if (wineAreaIds && !wineAreaIds.has(a.id) && !(areas || []).some((c) => c.parent_id === a.id)) out.push({ id: `unused:${a.id}`, areaId: a.id, kind: "unused", title: `${a.name} (${country})`, suggestion: "No wine points at this place", why: "It can stay; it is listed only so you know.", source: "", confirmed: true, fix: null });
  }
  // names that look alike under the same parent ("Saint-Julien" and "St.-Julien")
  const groups = new Map();
  (areas || []).forEach((a) => { const k = `${a.parent_id}|${a.level}|${matchKey(a.name)}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(a); });
  for (const g of groups.values()) if (g.length > 1) out.push({ id: `same:${g.map((a) => a.id).join(",")}`, areaId: g[0].id, kind: "lookalike", title: g.map((a) => a.name).join(" / "), suggestion: "Two places that look like the same place", why: "Decide which spelling to keep; wines pointing at the other one need moving by hand.", source: "", confirmed: false, fix: null });
  return out;
}

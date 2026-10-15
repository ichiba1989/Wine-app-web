// Country, region and appellation as three separate fields in Edit wine info.
// The database keeps places as a tree (country, then region, then appellation) and a wine points at the most specific one it has.
// The rules at the top are pure (no browser, no network). savePlace at the bottom creates any missing places.
const fold = (s) => String(s == null ? "" : s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
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
const key = (s) => fold(s).replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, " ").trim();
const broadList = (country) => BROAD_PLACES[key(country)] || null;
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
};
const GENERAL = ["PDO", "PGI", "AVA", "GI", "WO", "DO"];
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

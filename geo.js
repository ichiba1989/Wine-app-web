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

// What saving these three fields would do. { error } when the fields do not make sense, otherwise { areaId, creates, notes }:
//   areaId   the existing place the wine will point at (null when it points at one that will be created)
//   creates  the places that do not exist yet, in the order to create them: { name, level, parent: <existing id> | <index in creates> | null }
//   notes    plain sentences for the screen ("A new region will be created in Italy.")
export function planPlace(areas, { country = "", region = "", appellation = "" } = {}) {
  const c = String(country).trim(), r = String(region).trim(), ap = String(appellation).trim();
  if (!c && !r && !ap) return { areaId: null, creates: [], notes: [], classification: "" };
  if (!c) return { error: "Choose the country first." };
  const creates = [], notes = [];
  const countryArea = findCountry(areas, c);
  let parent = null, parentName = c;   // parent: an existing place id, or { index } of a place that will be created
  if (countryArea) parent = countryArea.id;
  else { creates.push({ name: c, level: "country", parent: null }); parent = { index: 0 }; notes.push(`A new country will be created: ${c}.`); }
  const add = (name, level) => {
    const existing = typeof parent === "string" ? areas.find((a) => a.parent_id === parent && a.level === level && fold(a.name) === fold(name)) : null;
    if (existing) { parent = existing.id; parentName = existing.name; return existing; }
    creates.push({ name, level, parent });
    parent = { index: creates.length - 1 };
    notes.push(`A new ${level} will be created in ${parentName}.`);
    parentName = name;
    return null;
  };
  const regionArea = r ? add(r, "region") : null;
  const appArea = ap ? add(ap, "appellation") : null;
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
  germany: ["Prädikatswein", "Qualitätswein", "Landwein"],
  austria: ["DAC", "Qualitätswein", "Landwein"],
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
  const a = targetArea(areas, place), want = String(chosen || "").trim(), have = (a && a.classification) || "";
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

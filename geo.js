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

// Creates what is missing (a place an editor adds is verified straight away, so players see it) and returns the id the wine should point at.
export async function savePlace(sb, areas, place) {
  const plan = planPlace(areas, place);
  if (plan.error) throw new Error(plan.error);
  if (!plan.creates.length) return plan.areaId;
  const made = [];
  for (const c of plan.creates) {
    const parent_id = c.parent == null ? null : typeof c.parent === "string" ? c.parent : made[c.parent.index];
    const { data, error } = await sb.from("geo_areas").insert({ name: c.name, level: c.level, parent_id, status: "verified" }).select("id").single();
    if (error) throw new Error(`Could not add the ${c.level} ${c.name}: ${error.message || error}`);
    made.push(data.id);
  }
  return made[made.length - 1];
}

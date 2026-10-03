// Small helpers for the grape and place inputs. Pure: no browser, no network.
//   * Blends: "GSM" is accepted as a varietal and means Grenache, Syrah and Mourvèdre. It is turned into those three grapes before
//     anything is checked or saved, so the structure rules, the catalog and the journal all see real grapes.
//   * Main varietal and other varietals (if blended): the forms show two inputs, while a typed-in wine still stores one text,
//     "main, other, other", so nothing changes in the database.
//   * Country and region: the forms show two inputs, while a typed-in wine still stores one place text, "region, country".
import { splitGrapeText, resolveGrape, fold } from "./grapes.js?v=1";

// Names the grape fields accept in addition to the grape list. Pass these to setExtraGrapes.
export const BLENDS = { gsm: { name: "GSM", grapes: ["Grenache", "Syrah", "Mourvèdre"] } };
export const BLEND_NAMES = Object.values(BLENDS).map((b) => b.name);

// "Grenache, GSM" -> "Grenache, Syrah, Mourvèdre". Other text is left as it was typed (it is checked later), and nothing repeats.
export function expandBlends(text) {
  const out = [];
  const add = (n) => { if (!out.some((x) => fold(x) === fold(n))) out.push(n); };
  splitGrapeText(text).forEach((part) => {
    const blend = BLENDS[fold(part)];
    if (blend) blend.grapes.forEach((g) => add(resolveGrape(g) || g));
    else add(part);
  });
  return out.join(", ");
}

// ---------------------------------------------------------------- main and other varietals
// The first grape is the main varietal; any others are the other varietals.
export function splitGrapeParts(text) {
  const names = splitGrapeText(text);
  return { main: names[0] || "", other: names.slice(1).join(", ") };
}
export function joinGrapeParts(main, other) {
  return [...splitGrapeText(main), ...splitGrapeText(other)].join(", ");
}

// ---------------------------------------------------------------- country and region
export const COUNTRIES = ["USA", "France", "Italy", "Spain", "Germany", "Portugal", "Austria", "Australia", "New Zealand", "Chile", "Argentina", "South Africa",
  "Canada", "Greece", "Hungary", "Switzerland", "Slovenia", "Croatia", "Romania", "Bulgaria", "Georgia", "Lebanon", "Israel", "Turkey", "Uruguay", "Brazil", "Mexico",
  "Peru", "Bolivia", "China", "Japan", "India", "England", "United Kingdom", "Moldova", "Armenia", "Luxembourg", "Cyprus", "Morocco", "Czech Republic", "Slovakia", "Serbia", "North Macedonia", "United States", "US", "United States of America"];
const COUNTRY_KEYS = new Set(COUNTRIES.map(fold));
export const isCountryName = (s) => COUNTRY_KEYS.has(fold(s));
// "Barolo, Piedmont, Italy" -> { region: "Barolo, Piedmont", country: "Italy" }. A single word that is a country is the country; otherwise it is the region.
export function splitPlace(text) {
  const parts = String(text || "").split(",").map((x) => x.trim()).filter(Boolean);
  if (!parts.length) return { region: "", country: "" };
  const last = parts[parts.length - 1];
  if (isCountryName(last)) return { region: parts.slice(0, -1).join(", "), country: last };
  return { region: parts.join(", "), country: "" };
}
export function joinPlace(region, country) {
  return [String(region || "").trim(), String(country || "").trim()].filter(Boolean).join(", ");
}

// The small second line shown under a wine's name on every screen: up to three facts about the wine, most important first.
// Order: varietal, vineyard, appellation, region, country. A fact that is missing or repeats another is skipped, so the line is as full as the data allows.
// Pure: no browser, no network.
import { splitPlace } from "./blends.js?v=1";

const fold = (s) => String(s == null ? "" : s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const clean = (s) => String(s == null ? "" : s).trim();
export const SEPARATOR = " \u00b7 ";

export function varietalOf(c) {
  const list = c && c.grapes && c.grapes.length ? c.grapes : c && c.ruleGrapes && c.ruleGrapes.length ? c.ruleGrapes : null;
  if (list) return list.slice(0, 3).join(", ") + (list.length > 3 ? "\u2026" : "");
  return clean(c && c.grape);
}
// c: a catalog card, or anything shaped like one (producer, cuvee, grapes, vineyard, appellation, region, country).
export function infoParts(c) {
  if (!c) return [];
  const out = [], seen = new Set([fold(c.producer), fold(c.cuvee)].filter(Boolean));
  const add = (text) => { const t = clean(text); const k = fold(t); if (!t || seen.has(k)) return; seen.add(k); out.push(t); };
  add(varietalOf(c));
  add(c.vineyard || (c.raw && c.raw.vineyard));
  add(c.appellation);
  add(c.region);
  add(c.country);
  return out;
}
export const infoLine = (c, max = 3) => infoParts(c).slice(0, max).join(SEPARATOR);

// A journal entry. A catalog wine uses its card (so the vineyard shows); a wine typed in by hand uses what was typed.
export function entryAsInfoCard(e, card) {
  if (card) return card;
  const place = splitPlace((e && (e.region || e.region_text)) || "");
  return { producer: e && e.producer, cuvee: e && e.wine_name, grape: (e && (e.grape || e.grape_text)) || "", region: place.region, country: place.country || (e && e.country) || "" };
}
export const entryInfoLine = (e, card, max = 3) => infoLine(entryAsInfoCard(e, card), max);

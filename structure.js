// Structure rules, switched on. This is the one place that decides where a wine's STARTING structure comes from:
//   1. what an editor scored for that wine (always wins), then
//   2. what the rules suggest from the grape, place, style and label words (rules.js), when the rules are switched on, then
//   3. the middle of each scale.
// The starting structure is used for three things: where the rating sliders begin, the baseline the palate is worked out from,
// and how well a wine fits a person's taste in the Discover deck. Nothing here is shown to players as a "correct" answer.
// The Owner switches the rules on or off in Editor, Structure (the database switch "structureRules"). This file is pure except for that one call.
import { suggestStructure, values as ruleValues } from "./rules.js?v=4";
import { clampDimValue, dimMeta } from "./logic.js?v=10";

export const FEATURE = "structureRules";

// A wine typed in by a player (or a journal row) shaped like a catalog card, so the same rules can read it.
// The place a player types ("Barolo, Piedmont, Italy") is offered as both the appellation and the region, because the rules look for place names inside it.
export function entryAsCard(e) {
  const e0 = e || {};
  const place = e0.region || e0.region_text || "";
  return {
    producer: e0.producer || "", cuvee: e0.wine_name || e0.cuvee || "", style: e0.style || "unknown",
    grape: e0.grape || e0.grape_text || "", appellation: place, region: place, country: e0.country || "", raw: {},
  };
}

// What the rules suggest for one wine, remembered so the deck can ask again and again cheaply.
const memo = new Map();
const signature = (c) => {
  const r = c.raw || {};
  return [c.id || "", c.producer, c.cuvee, c.style, c.appellation, c.region, c.country, c.grape, (r.label_grapes || []).join("+"), (r.rule_grapes || []).join("+"), r.classification || ""].join("\u00a6");
};
export function rulesFor(card) {
  if (!card) return null;
  const key = signature(card);
  if (memo.has(key)) return memo.get(key);
  let v = null;
  try { v = ruleValues(suggestStructure(card)); } catch (_) { v = null; }   // a wine the rules cannot read simply gets no suggestion
  if (memo.size > 3000) memo.clear();
  memo.set(key, v);
  return v;
}
// The starting values for a wine. editorRef: what editors scored (may be partial). on: whether the rules are switched on.
export function startingValues(card, editorRef, on) {
  const ref = editorRef || {};
  if (!on) return { ...ref };
  return { ...(rulesFor(card) || {}), ...ref };
}
// wine id -> starting values, for the Discover deck.
export function structureMap(cards, refs, on) {
  if (!on) return refs || new Map();
  const out = new Map();
  for (const c of cards || []) { const v = startingValues(c, refs && refs.get(c.id), true); if (Object.keys(v).length) out.set(c.id, v); }
  return out;
}
// Moves the sliders of a brand-new rating sheet to the starting values (and remembers them as the defaults, so Reset returns to them
// and the "adjusted" flag only becomes true when the person changes something).
export function applyDefaults(sheet, defaults) {
  if (!sheet || !defaults) return sheet;
  const dims = { ...sheet.dims };
  for (const key of Object.keys(dims)) {
    if (typeof defaults[key] !== "number" || dims[key].adjusted) continue;
    const meta = dimMeta(key); if (!meta) continue;
    const v = clampDimValue(meta, defaults[key]);
    dims[key] = { value: v, def: v, adjusted: false };
  }
  return { ...sheet, dims };
}

// ---------------------------------------------------------------- the switch (Owner)
// Changes the database switch. Needs the settings permission; the database refuses anyone else.
export async function setStructureRules(sb, on) {
  const { data, error } = await sb.from("feature_access").update({ all_tiers: !!on }).eq("feature", FEATURE).select("feature");
  if (error) throw error;
  if (!data || !data.length) throw new Error("The structure rules switch is missing or you may not change it. Run database update 19, and make sure you are signed in as the Owner.");
}

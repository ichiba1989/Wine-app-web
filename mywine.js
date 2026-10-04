// A player's private version of a wine's details ("wine info"). Anyone can change a wine's type, grapes, place, name or vintage for themselves;
// only they see the change and the catalog never moves. The change is stored as the few fields that differ from the catalog, and is laid over
// the wine everywhere the player sees it: the Discover card, Swipes, the Journal, the rating window and the structure rules.
// The rules at the top are pure (no browser, no network). loadMyInfo and saveMyInfo at the bottom talk to Supabase.
import { cardFromRow } from "./logic.js?v=10";
import { splitGrapeText, fold } from "./grapes.js?v=1";
import { splitPlace } from "./blends.js?v=1";

export const FIELDS = ["producer", "wine_name", "vintage", "style", "grape", "region"];   // the keys of the wine info form
const norm = (s) => String(s == null ? "" : s).trim();
const key = (k, v) => (k === "style" || k === "vintage" ? norm(v) : fold(norm(v)));

// What the form changed compared with the catalog's own form: only the differing fields. An empty result means "the catalog's version".
export function diffForm(catalogForm, form) {
  const data = {};
  FIELDS.forEach((k) => { if (key(k, form[k]) !== key(k, catalogForm[k])) data[k] = norm(form[k]); });
  return data;
}
// The same change as a patch to a row of v_catalog_cards.
export function patchRow(row, data) {
  const r = { ...row };
  if (!data) return r;
  if ("producer" in data) r.producer = data.producer;
  if ("wine_name" in data) r.wine_name = data.wine_name || null;
  if ("vintage" in data) {
    r.is_non_vintage = data.vintage === "NV";
    r.vintage_year = /^\d{4}$/.test(data.vintage) ? Number(data.vintage) : null;
  }
  if ("style" in data) r.style = data.style || "unknown";
  if ("grape" in data) { r.label_grapes = splitGrapeText(data.grape); r.rule_grapes = []; }
  if ("region" in data) { const p = splitPlace(data.region); r.region = p.region || null; r.country = p.country || null; r.appellation = null; r.classification = null; }
  return r;
}
// Lays the change over a card (made by loadCards): the name, type, grapes, place and the facts shown on the Discover card are rebuilt.
// card.catalogForm, set by the caller before this, keeps the catalog's own version so the form can be compared and reset.
export function patchCard(card, data) {
  if (!data || !Object.keys(data).length) return card;
  const raw = patchRow(card.raw, data), fresh = cardFromRow(raw);
  return Object.assign(card, {
    raw, producer: fresh.producer, cuvee: fresh.cuvee, vintage: fresh.vintage, style: fresh.style, country: fresh.country, region: fresh.region,
    appellation: fresh.appellation, grape: fresh.grape, grapes: fresh.grapes, ruleGrapes: fresh.ruleGrapes, facts: fresh.facts, mine: true,
  });
}
// The same change laid over a journal entry (a row of v_journal_entries).
export function patchEntry(e, data) {
  if (!data || !Object.keys(data).length) return e;
  const r = patchRow({ producer: e.producer, wine_name: e.wine_name, vintage_year: e.vintage_year, is_non_vintage: e.is_non_vintage, style: e.style, label_grapes: null, region: e.region, country: e.country }, data);
  const out = { ...e, producer: r.producer, wine_name: r.wine_name, vintage_year: r.vintage_year, is_non_vintage: r.is_non_vintage, style: r.style, region: r.region, country: r.country };
  if ("grape" in data) out.grape = (r.label_grapes || []).join(", ") || null;
  return out;
}

// ---------------------------------------------------------------- the database (table my_wine_info, database update 24)
export async function loadMyInfo(sb) {
  const { data, error } = await sb.from("my_wine_info").select("wine_vintage_id, data");
  if (error) throw error;
  return new Map(data.map((r) => [r.wine_vintage_id, r.data || {}]));
}
// An empty change removes the player's version.
export async function saveMyInfo(sb, userId, wineVintageId, data) {
  if (!data || !Object.keys(data).length) {
    const { error } = await sb.from("my_wine_info").delete().eq("wine_vintage_id", wineVintageId);
    if (error) throw error;
    return;
  }
  const { error } = await sb.from("my_wine_info").upsert({ user_id: userId, wine_vintage_id: wineVintageId, data, updated_at: new Date().toISOString() }, { onConflict: "user_id,wine_vintage_id" });
  if (error) throw error;
}

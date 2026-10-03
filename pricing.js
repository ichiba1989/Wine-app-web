// Wine prices. An editor or the Owner can set a typical price for a wine in Edit wine info. Players also enter the price they paid in their journal.
//   * No editor price: the players' average is used (once enough different players have entered a price; the database decides how many).
//   * An editor price and players' prices: the two are blended. The editor's price counts like EDITOR_WEIGHT players' prices, so players
//     move the price a little with each new entry, and more as they add up.
//   * Neither: no price is shown.
// The rules at the top are pure (no browser, no network). The functions at the bottom talk to Supabase.

export const EDITOR_WEIGHT = 4;

// info: { editorCents, sumCents, count }. Returns whole cents, or null when there is nothing to show.
export function blendPrice({ editorCents = null, sumCents = 0, count = 0 } = {}) {
  const hasEditor = Number.isFinite(editorCents) && editorCents >= 0 && editorCents !== null;
  const n = Number.isFinite(count) && count > 0 ? count : 0;
  const sum = n ? Number(sumCents) || 0 : 0;
  if (!hasEditor && !n) return null;
  if (!n) return Math.round(editorCents);
  if (!hasEditor) return Math.round(sum / n);
  return Math.round((editorCents * EDITOR_WEIGHT + sum) / (EDITOR_WEIGHT + n));
}
// $24 for $10 and over (nearest dollar); $7.50 under $10 (nearest 50 cents).
export function formatPrice(cents) {
  if (!Number.isFinite(cents) || cents < 0) return "";
  if (cents >= 1000) return "$" + Math.round(cents / 100);
  const half = Math.round(cents / 50) * 50;
  return "$" + (half / 100).toFixed(2).replace(/\.00$/, "");
}
export const priceFact = (cents) => (cents == null ? "" : `About ${formatPrice(cents)}`);
// "24.99", "$24", "1,200" -> cents. "" -> null (no price). Anything else -> NaN.
export function parsePrice(text) {
  const t = String(text == null ? "" : text).replace(/[$,\s]/g, "");
  if (t === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return NaN;
  const cents = Math.round(parseFloat(t) * 100);
  return cents <= 1000000 ? cents : NaN;
}
export const centsToField = (c) => (c == null ? "" : (c / 100).toFixed(2).replace(/\.00$/, ""));

// ---------------------------------------------------------------- putting prices on the cards
const fold = (s) => String(s == null ? "" : s).toLowerCase().replace(/\s+/g, " ").trim();
// Takes the price into the card's facts (the last line, which is the place, so the card does not grow taller) and removes repeated lines
// (for example "Italy" twice when a wine is placed at country level).
export function tidyFacts(card) {
  const seen = new Set();
  card.facts = (card.facts || []).filter((f) => { const k = fold(f.text); if (!k || seen.has(k)) return false; seen.add(k); return true; });
  return card;
}
export function applyPrice(card, info) {
  tidyFacts(card);
  const cents = info ? blendPrice(info) : null;
  card.price = cents;
  if (cents != null) {
    const text = priceFact(cents), last = card.facts[card.facts.length - 1];
    if (last) card.facts[card.facts.length - 1] = { ...last, text: `${last.text} \u00b7 ${text}`, derived: true };
    else card.facts.push({ text, derived: true });
  }
  return card;
}
export function applyPrices(cards, byVintage) {
  cards.forEach((c) => applyPrice(c, byVintage && byVintage.get(c.id)));
  return cards;
}

// ---------------------------------------------------------------- the database
// wine_vintage_id -> { editorCents, sumCents, count, people }. The players' numbers appear only once enough players have entered a price.
export async function loadPrices(sb) {
  const out = new Map();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("v_wine_prices").select("wine_vintage_id, price_cents, price_sum_cents, price_count, price_people").range(from, from + 999);
    if (error) throw error;
    data.forEach((r) => out.set(r.wine_vintage_id, { editorCents: r.price_cents == null ? null : Number(r.price_cents), sumCents: Number(r.price_sum_cents) || 0, count: Number(r.price_count) || 0, people: Number(r.price_people) || 0 }));
    if (data.length < 1000) break;
  }
  return out;
}
export async function loadWinePrice(sb, wineVintageId) {
  const { data, error } = await sb.from("v_wine_prices").select("wine_vintage_id, price_cents, price_sum_cents, price_count, price_people").eq("wine_vintage_id", wineVintageId).maybeSingle();
  if (error) throw error;
  if (!data) return { editorCents: null, sumCents: 0, count: 0, people: 0 };
  return { editorCents: data.price_cents == null ? null : Number(data.price_cents), sumCents: Number(data.price_sum_cents) || 0, count: Number(data.price_count) || 0, people: Number(data.price_people) || 0 };
}
// cents may be null (clear the price). Needs database update 20.
export async function saveWinePrice(sb, wineId, cents) {
  const { data, error } = await sb.from("wines").update({ price_cents: cents }).eq("id", wineId).select("id");
  if (error) throw error;
  if (!data || !data.length) throw new Error("The price could not be saved. Check that database update 20 has been run.");
}

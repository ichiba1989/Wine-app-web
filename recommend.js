// Recommendations: which catalog wines to suggest to this player, using the SAME taste model as the Discover deck (deck.js userModel, prefOf, famOf).
// It is built to be reused by any game or screen: pass the wines you want to choose from (accept), the wines to leave out (exclude) and how many you want.
// Pure: no page, no network. The model is rule-based and uses only the player's own swipes, ratings and quiz answers; it never guesses facts about a wine.
//
// Ranking: how likely they are to like it (prefOf) plus a little for how easy it is to know and find (famOf), so a suggestion is something they can
// actually go and get. With no history every wine looks alike on taste, so the easier-to-find wines come first. The same producer is not suggested twice.
import { prefOf, famOf, cardKeys, isLive } from "./deck.js?v=4";

const LIKE_AT = 0.3;                                       // how strongly a key must be liked (-1 to 1) before it is given as the reason
const affinity = (pref, k) => { const v = pref.get(k) || 0; return v / (Math.abs(v) + 1); };

// One plain sentence about why this wine suits them, taken only from what they have liked before. Returns "" when nothing stands out.
export function reasonFor(card, model) {
  const k = cardKeys(card);
  const named = (list, key) => (list || []).find((n) => key && key.endsWith(":" + String(n).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()));
  const options = [
    ...k.grapes.map((g) => ({ key: g, text: `You tend to like ${named([...(card.grapes || []), ...(card.ruleGrapes || [])], g) || "this grape"}.` })),
    { key: k.producer, text: `You liked another wine from ${card.producer}.` },
    { key: k.region, text: `You have liked wines from ${card.appellation || card.region}.` },
    { key: k.country, text: `You have liked wines from ${card.country}.` },
    { key: k.style, text: `You tend to like ${String(card.style || "").replace("rose", "rosé")} wines.` },
  ].filter((o) => o.key).map((o) => ({ ...o, a: affinity(model.pref, o.key) })).filter((o) => o.a >= LIKE_AT).sort((a, b) => b.a - a.a);
  if (options.length) return options[0].text;
  return (Number(card.reach) >= 4) ? "Easy to find, a good place to start." : "";
}

// cards: catalog cards. model: userModel(...). refs: structureMap(...). crowd: optional. exclude: Set of card ids to skip. accept: card => true to keep it.
export function recommend({ cards, model, refs, crowd, exclude = new Set(), accept = () => true, limit = 3 }) {
  const scored = [];
  (cards || []).forEach((c) => {
    if (exclude.has(c.id) || !isLive(c) || !accept(c)) return;
    const pref = prefOf(c, model, refs), fam = famOf(c, model, crowd);
    scored.push({ card: c, pref, fam, score: pref + 0.3 * fam });
  });
  scored.sort((a, b) => b.score - a.score || String(a.card.id).localeCompare(String(b.card.id)));
  const out = [], producers = new Set();
  for (const r of scored) {
    const p = cardKeys(r.card).producer;
    if (p && producers.has(p)) continue;
    producers.add(p);
    out.push({ ...r, reason: reasonFor(r.card, model) });
    if (out.length >= limit) break;
  }
  return out;
}

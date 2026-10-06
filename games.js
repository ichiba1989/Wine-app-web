// The Games tab: a list of games (Wine Bingo is the first), then the bingo tiers, then one card. Every function here takes data and returns an HTML
// string; nothing touches the network. The rules (what fills a square, what unlocks a tier) are in bingo.js; app.js holds the screen state and clicks.
import { esc } from "./logic.js?v=10";
import { TIERS, CARDS, CLEARS_TO_UNLOCK, cardById, cardsOfTier, tierOpen, clearedIn } from "./bingo.js?v=1";

// g: { screen: "hub" | "bingo" | "card", cardId, sq }   data: { progress: Map(cardId -> progress), memory, news: [{ id, kind }] }
export function gamesHtml(g, data) {
  if (g.screen === "card" && cardById(g.cardId)) return cardScreen(cardById(g.cardId), g, data);
  if (g.screen === "bingo") return bingoScreen(data);
  return hubScreen(data);
}

function hubScreen({ memory }) {
  const cleared = CARDS.filter((c) => memory.cleared[c.id]).length;
  return `<div class="games"><h2 class="serif gh">Games</h2>
    <button class="gtile" data-action="game:bingo"><div class="serif gt-title">Wine Bingo</div>
      <div class="muted small">Rate wines to fill nine-square cards. Three in a row clears a card, and clearing cards opens harder ones.</div>
      <div class="gt-meta">${cleared} of ${CARDS.length} cards cleared</div></button>
    <div class="gtile soon" aria-disabled="true"><div class="serif gt-title">More games</div><div class="muted small">Coming later.</div></div></div>`;
}

const newsHtml = (news) => news.length
  ? `<div class="okbox gnews">${news.map((n) => `<div>${n.kind === "blackout" ? "Blackout! Every square on" : "Bingo! You cleared"} <b>${esc((cardById(n.id) || {}).title || "a card")}</b>.</div>`).join("")}</div>` : "";

function miniGrid(p) {
  return `<span class="mini" aria-hidden="true">${p.done.map((d) => `<i class="${d ? "on" : ""}"></i>`).join("")}</span>`;
}
function cardTile(c, p, memory) {
  const badges = (memory.cleared[c.id] ? '<span class="gbadge ok">Cleared</span>' : "") + (memory.blackout[c.id] ? '<span class="gbadge star">Blackout</span>' : "") + (c.draft ? '<span class="gbadge draft">Draft</span>' : "");
  return `<button class="bcard" data-action="game:card:${esc(c.id)}" aria-label="${esc(c.title)}, ${p.count} of 9 squares">${miniGrid(p)}
    <span class="bc-main"><span class="serif bc-title">${esc(c.title)}</span><span class="muted small">${p.count} of 9${p.lines.length ? ` · ${p.lines.length} ${p.lines.length === 1 ? "line" : "lines"}` : ""}</span>${badges ? `<span class="bc-badges">${badges}</span>` : ""}</span></button>`;
}
function bingoScreen({ progress, memory, news }) {
  const tiers = TIERS.map((t) => {
    const open = tierOpen(t.n, memory), prev = TIERS.find((x) => x.n === t.n - 1);
    if (!open) {
      return `<div class="btier locked"><div class="bt-head"><span class="serif bt-title">${esc(t.title)}</span><span class="gbadge">Locked</span></div>
        <div class="muted small">Clear ${CLEARS_TO_UNLOCK} cards in “${esc(prev.title)}” to open this tier (${Math.min(CLEARS_TO_UNLOCK, clearedIn(prev.n, memory))} of ${CLEARS_TO_UNLOCK} so far).</div></div>`;
    }
    return `<div class="btier"><div class="bt-head"><span class="serif bt-title">${esc(t.title)}</span><span class="muted small">${clearedIn(t.n, memory)} of ${cardsOfTier(t.n).length} cleared</span></div>
      <div class="muted small bt-blurb">${esc(t.blurb)}</div>${cardsOfTier(t.n).map((c) => cardTile(c, progress.get(c.id), memory)).join("")}</div>`;
  }).join("");
  return `<div class="games"><button class="link back" data-action="game:hub">‹ Games</button><h2 class="serif gh">Wine Bingo</h2>
    <p class="ptext">A square fills when you <b>rate</b> a wine that fits it. Each wine fills one square, and rating a wine again does not count twice. Three in a row clears a card.</p>
    ${newsHtml(news)}${tiers}</div>`;
}

function cardScreen(c, g, { progress, memory, news }) {
  const p = progress.get(c.id), inLine = new Set(p.lines.flat());
  const sel = Number.isInteger(g.sq) && g.sq >= 0 && g.sq < 9 ? g.sq : null;
  const squares = c.squares.map((s, i) => {
    const w = p.filled[i];
    return `<button class="bsq${w ? " on" : ""}${inLine.has(i) ? " line" : ""}${sel === i ? " sel" : ""}" data-action="game:sq:${i}" aria-pressed="${sel === i}"
      aria-label="${esc(s.label)}${w ? ", filled by " + esc(w.name) : ", not filled yet"}"><span class="bs-label">${esc(s.label)}</span>${w ? `<span class="bs-check" aria-hidden="true">✓</span>` : ""}</button>`;
  }).join("");
  let detail = `<div class="muted small">Tap a square to see what it needs.</div>`;
  if (sel !== null) {
    const s = c.squares[sel], w = p.filled[sel];
    detail = w
      ? `<div class="ptext"><b>${esc(s.label)}</b><br>Filled by <b>${esc(w.name)}</b>.</div>`
      : `<div class="ptext"><b>${esc(s.label)}</b><br>${esc(s.hint)}</div><div class="muted small">Find a wine in Discover or Swipes, or add one in Journal, then rate it.</div>
         <button class="btn outline slim" data-action="tab:journal">Open Journal</button>`;
  }
  const status = (p.blackout ? "Blackout!" : p.bingo ? `Bingo: ${p.lines.length} ${p.lines.length === 1 ? "line" : "lines"}` : "No line yet") + ` · ${p.count} of 9 squares`;
  return `<div class="games"><button class="link back" data-action="game:bingo">‹ Wine Bingo</button>
    <h2 class="serif gh">${esc(c.title)}</h2><div class="muted small">${esc(c.blurb)}</div>
    ${newsHtml(news.filter((n) => n.id === c.id))}
    <div class="bstatus">${esc(status)}${c.draft ? ' <span class="gbadge draft">Draft</span>' : ""}</div>
    <div class="bgrid" role="group" aria-label="${esc(c.title)} bingo card">${squares}</div>
    <div class="bdetail">${detail}</div>
    ${c.draft ? `<div class="muted small bnote">This list is still being checked by our editors. ${esc(c.note || "")}</div>` : c.note ? `<div class="muted small bnote">${esc(c.note)}</div>` : ""}</div>`;
}

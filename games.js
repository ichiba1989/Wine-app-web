// The Games tab: a list of games (Wine Bingo is the first), then the bingo tiers, then one card. Every function here takes data and returns an HTML
// string; nothing touches the network. The rules (what fills a square, what unlocks a tier) are in bingo.js; app.js holds the screen state and clicks.
import { esc, wineName, entryName } from "./logic.js?v=10";
import { infoLine } from "./wineline.js?v=1";
import { PAIRS, AXES, nextPair, answeredCount, pickedCount, isDone, leanings } from "./thisorthat.js?v=2";
import { TIERS, CARDS, CLEARS_TO_UNLOCK, cardById, cardsOfTier, tierOpen, clearedIn } from "./bingo.js?v=2";

// g: { screen: "hub" | "bingo" | "card", cardId, sq }
// data: { progress: Map(cardId -> progress), memory, news: [{ id, kind }], help }
//   help (only for an empty square that is selected): { unrated: [journal entries], recs: [{ card, reason }] }
export function gamesHtml(g, data) {
  if (g.screen === "card" && cardById(g.cardId)) return cardScreen(cardById(g.cardId), g, data);
  if (g.screen === "bingo") return bingoScreen(data);
  if (g.screen === "tot") return totScreen(g, data);
  return hubScreen(data);
}

function hubScreen({ memory, tot }) {
  const cleared = CARDS.filter((c) => memory.cleared[c.id]).length;
  return `<div class="games"><h2 class="serif gh">Games</h2>
    <button class="gtile" data-action="game:bingo"><div class="serif gt-title">Wine Bingo</div>
      <div class="muted small">Rate wines to fill nine-square cards. Three in a row clears a card, and clearing cards opens harder ones.</div>
      <div class="gt-meta">${cleared} of ${CARDS.length} cards cleared</div></button>
    <button class="gtile" data-action="game:tot"><div class="serif gt-title">This or That</div>
      <div class="muted small">Pick between two foods. We will tell you what your picks say about the wines you may enjoy.</div>
      <div class="gt-meta">${tot && isDone(tot.answers) ? "Finished: see your results" : tot && answeredCount(tot.answers) ? `${answeredCount(tot.answers)} of ${PAIRS.length} answered` : `${PAIRS.length} quick choices`}</div></button>
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
    <p class="ptext">A square fills when you <b>rate</b> a wine that fits it. One wine can fill several squares (a white wine from the USA fills both), and rating a wine again does not count twice. Three in a row clears a card.</p>
    ${newsHtml(news)}${tiers}</div>`;
}

function photoHtml(w, cls) { return w && w.photo ? `<img class="${cls}${w.photo.own ? " own" : ""}" src="${esc(w.photo.url)}" alt="" loading="lazy" decoding="async">` : ""; }
// What to show for an empty square: a wine in the journal that only needs rating, or else wines picked for this player's taste (recommend.js).
function helpHtml(s, help, c) {
  const hint = `<div class="ptext"><b>${esc(s.label)}</b><br>${esc(s.hint)}</div>`;
  if (help && help.unrated && help.unrated.length) {
    return hint + `<div class="bhelp"><div class="muted small">You already have ${help.unrated.length === 1 ? "this wine" : "these wines"} in your Journal without a rating:</div>` +
      help.unrated.slice(0, 3).map((e) => `<button class="brow" data-action="entry:${esc(e.id)}"><span class="serif">${esc(entryName(e))}</span><span class="pill dark">Rate it</span></button>`).join("") +
      `</div>`;
  }
  if (help && help.recs && help.recs.length) {
    return hint + `<div class="bhelp"><div class="muted small">${help.cold ? "A few places to start, and each would fill this square:" : "Picked for you, from different angles. Each would fill this square:"}</div>` +
      help.recs.map((r) => `<div class="brec"><div class="brlens">${esc(r.label)}</div><div class="serif">${esc(wineName(r.card))}</div><div class="muted small">${esc(infoLine(r.card))}</div>${r.reason ? `<div class="small brwhy">${esc(r.reason)}</div>` : ""}
        <button class="pill" data-action="review:${esc(r.card.id)}">I've had it: rate it</button></div>`).join("") + `</div>`;
  }
  const tip = c && c.note ? " " + esc(c.note) : "";
  return hint + `<div class="muted small">None of our wines fits this square yet. If you have one, add it in Journal.${tip}</div><button class="btn outline slim" data-action="tab:journal">Open Journal</button>`;
}
function cardScreen(c, g, { progress, memory, news, help }) {
  const p = progress.get(c.id), inLine = new Set(p.lines.flat());
  const sel = Number.isInteger(g.sq) && g.sq >= 0 && g.sq < 9 ? g.sq : null;
  const squares = c.squares.map((s, i) => {
    const w = p.filled[i];
    return `<button class="bsq${w ? " on" : ""}${inLine.has(i) ? " line" : ""}${sel === i ? " sel" : ""}" data-action="game:sq:${i}" aria-pressed="${sel === i}"
      aria-label="${esc(s.label)}${w ? ", filled by " + esc(w.name) : ", not filled yet"}">${photoHtml(w, "bs-photo")}<span class="bs-label">${esc(s.label)}</span>${w ? `<span class="bs-check" aria-hidden="true">✓</span>` : ""}</button>`;
  }).join("");
  let detail = `<div class="muted small">Tap a square to see what it needs.</div>`;
  if (sel !== null) {
    const s = c.squares[sel], w = p.filled[sel];
    detail = w
      ? `<div class="bfilled">${photoHtml(w, "bd-photo")}<div class="ptext"><b>${esc(s.label)}</b><br>Filled by <b>${esc(w.name)}</b>.${w.entryId ? `<br><button class="pill dark bview" data-action="entry:${esc(w.entryId)}">View my rating</button>` : ""}</div></div>`
      : helpHtml(s, help, c);
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

// ---------------------------------------------------------------- This or That (thisorthat.js): one question at a time, then the results
// data.tot: { answers, matches: [{ card, reason }] }. g.totResults: show the results even if some pairs are left.
function totScreen(g, { tot }) {
  const a = tot.answers, left = nextPair(a);
  const head = `<button class="link back" data-action="game:hub">\u2039 Games</button><h2 class="serif gh">This or That</h2>`;
  if (!left || g.totResults) return `<div class="games">${head}${totResults(tot)}</div>`;
  const n = answeredCount(a), side = (k, o) => `<button class="tbtn" data-action="game:pick:${k}"><span class="temoji" aria-hidden="true">${o.emoji}</span><span class="serif tlabel">${esc(o.label)}</span></button>`;
  return `<div class="games">${head}
    <div class="muted small">Question ${n + 1} of ${PAIRS.length}. Go with your gut.</div>
    <div class="tprog" aria-hidden="true"><i style="width:${Math.round((n / PAIRS.length) * 100)}%"></i></div>
    <div class="tpair" role="group" aria-label="Pick one">${side("a", left.a)}<span class="tor" aria-hidden="true">or</span>${side("b", left.b)}</div>
    <div class="tskip"><button class="link" data-action="game:skip">I like neither</button>${pickedCount(a) >= 4 ? `<button class="link" data-action="game:totresults">See my results now</button>` : ""}</div></div>`;
}
function totResults(tot) {
  const ls = leanings(tot.answers).filter((l) => l.dir !== 0), picked = pickedCount(tot.answers);
  if (!picked) return `<p class="ptext">You have not picked anything yet.</p><button class="btn primary slim" data-action="game:totagain">Start</button>`;
  const lines = ls.length
    ? ls.map((l) => `<div class="tlean"><span class="serif">${esc(AXES[l.axis][l.dir > 0 ? "hi" : "lo"])}</span><span class="muted small"> ${l.strength === "lean" ? "You lean this way." : "Just a hint so far."}</span></div>`).join("")
    : `<div class="muted small">Your picks went both ways, so there is no clear lean yet. That is fine: you like variety.</div>`;
  const wines = tot.matches.length
    ? `<h3 class="serif gh2">Wines to try</h3><div class="muted small">Their profiles point the same way. A starting point, not a promise.</div>` +
      tot.matches.map((m) => `<div class="brec"><div class="serif">${esc(wineName(m.card))}</div><div class="muted small">${esc(infoLine(m.card))}</div><div class="small brwhy">${esc(m.reason)}</div>
        <button class="pill" data-action="review:${esc(m.card.id)}">I've had it: rate it</button></div>`).join("")
    : (ls.length ? `<div class="muted small tnone">None of our wines fits those leanings well yet.</div>` : "");
  return `<p class="ptext">${isDone(tot.answers) ? "All done. " : ""}You picked ${picked} ${picked === 1 ? "food" : "foods"}. Here is what that leans toward:</p>
    <div class="tleans">${lines}</div>${wines}
    <div class="tskip"><button class="btn outline slim" data-action="game:totagain">Play again</button></div>
    <div class="muted small bnote">Just for fun: the leanings come from a simple list of pairs, not from a test of your taste. Your picks are also saved with your account, without your name, to help us learn how food and wine tastes connect. They do not change your Discover cards.</div>`;
}

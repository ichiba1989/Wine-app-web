// The Games tab: a list of games (Wine Bingo, This or That, Guess the Glass), then each game's screens. Every function here takes data and returns an HTML
// string; nothing touches the network. The rules (what fills a square, what unlocks a tier) are in bingo.js; app.js holds the screen state and clicks.
import { esc, wineName, entryName } from "./logic.js?v=25";
import { infoLine } from "./wineline.js?v=4";
import { PAIRS, AXES, AXIS_ORDER, AXIS_VIEW, nextPair, answeredCount, pickedCount, isDone, leanings, axisValues, compareAxes, isClear } from "./thisorthat.js?v=4";
import { TIERS, CARDS, CLEARS_TO_UNLOCK, cardById, cardsOfTier, tierOpen, clearedIn } from "./bingo.js?v=5";
import { MODES as GUESS_MODES, LEVELS, ROUND, modeById, bestOf, isRight, scoreOf } from "./blindgame.js?v=14";

// g: { screen: "hub" | "bingo" | "card", cardId, sq }
// data: { progress: Map(cardId -> progress), memory, news: [{ id, kind }], help }
//   help (only for an empty square that is selected): { unrated: [journal entries], recs: [{ card, reason }] }
export function gamesHtml(g, data) {
  if (g.screen === "card" && cardById(g.cardId)) return cardScreen(cardById(g.cardId), g, data);
  if (g.screen === "bingo") return bingoScreen(data);
  if (g.screen === "tot") return totScreen(g, data);
  if (g.screen === "guess") return guessScreen(g, data);
  return hubScreen(data);
}

function hubScreen({ memory, tot, guess }) {
  const cleared = CARDS.filter((c) => memory.cleared[c.id]).length;
  return `<div class="games"><h2 class="serif gh">Games</h2>
    <button class="gtile" data-action="game:bingo"><div class="serif gt-title">Wine Bingo</div>
      <div class="muted small">Rate wines to fill nine-square cards. Three in a row clears a card, and clearing cards opens harder ones.</div>
      <div class="gt-meta">${cleared} of ${CARDS.length} cards cleared</div></button>
    <button class="gtile" data-action="game:tot"><div class="serif gt-title">This or That</div>
      <div class="muted small">Pick between two foods. We will tell you what your picks say about the wines you may enjoy.</div>
      <div class="gt-meta">${tot && isDone(tot.answers) ? "Finished: see your results" : tot && answeredCount(tot.answers) ? `${answeredCount(tot.answers)} of ${PAIRS.length} answered` : `${PAIRS.length} quick choices`}</div></button>
    <button class="gtile" data-action="game:guess"><div class="serif gt-title">Guess the Glass</div>
      <div class="muted small">A blind tasting game. Read a wine's profile and pick the wine, or play one part at a time: the grape, the place, the age, the feel.</div>
      <div class="gt-meta">${guess && guess.memory && guess.memory.rounds ? `${guess.memory.rounds} ${guess.memory.rounds === 1 ? "round" : "rounds"} played` : "Five modes"}</div></button></div>`;
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
// One line of the picture: a track with a centre mark and a bar growing toward the lower or higher end. v = { value: -1..1, n } or missing.
// kind "journal" or "game". A line without enough to go on is drawn empty, with a short reason.
function trackHtml(v, kind, view) {
  const need = kind === "journal" ? (v && v.n >= 2) : (v && v.n >= 1);
  if (!need) return `<div class="tcell"><div class="ttrack empty" aria-hidden="true"><i class="tmid"></i></div><div class="tcap muted">${kind === "journal" ? "Needs more rated wines" : "No picks on this"}</div></div>`;
  const val = Math.max(-1, Math.min(1, v.value)), clear = isClear(val), w = Math.round(Math.abs(val) * 50);
  const side = val >= 0 ? "hi" : "lo", style = side === "hi" ? `left:50%;width:${w}%` : `left:${50 - w}%;width:${w}%`;
  const word = !clear ? "Even" : (side === "hi" ? view.hi : view.lo);
  const soft = kind === "game" && v.n < 2 ? " soft" : "";
  return `<div class="tcell"><div class="ttrack ${kind}${soft}" aria-hidden="true"><i class="tmid"></i>${clear ? `<i class="tfill" style="${style}"></i>` : ""}</div><div class="tcap">${esc(word)}${kind === "game" && v.n < 2 && clear ? ' <span class="muted">(a hint)</span>' : ""}</div></div>`;
}
// The two pictures side by side, line by line: your journal (what you rated well) on the left, your This or That picks on the right.
function compareHtml(tot) {
  const game = axisValues(tot.answers), jr = tot.taste && !tot.taste.error && !tot.taste.loading ? tot.taste : null;
  const rows = AXIS_ORDER.filter((k) => game[k] || (jr && jr[k] && jr[k].n >= 2)).map((k) => {
    const view = AXIS_VIEW[k];
    return `<div class="tcrow" role="group" aria-label="${esc(view.name)}"><div class="tcends"><span>${esc(view.lo)}</span><b>${esc(view.name)}</b><span>${esc(view.hi)}</span></div>
      <div class="tcpair">${jr ? trackHtml(jr[k], "journal", view) : `<div class="tcell"><div class="ttrack empty" aria-hidden="true"><i class="tmid"></i></div><div class="tcap muted">${tot.taste && tot.taste.error ? "Could not load" : "Loading\u2026"}</div></div>`}${trackHtml(game[k], "game", view)}</div></div>`;
  }).join("");
  let verdict = "";
  if (jr) {
    const c = compareAxes(jr, game), names = (a) => a.map((k) => AXIS_VIEW[k].name.toLowerCase());
    const list = (a) => (a.length <= 1 ? a[0] || "" : `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`);
    const haveJournal = AXIS_ORDER.some((k) => jr[k] && jr[k].n >= 2);
    if (!haveJournal) verdict = "Rate a few wines in your Journal and your own taste will fill in on the left, so the two can be compared.";
    else if (c.agree.length || c.differ.length) verdict = [c.agree.length ? `Your picks and your journal agree on ${list(names(c.agree))}.` : "", c.differ.length ? `They point different ways on ${list(names(c.differ))}.` : ""].filter(Boolean).join(" ");
    else verdict = "There is no clear match or mismatch yet. More picks and more rated wines will sharpen it.";
  }
  return `<div class="tcmp"><div class="tcheads"><span class="tkey journal">Your journal</span><span class="tkey game">This or That</span></div>${rows}</div>${verdict ? `<p class="ptext tverdict">${esc(verdict)}</p>` : ""}`;
}
function totResults(tot) {
  const ls = leanings(tot.answers).filter((l) => l.dir !== 0), picked = pickedCount(tot.answers);
  if (!picked) return `<p class="ptext">You have not picked anything yet.</p><button class="btn primary slim" data-action="game:totagain">Start</button>`;
  const wines = tot.matches.length
    ? `<h3 class="serif gh2">Wines to try</h3><div class="muted small">Their profiles point the same way as your picks. A starting point, not a promise.</div>` +
      tot.matches.map((m) => `<div class="brec"><div class="serif">${esc(wineName(m.card))}</div><div class="muted small">${esc(infoLine(m.card))}</div><div class="small brwhy">${esc(m.reason)}</div>
        <button class="pill" data-action="review:${esc(m.card.id)}">I've had it: rate it</button></div>`).join("")
    : (ls.length ? `<div class="muted small tnone">None of our wines fits those leanings well yet.</div>` : "");
  return `<p class="ptext">${isDone(tot.answers) ? "All done. " : ""}Here is how your picks compare with the wines you have rated:</p>
    ${compareHtml(tot)}${wines}
    <div class="tskip"><button class="btn outline slim" data-action="game:totagain">Play again</button></div>
    <div class="muted small bnote">Just for fun: the picks come from a simple list of pairs, not from a test of your taste.</div>`;
}

// ---------------------------------------------------------------- Guess the Glass (blindgame.js): the modes, one question at a time, then the round's result
// data.guess: { memory, level, play: { mode, level, round: [question], i, picks: [choice] } | null, follow, message }
//   follow (after a pick, and on the result screen): { questions: [{ id, question, choices, answered: { choice, result } | null }], wines: [{ card, reason, label }],
//   topics: [{ name, can }] } where can: the quiz has questions about it (the Learn button shows only then).
function guessScreen(g, { guess }) {
  const head = (back) => `<button class="link back" data-action="${back ? "game:ghub" : "game:hub"}">\u2039 ${back ? "Guess the Glass" : "Games"}</button><h2 class="serif gh">Guess the Glass</h2>`;
  const play = guess.play;
  if (!play) return `<div class="games">${head(false)}${guessHub(guess)}</div>`;
  if (play.i >= play.round.length) return `<div class="games">${head(true)}${guessDone(play, guess)}</div>`;
  return `<div class="games">${head(true)}${guessQuestion(play, guess)}</div>`;
}
function guessHub({ memory, level, message }) {
  const levels = LEVELS.map((l) => `<button class="chip wide${level === l.id ? " on" : ""}" data-action="game:glevel:${l.id}" aria-pressed="${level === l.id}">${esc(l.label)}</button>`).join("");
  const tiles = GUESS_MODES.map((m) => {
    const best = bestOf(memory, m.id, level);
    return `<button class="gtile gmode" data-action="game:gplay:${m.id}"><div class="serif gt-title">${esc(m.label)}</div><div class="muted small">${esc(m.blurb)}</div>
      <div class="gt-meta">${best === null ? `${ROUND} questions` : `Best: ${best} of ${ROUND}`}</div></button>`;
  }).join("");
  return `<p class="ptext">Each profile is what is <b>typical</b> for a grape, a place and an age, built from our wine rules and the catalog. Read it and pick the wine.</p>
    ${message ? `<div class="okbox">${esc(message)}</div>` : ""}
    <div class="chips left" role="group" aria-label="How hard">${levels}</div>
    <div class="muted small glevel">${level === "hard" ? "Hard: the wrong answers are close to the right one." : "Easy: the wrong answers are clearly different."}</div>${tiles}`;
}
// The profile reads as a short paragraph; the clue words are in bold.
function profileHtml(q) {
  return `<div class="gprof"><div class="gplabel">In the glass</div><p class="gptext">${(q.text || []).map((x) => (x.b ? `<b>${esc(x.t)}</b>` : esc(x.t))).join("")}</p></div>`;
}
function guessQuestion(play, guess) {
  const q = play.round[play.i], picked = play.picks[play.i], answered = picked !== undefined;
  const m = modeById(play.mode) || { label: "" };
  const opts = q.choices.map((c, k) => {
    const right = answered && c === q.answer, wrong = answered && picked === c && c !== q.answer;
    return `<button class="opt${right ? " right" : ""}${wrong ? " wrong" : ""}" data-action="game:gpick:${k}"${answered ? " disabled" : ""}><span>${esc(c)}</span>${right ? "<b>\u2713</b>" : ""}</button>`;
  }).join("");
  let after = "";
  if (answered) {
    const last = play.i + 1 >= play.round.length, r = q.reveal;
    after = `<div class="greveal"><p class="fb"><b>${isRight(q, picked) ? "Right!" : "Not this time."}</b> ${q.mode === "age" ? `It is ${esc(r.age)}.` : `It is ${esc(q.answer)}.`}</p>
      ${r.wine ? `<div class="muted small">This profile was built from a wine in our catalog: <b>${esc(r.wine)}</b>.</div>` : r.typical && q.mode !== "age" ? `<div class="muted small">A typical profile for this grape and place, not one bottle.</div>` : ""}
      ${q.why.length ? `<div class="gwhy"><div class="gplabel">Why</div><ul>${q.why.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div>` : ""}
      ${followHtml(guess.follow, true)}
      <div class="lacts"><button class="btn primary slim" data-action="game:gnext">${last ? "See my score" : "Next wine"}</button></div></div>`;
  }
  return `<div class="muted small">${esc(m.label)} \u00b7 Wine ${play.i + 1} of ${play.round.length}${play.level === "hard" ? " \u00b7 Hard" : ""}</div>
    <div class="tprog" aria-hidden="true"><i style="width:${Math.round((play.i / play.round.length) * 100)}%"></i></div>
    <h3 class="serif gq">${esc(q.prompt)}</h3>${profileHtml(q)}<div class="opts gopts" role="group" aria-label="Choices">${opts}</div>${after}`;
}
// Learn it (quiz questions about the answer, answered right here, and a way into Learn) and Try a wine (catalog wines picked for the player).
function followHtml(f, inQuestion) {
  if (!f) return "";
  let out = "";
  if (f.questions && f.questions.length) {
    out += `<div class="gfollow"><h3 class="serif gh2">Learn it</h3>${f.questions.map((x) => {
      const a = x.answered;
      const opts = x.choices.map((c, k) => {
        const right = a && c === x.correct, wrong = a && a.choice === c && c !== x.correct;
        return `<button class="opt small${right ? " right" : ""}${wrong ? " wrong" : ""}" data-action="game:glq:${esc(x.id)}:${k}"${a ? " disabled" : ""}><span>${esc(c)}</span>${right ? "<b>\u2713</b>" : ""}</button>`;
      }).join("");
      return `<div class="glq"><div class="gqq">${esc(x.question)}</div><div class="opts">${opts}</div>${a ? `<div class="muted small">${a.result === "correct" ? "Correct. Saved with your quiz answers." : `The answer is ${esc(x.correct)}. Saved to your quiz review.`}</div>` : ""}</div>`;
    }).join("")}</div>`;
  }
  const topics = (f.topics || []).filter((t) => t.can);
  if (inQuestion && topics.length) out += `<div class="gmore">${topics.slice(0, 2).map((t) => `<button class="btn outline slim" data-action="game:glearn:${t.k}">More about ${esc(t.name)} in Learn</button>`).join("")}</div>`;
  if (f.wines && f.wines.length) {
    out += `<h3 class="serif gh2">${inQuestion ? "Try a wine like it" : "Wines to try"}</h3>` + f.wines.map((w) => `<div class="brec">${w.label ? `<div class="brlens">${esc(w.label)}</div>` : ""}<div class="serif">${esc(wineName(w.card))}</div><div class="muted small">${esc(infoLine(w.card))}</div>${w.reason ? `<div class="small brwhy">${esc(w.reason)}</div>` : ""}
      <button class="pill" data-action="review:${esc(w.card.id)}">I've had it: rate it</button></div>`).join("");
  }
  return out;
}
function guessDone(play, guess) {
  const n = scoreOf(play.round, play.picks), best = bestOf(guess.memory, play.mode, play.level), m = modeById(play.mode) || { label: "" };
  const f = guess.follow || {};
  const topics = (f.topics || []);
  const practise = topics.length
    ? `<h3 class="serif gh2">Topics to practise</h3><div class="gtopics">${topics.map((t) => `<div class="gtopic"><span>${esc(t.name)}</span>${t.can ? `<button class="pill dark" data-action="game:glearn:${t.k}">Learn</button>` : `<span class="muted small">No quiz questions yet</span>`}</div>`).join("")}</div>` : "";
  const list = play.round.map((q, i) => `<li>${isRight(q, play.picks[i]) ? "\u2713" : "\u2717"} ${esc(q.mode === "age" ? `${q.prompt.replace(/ How old is it\?$/, "")} ${q.answer}` : q.answer)}</li>`).join("");
  return `<div class="gscore"><div class="serif gbig">${n} of ${play.round.length}</div><div class="muted small">${esc(m.label)}${play.level === "hard" ? " \u00b7 Hard" : ""}${best !== null ? ` \u00b7 Best: ${best} of ${ROUND}` : ""}</div></div>
    <ul class="glist">${list}</ul>${practise}${followHtml({ wines: f.wines }, false)}
    <div class="lacts"><button class="btn primary slim" data-action="game:gagain">Play again</button><button class="btn outline slim" data-action="game:ghub">Other modes</button></div>
    <div class="muted small bnote">Just for practice: your guesses never change your taste profile or the wines we show you.</div>`;
}

// Learn tab: quiz modes, difficulty, the review archive, timed rounds and feedback on answers.
// The rules at the top are pure (no browser, no network) so they can be tested on their own.
// The controller at the bottom loads questions from Supabase, saves answers and draws the tab.
import { esc, shuffle } from "./logic.js?v=19";
import { weave, boostFor, refOf, focusOptions, fold } from "./tags.js?v=5";
import { proToolsOn } from "./words.js?v=1";
import { overlayQuiz } from "./overlay.js?v=1";
// Marks a write as one that may wait in the outbox when there is no connection (offline.js), with what it did (overlay.js).
const tag = (q, effect) => (q && typeof q.queue === "function" ? q.queue(effect) : q);

// ---------------------------------------------------------------- settings
export const DIFFS = [
  { id: "beginner", label: "Beginner" },
  { id: "enthusiast", label: "Enthusiast" },
  { id: "professional", label: "Professional" },
  { id: "scholar", label: "Scholar" },
];
export const MODES = [
  { id: "random", label: "Random" },
  { id: "review", label: "Review" },
  { id: "grapes", label: "Grapes", topic: "Grapes" },
  { id: "regions", label: "Regions", topic: "Regions" },
  { id: "producers", label: "Producers", topic: "Producers" },
  { id: "making", label: "Winemaking", topic: "Winemaking" },
  { id: "other", label: "Other", topic: "Other alcohol" },
  { id: "timed", label: "Timed" },
];
export const REVIEW_FILTERS = [
  { id: "incorrect", label: "Incorrect" },
  { id: "unknown", label: "I don't know" },
  { id: "archive", label: "Archive" },
];
export const TIMED_SECONDS = [60, 120];   // 1 and 2 minute rounds
export const FEEDBACK_MS = 700;           // how long a timed answer shows before the next question
export const FLAG_REASONS = [
  "The answer looks wrong",
  "More than one answer could be right",
  "The wording is unclear",
  "The information is out of date",
  "Something else",
];

// ---------------------------------------------------------------- progress
// latestRows come from the v_quiz_latest view (one row per answered question),
// archiveRows from the v_quiz_archive view.
export function progressFrom(latestRows, archiveRows) {
  const latest = new Map((latestRows || []).map((r) => [r.question_id, r.result]));
  return { latest, seen: new Set(latest.keys()), archive: new Set((archiveRows || []).map((r) => r.question_id)) };
}
// Same rules as the database: a miss or a skip goes into the archive and stays there, even after
// a later correct answer, until the user removes it. A new miss puts it back.
export function recordAnswer(p, qid, result) {
  p.latest.set(qid, result);
  p.seen.add(qid);
  if (result === "wrong" || result === "unknown") p.archive.add(qid);
}
export function removeFromArchive(p, qid) { p.archive.delete(qid); }

// ---------------------------------------------------------------- building a round
// Which questions a round uses. Review lists come from the archive:
// Incorrect = latest answer wrong, I don't know = latest answer skipped, Archive = everything kept.
// focus (optional, Enthusiast and Professional): a tag's ref (tags.js refOf): only questions with that tag. tagsByQ: Map(question id -> [{ kind, name }]).
// only (optional): a list of question ids, from a game's "More in Learn" button (questionsAbout below); the round keeps to those until "Show all".
export function poolFor(questions, p, { mode, diff = "all", review = "incorrect", focus = null, tagsByQ = null, only = null }) {
  let qs = questions.filter((q) => diff === "all" || q.difficulty === diff);
  if (only && mode !== "review") { const keep = new Set(only); qs = qs.filter((q) => keep.has(q.id)); }
  if (focus && tagsByQ && mode !== "review") qs = qs.filter((q) => (tagsByQ.get(q.id) || []).some((t) => refOf(t) === focus));
  if (mode === "review") {
    const kept = qs.filter((q) => p.archive.has(q.id));
    if (review === "archive") return kept.map((q) => q.id);
    const want = review === "unknown" ? "unknown" : "wrong";
    return kept.filter((q) => p.latest.get(q.id) === want).map((q) => q.id);
  }
  const m = MODES.find((x) => x.id === mode);
  return (m && m.topic ? qs.filter((q) => q.topic === m.topic) : qs).map((q) => q.id);
}
// No repeats until the full set has been answered once: unseen questions come first.
// Once everything has been seen, each new round starts from a fresh random order.
// boost (optional): Map(question id -> how much it is about something the player has not met, from tags.js boostFor). Those unseen questions are woven in every other
// place, so the quiz leans toward what the player said "I don't know it" to without becoming only that. Nothing is skipped: seen-once-everything still holds.
export function orderFor(pool, p, { mode, review, boost = null }, rnd = shuffle) {
  if (mode === "review") return review === "archive" ? rnd(pool) : [...pool];
  return [...weave(rnd(pool.filter((id) => !p.seen.has(id))), boost), ...rnd(pool.filter((id) => p.seen.has(id)))];
}
// The questions about some topics, for a game that wants to point at the quiz (Guess the Glass). topics: [{ kind, name, words }] in order of importance.
// For each topic: first the questions editors tagged with it (tags.js refOf), then the ones that name it as whole words in the question or its answer
// (and, for a theme, any of its words). Questions the player has not answered yet come before the ones they have. Returns question ids, at most limit.
export function questionsAbout(questions, tagsByQ, topics, { limit = 2, seen = new Set() } = {}) {
  const all = [], taken = new Set();
  const add = (ids) => ids.forEach((id) => { if (!taken.has(id)) { taken.add(id); all.push(id); } });
  const pad = (s) => " " + fold(s) + " ";
  for (const t of topics || []) {
    if (!t || !t.name) continue;
    const ref = t.kind + ":" + fold(t.name);
    if (tagsByQ) add((questions || []).filter((q) => (tagsByQ.get(q.id) || []).some((x) => refOf(x) === ref)).map((q) => q.id));
    const needles = [t.name, ...(t.words || [])].map(fold).filter((n) => n.length >= 3).map((n) => " " + n + " ");
    add((questions || []).filter((q) => { const text = pad(q.question) + pad(q.correct_answer); return needles.some((n) => text.includes(n)); }).map((q) => q.id));
  }
  return [...all.filter((id) => !seen.has(id)), ...all.filter((id) => seen.has(id))].slice(0, limit);
}
export const optionsFor = (q, rnd = shuffle) => rnd([q.correct_answer, ...(q.distractors || [])]);
// choice null means "I don't know".
export const resultOf = (q, choice) => (choice === null ? "unknown" : choice === q.correct_answer ? "correct" : "wrong");
export const pct = (c, n) => (n ? Math.round((c / n) * 100) : null);
export const clockText = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
// The feedback switch from the database's feature_access table.
export function feedbackOn(row, tier) { return !!row && (row.all_tiers || (Array.isArray(row.tiers) && row.tiers.includes(tier))); }

export function newRun(questions, p, sel, rnd = shuffle) {
  const timed = sel.mode === "timed";
  return {
    mode: sel.mode, review: sel.review, seconds: sel.seconds, timed, focus: sel.focus || (sel.only ? "game" : null),
    order: orderFor(poolFor(questions, p, sel), p, sel, rnd), i: 0, opts: [],
    answered: false, choice: null, result: null,
    tally: { c: 0, n: 0, u: 0 }, streak: 0, best: 0,
    started: !timed, finished: false, timeLeft: sel.seconds, endsAt: null,
    flagged: false, removed: false, saved: false,
  };
}
// Timed rounds cycle through the order if it runs out.
export const currentId = (run) => run.order[run.i % run.order.length];
export function answer(run, q, choice) {
  if (run.answered || run.finished) return null;
  const result = resultOf(q, choice);
  run.answered = true; run.choice = choice; run.result = result;
  run.streak = result === "correct" ? run.streak + 1 : 0;   // a miss or a skip resets the streak
  run.best = Math.max(run.best, run.streak);
  run.tally = {
    c: run.tally.c + (result === "correct" ? 1 : 0),
    n: run.tally.n + (result === "unknown" ? 0 : 1),
    u: run.tally.u + (result === "unknown" ? 1 : 0),
  };
  return result;
}
export function advance(run) {
  if (!run.timed && run.i + 1 >= run.order.length) { run.finished = true; return; }
  run.i += 1;
  run.opts = []; run.answered = false; run.choice = null; run.result = null; run.flagged = false; run.removed = false;
}

// ---------------------------------------------------------------- drawing
const icon = (paths) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const GRAPES_ICON = `<svg viewBox="0 0 32 36" width="20" height="20" aria-hidden="true"><path d="M16 2 C16 6 18 8 22 8" stroke="#4E6B3A" stroke-width="2" fill="none" stroke-linecap="round"/>${[[8, 12], [16, 12], [24, 12], [12, 20], [20, 20], [16, 28]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5" fill="#5B1030" stroke="#3A0A1F"/>`).join("")}</svg>`;
const ICONS = {
  random: icon('<path d="M3 7h4l10 10h4"/><path d="M3 17h4l3-3"/><path d="M14 10l3-3h4"/><path d="M18 4l3 3-3 3"/><path d="M18 14l3 3-3 3"/>'),
  review: icon('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'),
  grapes: GRAPES_ICON,
  regions: icon('<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18"/><path d="M12 3a14 14 0 0 0 0 18"/>'),
  producers: icon('<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/><path d="M10 21v-3h4v3"/>'),
  making: icon('<path d="M9 3h6"/><path d="M10 3v6L4.6 19a1.5 1.5 0 0 0 1.3 2h12.2a1.5 1.5 0 0 0 1.3-2L14 9V3"/><path d="M7 15h10"/>'),
  other: icon('<path d="M4 4h16l-8 9z"/><path d="M12 13v7"/><path d="M8 20h8"/>'),
  timed: icon('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M9 2h6"/>'),
};

function controlsHtml(L) {
  const s = L.sel;
  const tiles = MODES.map((m) => `<button class="tile${s.mode === m.id ? " on" : ""}" data-learn="mode:${m.id}" aria-pressed="${s.mode === m.id}">${ICONS[m.id]}<span>${m.label}</span></button>`).join("");
  const diffs = [{ id: "all", label: "All" }, ...DIFFS].map((d) => `<button class="chip${s.diff === d.id ? " on" : ""}" data-learn="diff:${d.id}">${d.label}</button>`).join("");
  let extra = "";
  if (s.mode === "review") extra = `<div class="chips">${REVIEW_FILTERS.map((r) => `<button class="chip${s.review === r.id ? " on" : ""}" data-learn="review:${r.id}">${r.label}</button>`).join("")}</div>`;
  if (s.mode === "timed") extra = `<div class="chips left">${TIMED_SECONDS.map((sec) => `<button class="chip wide${s.seconds === sec ? " on" : ""}" data-learn="secs:${sec}">${sec / 60} min</button>`).join("")}</div>`;
  // Enthusiast and Professional can focus a round on one grape, place or producer (the tags editors put on questions).
  const focusList = proToolsOn() && s.mode !== "review" ? focusOptions(L.tagsByQ, L.weights) : [];
  const kindWord = { grape: "grape", region: "place", country: "country", producer: "producer", style: "style", theme: "theme" };
  const focus = focusList.length ? `<select class="sortsel" data-learn-focus aria-label="Focus the round on one topic"><option value="">Focus: anything</option>${focusList.map((o) => `<option value="${esc(o.ref)}"${s.focus === o.ref ? " selected" : ""}>${esc(o.name)} (${kindWord[o.kind] || o.kind}, ${o.count})</option>`).join("")}</select>` : "";
  // A round opened from a game keeps to that game's topic until "Show all" (every kind of player sees this, not only Enthusiast and Professional).
  const only = s.only ? `<div class="chips left lonly"><span class="chip on">Topic: ${esc(s.onlyLabel || "from the game")}</span><button class="chip" data-learn="unfocus">Show all</button></div>` : "";
  return `<div class="modes">${tiles}</div>${only}<div class="chips" role="group" aria-label="Difficulty">${diffs}</div>${focus}${extra}`;
}

function questionHtml(L, run, q) {
  const diffLabel = (DIFFS.find((d) => d.id === q.difficulty) || { label: "" }).label;
  const top = run.timed
    ? `<div class="ttop"><b id="lclock">${clockText(run.timeLeft)}</b><span>Correct: ${run.tally.c}</span><span>Streak: ${run.streak}</span></div>
       <div class="lbar"><div id="lbar" style="width:${(run.timeLeft / run.seconds) * 100}%;background:${run.timeLeft <= 15 ? "var(--wine)" : "var(--slate)"}"></div></div>`
    : `<div class="muted small">${esc(q.topic)}, ${esc(diffLabel)}</div>
       <div class="lbar thin"><div style="width:${(run.i / run.order.length) * 100}%"></div></div>`;
  const opts = run.opts.map((o, k) => {
    const right = run.answered && o === q.correct_answer;
    const wrong = run.answered && run.choice === o && o !== q.correct_answer;
    return `<button class="opt${right ? " right" : ""}${wrong ? " wrong" : ""}" data-learn="pick:${k}"${run.answered ? " disabled" : ""}><span>${esc(o)}</span>${right ? "<b>✓</b>" : ""}</button>`;
  }).join("");
  const said = run.answered ? `<p class="fb">${run.result === "correct" ? "Correct." : `The answer is ${esc(q.correct_answer)}.`}</p>` : "";
  let after = "";
  if (!run.answered) after = `<button class="link bigger" data-learn="skip">I don't know</button>`;
  else if (!run.timed) {
    const last = run.i + 1 >= run.order.length;
    const remove = run.mode === "review"
      ? (run.removed ? `<span class="muted small">Removed from your archive.</span>` : `<button class="btn outline slim" data-learn="unarchive">Remove from archive</button>`) : "";
    const flag = L.feedback
      ? (run.flagged ? `<span class="muted small">Thanks, an editor will review it.</span>` : `<button class="link" data-learn="flag">Question this answer</button>`) : "";
    after = `${said}<div class="lacts"><button class="btn primary slim" data-learn="next">${last ? "See result" : "Next question"}</button>${remove}${flag}</div>`;
  } else after = said;
  return `${top}<h2 class="serif qtext">${esc(q.question)}</h2><div class="opts">${opts}</div>${after}`;
}

function bodyHtml(L) {
  if (L.error) return `<div class="err">${esc(L.error)}</div><button class="btn outline" data-learn="retry">Try again</button>`;
  if (!L.loaded) return `<p class="muted">Loading questions…</p>`;
  if (!L.questions.length) return `<p class="muted">No quiz questions yet. Check that the quiz questions were loaded and published for testing (see the guide).</p>`;
  const run = L.run;
  if (!run.order.length) {
    return `<p class="muted">${run.mode === "review"
      ? "Nothing here yet. Questions you miss or skip are saved to your archive so you can review them again."
      : run.focus ? "No questions for that topic at this level yet." : "No questions at this level yet."}</p>`;
  }
  if (run.timed && !run.started) {
    const mins = run.seconds / 60;
    return `<h2 class="serif qtext">Ready?</h2>
      <p>You have ${mins} ${mins === 1 ? "minute" : "minutes"} to answer as many questions as you can. A correct answer adds to your streak. A miss or a skip resets it.</p>
      <button class="btn primary" data-learn="start">Start the clock</button>`;
  }
  if (run.finished) {
    const p = pct(run.tally.c, run.tally.n);
    const text = run.timed
      ? `You answered ${run.tally.n} ${run.tally.n === 1 ? "question" : "questions"}: ${run.tally.c} correct${p === null ? "" : ` (${p}%)`}. Best streak: ${run.best}.`
      : `${p === null ? "No answers this round" : `${p}% correct`}${run.tally.u ? `, ${run.tally.u} skipped` : ""}.`;
    return `<h2 class="serif qtext">${run.timed ? "Time's up" : "Round complete"}</h2><p>${text}</p>
      <button class="btn primary" data-learn="again">${run.timed ? "Play another round" : "Play again"}</button>`;
  }
  return questionHtml(L, run, L.byId.get(currentId(run)));
}

export function learnHtml(L) {
  return `<div class="learn">${controlsHtml(L)}<div id="lbody">${bodyHtml(L)}</div></div>`;
}

function flagSheetHtml(flag) {
  const reasons = FLAG_REASONS.map((r, k) => `<button class="vbtn${flag.reason === r ? " on" : ""}" data-learn="reason:${k}">${esc(r)}</button>`).join("");
  return `<div class="overlay"><div class="sheet" id="flagPanel">
    <div class="sheethead"><div class="sheettitle"><div class="serif big">Question this answer</div><div class="muted small">Help us keep the content accurate.</div></div>
      <div class="sheetbtns"><button class="xbtn" data-learn="flagclose" aria-label="Close">&times;</button></div></div>
    <div class="verdicts">${reasons}</div>
    <textarea class="field" rows="3" data-learn-note placeholder="Add a note or a source (optional)">${esc(flag.note)}</textarea>
    <div id="flagErr" class="err">${esc(flag.error || "")}</div>
    <button class="btn primary" data-learn="flagsend"${flag.reason && !flag.sending ? "" : " disabled"}>Send to editors</button></div></div>`;
}

// ---------------------------------------------------------------- controller
const must = ({ data, error }) => { if (error) throw error; return data; };

// ctx: { sb(), user(), profile(), onError(message) }. mount(el) draws the tab into el; leave() stops timers.
export function createLearn(ctx) {
  // How much each question is about something the player has not met (needs ctx.gapWeights from app.js and the question tags).
  const boostNow = () => { try { return ctx.gapWeights && L.tagsByQ ? boostFor(L.tagsByQ, ctx.gapWeights()) : null; } catch (_) { return null; } };
  const L = {
    loaded: false, loading: false, error: null, questions: [], byId: new Map(),
    progress: progressFrom([], []), feedback: false,
    sel: { mode: "random", diff: "all", review: "incorrect", seconds: 60, focus: null, only: null, onlyLabel: "" },
    run: null, flag: null,
  };
  const selNow = () => ({ ...L.sel, boost: boostNow(), tagsByQ: L.tagsByQ });
  let root = null, clockTimer = null, nextTimer = null;
  const stopTimers = () => { clearInterval(clockTimer); clearTimeout(nextTimer); clockTimer = nextTimer = null; };
  const overlay = () => document.querySelector("#overlay");

  // Saving never blocks the game; a failed save shows the app's banner.
  const saveQuietly = (promise, what) => promise.then(must).catch((e) => ctx.onError(`Could not save ${what}: ${e.message || e}`));

  async function load() {
    L.loading = true; L.error = null; draw();
    try {
      const sb = ctx.sb();
      const [qs, latest, arch, feat] = await Promise.all([
        sb.from("quiz_questions").select("id, topic, difficulty, question, correct_answer, distractors"),
        sb.from("v_quiz_latest").select("question_id, result"),
        sb.from("v_quiz_archive").select("question_id"),
        sb.from("feature_access").select("feature, all_tiers, tiers").eq("feature", "contentFeedback").maybeSingle(),
      ]);
      L.questions = must(qs);
      L.tagsByQ = new Map();
      try {   // quiz tags (docs/quiz_tags.sql); without them the quiz simply is not tag-aware
        const [tg, lk] = await Promise.all([sb.from("quiz_tags").select("id, kind, name"), sb.from("quiz_question_tags").select("question_id, tag_id")]);
        if (!tg.error && !lk.error) { const byId = new Map(tg.data.map((t) => [t.id, t])); lk.data.forEach((l) => { const t = byId.get(l.tag_id); if (t) { if (!L.tagsByQ.has(l.question_id)) L.tagsByQ.set(l.question_id, []); L.tagsByQ.get(l.question_id).push(t); } }); }
      } catch (_) { L.tagsByQ = new Map(); }
      L.byId = new Map(L.questions.map((q) => [q.id, q]));
      const mine = overlayQuiz(must(latest), must(arch));   // plus the answers given offline that have not been uploaded yet
      L.progress = progressFrom(mine.latest, mine.archive);
      L.feedback = feedbackOn(must(feat), (ctx.profile() || {}).tier || "default");
      L.loaded = true;
      L.run = newRun(L.questions, L.progress, selNow());
    } catch (e) {
      L.error = "Could not load the quiz: " + (e.message || e);
    }
    L.loading = false;
    draw();
  }

  function draw() {
    if (!root) return;
    try { L.weights = ctx.gapWeights ? ctx.gapWeights() : null; } catch (_) { L.weights = null; }
    const run = L.run;
    if (run && !run.finished && run.order.length && run.started && !run.opts.length) run.opts = optionsFor(L.byId.get(currentId(run)));
    root.innerHTML = learnHtml(L);
  }
  // Only the clock and its bar change each second, so taps on the answers are never interrupted.
  function paintClock(run) {
    const c = document.getElementById("lclock"), b = document.getElementById("lbar");
    if (c) c.textContent = clockText(run.timeLeft);
    if (b) { b.style.width = `${(run.timeLeft / run.seconds) * 100}%`; b.style.background = run.timeLeft <= 15 ? "var(--wine)" : "var(--slate)"; }
  }

  function startRound() { stopTimers(); closeFlag(); L.run = newRun(L.questions, L.progress, selNow()); draw(); }

  function startClock() {
    const run = L.run;
    run.started = true;
    run.endsAt = Date.now() + run.seconds * 1000;
    run.timeLeft = run.seconds;
    draw();
    clockTimer = setInterval(() => {
      if (L.run !== run) { stopTimers(); return; }
      const left = Math.max(0, Math.ceil((run.endsAt - Date.now()) / 1000));
      if (left !== run.timeLeft) { run.timeLeft = left; paintClock(run); }
      if (left <= 0) finishTimed(run);
    }, 200);
  }
  function finishTimed(run) {
    stopTimers();
    run.finished = true;
    if (!run.saved) {
      run.saved = true;
      const u = ctx.user();
      saveQuietly(tag(ctx.sb().from("timed_runs").insert({
        user_id: u.id, seconds: run.seconds, answered: run.tally.n, correct: run.tally.c, skipped: run.tally.u, best_streak: run.best,
      }), null), "the timed round");
    }
    draw();
  }

  function pick(choice) {
    const run = L.run;
    const q = L.byId.get(currentId(run));
    const result = answer(run, q, choice);
    if (!result) return;
    saveAnswer(q.id, result, run.mode);
    draw();
    if (run.timed) {
      nextTimer = setTimeout(() => {
        if (L.run !== run || run.finished) return;
        advance(run);
        draw();
      }, FEEDBACK_MS);
    }
  }

  // Every answer is saved the same way, from a round or from a game (it may wait offline in the outbox, see overlay.js).
  function saveAnswer(qid, result, mode) {
    recordAnswer(L.progress, qid, result);
    const u = ctx.user();
    saveQuietly(tag(ctx.sb().from("quiz_answers").insert({ user_id: u.id, question_id: qid, result, mode }), { t: "answer", qid, result }), "your answer");
  }

  function openFlag() {
    L.flag = { qid: currentId(L.run), reason: null, note: "", sending: false, error: "" };
    overlay().innerHTML = flagSheetHtml(L.flag);
  }
  function closeFlag() { if (L.flag) { L.flag = null; const o = overlay(); if (o) o.innerHTML = ""; } }
  function syncFlag() {
    const f = L.flag;
    document.querySelectorAll("[data-learn^='reason:']").forEach((b) => b.classList.toggle("on", FLAG_REASONS[Number(b.dataset.learn.split(":")[1])] === f.reason));
    const send = document.querySelector("[data-learn='flagsend']");
    if (send) send.disabled = !f.reason || f.sending;
    const err = document.getElementById("flagErr");
    if (err) err.textContent = f.error || "";
  }
  async function sendFlag() {
    const f = L.flag;
    if (!f || !f.reason || f.sending) return;
    f.sending = true; f.error = ""; syncFlag();
    try {
      must(await tag(ctx.sb().from("content_flags").insert({
        user_id: ctx.user().id, target_type: "quiz_question", quiz_question_id: f.qid, reason: f.reason, note: f.note.trim() || null,
      }), null));
      if (L.run && currentId(L.run) === f.qid) L.run.flagged = true;
      closeFlag();
      draw();
    } catch (e) {
      f.sending = false; f.error = "Could not send: " + (e.message || e); syncFlag();
    }
  }

  document.addEventListener("click", (ev) => {
    const t = ev.target.closest("[data-learn]");
    if (!t || t.disabled) return;
    const [action, arg] = t.dataset.learn.split(":");
    if (!root && !L.flag) return;
    const run = L.run;
    if (action === "mode") { L.sel.mode = arg; L.sel.only = null; startRound(); }
    else if (action === "unfocus") { L.sel.only = null; L.sel.onlyLabel = ""; startRound(); }
    else if (action === "diff") { L.sel.diff = arg; startRound(); }
    else if (action === "review") { L.sel.review = arg; startRound(); }
    else if (action === "secs") { L.sel.seconds = Number(arg); startRound(); }
    else if (action === "retry") load();
    else if (action === "start") startClock();
    else if (action === "pick") pick(run.opts[Number(arg)]);
    else if (action === "skip") pick(null);
    else if (action === "next") { advance(run); draw(); }
    else if (action === "again") startRound();
    else if (action === "unarchive") {
      const qid = currentId(run);
      removeFromArchive(L.progress, qid);
      run.removed = true;
      saveQuietly(tag(ctx.sb().from("quiz_archive_removals").insert({ user_id: ctx.user().id, question_id: qid }), { t: "archiveRemove", qid }), "the archive change");
      draw();
    }
    else if (action === "flag") openFlag();
    else if (action === "flagclose") closeFlag();
    else if (action === "reason") { L.flag.reason = FLAG_REASONS[Number(arg)]; syncFlag(); }
    else if (action === "flagsend") sendFlag();
  });
  document.addEventListener("input", (ev) => {
    if (ev.target.dataset && ev.target.dataset.learnFocus !== undefined && root) { L.sel.focus = ev.target.value || null; startRound(); return; }
    if (ev.target.dataset && ev.target.dataset.learnNote !== undefined && L.flag) L.flag.note = ev.target.value;
  });

  return {
    state: L,
    mount(el) {
      root = el;
      if (!L.loaded && !L.loading && !L.error) load();
      else { if (L.loaded && !L.run) L.run = newRun(L.questions, L.progress, selNow()); draw(); }
    },
    // ---- for games (Guess the Glass): the questions load without the tab being open
    ensureLoaded() { if (!L.loaded && !L.loading && !L.error) return load(); return Promise.resolve(); },
    ready: () => L.loaded,
    // Up to `limit` question ids about the topics (see questionsAbout), and one question with its choices in a fixed order for the screen.
    about: (topics, limit = 2) => (L.loaded ? questionsAbout(L.questions, L.tagsByQ, topics, { limit, seen: L.progress.seen }) : []),
    question: (id) => L.byId.get(id) || null,
    choicesOf: (id) => { const q = L.byId.get(id); return q ? optionsFor(q) : []; },
    // Answers one question from a game; saved as an ordinary quiz answer (mode "random"). Returns "correct", "wrong" or "unknown".
    answerOne(id, choice) { const q = L.byId.get(id); if (!q) return null; const result = resultOf(q, choice); saveAnswer(q.id, result, "random"); return result; },
    // Opens the next round on these questions only, until the player taps "Show all".
    focusOn(ids, label) {
      stopTimers(); closeFlag();
      L.sel = { ...L.sel, mode: "random", diff: "all", focus: null, only: ids && ids.length ? [...ids] : null, onlyLabel: label || "" };
      if (L.loaded) L.run = newRun(L.questions, L.progress, selNow());
      if (root) draw();
    },
    // Leaving the tab stops the clock. A timed round in progress is dropped, not saved.
    leave() {
      stopTimers();
      closeFlag();
      if (L.run && L.run.timed && L.run.started && !L.run.finished) L.run = null;
      root = null;
    },
  };
}

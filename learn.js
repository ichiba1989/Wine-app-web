// Learn tab: quiz modes, difficulty, the review archive, timed rounds and feedback on answers.
// The rules at the top are pure (no browser, no network) so they can be tested on their own.
// The controller at the bottom loads questions from Supabase, saves answers and draws the tab.
import { esc, shuffle } from "./logic.js?v=7";

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
export function poolFor(questions, p, { mode, diff = "all", review = "incorrect" }) {
  const qs = questions.filter((q) => diff === "all" || q.difficulty === diff);
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
export function orderFor(pool, p, { mode, review }, rnd = shuffle) {
  if (mode === "review") return review === "archive" ? rnd(pool) : [...pool];
  return [...rnd(pool.filter((id) => !p.seen.has(id))), ...rnd(pool.filter((id) => p.seen.has(id)))];
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
    mode: sel.mode, review: sel.review, seconds: sel.seconds, timed,
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
  return `<div class="modes">${tiles}</div><div class="chips" role="group" aria-label="Difficulty">${diffs}</div>${extra}`;
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
      : "No questions at this level yet."}</p>`;
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
  const L = {
    loaded: false, loading: false, error: null, questions: [], byId: new Map(),
    progress: progressFrom([], []), feedback: false,
    sel: { mode: "random", diff: "all", review: "incorrect", seconds: 60 },
    run: null, flag: null,
  };
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
      L.byId = new Map(L.questions.map((q) => [q.id, q]));
      L.progress = progressFrom(must(latest), must(arch));
      L.feedback = feedbackOn(must(feat), (ctx.profile() || {}).tier || "default");
      L.loaded = true;
      L.run = newRun(L.questions, L.progress, L.sel);
    } catch (e) {
      L.error = "Could not load the quiz: " + (e.message || e);
    }
    L.loading = false;
    draw();
  }

  function draw() {
    if (!root) return;
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

  function startRound() { stopTimers(); closeFlag(); L.run = newRun(L.questions, L.progress, L.sel); draw(); }

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
      saveQuietly(ctx.sb().from("timed_runs").insert({
        user_id: u.id, seconds: run.seconds, answered: run.tally.n, correct: run.tally.c, skipped: run.tally.u, best_streak: run.best,
      }), "the timed round");
    }
    draw();
  }

  function pick(choice) {
    const run = L.run;
    const q = L.byId.get(currentId(run));
    const result = answer(run, q, choice);
    if (!result) return;
    recordAnswer(L.progress, q.id, result);
    const u = ctx.user();
    saveQuietly(ctx.sb().from("quiz_answers").insert({ user_id: u.id, question_id: q.id, result, mode: run.mode }), "your answer");
    draw();
    if (run.timed) {
      nextTimer = setTimeout(() => {
        if (L.run !== run || run.finished) return;
        advance(run);
        draw();
      }, FEEDBACK_MS);
    }
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
      must(await ctx.sb().from("content_flags").insert({
        user_id: ctx.user().id, target_type: "quiz_question", quiz_question_id: f.qid, reason: f.reason, note: f.note.trim() || null,
      }));
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
    if (action === "mode") { L.sel.mode = arg; startRound(); }
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
      saveQuietly(ctx.sb().from("quiz_archive_removals").insert({ user_id: ctx.user().id, question_id: qid }), "the archive change");
      draw();
    }
    else if (action === "flag") openFlag();
    else if (action === "flagclose") closeFlag();
    else if (action === "reason") { L.flag.reason = FLAG_REASONS[Number(arg)]; syncFlag(); }
    else if (action === "flagsend") sendFlag();
  });
  document.addEventListener("input", (ev) => {
    if (ev.target.dataset && ev.target.dataset.learnNote !== undefined && L.flag) L.flag.note = ev.target.value;
  });

  return {
    state: L,
    mount(el) {
      root = el;
      if (!L.loaded && !L.loading && !L.error) load();
      else { if (L.loaded && !L.run) L.run = newRun(L.questions, L.progress, L.sel); draw(); }
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

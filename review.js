// Editor review tools (shown inside the Editor tab):
//   Flags: what testers reported on quiz questions and wines, to mark reviewed or closed.
//   Feedback: general messages testers sent from the app (broken, confusing, ideas), to read and mark handled.
//   Quiz:  edit each question, record its source if you have one, and verify it (verified questions are what players see).
// The rules at the top are pure (no browser, no network). The controller at the bottom talks to Supabase.
import { esc, wineName } from "./logic.js?v=11";
import { suggestTags, pullGroups, canPull, tagDiff, MAX_PULLDOWN, TAG_KINDS } from "./tags.js?v=1";
import * as db from "./data.js?v=24";
import { sortFlags, sortFeedback, sortQuestions, sortSelectHtml, FLAG_SORTS, FEEDBACK_SORTS, QUESTION_SORTS } from "./sorting.js?v=1";

export const TOPICS = ["Grapes", "Regions", "Producers", "Winemaking", "Other alcohol"];
export const DIFFS = [
  { id: "beginner", label: "Beginner" },
  { id: "enthusiast", label: "Enthusiast" },
  { id: "professional", label: "Professional" },
  { id: "scholar", label: "Scholar" },
];
export const FLAG_FILTERS = [
  { id: "open", label: "Open" },
  { id: "reviewed", label: "Reviewed" },
  { id: "closed", label: "Closed" },
  { id: "all", label: "All" },
];
export const QUIZ_FILTERS = [
  { id: "draft", label: "Drafts" },
  { id: "verified", label: "Verified" },
  { id: "retired", label: "Retired" },
  { id: "all", label: "All" },
];
export const STATUS_LABEL = { draft: "Draft", pending_review: "Draft", verified: "Verified", retired: "Retired" };

// ---------------------------------------------------------------- flags
export function flagView(f, questionsById, cardsById) {
  const q = f.quiz_question_id ? questionsById.get(f.quiz_question_id) : null;
  const card = f.wine_vintage_id ? cardsById.get(f.wine_vintage_id) : null;
  return {
    id: f.id, status: f.status, reason: f.reason, note: f.note || "", date: String(f.created_at || "").slice(0, 10),
    isQuiz: f.target_type === "quiz_question", questionId: f.quiz_question_id || null, wineVintageId: f.wine_vintage_id || null,
    title: f.target_type === "quiz_question" ? (q ? q.question : "A quiz question that is no longer listed") : (card ? wineName(card) : "A wine that is no longer listed"),
    detail: q ? `Answer: ${q.correct_answer}` : "",
  };
}
// Each status offers the next steps: open -> reviewed or closed; reviewed -> closed or reopen; closed -> reopen.
export const flagActions = (status) => ({
  open: [{ to: "reviewed", label: "Mark reviewed" }, { to: "closed", label: "Close" }],
  reviewed: [{ to: "closed", label: "Close" }, { to: "open", label: "Reopen" }],
  closed: [{ to: "open", label: "Reopen" }],
}[status] || []);
export const filterFlags = (flags, filter) => flags.filter((f) => filter === "all" || f.status === filter);

// ---------------------------------------------------------------- feedback
export const FEEDBACK_FILTERS = [
  { id: "new", label: "New" },
  { id: "read", label: "Read" },
  { id: "done", label: "Done" },
  { id: "all", label: "All" },
];
export const KIND_LABEL = { bug: "Broken", confusing: "Confusing", idea: "Idea", other: "Other" };
export const filterFeedback = (list, filter) => list.filter((f) => filter === "all" || f.status === filter);
// new -> read or done; read -> done or back to new; done -> back to new.
export const feedbackActions = (status) => ({
  new: [{ to: "read", label: "Mark read" }, { to: "done", label: "Done" }],
  read: [{ to: "done", label: "Done" }, { to: "new", label: "Mark new" }],
  done: [{ to: "new", label: "Reopen" }],
}[status] || []);

// ---------------------------------------------------------------- quiz questions
export const isDraft = (q) => q.status === "draft" || q.status === "pending_review";
export function filterQuestions(list, { q = "", filter = "draft" } = {}) {
  const term = q.trim().toLowerCase();
  return list
    .filter((x) => filter === "all" || (filter === "draft" ? isDraft(x) : x.status === filter))
    .filter((x) => !term || `${x.question} ${x.correct_answer} ${x.topic}`.toLowerCase().includes(term));
}
export const formFromQuestion = (q, source) => ({
  id: q.id, status: q.status, question: q.question, correct: q.correct_answer,
  d0: (q.distractors || [])[0] || "", d1: (q.distractors || [])[1] || "", d2: (q.distractors || [])[2] || "",
  topic: q.topic, difficulty: q.difficulty, sourceId: q.source_id || null,
  sourceName: source ? source.name : "", sourceUrl: source ? source.url || "" : "",
});
// Returns a message for the first problem found, or "" when the question is fine.
export function validateQuestion(f) {
  const t = (x) => String(x || "").trim();
  if (!t(f.question)) return "Write the question.";
  if (!t(f.correct)) return "Write the correct answer.";
  const wrong = [f.d0, f.d1, f.d2].map(t);
  if (wrong.some((w) => !w)) return "Write three wrong answers.";
  const all = [t(f.correct), ...wrong].map((x) => x.toLowerCase());
  if (new Set(all).size !== 4) return "The four answers must all be different.";
  if (!TOPICS.includes(f.topic)) return "Choose a topic.";
  if (!DIFFS.some((d) => d.id === f.difficulty)) return "Choose a difficulty.";
  return "";
}
// mode: save (keeps the status), verify, draft (send back), retire.
export function questionPatch(f, mode, userId, sourceId, nowIso) {
  const t = (x) => String(x || "").trim();
  const patch = {
    topic: f.topic, difficulty: f.difficulty, question: t(f.question), correct_answer: t(f.correct),
    distractors: [t(f.d0), t(f.d1), t(f.d2)], source_id: sourceId || null,
  };
  if (mode === "verify") return { ...patch, status: "verified", verified_by: userId, verified_at: nowIso, last_reviewed_at: nowIso, retired_at: null };
  if (mode === "draft") return { ...patch, status: "draft", verified_by: null, verified_at: null, retired_at: null };
  if (mode === "retire") return { ...patch, status: "retired", retired_at: nowIso };
  return patch;
}

// ---------------------------------------------------------------- drawing
function flagsHtml(R) {
  if (R.error) return `<div class="err">${esc(R.error)}</div><button class="btn outline" data-review="retry">Try again</button>`;
  if (!R.loaded) return `<p class="muted">Loading flags…</p>`;
  const qById = new Map(R.questions.map((q) => [q.id, q]));
  const cById = new Map(R.ctx.cards().map((c) => [c.id, c]));
  const rows = sortFlags(filterFlags(R.flags, R.flagFilter), R.sort.flags).map((f) => flagView(f, qById, cById)).map((v) => {
    const acts = flagActions(v.status).map((a) => `<button class="pill${a.to === "closed" ? "" : " dark"}" data-review="flag:${v.id}:${a.to}">${a.label}</button>`).join("");
    const open = v.isQuiz && v.questionId && qById.has(v.questionId) ? `<button class="pill" data-review="openq:${v.questionId}">Open question</button>`
      : !v.isQuiz && v.wineVintageId && cById.has(v.wineVintageId) && R.ctx.editWine ? `<button class="pill" data-review="editwine:${v.wineVintageId}">Edit wine info</button>` : "";
    return `<div class="pcard"><div class="small muted">${v.isQuiz ? "Quiz question" : "Wine"}, ${esc(v.date)}, ${esc(v.status)}</div>
      <div class="serif" style="font-size:17px;margin:4px 0">${esc(v.title)}</div>${v.detail ? `<div class="muted small">${esc(v.detail)}</div>` : ""}
      <div class="ptext"><b>${esc(v.reason)}</b></div>${v.note ? `<div class="ptext">${esc(v.note)}</div>` : ""}
      <div class="acts">${acts}${open}</div>${R.flagError && R.flagError.id === v.id ? `<div class="err">${esc(R.flagError.message)}</div>` : ""}</div>`;
  }).join("");
  const counts = ["open", "reviewed", "closed"].map((s) => `${R.flags.filter((f) => f.status === s).length} ${s}`).join(", ");
  return `<div class="chips left">${FLAG_FILTERS.map((x) => `<button class="chip wide${R.flagFilter === x.id ? " on" : ""}" data-review="ff:${x.id}">${x.label}</button>`).join("")}</div>
    ${sortSelectHtml("data-review-sort", FLAG_SORTS, R.sort.flags, "flags")}
    <div class="jmeta"><span>${counts}</span></div>${rows || `<p class="muted">${R.flagFilter === "open" ? "No open flags." : "Nothing here."}</p>`}`;
}

function feedbackHtml(R) {
  if (R.feedbackError) return `<div class="err">${esc(R.feedbackError)}</div><button class="btn outline" data-review="retry">Try again</button>`;
  if (!R.loaded) return `<p class="muted">Loading feedback…</p>`;
  const rows = sortFeedback(filterFeedback(R.feedback, R.feedbackFilter), R.sort.feedback).map((f) => {
    const acts = feedbackActions(f.status).map((a) => `<button class="pill${a.to === "done" ? "" : " dark"}" data-review="fb:${f.id}:${a.to}">${a.label}</button>`).join("");
    const reply = f.contact_email ? `<a class="pill" href="mailto:${esc(f.contact_email)}?subject=${encodeURIComponent("Your feedback on the wine app")}">Reply by email</a>` : "";
    const meta = [String(f.created_at || "").slice(0, 10), f.screen ? "on " + f.screen : "", f.app_version ? "version " + f.app_version : ""].filter(Boolean).join(", ");
    return `<div class="pcard"><div class="small muted">${esc(KIND_LABEL[f.kind] || f.kind)}, ${esc(meta)}, ${esc(f.status)}</div>
      <div class="ptext" style="white-space:pre-wrap">${esc(f.message)}</div>
      ${f.contact_email ? `<div class="muted small">Reply to: ${esc(f.contact_email)}</div>` : `<div class="muted small">No reply address left.</div>`}
      <div class="acts">${acts}${reply}</div>${R.feedbackActionError && R.feedbackActionError.id === f.id ? `<div class="err">${esc(R.feedbackActionError.message)}</div>` : ""}</div>`;
  }).join("");
  const counts = ["new", "read", "done"].map((s) => `${R.feedback.filter((f) => f.status === s).length} ${s}`).join(", ");
  return `<div class="chips left">${FEEDBACK_FILTERS.map((x) => `<button class="chip wide${R.feedbackFilter === x.id ? " on" : ""}" data-review="fbf:${x.id}">${x.label}</button>`).join("")}</div>
    ${sortSelectHtml("data-review-sort", FEEDBACK_SORTS, R.sort.feedback, "feedback")}
    <div class="jmeta"><span>${counts}</span></div>${rows || `<p class="muted">${R.feedbackFilter === "new" ? "No new feedback." : "Nothing here."}</p>`}`;
}

function quizHtml(R) {
  if (R.error) return `<div class="err">${esc(R.error)}</div><button class="btn outline" data-review="retry">Try again</button>`;
  if (!R.loaded) return `<p class="muted">Loading questions…</p>`;
  const list = sortQuestions(filterQuestions(R.questions, { q: R.qq, filter: R.quizFilter }), R.sort.quiz).filter((q) => !R.untagged || !R.tagsReady || !(R.links.get(q.id) || new Set()).size);
  const n = (fn) => R.questions.filter(fn).length;
  const rows = list.map((q) => `<button class="jrow" data-review="openq:${q.id}"><span class="jl"><span class="serif qline">${esc(q.question)}</span>
      <span class="meta">${esc(q.topic)}, ${esc((DIFFS.find((d) => d.id === q.difficulty) || {}).label || q.difficulty)}${R.tagsReady ? `, ${(R.links.get(q.id) || new Set()).size} tags` : ""}</span>
      <span class="meta trunc"><span class="okmark">&#10003;</span> ${esc(q.correct_answer)}</span></span>
      <span class="pill${q.status === "verified" ? "" : " dark"}">${STATUS_LABEL[q.status] || q.status}</span></button>`).join("");
  return `<div class="jbar"><input class="field" data-review-q placeholder="Search questions" value="${esc(R.qq)}" autocomplete="off">
      <div class="chips left">${QUIZ_FILTERS.map((x) => `<button class="chip wide${R.quizFilter === x.id ? " on" : ""}" data-review="qf:${x.id}">${x.label}</button>`).join("")}${R.tagsReady ? `<button class="chip wide${R.untagged ? " on" : ""}" data-review="untagged">No tags</button>` : ""}</div>
      ${sortSelectHtml("data-review-sort", QUESTION_SORTS, R.sort.quiz, "quiz")}</div>
    <div class="jmeta"><span>${n(isDraft)} drafts, ${n((q) => q.status === "verified")} verified, ${n((q) => q.status === "retired")} retired</span></div>
    ${rows || `<p class="muted">No questions match.</p>`}`;
}

// The tags part of the question sheet: suggested tags to tick, ticked tags that were not suggested, and a pull-down for up to two more per edit.
function tagsHtml(R) {
  const f = R.form;
  if (!R.tagsReady) return `<div class="qlabel">Tags</div><p class="muted small">${esc(R.tagsError || "Tags are not available yet.")}</p>`;
  const byId = new Map(R.tags.map((t) => [t.id, t]));
  const chip = (t) => `<button type="button" class="chip wide${f.tagSel.has(t.id) ? " on" : ""}" data-review="tag:${t.id}" aria-pressed="${f.tagSel.has(t.id)}">${esc(t.name)} <span class="small muted">${esc((TAG_KINDS.find((k) => k.id === t.kind) || {}).label || "")}</span></button>`;
  const suggested = f.tagSuggest.map((id) => byId.get(id)).filter(Boolean);
  const extra = [...f.tagSel].filter((id) => !f.tagSuggest.includes(id)).map((id) => byId.get(id)).filter(Boolean);
  const full = !canPull(f.tagSel, f.tagPulled);
  const groups = pullGroups(R.tags, new Set([...f.tagSel]));
  const pull = groups.map((g) => `<optgroup label="${esc(g.kind.label)}">${g.tags.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join("")}</optgroup>`).join("");
  return `<div class="qlabel">Tags <span class="muted small">(what this question is about)</span></div>
    <div class="chips left">${suggested.map(chip).join("") || `<span class="muted small">No suggestions for this wording.</span>`}${extra.map(chip).join("")}</div>
    <select class="field" data-review-pull aria-label="Add another tag"${full ? " disabled" : ""}><option value="">${full ? `Two added from the list (the most for one edit)` : `Add another tag from the list (up to ${MAX_PULLDOWN})`}</option>${pull}</select>
    <button type="button" class="pill" data-review="resuggest">Suggest again</button>`;
}

function questionSheetHtml(R) {
  const f = R.form;
  const options = (items, cur) => items.map((x) => `<option value="${esc(x.id || x)}"${cur === (x.id || x) ? " selected" : ""}>${esc(x.label || x)}</option>`).join("");
  const draft = f.status === "draft" || f.status === "pending_review";
  const buttons = [
    `<button class="btn outline" data-review="save"${R.saving ? " disabled" : ""}>Save changes</button>`,
    draft || f.status === "retired" ? `<button class="btn primary" data-review="verify"${R.saving ? " disabled" : ""}>Verify and publish</button>` : "",
    f.status === "verified" ? `<button class="btn outline" data-review="draft"${R.saving ? " disabled" : ""}>Send back to draft</button>` : "",
    f.status === "retired" ? `<button class="btn outline" data-review="draft"${R.saving ? " disabled" : ""}>Restore as draft</button>` : `<button class="btn danger" data-review="retire"${R.saving ? " disabled" : ""}>Retire this question</button>`,
  ].join("");
  return `<div class="overlay"><div class="sheet" id="reviewPanel">
    <div class="sheethead"><div class="sheettitle"><div class="serif big">Quiz question</div><div class="muted small">${STATUS_LABEL[f.status] || f.status}. Only verified questions are shown to players.</div></div>
      <div class="sheetbtns"><button class="xbtn" data-review="close" aria-label="Close">&times;</button></div></div>
    <div class="qlabel">Question</div>
    <textarea class="field" rows="3" data-rq="question" placeholder="Question">${esc(f.question)}</textarea>
    <div class="qlabel good"><span class="okmark">&#10003;</span> Correct answer</div>
    <input class="field correct" data-rq="correct" placeholder="Correct answer" value="${esc(f.correct)}" aria-label="Correct answer">
    <div class="qlabel bad">Wrong answers (three)</div>
    <input class="field wrong" data-rq="d0" placeholder="Wrong answer 1" value="${esc(f.d0)}" aria-label="Wrong answer 1">
    <input class="field wrong" data-rq="d1" placeholder="Wrong answer 2" value="${esc(f.d1)}" aria-label="Wrong answer 2">
    <input class="field wrong" data-rq="d2" placeholder="Wrong answer 3" value="${esc(f.d2)}" aria-label="Wrong answer 3">
    <div class="two"><select class="field" data-rq="topic" aria-label="Topic">${options(TOPICS, f.topic)}</select>
      <select class="field" data-rq="difficulty" aria-label="Difficulty">${options(DIFFS, f.difficulty)}</select></div>
    ${tagsHtml(R)}
    <input class="field" data-rq="sourceName" placeholder="Source (optional): book, site, producer" value="${esc(f.sourceName)}">
    <input class="field" data-rq="sourceUrl" placeholder="Source link (optional)" value="${esc(f.sourceUrl)}">
    <div id="reviewErr" class="err">${esc(R.formError || "")}</div>${buttons}</div></div>`;
}

// ---------------------------------------------------------------- controller
const must = ({ data, error }) => { if (error) throw error; return data; };
async function allRows(makeQuery) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const rows = must(await makeQuery().range(from, from + 999));
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

// ctx: { sb(), userId(), cards(), onChange(), gotoQuiz(questionId) }. The Editor tab owns the screen; this fills a container.
export function createReview(ctx) {
  const R = {
    ctx, loaded: false, error: null, flags: [], questions: [], sources: new Map(), sort: { flags: "newest", feedback: "newest", quiz: "orig" },
    flagFilter: "open", quizFilter: "draft", qq: "", flagError: null,
    feedback: [], feedbackFilter: "new", feedbackError: null, feedbackActionError: null,
    form: null, formError: "", saving: false, view: "flags",
    tags: [], links: new Map(), usage: new Map(), tagsReady: false, tagsError: "", untagged: false,
  };
  let root = null;
  const overlay = () => document.querySelector("#overlay");
  const draw = () => { if (root) root.innerHTML = R.view === "flags" ? flagsHtml(R) : R.view === "feedback" ? feedbackHtml(R) : quizHtml(R); };

  async function load() {
    R.error = null; R.feedbackError = null; R.loaded = false; draw();
    // Feedback is loaded on its own, so a missing feedback table can never stop the flags and the quiz from loading.
    try {
      R.feedback = await allRows(() => ctx.sb().from("app_feedback").select("id, kind, message, screen, app_version, contact_email, status, created_at").order("created_at", { ascending: false }));
    } catch (e) { R.feedbackError = "Could not load feedback: " + (e.message || e) + " (Has the feedback update been run in Supabase?)"; R.feedback = []; }
    try {
      const sb = ctx.sb();
      const [flags, questions, sources] = await Promise.all([
        allRows(() => sb.from("content_flags").select("id, target_type, quiz_question_id, wine_vintage_id, reason, note, status, created_at").order("created_at", { ascending: false })),
        allRows(() => sb.from("quiz_questions").select("id, topic, difficulty, question, correct_answer, distractors, status, source_id").order("created_at", { ascending: true })),
        sb.from("sources").select("id, name, url").then(must),
      ]);
      R.flags = flags; R.questions = questions; R.sources = new Map(sources.map((s) => [s.id, s]));
      R.loaded = true;
    } catch (e) { R.error = "Could not load: " + (e.message || e); }
    // Tags load on their own too: if the tags update has not been run, questions still open and save without them.
    try {
      const { tags, links } = await db.loadQuizTags(ctx.sb());
      R.tags = tags; R.links = new Map(); R.usage = new Map();
      for (const l of links) {
        if (!R.links.has(l.question_id)) R.links.set(l.question_id, new Set());
        R.links.get(l.question_id).add(l.tag_id);
        R.usage.set(l.tag_id, (R.usage.get(l.tag_id) || 0) + 1);
      }
      R.tagsReady = true; R.tagsError = "";
    } catch (e) { R.tagsReady = false; R.tagsError = "Tags need one more database update (docs/quiz_tags.sql). " + (e.message || ""); }
    draw();
    if (ctx.onChange) ctx.onChange();
  }

  async function setFlag(id, to) {
    R.flagError = null;
    try {
      const now = new Date().toISOString();
      must(await ctx.sb().from("content_flags").update({ status: to, resolved_by: to === "open" ? null : ctx.userId(), resolved_at: to === "open" ? null : now }).eq("id", Number(id)));
      const f = R.flags.find((x) => String(x.id) === String(id));
      if (f) f.status = to;
      draw();
      if (ctx.onChange) ctx.onChange();
    } catch (e) { R.flagError = { id: Number(id), message: "Could not update: " + (e.message || e) }; draw(); }
  }

  async function setFeedback(id, to) {
    R.feedbackActionError = null;
    try {
      const now = new Date().toISOString();
      must(await ctx.sb().from("app_feedback").update({ status: to, handled_by: to === "new" ? null : ctx.userId(), handled_at: to === "new" ? null : now }).eq("id", Number(id)));
      const f = R.feedback.find((x) => String(x.id) === String(id));
      if (f) f.status = to;
      draw();
      if (ctx.onChange) ctx.onChange();
    } catch (e) { R.feedbackActionError = { id: Number(id), message: "Could not update: " + (e.message || e) }; draw(); }
  }

  function openQuestion(id) {
    const q = R.questions.find((x) => x.id === id);
    if (!q) return;
    R.form = formFromQuestion(q, R.sources.get(q.source_id));
    R.formError = ""; R.saving = false;
    R.form.tagBefore = [...(R.links.get(q.id) || [])];
    R.form.tagSel = new Set(R.form.tagBefore);
    R.form.tagPulled = new Set();
    R.form.tagSuggest = R.tagsReady ? suggestTags(R.form, R.tags, R.usage).map((t) => t.id) : [];
    overlay().innerHTML = questionSheetHtml(R);
  }
  // Redraws the sheet after a tag change, keeping the scroll place (the typed text is already in R.form).
  function redrawSheet() {
    const o = overlay(), p = document.getElementById("reviewPanel"), top = p ? p.scrollTop : 0;
    if (!o || !R.form) return;
    o.innerHTML = questionSheetHtml(R);
    const n = document.getElementById("reviewPanel"); if (n) n.scrollTop = top;
  }
  function toggleTag(id) {
    const f = R.form; if (!f) return;
    if (f.tagSel.has(id)) { f.tagSel.delete(id); f.tagPulled.delete(id); } else f.tagSel.add(id);
    redrawSheet();
  }
  function pullTag(id) {
    const f = R.form; if (!f || !id || !canPull(f.tagSel, f.tagPulled)) return;
    f.tagSel.add(id); f.tagPulled.add(id); redrawSheet();
  }
  const closeQuestion = () => { R.form = null; const o = overlay(); if (o) o.innerHTML = ""; };
  function syncSheet() {
    const err = document.getElementById("reviewErr");
    if (err) err.textContent = R.formError || "";
    document.querySelectorAll("#reviewPanel [data-review]").forEach((b) => { if (["save", "verify", "draft", "retire"].includes(b.dataset.review)) b.disabled = R.saving; });
  }
  // Finds or creates the source record. Two questions checked against the same source share one row.
  async function ensureSource(name, url) {
    const n = name.trim(), u = (url || "").trim() || null;
    if (!n) return R.form.sourceId || null;
    const found = [...R.sources.values()].find((s) => s.name === n && (s.url || null) === u);
    if (found) return found.id;
    const row = must(await ctx.sb().from("sources").insert({ kind: u ? "website" : "other", name: n, url: u }).select("id, name, url").single());
    R.sources.set(row.id, row);
    return row.id;
  }
  async function saveQuestion(mode) {
    const f = R.form;
    if (!f || R.saving) return;
    const problem = mode === "verify" || mode === "save" ? validateQuestion(f) : "";
    if (problem) { R.formError = problem; syncSheet(); return; }
    R.saving = true; R.formError = ""; syncSheet();
    try {
      const sourceId = await ensureSource(f.sourceName, f.sourceUrl);
      must(await ctx.sb().from("quiz_questions").update(questionPatch(f, mode, ctx.userId(), sourceId, new Date().toISOString())).eq("id", f.id));
      if (R.tagsReady && mode !== "retire") {
        const d = tagDiff(f.tagBefore, f.tagSel);
        if (d.add.length || d.remove.length) await db.saveQuestionTags(ctx.sb(), ctx.userId(), f.id, d.add, d.remove);
      }
      R.saving = false; closeQuestion(); await load();
    } catch (e) { R.saving = false; R.formError = "Could not save: " + (e.message || e); syncSheet(); }
  }

  document.addEventListener("click", (ev) => {
    const t = ev.target.closest("[data-review]");
    if (!t || (!root && !R.form)) return;
    const [action, a, b] = t.dataset.review.split(":");
    if (action === "ff") { R.flagFilter = a; draw(); }
    else if (action === "qf") { R.quizFilter = a; draw(); }
    else if (action === "fbf") { R.feedbackFilter = a; draw(); }
    else if (action === "fb") setFeedback(a, b);
    else if (action === "flag") setFlag(a, b);
    else if (action === "editwine") { if (ctx.editWine) ctx.editWine(a); }
    else if (action === "openq") { if (ctx.gotoQuiz && R.view !== "quiz") ctx.gotoQuiz(a); else openQuestion(a); }
    else if (action === "retry") load();
    else if (action === "tag") toggleTag(a);
    else if (action === "resuggest") { if (R.form) { R.form.tagSuggest = suggestTags(R.form, R.tags, R.usage).map((x) => x.id); redrawSheet(); } }
    else if (action === "untagged") { R.untagged = !R.untagged; draw(); }
    else if (action === "close") closeQuestion();
    else if (["save", "verify", "draft", "retire"].includes(action)) saveQuestion(action);
  });
  document.addEventListener("input", (ev) => {
    const t = ev.target;
    if (!t.dataset) return;
    if (t.dataset.reviewPull !== undefined && R.form) { pullTag(t.value); return; }
    if (t.dataset.rq && R.form) { R.form[t.dataset.rq] = t.value; }
    else if (t.dataset.reviewSort) { R.sort[t.dataset.reviewSort] = t.value; draw(); }
    else if (t.dataset.reviewQ !== undefined) {
      R.qq = t.value;
      draw();   // the search box is redrawn with the list, so put the cursor back
      const box = document.querySelector("[data-review-q]");
      if (box) { box.focus(); box.setSelectionRange(R.qq.length, R.qq.length); }
    }
  });

  return {
    state: R,
    // view is "flags" or "quiz". Reloads each time so new flags show up.
    mount(el, view) { root = el; R.view = view; draw(); load(); },
    openQuestion,
    leave() { root = null; closeQuestion(); },
    get openFlags() { return R.loaded ? R.flags.filter((f) => f.status === "open").length : null; },
    get newFeedback() { return R.loaded && !R.feedbackError ? R.feedback.filter((f) => f.status === "new").length : null; },
  };
}

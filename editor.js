// Editor tab (only shown to editors). Three sections:
//   Structure: set the reference wine structure for each catalog wine (tannin for red styles, CO2 for
//              white, sparkling and rose; oak is unoaked or oaked). It is a baseline, not a "correct answer":
//              rating sliders start from it, and the palate compares each person's own ratings against it.
//              The rules (rules.js) suggest a starting point for every wine. 25 "gold set" wines are scored blind,
//              without suggestions, and the Rule test compares those scores with what the rules say.
//   Flags:     review what testers reported on quiz questions and wines.
//   Quiz:      edit, source and verify quiz questions.
//   Feedback:  read what testers sent from the app and mark it handled.
// Every change is logged by the database.
import { dimsFor, defaultFor, esc, wineName, nudgeStep, editorList, hasFullProfile, refsByVintage, clampDimValue, isChoice, choiceLabel } from "./logic.js?v=5";
import * as db from "./data.js?v=5";
import { marksHtml, dimControlHtml } from "./views.js?v=5";
import { createReview } from "./review.js?v=2";
import { suggestStructure, values as ruleValues, goldInfo, GOLD, evaluateRules, reportText, TARGETS, RULES_VERSION } from "./rules.js?v=1";

const SECTIONS = [{ id: "structure", label: "Structure" }, { id: "flags", label: "Flags" }, { id: "quiz", label: "Quiz" }, { id: "feedback", label: "Feedback" }];

const SCALE_GUIDE = `<details class="scaleguide"><summary>How to score (anchor wines)</summary>
  <p><b>Acidity:</b> 1 soft and round, 3 balanced, 5 sharp and mouth-watering (Mosel Riesling, Muscadet).</p>
  <p><b>Body:</b> 1 light and delicate (Pinot Grigio, Beaujolais), 3 medium (Merlot, Chardonnay), 5 full and heavy (Amarone, Barossa Shiraz).</p>
  <p><b>Tannin:</b> 1 almost none (Beaujolais), 3 medium (Merlot), 5 very grippy (young Barolo, Tannat).</p>
  <p><b>Sweetness:</b> 1 bone dry, 2 a hint of sweetness, 3 medium sweet (Spätlese), 5 dessert (Sauternes).</p>
  <p><b>Oak:</b> Oaked if you can notice oak influence (vanilla, toast, spice), otherwise Unoaked.</p>
  <p><b>CO\u2082:</b> None for still, Frizzy for a light spritz, Sparkling for full bubbles.</p></details>`;
const CONF_DOTS = { high: "\u25CF\u25CF\u25CF", medium: "\u25CF\u25CF\u25CB", low: "\u25CF\u25CB\u25CB" };
// What the rules said for one dimension, shown under its control.
function ruleNote(d, x) {
  if (!x) return "";
  const shown = isChoice(d) ? choiceLabel(d, x.value) : x.value;
  return `<div class="rulenote"><span class="conf" title="${x.confidence} confidence">${CONF_DOTS[x.confidence]}</span> Rules suggest <b>${esc(String(shown))}</b>. ${esc(x.why.join("; "))}</div>`;
}
function sheetHtml(E) {
  const s = E.sheet;
  const wrap = (d) => `<div class="dimwrap">${dimControlHtml(d, { value: s.values[d.key], adjusted: true }, { attr: "data-editor", slider: "data-edim", reset: false })}${s.mode === "suggest" || s.mode === "saved" ? ruleNote(d, s.suggestion && s.suggestion.dims[d.key]) : ""}</div>`;
  const dims = dimsFor(s.style).map(wrap).join("");
  const banner = s.mode === "blind"
    ? `<div class="goldbanner"><b>Gold set wine.</b> Score it from your own knowledge. The rules\' suggestion is hidden so it cannot influence you. It is compared with your scores in the Rule test.</div>`
    : s.mode === "gold-saved"
      ? `<div class="goldbanner"><b>Gold set wine.</b> Your scores are saved. The rules\' suggestion stays hidden here. See the Rule test for the comparison. Changing a score now changes the test.</div>`
      : s.mode === "suggest"
        ? `<div class="rulebanner"><b>Suggested by the rules.</b> These are starting points, not facts. Check each one against what you know, change what is wrong, then save to confirm.</div>`
        : "";
  return `<div class="overlay"><div class="sheet" id="editorPanel">
    <div class="sheethead"><div class="sheettitle"><div class="serif big">${esc(s.name)}</div><div class="muted small">Reference structure for a ${esc(s.style === "unknown" ? "wine of unknown style" : s.style + " wine")}. A baseline, not a correct answer.</div></div>
      <div class="sheetbtns"><button class="pill wine" data-editor="save"${E.saving ? " disabled" : ""}>Save</button><button class="xbtn" data-editor="close" aria-label="Close">&times;</button></div></div>
    ${banner}${dims}${SCALE_GUIDE}<div id="editorErr" class="err">${esc(E.error || "")}</div>
    <button class="btn primary" data-editor="save"${E.saving ? " disabled" : ""}>Save reference</button></div></div>`;
}

const fmtDim = (d, v) => (typeof v !== "number" ? "-" : isChoice(d) ? choiceLabel(d, v) : String(v));
// Gold set wines that an editor has scored, paired with what the rules suggest for them.
export function scoredGold(E) {
  const rows = [];
  for (const c of E.cards) {
    const g = goldInfo(c);
    const ref = E.refs.get(c.id);
    if (!g || !hasFullProfile(ref, c.style)) continue;
    rows.push({ id: c.id, name: wineName(c), group: g.group, style: c.style, editor: ref, rules: ruleValues(suggestStructure(c)) });
  }
  return rows;
}
function ruleTestCard(E) {
  const rows = scoredGold(E);
  return `<div class="pcard"><div class="ptitle">Rule test</div>
    <p class="ptext">${rows.length} of ${GOLD.length} gold set wines scored. Score them without looking at any suggestion, then see how close the rules came.</p>
    <button class="btn outline slim" data-editor="ruletest"${rows.length ? "" : " disabled"}>See results</button></div>`;
}
function listHtml(E) {
  if (E.loadError) return `<div class="err">${esc(E.loadError)}</div><button class="btn outline" data-editor="retry">Try again</button>`;
  if (!E.loaded) return `<p class="muted">Loading the catalog…</p>`;
  const done = E.cards.filter((c) => hasFullProfile(E.refs.get(c.id), c.style)).length;
  let list = editorList(E.cards, E.refs, { q: E.q, filter: E.filter === "gold" ? "all" : E.filter });
  if (E.filter === "gold") list = list.filter((c) => goldInfo(c));
  const rows = list.map((c) => {
    const has = hasFullProfile(E.refs.get(c.id), c.style);
    const gold = goldInfo(c);
    return `<button class="jrow" data-editor="open:${c.id}"><span class="jl"><span class="iname"><span class="serif trunc">${esc(wineName(c))}</span>${marksHtml(c, 16)}</span>
      <span class="meta trunc">${gold ? '<span class="goldtag">Gold set</span> ' : ""}${esc([c.appellation || c.grape, c.country].filter(Boolean).join(", "))}</span></span>
      <span class="pill${has ? "" : " dark"}">${has ? "Edit" : "Set"}</span></button>`;
  }).join("");
  const empty = E.filter === "needs" ? "Every wine has a profile." : "No wines match.";
  return `${ruleTestCard(E)}<div class="jmeta"><span>${done} of ${E.cards.length} wines have a profile</span></div>${rows || `<p class="muted">${empty}</p>`}`;
}

// The Rule test screen: how close the rules came to what editors scored on the gold set.
function testHtml(E) {
  const rows = scoredGold(E);
  const all = evaluateRules(rows);
  const verdictClass = (v) => (v === "good" ? "vgood" : v === "ok" ? "vok" : "vbad");
  const groupBlock = (g, title, note) => {
    const sub = rows.filter((r) => r.group === g);
    if (!sub.length) return `<div class="pcard"><div class="ptitle">${title}</div><p class="muted small">No wines scored in this group yet.</p></div>`;
    const res = evaluateRules(sub);
    const lines = Object.entries(res).map(([k, r]) => {
      const d = dimsFor(r.kind === "choice" ? "white" : "red").find((x) => x.key === k) || { name: k };
      const name = k === "co2" ? "CO\u2082" : k.charAt(0).toUpperCase() + k.slice(1);
      return r.kind === "scale"
        ? `<div class="kv"><span>${name}</span><span><span class="${verdictClass(r.verdict)}">${r.verdict}</span> &nbsp; avg error ${r.mae.toFixed(2)}, within 0.5: ${Math.round(r.within05 * 100)}%</span></div>`
        : `<div class="kv"><span>${name}</span><span><span class="${verdictClass(r.verdict)}">${r.verdict}</span> &nbsp; ${r.right} of ${r.n} exactly right</span></div>`;
    }).join("");
    return `<div class="pcard"><div class="ptitle">${title} (${sub.length} wines)</div><p class="muted small">${note}</p>${lines}</div>`;
  };
  const wineCards = rows.map((r) => {
    const dims = dimsFor(r.style).map((d) => {
      const e = r.editor[d.key], x = r.rules[d.key];
      const off = isChoice(d) ? e !== x : Math.abs(e - x) >= 1;
      return `<div class="cmp${off ? " off" : ""}"><span>${d.name}</span><span>${esc(fmtDim(d, e))} / ${esc(fmtDim(d, x))}</span></div>`;
    }).join("");
    return `<div class="pcard"><div class="small muted">${r.group === "tune" ? "Tuning group" : "Held-back group"}</div><div class="serif" style="font-size:16px">${esc(r.name)}</div>
      <div class="muted tiny">You / rules. Highlighted when they differ by a point or more.</div><div class="cmpgrid">${dims}</div></div>`;
  }).join("");
  const text = reportText(all, rows);
  return `<div class="overlay"><div class="sheet" id="testPanel">
    <div class="sheethead"><div class="sheettitle"><div class="serif big">Rule test</div><div class="muted small">Rules version ${esc(RULES_VERSION)}. ${rows.length} of ${GOLD.length} gold wines scored.</div></div>
      <div class="sheetbtns"><button class="xbtn" data-editor="testclose" aria-label="Close">&times;</button></div></div>
    <p class="muted small">Targets: average error of 0.6 or less on the sliders is good, 0.8 is ok. For oak and CO\u2082, 85% exactly right is good, 70% is ok.${rows.length < GOLD.length ? " Results are rough until all " + GOLD.length + " are scored." : ""}</p>
    ${groupBlock("tune", "Tuning group", "The rules may be adjusted using these wines.")}
    ${groupBlock("holdout", "Held-back group", "Kept aside, never used for adjusting. This is the honest check.")}
    <div class="pcard"><div class="ptitle">Share these results</div><textarea class="field" rows="6" readonly id="testText">${esc(text)}</textarea>
      <button class="btn outline slim" data-editor="copytest">Copy results</button></div>
    <h3 class="psub">Wine by wine</h3>${wineCards}</div></div>`;
}

// ctx: { sb(), userId(), cards(), onSaved() }
export function createEditor(ctx) {
  const E = { section: "structure", loaded: false, loadError: null, cards: [], refs: new Map(), rows: [], vintageToWine: new Map(), q: "", filter: "needs", sheet: null, saving: false, error: "" };
  let root = null;
  const overlay = () => document.querySelector("#overlay");
  const review = createReview({
    sb: ctx.sb, userId: ctx.userId, cards: ctx.cards,
    onChange: () => {
      const f = document.querySelector("[data-editor='sec:flags']"); if (f) f.textContent = flagsLabel();
      const k = document.querySelector("[data-editor='sec:feedback']"); if (k) k.textContent = feedbackLabel();
    },
    // "Open question" on a flag: switch to the Quiz section and open that question once it has loaded.
    gotoQuiz: (id) => { review.leave(); E.section = "quiz"; draw(); const wait = setInterval(() => { if (review.state.loaded) { clearInterval(wait); review.openQuestion(id); } }, 50); setTimeout(() => clearInterval(wait), 5000); },
  });
  const flagsLabel = () => { const n = review.openFlags; return n ? `Flags (${n})` : "Flags"; };
  const feedbackLabel = () => { const n = review.newFeedback; return n ? `Feedback (${n})` : "Feedback"; };

  const chips = () => `<div class="chips left">${SECTIONS.map((x) => `<button class="chip wide${E.section === x.id ? " on" : ""}" data-editor="sec:${x.id}">${x.id === "flags" ? flagsLabel() : x.id === "feedback" ? feedbackLabel() : x.label}</button>`).join("")}</div>`;
  const structureShell = () => `<div class="jbar"><input class="field" data-editor-q placeholder="Search wines" value="${esc(E.q)}" autocomplete="off">
      <div class="chips left"><button class="chip wide${E.filter === "needs" ? " on" : ""}" data-editor="filter:needs">Needs a profile</button><button class="chip wide${E.filter === "all" ? " on" : ""}" data-editor="filter:all">All wines</button><button class="chip wide${E.filter === "gold" ? " on" : ""}" data-editor="filter:gold">Gold set</button></div></div>
    <div id="editorList"></div>`;
  const drawList = () => { const el = document.querySelector("#editorList"); if (el) el.innerHTML = listHtml(E); };
  function draw() {
    if (!root) return;
    root.innerHTML = `${chips()}<div id="editorSection" style="margin-top:10px"></div>`;
    const sec = document.querySelector("#editorSection");
    if (E.section === "structure") { sec.innerHTML = structureShell(); if (!E.loaded) load(); else { E.cards = ctx.cards(); drawList(); } }
    else review.mount(sec, E.section);
  }

  async function load() {
    E.loadError = null; E.loaded = false; drawList();
    try {
      const [vintageToWine, rows] = await Promise.all([db.loadVintageWines(ctx.sb()), db.loadReferenceRows(ctx.sb())]);
      E.cards = ctx.cards(); E.rows = rows; E.vintageToWine = vintageToWine;
      E.refs = refsByVintage(vintageToWine, rows);
      E.loaded = true;
    } catch (e) { E.loadError = "Could not load the catalog: " + (e.message || e); }
    drawList();
  }
  function syncSheet() {
    const s = E.sheet;
    if (!s) return;
    dimsFor(s.style).forEach((d) => {
      if (isChoice(d)) {
        document.querySelectorAll(`[data-editor^="choice:${d.key}:"]`).forEach((b) => {
          const on = Number(b.dataset.editor.split(":")[2]) === s.values[d.key];
          b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on));
        });
      } else {
        const r = document.querySelector(`[data-edim="${d.key}"]`);
        if (r && Number(r.value) !== s.values[d.key]) r.value = s.values[d.key];
      }
    });
    document.querySelectorAll("[data-editor='save']").forEach((b) => { b.disabled = E.saving; });
    const err = document.getElementById("editorErr");
    if (err) err.textContent = E.error || "";
  }
  async function save() {
    const s = E.sheet;
    if (!s || E.saving) return;
    E.saving = true; E.error = ""; syncSheet();
    try {
      await db.saveReferences(ctx.sb(), ctx.userId(), s.wineId, s.values, E.rows);
      await load();
      if (ctx.onSaved) await ctx.onSaved();   // the app reloads its copy so rating sliders use the new values right away
      E.saving = false; E.sheet = null; overlay().innerHTML = "";
    } catch (e) {
      E.saving = false; E.error = "Could not save: " + (e.message || e); syncSheet();
    }
  }

  document.addEventListener("click", (ev) => {
    const t = ev.target.closest("[data-editor]");
    if (!t || (!root && !E.sheet && !document.getElementById("testPanel"))) return;
    const [action, a, b] = t.dataset.editor.split(":");
    if (action === "sec") { if (E.section !== a) { review.leave(); E.sheet = null; overlay().innerHTML = ""; E.section = a; draw(); } }
    else if (action === "filter") { E.filter = a; draw(); }
    else if (action === "retry") load();
    else if (action === "open") {
      const card = E.cards.find((c) => c.id === a);
      const cur = E.refs.get(a) || {};
      const hasRef = hasFullProfile(cur, card.style);
      const gold = goldInfo(card);
      const suggestion = gold ? null : suggestStructure(card);   // gold set wines never show a suggestion, so scoring stays blind
      const startFor = (d) => (typeof cur[d.key] === "number" ? clampDimValue(d, cur[d.key]) : suggestion ? clampDimValue(d, suggestion.dims[d.key].value) : defaultFor(d, card.style));
      E.sheet = {
        vintageId: a, wineId: E.vintageToWine.get(a), name: wineName(card), style: card.style, suggestion,
        mode: gold ? (hasRef ? "gold-saved" : "blind") : hasRef ? "saved" : "suggest",
        values: Object.fromEntries(dimsFor(card.style).map((d) => [d.key, startFor(d)])),
      };
      E.error = ""; overlay().innerHTML = sheetHtml(E);
    }
    else if (action === "nudge") { E.sheet.values[a] = nudgeStep(E.sheet.values[a], Number(b)); syncSheet(); }
    else if (action === "choice") { E.sheet.values[a] = Number(b); syncSheet(); }
    else if (action === "save") save();
    else if (action === "close") { E.sheet = null; overlay().innerHTML = ""; }
    else if (action === "ruletest") overlay().innerHTML = testHtml(E);
    else if (action === "testclose") overlay().innerHTML = "";
    else if (action === "copytest") {
      const box = document.getElementById("testText");
      if (!box) return;
      const done = () => { t.textContent = "Copied"; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(box.value).then(done, () => { box.select(); t.textContent = "Selected: copy it"; });
      else { box.select(); t.textContent = "Selected: copy it"; }
    }
  });
  document.addEventListener("input", (ev) => {
    const t = ev.target;
    if (t.dataset && t.dataset.edim && E.sheet) { E.sheet.values[t.dataset.edim] = nudgeStep(Number(t.value), 0); syncSheet(); }
    else if (t.dataset && t.dataset.editorQ !== undefined) { E.q = t.value; drawList(); }
  });

  return {
    state: E, review,
    mount(el) { root = el; draw(); },
    leave() { root = null; review.leave(); E.sheet = null; const o = overlay(); if (o) o.innerHTML = ""; },
  };
}

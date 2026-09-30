// Editor tab (only shown to editors). Three sections:
//   Structure: set the reference wine structure for each catalog wine (tannin for red styles, CO2 for
//              white, sparkling and rose; oak is unoaked or oaked). It is a baseline, not a "correct answer":
//              rating sliders start from it, and the palate compares each person's own ratings against it.
//   Flags:     review what testers reported on quiz questions and wines.
//   Quiz:      edit, source and verify quiz questions.
// Every change is logged by the database.
import { dimsFor, defaultFor, esc, wineName, nudgeStep, editorList, hasFullProfile, refsByVintage, clampDimValue, isChoice } from "./logic.js?v=5";
import * as db from "./data.js?v=5";
import { marksHtml, dimControlHtml } from "./views.js?v=5";
import { createReview } from "./review.js?v=1";

const SECTIONS = [{ id: "structure", label: "Structure" }, { id: "flags", label: "Flags" }, { id: "quiz", label: "Quiz" }];

function sheetHtml(E) {
  const s = E.sheet;
  const dims = dimsFor(s.style).map((d) => dimControlHtml(d, { value: s.values[d.key], adjusted: true }, { attr: "data-editor", slider: "data-edim", reset: false })).join("");
  return `<div class="overlay"><div class="sheet" id="editorPanel">
    <div class="sheethead"><div class="sheettitle"><div class="serif big">${esc(s.name)}</div><div class="muted small">Reference structure for a ${esc(s.style === "unknown" ? "wine of unknown style" : s.style + " wine")}. A baseline, not a correct answer.</div></div>
      <div class="sheetbtns"><button class="pill wine" data-editor="save"${E.saving ? " disabled" : ""}>Save</button><button class="xbtn" data-editor="close" aria-label="Close">&times;</button></div></div>
    ${dims}<div id="editorErr" class="err">${esc(E.error || "")}</div>
    <button class="btn primary" data-editor="save"${E.saving ? " disabled" : ""}>Save reference</button></div></div>`;
}

function listHtml(E) {
  if (E.loadError) return `<div class="err">${esc(E.loadError)}</div><button class="btn outline" data-editor="retry">Try again</button>`;
  if (!E.loaded) return `<p class="muted">Loading the catalog…</p>`;
  const done = E.cards.filter((c) => hasFullProfile(E.refs.get(c.id), c.style)).length;
  const list = editorList(E.cards, E.refs, { q: E.q, filter: E.filter });
  const rows = list.map((c) => {
    const has = hasFullProfile(E.refs.get(c.id), c.style);
    return `<button class="jrow" data-editor="open:${c.id}"><span class="jl"><span class="iname"><span class="serif trunc">${esc(wineName(c))}</span>${marksHtml(c, 16)}</span>
      <span class="meta trunc">${esc([c.appellation || c.grape, c.country].filter(Boolean).join(", "))}</span></span>
      <span class="pill${has ? "" : " dark"}">${has ? "Edit" : "Set"}</span></button>`;
  }).join("");
  return `<div class="jmeta"><span>${done} of ${E.cards.length} wines have a profile</span></div>
    ${rows || `<p class="muted">${E.filter === "needs" ? "Every wine has a profile." : "No wines match."}</p>`}`;
}

// ctx: { sb(), userId(), cards(), onSaved() }
export function createEditor(ctx) {
  const E = { section: "structure", loaded: false, loadError: null, cards: [], refs: new Map(), rows: [], vintageToWine: new Map(), q: "", filter: "needs", sheet: null, saving: false, error: "" };
  let root = null;
  const overlay = () => document.querySelector("#overlay");
  const review = createReview({
    sb: ctx.sb, userId: ctx.userId, cards: ctx.cards,
    onChange: () => { const b = document.querySelector("[data-editor='sec:flags']"); if (b) b.textContent = flagsLabel(); },
    // "Open question" on a flag: switch to the Quiz section and open that question once it has loaded.
    gotoQuiz: (id) => { review.leave(); E.section = "quiz"; draw(); const wait = setInterval(() => { if (review.state.loaded) { clearInterval(wait); review.openQuestion(id); } }, 50); setTimeout(() => clearInterval(wait), 5000); },
  });
  const flagsLabel = () => { const n = review.openFlags; return n ? `Flags (${n})` : "Flags"; };

  const chips = () => `<div class="chips left">${SECTIONS.map((x) => `<button class="chip wide${E.section === x.id ? " on" : ""}" data-editor="sec:${x.id}">${x.id === "flags" ? flagsLabel() : x.label}</button>`).join("")}</div>`;
  const structureShell = () => `<div class="jbar"><input class="field" data-editor-q placeholder="Search wines" value="${esc(E.q)}" autocomplete="off">
      <div class="chips left"><button class="chip wide${E.filter === "needs" ? " on" : ""}" data-editor="filter:needs">Needs a profile</button><button class="chip wide${E.filter === "all" ? " on" : ""}" data-editor="filter:all">All wines</button></div></div>
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
    if (!t || (!root && !E.sheet)) return;
    const [action, a, b] = t.dataset.editor.split(":");
    if (action === "sec") { if (E.section !== a) { review.leave(); E.sheet = null; overlay().innerHTML = ""; E.section = a; draw(); } }
    else if (action === "filter") { E.filter = a; draw(); }
    else if (action === "retry") load();
    else if (action === "open") {
      const card = E.cards.find((c) => c.id === a);
      const cur = E.refs.get(a) || {};
      E.sheet = {
        vintageId: a, wineId: E.vintageToWine.get(a), name: wineName(card), style: card.style,
        values: Object.fromEntries(dimsFor(card.style).map((d) => [d.key, typeof cur[d.key] === "number" ? clampDimValue(d, cur[d.key]) : defaultFor(d, card.style)])),
      };
      E.error = ""; overlay().innerHTML = sheetHtml(E);
    }
    else if (action === "nudge") { E.sheet.values[a] = nudgeStep(E.sheet.values[a], Number(b)); syncSheet(); }
    else if (action === "choice") { E.sheet.values[a] = Number(b); syncSheet(); }
    else if (action === "save") save();
    else if (action === "close") { E.sheet = null; overlay().innerHTML = ""; }
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

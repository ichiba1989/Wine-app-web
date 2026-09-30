// Editor tab (only shown to editors): set the reference structure profile for each catalog wine.
// The reference is a baseline, not a “correct answer”. Rating sliders start from it, and it is
// what the palate compares each person’s own ratings against. Every change is logged by the database.
import { DIMS, esc, wineName, nudgeStep, editorList, hasFullProfile, refsByVintage } from “./logic.js?v=4”;
import * as db from “./data.js?v=4”;
import { marksHtml } from “./views.js?v=4”;

const must = ({ data, error }) => { if (error) throw error; return data; };

function sheetHtml(E) {
const s = E.sheet;
const dims = DIMS.map((d) => `<div class="dim"><div class="dimtop"><span>${d.name}</span></div> <div class="dimrow"><button class="round" data-editor="nudge:${d.key}:-0.5" aria-label="Less ${d.name.toLowerCase()}">&minus;</button> <input type="range" min="1" max="5" step="0.1" value="${s.values[d.key]}" data-edim="${d.key}" aria-label="${d.name}, from ${d.lo} to ${d.hi}"> <button class="round" data-editor="nudge:${d.key}:0.5" aria-label="More ${d.name.toLowerCase()}">+</button></div> <div class="dimlabels"><span>${d.lo}</span><span>${d.hi}</span></div></div>`).join(””);
return `<div class="overlay"><div class="sheet" id="editorPanel"> <div class="sheethead"><div class="sheettitle"><div class="serif big">${esc(s.name)}</div><div class="muted small">Reference structure. A baseline, not a correct answer.</div></div> <div class="sheetbtns"><button class="pill wine" data-editor="save"${E.saving ? " disabled" : ""}>Save</button><button class="xbtn" data-editor="close" aria-label="Close">&times;</button></div></div> ${dims}<div id="editorErr" class="err">${esc(E.error || "")}</div> <button class="btn primary" data-editor="save"${E.saving ? " disabled" : ""}>Save reference</button></div></div>`;
}

function listHtml(E) {
if (E.loadError) return `<div class="err">${esc(E.loadError)}</div><button class="btn outline" data-editor="retry">Try again</button>`;
if (!E.loaded) return `<p class="muted">Loading the catalog…</p>`;
const done = E.cards.filter((c) => hasFullProfile(E.refs.get(c.id))).length;
const list = editorList(E.cards, E.refs, { q: E.q, filter: E.filter });
const rows = list.map((c) => {
const has = hasFullProfile(E.refs.get(c.id));
return `<button class="jrow" data-editor="open:${c.id}"><span class="jl"><span class="iname"><span class="serif trunc">${esc(wineName(c))}</span>${marksHtml(c, 16)}</span> <span class="meta trunc">${esc([c.appellation || c.grape, c.country].filter(Boolean).join(", "))}</span></span> <span class="pill${has ? "" : " dark"}">${has ? "Edit" : "Set"}</span></button>`;
}).join(””);
return `<div class="jmeta"><span>${done} of ${E.cards.length} wines have a profile</span></div> ${rows || `<p class="muted">${E.filter === “needs” ? “Every wine has a profile.” : “No wines match.”}</p>`}`;
}

// ctx: { sb(), userId(), cards() }
export function createEditor(ctx) {
const E = { loaded: false, loadError: null, cards: [], refs: new Map(), rows: [], vintageToWine: new Map(), q: “”, filter: “needs”, sheet: null, saving: false, error: “” };
let root = null;
const overlay = () => document.querySelector(”#overlay”);
const shell = () => `<div class="jbar"><input class="field" data-editor-q placeholder="Search wines" value="${esc(E.q)}" autocomplete="off"> <div class="chips left"><button class="chip wide${E.filter === "needs" ? " on" : ""}" data-editor="filter:needs">Needs a profile</button><button class="chip wide${E.filter === "all" ? " on" : ""}" data-editor="filter:all">All wines</button></div></div> <div id="editorList"></div>`;
const drawList = () => { const el = document.querySelector(”#editorList”); if (el) el.innerHTML = listHtml(E); };
const draw = () => { if (root) { root.innerHTML = shell(); drawList(); } };

async function load() {
E.loadError = null; E.loaded = false; drawList();
try {
const [vintageToWine, rows] = await Promise.all([db.loadVintageWines(ctx.sb()), db.loadReferenceRows(ctx.sb())]);
E.cards = ctx.cards(); E.rows = rows; E.vintageToWine = vintageToWine;
E.refs = refsByVintage(vintageToWine, rows);
E.loaded = true;
} catch (e) { E.loadError = “Could not load the catalog: “ + (e.message || e); }
drawList();
}
function syncSheet() {
const s = E.sheet;
if (!s) return;
DIMS.forEach((d) => { const r = document.querySelector(`[data-edim="${d.key}"]`); if (r && Number(r.value) !== s.values[d.key]) r.value = s.values[d.key]; });
document.querySelectorAll(”[data-editor=‘save’]”).forEach((b) => { b.disabled = E.saving; });
const err = document.getElementById(“editorErr”);
if (err) err.textContent = E.error || “”;
}
async function save() {
const s = E.sheet;
if (!s || E.saving) return;
E.saving = true; E.error = “”; syncSheet();
try {
await db.saveReferences(ctx.sb(), ctx.userId(), s.wineId, s.values, E.rows);
await load();
E.saving = false; E.sheet = null; overlay().innerHTML = “”;
} catch (e) {
E.saving = false; E.error = “Could not save: “ + (e.message || e); syncSheet();
}
}

document.addEventListener(“click”, (ev) => {
const t = ev.target.closest(”[data-editor]”);
if (!t || (!root && !E.sheet)) return;
const [action, a, b] = t.dataset.editor.split(”:”);
if (action === “filter”) { E.filter = a; draw(); }
else if (action === “retry”) load();
else if (action === “open”) {
const card = E.cards.find((c) => c.id === a);
const cur = E.refs.get(a) || {};
E.sheet = { vintageId: a, wineId: E.vintageToWine.get(a), name: wineName(card), values: Object.fromEntries(DIMS.map((d) => [d.key, typeof cur[d.key] === “number” ? cur[d.key] : 3])) };
E.error = “”; overlay().innerHTML = sheetHtml(E);
}
else if (action === “nudge”) { E.sheet.values[a] = nudgeStep(E.sheet.values[a], Number(b)); syncSheet(); }
else if (action === “save”) save();
else if (action === “close”) { E.sheet = null; overlay().innerHTML = “”; }
});
document.addEventListener(“input”, (ev) => {
const t = ev.target;
if (t.dataset && t.dataset.edim && E.sheet) { E.sheet.values[t.dataset.edim] = nudgeStep(Number(t.value), 0); syncSheet(); }
else if (t.dataset && t.dataset.editorQ !== undefined) { E.q = t.value; drawList(); }
});

return {
state: E,
mount(el) { root = el; draw(); if (!E.loaded) load(); else { E.cards = ctx.cards(); drawList(); } },
leave() { root = null; E.sheet = null; const o = overlay(); if (o) o.innerHTML = “”; },
};
}

// "How did it taste?": the conversational way to rate structure. Players do not see the structure sliders. They tap a word
// (Sour, Fresh, Smooth, Juicy, Sweet) and answer a few everyday questions ("Did your mouth water?"). The answers are turned into the
// acidity, body, tannin, sweetness and oak ratings of that bottle, which are private to the player and feed only their palate profile.
// Professionals keep the sliders and the tasting grid; for them the words are a shortcut that moves the sliders.
//   Sour    acidity clearly above the body (high-ish); tannin one step above the body.
//   Fresh   acidity a notch above the body (medium or medium plus); tannin level with the body.
//   Smooth  acidity, body and tannin in balance.
//   Juicy   acidity a step below the body; tannin level with the body.
//   Sweet   acidity and tannin a step below the anchor, the body a step above it, with new oak.
// The anchor is the wine's own starting level (the average of its starting acidity, body and tannin), so the same word means the same
// relationship for a light wine and for a big one. A question answer overrides the word for the one line it asks about.
// The rules at the top are pure (no browser, no network). loadTaste and saveTaste at the bottom talk to Supabase.
import { dimsFor, dimMeta, clampDimValue, WINE_STYLES, esc } from "./logic.js?v=10";

export const FEELS = [
  { id: "sour", label: "Sour", says: "Clearly more acidity than body, and a touch more tannin." },
  { id: "fresh", label: "Fresh", says: "Bright, lively acidity, a little above the body." },
  { id: "smooth", label: "Smooth", says: "Acidity, body and tannin in balance." },
  { id: "juicy", label: "Juicy", says: "Soft acidity, with tannin and body in step." },
  { id: "sweet", label: "Sweet", says: "Soft acidity and tannin, a fuller body, and some new oak." },
];
export const FEEL_KEYS = ["acidity", "body", "tannin", "oak"];             // the lines a word can move
export const SNAP_KEYS = ["acidity", "body", "tannin", "oak", "sweetness"]; // every line this screen can move (a question can move sweetness)

// Everyday questions, each about one line of structure. Three answers are 1.5, 3 and 4.5 on the 1 to 5 scale (not the extremes, which
// people rarely mean); sweetness and oak use the app's own steps.
export const QUESTIONS = [
  { id: "water", page: 1, dim: "acidity", text: "Did your mouth water?", options: [{ label: "Not really", value: 1.5 }, { label: "A bit", value: 3 }, { label: "Yes, a lot", value: 4.5 }] },
  { id: "dry", page: 1, dim: "tannin", text: "Did it dry out your gums or tongue?", options: [{ label: "No", value: 1.5 }, { label: "A little", value: 3 }, { label: "Quite a lot", value: 4.5 }] },
  { id: "weight", page: 1, dim: "body", text: "How did it feel in your mouth?", options: [{ label: "Light, like water", value: 1.5 }, { label: "Medium, like milk", value: 3 }, { label: "Rich, like cream", value: 4.5 }] },
  { id: "sweet", page: 2, dim: "sweetness", text: "Did it taste sweet?", options: [{ label: "Dry", value: 0 }, { label: "A hint", value: 1 }, { label: "Sweet", value: 2 }, { label: "Dessert-sweet", value: 3 }] },
  { id: "oak", page: 2, dim: "oak", text: "Did you taste vanilla, toast or smoke?", options: [{ label: "No", value: 0 }, { label: "A little", value: 1 }, { label: "Yes, clearly", value: 2 }] },
];
export const questionsFor = (style, page) => QUESTIONS.filter((q) => (!page || q.page === page) && dimsFor(style).some((d) => d.key === q.dim));

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const level = (v) => clamp(Math.round(v), 1, 5);

// defaults: the sheet's starting values, { acidity, body, tannin }. Returns the values to set (only for lines this type of wine has).
export function feelDims(feelId, defaults, style) {
  const has = (k) => dimsFor(style).some((d) => d.key === k);
  const known = ["acidity", "body", "tannin"].filter((k) => has(k) && Number.isFinite(defaults && defaults[k])).map((k) => defaults[k]);
  const B = level(known.length ? known.reduce((a, b) => a + b, 0) / known.length : 3);
  let a = B, b = B, t = B, oak = null;
  switch (feelId) {
    case "smooth": break;
    case "fresh": a = clamp(B + 1, 3, 4); b = Math.min(B, a - 1); t = b; break;
    case "sour": a = clamp(B + 2, 4, 5); b = Math.min(B, a - 1); t = b + 1; break;
    case "juicy": a = B - 1; break;
    case "sweet": a = B - 1; t = B - 1; b = B + 1; oak = 2; break;
    default: return {};
  }
  const out = {};
  if (has("acidity")) out.acidity = level(a);
  if (has("body")) out.body = level(b);
  if (has("tannin")) out.tannin = level(t);
  if (oak != null && has("oak")) out.oak = oak;
  return out;
}

const snap = (dims) => Object.fromEntries(SNAP_KEYS.filter((k) => dims[k]).map((k) => [k, { ...dims[k] }]));
// The sheet's lines as they would be for this word and these answers, worked out from the snapshot (the lines before any tap),
// so choosing a different word never stacks on the last one.
function build(sheet, snapshot, word, answers) {
  const dims = { ...sheet.dims };
  Object.entries(snapshot).forEach(([k, v]) => { dims[k] = { ...v }; });
  const set = (k, value) => { if (dims[k]) dims[k] = { ...dims[k], value: clampDimValue(dimMeta(k), value), adjusted: true }; };
  if (word) {
    const defaults = {}; ["acidity", "body", "tannin"].forEach((k) => { if (snapshot[k]) defaults[k] = snapshot[k].def; });
    Object.entries(feelDims(word, defaults, sheet.style)).forEach(([k, v]) => set(k, v));
  }
  Object.entries(answers).forEach(([qid, idx]) => {
    const q = QUESTIONS.find((x) => x.id === qid);
    if (q && q.options[idx] && dimsFor(sheet.style).some((d) => d.key === q.dim)) set(q.dim, q.options[idx].value);
  });
  return dims;
}
// change: { word: "sour" } or { answer: ["water", 2] }. Choosing the same thing again takes it back.
// Returns { dims, taste }; taste is null when nothing is chosen any more (and the lines are back as they were).
export function applyTaste(sheet, change) {
  const cur = sheet.taste || null;
  const snapshot = cur && cur.snapshot ? cur.snapshot : snap(sheet.dims);
  let word = cur ? cur.word : null, answers = cur ? { ...cur.answers } : {};
  if (change && "word" in change) word = word === change.word ? null : change.word;
  if (change && change.answer) { const [qid, idx] = change.answer; if (answers[qid] === idx) delete answers[qid]; else answers[qid] = idx; }
  const dims = build(sheet, snapshot, word, answers);
  const empty = !word && Object.keys(answers).length === 0;
  return { dims, taste: empty ? null : { word, answers, snapshot } };
}
// Answers that no longer apply (the wine became a white, so there is no tannin question) are dropped when the type changes.
export function cleanTaste(taste, style) {
  if (!taste) return null;
  const answers = {};
  Object.entries(taste.answers || {}).forEach(([qid, idx]) => { if (questionsFor(style).some((q) => q.id === qid)) answers[qid] = idx; });
  const word = FEELS.some((f) => f.id === taste.word) ? taste.word : null;
  return word || Object.keys(answers).length ? { word, answers, snapshot: taste.snapshot || null } : null;
}

// ---------------------------------------------------------------- the screens
export function wordsHtml(selectedId) {
  const chips = FEELS.map((f) => `<button class="gopt${selectedId === f.id ? " on" : ""}" data-feel="${f.id}" aria-pressed="${selectedId === f.id}">${esc(f.label)}</button>`).join("");
  const says = (FEELS.find((f) => f.id === selectedId) || {}).says;
  return `<div class="gopts feelopts" style="margin-top:6px">${chips}</div>
    <div class="muted small" data-feelsays style="margin-top:6px">${esc(says || "Tap the word that fits best.")}</div>`;
}
// For professionals: a small block at the top of the Structure step. The words move the sliders below it.
export function feelBlockHtml(selectedId) {
  return `<div class="feelblock" data-feelblock><div class="serif" style="font-size:16px">How did the wine feel?</div>${wordsHtml(selectedId)}</div>`;
}
function questionHtml(q, answers) {
  const opts = q.options.map((o, i) => `<button class="gopt${answers[q.id] === i ? " on" : ""}" data-taste="${q.id}:${i}" aria-pressed="${answers[q.id] === i}">${esc(o.label)}</button>`).join("");
  return `<div class="tq"><div class="tqtext">${esc(q.text)}</div><div class="gopts">${opts}</div></div>`;
}
const typeChips = (sheet) => `<div class="stylerow" role="group" aria-label="Type of wine">${WINE_STYLES.map((st) => `<button class="chip${sheet.style === st.id ? " on" : ""}" data-sheet="style:${st.id}" aria-pressed="${sheet.style === st.id}">${esc(st.label)}</button>`).join("")}</div>`;
const NOTE = `<div class="muted small" style="margin-top:12px">Every question is optional. Your answers are private and only shape your palate profile; they do not change anything about the wine.</div>`;
// The two steps that replace the structure sliders for ordinary players.
export function tastePageOneHtml(sheet) {
  const t = sheet.taste || { word: null, answers: {} };
  return `<h3 class="serif">How did it taste?</h3><div class="muted small">What kind of wine is it?</div>${typeChips(sheet)}
    <div class="tq"><div class="tqtext">Was the wine\u2026</div>${wordsHtml(t.word)}</div>
    ${questionsFor(sheet.style, 1).map((q) => questionHtml(q, t.answers)).join("")}${NOTE}`;
}
export function tastePageTwoHtml(sheet) {
  const t = sheet.taste || { word: null, answers: {} };
  return `<h3 class="serif">A bit more</h3><div class="muted small">Two more quick ones about the taste.</div>
    ${questionsFor(sheet.style, 2).map((q) => questionHtml(q, t.answers)).join("")}${NOTE}`;
}
// After a tap: update the buttons and the sentence under the words without redrawing, so the page does not jump.
export function syncTasteDom(sheet, root = document) {
  const t = sheet.taste || { word: null, answers: {} };
  root.querySelectorAll("[data-feel]").forEach((b) => { const on = b.dataset.feel === t.word; b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); });
  const says = (FEELS.find((f) => f.id === t.word) || {}).says;
  root.querySelectorAll("[data-feelsays]").forEach((el) => { el.textContent = says || "Tap the word that fits best."; });
  root.querySelectorAll("[data-taste]").forEach((b) => { const [qid, i] = b.dataset.taste.split(":"); const on = t.answers[qid] === Number(i); b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); });
}

// ---------------------------------------------------------------- the database
// Saved with the journal entry (column consumptions.taste, database update 23) so the words and answers come back when the entry is reopened.
// The ratings themselves are saved with the rating as usual; this is only so the screen can show what was chosen.
export async function saveTaste(sb, consumptionId, taste) {
  const value = taste ? { v: 1, word: taste.word || null, answers: taste.answers || {} } : null;
  const { error } = await sb.from("consumptions").update({ taste: value }).eq("id", consumptionId);
  if (error) throw error;
}
// Rebuilds the screen state for a saved entry. The snapshot is "every line at its starting value", because nothing else could have moved them.
export async function loadTaste(sb, consumptionId, sheet) {
  const { data, error } = await sb.from("consumptions").select("taste").eq("id", consumptionId).maybeSingle();
  if (error) throw error;
  const saved = data && data.taste;
  if (!saved || (!saved.word && !Object.keys(saved.answers || {}).length)) return null;
  const snapshot = Object.fromEntries(SNAP_KEYS.filter((k) => sheet.dims[k]).map((k) => [k, { value: sheet.dims[k].def, def: sheet.dims[k].def, adjusted: false }]));
  return cleanTaste({ word: saved.word, answers: saved.answers || {}, snapshot }, sheet.style);
}

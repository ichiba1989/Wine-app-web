// "How did it taste?": the conversational way to rate structure. Players do not see the structure sliders.
//   Did the wine taste as expected? (stored as "balanced", an older name kept so saved answers still work.)   Yes: everything is as expected, nothing to adjust.   No: what stood out?
//   Sour, Fruity, Sweet, Thin, Heavy or Drying (as many as apply), and for each one how much (a bit, quite, very).
//   Would you drink it alone, with food, or either?
// The answers are turned into the acidity, body, tannin and sweetness ratings of that bottle, relative to what the wine is expected to be.
// Those are private to the player and feed only their palate profile. "Yes, balanced" counts as a real answer: it means the wine tasted as
// expected (a difference of zero), so a player who says Yes a lot and a player who finds things out of the ordinary look different.
// Professionals keep the sliders and the tasting grid; for them the same questions are a shortcut that moves the sliders.
// The rules at the top are pure (no browser, no network). loadTaste and saveTaste at the bottom talk to Supabase.
import { dimsFor, dimMeta, clampDimValue, esc } from "./logic.js?v=10";

// What can stand out, and how much (level 1, 2 or 3). Each effect is a change from the wine's expected level; sweetness is the step noticed.
export const NOTES = [
  { id: "sour", label: "Sour", ask: "How sour?", levels: ["A bit", "Quite", "Very sour"], effects: { acidity: [1, 2, 3], tannin: [0, 1, 1] } },
  { id: "fruity", label: "Fruity", ask: "How fruity?", levels: ["A bit", "Quite", "Very"], effects: { acidity: [-1, -1, -2] } },
  { id: "sweet", label: "Sweet", ask: "How sweet?", levels: ["A hint", "Clearly", "Dessert-like"], effects: { sweetness: [1, 2, 3] }, set: true },
  { id: "thin", label: "Thin", ask: "How thin?", levels: ["A bit", "Quite", "Very watery"], effects: { body: [-1, -2, -3] } },
  { id: "heavy", label: "Heavy", ask: "How heavy?", levels: ["A bit", "Quite", "Very"], effects: { body: [1, 2, 3] } },
  { id: "drying", label: "Makes my mouth dry", ask: "How much does it dry your mouth?", levels: ["A bit", "Quite", "Very strong"], effects: { tannin: [1, 2, 3] }, needs: "tannin" },
];
export const PAIRINGS = [{ id: "alone", label: "Alone" }, { id: "food", label: "With food" }, { id: "either", label: "Either" }];
export const SNAP_KEYS = ["acidity", "body", "tannin", "oak", "sweetness"];
export const TASTE_VERSION = 2;

const hasDim = (style, key) => dimsFor(style).some((d) => d.key === key);
export const notesFor = (style) => NOTES.filter((n) => !n.needs || hasDim(style, n.needs));
const snap = (dims) => Object.fromEntries(SNAP_KEYS.filter((k) => dims[k]).map((k) => [k, { ...dims[k] }]));

// The lines for this answer, worked out from the snapshot (the lines before any tap), so a change never stacks on the last one.
function build(sheet, snapshot, taste) {
  const dims = { ...sheet.dims };
  Object.entries(snapshot).forEach(([k, v]) => { dims[k] = { ...v }; });
  if (!taste || taste.balanced !== false) return dims;
  const delta = {}, steps = {};
  notesFor(sheet.style).forEach((n) => {
    const level = taste.notes[n.id]; if (!level) return;
    Object.entries(n.effects).forEach(([dim, arr]) => {
      if (!hasDim(sheet.style, dim) || !snapshot[dim]) return;
      if (n.set) steps[dim] = Math.max(steps[dim] || 0, arr[level - 1]);
      else delta[dim] = (delta[dim] || 0) + arr[level - 1];
    });
  });
  Object.entries(delta).forEach(([dim, d]) => { if (d !== 0) dims[dim] = { ...dims[dim], value: clampDimValue(dimMeta(dim), snapshot[dim].def + d), adjusted: true }; });
  Object.entries(steps).forEach(([dim, v]) => { if (v > snapshot[dim].def) dims[dim] = { ...dims[dim], value: clampDimValue(dimMeta(dim), v), adjusted: true }; });
  return dims;
}
const isEmpty = (t) => t.balanced === null && !Object.keys(t.notes).length && !t.pairing;
// change: { balanced: true|false } | { note: "sour" } | { level: ["sour", 2] } | { pairing: "food" }. Choosing the same thing again takes it back.
// Returns { dims, taste }; taste is null when nothing is chosen any more (and the lines are back as they were).
export function applyTaste(sheet, change) {
  const cur = sheet.taste || null;
  const snapshot = cur && cur.snapshot ? cur.snapshot : snap(sheet.dims);
  const t = { v: TASTE_VERSION, balanced: cur ? cur.balanced : null, notes: cur ? { ...cur.notes } : {}, pairing: cur ? cur.pairing : null };
  if (change && "balanced" in change) {
    t.balanced = t.balanced === change.balanced ? null : change.balanced;
    if (t.balanced !== false) t.notes = {};
  }
  if (change && change.note) {
    if (!notesFor(sheet.style).some((n) => n.id === change.note)) return { dims: build(sheet, snapshot, cur), taste: cur };
    t.balanced = false;
    if (t.notes[change.note]) delete t.notes[change.note]; else t.notes[change.note] = 1;
  }
  if (change && change.level) { const [id, lv] = change.level; if (t.notes[id] && [1, 2, 3].includes(lv)) t.notes[id] = lv; }
  if (change && change.pairing && PAIRINGS.some((p) => p.id === change.pairing)) t.pairing = t.pairing === change.pairing ? null : change.pairing;
  if (t.balanced === false && !Object.keys(t.notes).length && !("balanced" in (change || {}))) t.balanced = null;   // the last thing that stood out was un-picked
  const dims = build(sheet, snapshot, t);
  return { dims, taste: isEmpty(t) ? null : { ...t, snapshot } };
}
// Answers that no longer apply (the wine became a white, so nothing can be drying) are dropped when the type changes.
export function cleanTaste(taste, style) {
  if (!taste || taste.v !== TASTE_VERSION) return null;
  const notes = {};
  notesFor(style).forEach((n) => { const lv = taste.notes && taste.notes[n.id]; if ([1, 2, 3].includes(lv)) notes[n.id] = lv; });
  const t = { v: TASTE_VERSION, balanced: taste.balanced === true ? true : taste.balanced === false ? false : null, notes: taste.balanced === true ? {} : notes, pairing: PAIRINGS.some((p) => p.id === taste.pairing) ? taste.pairing : null };
  return isEmpty(t) ? null : { ...t, snapshot: taste.snapshot || null };
}

// ---------------------------------------------------------------- the screens
const chip = (on, data, label) => `<button class="gopt${on ? " on" : ""}" data-taste="${data}" aria-pressed="${on}">${esc(label)}</button>`;
// The questions themselves. They are redrawn after each tap, because answering opens more options.
export function tasteInnerHtml(sheet) {
  const t = sheet.taste || { balanced: null, notes: {}, pairing: null };
  let h = `<div class="tq"><div class="tqtext">Did the wine taste as expected?</div><div class="gopts">${chip(t.balanced === true, "balanced:yes", "Yes")}${chip(t.balanced === false, "balanced:no", "No")}</div>
    <div class="muted small" style="margin-top:6px">${t.balanced === true ? "Nothing stood out: it tasted as expected." : t.balanced === false ? "" : "Yes if nothing stood out."}</div></div>`;
  if (t.balanced === false) {
    h += `<div class="tq"><div class="tqtext">What stood out?</div><div class="muted small" style="margin-bottom:6px">Pick as many as apply.</div>
      <div class="gopts">${notesFor(sheet.style).map((n) => chip(!!t.notes[n.id], "note:" + n.id, n.label)).join("")}</div></div>`;
    h += notesFor(sheet.style).filter((n) => t.notes[n.id]).map((n) =>
      `<div class="tq sub"><div class="tqtext">${esc(n.ask)}</div><div class="gopts">${n.levels.map((lab, i) => chip(t.notes[n.id] === i + 1, `level:${n.id}:${i + 1}`, lab)).join("")}</div></div>`).join("");
  }
  if (SHOW_PAIRING) h += `<div class="tq"><div class="tqtext">Would you drink it\u2026</div><div class="gopts">${PAIRINGS.map((p) => chip(t.pairing === p.id, "pairing:" + p.id, p.label)).join("")}</div></div>`;
  return h;
}
// The "Would you drink it alone or with food?" question is hidden for now (nothing uses the answer yet). Set this to true to bring it back;
// answers already saved are kept and still load and save as before.
const SHOW_PAIRING = false;
const NOTE = `<div class="muted small" style="margin-top:12px">Every question is optional. Your answers are private and only shape your taste profile; they do not change anything about the wine.</div>`;
// For ordinary players: the whole of step 2.
export function tastePageHtml(sheet) {
  return `<div data-tasteblock>${tasteInnerHtml(sheet)}</div>${NOTE}`;
}
// For professionals: a small block at the top of step 2, above the sliders it moves.
export function feelBlockHtml(sheet) {
  return `<div class="feelblock" data-feelblock><div data-tasteblock>${tasteInnerHtml(sheet)}</div></div>`;
}
// A tap on a data-taste button -> the change to apply.
export function changeFrom(data) {
  const [kind, a, b] = String(data).split(":");
  if (kind === "balanced") return { balanced: a === "yes" };
  if (kind === "note") return { note: a };
  if (kind === "level") return { level: [a, Number(b)] };
  if (kind === "pairing") return { pairing: a };
  return null;
}

// ---------------------------------------------------------------- the database
// Saved with the journal entry (column consumptions.taste, database update 23) so the answers come back when the entry is reopened, and so the
// palate can count "balanced" as an answer. The ratings themselves are saved with the rating as usual.
export async function saveTaste(sb, consumptionId, taste) {
  const value = taste ? { v: TASTE_VERSION, balanced: taste.balanced, notes: taste.notes || {}, pairing: taste.pairing || null } : null;
  const { error } = await sb.from("consumptions").update({ taste: value }).eq("id", consumptionId);
  if (error) throw error;
}
// Rebuilds the screen state for a saved entry. The snapshot is "every line at its starting value", because nothing else could have moved them.
export async function loadTaste(sb, consumptionId, sheet) {
  const { data, error } = await sb.from("consumptions").select("taste").eq("id", consumptionId).maybeSingle();
  if (error) throw error;
  const snapshot = Object.fromEntries(SNAP_KEYS.filter((k) => sheet.dims[k]).map((k) => [k, { value: sheet.dims[k].def, def: sheet.dims[k].def, adjusted: false }]));
  return cleanTaste(data && data.taste ? { ...data.taste, snapshot } : null, sheet.style);
}

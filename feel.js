// "How did the wine feel?": a conversational way to rate structure. One tap on Smooth, Tart, Sour, Juicy or Sweet sets the acidity, body,
// tannin and oak sliders in relation to each other; the sliders can still be adjusted by hand afterwards.
//   Smooth  acidity, body and tannin in balance.
//   Tart    acidity a notch above the body (medium or medium plus); tannin level with the body.
//   Sour    acidity clearly above the body (high-ish); tannin one step above the body.
//   Juicy   acidity a step below the body; tannin level with the body.
//   Sweet   acidity and tannin a step below the anchor, the body a step above it, with new oak.
// The anchor is the wine's own starting level (the average of its starting acidity, body and tannin), so the same word means the same
// relationship for a light wine and for a big one. Pure: no browser, no network.
import { dimsFor, esc } from "./logic.js?v=10";

export const FEELS = [
  { id: "smooth", label: "Smooth", says: "Acidity, body and tannin in balance." },
  { id: "tart", label: "Tart", says: "A little more acidity than body." },
  { id: "sour", label: "Sour", says: "Clearly more acidity than body, and a touch more tannin." },
  { id: "juicy", label: "Juicy", says: "Less acidity, with tannin and body in step." },
  { id: "sweet", label: "Sweet", says: "Less acidity and tannin, a fuller body, and some new oak." },
];
export const FEEL_KEYS = ["acidity", "body", "tannin", "oak"];   // the lines a feel can move

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
    case "tart": a = clamp(B + 1, 3, 4); b = Math.min(B, a - 1); t = b; break;
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

// Choosing a feel sets the lines; choosing the same one again puts the lines back as they were before any feel was chosen.
// sheet.dims is { key: { value, def, adjusted } }. Returns { dims, feel } for the sheet (the sheet's other fields are not touched).
export function applyFeel(sheet, feelId) {
  const cur = sheet.feel || null;
  const snapshot = cur ? cur.snapshot : Object.fromEntries(FEEL_KEYS.filter((k) => sheet.dims[k]).map((k) => [k, { ...sheet.dims[k] }]));
  if (cur && cur.id === feelId) {
    const dims = { ...sheet.dims }; Object.entries(snapshot).forEach(([k, v]) => { dims[k] = { ...v }; });
    return { dims, feel: null };
  }
  const defaults = {}; ["acidity", "body", "tannin"].forEach((k) => { if (sheet.dims[k]) defaults[k] = (snapshot[k] || sheet.dims[k]).def; });
  const set = feelDims(feelId, defaults, sheet.style);
  const dims = { ...sheet.dims };
  Object.entries(set).forEach(([k, v]) => { if (dims[k]) dims[k] = { ...dims[k], value: v, adjusted: true }; });
  return { dims, feel: { id: feelId, snapshot } };
}

export function feelBlockHtml(selectedId) {
  const chips = FEELS.map((f) => `<button class="gopt${selectedId === f.id ? " on" : ""}" data-feel="${f.id}" aria-pressed="${selectedId === f.id}">${esc(f.label)}</button>`).join("");
  const says = (FEELS.find((f) => f.id === selectedId) || {}).says;
  return `<div class="feelblock" data-feelblock><div class="serif" style="font-size:16px">How did the wine feel?</div>
    <div class="gopts feelopts" style="margin-top:6px">${chips}</div>
    <div class="muted small" style="margin-top:6px">${says ? esc(says) + " Fine-tune with the sliders below." : "Tap one to set the sliders below, then fine-tune them."}</div></div>`;
}

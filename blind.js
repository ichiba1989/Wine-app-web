// Blind tasting: taste first and name the wine, then reveal what it was and see how close the guess was. Pure: no page, no network.
// The reveal only compares the guess with facts the app already holds about the wine (the catalog card, or what the player typed in): nothing about the wine is worked out or guessed here.
// A guess is kept on the phone (wine.blind) until it is revealed; the revealed result goes into the wine's journal notes as plain words, and the player rates the wine as usual.
import { fold, splitGrapeText } from "./grapes.js?v=2";

export const GUESS_FIELDS = [
  { id: "style", label: "Type of wine" },
  { id: "grape", label: "Grape" },
  { id: "country", label: "Country" },
  { id: "region", label: "Region or appellation" },
  { id: "vintage", label: "Vintage" },
];
export const MAX_PENDING = 20;
export const newBlind = (now = new Date()) => ({ id: "b" + now.getTime().toString(36) + Math.random().toString(36).slice(2, 5), started: now.toISOString(), guess: { style: "", grape: "", country: "", region: "", vintage: "" }, notes: "" });
// What is stored on the phone, cleaned: only well-formed tastings, newest first, never more than MAX_PENDING.
export function cleanPending(list) {
  const ok = (Array.isArray(list) ? list : []).filter((b) => b && typeof b.id === "string" && b.guess && typeof b.guess === "object");
  return ok.map((b) => ({ id: b.id, started: String(b.started || ""), notes: String(b.notes || ""), guess: Object.fromEntries(GUESS_FIELDS.map((f) => [f.id, String((b.guess || {})[f.id] || "")])) }))
    .sort((a, b) => b.started.localeCompare(a.started)).slice(0, MAX_PENDING);
}
export const hasGuess = (b) => !!b && (GUESS_FIELDS.some((f) => String(b.guess[f.id] || "").trim()) || String(b.notes || "").trim() !== "");

// The facts of the revealed wine, in the shape the comparison reads: from a catalog card, or from the form a player typed.
export const actualOfCard = (c) => ({ style: c.style || "", grapes: ((c.grapes && c.grapes.length ? c.grapes : c.ruleGrapes) || []).slice(), country: c.country || "", places: [c.appellation, c.region].filter(Boolean), vintage: c.vintage ? String(c.vintage) : "" });
export const actualOfForm = (f) => ({ style: f.style && f.style !== "unknown" ? f.style : "", grapes: splitGrapeText(f.grape || ""), country: f.country || "", places: [f.region].filter(Boolean), vintage: /^(\d{4}|NV)$/.test(String(f.vintage || "")) ? String(f.vintage) : "" });

const asGrapes = (t) => splitGrapeText(t).map(fold).filter(Boolean);
// Each field becomes { id, label, guess, actual, result }: match, close (part right or nearby), miss, skipped (no guess), unknown (the app has no fact to compare with).
export function scoreGuess(guess, actual, styleLabel = (s) => s) {
  const g = guess || {}, a = actual || {};
  const rows = GUESS_FIELDS.map((f) => ({ id: f.id, label: f.label, guess: String(g[f.id] || "").trim(), actual: "", result: "skipped" }));
  const put = (id, actualText, result) => { const r = rows.find((x) => x.id === id); r.actual = actualText; r.result = !r.guess ? "skipped" : !actualText ? "unknown" : result; };
  // type of wine
  put("style", a.style ? styleLabel(a.style) : "", g.style === a.style ? "match" : "miss");
  if (g.style) rows[0].guess = styleLabel(g.style);
  // grape: all the guessed grapes are in the wine and the wine has no others = match; some in common = close
  const ag = (a.grapes || []).map(fold), gg = asGrapes(g.grape);
  const common = gg.filter((x) => ag.includes(x)).length;
  put("grape", (a.grapes || []).join(", "), common && common === gg.length && gg.length === ag.length ? "match" : common ? "close" : "miss");
  // country
  put("country", a.country || "", fold(g.country) === fold(a.country) ? "match" : "miss");
  // region: the same as the appellation or the region = match; one contains the other = close
  const gr = fold(g.region), pl = (a.places || []).map(fold);
  put("region", (a.places || []).join(", "), gr && pl.includes(gr) ? "match" : gr && pl.some((p) => p.includes(gr) || gr.includes(p)) ? "close" : "miss");
  // vintage: the same year (or NV) = match, within 2 years = close
  const gv = String(g.vintage || "").trim().toUpperCase(), av = String(a.vintage || "").toUpperCase();
  const dy = /^\d{4}$/.test(gv) && /^\d{4}$/.test(av) ? Math.abs(Number(gv) - Number(av)) : null;
  put("vintage", a.vintage || "", gv === av ? "match" : dy !== null && dy <= 2 ? "close" : "miss");
  return rows;
}
// Points: a match is 1, close is half. Out of the fields that were guessed and could be compared.
export function summarize(rows) {
  const scored = rows.filter((r) => ["match", "close", "miss"].includes(r.result));
  const points = scored.reduce((n, r) => n + (r.result === "match" ? 1 : r.result === "close" ? 0.5 : 0), 0);
  return { points, of: scored.length };
}
export const RESULT_WORDS = { match: "Right", close: "Close", miss: "Not this time", skipped: "Not guessed", unknown: "Not on record" };
// The line saved in the journal notes after a reveal, in plain words. Only guessed fields are listed.
export function resultLine(rows, summary) {
  const parts = rows.filter((r) => r.result !== "skipped").map((r) => `${r.label.toLowerCase()}: guessed ${r.guess}${r.actual ? `, it was ${r.actual}` : ""}`);
  return `Blind tasting${parts.length ? " (" + parts.join("; ") + ")" : ""}${summary.of ? `. Score ${summary.points} of ${summary.of}.` : "."}`;
}
// The notes for the wine's rating sheet: what was written while tasting blind, then the result line, each with its time. Existing notes stay first.
export function notesAfterReveal(existing, blindNotes, line, stamp) {
  const out = [String(existing || "").trim(), String(blindNotes || "").trim(), `[${stamp}] ${line}`].filter(Boolean);
  return out.join("\n");
}

// Settings: the gear in the header opens one sheet of choices that change how the app looks and how a wine is answered.
// They are kept on this phone (in the browser), not in the database, so each device can be set up differently.
// The rules at the top are pure (no browser, no network) so they can be tested on their own. The sheet is drawn by settingsHtml.
import { esc } from "./logic.js?v=22";
import { accountCardHtml } from "./account.js?v=20";
import { MODES, cleanMode } from "./words.js?v=1";
import { cleanLang } from "./winewords.js?v=1";

export const SETTINGS_KEY = "wine.settings";
// How much bigger the words get. The page multiplies every font size by this number (the CSS variable --ts).
export const TEXT_SIZES = [
  { id: "normal", label: "Normal", scale: 1 },
  { id: "large", label: "Large", scale: 1.2 },
  { id: "larger", label: "Larger", scale: 1.4 },
];
export const MOTION = [
  { id: "device", label: "Follow my phone" },
  { id: "reduce", label: "Always reduce" },
];
export const DEFAULT_SETTINGS = { text: "normal", swipe: true, buttons: true, motion: "device", mode: "beginner", lang: "auto" };

// Anything missing or odd (an old version, a hand-edited value) falls back to the default. Swiping off means the buttons are the only
// way to answer, so the buttons are forced on in that case.
export function cleanSettings(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const s = {
    text: TEXT_SIZES.some((t) => t.id === r.text) ? r.text : DEFAULT_SETTINGS.text,
    swipe: r.swipe === false ? false : true,
    buttons: r.buttons === false ? false : true,
    motion: MOTION.some((m) => m.id === r.motion) ? r.motion : DEFAULT_SETTINGS.motion,
    mode: cleanMode(r.mode),
    lang: cleanLang(r.lang),
  };
  if (!s.swipe) s.buttons = true;
  return s;
}
export const textScale = (s) => (TEXT_SIZES.find((t) => t.id === s.text) || TEXT_SIZES[0]).scale;
export function parseSettings(text) {
  try { return cleanSettings(JSON.parse(text)); } catch (_) { return cleanSettings(null); }
}
// change: "text:large", "swipe:off", "buttons:on", "motion:reduce". Returns the new settings (the old object is not touched).
export function changeSetting(s, key, value) {
  const next = { ...s };
  if (key === "text" || key === "motion" || key === "mode" || key === "lang") next[key] = value;
  else if (key === "swipe" || key === "buttons") next[key] = value === "on";
  return cleanSettings(next);
}

// ---------------------------------------------------------------- the sheet
const chip = (on, data, label, disabled = false) => `<button class="gopt${on ? " on" : ""}" data-action="set:${data}" aria-pressed="${on}"${disabled ? " disabled" : ""}>${esc(label)}</button>`;
const row = (title, chips, note) => `<div class="srow"><div class="stitle">${esc(title)}</div><div class="gopts">${chips}</div>${note ? `<div class="muted small snote">${note}</div>` : ""}</div>`;

// The "Waiting to upload" part: how many changes wait, a Sync now button, and the changes the database refused (each can be tried again or dropped).
export function syncHtml(y) {
  if (!y) return "";
  const failed = (y.failed || []).map((f) => `<div class="fitem"><div class="small">${esc(f.what)}</div><div class="small err">${esc(f.error || "")}</div>
      <button class="link small" data-action="sync:retry:${esc(f.id)}">Try again</button> <button class="link small" data-action="sync:discard:${esc(f.id)}">Drop it</button></div>`).join("");
  const line = !y.pending ? "Nothing is waiting to upload." : `${y.pending} ${y.pending === 1 ? "change is" : "changes are"} waiting to upload.`;
  const net = y.online ? (y.syncing ? "Uploading now." : "You are online.") : "You are offline. Your changes are kept on this phone and sent when you are back online.";
  return `<div class="srow"><div class="stitle">Waiting to upload</div><div class="small">${esc(line)} ${esc(net)}</div>
    <button class="btn outline slim" data-action="sync:now"${y.online ? "" : " disabled"}>Sync now</button>${failed ? `<div class="stitle" style="margin-top:10px">Could not upload</div>${failed}` : ""}</div>`;
}
// The Plan row: Standard or Pro. Shown only while the owner leaves the switch open; it exists so testers can try the Pro features. Mode (Who is this for) never changes the plan.
export function planHtml(p) {
  if (!p) return "";
  const btn = (pl) => `<button class="gopt${p.current === pl.id ? " on" : ""}" data-action="plan:${esc(pl.id)}" aria-pressed="${p.current === pl.id}"${p.busy ? " disabled" : ""}>${esc(pl.label)}</button>`;
  return `<div class="srow"><div class="stitle">Plan</div><div class="gopts">${p.plans.map(btn).join("")}</div>
    <div class="muted small snote">Testing only: Pro switches on the tasting grid, bigger imports and feedback. This choice will be removed after testing. It is separate from "Who is this for", which only changes the words.</div>${p.error ? `<div class="err">${esc(p.error)}</div>` : ""}</div>`;
}
export function settingsHtml(s, user, { owner = false, sync = null, plan = null } = {}) {
  const onOff = (key, disabled = false) => chip(s[key], `${key}:on`, "On", disabled) + chip(!s[key], `${key}:off`, "Off", disabled);
  return `<div class="overlay"><div class="sheet" id="settingsPanel" role="dialog" aria-label="Settings">
    <div class="sheethead"><div class="sheettitle"><div class="serif big">Settings</div><div class="muted small">Saved on this phone.</div></div>
      <div class="sheetbtns"><button class="xbtn" data-action="setclose" aria-label="Close">&times;</button></div></div>
    ${row("Who is this for", MODES.map((m) => chip(s.mode === m.id, `mode:${m.id}`, m.label)).join(""), "Changes the words, and Enthusiast and Professional add blind tasting and note export. It does not change your wines or your answers.")}
    ${row("Text size", TEXT_SIZES.map((t) => chip(s.text === t.id, `text:${t.id}`, t.label)).join(""), "Makes the words bigger across the app.")}
    ${row("Answer by swiping", onOff("swipe"), "Swipe the card, or double-tap near its edge. Turn this off if swipes happen by accident; the buttons under the card stay on.")}
    ${row("Buttons under the card", onOff("buttons", !s.swipe), s.swipe ? "Tap a button to answer without swiping." : "Always on while swiping is off.")}
    <div class="srow"><div class="stitle">How the card works</div><button class="btn outline slim" data-action="demo:open">Practice with a sample card</button><div class="muted small snote">A short walkthrough of swiping, the buttons and zoom. Nothing is saved.</div></div>
    ${row("Zoom", "", "Pinch the card with two fingers, double-tap the middle of it, or tap Zoom under the card. While it is zoomed, swiping is paused. Tap Reset zoom to go back.")}
    ${row("Motion", MOTION.map((m) => chip(s.motion === m.id, `motion:${m.id}`, m.label)).join(""), "Reduces the card's movement and the fades.")}
    ${planHtml(plan)}
    ${syncHtml(sync)}
    ${owner ? `<div class="srow"><div class="stitle">Owner</div><button class="btn outline slim" data-action="owner:open">Open the owner page</button><div class="muted small snote">Tables of wines, lenses, bingo cards, checks and settings.</div></div>` : ""}
    <div class="srow"><div class="stitle">Account</div>${accountCardHtml(user)}</div>
  </div></div>`;
}

// Settings: the gear in the header opens one sheet of choices that change how the app looks and how a wine is answered.
// They are kept on this phone (in the browser), not in the database, so each device can be set up differently.
// The rules at the top are pure (no browser, no network) so they can be tested on their own. The sheet is drawn by settingsHtml.
import { esc } from "./logic.js?v=10";
import { accountCardHtml } from "./account.js?v=5";

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
export const DEFAULT_SETTINGS = { text: "normal", swipe: true, buttons: true, motion: "device" };

// Anything missing or odd (an old version, a hand-edited value) falls back to the default. Swiping off means the buttons are the only
// way to answer, so the buttons are forced on in that case.
export function cleanSettings(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const s = {
    text: TEXT_SIZES.some((t) => t.id === r.text) ? r.text : DEFAULT_SETTINGS.text,
    swipe: r.swipe === false ? false : true,
    buttons: r.buttons === false ? false : true,
    motion: MOTION.some((m) => m.id === r.motion) ? r.motion : DEFAULT_SETTINGS.motion,
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
  if (key === "text" || key === "motion") next[key] = value;
  else if (key === "swipe" || key === "buttons") next[key] = value === "on";
  return cleanSettings(next);
}

// ---------------------------------------------------------------- the sheet
const chip = (on, data, label, disabled = false) => `<button class="gopt${on ? " on" : ""}" data-action="set:${data}" aria-pressed="${on}"${disabled ? " disabled" : ""}>${esc(label)}</button>`;
const row = (title, chips, note) => `<div class="srow"><div class="stitle">${esc(title)}</div><div class="gopts">${chips}</div>${note ? `<div class="muted small snote">${note}</div>` : ""}</div>`;

export function settingsHtml(s, user, { owner = false } = {}) {
  const onOff = (key, disabled = false) => chip(s[key], `${key}:on`, "On", disabled) + chip(!s[key], `${key}:off`, "Off", disabled);
  return `<div class="overlay"><div class="sheet" id="settingsPanel" role="dialog" aria-label="Settings">
    <div class="sheethead"><div class="sheettitle"><div class="serif big">Settings</div><div class="muted small">Saved on this phone.</div></div>
      <div class="sheetbtns"><button class="xbtn" data-action="setclose" aria-label="Close">&times;</button></div></div>
    ${row("Text size", TEXT_SIZES.map((t) => chip(s.text === t.id, `text:${t.id}`, t.label)).join(""), "Makes the words bigger across the app.")}
    ${row("Answer by swiping", onOff("swipe"), "Swipe the card, or double-tap near its edge. Turn this off if swipes happen by accident; the buttons under the card stay on.")}
    ${row("Buttons under the card", onOff("buttons", !s.swipe), s.swipe ? "Tap a button to answer without swiping." : "Always on while swiping is off.")}
    ${row("Zoom", "", "Pinch the card with two fingers, double-tap the middle of it, or tap Zoom under the card. While it is zoomed, swiping is paused. Tap Reset zoom to go back.")}
    ${row("Motion", MOTION.map((m) => chip(s.motion === m.id, `motion:${m.id}`, m.label)).join(""), "Reduces the card's movement and the fades.")}
    ${owner ? `<div class="srow"><div class="stitle">Owner</div><button class="btn outline slim" data-action="owner:open">Open the owner page</button><div class="muted small snote">Tables of wines, lenses, bingo cards, checks and settings.</div></div>` : ""}
    <div class="srow"><div class="stitle">Account</div>${accountCardHtml(user)}</div>
  </div></div>`;
}

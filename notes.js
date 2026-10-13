// Notes the player speaks or types into the journal. Pure: no page, no network (the microphone is in dictation.js).
// The words are kept exactly as the player said them, with the time they were noted. Nothing is worked out from them: no grape, region or other wine fact is read out of a note.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const two = (n) => String(n).padStart(2, "0");
// "Oct 13, 14:32": when a note was taken (the phone's own time).
export const stampOf = (d = new Date()) => `${MONTHS[d.getMonth()]} ${d.getDate()}, ${two(d.getHours())}:${two(d.getMinutes())}`;
// Spoken text as it will be written: spaces tidied, first letter capital. Empty stays empty.
export function cleanTranscript(text) {
  const t = String(text == null ? "" : text).replace(/\s+/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
}
// A new note added under what is already written: one line per note, each starting with its time. With no text, the notes stay as they were.
export function composeNote(base, text, stamp) {
  const t = cleanTranscript(text);
  const b = String(base == null ? "" : base).replace(/\s+$/, "");
  if (!t) return b;
  return (b ? b + "\n" : "") + `[${stamp}] ${t}`;
}
// What a quick note (no wine chosen) needs: the words, and the name if the player gave one. Returns an error message, or "" when it can be saved.
export const noteProblem = (text) => (cleanTranscript(text) ? "" : "Say or type something first.");

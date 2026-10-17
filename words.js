// Wording for the three kinds of player: Beginner, Enthusiast, Professional (the "Who is this for" choice in Settings, kept on the phone).
// The mode changes the WORDS and which extra tools are offered (see PRO_TOOLS); it never changes the data underneath. Anything not listed here reads the same for everyone,
// and a missing word falls back to the Beginner one, so wording can be added a little at a time. Wine terms belong here, not in the everyday text.
// Pure: no page, no network. The current mode is a module setting (like the deck settings in reactions.js); app.js sets it when the settings load or change.
export const MODES = [
  { id: "beginner", label: "Beginner", note: "Everyday words." },
  { id: "enthusiast", label: "Enthusiast", note: "A little more wine language and the extra tools." },
  { id: "pro", label: "Professional", note: "Trade words and the extra tools." },
];
export const DEFAULT_MODE = "beginner";
let current = DEFAULT_MODE;
export const cleanMode = (m) => (MODES.some((x) => x.id === m) ? m : DEFAULT_MODE);
export const setMode = (m) => { current = cleanMode(m); return current; };
export const modeNow = () => current;
// The extra tools (blind tasting, export of notes) show for Enthusiast and Professional. They only work on the player's own data, so they need no tier.
export const proToolsOn = (m = current) => m === "enthusiast" || m === "pro";

const W = {
  taste_q: { beginner: "Did the wine taste as expected?", enthusiast: "Did it taste as expected for its style?", pro: "Was it typical for its style and origin?" },
  no_verdict: { beginner: "No verdict yet", enthusiast: "No verdict yet", pro: "Not scored" },
  search_wines: { beginner: "Search your wines", enthusiast: "Search your wines and notes", pro: "Search your tasting log" },
  add_title: { beginner: "Add a wine you drank", enthusiast: "Add a wine you tasted", pro: "Log a wine" },
  note_title: { beginner: "Take a note", enthusiast: "Take a note", pro: "Tasting note" },
  notes_hint: { beginner: "Notes", enthusiast: "Notes", pro: "Tasting notes" },
  blind_title: { beginner: "Blind tasting", enthusiast: "Blind tasting", pro: "Blind tasting" },
};
export function say(key, mode = current) {
  const e = W[key];
  if (!e) return key;
  return e[mode] || e[DEFAULT_MODE];
}
export const WORD_KEYS = Object.keys(W);

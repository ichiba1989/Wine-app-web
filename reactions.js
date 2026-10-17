// The four answers to a wine card, and the numbers that say how much each one counts. Pure: no page, no network.
//   like       swipe right      the wine appeals to them. Counts toward their taste (palate and deck) with SWIPE_WEIGHT.like.
//   dislike    swipe left       it does not. Counts against, with SWIPE_WEIGHT.dislike.
//   dont_know  a button, shown as "Skip" (the stored code stays dont_know). They do not know the wine. It counts for NOTHING in the palate. It is recorded so the deck can show fewer wines like it
//                               (but never none: they can still teach) and so recommendations and quizzes can see what the player has not met.
//                               The first skip of a wine puts it back in the deck, later on; the second skip takes it out of the deck (SKIP_LIMIT).
//   had        swipe up / button  they have had this bottle: it also goes into the journal, where rating it gives it its weight.
// Answers given before this model existed have no `reaction`; reactionOf reads their old familiarity and interest so nothing breaks.
export const REACTIONS = {
  like: { label: "Thumbs up", color: "#3A4B40" },
  dislike: { label: "Thumbs down", color: "#7B1E3A" },
  dont_know: { label: "Skip", color: "#3E5C76" },
  had: { label: "I've had this bottle", color: "#B08A3E" },
};
// A wine skipped this many times is not shown again (the first skip only sends it later in the deck). v_user_wine_state counts them (docs/skip_count.sql);
// until that script is run the app counts the skips it sees itself. Only answers made with the current model (they carry a `reaction`) can come back: older ones stay out.
export const SKIP_LIMIT = 2;
export const skipsOf = (s) => (!s || (s.reaction || null) !== "dont_know" ? (s && s.skip_count) || 0 : Math.max(1, Number(s.skip_count) || 0));
export const skipComesBack = (s) => !!s && s.reaction === "dont_know" && skipsOf(s) < SKIP_LIMIT;
// The small pictures for the answers (a thumb up, a thumb down, a skip arrow), as SVG text so the page and the practice card draw them the same way.
const SVG = (d, extra = "") => (px) => `<svg class="ico" viewBox="0 0 24 24" width="${px}" height="${px}" fill="currentColor" aria-hidden="true" focusable="false"${extra}><path d="${d}"/></svg>`;
const THUMB = "M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z";
export const ICONS = {
  like: SVG(THUMB),
  dislike: (px) => `<svg class="ico" viewBox="0 0 24 24" width="${px}" height="${px}" fill="currentColor" aria-hidden="true" focusable="false"><path transform="rotate(180 12 12)" d="${THUMB}"/></svg>`,
  dont_know: SVG("M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"),
  all: SVG("M4 4h6v6H4V4zm10 0h6v6h-6V4zM4 14h6v6H4v-6zm10 0h6v6h-6v-6z"),
  mic: SVG("M12 14a3 3 0 003-3V6a3 3 0 00-6 0v5a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 006 6.92V21h2v-3.08A7 7 0 0019 11h-2z"),
  more: SVG("M5 10a2 2 0 100 4 2 2 0 000-4zm7 0a2 2 0 100 4 2 2 0 000-4zm7 0a2 2 0 100 4 2 2 0 000-4z"),
};
export const iconHtml = (kind, px = 22) => (ICONS[kind] ? ICONS[kind](px) : "");
// PROVISIONAL numbers (owner, 2026-10-10: "we'll figure out what the distribution might look like"). For comparison, journal ratings weigh from +2 (would buy
// again) to -2 (do not like). They are stored in app_config (swipe_like_weight, swipe_dislike_weight, ...) so the owner can change them on the Owner page; setSwipeConfig applies them.
export const SWIPE_WEIGHT = { like: 0.5, dislike: -0.5 };
// How hard "I don't know it" pushes similar wines down the deck (0 = not at all), and how many cards apart a few of them still appear (the teaching trickle).
export const DECK_CONFIG = { demote: 0.6, teachEvery: 8, teachFrom: 0.45 };
const num = (rows, key) => {
  const r = (rows || []).find((x) => x.key === key); if (!r) return null;
  const v = r.value && typeof r.value === "object" ? r.value.value : r.value;
  const n = Number(v); return Number.isFinite(n) ? n : null;
};
// rows: app_config rows [{ key, value }]. Anything missing or silly keeps its default.
export function setSwipeConfig(rows) {
  const like = num(rows, "swipe_like_weight"), dis = num(rows, "swipe_dislike_weight"), dem = num(rows, "unknown_demote_strength"), every = num(rows, "unknown_teach_every");
  if (like !== null && like >= 0 && like <= 3) SWIPE_WEIGHT.like = like;
  if (dis !== null && dis <= 0 && dis >= -3) SWIPE_WEIGHT.dislike = dis;
  if (dem !== null && dem >= 0 && dem <= 2) DECK_CONFIG.demote = dem;
  if (every !== null && every >= 2 && every <= 50) DECK_CONFIG.teachEvery = Math.floor(every);
}
// The answer a stored swipe state stands for: "like" | "dislike" | "dont_know" | "had", or for old answers "recognized" (they said they recognized it) or null.
// state: { reaction, familiarity, interest } from v_user_wine_state.
export function reactionOf(s) {
  if (!s) return null;
  if (s.reaction) return s.reaction;
  if (s.familiarity === "unknown") return "dont_know";
  if (s.familiarity === "had") return "had";
  if (s.familiarity === "recognize") return s.interest === "nope" ? "dislike" : "recognized";
  if (s.interest === "nope") return "dislike";
  return null;
}
// What the database also writes into the old familiarity and interest columns for each answer, so the first version of the deck (backup/deck-v1-three-answers)
// can still read the same rows, and so the local copy of a swipe matches the stored one.
export const LEGACY_OF = { like: ["recognize", "try"], dislike: ["recognize", "nope"], dont_know: ["unknown", "try"], had: ["had", "try"] };
// Only a swipe made with the new model carries palate weight. Older answers never did, and still do not.
export const palateWeightOf = (s) => (s && s.reaction && SWIPE_WEIGHT[s.reaction] !== undefined ? SWIPE_WEIGHT[s.reaction] : 0);

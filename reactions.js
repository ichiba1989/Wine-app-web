// The four answers to a wine card, and the numbers that say how much each one counts. Pure: no page, no network.
//   like       swipe right      the wine appeals to them. Counts toward their taste (palate and deck) with SWIPE_WEIGHT.like.
//   dislike    swipe left       it does not. Counts against, with SWIPE_WEIGHT.dislike.
//   dont_know  a button         they do not know the wine. It counts for NOTHING in the palate. It is recorded so the deck can show fewer wines like it
//                               (but never none: they can still teach) and so recommendations and quizzes can see what the player has not met.
//   had        swipe up / button  they have had this bottle: it also goes into the journal, where rating it gives it its weight.
// Answers given before this model existed have no `reaction`; reactionOf reads their old familiarity and interest so nothing breaks.
export const REACTIONS = {
  like: { label: "Like", color: "#3A4B40" },
  dislike: { label: "Dislike", color: "#7B1E3A" },
  dont_know: { label: "I don't know it", color: "#3E5C76" },
  had: { label: "I've had this bottle", color: "#B08A3E" },
};
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

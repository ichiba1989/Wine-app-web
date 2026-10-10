// Quiz tags: the link between a quiz question and the grapes, places, producers and styles it is about. Pure: no page, no network.
// Two jobs. (1) Editors tag questions (Editor tab, Quiz): the app suggests tags, the editor ticks the right ones and may add up to two more from a pull-down list.
// The owner adds new tags (Owner page, Tags tab) and from then on they are in the suggestions and the pull-down. (2) The quiz uses the tags: a question tagged with
// something the player said "I don't know it" to (see gapsOf in deck.js) is asked sooner (boostFor, used by learn.js).
// A tag's key is "kind:folded name", the same keys the Discover deck uses for grapes, regions, countries, producers and styles, so the two line up with no extra mapping.
export const TAG_KINDS = [
  { id: "grape", label: "Grape" }, { id: "region", label: "Region or appellation" }, { id: "country", label: "Country" },
  { id: "producer", label: "Producer" }, { id: "style", label: "Style" }, { id: "theme", label: "Theme" },
];
export const MAX_PULLDOWN = 2;                 // how many tags an editor may add from the pull-down in one edit (suggested tags are not limited)
export const SUGGEST_MIN = 5, SUGGEST_MAX = 10;
export const fold = (s) => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export const tagKey = (t) => (t && t.kind && t.kind !== "theme" && fold(t.name) ? t.kind + ":" + fold(t.name) : "");
// Which kinds of tag usually belong to each quiz topic (used only to fill up the suggestions).
const TOPIC_KINDS = { Grapes: ["grape"], Regions: ["region", "country"], Producers: ["producer"], Winemaking: ["theme", "style"], "Other alcohol": ["theme"] };

// The tags to offer for a question being edited. form: { question, correct, d0, d1, d2, topic }; tags: [{ id, kind, name }]; usage: Map(tag id -> how many questions have it).
// A tag is suggested when its name appears as whole words in the question or the answers: in the question or the correct answer counts most, in a wrong answer less.
// If fewer than SUGGEST_MIN match, popular tags of the topic's kinds fill the list (only ones already used on other questions). Never more than SUGGEST_MAX.
// This only suggests: the editor decides. Nothing is inferred beyond the words on the screen.
export function suggestTags(form, tags, usage = new Map()) {
  const pad = (s) => " " + fold(s) + " ";
  const q = pad(form.question), c = pad(form.correct), d = pad([form.d0, form.d1, form.d2].join(" "));
  const scored = [];
  for (const t of tags || []) {
    const n = fold(t.name); if (n.length < 3) continue;
    const needle = " " + n + " ";
    const s = (q.includes(needle) ? 3 : 0) + (c.includes(needle) ? 3 : 0) + (d.includes(needle) ? 1 : 0);
    if (s > 0) scored.push({ t, s: s + Math.min(n.length, 30) / 100 });
  }
  scored.sort((a, b) => b.s - a.s || a.t.name.localeCompare(b.t.name));
  const out = scored.slice(0, SUGGEST_MAX).map((x) => x.t);
  if (out.length < SUGGEST_MIN) {
    const kinds = TOPIC_KINDS[form.topic] || [];
    const have = new Set(out.map((t) => t.id));
    const fill = (tags || []).filter((t) => kinds.includes(t.kind) && !have.has(t.id) && (usage.get(t.id) || 0) > 0)
      .sort((a, b) => (usage.get(b.id) || 0) - (usage.get(a.id) || 0) || a.name.localeCompare(b.name));
    for (const t of fill) { if (out.length >= SUGGEST_MIN) break; out.push(t); }
  }
  return out;
}
// How many tag ids the editor has picked from the pull-down that are still ticked, and whether another may be added.
export const pullCount = (selected, pulled) => [...pulled].filter((id) => selected.has(id)).length;
export const canPull = (selected, pulled) => pullCount(selected, pulled) < MAX_PULLDOWN;
// What to save: the tag ids to add and to remove, given the ids before and after.
export function tagDiff(before, after) {
  const b = new Set(before), a = new Set(after);
  return { add: [...a].filter((id) => !b.has(id)), remove: [...b].filter((id) => !a.has(id)) };
}
// Tags grouped by kind for the pull-down, in TAG_KINDS order, names A to Z, leaving out the ids in `skip`.
export function pullGroups(tags, skip = new Set()) {
  return TAG_KINDS.map((k) => ({ kind: k, tags: (tags || []).filter((t) => t.kind === k.id && !skip.has(t.id)).sort((a, b) => a.name.localeCompare(b.name)) })).filter((g) => g.tags.length);
}
// How much each key the player has not met weighs, 0 to 1: gaps is gapsOf(model) from deck.js ([{ key, dontKnow, known }]).
export function gapWeights(gaps) {
  const m = new Map();
  for (const g of gaps || []) m.set(g.key, g.dontKnow / (g.dontKnow + g.known + 1.5));
  return m;
}
// For each question, how much it is about something the player has not met: the largest weight among its tags (0 when none). tagsByQ: Map(question id -> [{ kind, name }]).
export function boostFor(tagsByQ, weights) {
  const out = new Map();
  if (!tagsByQ || !weights || !weights.size) return out;
  tagsByQ.forEach((tags, qid) => { let best = 0; for (const t of tags) best = Math.max(best, weights.get(tagKey(t)) || 0); if (best > 0) out.set(qid, best); });
  return out;
}
// Puts the questions about unmet things in every other place among the unseen ones (keeping their order within each group), so the quiz leans toward
// what the player does not know without turning into a list of only those.
export const BOOST_AT = 0.25;
export function weave(ids, boost) {
  if (!boost || !boost.size) return ids;
  const hot = ids.filter((id) => (boost.get(id) || 0) >= BOOST_AT), rest = ids.filter((id) => (boost.get(id) || 0) < BOOST_AT);
  if (!hot.length) return ids;
  const out = [];
  for (let i = 0; i < Math.max(hot.length, rest.length); i++) { if (i < hot.length) out.push(hot[i]); if (i < rest.length) out.push(rest[i]); }
  return out;
}

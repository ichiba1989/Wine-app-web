// Sorting for the Editor lists that hold a lot of data: wines (Structure, Photos), quiz questions, flags and feedback.
// Pure: no browser, no network, so every rule can be tested on its own. A value that is missing always sorts last, and equal values
// keep a sensible second order (producer, then newest vintage), so a list never jumps around.
import { esc } from "./logic.js?v=10";

const fold = (s) => String(s == null ? "" : s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const LAST = "\uffff";
const text = (v) => (v ? fold(v) : LAST);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const year = (c) => (/^\d{4}$/.test(String(c.vintage || "")) ? Number(c.vintage) : -1);   // NV and unknown after the years
const STYLE_ORDER = ["red", "white", "sparkling", "rose", "fortified"];

// ---------------------------------------------------------------- wines
export const STRUCTURE_SORTS = [
  { id: "producer", label: "Producer" },
  { id: "wine", label: "Wine name" },
  { id: "country", label: "Country" },
  { id: "region", label: "Region" },
  { id: "grape", label: "Grape" },
  { id: "style", label: "Type of wine" },
  { id: "vintage", label: "Vintage (newest)" },
];
export const PHOTO_SORTS = [
  { id: "default", label: "Needs a photo first" },
  ...STRUCTURE_SORTS,
  { id: "source", label: "Photo source" },
];
// Photos from the web come first, because those are the ones to replace; wines with no photo go last.
export const SOURCE_ORDER = ["found_online", "producer", "own_photography", "verified_user", "official"];
const grapeOf = (c) => (Array.isArray(c.grapes) && c.grapes[0]) || (Array.isArray(c.ruleGrapes) && c.ruleGrapes[0]) || c.grape || "";
const keys = {
  producer: (c) => [text(c.producer)],
  wine: (c) => [text(c.cuvee), text(c.producer)],
  country: (c) => [text(c.country), text(c.region || c.appellation)],
  region: (c) => [text(c.region || c.appellation), text(c.country)],
  grape: (c) => [text(grapeOf(c)), text(c.producer)],
  vintage: () => [],   // nothing to compare first: the newest-vintage rule below does the work
  style: (c) => [String(STYLE_ORDER.indexOf(c.style) < 0 ? 9 : STYLE_ORDER.indexOf(c.style)), text(c.producer)],
  source: (c) => [String(!c.image ? 9 : SOURCE_ORDER.indexOf(c.imageKind) < 0 ? 8 : SOURCE_ORDER.indexOf(c.imageKind)), text(c.producer)],
};
// Returns a new list. "default" (and anything unknown) keeps the order the caller already chose.
export function sortWines(list, by) {
  const k = keys[by];
  if (!k) return [...list];
  return [...list].sort((a, b) => {
    const ka = k(a), kb = k(b);
    for (let i = 0; i < ka.length; i++) { const r = cmp(ka[i], kb[i]); if (r) return r; }
    return year(b) - year(a) || cmp(text(a.producer), text(b.producer));
  });
}

// ---------------------------------------------------------------- quiz questions
export const QUESTION_SORTS = [
  { id: "orig", label: "Original order" },
  { id: "topic", label: "Topic" },
  { id: "difficulty", label: "Difficulty (easiest first)" },
  { id: "question", label: "Question A to Z" },
  { id: "answer", label: "Answer A to Z" },
];
const TOPIC_ORDER = ["Grapes", "Regions", "Producers", "Winemaking", "Other alcohol"];
const DIFF_ORDER = ["beginner", "enthusiast", "professional", "scholar"];
const rank = (order, v) => (order.indexOf(v) < 0 ? order.length : order.indexOf(v));
export function sortQuestions(list, by) {
  const q = (x) => text(x.question);
  const by2 = {
    topic: (a, b) => rank(TOPIC_ORDER, a.topic) - rank(TOPIC_ORDER, b.topic) || rank(DIFF_ORDER, a.difficulty) - rank(DIFF_ORDER, b.difficulty) || cmp(q(a), q(b)),
    difficulty: (a, b) => rank(DIFF_ORDER, a.difficulty) - rank(DIFF_ORDER, b.difficulty) || rank(TOPIC_ORDER, a.topic) - rank(TOPIC_ORDER, b.topic) || cmp(q(a), q(b)),
    question: (a, b) => cmp(q(a), q(b)),
    answer: (a, b) => cmp(text(a.correct_answer), text(b.correct_answer)) || cmp(q(a), q(b)),
  }[by];
  return by2 ? [...list].sort(by2) : [...list];
}

// ---------------------------------------------------------------- flags and feedback
export const FLAG_SORTS = [
  { id: "newest", label: "Newest first" },
  { id: "oldest", label: "Oldest first" },
  { id: "type", label: "Quiz questions first" },
  { id: "reason", label: "Reason A to Z" },
];
const when = (x) => String(x.created_at || "");
export function sortFlags(list, by) {
  const f = {
    newest: (a, b) => cmp(when(b), when(a)),
    oldest: (a, b) => cmp(when(a), when(b)),
    type: (a, b) => (a.target_type === "quiz_question" ? 0 : 1) - (b.target_type === "quiz_question" ? 0 : 1) || cmp(when(b), when(a)),
    reason: (a, b) => cmp(text(a.reason), text(b.reason)) || cmp(when(b), when(a)),
  }[by];
  return f ? [...list].sort(f) : [...list];
}
export const FEEDBACK_SORTS = [
  { id: "newest", label: "Newest first" },
  { id: "oldest", label: "Oldest first" },
  { id: "type", label: "Broken first, then type" },
  { id: "screen", label: "Screen A to Z" },
];
const KIND_ORDER = ["bug", "confusing", "idea", "other"];
export function sortFeedback(list, by) {
  const f = {
    newest: (a, b) => cmp(when(b), when(a)),
    oldest: (a, b) => cmp(when(a), when(b)),
    type: (a, b) => rank(KIND_ORDER, a.kind) - rank(KIND_ORDER, b.kind) || cmp(when(b), when(a)),
    screen: (a, b) => cmp(text(a.screen), text(b.screen)) || cmp(when(b), when(a)),
  }[by];
  return f ? [...list].sort(f) : [...list];
}

// ---------------------------------------------------------------- the control
// A "Sort by" menu in the same style as the other lists. attr is the data attribute that carries the change, e.g. "data-editor-sort".
export const sortSelectHtml = (attr, options, current, value = "") =>
  `<select class="sortsel" ${attr}="${esc(value)}" aria-label="Sort this list by">${options.map((o) => `<option value="${esc(o.id)}"${o.id === current ? " selected" : ""}>Sort by: ${esc(o.label)}</option>`).join("")}</select>`;

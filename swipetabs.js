// The Swipes tab as a tab view: which wines show on each tab, how they are grouped (grape, region, producer, vintage, how well the app thinks they fit),
// filtered and sorted. Pure: no page, no network. views.js draws it, app.js keeps the choices in state.sw.
// An "entry" is { card, kind } where kind is liked, disliked, dontKnow, rec (older "recognized" answers), tried (rated wines found through Discover) or had.
import { fold } from "./tags.js?v=1";

export const SW_START = { tab: "ld", sub: "liked", status: "all", group: "varietal", sort: "recent", q: "", style: "all", open: {} };
export const SW_TABS = [{ id: "ld", label: "Like and dislike" }, { id: "dk", label: "Don't know" }, { id: "all", label: "All" }];
export const SW_SUBS = [{ id: "liked", label: "Liked" }, { id: "disliked", label: "Disliked" }];
export const SW_KINDS = [
  { id: "liked", label: "Liked" }, { id: "disliked", label: "Disliked" }, { id: "dontKnow", label: "I don't know it" },
  { id: "tried", label: "Rated" }, { id: "had", label: "Had this bottle" }, { id: "rec", label: "Recognized (earlier answers)" },
];
export const SW_GROUPS = [
  { id: "recent", label: "None" }, { id: "varietal", label: "Grape" }, { id: "region", label: "Region" }, { id: "country", label: "Country" },
  { id: "producer", label: "Producer" }, { id: "type", label: "Type of wine" }, { id: "vintage", label: "Vintage" }, { id: "match", label: "How well it fits you" },
];
export const SW_SORTS = [{ id: "recent", label: "Newest swipe" }, { id: "name", label: "Name" }, { id: "vintage", label: "Vintage (newest)" }, { id: "match", label: "Best fit for you" }];
export const FIT_BANDS = [{ id: "strong", label: "A strong fit", min: 0.6 }, { id: "maybe", label: "Might suit you", min: 0.45 }, { id: "less", label: "Less likely", min: 0 }];
const NONE = "Not stated";
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// The wines on the current tab, as entries. All gathers every list (a rated wine and a had-it wine appear once each).
export function entriesFor(lists, sw) {
  const mk = (kind, cards) => cards.map((card) => ({ card, kind }));
  if (sw.tab === "dk") return mk("dontKnow", lists.dontKnow);
  if (sw.tab === "all") {
    const rated = new Set(lists.tried.map((c) => c.id));   // a had-it wine that was rated is listed once, as Rated
    const all = [...mk("liked", lists.liked), ...mk("disliked", lists.disliked), ...mk("dontKnow", lists.dontKnow), ...mk("tried", lists.tried), ...mk("had", lists.had.filter((c) => !rated.has(c.id))), ...mk("rec", lists.rec)];
    return sw.status === "all" ? all : all.filter((e) => e.kind === sw.status);
  }
  return sw.sub === "disliked" ? mk("disliked", lists.disliked) : mk("liked", lists.liked);
}
export const tabCounts = (lists) => ({ ld: lists.liked.length + lists.disliked.length, dk: lists.dontKnow.length, all: entriesFor(lists, { tab: "all", status: "all" }).length, liked: lists.liked.length, disliked: lists.disliked.length });

const grapeOf = (c) => (Array.isArray(c.grapes) && c.grapes[0]) || (Array.isArray(c.ruleGrapes) && c.ruleGrapes[0]) || c.grape || "";
// The wine types present in these entries, for the Type filter.
export const stylesIn = (entries) => [...new Set(entries.map((e) => e.card.style).filter(Boolean))].sort();
// Search by anything on the label, plus the type filter.
export function filterEntries(entries, { q = "", style = "all" } = {}) {
  const term = fold(q);
  return entries.filter((e) => (style === "all" || e.card.style === style)
    && (!term || fold([e.card.producer, e.card.cuvee, e.card.vintage, grapeOf(e.card), (e.card.grapes || []).join(" "), e.card.region, e.card.appellation, e.card.country, e.card.style].join(" ")).includes(term)));
}
const yearOf = (c) => { const n = Number(c.vintage); return Number.isFinite(n) && n > 1000 ? n : 0; };
const nameKey = (c) => fold(c.producer) + " " + fold(c.cuvee);
// Sorts entries. order: { wine id -> how recent the swipe was (bigger is newer) }; match: Map(wine id -> 0..1).
export function sortEntries(entries, by, { order = {}, match = new Map() } = {}) {
  const f = {
    recent: (a, b) => (order[b.card.id] ?? -1) - (order[a.card.id] ?? -1),
    name: (a, b) => cmp(nameKey(a.card), nameKey(b.card)),
    vintage: (a, b) => (yearOf(b.card) || -1) - (yearOf(a.card) || -1) || cmp(nameKey(a.card), nameKey(b.card)),
    match: (a, b) => (match.get(b.card.id) ?? -1) - (match.get(a.card.id) ?? -1) || cmp(nameKey(a.card), nameKey(b.card)),
  }[by] || (() => 0);
  return [...entries].sort(f);
}
// What sort suits a grouping best inside each group.
export const defaultSortFor = (group) => ({ producer: "vintage", vintage: "name", match: "match" }[group] || "name");

export const fitBand = (score) => (score == null ? null : FIT_BANDS.find((b) => score >= b.min));
export function groupLabel(e, by, match = new Map()) {
  const c = e.card;
  if (by === "varietal") return grapeOf(c) || NONE;
  if (by === "region") return c.region || c.appellation || NONE;
  if (by === "country") return c.country || NONE;
  if (by === "producer") return c.producer || NONE;
  if (by === "type") return c.style || NONE;
  if (by === "vintage") { const y = yearOf(c); return y ? Math.floor(y / 10) * 10 + "s" : String(c.vintage || "").toUpperCase() === "NV" ? "Non-vintage" : NONE; }
  if (by === "match") { const b = fitBand(match.get(c.id)); return b ? b.label : NONE; }
  return "";
}
// Groups of sorted entries: [{ id, label, entries }]. "recent" is one flat group with no label. Groups run A to Z (newest decade first for vintage,
// best fit first for match), "Not stated" last.
export function groupEntries(entries, by, opts = {}) {
  const sorted = sortEntries(entries, opts.sort || "recent", opts);
  if (!by || by === "recent") return [{ id: "all", label: "", entries: sorted }];
  const m = new Map();
  for (const e of sorted) { const l = groupLabel(e, by, opts.match); if (!m.has(l)) m.set(l, []); m.get(l).push(e); }
  const rank = (l) => (by === "match" ? FIT_BANDS.findIndex((b) => b.label === l) : 0);
  const labels = [...m.keys()].sort((a, b) => (a === NONE) - (b === NONE) || (by === "match" ? rank(a) - rank(b) : by === "vintage" ? (/^\d/.test(b) - /^\d/.test(a)) || cmp(b, a) : cmp(fold(a), fold(b))));
  return labels.map((label) => ({ id: fold(label) || "none", label, entries: m.get(label) }));
}

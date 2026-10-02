// How the catalog grows from what players add. Pure logic: no page, no network, so it can be tested on its own.
//
// 1. Players add wines to their journals that are not in the catalog. When ENOUGH journal entries (10 by default) are for the SAME wine
//    (same producer, wine name, type and grapes; the vintage does not matter), that wine becomes a CANDIDATE for the catalog.
// 2. An editor decides: add it (it is created as "pending review" and stays out of the deck until the editor publishes it) or not now.
// 3. "The same wine, minus the vintage" is checked against the catalog. Only the MOST RECENT vintage is used for the deck;
//    older vintages of the same wine are archived (kept, with players' swipes and journals intact, but not shown in Discover again).
import { fold, checkGrapeText, splitGrapeText } from "./grapes.js?v=1";

export const DEFAULT_RULES = { minEntries: 10, minPeople: 1 };
// app_config rows [{ key, value }] -> rules. Anything missing or silly falls back to the default.
export function rulesFrom(rows) {
  const get = (k) => { const r = (rows || []).find((x) => x.key === k); const n = r ? Number(typeof r.value === "object" && r.value !== null ? r.value.value : r.value) : NaN; return Number.isFinite(n) && n >= 1 ? Math.floor(n) : null; };
  return { minEntries: get("catalog_candidate_min_entries") ?? DEFAULT_RULES.minEntries, minPeople: get("catalog_candidate_min_people") ?? DEFAULT_RULES.minPeople };
}

// ---------------------------------------------------------------- "the same wine, minus the vintage"
// Producers and wine names: no capitals, accents, punctuation or spaces ("Château d'Or" and "chateau d or" are the same name).
export const nameKey = (s) => String(s == null ? "" : s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, "");
const grapeSet = (names) => [...new Set((names || []).map(fold).filter(Boolean))].sort().join("|");
export function grapeKeyOfText(text) {
  const r = checkGrapeText(text || "");
  return r.ok ? grapeSet(r.names) : grapeSet(splitGrapeText(text));
}
// The loose key (producer, wine name, type, grapes) is how a submission is matched with the catalog.
export const looseKey = (x) => [nameKey(x.producer), nameKey(x.wine_name ?? x.cuvee ?? ""), x.style || "", x.grapeKey ?? grapeSet(x.grapes)].join("¦");
// The strict key also needs the same appellation. It decides which catalog vintages are the same wine, because archiving removes a wine from Discover.
export const strictKey = (x) => looseKey(x) + "¦" + nameKey(x.appellation || "");
const cardId = (c) => c.id;
const yearOf = (c) => (/^\d{4}$/.test(String(c.vintage || "")) ? Number(c.vintage) : null);
const live = (c) => !c.archived && (!c.wineStatus || c.wineStatus === "verified");

// ---------------------------------------------------------------- candidates from player submissions
// rows: one per wine a player typed in, with how many journal entries use it:
//   { user_wine_id, person, producer, wine_name, vintage_year, is_non_vintage, grape_text, region_text, style, entries }
// decisions: [{ key, decision: 'added'|'dismissed', entries_at_decision }]
export function groupSubmissions(rows, { rules = DEFAULT_RULES, cards = [], decisions = [] } = {}) {
  const groups = new Map();
  (rows || []).forEach((r) => {
    if (!r.producer || !(r.entries > 0)) return;
    const key = looseKey({ producer: r.producer, wine_name: r.wine_name, style: r.style, grapeKey: grapeKeyOfText(r.grape_text) });
    if (!groups.has(key)) groups.set(key, { key, rows: [] });
    groups.get(key).rows.push(r);
  });
  const decided = new Map((decisions || []).map((d) => [d.key, d]));
  const byLoose = new Map();
  cards.filter((c) => !c.archived).forEach((c) => { const k = looseKey({ producer: c.producer, cuvee: c.cuvee, style: c.style, grapes: c.grapes }); if (!byLoose.has(k)) byLoose.set(k, []); byLoose.get(k).push(c); });
  const candidates = [], waiting = [];
  for (const g of groups.values()) {
    const entries = g.rows.reduce((n, r) => n + r.entries, 0);
    const people = new Set(g.rows.map((r) => r.person)).size;
    const top = (pick) => { const m = new Map(); g.rows.forEach((r) => { const v = pick(r); if (v) m.set(v, (m.get(v) || 0) + r.entries); }); return [...m.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0]?.[0] || ""; };
    // vintages with their entries, newest first (NV last)
    const vm = new Map();
    g.rows.forEach((r) => { const label = r.is_non_vintage ? "NV" : r.vintage_year ? String(r.vintage_year) : "?"; vm.set(label, (vm.get(label) || 0) + r.entries); });
    const rank = (l) => (l === "?" ? [2, 0] : l === "NV" ? [1, 0] : [0, -Number(l)]);
    const vintages = [...vm.entries()].map(([label, n]) => ({ label, entries: n })).sort((a, b) => rank(a.label)[0] - rank(b.label)[0] || rank(a.label)[1] - rank(b.label)[1]);
    const years = vintages.map((v) => Number(v.label)).filter((n) => Number.isFinite(n) && n > 1000);
    const newest = years.length ? { year: Math.max(...years), nonVintage: false } : { year: null, nonVintage: true };
    const first = g.rows[0];
    const cand = {
      key: g.key, producer: top((r) => r.producer), wine_name: top((r) => r.wine_name), style: top((r) => r.style) || first.style || "unknown",
      grape_text: top((r) => r.grape_text), region_text: top((r) => r.region_text), entries, people, vintages, newest,
      vintageNote: vintages.some((v) => v.label !== "?") ? "" : "No vintage was given: it will be added as non-vintage. Check it.",
      name: [top((r) => r.producer), top((r) => r.wine_name)].filter(Boolean).join(" "),
    };
    // what the catalog already has of this wine
    const matches = byLoose.get(g.key) || [];
    cand.matchIds = matches.map(cardId);
    const catalogYears = matches.map(yearOf).filter((y) => y != null);
    const newestCatalog = catalogYears.length ? Math.max(...catalogYears) : null;
    const catalogHasNV = matches.some((c) => c.vintage === "NV");
    cand.kind = !matches.length ? "new" : "newer_vintage";
    cand.catalogNewest = newestCatalog;
    if (matches.length) {
      const covered = newest.nonVintage ? catalogHasNV || newestCatalog != null : newestCatalog != null && newest.year <= newestCatalog;
      if (covered) continue;                     // the catalog already has this wine, as new or newer: nothing to add
    }
    const d = decided.get(g.key);
    if (d && d.decision === "added") continue;
    const need = d && d.decision === "dismissed" ? (d.entries_at_decision || 0) + rules.minEntries : rules.minEntries;
    if (entries >= need && people >= rules.minPeople) candidates.push(cand);
    else waiting.push({ ...cand, need });
  }
  candidates.sort((a, b) => b.entries - a.entries || a.name.localeCompare(b.name));
  waiting.sort((a, b) => b.entries - a.entries || a.name.localeCompare(b.name));
  return { candidates, waiting };
}

// What it takes to add a candidate: a pending wine with its most recent vintage, the grapes the players named, and where it came from.
export function planPromotion(cand, lists = { producers: [], grapes: [] }) {
  const producer = (lists.producers || []).find((p) => nameKey(p.name) === nameKey(cand.producer));
  const grapeNames = checkGrapeText(cand.grape_text || "").names;
  const known = new Map((lists.grapes || []).map((g) => [fold(g.name), g]));
  return {
    key: cand.key, producerName: cand.producer, existingProducerId: producer ? producer.id : null,
    wineName: cand.wine_name || null, style: cand.style || "unknown",
    vintageYear: cand.newest.nonVintage ? null : cand.newest.year, nonVintage: !!cand.newest.nonVintage,
    grapes: grapeNames.map((n) => ({ name: n, id: known.has(fold(n)) ? known.get(fold(n)).id : null })),
    listedAs: [cand.producer, cand.wine_name, cand.newest.nonVintage ? "NV" : cand.newest.year].filter(Boolean).join(" ") + ` (${cand.entries} journal entries from ${cand.people} ${cand.people === 1 ? "person" : "people"})`,
    entries: cand.entries,
  };
}

// ---------------------------------------------------------------- the same wine, different vintages
// Cards in the deck are one per vintage. Returns the wines that exist in more than one numeric vintage and have not been tidied:
//   [{ key, name, keep: card (the most recent), archive: [older cards], years: [..] }]
export function duplicateGroups(cards) {
  const map = new Map();
  (cards || []).filter((c) => live(c) && yearOf(c) != null).forEach((c) => {
    const k = strictKey({ producer: c.producer, cuvee: c.cuvee, style: c.style, grapes: c.grapes, appellation: c.appellation });
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(c);
  });
  const out = [];
  for (const [key, list] of map) {
    const years = [...new Set(list.map(yearOf))];
    if (years.length < 2) continue;
    const newest = Math.max(...years);
    const keep = list.filter((c) => yearOf(c) === newest).sort((a, b) => String(a.id).localeCompare(String(b.id)))[0];
    const archive = list.filter((c) => yearOf(c) < newest);
    out.push({ key, name: [keep.producer, keep.cuvee, keep.grapes.length === 1 ? keep.grapes[0] : ""].filter(Boolean).join(" "), keep, archive, years: years.sort((a, b) => b - a) });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
// After a wine is published: the older vintages of the SAME wine to archive. Returns { keep, archive } or null when nothing is to be done.
export function archivePlanFor(cards, vintageId) {
  const me = (cards || []).find((c) => c.id === vintageId);
  if (!me || yearOf(me) == null) return null;
  const g = duplicateGroups(cards).find((x) => x.keep.id === vintageId || x.archive.some((c) => c.id === vintageId));
  if (!g) return null;
  if (g.keep.id !== vintageId && !g.archive.some((c) => c.id === vintageId)) return null;
  return { keep: g.keep, archive: g.archive };
}

// ---------------------------------------------------------------- a new vintage can borrow the photo of an older one
// A wine's label changes little from year to year, so when a vintage has no photo but another vintage of the SAME wine has one, an editor can reuse it.
// Same wine here means the same producer, wine name, type and grapes (the place is not compared: a new vintage often has none yet).
// Returns { id, vintage } of the best vintage to borrow from (the most recent one with a photo), or null. Archived older vintages count.
export function reusablePhoto(cards, card) {
  if (!card || card.image) return null;
  const key = looseKey({ producer: card.producer, cuvee: card.cuvee, style: card.style, grapes: card.grapes });
  const rank = (c) => (/^\d{4}$/.test(String(c.vintage || "")) ? Number(c.vintage) : 0);   // non-vintage last
  const from = (cards || [])
    .filter((c) => c.id !== card.id && c.image && c.wineStatus !== "retired" && looseKey({ producer: c.producer, cuvee: c.cuvee, style: c.style, grapes: c.grapes }) === key)
    .sort((a, b) => rank(b) - rank(a) || String(a.id).localeCompare(String(b.id)))[0];
  return from ? { id: from.id, vintage: from.vintage || "" } : null;
}

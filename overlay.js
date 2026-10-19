// What the phone has done but the server has not heard yet, laid over what the server last said. Pure: no page, no network.
// Each change waiting in the outbox (offline.js) carries an EFFECT: a small description of what it did, e.g. "this wine was swiped thumbs up" or "this journal entry was added".
// The screens read the lists from the database (or from the copy kept on the phone) and pass them through these functions, so a swipe or an entry made offline shows up at once, and the same
// quiz rules ("seen", "incorrect", the archive) keep working. When the change reaches the server its effect goes away and the real row takes its place on the next refresh.
// Effects: { t: "state", wvid, row } a swipe; { t: "stateDelete", wvid }; { t: "entry", row } a new journal entry (row.id is the temporary id); { t: "entryPatch", id, patch, perceptions? };
//          { t: "entryDelete", id }; { t: "answer", qid, result } a quiz answer; { t: "archiveRemove", qid }; { t: "tasting", id, data }; { t: "visit", row } a restaurant visit.

// The offline layer (offline.js) registers itself here so the data functions can read the effects without importing it.
let current = null, cards = () => null;
export const setOffline = (o) => { current = o; };
export const setCardLookup = (fn) => { cards = fn || (() => null); };
export const pendingEffects = () => (current && current.effects ? current.effects() : []);
export const isOffline = () => !!current && current.online && !current.online();

// ---------------------------------------------------------------- swipes
export function overlayStates(rows, effects = pendingEffects()) {
  const by = new Map((rows || []).map((r) => [r.wine_vintage_id, r]));
  for (const e of effects) {
    if (e.t === "state") {
      const prev = by.get(e.wvid), r = e.row || {};
      const was = prev ? (Number(prev.skip_count) || (prev.reaction === "dont_know" ? 1 : 0)) : 0;
      const skip_count = r.reaction === "dont_know" ? was + 1 : (prev && Number(prev.skip_count)) || 0;
      by.set(e.wvid, { wine_vintage_id: e.wvid, familiarity: r.familiarity ?? null, interest: r.interest ?? null, reaction: r.reaction ?? null, skip_count,
        first_swiped_at: (prev && prev.first_swiped_at) || r.last_swiped_at, last_swiped_at: r.last_swiped_at, pending: true });
    } else if (e.t === "stateDelete") by.delete(e.wvid);
  }
  return [...by.values()];
}
// The two counts on the Discover screen: what the server counted plus what is waiting (a removed swipe is not subtracted: the count is only a guide until the next sync).
export function overlayCounts(base, effects = pendingEffects()) {
  const out = { swipes: (base && base.swipes) || 0, journal: (base && base.journal) || 0 };
  for (const e of effects) { if (e.t === "state") out.swipes++; else if (e.t === "entry") out.journal++; else if (e.t === "entryDelete") out.journal = Math.max(0, out.journal - 1); }
  return out;
}

// ---------------------------------------------------------------- journal
// What a journal row says about a catalog wine (the same fields v_journal_entries takes from the catalog).
export function wineFieldsOfCard(c) {
  if (!c) return {};
  const v = String(c.vintage == null ? "" : c.vintage);
  return { producer: c.producer || null, wine_name: c.cuvee || null, vintage_year: /^\d{4}$/.test(v) ? Number(v) : null, is_non_vintage: v === "NV", style: c.style || null,
    country: c.country || null, region: c.region || c.appellation || null, grape: ((c.grapes && c.grapes[0]) || (c.ruleGrapes && c.ruleGrapes[0])) || null, catalog_style: c.style || null };
}
// A journal row made on the phone. fields come from the wine (a catalog card, or the wine the player typed in); consumption is what buildReview made (date, verdict, notes ...).
export function entryRowOf({ id, userId, consumption = {}, wineVintageId = null, userWineId = null, fields = null, origin = "manual", now = new Date().toISOString() }) {
  const f = fields || (wineVintageId ? wineFieldsOfCard(cards(wineVintageId)) : {});
  return { id, user_id: userId, consumed_on: consumption.consumed_on || now.slice(0, 10), verdict: consumption.verdict ?? null, origin, food: consumption.food ?? null, occasion: consumption.occasion ?? null,
    notes: consumption.notes ?? null, purchase_price_cents: consumption.purchase_price_cents ?? null, wine_vintage_id: wineVintageId, user_wine_id: userWineId, is_outside_wine: !!userWineId,
    producer: null, wine_name: null, vintage_year: null, is_non_vintage: false, style: null, country: null, region: null, grape: null, catalog_style: null, ...f,
    ...(consumption.style_override ? { style: consumption.style_override } : {}), first_photo_path: null, created_at: now, pending: true };
}
export function overlayJournal(rows, effects = pendingEffects()) {
  let out = (rows || []).slice();
  for (const e of effects) {
    // a "had it" swipe makes an entry only when the wine has none yet (the same rule as record_reaction)
    const hadAlready = e.t === "entry" && e.row && String(e.row.id).startsWith("tmp_had_") && out.some((r) => r.wine_vintage_id === e.row.wine_vintage_id);
    if (e.t === "entry" && e.row && !hadAlready && !out.some((r) => r.id === e.row.id)) {
      const r = e.row;
      out.push(r.wine_vintage_id && !r.producer && !r.wine_name ? { ...r, ...wineFieldsOfCard(cards(r.wine_vintage_id)), pending: true } : { ...r, pending: true });
    } else if (e.t === "entryPatch") out = out.map((r) => (r.id === e.id ? { ...r, ...e.patch, pending: true } : r));
    else if (e.t === "entryDelete") out = out.filter((r) => r.id !== e.id);
  }
  return out.sort((a, b) => String(b.consumed_on || "").localeCompare(String(a.consumed_on || "")) || String(b.created_at || "").localeCompare(String(a.created_at || "")));
}
// The structure ratings and the tasting grid of an entry: the newest waiting change for that entry wins; otherwise what the server said.
export function overlayPerceptions(id, rows, effects = pendingEffects()) {
  let out = rows;
  for (const e of effects) {
    const mine = (e.t === "entry" && e.row && e.row.id === id) || (e.t === "entryPatch" && e.id === id);
    if (mine && Array.isArray(e.perceptions)) out = e.perceptions.map((p) => ({ dimension_key: p.dimension_key, value: p.value, default_value: p.default_value, adjusted: p.adjusted }));
  }
  return out;
}
export function overlayTasting(id, data, effects = pendingEffects()) {
  let out = data;
  for (const e of effects) if (e.t === "tasting" && e.id === id) out = e.data || {};
  return out;
}

// ---------------------------------------------------------------- the quiz
// latest: [{ question_id, result }] (the last answer to each question), archive: [{ question_id }] (missed or skipped questions kept for review). Same rules as the database
// (learn.js recordAnswer): a miss or a skip goes into the archive and stays until the player removes it.
export function overlayQuiz(latest, archive, effects = pendingEffects()) {
  const last = new Map((latest || []).map((r) => [r.question_id, r.result])), keep = new Set((archive || []).map((r) => r.question_id));
  for (const e of effects) {
    if (e.t === "answer") { last.set(e.qid, e.result); if (e.result === "wrong" || e.result === "unknown") keep.add(e.qid); }
    else if (e.t === "archiveRemove") keep.delete(e.qid);
  }
  return { latest: [...last].map(([question_id, result]) => ({ question_id, result })), archive: [...keep].map((question_id) => ({ question_id })) };
}

// ---------------------------------------------------------------- restaurant visits
// A visit saved with no signal appears at the top of the list at once (marked pending) until it uploads and the real row takes its place.
export function overlayVisits(rows, effects = pendingEffects()) {
  const out = [...(rows || [])];
  effects.filter((e) => e.t === "visit").forEach((e, i) => out.unshift({ ...e.row, id: "pending-" + i, created_at: e.row.created_at || new Date().toISOString(), pending: true }));
  return out;
}

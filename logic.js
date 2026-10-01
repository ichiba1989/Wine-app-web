import { fold, splitGrapeText, checkGrapeText, grapeProblem } from "./grapes.js?v=1";
// Pure logic for the wine app web page. No browser and no network in this file,
// so every rule here can be tested on its own.

export const COLORS = { ink: "#16261D", muted: "#5A6A5F", wine: "#7B1E3A", slate: "#3E5C76", moss: "#3A4B40", line: "#C3CFC1" };

// A swipe records how familiar the wine is; the switch under the card records interest.
export const FAMILIARITY = {
  recognize: { label: "I recognize it", color: COLORS.slate },
  unknown: { label: "I don't know it", color: COLORS.moss },
  had: { label: "I've had this bottle", color: COLORS.wine },
};
export const INTEREST = {
  try: { label: "Interested", color: COLORS.wine },
  nope: { label: "Not interested", color: COLORS.moss },
};

export const FLAGS = {
  Italy: "🇮🇹", France: "🇫🇷", Spain: "🇪🇸", Germany: "🇩🇪", USA: "🇺🇸", Australia: "🇦🇺", Chile: "🇨🇱",
  Argentina: "🇦🇷", "New Zealand": "🇳🇿", Portugal: "🇵🇹", Austria: "🇦🇹", "South Africa": "🇿🇦",
};

// The five verdicts (same codes and labels as the database's verdict_types table).
export const VERDICTS = [
  { code: "buy", label: "I would buy again", short: "Would buy again" },
  { code: "drink", label: "I would drink again given the opportunity", short: "Would drink again" },
  { code: "none", label: "No preference", short: "No preference" },
  { code: "respect", label: "Dislike, but understand its position", short: "Dislike, but understand" },
  { code: "no", label: "Do not like / would not recommend", short: "Do not like" },
];
export const verdictShort = (code) => { const v = VERDICTS.find((x) => x.code === code); return v ? v.short : null; };

// Wine structure dimensions (same keys as the database's structure_dimensions table).
// Three are sliders from 1 to 5: acidity, body and tannin. The rest are fixed choices with no values in between:
//   sweetness 0 dry, 1 off-dry, 2 semi-sweet, 3 dessert sweet (shown as Dry or Sweet, and Sweet opens the three levels)
//   CO2       0 none, 1 frizzy, 2 sparkling
//   oak       0 no oak, 1 neutral oak (old or large casks, little flavor), 2 new oak (noticeable); shown as a three-stop scale with + and -
// The same rules are enforced by the database.
export const DIMS = [
  { key: "acidity", name: "Acidity", lo: "soft", hi: "bright", kind: "scale" },
  { key: "body", name: "Body", lo: "light", hi: "full", kind: "scale" },
  { key: "tannin", name: "Tannin", lo: "supple", hi: "grippy", kind: "scale" },
  { key: "sweetness", name: "Sweetness", lo: "dry", hi: "sweet", kind: "choice", values: [0, 1, 2, 3], labels: ["Dry", "Off-dry", "Semi-sweet", "Dessert sweet"], ui: "drysweet" },
  { key: "co2", name: "CO\u2082", lo: "still", hi: "sparkling", kind: "choice", values: [0, 1, 2], labels: ["None", "Frizzy", "Sparkling"] },
  { key: "oak", name: "Oak", lo: "no oak", hi: "new oak", kind: "choice", values: [0, 1, 2], labels: ["No oak", "Neutral oak", "New oak"], ui: "steps" },
];
// The kinds of wine, and which structure lines each one has. To add a kind of wine later, add one entry here
// (and the same value to the database's wine_style list). Tannin is for reds and fortified wines, CO2 for the others.
export const WINE_STYLES = [
  { id: "red", label: "Red", dims: ["acidity", "body", "tannin", "sweetness", "oak"] },
  { id: "white", label: "White", dims: ["acidity", "body", "sweetness", "co2", "oak"] },
  { id: "sparkling", label: "Sparkling", dims: ["acidity", "body", "sweetness", "co2", "oak"] },
  { id: "rose", label: "Ros\u00e9", dims: ["acidity", "body", "sweetness", "co2", "oak"] },
  { id: "fortified", label: "Fortified", dims: ["acidity", "body", "tannin", "sweetness", "oak"] },
];
export const styleInfo = (id) => WINE_STYLES.find((x) => x.id === id) || null;
export const DEFAULT_STRUCTURE = 3;   // scale sliders start in the middle until a wine has a reference profile
export const dimMeta = (key) => DIMS.find((d) => d.key === key);
// The structure lines that apply to a wine of this style. An unknown style is treated as red.
export const dimsFor = (style) => { const info = styleInfo(style) || styleInfo("red"); return DIMS.filter((d) => info.dims.includes(d.key)); };
export const isChoice = (d) => d.kind === "choice";
// A bar is anything drawn as a slider: the 1 to 5 scales, and oak (a slider with three stops).
export const isBar = (d) => !isChoice(d) || d.ui === "steps";
export const barDims = (style) => dimsFor(style).filter(isBar);          // the sliders, shown together
export const choiceDims = (style) => dimsFor(style).filter((d) => !isBar(d));   // then the buttons (sweetness, CO2)
// Smallest, largest and middle value, and half the span (used to turn any dimension into a -1 to 1 lean).
export function dimRange(d) {
  const min = isChoice(d) ? d.values[0] : 1, max = isChoice(d) ? d.values[d.values.length - 1] : 5;
  return { min, max, mid: (min + max) / 2, half: (max - min) / 2 };
}
// What a rating starts at when editors have not set a reference value. Dry, no oak and no bubbles are the usual case.
export function defaultFor(d, style) {
  if (d.key === "co2") return style === "sparkling" ? 2 : 0;
  if (isChoice(d)) return d.values[0];
  return DEFAULT_STRUCTURE;
}
// Scales are limited to 1-5 with one decimal; choices snap to the nearest allowed value.
export function clampDimValue(d, v) {
  if (isChoice(d)) return d.values.reduce((best, x) => (Math.abs(x - v) < Math.abs(best - v) ? x : best), d.values[0]);
  return Math.min(5, Math.max(1, Math.round(v * 10) / 10));
}
export const choiceLabel = (d, v) => (d.labels || [])[d.values.indexOf(v)] || "";

export const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const clamp01 = (v) => Math.max(0, Math.min(1, v));
export const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

// ---------------------------------------------------------------- swiping
// Double-tapping near an edge of the card does the same as swiping that way.
export function tapEdge(nx, ny) {
  const [kind, dist] = [["unknown", nx], ["recognize", 1 - nx], ["had", ny]].sort((a, b) => a[1] - b[1])[0];
  return dist < 0.35 ? kind : null;
}
export function swipeKind(dx, dy, t = 100) {
  if (dx > t) return "recognize";
  if (dx < -t) return "unknown";
  if (dy < -t) return "had";
  return null;
}

// How the card looks while a finger holds it: it follows the finger, tilts about a point below it (like a card held at the bottom),
// and lifts a little. `progress` (0 to 1) says how far it has been pulled, so the card underneath can rise to meet it.
export const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export function dragPose(dx, dy) {
  const rot = clampN(dx / 14, -24, 24);
  return { rot, transform: `translate3d(${dx}px, ${dy}px, 0) rotate(${rot}deg) scale(1.03)`, progress: clampN(Math.hypot(dx, dy) / 150, 0, 1) };
}
// Speed of the finger over its last moments, in pixels per millisecond. samples: [{ x, y, t }] oldest first.
export function releaseVelocity(samples, windowMs = 110) {
  if (!samples || samples.length < 2) return { vx: 0, vy: 0 };
  const last = samples[samples.length - 1];
  let first = samples[0];
  for (const p of samples) { if (last.t - p.t <= windowMs) { first = p; break; } }
  const dt = Math.max(1, last.t - first.t);
  return { vx: (last.x - first.x) / dt, vy: (last.y - first.y) / dt };
}
// A swipe is a long enough pull, or a quick flick that would have carried the card far enough.
export const FLICK_SPEED = 0.5, FLICK_MIN = 40, FLICK_CARRY_MS = 140;
export function decideSwipe(dx, dy, vx = 0, vy = 0, t = 100) {
  const far = swipeKind(dx, dy, t);
  if (far) return far;
  const speed = Math.hypot(vx, vy);
  if (speed >= FLICK_SPEED && Math.hypot(dx, dy) >= FLICK_MIN) return swipeKind(dx + vx * FLICK_CARRY_MS, dy + vy * FLICK_CARRY_MS, t);
  return null;
}
// Where a released card flies to and how long it takes: it keeps going the way it was thrown, at the speed it was thrown.
export function flyPlan(kind, dx, dy, vx, vy, W, H) {
  const to = kind === "recognize" ? [W * 1.3, dy + vy * 120] : kind === "unknown" ? [-W * 1.3, dy + vy * 120] : [dx + vx * 120, -H * 1.1];
  const left = Math.hypot(to[0] - dx, to[1] - dy);
  const duration = Math.round(clampN(left / Math.max(Math.hypot(vx, vy), 1.1), 190, 400));
  return { to, rot: clampN(to[0] / 14, -30, 30), duration };
}

// ---------------------------------------------------------------- cards and names
export function cardFromRow(r) {
  const vintage = r.is_non_vintage ? "NV" : r.vintage_year ? String(r.vintage_year) : "";
  const facts = [];
  if (r.label_grapes && r.label_grapes.length) facts.push({ text: r.label_grapes.join("-"), derived: false });
  if (r.rule_grapes && r.rule_grapes.length) facts.push({ text: r.rule_grapes.join(", "), derived: true });
  if (r.appellation) facts.push({ text: r.appellation, derived: false });
  if (r.classification) facts.push({ text: r.classification, derived: true });
  const place = [r.region && r.region !== r.appellation ? r.region : null, r.country].filter(Boolean).join(", ");
  if (place) facts.push({ text: place, derived: true });
  return {
    id: r.wine_vintage_id, vintage, producer: r.producer, cuvee: r.wine_name || "", style: r.style, country: r.country,
    region: r.region || "", appellation: r.appellation || "",
    grape: (r.label_grapes && r.label_grapes.length ? r.label_grapes.join("-") : (r.rule_grapes || []).join(", ")),
    grapes: [...(r.label_grapes || [])], ruleGrapes: [...(r.rule_grapes || [])],
    facts,
  };
}
// The grape to always show when a wine has exactly one: the one printed on the label, or, with none printed, the one the appellation requires.
// Blends return "" (their grapes are listed on the wine's own card).
export function singleGrape(c) {
  if (!c) return "";
  const label = c.grapes || [], rule = c.ruleGrapes || [];
  if (label.length === 1) return label[0];
  if (!label.length && rule.length === 1) return rule[0];
  return "";
}
// "Pinot Noir, Dundee Hills, USA": the one grape (if there is one), then the place. Used on every list row.
export function placeLine(c) {
  const g = singleGrape(c);
  const place = [c.appellation, c.country].filter(Boolean);
  if (g) return [g, ...place].join(", ");
  return [c.appellation || c.grape, c.country].filter(Boolean).join(", ");
}
// The same for a journal row. Catalog wines use their card; wines typed in by hand use the grape text when it names one grape.
export function entryGrape(e, cardsById) {
  if (!e) return "";
  if (!e.is_outside_wine) { const c = cardsById && cardsById.get(e.wine_vintage_id); return c ? singleGrape(c) : (e.grape || ""); }
  const names = splitGrapeText(e.grape || e.grape_text || "");
  return names.length === 1 ? names[0] : "";
}
// A wine's name always starts with its vintage.
export const wineName = (c) => `${c.vintage ? c.vintage + " " : ""}${c.producer}${c.cuvee ? " " + c.cuvee : ""}`;

// A journal row (from the v_journal_entries view) shaped like a card.
export function entryCard(e) {
  const vintage = e.is_non_vintage ? "NV" : e.vintage_year ? String(e.vintage_year) : "";
  return { vintage, producer: e.producer, cuvee: e.wine_name || "", style: e.style, country: e.country };
}
export const entryName = (e) => wineName(entryCard(e));

export function styleLabel(style) {
  return style === "red" ? "Red" : style === "white" ? "White" : style === "sparkling" ? "Sparkling" : style === "rose" ? "Ros\u00e9" : style === "fortified" ? "Fortified" : "Other or unknown";
}

// ---------------------------------------------------------------- journal: search, filter, groups
export const GROUPS = [
  { id: "verdict", label: "Verdict" },
  { id: "country", label: "Country" },
  { id: "style", label: "Style" },
  { id: "grape", label: "Grape" },
  { id: "region", label: "Region" },
  { id: "producer", label: "Producer" },
  { id: "month", label: "Date added" },
  { id: "flat", label: "No groups" },
];
export const GROUP_PAGE = 20;   // rows shown per group before "Show more"

export function filterEntries(entries, { q = "", verdict = "all" } = {}) {
  const term = q.trim().toLowerCase();
  return entries.filter((e) => {
    if (verdict === "none") { if (e.verdict) return false; }
    else if (verdict !== "all" && e.verdict !== verdict) return false;
    if (!term) return true;
    const c = entryCard(e);
    const hay = [c.vintage, c.producer, c.cuvee, e.grape, e.region, e.country, e.food, e.occasion, e.notes].filter(Boolean).join(" ").toLowerCase();
    return hay.includes(term);
  });
}

const monthLabel = (key) => {
  const [y, m] = key.split("-");
  if (!y || !m) return "No date";
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
};

export function groupEntries(list, by) {
  const keyOf = (e) => {
    switch (by) {
      case "verdict": return e.verdict || "unrated";
      case "country": return e.country || "Country not set";
      case "style": return styleLabel(e.style);
      case "grape": return e.grape || "Grape not set";
      case "region": return e.region || "Region not set";
      case "producer": return e.producer;
      case "month": return (e.consumed_on || "").slice(0, 7) || "none";
      default: return "all";
    }
  };
  const labelFor = (k) => {
    if (by === "verdict") return verdictShort(k) || "Not rated yet";
    if (by === "month") return k === "none" ? "No date" : monthLabel(k);
    if (by === "flat") return "All wines";
    return k;
  };
  const map = new Map();
  list.forEach((e) => { const k = keyOf(e); if (!map.has(k)) map.set(k, []); map.get(k).push(e); });
  const keys = [...map.keys()];
  const unset = (k) => (/not set|unknown/i.test(k) ? 1 : 0);
  if (by === "verdict") { const order = [...VERDICTS.map((v) => v.code), "unrated"]; keys.sort((a, b) => order.indexOf(a) - order.indexOf(b)); }
  else if (by === "month") keys.sort((a, b) => (a < b ? 1 : -1));
  else keys.sort((a, b) => unset(a) - unset(b) || a.localeCompare(b));
  return keys.map((k) => ({ key: k, label: labelFor(k), items: map.get(k).sort((a, b) => (b.consumed_on || "").localeCompare(a.consumed_on || "")) }));
}

// ---------------------------------------------------------------- swipes tab
export const SORTS = [
  { id: "recent", label: "Recently swiped" },
  { id: "country", label: "Country" },
  { id: "varietal", label: "Varietal" },
  { id: "vintage", label: "Vintage" },
  { id: "region", label: "Region" },
  { id: "producer", label: "Producer" },
  { id: "style", label: "Style" },
];
const STYLE_ORDER = ["Red", "White", "Sparkling", "Ros\u00e9", "Fortified", "Other or unknown"];

// Sorts cards (or items that hold a card, via `get`). Missing values always go last.
export function sortCards(list, by, order, get = (x) => x) {
  const text = (v) => (v ? v : "\uffff");
  const year = (w) => (/^\d{4}$/.test(w.vintage) ? Number(w.vintage) : -1);
  const cmp = {
    recent: (a, b) => (order[b.id] ?? -1) - (order[a.id] ?? -1),
    country: (a, b) => text(a.country).localeCompare(text(b.country)),
    varietal: (a, b) => text(a.grape).localeCompare(text(b.grape)),
    vintage: (a, b) => year(b) - year(a),
    region: (a, b) => text(a.region || a.appellation).localeCompare(text(b.region || b.appellation)),
    producer: (a, b) => a.producer.localeCompare(b.producer),
    style: (a, b) => STYLE_ORDER.indexOf(styleLabel(a.style)) - STYLE_ORDER.indexOf(styleLabel(b.style)),
  }[by] || (() => 0);
  return [...list].sort((x, y) => { const a = get(x), b = get(y); return cmp(a, b) || a.producer.localeCompare(b.producer) || year(b) - year(a); });
}

// Builds the Swipes tab lists from the catalog cards, the user's swipe states and the journal.
export function swipeLists(cards, states, journal) {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const entryOf = new Map(journal.filter((j) => j.wine_vintage_id).map((j) => [j.wine_vintage_id, j]));
  const order = {};
  [...states].sort((a, b) => ((a.last_swiped_at || "") < (b.last_swiped_at || "") ? -1 : 1)).forEach((s, i) => { order[s.wine_vintage_id] = i; });
  const cardsWhere = (test) => states.filter((s) => byId.has(s.wine_vintage_id) && test(s)).map((s) => byId.get(s.wine_vintage_id));
  const notInJournal = (s) => !entryOf.has(s.wine_vintage_id);
  return {
    order, entryOf,
    interestOf: Object.fromEntries(states.map((s) => [s.wine_vintage_id, s.interest])),
    rec: cardsWhere((s) => s.familiarity === "recognize" && s.interest === "try" && notInJournal(s)),
    unk: cardsWhere((s) => s.familiarity === "unknown" && s.interest === "try" && notInJournal(s)),
    notInt: cardsWhere((s) => s.interest === "nope" && notInJournal(s)),
    tried: states.filter((s) => byId.has(s.wine_vintage_id) && entryOf.has(s.wine_vintage_id) && entryOf.get(s.wine_vintage_id).verdict)
      .map((s) => ({ ...byId.get(s.wine_vintage_id), entry: entryOf.get(s.wine_vintage_id) })),
    had: cardsWhere((s) => s.familiarity === "had"),
  };
}

// ---------------------------------------------------------------- rating a wine
export const THIS_YEAR = new Date().getFullYear();
export const YEARS = Array.from({ length: THIS_YEAR - 1899 }, (_, i) => THIS_YEAR - i);   // current year down to 1900

export function priceToCents(text) {
  const n = parseFloat(String(text == null ? "" : text).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}
export const centsToPrice = (c) => (c == null ? "" : String(c / 100));

// Only the dimensions that apply to this wine's style get a rating.
const newDims = (defaults = {}, style = "unknown") => {
  const d = {};
  dimsFor(style).forEach((x) => { const def = clampDimValue(x, defaults[x.key] ?? defaultFor(x, style)); d[x.key] = { value: def, def, adjusted: false }; });
  return d;
};

const noPhotos = () => ({ existing: [], queued: [] });
// A rating sheet for a catalog wine that has no journal entry yet. `defaults` are the wine's
// reference values (if editors have set them); otherwise the sliders start in the middle.
export function sheetForCard(card, today, defaults = {}) {
  return {
    target: { kind: "catalog", wineVintageId: card.id, userWineId: null, name: wineName(card), form: null },
    entryId: null, verdict: null, date: today, price: "", food: "", occasion: "", notes: "", dims: newDims(defaults, card.style), style: card.style, catalogStyle: card.style, hadOverride: false, photos: noPhotos(),
  };
}
// A rating sheet for an existing journal entry, with its saved structure ratings and photos.
export function sheetForEntry(e, perceptionRows, today, defaults = {}, photoRows = []) {
  const dims = newDims(defaults, e.style);
  (perceptionRows || []).forEach((r) => {
    const meta = dimMeta(r.dimension_key);
    if (!dims[r.dimension_key] || !meta) return;   // ratings for a dimension that no longer applies to this wine are ignored
    const def = clampDimValue(meta, r.default_value ?? dims[r.dimension_key].def);
    dims[r.dimension_key] = { value: r.adjusted ? clampDimValue(meta, r.value) : def, def, adjusted: !!r.adjusted };
  });
  return {
    target: e.is_outside_wine
      ? { kind: "outside", wineVintageId: null, userWineId: e.user_wine_id, name: entryName(e), form: null }
      : { kind: "catalog", wineVintageId: e.wine_vintage_id, userWineId: null, name: entryName(e), form: null },
    entryId: e.id, verdict: e.verdict || null, date: e.consumed_on || today,
    price: centsToPrice(e.purchase_price_cents), food: e.food || "", occasion: e.occasion || "", notes: e.notes || "", dims, style: e.style, catalogStyle: e.catalog_style || e.style, hadOverride: !!(e.catalog_style && e.catalog_style !== e.style),
    photos: { existing: photoRows.map((p) => ({ id: p.id, path: p.storage_path, url: p.url || null, removed: false })), queued: [] },
  };
}
// A rating sheet for a wine typed in by hand. The wine row is only created when the review is saved.
export function outsideName(form) {
  const vintage = form.vintage === "NV" ? "NV" : /^\d{4}$/.test(form.vintage || "") ? form.vintage : "";
  return `${vintage ? vintage + " " : ""}${(form.producer || "").trim()}${form.wine_name && form.wine_name.trim() ? " " + form.wine_name.trim() : ""}`;
}
export function sheetForOutside(form, today) {
  return {
    target: { kind: "outside", wineVintageId: null, userWineId: null, name: outsideName(form), form },
    entryId: null, verdict: null, date: today, price: "", food: "", occasion: "", notes: "", dims: newDims({}, form.style || "unknown"), style: form.style || "unknown", catalogStyle: form.style || "unknown", hadOverride: false,
    photos: { existing: [], queued: [...(form.photos || [])] },
  };
}

// Moving a slider, tapping +/-, or picking a choice marks that dimension as adjusted.
export function setDim(sheet, key, value) {
  return { ...sheet, dims: { ...sheet.dims, [key]: { ...sheet.dims[key], value: clampDimValue(dimMeta(key), value), adjusted: true } } };
}
// +/- buttons move a slider rating by 0.5, staying between 1 and 5.
export function nudgeDim(sheet, key, delta) { return setDim(sheet, key, sheet.dims[key].value + delta); }
// The same rule for a plain number on a scale (used by the editor's sliders).
export const nudgeStep = (value, delta) => clampDimValue({ kind: "scale" }, value + delta);
// Switch the wine type on a rating sheet. Lines both types have keep what was entered; new lines start at their defaults.
export function setStyle(sheet, style) {
  if (!styleInfo(style) || style === sheet.style) return sheet;
  const fresh = newDims({}, style);
  const dims = {};
  Object.keys(fresh).forEach((k) => { dims[k] = sheet.dims[k] || fresh[k]; });
  return { ...sheet, style, dims };
}
export function resetDim(sheet, key) {
  const d = sheet.dims[key];
  return { ...sheet, dims: { ...sheet.dims, [key]: { ...d, value: d.def, adjusted: false } } };
}

const clean = (s) => { const t = (s == null ? "" : String(s)).trim(); return t || null; };
// Every dimension is saved as a number. adjusted=false means the user left it at the starting value.
export function buildReview(sheet, today) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sheet.date || "") ? sheet.date : today;
  return {
    consumption: {
      consumed_on: date, verdict: sheet.verdict, purchase_price_cents: priceToCents(sheet.price),
      food: clean(sheet.food), occasion: clean(sheet.occasion), notes: clean(sheet.notes),
      // Only sent when it matters, so saving still works before the database has the column.
      ...(sheet.target.kind === "catalog" && (sheet.style !== sheet.catalogStyle || sheet.hadOverride) ? { style_override: sheet.style !== sheet.catalogStyle ? sheet.style : null } : {}),
    },
    perceptions: DIMS.filter((d) => sheet.dims[d.key]).map((d) => {
      const x = sheet.dims[d.key];
      return { dimension_key: d.key, value: x.adjusted ? x.value : x.def, default_value: x.def, adjusted: x.adjusted };
    }),
  };
}

// ---------------------------------------------------------------- photos on a rating sheet
// `queued` pictures are shrunk and waiting to upload on Save; `existing` ones are already saved and can be removed.
export const queuePhoto = (sheet, photo) => ({ ...sheet, photos: { ...sheet.photos, queued: [...sheet.photos.queued, photo] } });
export const unqueuePhoto = (sheet, key) => ({ ...sheet, photos: { ...sheet.photos, queued: sheet.photos.queued.filter((p) => p.key !== key) } });
export const toggleExistingPhoto = (sheet, id) => ({ ...sheet, photos: { ...sheet.photos, existing: sheet.photos.existing.map((p) => (String(p.id) === String(id) ? { ...p, removed: !p.removed } : p)) } });
export const photoCount = (sheet) => sheet.photos.existing.filter((p) => !p.removed).length + sheet.photos.queued.length;

// ---------------------------------------------------------------- feedback on a wine card
export const WINE_FLAG_REASONS = [
  "The wine details look wrong",
  "The vintage looks wrong",
  "The country or region looks wrong",
  "The grape or style looks wrong",
  "Something else",
];
// The feedback switch from the database's feature_access table.
export function feedbackOn(row, tier) { return !!row && (row.all_tiers || (Array.isArray(row.tiers) && row.tiers.includes(tier))); }

// ---------------------------------------------------------------- reference structure profiles (set by editors)
// rows: wine_reference_values. A vintage-specific value beats the wine-level one.
export function refsByVintage(vintageToWine, rows) {
  const wineLevel = new Map(), vintageLevel = new Map();
  rows.forEach((r) => {
    const m = r.wine_vintage_id ? vintageLevel : wineLevel;
    const k = r.wine_vintage_id || r.wine_id;
    if (!m.has(k)) m.set(k, {});
    m.get(k)[r.dimension_key] = Number(r.value);
  });
  const out = new Map();
  vintageToWine.forEach((wineId, vId) => {
    const merged = { ...(wineLevel.get(wineId) || {}), ...(vintageLevel.get(vId) || {}) };
    if (Object.keys(merged).length) out.set(vId, merged);
  });
  return out;
}
export const hasFullProfile = (r, style) => !!r && dimsFor(style).every((d) => typeof r[d.key] === "number");
// The editor's list of catalog wines. filter "needs" shows wines without a full profile.
export function editorList(cards, refs, { q = "", filter = "needs" } = {}) {
  const term = q.trim().toLowerCase();
  return cards
    .filter((c) => (filter === "all" ? true : !hasFullProfile(refs.get(c.id), c.style)))
    .filter((c) => !term || [c.vintage, c.producer, c.cuvee, c.country, c.grape, c.region].filter(Boolean).join(" ").toLowerCase().includes(term))
    .sort((a, b) => a.producer.localeCompare(b.producer) || b.vintage.localeCompare(a.vintage));
}
// Turns the editor's five values into database writes: update rows that exist, insert the rest.
export function referenceWrites(values, existingRows, wineId, userId, nowIso) {
  const wineLevel = existingRows.filter((r) => r.wine_id === wineId && !r.wine_vintage_id);
  const inserts = [], updates = [];
  DIMS.filter((d) => values[d.key] !== undefined).forEach((d) => {
    const value = clampDimValue(d, values[d.key]);
    const row = wineLevel.find((r) => r.dimension_key === d.key);
    const stamp = { value, basis: "editor", status: "verified", verified_by: userId, verified_at: nowIso };
    if (row) updates.push({ id: row.id, patch: stamp });
    else inserts.push({ wine_id: wineId, wine_vintage_id: null, dimension_key: d.key, ...stamp });
  });
  return { inserts, updates };
}

// ---------------------------------------------------------------- wines typed in by hand
export function validateOutside(form) {
  if (!form || !(form.producer || "").trim()) return "Enter the producer.";
  const g = checkGrapeText(form.grape || "");
  if (!g.ok) return grapeProblem(g.bad);
  return null;
}
// The grape field as saved: the names as they are on the list, separated by commas. Empty stays empty.
export function grapeTextOf(text) { const r = checkGrapeText(text || ""); return r.names.length ? r.names.join(", ") : null; }
export function outsideRow(form, userId) {
  return {
    user_id: userId, producer: form.producer.trim(), wine_name: clean(form.wine_name),
    vintage_year: /^\d{4}$/.test(form.vintage || "") ? Number(form.vintage) : null,
    is_non_vintage: form.vintage === "NV",
    grape_text: grapeTextOf(form.grape), region_text: clean(form.region),
    style: styleInfo(form.style) ? form.style : "unknown",
  };
}

// ---------------------------------------------------------------- changing a wine's info from the journal
// A person can correct the wine on a journal entry. The catalog is never touched. What happens:
//   - nothing changed          -> nothing
//   - a corrected wine that IS a catalog wine (the same one, or another vintage or cuvee of it)
//                              -> the entry points at that catalog wine (a changed wine type is kept as their own choice)
//   - a wine they typed in, and it is not a catalog wine -> that wine is updated in place
//   - a catalog wine, and the corrected wine is not in the catalog (or their grape or place differs from the catalog's)
//                              -> a new wine is created for them and the entry points at it
export const vintageText = (form) => (form.vintage === "NV" ? "NV" : /^\d{4}$/.test(String(form.vintage || "")) ? String(form.vintage) : "");
const same = (a, b) => fold(a) === fold(b);
const grapeSetKey = (text) => checkGrapeText(text || "").names.map(fold).sort().join("|") || fold(text);
export const placeTextOf = (c) => [c.appellation, c.region && c.region !== c.appellation ? c.region : "", c.country].filter(Boolean).join(", ");
export const grapeTextOfCard = (c) => ((c.grapes && c.grapes.length ? c.grapes : c.ruleGrapes) || []).join(", ");
// The form a person edits, filled from the entry's wine. `card` is the catalog card (catalog wines) and `userWine` the row (wines typed in).
export function wineEditForm(entry, card, userWine) {
  if (entry.is_outside_wine) {
    const u = userWine || {};
    return { producer: u.producer || entry.producer || "", wine_name: u.wine_name || entry.wine_name || "", vintage: u.is_non_vintage || entry.is_non_vintage ? "NV" : (u.vintage_year || entry.vintage_year ? String(u.vintage_year || entry.vintage_year) : ""),
      style: u.style || entry.style || "unknown", grape: u.grape_text || "", region: u.region_text || entry.region || "" };
  }
  const c = card || { producer: entry.producer, cuvee: entry.wine_name || "", vintage: entry.is_non_vintage ? "NV" : entry.vintage_year ? String(entry.vintage_year) : "", appellation: "", region: entry.region || "", country: entry.country || "", grapes: entry.grape ? [entry.grape] : [], ruleGrapes: [] };
  return { producer: c.producer || "", wine_name: c.cuvee || "", vintage: c.vintage || "", style: entry.style || c.style || "unknown", grape: grapeTextOfCard(c), region: placeTextOf(c) };
}
export function validateWineEdit(form) {
  if (!(form.producer || "").trim()) return "Enter the producer.";
  const g = checkGrapeText(form.grape || "");
  if (!g.ok) return grapeProblem(g.bad);
  return "";
}
export function findCatalogMatch(cards, form) {
  const v = vintageText(form);
  return (cards || []).find((c) => same(c.producer, form.producer) && same(c.cuvee || "", form.wine_name || "") && String(c.vintage || "") === v) || null;
}
const wineFields = (form) => ({
  producer: form.producer.trim(), wine_name: clean(form.wine_name),
  vintage_year: /^\d{4}$/.test(vintageText(form)) ? Number(vintageText(form)) : null, is_non_vintage: vintageText(form) === "NV",
  grape_text: grapeTextOf(form.grape), region_text: clean(form.region),
  style: styleInfo(form.style) ? form.style : "unknown",
});
export function planWineEdit(entry, before, after, cards) {
  const unchanged = same(before.producer, after.producer) && same(before.wine_name, after.wine_name) && vintageText(before) === vintageText(after)
    && before.style === after.style && grapeSetKey(before.grape) === grapeSetKey(after.grape) && same(before.region, after.region);
  if (unchanged) return { action: "none" };
  const identityChanged = !(same(before.producer, after.producer) && same(before.wine_name, after.wine_name) && vintageText(before) === vintageText(after));
  const match = identityChanged ? findCatalogMatch(cards, after) : (entry.is_outside_wine ? null : (cards || []).find((c) => c.id === entry.wine_vintage_id) || null);
  if (match) {
    const grapesOk = !(after.grape || "").trim() || grapeSetKey(after.grape) === grapeSetKey(grapeTextOfCard(match));
    const placeOk = !(after.region || "").trim() || same(after.region, placeTextOf(match));
    if (grapesOk && placeOk) return { action: "link_catalog", wineVintageId: match.id, styleOverride: styleInfo(after.style) && after.style !== match.style ? after.style : null, name: wineName(match) };
  }
  if (entry.is_outside_wine) return { action: "update_outside", userWineId: entry.user_wine_id, row: wineFields(after) };
  return { action: "create_outside", row: wineFields(after) };
}
// After the entry's wine changed, the open rating window follows it (the saved rating stays; the wine and its type change).
export function retargetSheet(sheet, entry) {
  const target = entry.is_outside_wine
    ? { kind: "outside", wineVintageId: null, userWineId: entry.user_wine_id, name: entryName(entry), form: null }
    : { kind: "catalog", wineVintageId: entry.wine_vintage_id, userWineId: null, name: entryName(entry), form: null };
  const next = { ...sheet, target, catalogStyle: entry.catalog_style || entry.style, hadOverride: !!(entry.catalog_style && entry.catalog_style !== entry.style) };
  return entry.style && entry.style !== sheet.style ? setStyle(next, entry.style) : next;
}

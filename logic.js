// Pure logic for the wine app web page. No browser and no network in this file,
// so every rule here can be tested on its own.

export const COLORS = { ink: “#16261D”, muted: “#5A6A5F”, wine: “#7B1E3A”, slate: “#3E5C76”, moss: “#3A4B40”, line: “#C3CFC1” };

// A swipe records how familiar the wine is; the switch under the card records interest.
export const FAMILIARITY = {
recognize: { label: “I recognize it”, color: COLORS.slate },
unknown: { label: “I don’t know it”, color: COLORS.moss },
had: { label: “I’ve had this bottle”, color: COLORS.wine },
};
export const INTEREST = {
try: { label: “Interested”, color: COLORS.wine },
nope: { label: “Not interested”, color: COLORS.moss },
};

export const FLAGS = {
Italy: “🇮🇹”, France: “🇫🇷”, Spain: “🇪🇸”, Germany: “🇩🇪”, USA: “🇺🇸”, Australia: “🇦🇺”, Chile: “🇨🇱”,
Argentina: “🇦🇷”, “New Zealand”: “🇳🇿”, Portugal: “🇵🇹”, Austria: “🇦🇹”, “South Africa”: “🇿🇦”,
};

// The five verdicts (same codes and labels as the database’s verdict_types table).
export const VERDICTS = [
{ code: “buy”, label: “I would buy again”, short: “Would buy again” },
{ code: “drink”, label: “I would drink again given the opportunity”, short: “Would drink again” },
{ code: “none”, label: “No preference”, short: “No preference” },
{ code: “respect”, label: “Dislike, but understand its position”, short: “Dislike, but understand” },
{ code: “no”, label: “Do not like / would not recommend”, short: “Do not like” },
];
export const verdictShort = (code) => { const v = VERDICTS.find((x) => x.code === code); return v ? v.short : null; };

// Wine structure dimensions (same keys as the database’s structure_dimensions table).
export const DIMS = [
{ key: “acidity”, name: “Acidity”, lo: “soft”, hi: “bright” },
{ key: “body”, name: “Body”, lo: “light”, hi: “full” },
{ key: “tannin”, name: “Tannin”, lo: “supple”, hi: “grippy” },
{ key: “sweetness”, name: “Sweetness”, lo: “dry”, hi: “sweet” },
{ key: “oak”, name: “Oak”, lo: “unoaked”, hi: “oaky” },
];
export const DEFAULT_STRUCTURE = 3;   // sliders start in the middle until wines have reference profiles

export const esc = (s) => String(s == null ? “” : s).replace(/[&<>”’]/g, (c) => ({ “&”: “&”, “<”: “<”, “>”: “>”, ‘”’: “"”, “’”: “'” }[c]));
export const clamp01 = (v) => Math.max(0, Math.min(1, v));
export const shuffle = (a) => { const b = […a]; for (let i = b.length - 1; i > 0; i–) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

// –––––––––––––––––––––––––––––––– swiping
// Double-tapping near an edge of the card does the same as swiping that way.
export function tapEdge(nx, ny) {
const [kind, dist] = [[“unknown”, nx], [“recognize”, 1 - nx], [“had”, ny]].sort((a, b) => a[1] - b[1])[0];
return dist < 0.35 ? kind : null;
}
export function swipeKind(dx, dy, t = 100) {
if (dx > t) return “recognize”;
if (dx < -t) return “unknown”;
if (dy < -t) return “had”;
return null;
}

// –––––––––––––––––––––––––––––––– cards and names
export function cardFromRow(r) {
const vintage = r.is_non_vintage ? “NV” : r.vintage_year ? String(r.vintage_year) : “”;
const facts = [];
if (r.label_grapes && r.label_grapes.length) facts.push({ text: r.label_grapes.join(”-”), derived: false });
if (r.rule_grapes && r.rule_grapes.length) facts.push({ text: r.rule_grapes.join(”, “), derived: true });
if (r.appellation) facts.push({ text: r.appellation, derived: false });
if (r.classification) facts.push({ text: r.classification, derived: true });
const place = [r.region && r.region !== r.appellation ? r.region : null, r.country].filter(Boolean).join(”, “);
if (place) facts.push({ text: place, derived: true });
return {
id: r.wine_vintage_id, vintage, producer: r.producer, cuvee: r.wine_name || “”, style: r.style, country: r.country,
region: r.region || “”, appellation: r.appellation || “”,
grape: (r.label_grapes && r.label_grapes.length ? r.label_grapes.join(”-”) : (r.rule_grapes || []).join(”, “)),
facts,
};
}
// A wine’s name always starts with its vintage.
export const wineName = (c) => `${c.vintage ? c.vintage + " " : ""}${c.producer}${c.cuvee ? " " + c.cuvee : ""}`;

// A journal row (from the v_journal_entries view) shaped like a card.
export function entryCard(e) {
const vintage = e.is_non_vintage ? “NV” : e.vintage_year ? String(e.vintage_year) : “”;
return { vintage, producer: e.producer, cuvee: e.wine_name || “”, style: e.style, country: e.country };
}
export const entryName = (e) => wineName(entryCard(e));

export function styleLabel(style) {
return style === “red” ? “Red” : style === “white” ? “White” : style === “sparkling” ? “Sparkling” : “Other or unknown”;
}

// –––––––––––––––––––––––––––––––– journal: search, filter, groups
export const GROUPS = [
{ id: “verdict”, label: “Verdict” },
{ id: “country”, label: “Country” },
{ id: “style”, label: “Style” },
{ id: “grape”, label: “Grape” },
{ id: “region”, label: “Region” },
{ id: “producer”, label: “Producer” },
{ id: “month”, label: “Date added” },
{ id: “flat”, label: “No groups” },
];
export const GROUP_PAGE = 20;   // rows shown per group before “Show more”

export function filterEntries(entries, { q = “”, verdict = “all” } = {}) {
const term = q.trim().toLowerCase();
return entries.filter((e) => {
if (verdict === “none”) { if (e.verdict) return false; }
else if (verdict !== “all” && e.verdict !== verdict) return false;
if (!term) return true;
const c = entryCard(e);
const hay = [c.vintage, c.producer, c.cuvee, e.grape, e.region, e.country, e.food, e.occasion, e.notes].filter(Boolean).join(” “).toLowerCase();
return hay.includes(term);
});
}

const monthLabel = (key) => {
const [y, m] = key.split(”-”);
if (!y || !m) return “No date”;
return new Date(Number(y), Number(m) - 1, 1).toLocaleString(“en-US”, { month: “long”, year: “numeric” });
};

export function groupEntries(list, by) {
const keyOf = (e) => {
switch (by) {
case “verdict”: return e.verdict || “unrated”;
case “country”: return e.country || “Country not set”;
case “style”: return styleLabel(e.style);
case “grape”: return e.grape || “Grape not set”;
case “region”: return e.region || “Region not set”;
case “producer”: return e.producer;
case “month”: return (e.consumed_on || “”).slice(0, 7) || “none”;
default: return “all”;
}
};
const labelFor = (k) => {
if (by === “verdict”) return verdictShort(k) || “Not rated yet”;
if (by === “month”) return k === “none” ? “No date” : monthLabel(k);
if (by === “flat”) return “All wines”;
return k;
};
const map = new Map();
list.forEach((e) => { const k = keyOf(e); if (!map.has(k)) map.set(k, []); map.get(k).push(e); });
const keys = […map.keys()];
const unset = (k) => (/not set|unknown/i.test(k) ? 1 : 0);
if (by === “verdict”) { const order = […VERDICTS.map((v) => v.code), “unrated”]; keys.sort((a, b) => order.indexOf(a) - order.indexOf(b)); }
else if (by === “month”) keys.sort((a, b) => (a < b ? 1 : -1));
else keys.sort((a, b) => unset(a) - unset(b) || a.localeCompare(b));
return keys.map((k) => ({ key: k, label: labelFor(k), items: map.get(k).sort((a, b) => (b.consumed_on || “”).localeCompare(a.consumed_on || “”)) }));
}

// –––––––––––––––––––––––––––––––– swipes tab
export const SORTS = [
{ id: “recent”, label: “Recently swiped” },
{ id: “country”, label: “Country” },
{ id: “varietal”, label: “Varietal” },
{ id: “vintage”, label: “Vintage” },
{ id: “region”, label: “Region” },
{ id: “producer”, label: “Producer” },
{ id: “style”, label: “Style” },
];
const STYLE_ORDER = [“Red”, “White”, “Sparkling”, “Other or unknown”];

// Sorts cards (or items that hold a card, via `get`). Missing values always go last.
export function sortCards(list, by, order, get = (x) => x) {
const text = (v) => (v ? v : “\uffff”);
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
return […list].sort((x, y) => { const a = get(x), b = get(y); return cmp(a, b) || a.producer.localeCompare(b.producer) || year(b) - year(a); });
}

// Builds the Swipes tab lists from the catalog cards, the user’s swipe states and the journal.
export function swipeLists(cards, states, journal) {
const byId = new Map(cards.map((c) => [c.id, c]));
const entryOf = new Map(journal.filter((j) => j.wine_vintage_id).map((j) => [j.wine_vintage_id, j]));
const order = {};
[…states].sort((a, b) => ((a.last_swiped_at || “”) < (b.last_swiped_at || “”) ? -1 : 1)).forEach((s, i) => { order[s.wine_vintage_id] = i; });
const cardsWhere = (test) => states.filter((s) => byId.has(s.wine_vintage_id) && test(s)).map((s) => byId.get(s.wine_vintage_id));
const notInJournal = (s) => !entryOf.has(s.wine_vintage_id);
return {
order, entryOf,
interestOf: Object.fromEntries(states.map((s) => [s.wine_vintage_id, s.interest])),
rec: cardsWhere((s) => s.familiarity === “recognize” && s.interest === “try” && notInJournal(s)),
unk: cardsWhere((s) => s.familiarity === “unknown” && s.interest === “try” && notInJournal(s)),
notInt: cardsWhere((s) => s.interest === “nope” && notInJournal(s)),
tried: states.filter((s) => byId.has(s.wine_vintage_id) && entryOf.has(s.wine_vintage_id) && entryOf.get(s.wine_vintage_id).verdict)
.map((s) => ({ …byId.get(s.wine_vintage_id), entry: entryOf.get(s.wine_vintage_id) })),
had: cardsWhere((s) => s.familiarity === “had”),
};
}

// –––––––––––––––––––––––––––––––– rating a wine
export const THIS_YEAR = new Date().getFullYear();
export const YEARS = Array.from({ length: THIS_YEAR - 1899 }, (_, i) => THIS_YEAR - i);   // current year down to 1900

export function priceToCents(text) {
const n = parseFloat(String(text == null ? “” : text).replace(/[$,\s]/g, “”));
return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}
export const centsToPrice = (c) => (c == null ? “” : String(c / 100));

const newDims = (defaults = {}) => {
const d = {};
DIMS.forEach((x) => { const def = defaults[x.key] ?? DEFAULT_STRUCTURE; d[x.key] = { value: def, def, adjusted: false }; });
return d;
};

const noPhotos = () => ({ existing: [], queued: [] });
// A rating sheet for a catalog wine that has no journal entry yet. `defaults` are the wine’s
// reference values (if editors have set them); otherwise the sliders start in the middle.
export function sheetForCard(card, today, defaults = {}) {
return {
target: { kind: “catalog”, wineVintageId: card.id, userWineId: null, name: wineName(card), form: null },
entryId: null, verdict: null, date: today, price: “”, food: “”, occasion: “”, notes: “”, dims: newDims(defaults), photos: noPhotos(),
};
}
// A rating sheet for an existing journal entry, with its saved structure ratings and photos.
export function sheetForEntry(e, perceptionRows, today, defaults = {}, photoRows = []) {
const dims = newDims(defaults);
(perceptionRows || []).forEach((r) => {
if (!dims[r.dimension_key]) return;
const def = r.default_value ?? DEFAULT_STRUCTURE;
dims[r.dimension_key] = { value: r.adjusted ? r.value : def, def, adjusted: !!r.adjusted };
});
return {
target: e.is_outside_wine
? { kind: “outside”, wineVintageId: null, userWineId: e.user_wine_id, name: entryName(e), form: null }
: { kind: “catalog”, wineVintageId: e.wine_vintage_id, userWineId: null, name: entryName(e), form: null },
entryId: e.id, verdict: e.verdict || null, date: e.consumed_on || today,
price: centsToPrice(e.purchase_price_cents), food: e.food || “”, occasion: e.occasion || “”, notes: e.notes || “”, dims,
photos: { existing: photoRows.map((p) => ({ id: p.id, path: p.storage_path, url: p.url || null, removed: false })), queued: [] },
};
}
// A rating sheet for a wine typed in by hand. The wine row is only created when the review is saved.
export function outsideName(form) {
const vintage = form.vintage === “NV” ? “NV” : /^\d{4}$/.test(form.vintage || “”) ? form.vintage : “”;
return `${vintage ? vintage + " " : ""}${(form.producer || "").trim()}${form.wine_name && form.wine_name.trim() ? " " + form.wine_name.trim() : ""}`;
}
export function sheetForOutside(form, today) {
return {
target: { kind: “outside”, wineVintageId: null, userWineId: null, name: outsideName(form), form },
entryId: null, verdict: null, date: today, price: “”, food: “”, occasion: “”, notes: “”, dims: newDims(),
photos: { existing: [], queued: […(form.photos || [])] },
};
}

const clampDim = (v) => Math.min(5, Math.max(1, Math.round(v * 10) / 10));
// Moving a slider (or tapping +/-) marks that dimension as adjusted.
export function setDim(sheet, key, value) {
return { …sheet, dims: { …sheet.dims, [key]: { …sheet.dims[key], value: clampDim(value), adjusted: true } } };
}
// +/- buttons move a rating by 0.5, staying between 1 and 5.
export function nudgeDim(sheet, key, delta) { return setDim(sheet, key, sheet.dims[key].value + delta); }
// The same rule for a plain number (used by the editor’s sliders).
export const nudgeStep = (value, delta) => clampDim(value + delta);
export function resetDim(sheet, key) {
const d = sheet.dims[key];
return { …sheet, dims: { …sheet.dims, [key]: { …d, value: d.def, adjusted: false } } };
}

const clean = (s) => { const t = (s == null ? “” : String(s)).trim(); return t || null; };
// Every dimension is saved as a number. adjusted=false means the user left it at the starting value.
export function buildReview(sheet, today) {
const date = /^\d{4}-\d{2}-\d{2}$/.test(sheet.date || “”) ? sheet.date : today;
return {
consumption: {
consumed_on: date, verdict: sheet.verdict, purchase_price_cents: priceToCents(sheet.price),
food: clean(sheet.food), occasion: clean(sheet.occasion), notes: clean(sheet.notes),
},
perceptions: DIMS.map((d) => {
const x = sheet.dims[d.key];
return { dimension_key: d.key, value: x.adjusted ? x.value : x.def, default_value: x.def, adjusted: x.adjusted };
}),
};
}

// –––––––––––––––––––––––––––––––– photos on a rating sheet
// `queued` pictures are shrunk and waiting to upload on Save; `existing` ones are already saved and can be removed.
export const queuePhoto = (sheet, photo) => ({ …sheet, photos: { …sheet.photos, queued: […sheet.photos.queued, photo] } });
export const unqueuePhoto = (sheet, key) => ({ …sheet, photos: { …sheet.photos, queued: sheet.photos.queued.filter((p) => p.key !== key) } });
export const toggleExistingPhoto = (sheet, id) => ({ …sheet, photos: { …sheet.photos, existing: sheet.photos.existing.map((p) => (String(p.id) === String(id) ? { …p, removed: !p.removed } : p)) } });
export const photoCount = (sheet) => sheet.photos.existing.filter((p) => !p.removed).length + sheet.photos.queued.length;

// –––––––––––––––––––––––––––––––– feedback on a wine card
export const WINE_FLAG_REASONS = [
“The wine details look wrong”,
“The vintage looks wrong”,
“The country or region looks wrong”,
“The grape or style looks wrong”,
“Something else”,
];
// The feedback switch from the database’s feature_access table.
export function feedbackOn(row, tier) { return !!row && (row.all_tiers || (Array.isArray(row.tiers) && row.tiers.includes(tier))); }

// –––––––––––––––––––––––––––––––– reference structure profiles (set by editors)
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
const merged = { …(wineLevel.get(wineId) || {}), …(vintageLevel.get(vId) || {}) };
if (Object.keys(merged).length) out.set(vId, merged);
});
return out;
}
export const hasFullProfile = (r) => !!r && DIMS.every((d) => typeof r[d.key] === “number”);
// The editor’s list of catalog wines. filter “needs” shows wines without a full profile.
export function editorList(cards, refs, { q = “”, filter = “needs” } = {}) {
const term = q.trim().toLowerCase();
return cards
.filter((c) => (filter === “all” ? true : !hasFullProfile(refs.get(c.id))))
.filter((c) => !term || [c.vintage, c.producer, c.cuvee, c.country, c.grape, c.region].filter(Boolean).join(” “).toLowerCase().includes(term))
.sort((a, b) => a.producer.localeCompare(b.producer) || b.vintage.localeCompare(a.vintage));
}
// Turns the editor’s five values into database writes: update rows that exist, insert the rest.
export function referenceWrites(values, existingRows, wineId, userId, nowIso) {
const wineLevel = existingRows.filter((r) => r.wine_id === wineId && !r.wine_vintage_id);
const inserts = [], updates = [];
DIMS.forEach((d) => {
const value = clampDim(values[d.key] ?? DEFAULT_STRUCTURE);
const row = wineLevel.find((r) => r.dimension_key === d.key);
const stamp = { value, basis: “editor”, status: “verified”, verified_by: userId, verified_at: nowIso };
if (row) updates.push({ id: row.id, patch: stamp });
else inserts.push({ wine_id: wineId, wine_vintage_id: null, dimension_key: d.key, …stamp });
});
return { inserts, updates };
}

// –––––––––––––––––––––––––––––––– wines typed in by hand
export function validateOutside(form) {
if (!form || !(form.producer || “”).trim()) return “Enter the producer.”;
return null;
}
export function outsideRow(form, userId) {
return {
user_id: userId, producer: form.producer.trim(), wine_name: clean(form.wine_name),
vintage_year: /^\d{4}$/.test(form.vintage || “”) ? Number(form.vintage) : null,
is_non_vintage: form.vintage === “NV”,
grape_text: clean(form.grape), region_text: clean(form.region),
style: [“red”, “white”, “sparkling”].includes(form.style) ? form.style : “unknown”,
};
}


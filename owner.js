// The Owner page: plain tables for the person who runs the app, one tab per kind of thing: Wines, Lenses, Bingo, Checks, Tags, Legend, Roles, Config and the venue's list.
// Every table can be searched and sorted (tap a heading). It is reached from the gear (Settings) and only offered to the owner; the database
// still decides what anyone may change. The rules at the top (rows, search, sort, checks, coverage) are pure: no page, no network.
// The functions at the bottom return HTML strings. app.js holds the screen state, loads the data and does the saving (through data.js).
import { esc } from "./logic.js?v=25";
import { REACH_CHOICES } from "./wineinfo.js?v=48";
import { CARDS, TIERS, matches, cardFacts } from "./bingo.js?v=5";
import { LENSES, LENS_IDS, DEFAULT_WEIGHTS, mergeWeights } from "./recommend.js?v=17";
import { TAG_KINDS } from "./tags.js?v=5";
import { FIELDS, TAG_LIST, fieldsFor, optionsOf } from "./tasting.js?v=21";
import { centsToField } from "./pricing.js?v=4";
import { ASSIGNABLE_ROLES, ROLES, PERMISSIONS, staffRows, filterStaff, rowActions } from "./access.js?v=4";
import { VENUE, listRows, addable, summary, LIST_FILTERS, filterListRows } from "./venue.js?v=26";
import { plainKey } from "./text.js?v=3";
import { rankAppellationFor } from "./rankaoc.js?v=1";
import { placeChecks } from "./geo.js?v=10";
import { WINE_KINDS, FOODS, RATING_ORDER, RATING_LABEL, kindById, fitOf, ratingOf } from "./foods.js?v=4";
import { APPELLATION_GRAPES } from "./aocgrapes.js?v=3";
export { placeChecks };   // used by app.js through the lazily loaded Owner module

export const OWNER_TABS = [{ id: "wines", label: "Wines" }, { id: "lenses", label: "Lenses" }, { id: "bingo", label: "Bingo" }, { id: "checks", label: "Checks" }, { id: "tags", label: "Tags" }, { id: "legend", label: "Legend" }, { id: "roles", label: "Roles" }, { id: "config", label: "Config" }, { id: "lists", label: "Lists" }, { id: "pairings", label: "Pairings" }, { id: "reference", label: "Reference" }, { id: "venue", label: `${VENUE.name} list` }];

const fold = plainKey;   // text.js: the shared lookup key
const isLive = (c) => !c.archived && (!c.wineStatus || c.wineStatus === "verified");

// ---------------------------------------------------------------- the wines table
export const WINE_COLUMNS = [
  { key: "producer", label: "Producer" }, { key: "wine", label: "Wine" }, { key: "year", label: "Year", num: true }, { key: "style", label: "Type" },
  { key: "country", label: "Country" }, { key: "place", label: "Region / appellation" }, { key: "grapes", label: "Grapes" },
  { key: "reach", label: "Reach", num: true }, { key: "price", label: "Price ($)", num: true }, { key: "photo", label: "Photo" }, { key: "tags", label: "Tags" },
];
export function wineRows(cards) {
  return (cards || []).filter(isLive).map((c) => {
    const raw = c.raw || {};
    return {
      id: c.id, producer: c.producer || "", wine: c.cuvee || "", year: c.vintage === "NV" ? null : (Number(raw.vintage_year) || Number(c.vintage) || null), yearText: c.vintage || "",
      style: c.style || "", country: c.country || "", place: [c.appellation, c.region].filter((x, i, a) => x && a.indexOf(x) === i).join(" · "),
      grapes: [...(c.grapes || []), ...(c.ruleGrapes || [])].join(", "), reach: c.reach == null ? null : Number(c.reach), price: typeof c.price === "number" ? c.price : null,
      photo: c.photo ? (c.imageKind || "photo") : "", hasPhoto: !!c.photo, photoKind: c.imageKind || "", tags: "", tagIds: [], dosage: c.dosage || "",
      rankAoc: (rankAppellationFor({ country: c.country, appellation: c.appellation }, c.cuvee) || {}).appellation || "",   // rankaoc.js
    };
  });
}
// Things worth fixing. Each has a test on a row; the Checks tab counts them and the Wines tab can filter by them.
export const ISSUES = [
  { id: "nophoto", label: "No photo", test: (r) => !r.hasPhoto },
  { id: "foundonly", label: "Photo found online only (never shown in Bingo)", test: (r) => r.photoKind === "found_online" },
  { id: "noprice", label: "No price", test: (r) => r.price === null },
  { id: "nograpes", label: "No grape listed", test: (r) => !r.grapes },
  { id: "noregion", label: "No region or appellation", test: (r) => !r.place },
  { id: "nostyle", label: "Type unknown", test: (r) => !r.style || r.style === "unknown" },
  { id: "nodosage", label: "Sparkling with no sweetness term (Brut, Extra Brut ...)", test: (r) => r.style === "sparkling" && !r.dosage },
  { id: "rankaoc", label: "Under the wider appellation, but its name says a Grand Cru AOC (Saint-Émilion Grand Cru, Chablis Grand Cru, Alsace Grand Cru ...)", test: (r) => !!r.rankAoc },
];
export const issueById = (id) => ISSUES.find((i) => i.id === id) || null;
export function checkCounts(rows) { return ISSUES.map((i) => ({ id: i.id, label: i.label, count: rows.filter(i.test).length })); }

// Search: every word must appear somewhere in the row's text (accents and capitals ignored). issue: "all" or an ISSUES id.
export function filterRows(rows, q, issue = "all", columns = WINE_COLUMNS) {
  const words = fold(q).split(" ").filter(Boolean), test = (issueById(issue) || {}).test;
  return rows.filter((r) => (!test || test(r)) && (!words.length || words.every((w) => fold(columns.map((c) => r[c.key]).join(" ")).includes(w))));
}
// Sort by one column. A missing value is always last, whichever way it is sorted. Equal rows keep the order producer, wine.
export function sortRows(rows, key, dir = 1, num = false) {
  const val = (r) => r[key];
  const missing = (v) => v === null || v === undefined || v === "";
  return [...rows].sort((a, b) => {
    const x = val(a), y = val(b);
    if (missing(x) !== missing(y)) return missing(x) ? 1 : -1;
    let c = 0;
    if (!missing(x)) c = num ? Number(x) - Number(y) : String(x).localeCompare(String(y), undefined, { sensitivity: "base", numeric: true });
    return c * dir || String(a.producer || a.title || "").localeCompare(String(b.producer || b.title || "")) || String(a.wine || "").localeCompare(String(b.wine || ""));
  });
}
export const toggleSort = (cur, key) => (cur && cur.key === key ? { key, dir: -cur.dir } : { key, dir: 1 });

// A setting is a number, or an object with a "value" number (the app accepts both). Keep the shape; null means the text is not a number of 0 or more.
export function nextConfigValue(old, text) {
  const n = Number(String(text == null ? "" : text).trim());
  if (!String(text == null ? "" : text).trim() || !Number.isFinite(n) || n < 0) return null;
  return old !== null && typeof old === "object" && !Array.isArray(old) ? { ...old, value: n } : n;
}
export const shownConfigValue = (row) => (row && row.value !== null && typeof row.value === "object" ? row.value.value : row && row.value);

// ---------------------------------------------------------------- wine tags (docs/wine_tags.sql): the owner's labels, on the wine (every vintage)
// wt: { tags: [{ id, name }], links: [{ wine_id, tag_id }] }; wineOf: Map vintage id -> wine id. Labels only: nothing else reads them yet.
export function withTags(rows, wt, wineOf, vintageOf = (r) => r.id) {
  if (!wt || !wineOf) return rows;
  const name = new Map(wt.tags.map((t) => [t.id, t.name])), byWine = new Map();
  for (const l of wt.links) { if (!byWine.has(l.wine_id)) byWine.set(l.wine_id, []); byWine.get(l.wine_id).push(l.tag_id); }
  return rows.map((r) => { const ids = (byWine.get(wineOf.get(vintageOf(r))) || []).filter((id) => name.has(id)); return { ...r, tagIds: ids, tags: ids.map((id) => name.get(id)).sort().join(", ") }; });
}
export const tagCounts = (wt) => { const n = new Map(); for (const l of (wt && wt.links) || []) n.set(l.tag_id, (n.get(l.tag_id) || 0) + 1); return n; };
// The rows the Wines tab shows (search, problem filter, tag filter: "all", "none" or a tag id), sorted. Select all ticks exactly these.
export function shownWineRows(O, rows) {
  const sort = O.sort.wines, col = WINE_COLUMNS.find((c) => c.key === sort.key) || WINE_COLUMNS[0];
  const tf = O.tagFilter || "all";
  const tagged = tf === "all" ? rows : rows.filter((r) => (tf === "none" ? !r.tagIds.length : r.tagIds.includes(tf)));
  return sortRows(filterRows(tagged, O.q, O.issue), col.key, sort.dir, !!col.num);
}

// ---------------------------------------------------------------- bingo coverage: how many catalog wines could fill each square
export function bingoCoverage(cards, today = new Date()) {
  const facts = (cards || []).filter(isLive).map((c) => cardFacts(c, today));
  return CARDS.map((card) => {
    const squares = card.squares.map((s) => ({ label: s.label, count: facts.filter((f) => matches(s.test, f)).length }));
    return { id: card.id, title: card.title, tier: card.tier, tierTitle: (TIERS.find((t) => t.n === card.tier) || {}).title || "", draft: !!card.draft, squares, fillable: squares.filter((q) => q.count > 0).length, squareText: squares.map((q) => q.label).join(" ") };
  });
}

// ---------------------------------------------------------------- HTML
const arrow = (sort, key) => (sort && sort.key === key ? (sort.dir === 1 ? " ▲" : " ▼") : "");
const th = (tab, col, sort) => `<th scope="col"><button class="oth" data-action="owner:sort:${col.key}" aria-label="Sort by ${esc(col.label)}">${esc(col.label)}${arrow(sort, col.key)}</button></th>`;
const table = (head, body, empty = "Nothing matches.") => `<div class="otablewrap"><table class="otable"><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="12" class="muted">${esc(empty)}</td></tr>`}</tbody></table></div>`;

// Ticked rows and what can be done to all of them at once.
export function bulkBar(O, d, shown) {
  const sel = O.sel || new Set(), n = sel.size, wt = d.wineTags, dis = n ? "" : " disabled";
  const tagPick = wt && wt.tags.length ? `<select class="ofield" data-owner-bulktag aria-label="Tag">${wt.tags.map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join("")}</select>
      <button class="opill" data-action="owner:bulktag:on"${dis}>Add tag</button><button class="opill" data-action="owner:bulktag:off"${dis}>Remove tag</button>` : "";
  return `<div class="obulk" role="group" aria-label="Change the ticked wines">
    <span class="small"><b>${n}</b> ticked</span>
    <button class="opill" data-action="owner:selall">Tick all ${shown.length} shown</button><button class="opill" data-action="owner:selnone"${dis}>Untick all</button>
    ${tagPick}
    <select class="ofield" data-owner-bulkreach aria-label="Reach"><option value="">Reach…</option>${REACH_CHOICES.map(([v, l]) => `<option value="${v}">${v} – ${esc(l)}</option>`).join("")}<option value="clear">Clear reach</option></select>
    <button class="opill" data-action="owner:bulkreach"${dis}>Set reach</button>
  </div>`;
}
// The owner's tags: make, rename, delete (deleting a tag takes it off every wine; the wines stay).
function wineTagsHtml(O, d) {
  const wt = d.wineTags;
  if (d.wineTagsError) return `<div class="err small">${esc(d.wineTagsError)}</div>`;
  if (wt === null) return `<div class="muted small onote">Wine tags need a database update first (docs/wine_tags.sql).</div>`;
  if (!wt) return "";
  const n = tagCounts(wt), open = !!(O.open || {}).wtags;
  const rows = wt.tags.map((t) => `<tr><td><input class="ofield" data-owner-wtagname="${esc(t.id)}" value="${esc(t.name)}" aria-label="Name of tag ${esc(t.name)}" maxlength="40"></td><td class="onum">${n.get(t.id) || 0}</td>
    <td><button class="opill" data-action="owner:wtagrename:${esc(t.id)}">Rename</button><button class="opill" data-action="owner:wtagdel:${esc(t.id)}">Delete</button></td></tr>`).join("");
  return `<div class="ocontrols"><button class="opill" data-action="owner:toggle:wtags" aria-expanded="${open}">${open ? "Hide" : "Manage"} tags (${wt.tags.length})</button></div>
    ${open ? `<div class="muted small onote">Tags are your own labels on a wine (every vintage carries them). For now they are labels only: the deck and suggestions do not use them yet.</div>
    <div class="ocontrols"><input class="ofield osearch" data-owner-wtagnew placeholder="New tag name" maxlength="40" aria-label="New tag name" autocomplete="off"><button class="opill" data-action="owner:wtagadd">Add tag</button></div>
    ${table("<th>Tag</th><th>Wines</th><th></th>", rows, "No tags yet. Add your first one above.")}` : ""}`;
}
function winesTable(O, d) {
  const sort = O.sort.wines, sel = O.sel || new Set();
  const shown = shownWineRows(O, d.rows), rows = shown.slice(0, 400);
  const body = rows.map((r) => `<tr${sel.has(r.id) ? ' class="osel"' : ""}>
    <td><input type="checkbox" data-owner-sel="${esc(r.id)}"${sel.has(r.id) ? " checked" : ""} aria-label="Tick ${esc(r.producer)} ${esc(r.wine)}"></td>
    <td>${esc(r.producer)}</td><td>${esc(r.wine)}</td><td>${esc(r.yearText)}</td><td>${esc(r.style)}</td><td>${esc(r.country)}</td><td>${esc(r.place)}</td><td>${esc(r.grapes)}</td>
    <td><select class="ofield" data-owner-reach="${esc(r.id)}" aria-label="Reach of ${esc(r.producer)}"><option value=""${r.reach === null ? " selected" : ""}>-</option>${REACH_CHOICES.map(([v, l]) => `<option value="${v}"${String(r.reach) === v ? " selected" : ""}>${v} – ${esc(l)}</option>`).join("")}</select></td>
    <td class="onum"><input class="ofield oprice" inputmode="decimal" data-owner-price="${esc(r.id)}" value="${esc(centsToField(r.price))}" placeholder="-" aria-label="Price of ${esc(r.producer)}"><button class="opill" data-action="owner:saveprice:${esc(r.id)}">Save</button></td>
    <td>${esc(r.photo || "none")}</td><td class="small">${esc(r.tags)}</td><td><button class="opill" data-action="owner:edit:${esc(r.id)}">Edit all</button></td></tr>`).join("");
  return `${wineTagsHtml(O, d)}${bulkBar(O, d, shown)}
    <div class="muted small onote">${shown.length} of ${d.rows.length} wines${shown.length > rows.length ? ` (the first ${rows.length} are listed; ticking all ticks every one of the ${shown.length})` : ""}. Reach: how easy the wine is to find (5 everywhere, 1 rare). Price sets the editor price; players' prices are blended in once enough players add one. Edit all opens the full editor.</div>
    ${table("<th></th>" + WINE_COLUMNS.map((c) => th("wines", c, sort)).join("") + "<th></th>", body, "No wine matches.")}`;
}
function lensesTable(O, d) {
  const w = mergeWeights(O.weights);
  const head = '<th>Lens</th><th>What it does</th><th>Weights (try values; not saved)</th>';
  const body = LENS_IDS.map((id) => `<tr><td><b>${esc(LENSES[id].label)}</b><div class="muted small">${esc(id)}</div></td><td>${esc(LENSES[id].blurb)}</td>
    <td>${Object.keys(DEFAULT_WEIGHTS[id]).map((k) => `<label class="owt">${esc(k)} <input class="ofield onumin" type="number" min="0" max="2" step="0.05" data-owner-w="${id}:${k}" value="${w[id][k]}"></label>`).join(" ")}</td></tr>`).join("");
  const picks = d.lensRows || [];
  const res = picks.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.name)}</td><td>${esc(r.style)}</td><td>${esc(r.grapes)}</td><td>${esc(r.place)}</td><td class="onum">${r.score.toFixed(3)}</td><td>${esc(r.reason)}</td></tr>`).join("");
  return `<div class="muted small onote">These are the recommendation lenses used by Bingo (and ready for other features). Change a weight to see how the picks move. Nothing here is saved or sent to players; making a change stick needs a place in the database to keep it.</div>
    ${table(head, body)}
    <h3 class="serif osub">Preview: ${esc(LENSES[O.lens].label)} for ${O.player === "me" ? "you" : "a brand-new player"}</h3>
    ${O.lens === "similar" && !d.seedOk ? '<div class="muted small onote">Pick a wine in the Seed box to see "More like this".</div>' : ""}
    ${table("<th>#</th><th>Wine</th><th>Type</th><th>Grape</th><th>Place</th><th>Score</th><th>Reason</th>", res, "No picks.")}`;
}
function bingoTable(O, d) {
  const cols = [{ key: "tier", label: "Tier", num: true }, { key: "title", label: "Card" }, { key: "fillable", label: "Squares the catalog can fill", num: true }];
  const sort = O.sort.bingo, col = cols.find((c) => c.key === sort.key) || cols[0];
  const rows = sortRows(filterRows(d.bingo, O.q, "all", [{ key: "title" }, { key: "squareText" }]), col.key, sort.dir, !!col.num);
  const body = rows.map((r) => `<tr class="obrow"><td>${r.tier}. ${esc(r.tierTitle)}</td><td><button class="oth" data-action="owner:toggle:${esc(r.id)}" aria-expanded="${!!O.open[r.id]}">${esc(r.title)}${r.draft ? ' <span class="gbadge draft">Draft</span>' : ""}</button></td>
      <td class="onum">${r.fillable} of ${r.squares.length}</td></tr>${O.open[r.id] ? `<tr><td></td><td colspan="2">${r.squares.map((q) => `<span class="osq${q.count ? "" : " none"}">${esc(q.label)}: ${q.count}</span>`).join("")}</td></tr>` : ""}`).join("");
  return `<div class="muted small onote">How many wines in today's catalog could fill each square. Squares at 0 (in red) can only be filled by wines players type in. Tap a card to see its squares. The cards themselves are defined in bingo.js.</div>
    ${table(cols.map((c) => th("bingo", c, sort)).join(""), body)}`;
}
function checksTable(O, d) {
  const body = d.checks.map((c) => `<tr><td>${esc(c.label)}</td><td class="onum">${c.count}</td><td>${c.count ? `<button class="opill" data-action="owner:filter:${c.id}">Show these wines</button>` : '<span class="muted">all good</span>'}</td></tr>`).join("");
  return `<div class="muted small onote">Things in the catalog that may need attention, out of ${d.rows.length} wines.</div>${table("<th>Check</th><th>Wines</th><th></th>", body)}${placesSection(d)}`;
}
// The place list (geo.js placeChecks): each finding with its suggestion and source. Nothing changes until you tap Apply; Dismiss hides it on this phone.
// The check's id is "kind:area id(s)", passed whole in the button as owner:place...:<kind>:<ids>.
export function placesSection(d) {
  const P = d.places;
  const head = `<h3 class="serif osub">Places</h3><div class="muted small onote">Suggestions for the place list. Official names and legal abbreviations (such as Sta. Rita Hills) are kept exactly as written; nothing changes until you tap Apply. "Source checked" means a source was read; "To check" means please confirm it first.</div>`;
  if (!P) return `${head}<p class="muted">Loading the place list…</p>`;
  if (P.error) return `${head}<div class="err">${esc(P.error)}</div>`;
  const rows = P.list.filter((c) => !(P.dismissed || []).includes(c.id));
  const body = rows.map((c) => {
    const [kind, ...rest] = c.id.split(":"), ref = `${kind}:${rest.join(":")}`;
    return `<tr><td><b>${esc(c.title)}</b><div class="small">${esc(c.suggestion)}</div></td>
      <td class="small">${esc(c.why)}${c.source ? ` <a href="${esc(c.source)}" target="_blank" rel="noopener noreferrer">Source</a>` : ""}<div>${c.confirmed ? '<span class="gbadge">Source checked</span>' : '<span class="gbadge draft">To check</span>'}</div></td>
      <td>${c.fix ? `<button class="opill" data-action="owner:placefix:${esc(ref)}">Apply</button> ` : ""}<button class="opill" data-action="owner:placedismiss:${esc(ref)}">Dismiss</button></td></tr>`;
  }).join("");
  return `${head}${table("<th>Place</th><th>Why</th><th></th>", body, "Nothing to look at in the place list.")}`;
}
function configTable(O, d) {
  if (!d.config) return `<p class="muted">${d.configError ? esc(d.configError) : "Loading…"}</p>`;
  const rows = O.q ? d.config.filter((r) => fold(r.key + " " + (r.note || "")).includes(fold(O.q))) : d.config;
  const body = rows.map((r) => `<tr><td><b>${esc(r.key)}</b></td><td><input class="ofield onumin" inputmode="decimal" data-owner-cfg="${esc(r.key)}" value="${esc(shownConfigValue(r))}" aria-label="${esc(r.key)}"> <button class="opill" data-action="owner:savecfg:${esc(r.key)}">Save</button></td><td>${esc(r.note || "")}</td></tr>`).join("");
  return `<div class="muted small onote">Numbers the app reads from the database (thresholds and weights). Saving changes them for every player straight away.</div>${table("<th>Setting</th><th>Value</th><th>What it does</th>", body)}`;
}
// Quiz tags: the list editors tag questions from, with how many questions use each. Adding one here puts it in the editors' suggestions and pull-down.
function tagsTable(O, d) {
  if (!d.tags) return `<p class="muted">${d.tagsError ? esc(d.tagsError) : "Loading…"}</p>`;
  const used = new Map();
  for (const l of d.tags.links) used.set(l.tag_id, (used.get(l.tag_id) || 0) + 1);
  const kindLabel = (id) => (TAG_KINDS.find((k) => k.id === id) || {}).label || id;
  const rows = d.tags.tags.filter((t) => !O.q || fold(t.name + " " + kindLabel(t.kind)).includes(fold(O.q)))
    .sort((a, b) => TAG_KINDS.findIndex((k) => k.id === a.kind) - TAG_KINDS.findIndex((k) => k.id === b.kind) || a.name.localeCompare(b.name)).slice(0, 400);
  const body = rows.map((t) => `<tr><td>${esc(t.name)}</td><td>${esc(kindLabel(t.kind))}</td><td class="onum">${used.get(t.id) || 0}</td></tr>`).join("");
  return `<div class="muted small onote">${rows.length} of ${d.tags.tags.length} tags. Tags say what a quiz question is about; the quiz asks sooner about the grapes, places and producers a player skipped. Editors tick suggested tags and may add two from this list per edit. A new tag below joins the suggestions and the list straight away.</div>
    ${table("<th>Tag</th><th>Kind</th><th>Questions</th>", body, "No tag matches.")}`;
}
// The note legend: what players say in tasting notes and which grid answer it means (notegrid.js). Suggestions come from words players chose to share; a person decides.
const FIELD_LABEL = Object.fromEntries(FIELDS.map((f) => [f.id, f.label]));
const meansLabel = (field, value) => (field === "tag" ? `Aroma or flavour: ${value}` : `${FIELD_LABEL[field] || field}: ${value}`);
export function legendMeansOptions() {
  // every (line, answer) pair a note can mean, across the wine types
  const out = [];
  for (const f of fieldsFor("red").concat(fieldsFor("white")).concat(fieldsFor("sparkling")).filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i)) {
    if (f.type === "text") continue;
    if (f.type === "tags") continue;
    const opts = [...new Set(["red", "white", "rose", "sparkling"].flatMap((st) => (fieldsFor(st).some((x) => x.id === f.id) ? optionsOf(f, st) : [])))];
    out.push({ label: `${f.section}: ${f.label}`, pairs: opts.map((o) => [f.id, o]) });
  }
  out.push({ label: "Aroma or flavour", pairs: TAG_LIST.map((t) => ["tag", t]) });
  return out;
}
function legendTable(O, d) {
  if (!d.legend) return `<p class="muted">${d.legendError ? esc(d.legendError) : "Loading…"}</p>`;
  const { shared, candidates } = d.legend, q = fold(O.q || "");
  const rows = shared.filter((r) => !q || fold(r.phrase + " " + meansLabel(r.field, r.value)).includes(q));
  const ready = d.legend.threshold || 3;
  const cand = candidates.map((c, i) => `<tr><td><b>${esc(c.phrase)}</b></td><td>${esc(meansLabel(c.field, c.value))}</td><td class="onum">${c.players}${c.players >= ready ? ' <span class="gbadge">ready</span>' : ""}</td>
    <td><button class="opill" data-action="owner:legendapprove:${i}">Approve</button> <button class="opill" data-action="owner:legendreject:${i}">Reject</button></td></tr>`).join("");
  const have = rows.map((r) => `<tr><td><b>${esc(r.phrase)}</b></td><td>${esc(meansLabel(r.field, r.value))}</td><td>${esc(r.source)}</td><td><button class="opill" data-action="owner:legendremove:${esc(r.id)}">Remove</button></td></tr>`).join("");
  const opts = legendMeansOptions().map((g) => `<optgroup label="${esc(g.label)}">${g.pairs.map(([f, v]) => `<option value="${esc(f + "|" + v)}">${esc(v)}</option>`).join("")}</optgroup>`).join("");
  return `<div class="muted small onote">The words players use in tasting notes and the grid answer each one means. The app also knows a starting list in <code>notelegend.js</code> (not shown here). Suggestions are words players chose to share (never their notes); a word is listed once a player teaches it; ${ready} different players make it "ready". A person approves or rejects each one.</div>
    <h3 class="serif osub">Add a word</h3>
    <div class="ocontrols"><input class="ofield osearch" data-owner-legend-phrase placeholder="Word or short phrase (e.g. zippy)" aria-label="Word or phrase" autocomplete="off">
      <select class="ofield" data-owner-legend-means aria-label="What it means"><option value="">What it means</option>${opts}</select><button class="opill" data-action="owner:legendadd">Add</button></div>
    <h3 class="serif osub">Suggestions from players (${candidates.length})</h3>
    ${table("<th>Word</th><th>Means</th><th>Players</th><th></th>", cand, "No suggestions waiting.")}
    <h3 class="serif osub">Approved words (${rows.length} of ${shared.length})</h3>
    ${table("<th>Word</th><th>Means</th><th>From</th><th></th>", have, "None yet: the app uses its starting list.")}`;
}
// Roles: everyone who is not a plain player. The Owner row is locked: it has a lock and no buttons here, and the database refuses to change it too.
const PERM_LABEL = Object.fromEntries(PERMISSIONS.map((p) => [p.id, p.what]));
function rolesTable(O, d) {
  if (!d.staff) return `<p class="muted">${d.staffError ? esc(d.staffError) : "Loading…"}</p>`;
  const all = staffRows(d.staff), rows = filterStaff(all, O.q, O.roleFilter || "all");
  const body = rows.map((r) => {
    const who = `<b>${esc(r.name || r.email || "(no name)")}</b>${r.name && r.email ? `<br><span class="muted small">${esc(r.email)}</span>` : ""}`;
    const acts = r.locked ? `<span class="gbadge" title="The Owner role cannot be changed from this page">&#128274; Locked</span>`
      : rowActions(r).map((a) => a.kind === "remove" ? `<button class="opill" data-action="owner:staffremove:${esc(r.userId)}">${esc(a.label)}</button>` : `<button class="opill" data-action="owner:staffset:${esc(r.userId)}:${a.role}">${esc(a.label)}</button>`).join(" ");
    return `<tr><td>${who}</td><td>${esc(r.roleLabel)}</td><td class="small">${esc(r.permissions.map((p) => PERM_LABEL[p] || p).join("; "))}</td><td>${esc(String(r.since || "").slice(0, 10))}</td><td>${acts}</td></tr>`;
  }).join("");
  const audit = (d.staffAudit || []).map((a) => `<tr><td>${esc(String(a.created_at || "").slice(0, 16).replace("T", " "))}</td><td>${esc(a.target_email || a.target_user_id || "")}</td><td>${esc(a.old_role || "player")} &rarr; ${esc(a.new_role || "player")}</td></tr>`).join("");
  return `<div class="muted small onote">Everyone who has a role other than Player. Add a role by typing the email a player signed in with (a guest has no email yet). The Owner role is locked: it cannot be given or taken away here.</div>
    <h3 class="serif osub">Staff (${rows.length} of ${all.length})</h3>
    ${table("<th>Person</th><th>Role</th><th>Can do</th><th>Since</th><th></th>", body, "Nobody has a role yet.")}
    <h3 class="serif osub">Recent changes</h3>
    ${table("<th>When</th><th>Person</th><th>Change</th>", audit, "No changes recorded yet.")}`;
}
// The venue's list (venue.js): upload or paste the venue's file, check what matched, save; add or remove wines by hand; re-check rows that were not in the catalog.
// Only wines on this list appear in the venue version's deck, games and suggestions. Rows not in the catalog wait for an editor to add the wine.
// The venue's list: what is on it, the website link of each wine, its tags, and changes to one row or to all ticked rows.
const STATUS_TEXT = (r) => (r.older ? "Older vintage: kept on record, not in the deck" : r.linked ? "In the deck" : r.unpublished ? "Not published yet" : "Not in our catalog yet");
const WEB_TEXT = (r) => (r.url ? (r.linkStatus === "ok" ? "Checked" : "Found") : r.linkStatus === "not found" ? "Not on the website" : r.linkStatus === "removed" ? "Link removed" : "Not looked for yet");
export function venueListRows(O, d) {
  const v = d.venue || {};
  const rows = withTags(listRows(v.list, d.cardsById, O.q), d.wineTags, d.wineIds, (r) => r.vintageId);
  return filterListRows(rows, O.vfilter || "all");
}
export function venueBulkBar(O, d, shown) {
  const sel = O.vsel || new Set(), n = sel.size, dis = n ? "" : " disabled", wt = d.wineTags;
  const tagPick = wt && wt.tags.length ? `<select class="ofield" data-owner-vbulktag aria-label="Tag">${wt.tags.map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join("")}</select>
      <button class="opill" data-action="owner:vbulk:tagon"${dis}>Add tag</button><button class="opill" data-action="owner:vbulk:tagoff"${dis}>Remove tag</button>` : "";
  return `<div class="obulk ovbulk" role="group" aria-label="Change the ticked wines">
    <span class="small"><b>${n}</b> ticked</span>
    <button class="opill" data-action="owner:vbulk:all">Tick all ${shown.length} shown</button><button class="opill" data-action="owner:vbulk:none"${dis}>Untick all</button>
    <span class="small muted">Website:</span><button class="opill" data-action="owner:vbulk:find"${dis}>Find links</button><button class="opill" data-action="owner:vbulk:check"${dis}>Check links</button>
    <button class="opill" data-action="owner:vbulk:noweb"${dis}>Not on the website</button><button class="opill" data-action="owner:vbulk:clear"${dis}>Clear link</button>
    ${tagPick}
    <button class="opill odanger" data-action="owner:vbulk:remove"${dis}>Remove from list</button>
  </div>`;
}
function venueTable(O, d) {
  const v = d.venue || {};
  if (v.error) return `<p class="muted">${esc(v.error)}</p>`;
  if (!v.list) return `<p class="muted">Loading…</p>`;
  const all = listRows(v.list, d.cardsById), sum = summary(v.list), sel = O.vsel || new Set();
  const shown = venueListRows(O, d), rows = shown.slice(0, 300);
  const pv = v.preview;
  const preview = pv ? `<h3 class="serif osub">From the file: ${pv.rows.length} ${pv.rows.length === 1 ? "wine" : "wines"}</h3>
    <div class="muted small onote">${pv.fresh.length} new to the list (${pv.fresh.filter((r) => r.wine_vintage_id).length} in our catalog, ${pv.fresh.filter((r) => !r.wine_vintage_id).length} not yet)${pv.rows.length - pv.fresh.length ? `; ${pv.rows.length - pv.fresh.length} already on the list` : ""}.${pv.skipped ? ` ${pv.skipped} ${pv.skipped === 1 ? "item that is" : "items that are"} not wine (spirits, sake, glasses, books, non-alcoholic) left out.` : ""} Wines not in our catalog are kept on the list and appear once an editor adds them and you tap Re-check.</div>
    ${table("<th>Wine</th><th>Status</th>", pv.rows.slice(0, 300).map((r) => `<tr><td>${esc([r.vintage, r.producer, r.wine_name].filter(Boolean).join(" "))}</td><td>${r.onList ? "Already on the list" : r.wine_vintage_id ? "In our catalog" : r.status === "several" ? "Several vintages: add by hand" : "Not in our catalog yet"}</td></tr>`).join(""))}
    <div class="ocontrols"><button class="opill" data-action="owner:venuesave"${pv.fresh.length ? "" : " disabled"}>Add ${pv.fresh.length} to the list</button><button class="opill" data-action="owner:venuecancel">Cancel</button></div>` : "";
  const finds = addable(d.cards, v.list, v.q || "", 15).map((c) => `<tr><td>${esc([c.vintage, c.producer, c.cuvee].filter(Boolean).join(" "))}</td><td class="small">${esc([c.appellation || c.region, c.country].filter(Boolean).join(", "))}</td><td><button class="opill" data-action="owner:venueadd:${esc(c.id)}">Add</button></td></tr>`).join("");
  const body = rows.map((r) => `<tr${sel.has(r.id) ? ' class="osel"' : ""}>
    <td><input type="checkbox" data-owner-vsel="${esc(r.id)}"${sel.has(r.id) ? " checked" : ""} aria-label="Tick ${esc(r.name)}"></td>
    <td class="ovname">${esc(r.name)}</td><td class="small ovstat">${esc(STATUS_TEXT(r))}</td>
    <td class="ourlcell"><input class="ofield ourl" data-owner-vurl="${esc(r.id)}" value="${esc(r.url)}" placeholder="No link" aria-label="Website page of ${esc(r.name)}" autocomplete="off" inputmode="url">
      <button class="opill" data-action="owner:vurl:${esc(r.id)}">Save</button>${r.url ? `<a class="small" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">Open</a>` : ""}<div class="small muted">${esc(WEB_TEXT(r))}</div></td>
    <td class="small">${esc(r.tags)}</td><td class="small">${r.source === "hand" ? "By hand" : "File"}</td>
    <td>${r.linked ? `<button class="opill" data-action="owner:vedit:${esc(r.vintageId)}">Edit wine</button>` : `<button class="opill" data-action="owner:vreview:${esc(r.id)}">Review</button>`}<button class="opill" data-action="owner:venueremove:${esc(r.id)}">Remove</button></td></tr>`).join("");
  const filterPick = `<select class="ofield" data-owner-vfilter aria-label="Show">${LIST_FILTERS.map((f) => `<option value="${f.id}"${(O.vfilter || "all") === f.id ? " selected" : ""}>${esc(f.label)}</option>`).join("")}${d.wineTags ? `<option value="tag:none"${O.vfilter === "tag:none" ? " selected" : ""}>No tag</option>${d.wineTags.tags.map((t) => `<option value="tag:${esc(t.id)}"${O.vfilter === "tag:" + t.id ? " selected" : ""}>Tag: ${esc(t.name)}</option>`).join("")}` : ""}</select>`;
  return `<div class="muted small onote">Only these wines appear in this version's deck, games and suggestions.</div>
    <h3 class="serif osub">Website links</h3>
    <div id="ownerVenueLinks"></div>
    <h3 class="serif osub">On the list: ${sum.matched - all.filter((r) => r.older).length} in the deck, ${sum.missing} not in our catalog yet</h3>
    ${all.some((r) => r.older) ? `<div class="muted small onote">${all.filter((r) => r.older).length} older ${all.filter((r) => r.older).length === 1 ? "vintage is" : "vintages are"} kept on the list for the record but not shown: only the most recent vintage of a wine is in the deck.</div>` : ""}
    ${sum.missing ? `<div class="muted small onote">Editors add the ones not in our catalog yet in the Editor tab, section “${esc(VENUE.name)}” (Review opens it on that wine); each joins the deck when it is published.</div>` : ""}
    <div class="ocontrols">${filterPick}<button class="opill" data-action="owner:venuerecheck"${sum.missing ? "" : " disabled"}>Re-check the ones not in our catalog</button></div>
    ${venueBulkBar(O, d, shown)}
    <div class="muted small onote">${shown.length} of ${all.length} on the list${shown.length > rows.length ? ` (the first ${rows.length} are listed; ticking all ticks every one of the ${shown.length})` : ""}. Website: paste the wine's page on ${esc(VENUE.site)} and tap Save, or empty the box and Save to take the link off. Edit wine opens the full editor for our catalog wine (it changes the wine in every version of the app).</div>
    ${table("<th></th><th>Wine</th><th>Status</th><th>Website</th><th>Tags</th><th>Added</th><th></th>", body, all.length ? "Nothing matches." : "The list is empty: the deck shows nothing until wines are added.")}
    <h3 class="serif osub">Add a catalog wine by hand</h3>
    <input class="ofield osearch" type="search" data-owner-venueq placeholder="Search our catalog" value="${esc(v.q || "")}" aria-label="Search the catalog to add a wine">
    ${v.q && v.q.trim().length >= 2 ? table("<th>Wine</th><th>Place</th><th></th>", finds, "No catalog wine matches (or it is already on the list).") : ""}
    <h3 class="serif osub">Upload the list</h3>
    <div class="muted small onote">Columns the file needs: Producer, Wine name, Vintage (or the shop's one-column Title export). A wine matches when it is exactly a catalog wine (accents and case ignored); nothing else is guessed.</div>
    <div class="ocontrols"><input type="file" accept=".csv,.txt,text/csv,text/plain" data-owner-venuefile aria-label="Choose the venue's file"></div>
    <textarea class="field" rows="4" data-owner-venuepaste placeholder="Or paste the rows here, with the header row first">${esc(v.paste || "")}</textarea>
    <div class="ocontrols"><button class="opill" data-action="owner:venueread">Read the pasted rows</button></div>
    ${preview}`;
}
// ---------------------------------------------------------------- the reference lists (docs/reference_lists.sql; data.js loadReferenceLists)
// Four lists that used to live only in the code. Rows 'suggested' are not used until you tap Use; "Mark checked" records that a source was read.
export const REF_KINDS = [
  { id: "grape_aliases", label: "Grape other names", cols: [["alias", "Word"], ["grape", "Grape"], ["kind", "Kind"]],
    note: "Shortcut: typing help (\"cab\" finds Cabernet Sauvignon). Synonym: the same grape under another name; only used to find the grape's rules, and a label keeps its own word." },
  { id: "producer_aliases", label: "Producer spellings", cols: [["alias", "Spelling"], ["producer_name", "Producer"]],
    note: "Other spellings editors confirmed with \"Use it\". They are offered as \"Looks like ...\"; the producer's own name is never changed." },
  { id: "place_designation_rules", label: "Designations", cols: [["country", "Country"], ["place_name", "Place"], ["designation", "Designation"]],
    note: "Places whose designation is the same for every wine there (Leithaberg: DAC). Filled in automatically on wine forms; a place's own designation always wins." },
  { id: "broad_places", label: "Broad regions", cols: [["country", "Country"], ["name", "Region"]],
    note: "For Germany and Austria only these regions are places; the village and vineyard stay in the wine name." },
];
const REF_FIELD = { grape_aliases: "grapeAliases", producer_aliases: "producerAliases", place_designation_rules: "designationRules", broad_places: "broadPlaces" };
export function refRows(lists, kind, q = "") {
  const rows = (lists && lists[REF_FIELD[kind]]) || [];
  const t = fold(q);
  return t ? rows.filter((r) => fold(Object.values(r).filter((v) => typeof v === "string").join(" ")).includes(t)) : rows;
}
function listsTable(O, d) {
  const L = d.refLists;
  if (!L) return `<p class="muted">${d.refListsError ? esc(d.refListsError) : "Loading…"}</p>`;
  const kind = REF_KINDS.find((k) => k.id === (O.refKind || "grape_aliases")), rows = refRows(L, kind.id, O.q);
  const status = (r) => (r.status === "checked" ? `<span class="gbadge ok">Checked</span>` : r.status === "in use" ? `<span class="gbadge">In use</span>` : `<span class="gbadge draft">Suggested</span>`);
  const body = rows.slice(0, 300).map((r) => `<tr>${kind.cols.map(([k]) => `<td>${esc(r[k] || "")}</td>`).join("")}<td>${status(r)}<div class="muted tiny">${esc(r.basis || "")}</div></td>
    <td>${r.status === "suggested" ? `<button class="opill" data-action="owner:refuse:${r.id}">Use</button> ` : ""}${r.status !== "checked" ? `<button class="opill" data-action="owner:refcheck:${r.id}">Mark checked</button> ` : ""}<button class="opill" data-action="owner:refremove:${r.id}">Remove</button></td></tr>`).join("");
  const inputs = kind.id === "grape_aliases" ? `<input class="ofield" data-owner-ref="alias" placeholder="Word" aria-label="Word"><input class="ofield" data-owner-ref="grape" placeholder="Grape (as on the grape list)" aria-label="Grape"><select class="ofield" data-owner-ref="kind" aria-label="Kind"><option value="synonym">Synonym</option><option value="shortcut">Shortcut</option></select>`
    : kind.id === "producer_aliases" ? `<input class="ofield" data-owner-ref="alias" placeholder="Spelling" aria-label="Spelling"><input class="ofield" data-owner-ref="producer_name" placeholder="Producer (as in our list)" aria-label="Producer">`
    : kind.id === "place_designation_rules" ? `<input class="ofield" data-owner-ref="country" placeholder="Country" aria-label="Country"><input class="ofield" data-owner-ref="place_name" placeholder="Place" aria-label="Place"><input class="ofield" data-owner-ref="designation" placeholder="Designation (DAC, DOCG …)" aria-label="Designation">`
    : `<input class="ofield" data-owner-ref="country" placeholder="Country" aria-label="Country"><input class="ofield" data-owner-ref="name" placeholder="Region" aria-label="Region">`;
  return `<div class="ocontrols">${REF_KINDS.map((k) => `<button class="opill${k.id === kind.id ? " on" : ""}" data-action="owner:refkind:${k.id}" aria-pressed="${k.id === kind.id}">${esc(k.label)}</button>`).join("")}</div>
    <div class="muted small onote">${esc(kind.note)}</div>
    <div class="ocontrols">${inputs}<button class="opill" data-action="owner:refadd">Add</button></div>
    ${table(`${kind.cols.map(([, l]) => `<th>${esc(l)}</th>`).join("")}<th>Status</th><th></th>`, body, "Nothing in this list yet.")}`;
}
// ---------------------------------------------------------------- food pairings (docs/food_pairing.sql; data.js loadFoodOverrides; rules in foods.js)
// One kind of wine at a time: each dish with what the rules say, and the owner's hand-set pin (which always wins while in use or checked).
// A pin comes with a reason players can read. "Mark checked" records that a source was read.
export function pairingsTable(O, d) {
  const kind = kindById(O.pkind) || kindById("full-red"), P = d.pins;
  if (P === undefined) return `<p class="muted">Loading\u2026</p>`;
  const q = fold(O.q || ""), rows = (P || []).filter((r) => r.kind_id === kind.id), pinOf = (id) => rows.find((r) => r.food_id === id);
  const status = (r) => (r.status === "checked" ? `<span class="gbadge ok">Checked</span>` : r.status === "in use" ? `<span class="gbadge">In use</span>` : `<span class="gbadge draft">Suggested</span>`);
  const body = FOODS.filter((f) => !q || fold(f.name).includes(q)).map((f) => {
    const rules = ratingOf(fitOf(f, kind).score), pin = pinOf(f.id);
    const buttons = P ? RATING_ORDER.map((r) => `<button class="opill${pin && pin.rating === r ? " on" : ""}" data-action="owner:ppin:${f.id}:${r}" aria-pressed="${!!pin && pin.rating === r}">${esc(RATING_LABEL[r])}</button>`).join(" ")
      + (pin ? ` <button class="opill" data-action="owner:pclear:${pin.id}">Clear</button>${pin.status === "suggested" ? ` <button class="opill" data-action="owner:puse:${pin.id}">Use</button>` : ""}${pin.status !== "checked" ? ` <button class="opill" data-action="owner:pcheck:${pin.id}">Mark checked</button>` : ""}` : "") : "";
    return `<tr><td>${esc(f.name)}</td><td>${esc(RATING_LABEL[rules])}</td><td>${pin ? `${esc(RATING_LABEL[pin.rating])} ${status(pin)}<div class="muted tiny">${esc(pin.reason || "no reason given")}</div>` : `<span class="muted">none</span>`}</td><td>${buttons}</td></tr>`;
  }).join("");
  return `<div class="ocontrols">${WINE_KINDS.map((k) => `<button class="opill${k.id === kind.id ? " on" : ""}" data-action="owner:pkind:${k.id}" aria-pressed="${k.id === kind.id}">${esc(k.label)}</button>`).join("")}</div>
    ${P === null ? `<div class="muted small onote">${esc(d.pinsError || "Pairing pins need a database update (docs/food_pairing.sql). Until then players see the rules' ratings only.")}</div>` : `<div class="muted small onote">A pin beats the rules for this dish and this kind of wine, and players see its reason. Type the reason first, then tap a rating.</div>
    <div class="ocontrols"><input class="ofield osearch" data-owner-preason placeholder="Reason players will read (optional)" aria-label="Reason for the pin" autocomplete="off"></div>`}
    ${table("<th>Dish</th><th>Rules say</th><th>Your pin</th><th></th>", body, "No dish matches.")}`;
}
// ---------------------------------------------------------------- the Reference tab (Wine Education Master Reference, migration 002)
// The owner writes drafts through public.ref_draft (they are recorded as the author) and moves them on with public.ref_review: submit,
// approve (the Owner may approve their own work; it is recorded as an owner override), publish, retire. Nothing here reaches players
// while reference_enabled is 0. The rules below (which decisions a status allows, the steps for an entity with its names, or a source
// with its rights and versions) are pure; app.js calls the database.
export const WR_VIEWS = [{ id: "entities", label: "Places & things" }, { id: "sources", label: "Sources" }, { id: "claims", label: "Facts" }, { id: "types", label: "Types" }, { id: "taxonomy", label: "Subject areas" }, { id: "links", label: "Catalog links" }, { id: "rules", label: "Grape rules" }];
export const WR_LANGS = [["en", "English"], ["fr", "Français"], ["it", "Italiano"], ["ja", "日本語"], ["zh-Hans", "中文 (简体)"], ["zh-Hant", "中文 (繁體)"], ["de", "Deutsch"], ["es", "Español"], ["und", "Not stated"]];
export const WR_LINK_TABLES = [["producers", "Producers"], ["wines", "Wines"], ["wine_vintages", "Vintages"], ["grapes", "Grapes"], ["geo_areas", "Places"]];
export const WR_DECISION_LABEL = { submit: "Submit", approve: "Approve", reject: "Send back", publish: "Publish", retire: "Retire" };
// The decisions a row's status allows (entities and fact versions can be published; sources, rights and names cannot).
export function nextDecisions(status, published = false, publishable = false) {
  if (status === "draft") return ["submit", "retire"];
  if (status === "pending_review") return ["approve", "reject"];
  if (status === "verified") return publishable && !published ? ["publish", "retire"] : ["retire"];
  return [];
}
export const prefName = (e) => { const n = (e && e.names) || []; const p = n.find((x) => x.is_preferred && x.status !== "retired") || n.find((x) => x.status !== "retired") || n[0]; return p ? p.name : "(no name)"; };
// An entity with its names in one tap: names first (an entity is published only with a current display name), then the entity.
export function entitySteps(e, decision) {
  const names = (e.names || []).filter((n) => (decision === "submit" ? n.status === "draft" : n.status === "pending_review"));
  const steps = decision === "publish" || decision === "retire" ? [] : names.map((n) => ["entity_names", n.id, decision]);
  const own = nextDecisions(e.status, !!e.published_at, true);
  if (own.includes(decision)) steps.push(["entities", e.id, decision]);
  return steps;
}
// A source with its versions and their rights in one tap: source, then rights (ref_rights), then versions (a version needs both).
export function sourceSteps(src, decision) {
  const want = decision === "submit" ? "draft" : "pending_review", steps = [];
  if (src.status === want) steps.push(["sources", src.id, decision]);
  const rights = new Map();
  for (const v of src.versions || []) if (v.rights && v.rights.status === want) rights.set(v.rights.id, v.rights);
  for (const r of rights.values()) steps.push(["rights_statements", r.id, decision]);
  for (const v of src.versions || []) if (v.status === want) steps.push(["source_versions", v.id, decision]);
  return steps;
}
// ---- migration 003: the subject areas (taxonomy), the catalog links queue and the recommended types. Pure.
// The owner's approved list is pasted from a spreadsheet (tabs) or a CSV file (commas): a header row, then one row per entry. Columns:
// "domain" (the domain's code), "code", "parent" (a subdomain's parent code; empty for a top subdomain), "sort", and one "name:xx" (or
// "name_xx") column per language, e.g. name:en, name:fr, name:ja, name:zh-Hans. A row whose code is its domain (or has no domain) is the
// domain itself. Nothing is invented: an empty cell stays empty; the database checks the codes and refuses conflicts.
const splitRow = (line, sep) => {
  if (sep === "\t") return line.split("\t");
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === ",") { out.push(cur); cur = ""; } else cur += c;
  }
  out.push(cur); return out;
};
export function parseTaxonomyTable(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (lines.length < 2) return { domains: [], errors: ["Paste a header row and at least one entry."], entries: 0 };
  const sep = lines[0].includes("\t") ? "\t" : ",";
  const head = splitRow(lines[0], sep).map((h) => h.trim().toLowerCase());
  const col = (n) => head.indexOf(n), iD = col("domain"), iC = col("code"), iP = col("parent"), iS = col("sort");
  const langs = head.map((h, i) => [i, (h.match(/^name[:_]([a-z]{2,3}(?:-[a-z0-9]{2,8})*)$/i) || [])[1]]).filter(([, l]) => l)
    .map(([i, l]) => [i, l.replace(/-([a-z]{4})$/i, (m, s) => "-" + s[0].toUpperCase() + s.slice(1).toLowerCase())]);
  const errors = [];
  if (iC < 0) errors.push('The header needs a "code" column.');
  if (!langs.length) errors.push('The header needs at least one name column, for example "name:en".');
  if (errors.length) return { domains: [], errors, entries: 0 };
  const SCRIPT = { ja: "Jpan", "zh-Hans": "Hans", "zh-Hant": "Hant", ko: "Kore" };
  const domains = new Map(), nodes = []; let rows = 0;
  lines.slice(1).forEach((line, k) => {
    const cells = splitRow(line, sep).map((c) => c.trim()), code = cells[iC] || "", dom = iD >= 0 ? cells[iD] || "" : "";
    if (!code) { errors.push(`Row ${k + 2}: no code.`); return; }
    rows++;
    const names = langs.filter(([i]) => cells[i]).map(([i, l]) => ({ name: cells[i], language: l, ...(SCRIPT[l] ? { script: SCRIPT[l] } : {}) }));
    const sort = iS >= 0 && cells[iS] !== "" && !Number.isNaN(Number(cells[iS])) ? Number(cells[iS]) : undefined;
    if (!dom || dom === code) domains.set(code, { code, ...(sort !== undefined ? { sort_order: sort } : {}), names, nodes: [] });
    else nodes.push({ dom, code, parent: iP >= 0 ? cells[iP] || null : null, sort, names, row: k + 2 });
  });
  for (const n of nodes) {
    if (!domains.has(n.dom)) domains.set(n.dom, { code: n.dom, names: [], nodes: [], missing: true });
  }
  for (const d of domains.values()) {
    if (d.missing) errors.push(`Domain ${d.code} has subdomains but no row of its own (add a row with code ${d.code}).`);
    // parents before children, keeping the file's order otherwise
    const mine = nodes.filter((n) => n.dom === d.code), placed = new Set(), out = [];
    let left = mine.slice(), guard = 0;
    while (left.length && guard++ < 50) {
      const next = [];
      for (const n of left) { if (!n.parent || placed.has(n.parent) || !mine.some((m) => m.code === n.parent)) { out.push(n); placed.add(n.code); } else next.push(n); }
      if (next.length === left.length) break;
      left = next;
    }
    for (const n of left) out.push(n);
    d.nodes = out.map((n) => ({ code: n.code, ...(n.parent ? { parent: n.parent } : {}), ...(n.sort !== undefined ? { sort_order: n.sort } : {}), names: n.names }));
    delete d.missing;
  }
  return { domains: [...domains.values()], errors, entries: rows };
}
// A subdomain's depth in its domain (for indenting the tree).
export function nodeDepth(nodes, code) {
  const byCode = new Map((nodes || []).map((n) => [n.code, n]));
  let d = 0, cur = byCode.get(code);
  while (cur && cur.parent && d < 20) { d++; cur = byCode.get(cur.parent); }
  return d;
}
// Review steps for a whole domain: its names, then the domain and its subdomains (an entry is published only with an approved name).
export function taxonomySteps(dom, decision) {
  const all = [dom, ...(dom.nodes || [])], want = decision === "submit" ? "draft" : decision === "approve" ? "pending_review" : "verified";
  const names = decision === "publish" ? [] : all.flatMap((e) => (e.names || []).filter((n) => n.status === want).map((n) => n.id));
  const ents = all.filter((e) => e.status === want && !(decision === "publish" && e.published_at)).map((e) => e.entity_id);
  return { names, entities: ents };
}
// The app's code list of appellation grape rules (aocgrapes.js), as the lines the grape-rules check compares with appellation_grape_rules.
export const ruleLines = () => APPELLATION_GRAPES.map((r) => ({ country: r.country, appellation: r.appellation, style: r.style, grape: r.grape, rule: r.rule, checked: !!r.checked, source: r.source || "", read: r.read || "" }));
// The grape-rules check in counts: how many code lines are in both, missing from the table, or not found in the catalog by name.
export function ruleSummary(rep) {
  const out = { both: 0, missing: 0, notFound: 0, extra: (rep && rep.extra_rows || []).length };
  for (const l of (rep && rep.lines) || []) { if (l.state === "in both") out.both++; else if (l.state === "not in appellation_grape_rules") out.missing++; else out.notFound++; }
  return out;
}
// A table row shown compactly: its fields as stored, ids left out (they are long and say nothing to a person).
export const rowText = (row) => Object.entries(row || {}).filter(([, v]) => v !== null && v !== "" && !/^[0-9a-f-]{36}$/i.test(String(v))).map(([k, v]) => `${k}: ${v}`).join(" · ");
// The grape-rule review (migration 005): the states, and which decisions a candidate allows (the database checks them again).
export const RULE_STATES = [["conflict", "Conflicts"], ["agree", "Agree"], ["code_only", "Code list only"], ["table_only", "Table only"], ["needs_source", "Needs a source"], ["unresolved", "Not found"], ["not_importable", "Not importable"]];
export function ruleDecisions(c) {
  if (c.claim_id) return [];
  if (c.decision !== "pending") return ["pending"];
  if (c.state === "unresolved" || c.state === "not_importable") return [];
  const out = [];
  if (c.code_line && c.code_line.checked && c.code_line.source && c.code_rule !== "usual") out.push("accept_code");
  if (c.table_row && c.table_source && c.table_rule) out.push("accept_table");
  out.push("reject");
  return out;
}
export const RULE_DECISION_LABEL = { accept_code: "Use the code list's", accept_table: "Use the table's", reject: "Reject", pending: "Undecide" };
export const WR_LINK_FILTERS = [["waiting", "Waiting"], ["several", "Several candidates"], ["unlinked", "Not linked"], ["confirmed", "Confirmed"], ["duplicates", "Same thing twice"]];
export const WR_METHOD_LABEL = { editor: "picked by hand", exact_name: "same name", created_from_catalog: "made from this row" };
// Recommendations for the identity types (migration 003 README). The decision stays the owner's: the Types view only shows the advice.
export const WR_TYPE_ADVICE = {
  part_of: ["now", "Builds the place tree (village in region in country); the catalog's own place tree can then be checked against a source."],
  product_of: ["now", "Ties each wine product to its producer, so products can be listed by producer."],
  defined_by_place: ["now", "Records the place a product is defined by (its appellation) as the label states it."],
  edition_of: ["now", "Ties each vintage or non-vintage edition to its product: the backbone of product, edition and release."],
  harvest_year: ["now", "The year on the label for a vintage edition; the old catalog's year is offered as a draft that needs a source."],
  nv_identifier: ["now", "Tells non-vintage editions apart only when the label or producer states it (edition number, base year, lot)."],
  release_of: ["later", "Switch on when you record the first stated release (a library or late release)."],
  release_date: ["later", "Switch on with releases: the date a release reached the market, as stated."],
  event_of: ["later", "Switch on when you record the first stated event (bottling, disgorgement)."],
  event_date: ["later", "Switch on with events."],
  made_from: ["later", "Switch on once grape varieties are linked and confirmed; a share only when stated."],
  bottle_format_ml: ["decide", "Your decision first: does bottle format belong to a release (REFERENCE_MODEL.md section 15, question 4)? Keep it proposed until then."],
};
// The review and import of grape rules (migration 005): stage a batch, decide each candidate, import the accepted ones as draft facts.
function ruleReviewHtml(O, d, q) {
  const B = d.wrBatches, head = `<h4 class="gh">Review and import</h4>`;
  if (d.wr5Missing) return head + `<p class="muted small">${esc(d.wr5Error)}</p>`;
  if (B === undefined) return head + `<p class="muted">Loading…</p>`;
  if (B === null) return head + `<p class="muted small">${esc(d.wr5Error || "Could not load the review.")}</p>`;
  const intro = `<div class="muted small onote">Stage the comparison as a batch to review. Each appellation and grape becomes a candidate: you take the code list's version or the table's, or reject it. A conflict is never taken without your choice. "Import accepted as drafts" turns accepted candidates into draft facts (type "Its rules name the grape", which must be switched on), each with its source as evidence; nothing is published.</div>
    <div class="ocontrols"><button class="opill" data-action="owner:wrrules:stage">Stage for review</button>${B.length ? `<button class="opill" data-action="owner:wrrules:import">Import accepted as drafts</button>` : ""}</div>`;
  if (!B.length) return head + intro + `<p class="muted small">No batch yet.</p>`;
  const b = B[0], counts = b.counts || {}, st = O.wrCandState || "conflict";
  const pick = `<div class="ocontrols">${RULE_STATES.map(([id, label]) => `<button class="opill${id === st ? " on" : ""}" data-action="owner:wrcandstate:${id}" aria-pressed="${id === st}">${esc(label)} (${counts[id] || 0})</button>`).join("")}</div>`;
  const summary = `<div class="muted small">Latest batch: ${b.code_lines} code lines, ${b.table_rows} table rows; ${b.decided} decided, ${b.imported} imported.</div>`;
  const C = d.wrCands;
  const rows = C === undefined ? "" : (C || []).filter((c) => !q || fold(c.appellation + " " + c.grape).includes(q)).map((c) => {
    const code = c.code_line ? `${esc(c.code_rule || "")}${c.code_line.checked ? "" : " · to check"}${c.code_line.source ? ` · <a href="${esc(c.code_line.source)}" target="_blank" rel="noopener">source</a>` : ""}` : `<span class="muted">not in the code list</span>`;
    const tbl = c.table_row ? `${esc(c.table_rule || "no rule word")}${c.table_min_pct != null ? ` · min ${esc(String(c.table_min_pct))}%` : ""}<div class="muted tiny">${esc(rowText(c.table_row))}</div>` : `<span class="muted">not in the table</span>`;
    const dec = c.claim_id ? `<span class="gbadge ok">Imported (draft fact)</span>` : c.decision !== "pending" ? `<span class="gbadge">${esc(RULE_DECISION_LABEL[c.decision] || c.decision)}</span>` : "";
    const btns = ruleDecisions(c).map((x) => `<button class="opill" data-action="owner:wrcand:${c.id}:${x}">${esc(RULE_DECISION_LABEL[x])}</button>`).join("");
    return `<tr><td><b>${esc(c.appellation)}</b> · ${esc(c.grape)}${c.style ? ` <span class="muted tiny">${esc(c.style)}</span>` : ""}<div class="muted tiny">${esc(c.reason)}</div></td><td class="small">${code}</td><td class="small">${tbl}</td><td>${dec}${btns}</td></tr>`;
  }).join("");
  return head + intro + summary + pick + (C === undefined ? `<p class="muted">Loading…</p>` : table("<th>Appellation · grape</th><th>Code list</th><th>Table</th><th></th>", rows, "None in this group."));
}
// Subject areas of one thing (migration 004's read, 003's assign): its assignments with their review buttons, and a form to add one.
function assignHtml(e, d) {
  const A = d.wrAssign, T = d.wrTax;
  if (e.kind === "taxonomy_domain" || e.kind === "taxonomy_node") return "";
  if (A === null || T === null) return `<div class="muted tiny">${esc(d.wr4Error || d.wr3Error || "Subject areas need migrations 003 and 004.")}</div>`;
  if (!A || A.entity_id !== e.id || !T) return `<div class="muted tiny">Loading subject areas…</div>`;
  const nodes = []; for (const dm of T.domains || []) for (const n of dm.nodes || []) nodes.push([n.code, `${n.code} ${((n.names || []).find((x) => x.language === "en") || (n.names || [])[0] || {}).name || ""}`]);
  const rows = (A.rows || []).map((a) => `<div class="small">Subject area <b>${esc(a.node)}</b> ${esc(a.node_name || "")}${a.is_primary ? " · main" : ""} ${wrBadge(a.status, false)} ${wrButtons("wrassign", a.id, nextDecisions(a.status))}</div>`).join("");
  const form = nodes.length ? `<div class="ocontrols">${wrSelect("anode", nodes, "Subject area")}<label class="small"><input type="checkbox" data-wr="aprimary"> main one</label><button class="opill" data-action="owner:wrassignadd:${e.id}">Put in subject area</button></div>`
    : `<div class="muted tiny">No subject areas yet (Subject areas view).</div>`;
  return rows + form;
}
const wrBadge = (st, published) => (st === "verified" && published ? `<span class="gbadge ok">Published</span>` : st === "verified" ? `<span class="gbadge">Approved</span>`
  : st === "pending_review" ? `<span class="gbadge star">Waiting for review</span>` : st === "retired" ? `<span class="gbadge">Retired</span>` : `<span class="gbadge draft">Draft</span>`);
const wrButtons = (verb, id, decisions) => decisions.map((dec) => `<button class="opill" data-action="owner:${verb}:${id}:${dec}">${esc(WR_DECISION_LABEL[dec])}</button>`).join("");
const wrSelect = (key, options, label, chosen = "") => `<select class="ofield" data-wr="${key}" aria-label="${esc(label)}">${options.map(([v, t]) => `<option value="${esc(v)}"${v === chosen ? " selected" : ""}>${esc(t)}</option>`).join("")}</select>`;
const wrInput = (key, label, ph = label) => `<input class="ofield osearch" data-wr="${key}" placeholder="${esc(ph)}" aria-label="${esc(label)}" autocomplete="off">`;
export function referenceTable(O, d) {
  const R = d.wref, view = O.wrView || "entities";
  if (R === undefined) return `<p class="muted">Loading…</p>`;
  if (R === null) return `<div class="muted small onote">${esc(d.wrefError || "The reference needs migration 002 (docs/reference/migration_002/DEPLOY_002.md).")}</div>`;
  const views = `<div class="ocontrols">${WR_VIEWS.map((v) => `<button class="opill${v.id === view ? " on" : ""}" data-action="owner:wrview:${v.id}" aria-pressed="${v.id === view}">${esc(v.label)}</button>`).join("")}</div>`;
  const note = `<div class="muted small onote">Private reference: ${R.counts.entities} things, ${R.counts.claims} facts, ${R.counts.sources} sources, ${R.counts.links} catalog links. ${Number(R.switch) >= 1 ? "<b>Switched on for players.</b>" : "Not shown to players (reference_enabled is 0)."} Your own approvals are recorded as owner approvals.</div>`;
  const ents = R.entities || [], byId = new Map(ents.map((e) => [e.id, e])), kindLabel = new Map((R.entity_kinds || []).map((k) => [k.code, k.label]));
  const entName = (id) => (byId.has(id) ? prefName(byId.get(id)) : "(not in the list)");
  const q = fold(O.q || "");
  let body = "";
  if (view === "entities") {
    const form = `<div class="ocontrols">${wrSelect("kind", (R.entity_kinds || []).map((k) => [k.code, k.label]), "Kind")}${wrInput("name", "Name")}${wrSelect("lang", WR_LANGS, "Language", "en")}${wrSelect("namekind", (R.name_kinds || []).map((k) => [k.code, k.label]), "Kind of name", "common")}<button class="opill" data-action="owner:wrnew">Create draft</button></div>`;
    const rows = ents.filter((e) => !q || (e.names || []).some((n) => fold(n.name).includes(q))).map((e) => {
      const open = O.wrOpen === e.id, decisions = nextDecisions(e.status, !!e.published_at, true);
      const names = (e.names || []).map((n) => `<div class="small">${esc(n.name)} <span class="muted">${esc(n.language)}${n.script ? " " + esc(n.script) : ""} · ${esc(n.name_kind)}${n.is_preferred ? " · preferred" : ""}</span> ${wrBadge(n.status, false)} ${e.status !== n.status && n.status !== "verified" && n.status !== "retired" ? wrButtons("wrname", n.id, nextDecisions(n.status)) : ""}</div>`).join("");
      const add = open ? `<div class="ocontrols">${wrInput("addname", "Another name")}${wrSelect("addlang", WR_LANGS, "Language", "fr")}${wrSelect("addkind", (R.name_kinds || []).map((k) => [k.code, k.label]), "Kind of name", "translation")}<button class="opill" data-action="owner:wraddname:${e.id}">Add name</button></div>${assignHtml(e, d)}` : "";
      return `<tr><td><b>${esc(prefName(e))}</b><div class="muted tiny">${esc(kindLabel.get(e.kind) || e.kind)}</div></td><td>${wrBadge(e.status, !!e.published_at)}</td><td>${names}${add}</td><td>${wrButtons("wrent", e.id, decisions)}<button class="opill" data-action="owner:wropen:${e.id}">${open ? "Close" : "Names"}</button></td></tr>`;
    }).join("");
    body = form + table("<th>Thing</th><th>Status</th><th>Names</th><th></th>", rows, "Nothing yet. Create the first draft above.");
  } else if (view === "sources") {
    const form = `<div class="ocontrols">${wrInput("stitle", "Title of the source")}${wrSelect("skind", (R.source_kinds || []).map((k) => [k.code, k.label]), "Kind of source", "regulation")}${wrInput("surl", "Web address (optional)", "https://...")}${wrInput("sversion", "Edition or date read (optional)")}</div>
      <div class="ocontrols">${wrInput("slicence", "Licence (for example CC-BY-4.0; empty if unknown)")}<label class="small"><input type="checkbox" data-wr="squote"> may be quoted</label><label class="small"><input type="checkbox" data-wr="scopy"> may be copied</label><button class="opill" data-action="owner:wrsource">Create source</button></div>`;
    const rows = (R.sources || []).filter((s) => !q || fold(s.title).includes(q)).map((s) => {
      const all = [s.status, ...(s.versions || []).map((v) => v.status), ...(s.versions || []).map((v) => v.rights && v.rights.status).filter(Boolean)];
      const can = (st) => all.includes(st);
      const vers = (s.versions || []).map((v) => `<div class="small">${esc(v.version_label)} ${wrBadge(v.status, false)}${v.rights ? ` <span class="muted">· ${esc(v.rights.licence_code)}${v.rights.allows_quote ? ", quotable" : ""}${v.rights.allows_copy ? ", copyable" : ""}</span> ${wrBadge(v.rights.status, false)}` : ` <span class="muted">· no licence recorded</span>`}</div>`).join("");
      return `<tr><td><b>${esc(s.title)}</b><div class="muted tiny">${esc(s.kind)}</div></td><td>${wrBadge(s.status, false)}</td><td>${vers}</td><td>${can("draft") ? `<button class="opill" data-action="owner:wrsrc:${s.id}:submit">Submit all</button>` : ""}${can("pending_review") ? `<button class="opill" data-action="owner:wrsrc:${s.id}:approve">Approve all</button>` : ""}</td></tr>`;
    }).join("");
    body = form + table("<th>Source</th><th>Status</th><th>Versions and rights</th><th></th>", rows, "No sources yet.");
  } else if (view === "claims") {
    const active = (R.relationship_types || []).filter((t) => t.status === "active"), attrs = (R.attribute_types || []).filter((t) => t.status === "active");
    const live = ents.filter((e) => e.status !== "retired").map((e) => [e.id, `${prefName(e)} (${kindLabel.get(e.kind) || e.kind})`]);
    const versions = []; for (const s of R.sources || []) for (const v of s.versions || []) if (v.status !== "retired") versions.push([v.id, `${s.title}: ${v.version_label}`]);
    const typeOpts = [...active.map((t) => ["rel:" + t.code, t.label]), ...attrs.map((t) => ["attr:" + t.code, `${t.label} (a value)`])];
    const form = typeOpts.length && live.length ? `<div class="ocontrols">${wrSelect("csubject", live, "About")}${wrSelect("ctype", typeOpts, "Says")}${wrSelect("cobject", [["", "(a value instead)"], ...live], "Object")}${wrInput("cvalue", "Value (for a value fact)")}</div>
      <div class="ocontrols">${versions.length ? wrSelect("csv", versions, "Evidence: source version") : `<span class="muted small">Add a source first.</span>`}${wrInput("cloc", "Where in the source (page, article...)")}${wrSelect("cmod", (R.modalities || []).map((m) => [m.code, m.label]), "Kind of evidence", "documentary")}<button class="opill" data-action="owner:wrclaim">Create fact</button></div>`
      : `<div class="muted small onote">${live.length ? "Switch on at least one type on the Types view first (all types start as proposed)." : "Create a thing first."}</div>`;
    const rows = (R.claims || []).map((c) => {
      const what = c.relationship_type ? `${esc(entName(c.subject_entity_id))} <span class="muted">${esc(c.relationship_type)}</span> ${esc(entName(c.object_entity_id))}` : `${esc(entName(c.subject_entity_id))} <span class="muted">${esc(c.attribute_type)}</span>`;
      if (q && !fold(what).includes(q)) return "";
      const vers = (c.versions || []).map((v) => `<div class="small">v${v.version_no} ${wrBadge(v.status, !!v.published_at)}${v.suspended_at ? ` <span class="gbadge draft">Suspended</span>` : ""}${v.current ? ` <span class="muted">current</span>` : ""}${[v.value_text, v.value_number, v.value_date, v.value_boolean].filter((x) => x !== null && x !== undefined).map((x) => ` = ${esc(String(x))}`).join("")} <span class="muted">· ${v.evidence} evidence</span>${(v.problems || []).length ? `<div class="muted tiny">${esc(v.problems.join("; "))}</div>` : ""} ${v.suspended_at ? "" : wrButtons("wrver", v.id, nextDecisions(v.status, !!v.published_at, true))}</div>`).join("");
      return `<tr><td>${what}</td><td>${vers}</td><td><button class="opill" data-action="owner:wrnewver:${c.id}">New version</button></td></tr>`;
    }).join("");
    body = form + table("<th>Fact</th><th>Versions</th><th></th>", rows, "No facts yet.");
  } else if (view === "types") {
    const advice = (t) => { const a = WR_TYPE_ADVICE[t.code]; if (!a || t.status !== "proposed") return ""; return `<div class="tiny ${a[0] === "now" ? "" : "muted"}"><b>${a[0] === "now" ? "Recommended now" : a[0] === "later" ? "Later" : "Your decision"}:</b> ${esc(a[1])}</div>`; };
    const row = (kind, t) => `<tr><td><b>${esc(t.label)}</b><div class="muted tiny">${esc(t.code)}</div>${advice(t)}</td><td class="small">${esc((t.subject_kinds || []).join(", "))}${t.object_kinds ? " → " + esc(t.object_kinds.join(", ")) : t.value_type ? ` = ${esc(t.value_type)}${t.unit ? " (" + esc(t.unit) + ")" : ""}` : ""}</td><td>${t.status === "active" ? `<span class="gbadge ok">On</span>` : t.status === "retired" ? `<span class="gbadge">Retired</span>` : `<span class="gbadge draft">Proposed</span>`}</td><td>${t.status !== "active" && t.status !== "retired" ? `<button class="opill" data-action="owner:wrtype:${kind}:${t.code}:active">Switch on</button>` : ""}${t.status === "active" ? `<button class="opill" data-action="owner:wrtype:${kind}:${t.code}:retired">Retire</button>` : ""}</td></tr>`;
    body = `<div class="muted small onote">A type can be used in facts only once it is switched on. Switching one on is your decision; a type in use can be retired but not changed.</div>`
      + table("<th>Relationship</th><th>Between</th><th>Status</th><th></th>", (R.relationship_types || []).map((t) => row("relationship", t)).join(""))
      + table("<th>Value</th><th>For</th><th>Status</th><th></th>", (R.attribute_types || []).map((t) => row("attribute", t)).join(""), "None yet.");
  } else if (view === "taxonomy") {
    const T = d.wrTax, svs = []; for (const s0 of R.sources || []) for (const v of s0.versions || []) if (v.status !== "retired") svs.push([v.id, `${s0.title}: ${v.version_label}`]);
    const plan = d.wrImport ? `<div class="small onote">${d.wrImport.dry_run ? "<b>Check only, nothing saved:</b>" : "<b>Imported:</b>"} ${d.wrImport.new_domains.length} new domains, ${d.wrImport.new_nodes.length} new subdomains, ${d.wrImport.names} names${d.wrImport.sort_changes.length ? `, new order for ${esc(d.wrImport.sort_changes.join(", "))}` : ""}.${d.wrImport.conflicts.length ? `<div><b>Problems (nothing will be saved until they are fixed):</b><ul>${d.wrImport.conflicts.slice(0, 20).map((c) => `<li>${esc(c)}</li>`).join("")}</ul></div>` : ""}${d.wrImport.not_in_file.length ? `<div class="muted">Already in the reference but not in this file (kept; retire them yourself if the list dropped them): ${esc(d.wrImport.not_in_file.slice(0, 30).join(", "))}</div>` : ""}${(d.wrImport.parse_errors || []).length ? `<div><b>Reading the table:</b> ${esc(d.wrImport.parse_errors.join(" "))}</div>` : ""}</div>` : "";
    const imp = `<div class="muted small onote">Your approved list of domains and subdomains goes here; nothing is filled in for you. Paste it from a spreadsheet: a header row with <b>domain</b>, <b>code</b>, <b>parent</b>, <b>sort</b> and one <b>name:xx</b> column per language (name:en, name:fr, name:it, name:ja, name:zh-Hans), then one row per entry (a domain's own row has its code in both domain and code). First record the document as a source (Sources view), then pick it here. "Check" saves nothing; "Import" saves drafts; the same file can be imported again later (codes are kept, new names and orders are added).</div>
      <div class="ocontrols">${svs.length ? wrSelect("tsv", svs, "The approved document (source version)") : `<span class="muted small">Record the approved document as a source first.</span>`}</div>
      <textarea class="ofield" data-wr="ttext" rows="5" style="width:100%" aria-label="The approved list, pasted" placeholder="domain&#9;code&#9;parent&#9;sort&#9;name:en&#9;name:fr"></textarea>
      <div class="ocontrols"><button class="opill" data-action="owner:wrtax:check">Check</button><button class="opill" data-action="owner:wrtax:import">Import</button></div>${plan}`;
    let tree = "";
    if (T === undefined) tree = `<p class="muted">Loading…</p>`;
    else if (T === null) tree = `<p class="muted small">${esc(d.wr3Error || "Could not load the subject areas.")}</p>`;
    else tree = (T.domains || []).length ? T.domains.map((dm) => {
      const label = (e) => `${wrBadge(e.status, !!e.published_at)} ${(e.names || []).map((n) => `<span class="small">${esc(n.name)} <span class="muted tiny">${esc(n.language)}</span></span>`).join(" · ")}`;
      const act = (dec, lab) => { const st = taxonomySteps(dm, dec); return st.names.length + st.entities.length ? `<button class="opill" data-action="owner:wrtaxrev:${dm.code}:${dec}">${lab} (${st.names.length + st.entities.length})</button>` : ""; };
      const nodes = (dm.nodes || []).map((n) => `<div style="padding-left:${12 + 14 * nodeDepth(dm.nodes, n.code)}px"><b class="small">${esc(n.code)}</b> ${label(n)}${n.assigned ? ` <span class="muted tiny">${n.assigned} assigned</span>` : ""}</div>`).join("");
      return `<div class="onote"><div><b>${esc(dm.code)}</b> ${label(dm)}</div>${nodes}<div class="ocontrols">${act("submit", "Submit all")}${act("approve", "Approve all")}${act("publish", "Publish all")}</div></div>`;
    }).join("") : `<p class="muted small">No subject areas yet: they come only from your approved list.</p>`;
    body = imp + `<h4 class="gh">Subject areas</h4>` + tree;
  } else if (view === "rules") {
    const G = d.wrRules;
    if (G === undefined) body = `<p class="muted">Loading…</p>`;
    else if (G === null) body = `<p class="muted small">${esc(d.wr4Error || "Could not run the check.")}</p>`;
    else if (!G.table_found) body = `<p class="muted small">There is no appellation_grape_rules table in the database, so there is nothing to compare.</p>`;
    else {
      const s = ruleSummary(G), filt = O.wrRuleFilter || "differ";
      const pick = `<div class="ocontrols">${[["differ", "Not in both"], ["all", "All code lines"], ["extra", "Only in the table"]].map(([id, label]) => `<button class="opill${id === filt ? " on" : ""}" data-action="owner:wrrulefilter:${id}" aria-pressed="${id === filt}">${esc(label)}</button>`).join("")}</div>`;
      const note = `<div class="muted small onote">A read-only comparison of the database table appellation_grape_rules (${G.table_rows} rows; columns ${esc((G.columns || []).join(", "))}) with the app's code list (aocgrapes.js). Nothing is changed. <b>${s.both}</b> code lines are in both; ${s.missing} are not in the table; ${s.notFound} could not be found in the catalog by their exact name; ${s.extra} table rows match no code line. Deciding which becomes the reference (as facts of the proposed type "Its rules name the grape") is yours.</div>`;
      const lines = (G.lines || []).filter((l) => filt === "all" || l.state !== "in both").filter((l) => !q || fold(l.appellation + " " + l.grape).includes(q));
      const lineRows = lines.map((l) => `<tr><td>${esc(l.appellation)} <span class="muted tiny">${esc(l.style || "")}</span></td><td>${esc(l.grape)} <span class="muted tiny">${esc(l.rule)}${l.checked ? "" : " · to check"}</span></td><td class="small">${esc(l.state)}${(l.table_rows || []).map((r) => `<div class="muted tiny">${esc(rowText(r))}</div>`).join("")}</td></tr>`).join("");
      const extraRows = (G.extra_rows || []).map((x) => `<tr><td>${esc((x.places || []).join(", ") || "?")}</td><td>${esc((x.grapes || []).join(", ") || "?")}</td><td class="muted tiny">${esc(rowText(x.row))}</td></tr>`).join("");
      body = note + pick + (filt === "extra" ? table("<th>Place</th><th>Grape</th><th>The table's row</th>", extraRows, "Every table row matches a code line.")
        : table("<th>Appellation (code list)</th><th>Grape and rule</th><th>In the table</th>", lineRows, "Every code line is in the table."));
    }
    body += ruleReviewHtml(O, d, q);
  } else if (d.wr3Missing) {
    // before migration 003: 002's report of old catalog rows not linked yet (kept so the tab works until 003 is run)
    const tab = O.wrLinkTable || "producers", S = d.wrSuggest;
    const picker = `<div class="ocontrols">${WR_LINK_TABLES.map(([id, label]) => `<button class="opill${id === tab ? " on" : ""}" data-action="owner:wrlinktab:${id}" aria-pressed="${id === tab}">${esc(label)}</button>`).join("")}</div>
      <div class="muted small onote">Old catalog rows not linked yet, the kind of thing each would be, and a reference thing with the same name if there is one. Every link is marked "old catalog, not verified"; nothing in the catalog changes. (Matching in bulk needs migration 003.)</div>`;
    const sugg = S === undefined ? `<p class="muted">Loading…</p>` : S === null ? `<p class="muted small">${esc(d.wrSuggestError || "Could not load the suggestions.")}</p>`
      : table("<th>Catalog row</th><th>Would be</th><th>Same name in the reference</th><th></th>", (S.rows || []).filter((r) => !q || fold(r.name || "").includes(q)).map((r) => {
        const matches = (r.matches || []).map((id) => `<button class="opill" data-action="owner:wrlink:${r.catalog_table}:${r.catalog_id}:${id}">Link to ${esc(entName(id))}</button>`).join("");
        return `<tr><td>${esc(r.name || "")}${r.note ? `<div class="muted tiny">${esc(r.note)}</div>` : ""}</td><td class="small">${esc(kindLabel.get(r.kind) || r.kind)}</td><td>${matches || `<span class="muted small">none</span>`}</td><td><button class="opill" data-action="owner:wrmake:${r.catalog_table}:${r.catalog_id}">Make a draft and link</button></td></tr>`;
      }).join(""), "Every row of this table is linked.");
    const links = (R.links || []).map((l) => `<tr><td class="small">${esc(l.catalog_table)} ${esc(l.catalog_id.slice(0, 8))}</td><td>${esc(entName(l.entity_id))}</td><td>${l.status === "confirmed" ? `<span class="gbadge ok">Confirmed</span>` : l.status === "rejected" ? `<span class="gbadge">Rejected</span>` : `<span class="gbadge draft">Suggested</span>`}</td><td>${l.status === "suggested" ? `<button class="opill" data-action="owner:wrdecide:${l.id}:confirmed">Confirm</button><button class="opill" data-action="owner:wrdecide:${l.id}:rejected">Reject</button>` : ""}</td></tr>`).join("");
    body = picker + sugg + `<h4 class="gh">Links</h4>` + table("<th>Catalog row</th><th>Reference thing</th><th>Status</th><th></th>", links, "No links yet.");
  } else {
    const tab = O.wrLinkTable || "producers", filter = O.wrFilter || "waiting", C = d.wrCov, Q = d.wrQueue;
    const cov = C && (C.tables || []).find((t) => t.catalog_table === tab);
    const picker = `<div class="ocontrols">${WR_LINK_TABLES.map(([id, label]) => `<button class="opill${id === tab ? " on" : ""}" data-action="owner:wrlinktab:${id}" aria-pressed="${id === tab}">${esc(label)}</button>`).join("")}</div>`;
    const counts = cov ? `<div class="muted small onote">${cov.rows} catalog rows: <b>${cov.confirmed}</b> confirmed, ${cov.waiting} waiting for your decision${cov.several ? ` (${cov.several} with several candidates)` : ""}, ${cov.unlinked} not linked. Every link is marked "old catalog, not verified"; the catalog itself never changes. Nothing is confirmed unless you confirm it.</div>`
      : C === null ? `<p class="muted small">${esc(d.wr3Error || "")}</p>` : "";
    const vint = tab === "wine_vintages";
    const extra = vint ? `<button class="opill" data-action="owner:wrtool:grapes">Draft grapes from the labels (made from)</button>` : tab === "geo_areas" ? `<button class="opill" data-action="owner:wrtool:placetree">Draft the place tree (part of)</button>` : "";
    const tools = `<div class="ocontrols"><button class="opill" data-action="owner:wrtool:suggest">Find same-name matches</button>${vint ? `<button class="opill" data-action="owner:wrtool:identity">Build product + edition for the next 25</button>` : `<button class="opill" data-action="owner:wrtool:seed">Make drafts for the next 50 not linked</button>`}<button class="opill" data-action="owner:wrtool:confirm">Confirm the unambiguous ones</button>${extra}</div>
      <div class="muted tiny">"Unambiguous" means the row's only suggestion, either made from that very row or the one thing with exactly its name. A row with several candidates always waits for you.</div>`;
    const filters = `<div class="ocontrols">${WR_LINK_FILTERS.map(([id, label]) => `<button class="opill${id === filter ? " on" : ""}" data-action="owner:wrfilter:${id}" aria-pressed="${id === filter}">${esc(label)}</button>`).join("")}</div>`;
    let list = "";
    if (Q === undefined) list = `<p class="muted">Loading…</p>`;
    else if (Q === null) list = `<p class="muted small">${esc(d.wr3Error || "Could not load the links.")}</p>`;
    else if (filter === "duplicates") list = table("<th>Reference thing</th><th>Old catalog rows</th>", (Q.groups || []).filter((g) => g.catalog_table === tab).map((g) => `<tr><td>${esc(g.entity_name || "")}</td><td>${g.rows.map((r) => `<div class="small">${esc(r.name || r.catalog_id)} <span class="muted">${esc(r.status)}</span></div>`).join("")}</td></tr>`).join(""),
      "No two rows of this table point at the same thing.");
    else list = table("<th>Catalog row</th><th>Reference thing</th><th></th>", (Q.rows || []).filter((r) => !q || fold(r.name || "").includes(q)).map((r) => {
      const links = (r.links || []).map((l) => `<div class="small">${esc(l.entity_name || "(no name)")} ${l.status === "confirmed" ? `<span class="gbadge ok">Confirmed</span>` : `<span class="gbadge draft">Suggested</span>`} <span class="muted tiny">${esc(WR_METHOD_LABEL[l.method] || l.method)}${l.score ? " · " + l.score : ""}${l.entity_status === "draft" ? " · thing is a draft" : ""}</span> ${l.status === "suggested" ? `<button class="opill" data-action="owner:wrdecide:${l.id}:confirmed">Confirm</button><button class="opill" data-action="owner:wrdecide:${l.id}:rejected">Reject</button>` : `<button class="opill" data-action="owner:wrundo:${l.id}">Undo</button>`}</div>`).join("");
      const make = (r.links || []).length ? "" : vint ? `<button class="opill" data-action="owner:wrrow:identity:${r.catalog_id}">Build product + edition</button>` : `<button class="opill" data-action="owner:wrrow:seed:${r.catalog_id}">Make a draft</button>`;
      return `<tr><td>${esc(r.name || "")}${r.detail ? `<div class="muted tiny">${esc(r.detail)}</div>` : ""}</td><td>${links || `<span class="muted small">none</span>`}</td><td>${make}</td></tr>`;
    }).join(""), filter === "waiting" ? "Nothing waiting for a decision here." : "None.");
    body = picker + counts + tools + filters + list;
  }
  return views + note + body;
}
export function ownerTableHtml(O, d) {
  if (O.tab === "venue") return venueTable(O, d);
  if (O.tab === "reference") return referenceTable(O, d);
  if (O.tab === "pairings") return pairingsTable(O, d);
  if (O.tab === "roles") return rolesTable(O, d);
  if (O.tab === "legend") return legendTable(O, d);
  if (O.tab === "tags") return tagsTable(O, d);
  if (O.tab === "lenses") return lensesTable(O, d);
  if (O.tab === "bingo") return bingoTable(O, d);
  if (O.tab === "checks") return checksTable(O, d);
  if (O.tab === "config") return configTable(O, d);
  if (O.tab === "lists") return listsTable(O, d);
  return winesTable(O, d);
}
// The page: tabs, the controls for the tab, a message line, and the table (which app.js can redraw alone while someone types).
export function ownerHtml(O, d) {
  const tabs = OWNER_TABS.map((t) => `<button class="otab${O.tab === t.id ? " on" : ""}" data-action="owner:tab:${t.id}" aria-pressed="${O.tab === t.id}">${esc(t.label)}</button>`).join("");
  let controls = "";
  if (O.tab === "wines") controls = `<input class="ofield osearch" type="search" data-owner-q placeholder="Search wines" value="${esc(O.q)}" aria-label="Search wines">
    <select class="ofield" data-owner-issue aria-label="Show"><option value="all">All wines</option>${ISSUES.map((i) => `<option value="${i.id}"${O.issue === i.id ? " selected" : ""}>${esc(i.label)}</option>`).join("")}</select>
    ${d.wineTags ? `<select class="ofield" data-owner-tagfilter aria-label="Tag"><option value="all">Any tag</option><option value="none"${O.tagFilter === "none" ? " selected" : ""}>No tag</option>${d.wineTags.tags.map((t) => `<option value="${esc(t.id)}"${O.tagFilter === t.id ? " selected" : ""}>${esc(t.name)}</option>`).join("")}</select>` : ""}`;
  else if (O.tab === "bingo") controls = `<input class="ofield osearch" type="search" data-owner-q placeholder="Search cards or squares" value="${esc(O.q)}" aria-label="Search bingo cards">`;
  else if (O.tab === "pairings") controls = `<input class="ofield osearch" type="search" data-owner-q placeholder="Search dishes" value="${esc(O.q)}" aria-label="Search dishes">`;
  else if (O.tab === "reference") controls = `<input class="ofield osearch" type="search" data-owner-q placeholder="Search names, titles or facts" value="${esc(O.q)}" aria-label="Search the reference">`;
  else if (O.tab === "lists") controls = `<input class="ofield osearch" type="search" data-owner-q placeholder="Search this list" value="${esc(O.q)}" aria-label="Search this list">`;
  else if (O.tab === "tags") controls = `<input class="ofield osearch" type="search" data-owner-q placeholder="Search tags" value="${esc(O.q)}" aria-label="Search tags">
    <select class="ofield" data-owner-tagkind aria-label="Kind of new tag">${TAG_KINDS.map((k) => `<option value="${k.id}">${esc(k.label)}</option>`).join("")}</select>
    <input class="ofield osearch" data-owner-tagname placeholder="New tag name" aria-label="New tag name" autocomplete="off"><button class="opill" data-action="owner:addtag">Add tag</button>`;
  else if (O.tab === "legend") controls = `<input class="ofield osearch" type="search" data-owner-q placeholder="Search approved words" value="${esc(O.q)}" aria-label="Search approved words">`;
  else if (O.tab === "roles") controls = `<input class="ofield osearch" type="search" data-owner-q placeholder="Search name or email" value="${esc(O.q)}" aria-label="Search staff">
    <select class="ofield" data-owner-rolefilter aria-label="Show role"><option value="all">All roles</option>${ROLES.filter((r) => r.id !== "player").map((r) => `<option value="${r.id}"${O.roleFilter === r.id ? " selected" : ""}>${esc(r.label)}</option>`).join("")}</select>
    <input class="ofield osearch" type="email" data-owner-staffemail placeholder="Player's email" aria-label="Email of the player to add" autocomplete="off">
    <select class="ofield" data-owner-staffrole aria-label="Role to give">${ASSIGNABLE_ROLES.map((r) => `<option value="${r.id}">${esc(r.label)}</option>`).join("")}</select><button class="opill" data-action="owner:staffadd">Add role</button>`;
  else if (O.tab === "config") controls = `<input class="ofield osearch" type="search" data-owner-q placeholder="Search settings" value="${esc(O.q)}" aria-label="Search settings">`;
  else if (O.tab === "venue") controls = `<input class="ofield osearch" type="search" data-owner-q placeholder="Search the list" value="${esc(O.q)}" aria-label="Search the list">`;
  else if (O.tab === "lenses") controls = `<select class="ofield" data-owner-lens aria-label="Lens">${LENS_IDS.map((id) => `<option value="${id}"${O.lens === id ? " selected" : ""}>${esc(LENSES[id].label)}</option>`).join("")}</select>
    <select class="ofield" data-owner-player aria-label="Player"><option value="me"${O.player === "me" ? " selected" : ""}>For me</option><option value="new"${O.player === "new" ? " selected" : ""}>For a new player</option></select>
    ${O.lens === "similar" ? `<input class="ofield osearch" list="ownerSeeds" data-owner-seed placeholder="Seed wine" value="${esc(O.seed)}" aria-label="Seed wine"><datalist id="ownerSeeds">${(d.seedNames || []).map((n) => `<option value="${esc(n)}">`).join("")}</datalist>` : ""}
    <button class="opill" data-action="owner:resetw">Reset weights</button>`;
  return `<div class="owner"><div class="otabs" role="group" aria-label="Owner sections">${tabs}</div>
    <div class="ocontrols">${controls}</div><div class="okmsg" id="ownerMsg" role="status">${esc(O.msg || "")}</div>
    <div id="ownerTable">${ownerTableHtml(O, d)}</div></div>`;
}

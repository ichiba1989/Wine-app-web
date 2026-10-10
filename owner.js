// The Owner page: plain tables for the person who runs the app, one tab per kind of thing: Wines, Lenses, Bingo, Checks and Config.
// Every table can be searched and sorted (tap a heading). It is reached from the gear (Settings) and only offered to the owner; the database
// still decides what anyone may change. The rules at the top (rows, search, sort, checks, coverage) are pure: no page, no network.
// The functions at the bottom return HTML strings. app.js holds the screen state, loads the data and does the saving (through data.js).
import { esc } from "./logic.js?v=11";
import { REACH_CHOICES } from "./wineinfo.js?v=13";
import { CARDS, TIERS, matches, cardFacts } from "./bingo.js?v=2";
import { LENSES, LENS_IDS, DEFAULT_WEIGHTS, mergeWeights } from "./recommend.js?v=3";
import { centsToField } from "./pricing.js?v=1";

export const OWNER_TABS = [{ id: "wines", label: "Wines" }, { id: "lenses", label: "Lenses" }, { id: "bingo", label: "Bingo" }, { id: "checks", label: "Checks" }, { id: "config", label: "Config" }];

const fold = (s) => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const isLive = (c) => !c.archived && (!c.wineStatus || c.wineStatus === "verified");

// ---------------------------------------------------------------- the wines table
export const WINE_COLUMNS = [
  { key: "producer", label: "Producer" }, { key: "wine", label: "Wine" }, { key: "year", label: "Year", num: true }, { key: "style", label: "Type" },
  { key: "country", label: "Country" }, { key: "place", label: "Region / appellation" }, { key: "grapes", label: "Grapes" },
  { key: "reach", label: "Reach", num: true }, { key: "price", label: "Price ($)", num: true }, { key: "photo", label: "Photo" },
];
export function wineRows(cards) {
  return (cards || []).filter(isLive).map((c) => {
    const raw = c.raw || {};
    return {
      id: c.id, producer: c.producer || "", wine: c.cuvee || "", year: c.vintage === "NV" ? null : (Number(raw.vintage_year) || Number(c.vintage) || null), yearText: c.vintage || "",
      style: c.style || "", country: c.country || "", place: [c.appellation, c.region].filter((x, i, a) => x && a.indexOf(x) === i).join(" · "),
      grapes: [...(c.grapes || []), ...(c.ruleGrapes || [])].join(", "), reach: c.reach == null ? null : Number(c.reach), price: typeof c.price === "number" ? c.price : null,
      photo: c.photo ? (c.imageKind || "photo") : "", hasPhoto: !!c.photo, photoKind: c.imageKind || "",
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

function winesTable(O, d) {
  const sort = O.sort.wines, col = WINE_COLUMNS.find((c) => c.key === sort.key) || WINE_COLUMNS[0];
  const rows = sortRows(filterRows(d.rows, O.q, O.issue), col.key, sort.dir, !!col.num).slice(0, 400);
  const body = rows.map((r) => `<tr>
    <td>${esc(r.producer)}</td><td>${esc(r.wine)}</td><td>${esc(r.yearText)}</td><td>${esc(r.style)}</td><td>${esc(r.country)}</td><td>${esc(r.place)}</td><td>${esc(r.grapes)}</td>
    <td><select class="ofield" data-owner-reach="${esc(r.id)}" aria-label="Reach of ${esc(r.producer)}"><option value=""${r.reach === null ? " selected" : ""}>-</option>${REACH_CHOICES.map(([v, l]) => `<option value="${v}"${String(r.reach) === v ? " selected" : ""}>${v} – ${esc(l)}</option>`).join("")}</select></td>
    <td class="onum"><input class="ofield oprice" inputmode="decimal" data-owner-price="${esc(r.id)}" value="${esc(centsToField(r.price))}" placeholder="-" aria-label="Price of ${esc(r.producer)}"><button class="opill" data-action="owner:saveprice:${esc(r.id)}">Save</button></td>
    <td>${esc(r.photo || "none")}</td><td><button class="opill" data-action="owner:edit:${esc(r.id)}">Edit all</button></td></tr>`).join("");
  return `<div class="muted small onote">${rows.length} of ${d.rows.length} wines. Reach: how easy the wine is to find (5 everywhere, 1 rare). Price sets the editor price; players' prices are blended in once enough players add one. Edit all opens the full editor.</div>
    ${table(WINE_COLUMNS.map((c) => th("wines", c, sort)).join("") + "<th></th>", body, "No wine matches.")}`;
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
  return `<div class="muted small onote">Things in the catalog that may need attention, out of ${d.rows.length} wines.</div>${table("<th>Check</th><th>Wines</th><th></th>", body)}`;
}
function configTable(O, d) {
  if (!d.config) return `<p class="muted">${d.configError ? esc(d.configError) : "Loading…"}</p>`;
  const rows = O.q ? d.config.filter((r) => fold(r.key + " " + (r.note || "")).includes(fold(O.q))) : d.config;
  const body = rows.map((r) => `<tr><td><b>${esc(r.key)}</b></td><td><input class="ofield onumin" inputmode="decimal" data-owner-cfg="${esc(r.key)}" value="${esc(shownConfigValue(r))}" aria-label="${esc(r.key)}"> <button class="opill" data-action="owner:savecfg:${esc(r.key)}">Save</button></td><td>${esc(r.note || "")}</td></tr>`).join("");
  return `<div class="muted small onote">Numbers the app reads from the database (thresholds and weights). Saving changes them for every player straight away.</div>${table("<th>Setting</th><th>Value</th><th>What it does</th>", body)}`;
}
export function ownerTableHtml(O, d) {
  if (O.tab === "lenses") return lensesTable(O, d);
  if (O.tab === "bingo") return bingoTable(O, d);
  if (O.tab === "checks") return checksTable(O, d);
  if (O.tab === "config") return configTable(O, d);
  return winesTable(O, d);
}
// The page: tabs, the controls for the tab, a message line, and the table (which app.js can redraw alone while someone types).
export function ownerHtml(O, d) {
  const tabs = OWNER_TABS.map((t) => `<button class="otab${O.tab === t.id ? " on" : ""}" data-action="owner:tab:${t.id}" aria-pressed="${O.tab === t.id}">${esc(t.label)}</button>`).join("");
  let controls = "";
  if (O.tab === "wines") controls = `<input class="ofield osearch" type="search" data-owner-q placeholder="Search wines" value="${esc(O.q)}" aria-label="Search wines">
    <select class="ofield" data-owner-issue aria-label="Show"><option value="all">All wines</option>${ISSUES.map((i) => `<option value="${i.id}"${O.issue === i.id ? " selected" : ""}>${esc(i.label)}</option>`).join("")}</select>`;
  else if (O.tab === "bingo") controls = `<input class="ofield osearch" type="search" data-owner-q placeholder="Search cards or squares" value="${esc(O.q)}" aria-label="Search bingo cards">`;
  else if (O.tab === "config") controls = `<input class="ofield osearch" type="search" data-owner-q placeholder="Search settings" value="${esc(O.q)}" aria-label="Search settings">`;
  else if (O.tab === "lenses") controls = `<select class="ofield" data-owner-lens aria-label="Lens">${LENS_IDS.map((id) => `<option value="${id}"${O.lens === id ? " selected" : ""}>${esc(LENSES[id].label)}</option>`).join("")}</select>
    <select class="ofield" data-owner-player aria-label="Player"><option value="me"${O.player === "me" ? " selected" : ""}>For me</option><option value="new"${O.player === "new" ? " selected" : ""}>For a new player</option></select>
    ${O.lens === "similar" ? `<input class="ofield osearch" list="ownerSeeds" data-owner-seed placeholder="Seed wine" value="${esc(O.seed)}" aria-label="Seed wine"><datalist id="ownerSeeds">${(d.seedNames || []).map((n) => `<option value="${esc(n)}">`).join("")}</datalist>` : ""}
    <button class="opill" data-action="owner:resetw">Reset weights</button>`;
  return `<div class="owner"><div class="otabs" role="group" aria-label="Owner sections">${tabs}</div>
    <div class="ocontrols">${controls}</div><div class="okmsg" id="ownerMsg" role="status">${esc(O.msg || "")}</div>
    <div id="ownerTable">${ownerTableHtml(O, d)}</div></div>`;
}

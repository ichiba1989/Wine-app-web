// Import wines into the journal from a file (CSV: the format a spreadsheet, Vivino, CellarTracker and most other wine apps can export).
// The player picks a file or pastes the rows, checks which column is which, sees what will happen, and confirms. Nothing is guessed about a wine:
// only what is in the file is used. A wine that is exactly a catalog wine (same producer, wine name and vintage) is linked to the catalog; every other
// wine is added as the player's own wine, like "+ Add a wine". Wines already in the journal are skipped. Photos cannot be imported.
// The rules at the top are pure (no browser, no network). importHtml draws the sheet (it returns an HTML string); app.js holds the clicks and the file reading,
// and data.js importJournal saves the rows.
import { esc, outsideRow, styleInfo } from "./logic.js?v=10";
import { parsePrice } from "./pricing.js?v=1";

// How many wines one file may add. Everyone gets the regular limit; people with the "pro" tier (the feature switch importLarge in feature_access, tiers listed there),
// editors and the owner get the larger one. app.js decides which applies. This is a convenience limit in the page, not a database rule.
export const LIMIT_REGULAR = 100, LIMIT_EXTENDED = 500, FEATURE = "importLarge";
// ON HOLD (owner, 2026-10-09): turning a rating into one of the five answers is switched off until it is revisited before testing. While false, ratings in a file are
// ignored (imported wines arrive unrated) and the rating column and rule are not shown. To bring it back, set this to true and check RATING_RULE with the owner.
export const USE_RATING_RULE = false;

// ---------------------------------------------------------------- reading the file
// Splits CSV text into rows of cells. Handles quotes, doubled quotes, commas inside quotes, line breaks inside quotes, a leading byte-order mark and
// comma, semicolon or tab separators (whichever the first line uses most).
export function parseCsv(text) {
  let t = String(text == null ? "" : text).replace(/^﻿/, "");
  const first = t.split(/\r?\n/, 1)[0] || "";
  const count = (ch) => { let n = 0, q = false; for (const c of first) { if (c === '"') q = !q; else if (c === ch && !q) n += 1; } return n; };
  const sep = [",", ";", "\t"].map((c) => [c, count(c)]).sort((a, b) => b[1] - a[1])[0];
  const delim = sep[1] > 0 ? sep[0] : ",";
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; row.push(cell); cell = ""; rows.push(row); row = []; }
    else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  const clean = rows.map((r) => r.map((x) => x.trim())).filter((r) => r.some((x) => x !== ""));
  return { headers: clean[0] || [], rows: clean.slice(1) };
}

// ---------------------------------------------------------------- which column is which
// field id -> the header words that usually mean it (compared after dropping accents, case and punctuation).
export const FIELDS = [
  { id: "producer", label: "Producer", required: true, words: ["producer", "winery", "maker", "domaine", "estate", "brand", "producer name", "winery name"] },
  { id: "wine_name", label: "Wine name", words: ["wine", "wine name", "name", "cuvee", "label", "title", "bottle", "wine title"] },
  { id: "vintage", label: "Vintage", words: ["vintage", "year", "vintage year"] },
  { id: "date", label: "Date drunk", words: ["date", "date drunk", "drank", "consumed", "tasted", "date tasted", "drink date", "review date", "scan date", "date added"] },
  { id: "rating", label: "Your rating", words: ["rating", "score", "my rating", "your rating", "stars", "points", "user rating", "my score"] },
  { id: "price", label: "Price paid", words: ["price", "cost", "paid", "purchase price", "price paid", "my price"] },
  { id: "notes", label: "Notes", words: ["notes", "note", "comment", "comments", "review", "tasting notes", "my notes", "my review"] },
  { id: "style", label: "Type (red, white...)", words: ["type", "style", "color", "colour", "wine type", "category"] },
  { id: "grape", label: "Grape", words: ["grape", "grapes", "varietal", "variety", "varietals", "grape variety"] },
  { id: "region", label: "Region", words: ["region", "appellation", "area", "location", "subregion"] },
  { id: "country", label: "Country", words: ["country", "nation"] },
];
const norm = (s) => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
// { fieldId: column index } for every field with a header that matches. A header is used for one field only (the first field to claim it, in FIELDS order).
export function detectMapping(headers) {
  const used = new Set(), out = {};
  const heads = headers.map(norm);
  for (const f of FIELDS) {
    const exact = heads.findIndex((h, i) => !used.has(i) && f.words.includes(h));
    if (exact >= 0) { out[f.id] = exact; used.add(exact); }
  }
  return out;
}

// ---------------------------------------------------------------- turning a row into a journal wine
export const STYLE_WORDS = { red: "red", white: "white", rose: "rose", sparkling: "sparkling", fortified: "fortified" };
const styleOf = (text) => { const k = norm(text).replace(/\s+/g, ""); return STYLE_WORDS[k] || (styleInfo(k) ? k : null); };   // only the five kinds; anything else stays unknown
const vintageOf = (text) => {
  const t = String(text || "").trim();
  if (/^(nv|n v|non vintage|non-vintage|multi vintage|mv)$/i.test(t)) return "NV";
  const m = t.match(/^(\d{4})(?:\.0+)?$/);
  return m && Number(m[1]) >= 1800 && Number(m[1]) <= new Date().getFullYear() + 1 ? m[1] : "";
};
// Dates: 2024-05-31, 2024/05/31, 5/31/2024 (month first: the app is for the United States) and 31 May 2024 style words. Anything else is "no date" (today is used).
export function dateOf(text, today = new Date()) {
  const t = String(text || "").trim(); if (!t) return null;
  let y, m, d, r;
  if ((r = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) { y = +r[1]; m = +r[2]; d = +r[3]; }
  else if ((r = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/))) { m = +r[1]; d = +r[2]; y = +r[3]; }
  else { const p = Date.parse(t + " 12:00"); if (Number.isNaN(p)) return null; const x = new Date(p); y = x.getFullYear(); m = x.getMonth() + 1; d = x.getDate(); }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  if (y < 1990 || dt > Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
// The rule that turns a rating into one of the app's five answers. It is shown to the player before they confirm. A rating out of `scale` (5, 10 or 100):
// 85% or more -> would buy again; 70 to 84% -> would drink again; 50 to 69% -> no preference; under 50% -> do not like. "Dislike, but understand" is never assigned:
// only the player can say that.
export const RATING_RULE = [
  { min: 0.85, code: "buy", text: "85% or more of the scale: I would buy again" },
  { min: 0.7, code: "drink", text: "70 to 84%: I would drink again" },
  { min: 0.5, code: "none", text: "50 to 69%: No preference" },
  { min: 0, code: "no", text: "Under 50%: Do not like" },
];
export function verdictFor(value, scale) {
  const n = parseFloat(String(value).replace(",", "."));
  if (!Number.isFinite(n) || n <= 0 || n > scale) return null;
  const pct = n / scale;
  return RATING_RULE.find((r) => pct >= r.min).code;
}
// The scale a column of ratings is probably on: 5 if nothing is above 5, 10 if nothing is above 10, otherwise 100. The player can change it.
export function guessScale(values) {
  const nums = values.map((v) => parseFloat(String(v).replace(",", "."))).filter(Number.isFinite);
  const max = nums.length ? Math.max(...nums) : 0;
  return max <= 5 ? 5 : max <= 10 ? 10 : 100;
}

const key = (producer, name, vintage) => [norm(producer), norm(name), vintage].join("|");
// What is in the journal and the catalog, as lookup tables. entries: journal entries (producer, wine_name, vintage_year, is_non_vintage); cards: catalog cards.
export function lookups(entries, cards) {
  const have = new Set((entries || []).map((e) => key(e.producer, e.wine_name, e.is_non_vintage ? "NV" : e.vintage_year ? String(e.vintage_year) : "")));
  const catalog = new Map();
  for (const c of cards || []) { if (!c.archived) catalog.set(key(c.producer, c.cuvee, c.vintage), c); }
  return { have, catalog };
}

// Builds one item per file row. opts: { mapping, useRatings, scale, today, lookups, userId, limit }.
// Each item: { line, status: "add" | "dup" | "skip", reason?, kind?: "catalog" | "outside", label, wine?, wine_vintage_id?, consumed_on, verdict, purchase_price_cents, notes }
export function buildItems(rows, opts) {
  const { mapping, useRatings, scale, lookups: lk, userId } = opts, today = opts.today || new Date(), limit = opts.limit || LIMIT_REGULAR;
  const get = (r, f) => (mapping[f] == null || mapping[f] < 0 ? "" : (r[mapping[f]] || "").trim());
  const seen = new Set();
  return rows.slice(0, limit).map((r, i) => {
    const producer = get(r, "producer"), wine_name = get(r, "wine_name"), vintage = vintageOf(get(r, "vintage"));
    const label = [producer, wine_name, vintage].filter(Boolean).join(" ");
    if (!producer) return { line: i + 2, status: "skip", reason: "No producer", label: label || "(empty row)" };
    const k = key(producer, wine_name, vintage);
    if (lk.have.has(k) || seen.has(k)) return { line: i + 2, status: "dup", reason: lk.have.has(k) ? "Already in your journal" : "Listed twice in the file", label };
    seen.add(k);
    const price = parsePrice(get(r, "price"));
    const item = {
      line: i + 2, status: "add", label,
      consumed_on: dateOf(get(r, "date"), today) || null,
      verdict: USE_RATING_RULE && useRatings && mapping.rating != null ? verdictFor(get(r, "rating"), scale) : null,
      purchase_price_cents: typeof price === "number" && Number.isFinite(price) ? price : null,
      notes: get(r, "notes").slice(0, 2000) || null,
    };
    const card = lk.catalog.get(k);
    if (card) return { ...item, kind: "catalog", wine_vintage_id: card.id };
    const place = [get(r, "region"), get(r, "country")].filter(Boolean).join(", ");
    return { ...item, kind: "outside", wine: outsideRow({ producer, wine_name, vintage, grape: get(r, "grape"), region: place, style: styleOf(get(r, "style")) || "unknown" }, userId) };
  });
}
export const summarize = (items) => ({
  add: items.filter((x) => x.status === "add").length, catalog: items.filter((x) => x.kind === "catalog").length,
  dup: items.filter((x) => x.status === "dup").length, skip: items.filter((x) => x.status === "skip").length,
});

// ---------------------------------------------------------------- the sheet
export const TEMPLATE_CSV = "Producer,Wine name,Vintage,Date drunk,Rating (out of 5),Price paid,Notes,Type,Grape,Region,Country\nSample Estate,Reserve Red,2019,2025-12-31,4,32.50,Great with lamb,red,Cabernet Sauvignon,Napa Valley,USA\n";
// I: { step: "pick" | "map" | "done", headers, rows, mapping, useRatings, scale, error, busy, result, text }
export function importHtml(I, items, lk) {
  const head = (title, sub) => `<div class="sheethead"><div class="sheettitle"><div class="serif big">${esc(title)}</div>${sub ? `<div class="muted small">${esc(sub)}</div>` : ""}</div>
      <div class="sheetbtns"><button class="xbtn" data-action="import:close" aria-label="Close">&times;</button></div></div>`;
  const wrap = (inner) => `<div class="overlay"><div class="sheet" id="importPanel" role="dialog" aria-label="Import wines">${inner}</div></div>`;
  if (I.step === "done") {
    const r = I.result || { added: 0, failed: [] };
    return wrap(`${head("Import finished")}<div class="okbox">Added ${r.added} ${r.added === 1 ? "wine" : "wines"} to your journal.</div>
      ${I.skipped ? `<p class="muted small">${esc(I.skipped)}</p>` : ""}
      ${r.stopped ? `<div class="err">${esc(r.stopped)} ${r.failed.length} ${r.failed.length === 1 ? "wine was" : "wines were"} not added. Try again later, or ask us about the pro tier.</div>` : r.failed.length ? `<div class="err">${r.failed.length} could not be saved: ${esc(r.failed.slice(0, 3).map((f) => f.label + " (" + f.message + ")").join("; "))}${r.failed.length > 3 ? "…" : ""}</div>` : ""}
      <button class="btn primary" data-action="import:done">Open my journal</button>`);
  }
  if (I.step === "map") {
    const s = summarize(items), opts = (cur) => `<option value="-1"${cur == null || cur < 0 ? " selected" : ""}>(none)</option>` + I.headers.map((h, i) => `<option value="${i}"${cur === i ? " selected" : ""}>${esc(h || "Column " + (i + 1))}</option>`).join("");
    const sel = FIELDS.filter((f) => USE_RATING_RULE || f.id !== "rating").map((f) => `<label class="improw"><span>${esc(f.label)}${f.required ? " *" : ""}</span><select class="sortsel" data-import-map="${f.id}">${opts(I.mapping[f.id])}</select></label>`).join("");
    const rating = USE_RATING_RULE && I.mapping.rating != null && I.mapping.rating >= 0
      ? `<div class="srow"><div class="stitle">Your ratings</div><div class="gopts"><button class="gopt${I.useRatings ? " on" : ""}" data-action="import:ratings:on" aria-pressed="${I.useRatings}">Use them</button><button class="gopt${!I.useRatings ? " on" : ""}" data-action="import:ratings:off" aria-pressed="${!I.useRatings}">Leave unrated</button></div>
         ${I.useRatings ? `<label class="improw"><span>Scale</span><select class="sortsel" data-import-scale>${[5, 10, 100].map((n) => `<option value="${n}"${I.scale === n ? " selected" : ""}>Out of ${n}</option>`).join("")}</select></label>
         <ul class="muted small imprule">${RATING_RULE.map((r) => `<li>${esc(r.text)}</li>`).join("")}</ul>` : `<div class="muted small">Wines will be added without a rating, so you can rate them yourself later.</div>`}</div>` : "";
    const preview = items.slice(0, 5).map((x) => `<div class="impit ${x.status}"><span class="serif trunc">${esc(x.label)}</span><span class="muted small">${x.status === "add" ? (x.kind === "catalog" ? "In our catalog" : "Your own wine") + (x.verdict ? " · rated" : "") : esc(x.reason)}</span></div>`).join("");
    return wrap(`${head("Check the columns", `${I.rows.length} ${I.rows.length === 1 ? "row" : "rows"} in your file`)}
      <div class="improws">${sel}</div>${rating}
      <div class="srow"><div class="stitle">What will happen</div>
        <div class="muted small">Wines are added without a rating, so you can rate them yourself afterwards.</div>
        <div class="ptext"><b>${s.add}</b> ${s.add === 1 ? "wine" : "wines"} will be added${s.catalog ? ` (${s.catalog} found in our catalog)` : ""}.${s.dup ? ` ${s.dup} skipped as already there or listed twice.` : ""}${s.skip ? ` ${s.skip} skipped for having no producer.` : ""}</div>
        ${I.rows.length > I.limit ? `<div class="err">Only the first ${I.limit} rows are used. Import the rest in a second file.</div>` : ""}
        <div class="impprev">${preview}</div></div>
      <div id="impErr" class="err">${esc(I.error || "")}</div>
      <div class="two"><button class="btn outline" data-action="import:back"${I.busy ? " disabled" : ""}>Back</button><button class="btn primary" data-action="import:go"${s.add && !I.busy ? "" : " disabled"}>${I.busy ? "Importing…" : `Add ${s.add} ${s.add === 1 ? "wine" : "wines"}`}</button></div>`);
  }
  if (I.allowance && I.allowance.remaining <= 0) {
    return wrap(`${head("Import wines", "Bring in a list you already keep.")}
    <p class="ptext">You have reached your limit for now: ${I.allowance.limit} wines every ${I.allowance.hours} hours. Try again later, or ask us about the pro tier for more.</p>
    <button class="btn outline" data-action="import:close">Close</button>`);
  }
  return wrap(`${head("Import wines", "Bring in a list you already keep.")}
    <p class="ptext">Choose a CSV file (you can export one from a spreadsheet, Vivino, CellarTracker and most other wine apps), or paste the rows. The first line should name the columns, such as Producer, Wine name, Vintage and Date drunk. Photos cannot be imported. ${I.allowance ? `You can add up to ${I.allowance.remaining} more ${I.allowance.remaining === 1 ? "wine" : "wines"} now (${I.allowance.limit} every ${I.allowance.hours} hours).` : `Up to ${I.limit} wines per file.`}</p>
    <label class="btn primary impfile">Choose a file<input type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" hidden data-import-file></label>
    <div class="stitle impor">or paste</div>
    <textarea class="field imptext" data-import-text rows="5" placeholder="Producer,Wine name,Vintage&#10;Sample Estate,Reserve Red,2019" spellcheck="false">${esc(I.text || "")}</textarea>
    <div id="impErr" class="err">${esc(I.error || "")}</div>
    <div class="two"><a class="btn outline" href="data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE_CSV)}" download="wine-import-template.csv">Get a template</a><button class="btn primary" data-action="import:paste">Read my rows</button></div>`);
}

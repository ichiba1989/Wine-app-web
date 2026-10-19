// Editor tab, "Vintage Wine Merchants": the shop's wines that are not in our catalog yet, reviewed one at a time and added to the catalog.
// The venue's file only gives a title per wine ("2019 Ridge Vineyards Monte Bello Santa Cruz Mountains"). For each row the form is filled with SUGGESTIONS:
// first the ones prepared once from the shop's titles (vwmprep.js, loaded only here), else the app's own (venue.js suggestRow). Either way they come only
// from the title's words and lists the app already holds. The editor checks and changes every field, then adds the wine: published at once, or waiting
// for review (Catalog section). Nothing is created without that tap, and nothing is looked up outside the app. The new wine is linked to the list row,
// so it joins the venue's deck as soon as it is published. The queue keeps one country, region and producer together.
// The place is chosen by searching the place list; a place that is not in it yet is typed in and created when the wine is added (geo.js savePlace).
// Everything fits on one phone screen. Editor writes are online only. The rules are in venue.js (pure); this file draws the screen and handles the taps.
// "Publish the sure ones" (owner, 2026-10-17): the rows whose every field comes from the title, a stored rule or a cited source and agrees with the
// others (venue.js sureOf) are listed together; the editor looks through the list, unticks any, and publishes them with one tap. The rest stay here.
import { esc, WINE_STYLES, DOSAGES, dosageFromText, dosageLabel } from "./logic.js?v=25";
import { VENUE, withoutDosage, suggestRow, splitTitle, reviewQueue, checkReview, prepIndex, prepOf, canonPlace, placeText, placePlan, searchPlaces, splitOf, wineNameOf, placeLookalikes, linkSummary, rowTitle, sureContext, sureOf, rankPlace } from "./venue.js?v=26";
import { placeOptions, designationRowHtml, startDesignation } from "./wineinfo.js?v=44";
import { placeFromArea, savePlace, designationPlan, broadPlace, planPlace } from "./geo.js?v=10";
import * as db from "./data.js?v=57";
import { caseKey, lookalikes } from "./text.js?v=3";
import { ruleLineFor } from "./aocgrapes.js?v=3";

const fold = caseKey;   // text.js: accents and capitals ignored, punctuation still counts
const STYLE_CHOICES = WINE_STYLES.map((s) => ({ id: s.id, label: s.label }));

// The form for one row, filled with the prepared suggestions when there are some, else the app's own.
export function formFor(row, lists, prep = null) {
  const p = prepOf(prep, row.wine_name);
  const base = { rowId: row.id, title: row.wine_name, shopType: row.shop_type || "", vintage: row.vintage || "NV", prepared: !!p, typing: false, q: "" };
  if (p) {
    const split = splitOf(row.wine_name, p.producer);
    const sp = split ? splitTitle(row.wine_name, split) : { producer: p.producer, wine: p.wine };
    let place = canonPlace(lists.areas, broadPlace(p.place));   // Germany and Austria: only the broad wine region (geo.js)
    const rk = rankPlace(place, row.wine_name);   // "Saint-Emilion Grand Cru" in the title: its own AOC (rankaoc.js)
    if (rk) place = canonPlace(lists.areas, rk.place);
    const d = dosageFor(p.style, row.wine_name, p, lists);
    return {
      ...base, ...desigFor(lists, place, row.wine_name), ...d, split, producer: sp.producer, wine: withoutDosage(wineNameOf(p.wine || sp.wine, { grapes: p.grapes, place: { ...p.place, ...place } }), d.dosage), style: p.style, styleWhy: p.styleWhy, place, placeWhy: rk ? rk.why : p.placeWhy, placeSource: p.placeSource || "", placeNote: p.placeNote || "",
      grapes: p.grapes.join(", "), notWine: p.notWine, knownProducer: lists.producers.some((x) => fold(x.name) === fold(sp.producer)),
    };
  }
  const s = suggestRow(row.wine_name, { producers: lists.producers, areas: lists.areas, shopType: row.shop_type || "" });
  const sp = splitTitle(row.wine_name, s.split);
  let place = broadPlace(s.areaId ? placeFromArea(lists.areas, s.areaId) : { country: "", region: "", appellation: "" });
  const rk = rankPlace(place, row.wine_name);
  if (rk) place = canonPlace(lists.areas, rk.place);
  const d = dosageFor(s.style, row.wine_name, null, lists);
  return {
    ...base, ...desigFor(lists, place, row.wine_name), ...d, split: s.split, producer: sp.producer, wine: withoutDosage(wineNameOf(sp.wine, { grapes: s.grapes, place }), d.dosage), style: s.style, styleWhy: s.styleWhy, place,
    placeWhy: rk ? rk.why : s.areaWhy, grapes: s.grapes.join(", "), notWine: false, knownProducer: !!s.producerId,
  };
}
// A sparkling wine's sweetness term (owner, 2026-10-17; logic.js DOSAGES): the one looked up for this title (vwmprep.js PREP_DOSAGE, with its page),
// else the one written in the title (the label). The term has its own field and leaves the wine name. dosageReady: docs/sparkling_dosage.sql is run.
function dosageFor(style, title, p, lists) {
  const none = { dosage: "", dosageWhy: "", dosageSource: "", dosageBasis: "", dosageReady: !!lists.dosageReady };
  if (style !== "sparkling") return none;
  const r = p && p.researchDosage;
  if (r) return { ...none, dosage: r[0], dosageWhy: r[2], dosageSource: r[1], dosageBasis: "source" };
  const t = dosageFromText(title);
  return t ? { ...none, dosage: t.id, dosageWhy: `"${t.word}" in the title`, dosageBasis: "label" } : none;
}
export function dosageHtml(f) {
  if (f.style !== "sparkling") return "";
  if (!f.dosageReady) return `<div class="vrlbl">How sweet <span class="muted">(needs docs/sparkling_dosage.sql)</span></div>`;
  const chips = [...DOSAGES, { id: "", label: "Not on the label" }].map((d) => `<button class="chip${(f.dosage || "") === d.id ? " on" : ""}" data-vr="dosage:${d.id}" aria-pressed="${(f.dosage || "") === d.id}">${esc(d.label)}</button>`).join("");
  const why = f.dosageSource ? ` <a class="small" href="${esc(f.dosageSource)}" target="_blank" rel="noopener noreferrer" title="${esc(f.dosageWhy)}">· found online</a>` : f.dosageWhy ? ` <span class="muted small">· ${esc(f.dosageWhy)}</span>` : "";
  return `<div class="vrlbl">How sweet (as on the label)${why}</div><div class="vrstyles" role="group" aria-label="How sweet">${chips}</div>`;
}
// The designation (DOC, DOCG, AOC ...) the form starts with: the place's own, else the one in the shop's title (wineinfo.js startDesignation).
// It is kept on the place, never on the wine (geo.js); the title keeps "DOCG" even though the wine name leaves it out.
function desigFor(lists, place, title) {
  const d = startDesignation(lists.areas, place, title);
  return { designation: d.designation, designationWhy: d.why ? d.why.replace("in the name", "in the title") : "", desigPicked: false };
}
// With no grape on the label, the grape the appellation's own rules name (aocgrapes.js), as a note: shown only, never saved from here.
function ruleNoteHtml(f) {
  if (String(f.grapes || "").trim() || !f.place) return "";
  const r = ruleLineFor({ country: f.place.country, appellation: f.place.appellation, style: f.style }, { checkedOnly: false });
  if (!r) return "";
  const what = r.rule === "only" ? `allow only ${r.grape}` : r.rule === "usual" ? `allow ${r.grape} (what these wines are made from in practice) beside another grape` : `name ${r.grape} as the main grape`;
  return `<div class="muted tiny">The ${esc(r.appellation)} rules ${esc(what)} for this type of wine${r.checked ? `: with no grape on the label, the card shows ${esc(r.grape)} from this rule.` : `: still to check against the official rules. The card already shows ${esc(r.grape)} from it.`}</div>`;
}
// The wine name for the form's current grapes and place (venue.js wineNameOf), from the title words after the producer.
const nameFor = (f, rest) => wineNameOf(rest, { grapes: String(f.grapes || "").split(/[,;]/).map((x) => x.trim()).filter(Boolean), place: f.place });
// The grapes typed in the form, as ids of grapes already in the list, or new names.
export function grapesFrom(text, grapes) {
  const seen = new Set(), out = [];
  String(text || "").split(/[,;]/).map((x) => x.trim()).filter(Boolean).forEach((n) => {
    const k = fold(n); if (seen.has(k)) return; seen.add(k);
    const g = (grapes || []).find((x) => fold(x.name) === k);
    out.push(g ? { id: g.id } : { name: n });
  });
  return out;
}

// The place line: what is chosen, and what adding the wine would create.
// "Looks like ... already in our list": a name that only looks like one in the list is never swapped; the editor picks (text.js lookalikes).
const kept = (f, field, typed) => (f.keep || []).includes(`${field}|${caseKey(typed)}`);
const lookHtml = (field, names) => `<div class="looklike" role="group" aria-label="Similar name already in our list">Looks like ${names.map((n) => `<b>${esc(n)}</b>`).join(" or ")} already in our list.
  ${names.map((n) => `<button class="link" data-vrlook="${esc(field)}" data-name="${esc(n)}">Use ${esc(n)}</button>`).join(" ")} <button class="link" data-vrkeep="${esc(field)}">Keep mine as new</button></div>`;
export function producerLookHtml(f, producers) {
  const typed = String(f.producer || "").trim();
  if (!typed || kept(f, "producer", typed)) return "";
  const like = lookalikes(typed, (producers || []).map((p) => p.name));
  return like.length ? lookHtml("producer", like) : "";
}
export function placeNowHtml(f, areas) {
  const text = placeText(f.place), plan = placePlan(areas, f.place);
  const looks = placeLookalikes(areas, f.place).filter((x) => !kept(f, x.field, x.typed)).map((x) => lookHtml(x.field, x.names)).join("");
  // A place looked up on the web links to its source (an editor checks it); otherwise the reason is in the tooltip, so the line stays short.
  const why = !f.placeSource ? (f.placeWhy && text ? ` <span class="muted" title="Suggested from ${esc(f.placeWhy)}">· suggested</span>` : "")
    : ` <a class="small" href="${esc(f.placeSource)}" target="_blank" rel="noopener noreferrer">· found online</a>`;
  const said = f.placeNote ? `<br><span class="muted small">${esc(f.placeNote)}</span>` : "";
  const note = plan.error ? `<span class="err">${esc(plan.error)}</span>` : plan.creates.length ? `<span class="vrnew">New: ${esc(plan.creates.join(", "))}</span>` : "";   // short, so the form stays on one screen
  return `${text ? `<b>${esc(text)}</b>` : `<span class="muted">No place chosen</span>`}${why}${said}${note ? `<br>${note}` : ""}${looks}`;
}
export function hitsHtml(f, options) {
  if (!f.q.trim()) return "";
  const hits = searchPlaces(options, f.q);
  return hits.length
    ? hits.map((o) => `<button class="vrhit" data-vr="place:${esc(o.id)}">${esc(o.label)}</button>`).join("")
    : `<div class="muted small">No place called that yet. <button class="link" data-vr="type">Type it as a new place</button></div>`;
}

const desigRow = (f, areas) => designationRowHtml(areas, canonPlace(areas, f.place), f.designation, f.designationWhy, "data-vrdesig");
// ---------------------------------------------------------------- links to the venue's website (owner, 2026-10-15)
// The server function venue-links (docs/VENUE_LINKS.md) reads the venue's website: "Find links" gives each wine its page there, or none when the
// wine is not on the website; "Check links" opens each saved link and removes the ones whose page is gone or shows a different wine.
export function linksHtml(R, list, embedded) {
  const s = linkSummary(list), L = R.links || {};
  const removed = (L.removed || []).map((x) => `<li>${esc(x.title)}: <span class="muted">${esc(x.reason)}</span></li>`).join("");
  return `${embedded ? "" : `<div class="muted small vrcount"><button class="link" data-vr="view:add">← Back to adding wines</button></div>`}
    <div class="vrcard">
      <div class="serif vrtitle">Links to ${esc(VENUE.name)}’ website</div>
      <div class="muted small">A wine's name on the card opens its page on the website. A wine that is not on the website gets no link.</div>
      <div class="vrlinks"><span><b>${s.linked}</b> linked</span><span><b>${s.notFound}</b> not on the website</span><span><b>${s.removed}</b> removed</span><span><b>${s.unchecked}</b> not looked for yet</span></div>
      ${L.msg ? `<div class="notice vrmsg" role="status">${esc(L.msg)}</div>` : ""}${L.err ? `<div class="err">${esc(L.err)}</div>` : ""}
      <div class="vrbtns vrlinkbtns">
        <button class="btn primary slim" data-vr="links:find"${L.busy ? " disabled" : ""}>Find links</button>
        <button class="btn outline slim" data-vr="links:check"${L.busy || !s.linked ? " disabled" : ""}>Check links</button>
      </div>
      ${removed ? `<div class="vrlbl">Removed in this check</div><ul class="small vrremoved">${removed}</ul>` : ""}
    </div>`;
}
// ---------------------------------------------------------------- publish the sure ones (owner, 2026-10-17)
const STYLE_LABEL = Object.fromEntries(STYLE_CHOICES.map((s) => [s.id, s.label]));
export function sureLine(f) {
  return [f.producer, f.wine || "(no name)", STYLE_LABEL[f.style] || f.style, f.style === "sparkling" ? dosageLabel(f.dosage) : "", placeText(f.place), f.vintage, f.grapes, f.designation].filter(Boolean).join(" · ");
}
export function sureHtml(S) {
  const back = `<div class="muted small vrcount"><button class="link" data-vr="view:add"${S && S.busy ? " disabled" : ""}>← Back to adding wines one at a time</button></div>`;
  if (!S || !S.rows) return `${back}<div class="vrcard"><p class="muted">Working out which wines are sure… ${S && S.seen ? `${S.seen} looked at` : ""}</p></div>`;
  const sure = S.rows.filter((x) => x.ok), left = S.rows.length - sure.length, picked = sure.filter((x) => S.picked.has(x.f.rowId)).length;
  const why = {};
  S.rows.filter((x) => !x.ok).forEach((x) => { why[x.why] = (why[x.why] || 0) + 1; });
  const whyList = Object.entries(why).sort((a, b) => b[1] - a[1]).map(([w, n]) => `<li>${esc(w)}: ${n}</li>`).join("");
  const dis = S.busy ? " disabled" : "";
  const rows = sure.map((x) => `<label class="vrsure"><input type="checkbox" data-vrsure="${esc(x.f.rowId)}"${S.picked.has(x.f.rowId) ? " checked" : ""}${dis}><span><b>${esc(x.f.title)}</b><br><span class="muted small">${esc(sureLine(x.f))}</span></span></label>`).join("");
  const failed = (S.failed || []).map((x) => `<li>${esc(x.title)}: <span class="muted">${esc(x.why)}</span></li>`).join("");
  return `${back}
    <div class="vrcard">
      <div class="serif vrtitle">Publish the sure ones</div>
      <div class="muted small">Every field of these wines comes from the shop's title, a place rule or a cited source, and the fields agree with each other. Look through them and untick any you want to check one at a time. Publishing puts them in the deck. The others stay in the review for editors.</div>
      <div class="vrlinks"><span><b>${sure.length}</b> sure</span><span><b>${left}</b> left for editors</span></div>
      <div id="vrSureMsg">${sureMsgHtml(S)}</div>
      <div class="vrbtns">
        ${S.busy ? `<button class="btn outline slim" data-vr="sure:stop"${S.stop ? " disabled" : ""}>${S.stop ? "Stopping…" : "Stop"}</button>`
          : `<button class="btn primary slim" data-vr="sure:go"${picked ? "" : " disabled"}>Publish ${picked} wine${picked === 1 ? "" : "s"}</button>
             <button class="btn outline slim" data-vr="sure:all">${picked === sure.length ? "Untick all" : "Tick all"}</button>`}
      </div>
      ${failed ? `<div class="vrlbl">Not added</div><ul class="small vrremoved">${failed}</ul>` : ""}
      <div class="vrsurelist">${rows || `<p class="muted">None of the wines waiting is sure enough: they need an editor.</p>`}</div>
      ${whyList ? `<details class="small"><summary>Why the others are left for editors</summary><ul>${whyList}</ul></details>` : ""}
    </div>`;
}
function sureMsgHtml(S) {
  const bar = S.busy && S.total ? `<div class="muted small">${S.done} of ${S.total} published so far${S.failed && S.failed.length ? `, ${S.failed.length} not added` : ""}. Keep this page open.</div>` : "";
  return `${S.msg ? `<div class="notice vrmsg" role="status">${esc(S.msg)}</div>` : ""}${S.err ? `<div class="err">${esc(S.err)}</div>` : ""}${bar}`;
}
export function reviewHtml(R, queue, opts) {
  if (R.error) return `<div class="err">${esc(R.error)}</div><button class="btn outline slim" data-vr="retry">Try again</button>`;
  if (!R.lists) return `<p class="muted">Loading…</p>`;
  const msg = R.msg ? `<div class="notice vrmsg">${esc(R.msg)}</div>` : "";
  const count = `<div class="muted small vrcount"><b>${queue.length}</b> wines to add · every field is a suggestion</div>
    <div class="vrbtns vrlinkbtns"><button class="btn outline slim" data-vr="view:links">Website links: find and check</button>${queue.length ? `<button class="btn outline slim" data-vr="view:sure">Publish the sure ones</button>` : ""}</div>`;
  if (!queue.length) return `${count}${msg}<p class="muted">Nothing is waiting. New wines appear here when the owner uploads a new list.</p>`;
  const f = R.form;
  if (!f) return `${count}${msg}`;
  const dis = R.busy ? " disabled" : "";
  const words = f.title.split(/\s+/).filter(Boolean);
  const wordBtns = words.map((w, i) => `<button class="chip vrword${i < f.split ? " on" : ""}" data-vr="split:${i + 1}" aria-pressed="${i < f.split}">${esc(w)}</button>`).join("");
  const styles = STYLE_CHOICES.map((s) => `<button class="chip${f.style === s.id ? " on" : ""}" data-vr="style:${s.id}" aria-pressed="${f.style === s.id}">${esc(s.label)}</button>`).join("");
  const typed = f.typing ? `<div class="vrrow3">${["appellation", "region", "country"].map((k) => `<input class="field" data-vr-p="${k}" value="${esc(f.place[k] || "")}" placeholder="${k === "appellation" ? "Appellation" : k === "region" ? "Region" : "Country"}" aria-label="${k}" autocomplete="off">`).join("")}</div>` : "";
  const facts = [`Vintage on the list: ${f.vintage}`, f.shopType ? `shop category: ${f.shopType}` : "", f.styleWhy ? `type from ${f.styleWhy}` : ""].filter(Boolean).join(" · ");
  return `${count}${msg}
    <div class="vrcard">
      <div class="vrhead"><span class="serif vrtitle">${esc(f.title)}</span>${opts.owner ? `<button class="link" data-vr="remove"${dis} title="Not a wine we want">Remove from list</button>` : ""}</div>
      <div class="muted small">${esc(facts)}</div>
      ${f.notWine ? `<div class="vrwarn">This looks like a spirit or something that is not wine.${opts.owner ? " If so, remove it from the list." : " Skip it; the owner can remove it."}</div>` : ""}
      <div class="vrlbl">Tap the last word of the producer’s name${f.knownProducer ? ` <span class="muted">(a producer we already have)</span>` : ""}</div>
      <div class="vrwords">${wordBtns}</div>
      <div class="vrrow2">
        <label class="vrf">Producer<input class="field" data-vr-f="producer" value="${esc(f.producer)}" autocomplete="off"></label>
        <label class="vrf">Wine name<input class="field" data-vr-f="wine" value="${esc(f.wine)}" autocomplete="off" placeholder="none: grape and place say it"></label>
      </div>
      <div id="vrProdLook">${producerLookHtml(f, R.lists.producers)}</div>
      <div class="vrstyles" role="group" aria-label="Type of wine">${styles}</div>
      ${dosageHtml(f)}
      <div class="vrlbl">Place <button class="link" data-vr="type">${f.typing ? "Search instead" : "Type a new place"}</button></div>
      <div class="vrplace" id="vrPlaceNow">${placeNowHtml(f, R.lists.areas)}</div>
      ${typed}
      <input class="field" id="vrPlaceQ" data-vr-q value="${esc(f.q)}" placeholder="Search places: Barolo, Napa, St-Julien…" autocomplete="off" aria-label="Search places">
      <div class="vrhits" id="vrHits">${hitsHtml(f, R.places)}</div>
      <div class="vrdesig" id="vrDesig"><span class="vrlbl">Designation</span>${desigRow(f, R.lists.areas)}</div>
      <div class="vrrow2 vrvg">
        <label class="vrf">Vintage<input class="field" data-vr-f="vintage" value="${esc(f.vintage)}" autocomplete="off" placeholder="year or NV"></label>
        <label class="vrf">Grapes on the label<input class="field" data-vr-f="grapes" value="${esc(f.grapes)}" autocomplete="off" placeholder="comma between"></label>${ruleNoteHtml(f)}
      </div>
      <div class="err" id="vrErr">${esc(R.err || "")}</div>
      <div class="vrbtns">
        <button class="btn primary slim" data-vr="add:pub"${dis}>Publish now</button>
        <button class="btn outline slim" data-vr="add:rev"${dis}>Add for review</button>
        <button class="btn outline slim" data-vr="skip"${dis}>Skip</button>
      </div>
    </div>`;
}

// ctx: { sb(), userId(), list() (the venue's rows), listError(), owner() (true for the owner), onChanged() (reload the catalog and the list) }
export function createVenueReview(ctx) {
  const R = { lists: null, prep: null, places: [], loading: false, error: "", form: null, busy: false, msg: "", err: "", skipped: new Set() };
  let root = null;
  // Sorted by the prepared country, region and producer, so one producer's wines come one after another.
  const sortKey = (r) => { const p = prepOf(R.prep, r.wine_name); return p ? [p.place.country, p.place.region, p.producer] : ["", "", ""]; };
  const queue = () => reviewQueue(ctx.list() || [], R.skipped, R.prep ? sortKey : null);
  function pickNext() {
    const q = queue();
    if (R.want && R.lists) {   // the owner tapped Review on one wine of the list: open that one
      const row = q.find((r) => r.id === R.want); R.want = null;
      if (row) { R.form = formFor(row, R.lists, R.prep); R.err = ""; return; }
    }
    const cur = R.form && q.find((r) => r.id === R.form.rowId && !R.skipped.has(r.id));
    if (cur) return;
    R.form = q.length && R.lists ? formFor(q[0], R.lists, R.prep) : null;
    R.err = "";
  }
  function draw() {
    if (!root) return;
    if (!ctx.list()) { root.innerHTML = `<p class="muted">${esc(ctx.listError() || "The venue's list has not loaded yet.")}</p>`; return; }
    if (R.linksOnly || R.view === "links") { root.innerHTML = `<div class="vrev">${linksHtml(R, ctx.list(), R.linksOnly)}</div>`; return; }
    if (R.view === "sure" && R.lists) { if (!R.sure) workOutSure(); root.innerHTML = `<div class="vrev">${sureHtml(R.sure)}</div>`; return; }
    pickNext();
    root.innerHTML = `<div class="vrev">${reviewHtml(R, queue(), { owner: ctx.owner() })}</div>`;
  }
  // A new place brings its own designation, unless the editor picked one.
  const refreshDesig = (f) => { if (!f.desigPicked) Object.assign(f, desigFor(R.lists, canonPlace(R.lists.areas, f.place), f.title)); };
  const drawPlace = () => {
    const el = document.getElementById("vrPlaceNow"); if (el && R.form) el.innerHTML = placeNowHtml(R.form, R.lists.areas);
    const d = document.getElementById("vrDesig"); if (d && R.form) { refreshDesig(R.form); d.innerHTML = `<span class="vrlbl">Designation</span>${desigRow(R.form, R.lists.areas)}`; }
  };
  const drawHits = () => { const el = document.getElementById("vrHits"); if (el && R.form) el.innerHTML = hitsHtml(R.form, R.places); };
  async function loadLists() {
    const [lists, dosages] = await Promise.all([db.loadEditorLists(ctx.sb()), db.loadDosages(ctx.sb()).catch(() => null)]);
    R.lists = { ...lists, dosageReady: !!dosages };   // the sweetness term can be saved once docs/sparkling_dosage.sql is run
    R.places = placeOptions(R.lists.areas);
  }
  async function load() {
    R.loading = true; R.error = "";
    // The prepared suggestions are a large file, read only here; without them the app's own suggestions are used.
    const prep = import("./vwmprep.js?v=4").then((m) => prepIndex(m.PREP, m.PREP_DOSAGE)).catch(() => null);
    try { await loadLists(); R.prep = await prep; }
    catch (e) { R.error = "Could not load the producer, grape and place lists: " + (e.message || e); }
    R.loading = false; draw();
  }
  async function add(publish) {
    const f = R.form; if (!f || R.busy) return;
    const chk = checkReview(f), plan = placePlan(R.lists.areas, f.place);
    const why = !chk.ok ? chk.why : plan.error;
    if (why) { R.err = why; const e = document.getElementById("vrErr"); if (e) e.textContent = why; return; }
    R.busy = true; R.err = ""; draw();
    try {
      const place = canonPlace(R.lists.areas, f.place), dPlan = designationPlan(R.lists.areas, place, f.designation);
      const areaId = await savePlace(ctx.sb(), R.lists.areas, place, { classification: dPlan.set || "" });   // a new place is created with its designation
      let desigNote = "";
      if (dPlan.set && !plan.notes.length && areaId) { try { await db.savePlaceDesignation(ctx.sb(), areaId, dPlan.set); } catch (e) { desigNote = " " + (e.message || e); } }
      if (plan.notes.length || dPlan.set) await loadLists();   // new places, and new designations, show at once
      await db.addVenueCatalogWine(ctx.sb(), ctx.userId(), {
        producerName: f.producer, wineName: f.wine, style: f.style, areaId: areaId || null, vintage: f.vintage === "NV" ? "NV" : f.vintage,
        grapes: grapesFrom(f.grapes, R.lists.grapes), dosage: R.lists.dosageReady ? f.dosage || "" : undefined, dosageBasis: f.dosageBasis || "editor", dosageSource: f.dosageSource || null, publish, rowId: f.rowId, listedAs: f.title, sourceName: `${VENUE.name} list`,
      });
      R.msg = `Added: ${f.producer}${f.wine ? " " + f.wine : ""} ${f.vintage}${publish ? ", published" : ", waiting for review in Catalog"}.${desigNote}`;
      R.form = null;
      if (!R.lists.producers.some((p) => fold(p.name) === fold(f.producer))) R.lists.producers.push({ id: null, name: f.producer });   // so the next titles from this producer are split for you
      await ctx.onChanged();
    } catch (e) { R.err = "Not added: " + (e.message || e); }
    R.busy = false; draw();
  }
  document.addEventListener("click", async (ev) => {
    const lk = ev.target.closest("[data-vrlook], [data-vrkeep]");
    if (lk && root && R.form && !R.busy) {
      const f = R.form, field = lk.dataset.vrlook || lk.dataset.vrkeep;
      if (lk.dataset.vrkeep) f.keep = [...(f.keep || []), `${field}|${caseKey(field === "producer" ? f.producer : f.place[field])}`];
      else if (field === "producer") {
        const typed = f.producer, prod = R.lists.producers.find((p) => p.name === lk.dataset.name);
        f.producer = lk.dataset.name;
        if (prod && prod.id && caseKey(typed) !== caseKey(prod.name)) db.addProducerAlias(ctx.sb(), typed.trim(), prod.id).catch(() => {});   // remembered, so it is offered next time
      }
      else {
        const a = R.lists.areas.find((x) => x.level === field && x.name === lk.dataset.name);
        f.place = a ? broadPlace(placeFromArea(R.lists.areas, a.id)) : { ...f.place, [field]: lk.dataset.name };
        refreshDesig(f); f.wine = nameFor(f, f.wine);
      }
      draw(); return;
    }
    const d = ev.target.closest("[data-vrdesig]");
    if (d && root && R.form && !R.busy) { R.form.designation = d.dataset.vrdesig; R.form.designationWhy = ""; R.form.desigPicked = true; draw(); return; }
    const t = ev.target.closest("[data-vr]");
    if (!t || !root || t.disabled) return;
    const i = t.dataset.vr.indexOf(":"), action = i < 0 ? t.dataset.vr : t.dataset.vr.slice(0, i), a = i < 0 ? "" : t.dataset.vr.slice(i + 1);
    const f = R.form;
    if (action === "retry") load();
    else if (action === "view") { if (a === "sure" && !(R.sure && R.sure.busy)) R.sure = null; R.view = a; draw(); }   // worked out afresh each time it is opened
    else if (action === "sure") await sureAction(a);
    else if (action === "links") await runLinks(a);
    else if (action === "split" && f) { f.split = Number(a) === f.split ? 0 : Number(a); const sp = splitTitle(f.title, f.split); f.producer = sp.producer; f.wine = nameFor(f, sp.wine); draw(); }
    else if (action === "style" && f) { f.style = a; f.styleWhy = ""; if (a === "sparkling" && !f.dosage) Object.assign(f, dosageFor(a, f.title, prepOf(R.prep, f.title), R.lists)); draw(); }
    else if (action === "dosage" && f) { f.dosage = a; f.dosageBasis = "editor"; f.dosageSource = ""; f.dosageWhy = ""; draw(); }
    else if (action === "place" && f) { f.place = broadPlace(placeFromArea(R.lists.areas, a)); refreshDesig(f); f.wine = nameFor(f, f.wine); f.placeWhy = ""; f.placeSource = ""; f.placeNote = ""; f.q = ""; f.typing = false; draw(); }   // the chosen place's words leave the name
    else if (action === "type" && f) {
      f.typing = !f.typing;
      if (f.typing && f.q.trim() && !placeText(f.place)) f.place = { country: "", region: "", appellation: f.q.trim() };   // start from what was searched
      f.q = ""; draw();
    }
    else if (action === "add") await add(a === "pub");
    else if (action === "skip" && f) { R.skipped.add(f.rowId); R.form = null; R.msg = ""; draw(); }
    else if (action === "remove" && f && ctx.owner()) {
      R.busy = true; draw();
      try { await db.removeVenueRow(ctx.sb(), f.rowId); R.msg = `Removed from the list: ${f.title}.`; R.form = null; await ctx.onChanged(); }
      catch (e) { R.err = "Not removed: " + (e.message || e); }
      R.busy = false; draw();
    }
  });
  // A tick only changes the count on the button, so the long list keeps its place.
  document.addEventListener("change", (ev) => {
    const t = ev.target;
    if (!t || !t.dataset || t.dataset.vrsure === undefined || !R.sure || !root || !root.contains(t)) return;
    if (t.checked) R.sure.picked.add(t.dataset.vrsure); else R.sure.picked.delete(t.dataset.vrsure);
    const n = R.sure.picked.size, b = root.querySelector('[data-vr="sure:go"]');
    if (b) { b.textContent = `Publish ${n} wine${n === 1 ? "" : "s"}`; b.disabled = !n; }
    const all = root.querySelector('[data-vr="sure:all"]');
    if (all) all.textContent = n === R.sure.rows.filter((x) => x.ok).length ? "Untick all" : "Tick all";
  });
  // Works out which waiting rows are sure (venue.js sureOf), a hundred at a time so the screen stays responsive.
  async function workOutSure() {
    const last = R.sureLast || {};   // what the last run said stays on screen
    const S = (R.sure = { rows: null, seen: 0, picked: new Set(), busy: false, msg: last.msg || "", err: last.err || "", failed: last.failed || [] });
    R.sureLast = null;
    const forms = [];
    for (const row of queue()) {
      forms.push(formFor(row, R.lists, R.prep));
      if (forms.length % 100 === 0) { S.seen = forms.length; await new Promise((r) => setTimeout(r)); if (R.sure !== S) return; if (R.view === "sure") draw(); }
    }
    const sctx = sureContext(R.lists, forms), rows = [];
    for (const [i, f] of forms.entries()) {
      rows.push({ f, ...sureOf(f, sctx) });
      if (i % 200 === 199) await new Promise((r) => setTimeout(r));
      if (R.sure !== S) return;
    }
    S.rows = rows; rows.filter((x) => x.ok).forEach((x) => S.picked.add(x.f.rowId));
    if (R.view === "sure") draw();
  }
  const sureProgress = () => { const el = document.getElementById("vrSureMsg"); if (el && R.sure) el.innerHTML = sureMsgHtml(R.sure); };
  async function sureAction(a) {
    const S = R.sure; if (!S || !S.rows) return;
    if (a === "stop") { S.stop = true; draw(); return; }
    if (a === "all" && !S.busy) { const sure = S.rows.filter((x) => x.ok); if (S.picked.size === sure.length) S.picked.clear(); else sure.forEach((x) => S.picked.add(x.f.rowId)); draw(); return; }
    if (a === "go" && !S.busy) await publishSure(S);
  }
  // Publishes the ticked wines the same way as "Publish now", without the form. New places are made first, one at a time, so two wines never make the
  // same place twice; then the wines go a few producers at a time (one producer's wines one after another, so a producer is never made twice).
  // Each wine is linked to its list row as it is added; a wine that fails stays in the review, and five failures stop the run.
  async function publishSure(S) {
    const forms = S.rows.filter((x) => x.ok && S.picked.has(x.f.rowId)).map((x) => x.f);
    if (!forms.length) return;
    Object.assign(S, { busy: true, stop: false, err: "", msg: "Adding the new places…", failed: [], done: 0, total: forms.length });
    draw();
    const sb = ctx.sb(), areas = R.lists.areas, notes = new Set();
    try {
      for (const f of forms) {
        if (S.stop) break;
        const place = canonPlace(areas, f.place), plan = planPlace(areas, place), d = designationPlan(areas, place, f.designation);
        if (plan.error) continue;   // left for the wine's own step, which reports it
        if (plan.creates.length) {
          const id = await savePlace(sb, areas, place, { classification: d.set || "" });
          const c = plan.creates[plan.creates.length - 1];   // sureOf allows only a new appellation under a place we have
          areas.push({ id, name: c.name, level: c.level, parent_id: c.parent, classification: d.set || null });
        } else if (d.set && plan.areaId) {
          try { await db.savePlaceDesignation(sb, plan.areaId, d.set); const a = areas.find((x) => x.id === plan.areaId); if (a) a.classification = d.set; }
          catch (e) { notes.add(e.message || String(e)); }
        }
      }
      R.places = placeOptions(areas);
      S.msg = "Publishing…"; draw();
      const groups = new Map();
      forms.forEach((f) => { const k = fold(f.producer); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(f); });
      const todo = [...groups.values()];
      const one = async (f) => {
        const place = canonPlace(areas, f.place), plan = planPlace(areas, place);
        if (plan.error || plan.creates.length || !plan.areaId) throw new Error(plan.error || "its place is not in the list yet");
        await db.addVenueCatalogWine(sb, ctx.userId(), {
          producerName: f.producer, wineName: f.wine, style: f.style, areaId: plan.areaId, vintage: f.vintage === "NV" ? "NV" : f.vintage,
          grapes: grapesFrom(f.grapes, R.lists.grapes), dosage: R.lists.dosageReady ? f.dosage || "" : undefined, dosageBasis: f.dosageBasis || "editor", dosageSource: f.dosageSource || null, publish: true, rowId: f.rowId, listedAs: f.title, sourceName: `${VENUE.name} list`,
        });
      };
      const worker = async () => {
        while (todo.length && !S.stop) {
          for (const f of todo.shift()) {
            if (S.stop) return;
            try { await one(f); S.done++; S.picked.delete(f.rowId); }
            catch (e) {
              S.failed.push({ title: f.title, why: e.message || String(e) });
              if (S.failed.length >= 5) { S.stop = true; S.err = "Stopped: five wines could not be added (see below). Nothing else was changed; try again later."; }
            }
            sureProgress();
          }
        }
      };
      await Promise.all([1, 2, 3, 4].map(worker));
      S.msg = `Published ${S.done} of ${S.total} wines${S.stop && !S.err ? " (stopped)" : ""}. They are in the deck now.${notes.size ? " " + [...notes][0] : ""}`;
    } catch (e) { S.err = `Stopped: ${e.message || e}. ${S.done} wines were published before that.`; }
    S.busy = false; S.stop = false;
    try { await loadLists(); await ctx.onChanged(); } catch (_) { /* the list is reloaded next time */ }
    R.sure = null; R.sureLast = { msg: S.msg, err: S.err, failed: S.failed };
    draw();
  }
  // Typing changes the form without redrawing, so the box keeps its focus; only the place line and the search results are redrawn.
  document.addEventListener("input", (ev) => {
    const t = ev.target;
    if (!t || !t.dataset || !R.form || !root || !root.contains(t)) return;
    if (t.dataset.vrQ !== undefined) { R.form.q = t.value; drawHits(); return; }
    if (t.dataset.vrP !== undefined) { R.form.place = { ...R.form.place, [t.dataset.vrP]: t.value }; R.form.placeWhy = ""; R.form.placeSource = ""; R.form.placeNote = ""; drawPlace(); return; }
    if (t.dataset.vrF === undefined) return;
    R.form[t.dataset.vrF] = t.value;
    if (t.dataset.vrF === "producer") { const el = document.getElementById("vrProdLook"); if (el) el.innerHTML = producerLookHtml(R.form, R.lists.producers); }
    if (t.dataset.vrF === "vintage") R.form.vintage = t.value.trim().toUpperCase() === "NV" ? "NV" : t.value.trim();
  });
  // Find or check links in batches, saving each answer as it comes (editor writes are online only). Nothing is linked unless the website shows the wine.
  // ids: only these list rows (the owner's ticked rows), else the whole list.
  async function runLinks(kind, ids) {
    const L = (R.links = { busy: true, msg: kind === "find" ? "Reading the website…" : "Opening the links…", err: "", removed: [] });
    draw();
    const pick = ids && ids.length ? new Set(ids) : null;
    const list = (ctx.list() || []).filter((r) => !pick || pick.has(r.id));
    let stopped = "";
    let saved = 0, gone = 0, kept = 0, failed = 0, none = 0;
    const save = async (id, fields) => { try { await db.saveVenueLink(ctx.sb(), id, fields); saved++; } catch (e) { failed++; L.err = e.message || String(e); } };
    try {
      if (kind === "find") {
        const rows = list.filter((r) => !r.product_url).map((r) => ({ id: r.id, title: rowTitle(r), vintage: r.vintage || "" }));
        if (!rows.length) { L.msg = "Every wine here already has a link: use Check links to see that they still work."; L.busy = false; draw(); return; }
        const res = await db.venueLinks(ctx.sb(), "find", rows);
        for (const x of res.results || []) { if (x.url) await save(x.id, { product_url: x.url, link_status: "found" }); else { none++; await save(x.id, { product_url: null, link_status: "not found" }); } }
        L.msg = `Looked for ${rows.length} wines on the website${res.count ? ` (${res.count} products there)` : ""}: ${rows.length - none} linked, ${none} not on the website.`;
      } else {
        const rows = list.filter((r) => r.product_url).map((r) => ({ id: r.id, title: rowTitle(r), vintage: r.vintage || "", url: r.product_url }));
        if (!rows.length) { L.msg = "None of these wines has a link to check yet: use Find links first."; L.busy = false; draw(); return; }
        for (let i = 0; i < rows.length; i += 50) {
          L.msg = `Checking links ${i + 1}–${Math.min(i + 50, rows.length)} of ${rows.length}…`; draw();
          const res = await db.venueLinks(ctx.sb(), "check", rows.slice(i, i + 50));
          // Many pages "showing" the same title means the website was misread (one page part read for every wine), not that all those wines
          // changed: those links are kept and the check stops, so a reading problem never empties the list.
          const shown = {};
          for (const x of res.results || []) if (x.status === "different") shown[x.reason] = (shown[x.reason] || 0) + 1;
          const misread = Object.keys(shown).find((t) => shown[t] >= 3);
          if (misread) { stopped = `Stopped: ${shown[misread]} pages all seemed to show ${misread.replace(/^the page shows /, "")}. That looks like a problem reading the website, so no link was removed. Re-deploy the venue-links function (docs/venue_links_function.js) and check again.`; break; }
          for (const x of res.results || []) {
            const row = rows.find((r) => r.id === x.id);
            if (x.status === "ok") { kept++; await save(x.id, { link_status: "ok" }); }
            else if (x.status === "gone" || x.status === "different") { gone++; L.removed.push({ title: row ? row.title : x.id, reason: x.reason || x.status }); await save(x.id, { product_url: null, link_status: "removed" }); }
          }
        }
        if (stopped) { L.err = stopped; L.msg = kept || gone ? `Before stopping: ${kept} fine, ${gone} removed.` : ""; }
        else L.msg = `Checked ${rows.length} links: ${kept} fine, ${gone} removed (page gone or a different wine)${rows.length - kept - gone ? `, ${rows.length - kept - gone} could not be opened and were left as they are` : ""}.`;
      }
      if (failed) L.msg += ` ${failed} could not be saved.`;
      await ctx.onChanged();
    } catch (e) { L.err = e.message || String(e); L.msg = ""; }
    L.busy = false; draw();
  }
  return {
    state: R,
    mount(el) { root = el; R.linksOnly = false; if (!R.lists && !R.loading) load(); draw(); },
    // Only the website links part, on the Owner page's list tab (it needs no editor lists).
    mountLinks(el) { root = el; R.linksOnly = true; draw(); },
    // Opens one row of the list for review the next time the section is shown (Owner page, Review).
    openRow(id) { R.view = "add"; R.skipped.delete(id); R.want = id; },
    // Find or check links for some rows only (the owner's ticked rows); the progress shows where the links box is mounted.
    runLinks: (kind, ids) => runLinks(kind, ids),
    leave() { root = null; },
    redraw: draw,
  };
}

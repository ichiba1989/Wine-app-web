// Editor tab, "Vintage Wine Merchants": the shop's wines that are not in our catalog yet, reviewed one at a time and added to the catalog.
// The venue's file only gives a title per wine ("2019 Ridge Vineyards Monte Bello Santa Cruz Mountains"). For each row the form is filled with SUGGESTIONS:
// first the ones prepared once from the shop's titles (vwmprep.js, loaded only here), else the app's own (venue.js suggestRow). Either way they come only
// from the title's words and lists the app already holds. The editor checks and changes every field, then adds the wine: published at once, or waiting
// for review (Catalog section). Nothing is created without that tap, and nothing is looked up outside the app. The new wine is linked to the list row,
// so it joins the venue's deck as soon as it is published. The queue keeps one country, region and producer together.
// The place is chosen by searching the place list; a place that is not in it yet is typed in and created when the wine is added (geo.js savePlace).
// Everything fits on one phone screen. Editor writes are online only. The rules are in venue.js (pure); this file draws the screen and handles the taps.
import { esc, WINE_STYLES } from "./logic.js?v=14";
import { VENUE, suggestRow, splitTitle, reviewQueue, checkReview, prepIndex, prepOf, canonPlace, placeText, placePlan, searchPlaces, splitOf, wineNameOf } from "./venue.js?v=11";
import { placeOptions, designationRowHtml, startDesignation } from "./wineinfo.js?v=26";
import { placeFromArea, savePlace, designationPlan, broadPlace } from "./geo.js?v=5";
import * as db from "./data.js?v=39";

const fold = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const STYLE_CHOICES = WINE_STYLES.map((s) => ({ id: s.id, label: s.label }));

// The form for one row, filled with the prepared suggestions when there are some, else the app's own.
export function formFor(row, lists, prep = null) {
  const p = prepOf(prep, row.wine_name);
  const base = { rowId: row.id, title: row.wine_name, shopType: row.shop_type || "", vintage: row.vintage || "NV", prepared: !!p, typing: false, q: "" };
  if (p) {
    const split = splitOf(row.wine_name, p.producer);
    const sp = split ? splitTitle(row.wine_name, split) : { producer: p.producer, wine: p.wine };
    const place = canonPlace(lists.areas, broadPlace(p.place));   // Germany and Austria: only the broad wine region (geo.js)
    return {
      ...base, ...desigFor(lists, place, row.wine_name), split, producer: sp.producer, wine: wineNameOf(p.wine || sp.wine, { grapes: p.grapes, place: { ...p.place, ...place } }), style: p.style, styleWhy: p.styleWhy, place, placeWhy: p.placeWhy,
      grapes: p.grapes.join(", "), notWine: p.notWine, knownProducer: lists.producers.some((x) => fold(x.name) === fold(sp.producer)),
    };
  }
  const s = suggestRow(row.wine_name, { producers: lists.producers, areas: lists.areas, shopType: row.shop_type || "" });
  const sp = splitTitle(row.wine_name, s.split);
  const place = broadPlace(s.areaId ? placeFromArea(lists.areas, s.areaId) : { country: "", region: "", appellation: "" });
  return {
    ...base, ...desigFor(lists, place, row.wine_name), split: s.split, producer: sp.producer, wine: wineNameOf(sp.wine, { grapes: s.grapes, place }), style: s.style, styleWhy: s.styleWhy, place,
    placeWhy: s.areaWhy, grapes: s.grapes.join(", "), notWine: false, knownProducer: !!s.producerId,
  };
}
// The designation (DOC, DOCG, AOC ...) the form starts with: the place's own, else the one in the shop's title (wineinfo.js startDesignation).
// It is kept on the place, never on the wine (geo.js); the title keeps "DOCG" even though the wine name leaves it out.
function desigFor(lists, place, title) {
  const d = startDesignation(lists.areas, place, title);
  return { designation: d.designation, designationWhy: d.why ? d.why.replace("in the name", "in the title") : "", desigPicked: false };
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
export function placeNowHtml(f, areas) {
  const text = placeText(f.place), plan = placePlan(areas, f.place);
  const why = f.placeWhy && text ? ` <span class="muted" title="Suggested from ${esc(f.placeWhy)}">· suggested</span>` : "";   // the reason is in the tooltip, so the line stays short
  const note = plan.error ? `<span class="err">${esc(plan.error)}</span>` : plan.creates.length ? `<span class="vrnew">New: ${esc(plan.creates.join(", "))}</span>` : "";   // short, so the form stays on one screen
  return `${text ? `<b>${esc(text)}</b>` : `<span class="muted">No place chosen</span>`}${why}${note ? `<br>${note}` : ""}`;
}
export function hitsHtml(f, options) {
  if (!f.q.trim()) return "";
  const hits = searchPlaces(options, f.q);
  return hits.length
    ? hits.map((o) => `<button class="vrhit" data-vr="place:${esc(o.id)}">${esc(o.label)}</button>`).join("")
    : `<div class="muted small">No place called that yet. <button class="link" data-vr="type">Type it as a new place</button></div>`;
}

const desigRow = (f, areas) => designationRowHtml(areas, canonPlace(areas, f.place), f.designation, f.designationWhy, "data-vrdesig");
export function reviewHtml(R, queue, opts) {
  if (R.error) return `<div class="err">${esc(R.error)}</div><button class="btn outline slim" data-vr="retry">Try again</button>`;
  if (!R.lists) return `<p class="muted">Loading…</p>`;
  const msg = R.msg ? `<div class="notice vrmsg">${esc(R.msg)}</div>` : "";
  const count = `<div class="muted small vrcount"><b>${queue.length}</b> wines to add · every field is a suggestion</div>`;
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
      <div class="vrstyles" role="group" aria-label="Type of wine">${styles}</div>
      <div class="vrlbl">Place <button class="link" data-vr="type">${f.typing ? "Search instead" : "Type a new place"}</button></div>
      <div class="vrplace" id="vrPlaceNow">${placeNowHtml(f, R.lists.areas)}</div>
      ${typed}
      <input class="field" id="vrPlaceQ" data-vr-q value="${esc(f.q)}" placeholder="Search places: Barolo, Napa, St-Julien…" autocomplete="off" aria-label="Search places">
      <div class="vrhits" id="vrHits">${hitsHtml(f, R.places)}</div>
      <div class="vrdesig" id="vrDesig"><span class="vrlbl">Designation</span>${desigRow(f, R.lists.areas)}</div>
      <div class="vrrow2 vrvg">
        <label class="vrf">Vintage<input class="field" data-vr-f="vintage" value="${esc(f.vintage)}" autocomplete="off" placeholder="year or NV"></label>
        <label class="vrf">Grapes on the label<input class="field" data-vr-f="grapes" value="${esc(f.grapes)}" autocomplete="off" placeholder="comma between"></label>
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
    const cur = R.form && q.find((r) => r.id === R.form.rowId && !R.skipped.has(r.id));
    if (cur) return;
    R.form = q.length && R.lists ? formFor(q[0], R.lists, R.prep) : null;
    R.err = "";
  }
  function draw() {
    if (!root) return;
    if (!ctx.list()) { root.innerHTML = `<p class="muted">${esc(ctx.listError() || "The venue's list has not loaded yet.")}</p>`; return; }
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
  async function loadLists() { R.lists = await db.loadEditorLists(ctx.sb()); R.places = placeOptions(R.lists.areas); }
  async function load() {
    R.loading = true; R.error = "";
    // The prepared suggestions are a large file, read only here; without them the app's own suggestions are used.
    const prep = import("./vwmprep.js?v=1").then((m) => prepIndex(m.PREP)).catch(() => null);
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
        grapes: grapesFrom(f.grapes, R.lists.grapes), publish, rowId: f.rowId, listedAs: f.title, sourceName: `${VENUE.name} list`,
      });
      R.msg = `Added: ${f.producer}${f.wine ? " " + f.wine : ""} ${f.vintage}${publish ? ", published" : ", waiting for review in Catalog"}.${desigNote}`;
      R.form = null;
      if (!R.lists.producers.some((p) => fold(p.name) === fold(f.producer))) R.lists.producers.push({ id: null, name: f.producer });   // so the next titles from this producer are split for you
      await ctx.onChanged();
    } catch (e) { R.err = "Not added: " + (e.message || e); }
    R.busy = false; draw();
  }
  document.addEventListener("click", async (ev) => {
    const d = ev.target.closest("[data-vrdesig]");
    if (d && root && R.form && !R.busy) { R.form.designation = d.dataset.vrdesig; R.form.designationWhy = ""; R.form.desigPicked = true; draw(); return; }
    const t = ev.target.closest("[data-vr]");
    if (!t || !root || t.disabled) return;
    const i = t.dataset.vr.indexOf(":"), action = i < 0 ? t.dataset.vr : t.dataset.vr.slice(0, i), a = i < 0 ? "" : t.dataset.vr.slice(i + 1);
    const f = R.form;
    if (action === "retry") load();
    else if (action === "split" && f) { f.split = Number(a) === f.split ? 0 : Number(a); const sp = splitTitle(f.title, f.split); f.producer = sp.producer; f.wine = nameFor(f, sp.wine); draw(); }
    else if (action === "style" && f) { f.style = a; f.styleWhy = ""; draw(); }
    else if (action === "place" && f) { f.place = broadPlace(placeFromArea(R.lists.areas, a)); refreshDesig(f); f.wine = nameFor(f, f.wine); f.placeWhy = ""; f.q = ""; f.typing = false; draw(); }   // the chosen place's words leave the name
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
  // Typing changes the form without redrawing, so the box keeps its focus; only the place line and the search results are redrawn.
  document.addEventListener("input", (ev) => {
    const t = ev.target;
    if (!t || !t.dataset || !R.form || !root || !root.contains(t)) return;
    if (t.dataset.vrQ !== undefined) { R.form.q = t.value; drawHits(); return; }
    if (t.dataset.vrP !== undefined) { R.form.place = { ...R.form.place, [t.dataset.vrP]: t.value }; R.form.placeWhy = ""; drawPlace(); return; }
    if (t.dataset.vrF === undefined) return;
    R.form[t.dataset.vrF] = t.value;
    if (t.dataset.vrF === "vintage") R.form.vintage = t.value.trim().toUpperCase() === "NV" ? "NV" : t.value.trim();
  });
  return {
    state: R,
    mount(el) { root = el; if (!R.lists && !R.loading) load(); draw(); },
    leave() { root = null; },
    redraw: draw,
  };
}

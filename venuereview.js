// Editor tab, "Vintage Wine Merchants": the shop's wines that are not in our catalog yet, reviewed one at a time and added to the catalog.
// The venue's file only gives a title per wine ("2019 Ridge Vineyards Monte Bello Santa Cruz Mountains"). For each row the app SUGGESTS where the producer's
// name ends, the type, the place and the grapes, using only the title's words and the lists the app already holds (venue.js suggestRow). The editor checks
// and changes every field, then adds the wine: published at once, or waiting for review (Catalog section). Nothing is created without that tap, and nothing
// is looked up outside the app. The new wine is linked to the list row, so it joins the venue's deck as soon as it is published.
// Editor writes are online only. The rules are in venue.js (pure); this file draws the screen and handles the taps.
import { esc, WINE_STYLES } from "./logic.js?v=14";
import { VENUE, suggestRow, splitTitle, reviewQueue, checkReview } from "./venue.js?v=2";
import { placeOptions } from "./wineinfo.js?v=20";
import * as db from "./data.js?v=35";

const fold = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const STYLE_CHOICES = WINE_STYLES.map((s) => ({ id: s.id, label: s.label }));

// The form for one row, filled with the suggestions.
export function formFor(row, lists) {
  const s = suggestRow(row.wine_name, { producers: lists.producers, areas: lists.areas, shopType: row.shop_type || "" });
  const sp = splitTitle(row.wine_name, s.split);
  return {
    rowId: row.id, title: row.wine_name, shopType: row.shop_type || "", split: s.split, producer: sp.producer, wine: sp.wine,
    vintage: row.vintage || "NV", style: s.style, styleWhy: s.styleWhy, areaId: s.areaId || "", areaWhy: s.areaWhy, grapes: s.grapes.join(", "),
    knownProducer: !!s.producerId,
  };
}
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

export function reviewHtml(R, queue, opts) {
  if (R.error) return `<div class="err">${esc(R.error)}</div><button class="btn outline slim" data-vr="retry">Try again</button>`;
  if (!R.lists) return `<p class="muted">Loading…</p>`;
  const intro = `<p class="muted small">Wines on ${esc(VENUE.name)}' list that are not in our catalog yet: <b>${queue.length}</b>. Check each one against the shop's title. Every field below is only a suggestion until you add the wine.</p>`;
  const msg = R.msg ? `<div class="notice">${esc(R.msg)}</div>` : "";
  if (!queue.length) return `${intro}${msg}<p class="muted">Nothing is waiting. New wines appear here when the owner uploads a new list.</p>`;
  const f = R.form;
  if (!f) return `${intro}${msg}`;
  const words = f.title.split(/\s+/).filter(Boolean);
  const wordBtns = words.map((w, i) => `<button class="chip wide vrword${i < f.split ? " on" : ""}" data-vr="split:${i + 1}" aria-pressed="${i < f.split}">${esc(w)}</button>`).join("");
  const styles = STYLE_CHOICES.map((s) => `<button class="chip wide${f.style === s.id ? " on" : ""}" data-vr="style:${s.id}" aria-pressed="${f.style === s.id}">${esc(s.label)}</button>`).join("");
  const places = `<option value="">No place (choose if you know it)</option>` + R.places.map((p) => `<option value="${esc(p.id)}"${String(f.areaId) === String(p.id) ? " selected" : ""}>${esc(p.label)}</option>`).join("");
  return `${intro}${msg}
    <div class="vrcard">
      <div class="serif vrtitle">${esc(f.title)}</div>
      <div class="muted small">Vintage on the list: ${esc(f.vintage)}${f.shopType ? ` · Shop category: ${esc(f.shopType)}` : ""}</div>
      <div class="glabel">Where does the producer's name end? Tap the last word of it.</div>
      <div class="chips left vrwords">${wordBtns}</div>
      ${f.knownProducer ? `<div class="muted small">Suggested: a producer already in our catalog.</div>` : `<div class="muted small">No producer in our catalog starts this title: tap where the name ends.</div>`}
      <label class="glabel" for="vrProducer">Producer</label><input class="field" id="vrProducer" data-vr-f="producer" value="${esc(f.producer)}" autocomplete="off">
      <label class="glabel" for="vrWine">Wine name (as on the label)</label><input class="field" id="vrWine" data-vr-f="wine" value="${esc(f.wine)}" autocomplete="off">
      <label class="glabel" for="vrVintage">Vintage (a year or NV)</label><input class="field" id="vrVintage" data-vr-f="vintage" value="${esc(f.vintage)}" autocomplete="off" inputmode="text">
      <div class="glabel">Type of wine</div><div class="chips left">${styles}</div>
      ${f.styleWhy ? `<div class="muted small">Suggested from ${esc(f.styleWhy)}.</div>` : `<div class="muted small">No suggestion: choose the type.</div>`}
      <label class="glabel" for="vrPlace">Place</label><select class="field" id="vrPlace" data-vr-f="areaId">${places}</select>
      ${f.areaWhy ? `<div class="muted small">Suggested from ${esc(f.areaWhy)}.</div>` : ""}
      <label class="glabel" for="vrGrapes">Grapes on the label (comma between them)</label><input class="field" id="vrGrapes" data-vr-f="grapes" value="${esc(f.grapes)}" autocomplete="off">
      <div class="err" id="vrErr">${esc(R.err || "")}</div>
      <div class="gopts vrbtns">
        <button class="btn primary slim" data-vr="add:pub"${R.busy ? " disabled" : ""}>Add and publish</button>
        <button class="btn outline slim" data-vr="add:rev"${R.busy ? " disabled" : ""}>Add, waiting for review</button>
        <button class="btn outline slim" data-vr="skip"${R.busy ? " disabled" : ""}>Skip for now</button>
        ${opts.owner ? `<button class="link" data-vr="remove"${R.busy ? " disabled" : ""}>Not a wine we want: remove from the list</button>` : ""}
      </div>
      <div class="muted small">Publish only what you have checked: published wines go straight into ${esc(VENUE.name)}' deck.</div>
    </div>`;
}

// ctx: { sb(), userId(), list() (the venue's rows), owner() (true for the owner), onChanged() (reload the catalog and the list), onError(msg) }
export function createVenueReview(ctx) {
  const R = { lists: null, places: [], loading: false, error: "", form: null, busy: false, msg: "", err: "", skipped: new Set() };
  let root = null;
  const queue = () => reviewQueue(ctx.list() || [], R.skipped);
  function pickNext() {
    const q = queue();
    const cur = R.form && q.find((r) => r.id === R.form.rowId && !R.skipped.has(r.id));
    if (cur) return;
    R.form = q.length && R.lists ? formFor(q[0], R.lists) : null;
    R.err = "";
  }
  function draw() {
    if (!root) return;
    if (!ctx.list()) { root.innerHTML = `<p class="muted">${esc(ctx.listError() || "The venue's list has not loaded yet.")}</p>`; return; }
    pickNext();
    root.innerHTML = `<div class="vrev">${reviewHtml(R, queue(), { owner: ctx.owner() })}</div>`;
  }
  async function load() {
    R.loading = true; R.error = "";
    try { R.lists = await db.loadEditorLists(ctx.sb()); R.places = placeOptions(R.lists.areas); }
    catch (e) { R.error = "Could not load the producer, grape and place lists: " + (e.message || e); }
    R.loading = false; draw();
  }
  async function add(publish) {
    const f = R.form; if (!f || R.busy) return;
    const chk = checkReview(f);
    if (!chk.ok) { R.err = chk.why; const e = document.getElementById("vrErr"); if (e) e.textContent = chk.why; return; }
    R.busy = true; R.err = ""; draw();
    try {
      await db.addVenueCatalogWine(ctx.sb(), ctx.userId(), {
        producerName: f.producer, wineName: f.wine, style: f.style, areaId: f.areaId || null, vintage: f.vintage === "NV" ? "NV" : f.vintage,
        grapes: grapesFrom(f.grapes, R.lists.grapes), publish, rowId: f.rowId, listedAs: f.title, sourceName: `${VENUE.name} list`,
      });
      R.msg = `Added: ${f.producer}${f.wine ? " " + f.wine : ""} ${f.vintage}${publish ? ", published" : ", waiting for review in Catalog"}.`;
      R.form = null;
      if (!R.lists.producers.some((p) => fold(p.name) === fold(f.producer))) R.lists.producers.push({ id: null, name: f.producer });   // so the next titles from this producer are split for you
      await ctx.onChanged();
    } catch (e) { R.err = "Not added: " + (e.message || e); }
    R.busy = false; draw();
  }
  document.addEventListener("click", async (ev) => {
    const t = ev.target.closest("[data-vr]");
    if (!t || !root || t.disabled) return;
    const [action, a] = t.dataset.vr.split(":");
    const f = R.form;
    if (action === "retry") load();
    else if (action === "split" && f) { f.split = Number(a) === f.split ? 0 : Number(a); const sp = splitTitle(f.title, f.split); f.producer = sp.producer; f.wine = sp.wine; draw(); }
    else if (action === "style" && f) { f.style = a; draw(); }
    else if (action === "add") await add(a === "pub");
    else if (action === "skip" && f) { R.skipped.add(f.rowId); R.form = null; R.msg = ""; draw(); }
    else if (action === "remove" && f && ctx.owner()) {
      R.busy = true; draw();
      try { await db.removeVenueRow(ctx.sb(), f.rowId); R.msg = `Removed from the list: ${f.title}.`; R.form = null; await ctx.onChanged(); }
      catch (e) { R.err = "Not removed: " + (e.message || e); }
      R.busy = false; draw();
    }
  });
  // Typing changes the form without redrawing, so the box keeps its focus.
  document.addEventListener("input", (ev) => {
    const t = ev.target;
    if (!t || !t.dataset || t.dataset.vrF === undefined || !R.form) return;
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

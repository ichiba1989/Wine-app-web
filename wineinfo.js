// Wine info (editors only): change a catalog wine's details. Producer, wine name, vineyard, vintage, type of wine,
// place, the grapes printed on the label, and other grapes in the wine (for blends the label does not list).
// The rules at the top are pure (no browser, no network). The controller at the bottom talks to Supabase.
import { esc, WINE_STYLES } from "./logic.js?v=7";
import * as db from "./data.js?v=9";

const fold = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

// "Barolo, Piedmont, Italy": a place with the areas above it.
export function placeLabel(areas, id) {
  const byId = new Map(areas.map((a) => [a.id, a]));
  const parts = [];
  for (let a = byId.get(id), n = 0; a && n < 6; a = byId.get(a.parent_id), n++) parts.push(a.name);
  return parts.join(", ");
}
export const placeOptions = (areas) => areas.map((a) => ({ id: a.id, label: placeLabel(areas, a.id), classification: a.classification || "" })).sort((a, b) => a.label.localeCompare(b.label));
export function parseList(text) {
  const seen = new Set(), out = [];
  String(text || "").split(/[,;]/).map((x) => x.trim()).filter(Boolean).forEach((x) => { const k = fold(x); if (!seen.has(k)) { seen.add(k); out.push(x); } });
  return out;
}
// Matches typed grape names against the grape list, ignoring capitals and accents.
export function resolveGrapes(names, grapes) {
  const ids = [], unknown = [];
  names.forEach((n) => { const g = grapes.find((x) => fold(x.name) === fold(n)); if (g) ids.push(g.id); else unknown.push(n); });
  return { ids, unknown };
}
// The first problem with the form, or "".
export function validateInfo(v) {
  if (!v.producerName.trim()) return "Enter the producer.";
  if (!v.nonVintage) {
    const y = Number(v.year);
    if (!/^\d{4}$/.test(String(v.year).trim()) || y < 1800 || y > 2100) return "Enter the vintage as a four-digit year, or tick Non-vintage.";
  }
  if (![...WINE_STYLES.map((s) => s.id), "unknown"].includes(v.style)) return "Choose the type of wine.";
  return "";
}
// The form starts from what the database holds.
export function formFromInfo(info, lists) {
  const label = info.grapes.filter((g) => g.basis === "label").sort((a, b) => a.position - b.position);
  const other = info.grapes.filter((g) => g.basis === "editor").sort((a, b) => a.position - b.position);
  const nameOf = (g) => (lists.grapes.find((x) => x.id === g.grape_id) || {}).name || "";
  const producer = lists.producers.find((p) => p.id === info.wine.producer_id);
  return {
    producerName: producer ? producer.name : "", wineName: info.wine.name || "", vineyard: info.wine.vineyard || "",
    year: info.vintage.vintage_year ? String(info.vintage.vintage_year) : "", nonVintage: !!info.vintage.is_non_vintage,
    style: info.wine.style || "unknown", place: info.wine.appellation_id ? placeLabel(lists.areas, info.wine.appellation_id) : "",
    labelGrapes: label.map(nameOf).filter(Boolean).join(", "), otherGrapes: other.map(nameOf).filter(Boolean).join(", "),
  };
}

function sheetHtml(W) {
  const f = W.form, L = W.lists;
  const chips = [...WINE_STYLES, { id: "unknown", label: "Not known" }].map((s) => `<button class="chip${f.style === s.id ? " on" : ""}" data-wi="style:${s.id}" aria-pressed="${f.style === s.id}">${esc(s.label)}</button>`).join("");
  const place = W.options.find((o) => fold(o.label) === fold(f.place));
  const matchProducer = L.producers.some((p) => fold(p.name) === fold(f.producerName));
  return `<div class="overlay"><div class="sheet" id="wineInfoPanel">
    <div class="sheethead"><div class="sheettitle"><div class="serif big">Wine info</div><div class="muted small">${esc(W.title)}. Changes show for everyone.</div></div>
      <div class="sheetbtns"><button class="pill wine" data-wi="save"${W.saving ? " disabled" : ""}>Save</button><button class="xbtn" data-wi="close" aria-label="Close">&times;</button></div></div>
    <div class="qlabel">Producer</div><input class="field" list="dlProducers" data-wif="producerName" value="${esc(f.producerName)}" autocomplete="off">
    ${f.producerName.trim() && !matchProducer ? `<div class="muted small">A new producer will be created.</div>` : ""}
    <div class="qlabel">Wine name (leave empty if there is none)</div><input class="field" data-wif="wineName" value="${esc(f.wineName)}">
    <div class="qlabel">Vineyard (optional)</div><input class="field" data-wif="vineyard" value="${esc(f.vineyard)}">
    <div class="two"><div><div class="qlabel">Vintage</div><input class="field" inputmode="numeric" maxlength="4" data-wif="year" value="${esc(f.year)}"${f.nonVintage ? " disabled" : ""}></div>
      <label class="nvrow"><input type="checkbox" data-wif="nonVintage"${f.nonVintage ? " checked" : ""}> Non-vintage</label></div>
    <div class="qlabel">Type of wine</div><div class="stylerow">${chips}</div>
    <div class="qlabel">Place</div><input class="field" list="dlPlaces" data-wif="place" value="${esc(f.place)}" placeholder="Start typing, then pick from the list" autocomplete="off">
    ${place && place.classification ? `<div class="muted small">Classification (from the place): ${esc(place.classification)}</div>` : ""}
    <div class="qlabel">Grapes on the label, in order (separate with commas)</div><input class="field" list="dlGrapes" data-wif="labelGrapes" value="${esc(f.labelGrapes)}" autocomplete="off">
    <div class="qlabel">Other grapes in the wine, not on the label (a blend)</div><input class="field" list="dlGrapes" data-wif="otherGrapes" value="${esc(f.otherGrapes)}" autocomplete="off">
    ${W.unknown.length ? `<label class="addgrapes"><input type="checkbox" data-wif="addNew"${W.addNew ? " checked" : ""}> Not in the grape list: <b>${esc(W.unknown.map((u) => u.name).join(", "))}</b>. Tick to add them as new grapes.</label>` : ""}
    <div id="wiErr" class="err">${esc(W.error)}</div>
    <button class="btn primary" data-wi="save"${W.saving ? " disabled" : ""}>Save wine info</button>
    <datalist id="dlProducers">${L.producers.map((p) => `<option value="${esc(p.name)}">`).join("")}</datalist>
    <datalist id="dlPlaces">${W.options.map((o) => `<option value="${esc(o.label)}">`).join("")}</datalist>
    <datalist id="dlGrapes">${L.grapes.map((g) => `<option value="${esc(g.name)}">`).join("")}</datalist></div></div>`;
}

// ctx: { sb(), userId(), onSaved() }
export function createWineInfo(ctx) {
  const W = { open: false, title: "", card: null, info: null, lists: null, options: [], form: null, unknown: [], addNew: false, error: "", saving: false };
  const overlay = () => document.querySelector("#overlay");
  const draw = () => { const o = overlay(); if (o && W.open) o.innerHTML = sheetHtml(W); };
  const setError = (m) => { W.error = m; const e = document.getElementById("wiErr"); if (e) e.textContent = m; };

  async function open(card, title) {
    const o = overlay();
    W.open = true; W.title = title || ""; W.card = card; W.error = ""; W.unknown = []; W.addNew = false; W.saving = false;
    if (o) o.innerHTML = `<div class="overlay"><div class="sheet"><p class="muted" style="padding:20px">Loading…</p></div></div>`;
    try {
      if (!W.lists) { W.lists = await db.loadEditorLists(ctx.sb()); W.options = placeOptions(W.lists.areas); }
      W.info = await db.loadWineInfo(ctx.sb(), card.id);
      W.form = formFromInfo(W.info, W.lists);
      draw();
    } catch (e) { W.open = false; if (o) o.innerHTML = ""; throw e; }
  }
  const close = () => { W.open = false; const o = overlay(); if (o) o.innerHTML = ""; };

  async function save() {
    if (W.saving) return;
    const f = W.form;
    const problem = validateInfo(f);
    if (problem) return setError(problem);
    let areaId = null;
    if (f.place.trim()) {
      const hit = W.options.find((o) => fold(o.label) === fold(f.place));
      if (!hit) return setError("Choose the place from the list. If it is not there, it needs to be added to the places first.");
      areaId = hit.id;
    }
    const label = resolveGrapes(parseList(f.labelGrapes), W.lists.grapes), other = resolveGrapes(parseList(f.otherGrapes), W.lists.grapes);
    W.unknown = [...label.unknown.map((name) => ({ name, where: "label" })), ...other.unknown.map((name) => ({ name, where: "other" }))];
    if (W.unknown.length && !W.addNew) { setError("Some grapes are not in the grape list. Fix the spelling, or tick the box to add them."); draw(); setError("Some grapes are not in the grape list. Fix the spelling, or tick the box to add them."); return; }
    W.saving = true; setError(""); draw();
    try {
      await db.saveWineInfo(ctx.sb(), ctx.userId(), W.info, {
        producerName: f.producerName, wineName: f.wineName, vineyard: f.vineyard, year: f.year, nonVintage: f.nonVintage, style: f.style, areaId,
        labelGrapes: label.ids, otherGrapes: other.ids, newGrapes: W.unknown,
      }, W.lists);
      W.lists = null;   // producers and grapes may have changed
      close();
      if (ctx.onSaved) await ctx.onSaved();
    } catch (e) { W.saving = false; draw(); setError("Could not save. " + (e.message || e)); }
  }

  document.addEventListener("click", (ev) => {
    const t = ev.target.closest("[data-wi]");
    if (!t || !W.open || !W.form) return;
    const [action, arg] = t.dataset.wi.split(":");
    if (action === "style") { W.form.style = arg; draw(); }
    else if (action === "save") save();
    else if (action === "close") close();
  });
  document.addEventListener("input", (ev) => {
    const t = ev.target;
    if (!W.open || !W.form || !t.dataset || t.dataset.wif === undefined) return;
    const k = t.dataset.wif;
    if (k === "nonVintage") { W.form.nonVintage = t.checked; draw(); }
    else if (k === "addNew") W.addNew = t.checked;
    else W.form[k] = t.value;
  });
  return { state: W, open, close };
}

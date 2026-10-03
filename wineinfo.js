// Wine info (editors only): change a catalog wine's details. Producer, wine name, vineyard, vintage, type of wine,
// place, the grapes printed on the label, and other grapes in the wine (for blends the label does not list).
// The rules at the top are pure (no browser, no network). The controller at the bottom talks to Supabase.
import { esc, WINE_STYLES } from "./logic.js?v=10";
import { checkGrapeText, grapeProblem, grapeIndex, setExtraGrapes } from "./grapes.js?v=1";
import { expandBlends, BLEND_NAMES } from "./blends.js?v=1";
import { infoLine } from "./wineline.js?v=1";
import { countriesOf, regionsOf, appellationsOf, placeFromArea, planPlace, placeClassification, savePlace } from "./geo.js?v=1";
import { loadWinePrice, saveWinePrice, parsePrice, centsToField, blendPrice, formatPrice } from "./pricing.js?v=1";
import { archivePlanFor } from "./catalog.js?v=2";
import { uploadWinePhoto, removeWinePhoto, reuseWinePhoto, pullSource, shareWinePhoto, shareNote, photoTag, FOUND_ONLINE_PERMISSION } from "./winephotos.js?v=3";
import * as db from "./data.js?v=15";

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
// What the delete confirmation says, from the database's answer. Nothing here decides anything: the database refuses what it must.
export function deleteSummary(check) {
  if (!check) return { blocked: true, reason: "", lines: [] };
  const n = (x, one, many) => `${x} ${x === 1 ? one : many}`;
  if (!check.can_delete) {
    const lines = [];
    if (check.swipers) lines.push(`Swiped by ${n(check.swipers, "person", "people")}`);
    if (check.journal_entries) lines.push(`In ${n(check.journal_entries, "journal entry", "journal entries")}`);
    if (check.matched_outside_wines) lines.push(`Matched to ${n(check.matched_outside_wines, "wine added by a person", "wines added by people")}`);
    if (check.linked_quiz_questions) lines.push(`Linked to ${n(check.linked_quiz_questions, "quiz question", "quiz questions")}`);
    return { blocked: true, reason: check.reason || "This wine cannot be deleted.", lines };
  }
  const lines = [check.deletes_whole_wine ? "The wine, its grapes, structure values, source records and images" : "This vintage, its source records and images"];
  if (check.reports) lines.push(`${n(check.reports, "report", "reports")} from testers about this wine`);
  if (!check.deletes_whole_wine && check.other_vintages) lines.push(`The wine stays: it has ${n(check.other_vintages, "other vintage", "other vintages")}`);
  return { blocked: false, reason: "", lines };
}
// The first problem with the form, or "".
export function validateInfo(v) {
  if (!v.producerName.trim()) return "Enter the producer.";
  if (!v.nonVintage) {
    const y = Number(v.year);
    if (!/^\d{4}$/.test(String(v.year).trim()) || y < 1800 || y > 2100) return "Enter the vintage as a four-digit year, or tick Non-vintage.";
  }
  if (![...WINE_STYLES.map((s) => s.id), "unknown"].includes(v.style)) return "Choose the type of wine.";
  if (Number.isNaN(parsePrice(v.price))) return "Enter the price as a number in US dollars, like 24.99, or leave it empty.";
  return "";
}
// The form starts from what the database holds.
// How easy a wine is to find. The Discover deck uses it as the starting point for "will this person recognize it".
export const REACH_CHOICES = [["5", "Everywhere: supermarkets"], ["4", "Common: chain stores"], ["3", "Wine shops and restaurants"], ["2", "Specialist wine shops"], ["1", "Rare: hard to find"]];
export function formFromInfo(info, lists) {
  const label = info.grapes.filter((g) => g.basis === "label").sort((a, b) => a.position - b.position);
  const other = info.grapes.filter((g) => g.basis === "editor").sort((a, b) => a.position - b.position);
  const nameOf = (g) => (lists.grapes.find((x) => x.id === g.grape_id) || {}).name || "";
  const producer = lists.producers.find((p) => p.id === info.wine.producer_id);
  return {
    producerName: producer ? producer.name : "", wineName: info.wine.name || "", vineyard: info.wine.vineyard || "",
    year: info.vintage.vintage_year ? String(info.vintage.vintage_year) : "", nonVintage: !!info.vintage.is_non_vintage,
    reach: info.wine.reach != null ? String(info.wine.reach) : "",   // empty before database update 15
    style: info.wine.style || "unknown", price: "", ...placeFromArea(lists.areas, info.wine.appellation_id),
    labelGrapes: label.map(nameOf).filter(Boolean).join(", "), otherGrapes: other.map(nameOf).filter(Boolean).join(", "),
  };
}

// The line under the place fields: what saving would add, and the classification of the appellation.
function placeNoteHtml(W) {
  const place = { country: W.form.country, region: W.form.region, appellation: W.form.appellation };
  const plan = planPlace(W.lists.areas, place);
  if (plan.error) return esc(plan.error);
  const cls = placeClassification(W.lists.areas, place);
  return [...plan.notes.map(esc), cls ? `Classification (from the appellation): ${esc(cls)}` : ""].filter(Boolean).join(" ");
}
// The line under the price: what players paid, and what players will see.
function priceNoteHtml(W) {
  const p = W.priceInfo;
  if (!p) return "Prices are not available yet. Run database update 20.";
  const typed = parsePrice(W.form.price);
  const editorCents = Number.isNaN(typed) ? p.editorCents : typed;
  const shown = blendPrice({ editorCents, sumCents: p.sumCents, count: p.count });
  const players = p.count ? `Players paid about ${formatPrice(Math.round(p.sumCents / p.count))} (${p.count} ${p.count === 1 ? "price" : "prices"} from ${p.people} ${p.people === 1 ? "player" : "players"}). ` : "No player prices to use yet. ";
  return esc(`${players}${shown == null ? "Players see no price until you set one or enough players enter theirs." : `Players see about ${formatPrice(shown)}.`} Player prices move the price a little: your price counts like four players' prices.`);
}

function sheetHtml(W) {
  const f = W.form, L = W.lists;
  const chips = [...WINE_STYLES, { id: "unknown", label: "Other" }].map((s) => `<button class="chip${f.style === s.id ? " on" : ""}" data-wi="style:${s.id}" aria-pressed="${f.style === s.id}">${esc(s.label)}</button>`).join("");
  const matchProducer = L.producers.some((p) => fold(p.name) === fold(f.producerName));
  return `<div class="overlay"><div class="sheet" id="wineInfoPanel">
    <div class="sheethead"><div class="sheettitle"><div class="serif big">Wine info</div><div class="muted small">${esc(W.title)}. Changes show for everyone.</div>${W.card && infoLine(W.card) ? `<div class="muted small">${esc(infoLine(W.card))}</div>` : ""}</div>
      <div class="sheetbtns"><button class="pill wine" data-wi="save"${W.saving ? " disabled" : ""}>Save</button><button class="xbtn" data-wi="close" aria-label="Close">&times;</button></div></div>
    <div class="photoblock">${W.card && W.card.photo ? `<img class="rowthumb" src="${esc(W.card.photo)}" alt="Bottle photo">` : `<div class="rowthumb empty" aria-hidden="true"></div>`}
      <div class="photoctl"><div class="qlabel" style="margin:0">Bottle photo</div>
        <div class="photobtns"><label class="btn outline slim photobtn${W.photoBusy ? " disabled" : ""}">${W.photoBusy ? "Saving…" : W.card && W.card.image ? "Replace photo" : "Add photo"}<input type="file" accept="image/*" data-wiphoto${W.photoBusy ? " disabled" : ""} hidden></label>${W.card && W.card.image && !W.photoBusy ? `<button class="link" data-wi="photoremove">${W.photoConfirm ? "Tap again to remove" : "Remove"}</button>` : ""}${(() => { const re = W.reuse; return re ? `<button class="link" data-wi="photoreuse:${esc(re.id)}:${esc(re.vintage || "")}">Use the ${esc(re.vintage || "earlier")} photo</button>` : ""; })()}</div>
        ${W.card && W.card.image && photoTag(W.card) ? `<div class="muted tiny">Photo: ${esc(photoTag(W.card))}</div>` : ""}${W.photoNote ? `<div class="muted small">${esc(W.photoNote)}</div>` : ""}${W.photoError ? `<div class="err">${esc(W.photoError)}</div>` : ""}</div></div>
    <div class="qlabel">Producer</div><input class="field" list="dlProducers" data-wif="producerName" value="${esc(f.producerName)}" autocomplete="off">
    ${f.producerName.trim() && !matchProducer ? `<div class="muted small">A new producer will be created.</div>` : ""}
    <div class="qlabel">Wine name (leave empty if there is none)</div><input class="field" data-wif="wineName" value="${esc(f.wineName)}">
    <div class="qlabel">Vineyard (optional)</div><input class="field" data-wif="vineyard" value="${esc(f.vineyard)}">
    <div class="two"><div><div class="qlabel">Vintage</div><input class="field" inputmode="numeric" maxlength="4" data-wif="year" value="${esc(f.year)}"${f.nonVintage ? " disabled" : ""}></div>
      <label class="nvrow"><input type="checkbox" data-wif="nonVintage"${f.nonVintage ? " checked" : ""}> Non-vintage</label></div>
    <div class="qlabel">Typical price in US dollars (optional)</div><input class="field" inputmode="decimal" data-wif="price" value="${esc(f.price)}" placeholder="For example 24.99" autocomplete="off">
    <div class="muted small">${priceNoteHtml(W)}</div>
    <div class="qlabel">Type of wine</div><div class="stylerow">${chips}</div>
    ${f.reach ? `<div class="qlabel">How easy to find (helps decide who is likely to recognize it)</div><select class="field" data-wif="reach" aria-label="How easy to find">${REACH_CHOICES.map(([v, l]) => `<option value="${v}"${f.reach === v ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>` : ""}
    <div class="qlabel">Country</div><input class="field" list="dlCountries" data-wif="country" value="${esc(f.country)}" placeholder="Start typing, then pick from the list" autocomplete="off">
    <div class="qlabel">Region</div><input class="field" list="dlRegions" data-wif="region" value="${esc(f.region)}" placeholder="For example Piedmont or Napa Valley" autocomplete="off">
    <div class="qlabel">Appellation (optional)</div><input class="field" list="dlApps" data-wif="appellation" value="${esc(f.appellation)}" placeholder="For example Barolo or Rutherford" autocomplete="off">
    <div id="wiPlaceNote" class="muted small">${placeNoteHtml(W)}</div>
    <div class="qlabel">Main varietal</div><div class="muted tiny">The grape named on the label. If the label names more than one, separate them with commas. GSM is accepted.</div><input class="field" data-grapes="multi" data-wif="labelGrapes" value="${esc(f.labelGrapes)}" placeholder="Start typing, then pick from the list" autocomplete="off" autocapitalize="words" spellcheck="false">
    <div class="qlabel">Other varietals (if blended)</div><div class="muted tiny">Other grapes in the blend that are not named on the label.</div><input class="field" data-grapes="multi" data-wif="otherGrapes" value="${esc(f.otherGrapes)}" placeholder="Start typing, then pick from the list" autocomplete="off" autocapitalize="words" spellcheck="false">
    <div id="wiErr" class="err">${esc(W.error)}</div>
    <button class="btn primary" data-wi="save"${W.saving ? " disabled" : ""}>Save wine info</button>
    ${W.card && W.card.wineStatus && W.card.wineStatus !== "verified" ? `<div class="pubzone"><div class="muted small">This wine is <b>${W.card.wineStatus === "pending_review" ? "waiting for review" : esc(W.card.wineStatus)}</b>. Players do not see it yet.</div><button class="btn outline" data-wi="pubask">Publish to Discover</button></div>` : ""}
    ${W.canRemove ? `<div class="dangerzone"><button class="link danger" data-wi="delask">Delete this wine</button></div>` : ""}
    <datalist id="dlProducers">${L.producers.map((p) => `<option value="${esc(p.name)}">`).join("")}</datalist>
    <datalist id="dlCountries">${countriesOf(L.areas).map((n) => `<option value="${esc(n)}">`).join("")}</datalist>
    <datalist id="dlRegions">${regionsOf(L.areas, f.country).map((n) => `<option value="${esc(n)}">`).join("")}</datalist>
    <datalist id="dlApps">${appellationsOf(L.areas, f.country, f.region).map((n) => `<option value="${esc(n)}">`).join("")}</datalist>
</div></div>`;
}

// Publishing puts the wine in everyone's deck, and archives older vintages of the same wine. This says exactly what will happen first.
export function publishSummary(plan, selfId) {
  if (!plan) return { lines: ["It joins everyone's Discover deck."], archivesSelf: false };
  const yr = (c) => c.vintage || "?";
  const lines = [];
  if (plan.keep.id === selfId) lines.push("It joins everyone's Discover deck as the most recent vintage.");
  else lines.push(`A newer vintage (${yr(plan.keep)}) of this wine is already in the deck, so this one is archived straight away.`);
  const others = plan.archive.filter((c) => c.id !== selfId);
  if (others.length) lines.push(`Older vintages archived: ${others.map(yr).join(", ")}. They leave the deck; players' swipes and journals are not changed.`);
  return { lines, archivesSelf: plan.archive.some((c) => c.id === selfId) };
}
function publishHtml(W) {
  const p = W.pub;
  const head = `<div class="sheethead"><div class="sheettitle"><div class="serif big">Publish this wine?</div><div class="muted small">${esc(W.title)}</div></div>
      <div class="sheetbtns"><button class="xbtn" data-wi="pubcancel" aria-label="Back">&times;</button></div></div>`;
  const list = publishSummary(p.plan, W.card.id).lines.map((x) => `<li>${esc(x)}</li>`).join("");
  return `<div class="overlay"><div class="sheet" id="winePublishPanel">${head}<ul class="dellist">${list}</ul>
    <p class="muted small">Check the place, grapes and structure first. Once it is published, players will swipe it.</p>
    <div class="err">${esc(p.error || "")}</div>
    <button class="btn primary" data-wi="pubgo"${p.busy ? " disabled" : ""}>${p.busy ? "Publishing…" : "Yes, publish"}</button>
    <button class="btn outline" data-wi="pubcancel"${p.busy ? " disabled" : ""}>Not yet</button></div></div>`;
}

// The delete confirmation replaces the form until the owner goes back or deletes.
function deleteHtml(W) {
  const d = W.del, head = `<div class="sheethead"><div class="sheettitle"><div class="serif big">Delete this wine?</div><div class="muted small">${esc(W.title)}</div></div>
      <div class="sheetbtns"><button class="xbtn" data-wi="delcancel" aria-label="Back">&times;</button></div></div>`;
  let body;
  if (d.loading) body = `<p class="muted">Checking what uses this wine…</p>`;
  else if (!d.check) body = `<div class="err">${esc(d.error || "Could not check this wine.")}</div><button class="btn outline" data-wi="delcancel">Back to wine info</button>`;
  else {
    const sum = deleteSummary(d.check), list = sum.lines.map((x) => `<li>${esc(x)}</li>`).join("");
    body = sum.blocked
      ? `<p>${esc(sum.reason)}</p><ul class="dellist">${list}</ul><p class="muted small">Nothing was deleted. If a wine is wrong, fix its details instead.</p><button class="btn outline" data-wi="delcancel">Back to wine info</button>`
      : `<p>This removes the wine for everyone and cannot be undone.</p><p class="muted small">What goes with it:</p><ul class="dellist">${list}</ul>
         <div class="err">${esc(d.error || "")}</div>
         <button class="btn danger solid" data-wi="delgo"${d.deleting ? " disabled" : ""}>${d.deleting ? "Deleting…" : "Yes, delete this wine"}</button>
         <button class="btn outline" data-wi="delcancel"${d.deleting ? " disabled" : ""}>Keep it</button>`;
    if (sum.blocked && d.error) body += `<div class="err">${esc(d.error)}</div>`;
  }
  return `<div class="overlay"><div class="sheet" id="wineDeletePanel">${head}${body}</div></div>`;
}

// ctx: { sb(), userId(), can(permission), onSaved(), onDeleted() }
export function createWineInfo(ctx) {
  const W = { photoBusy: false, photoConfirm: false, photoError: "", open: false, title: "", card: null, info: null, lists: null, options: [], form: null, unknown: [], addNew: false, error: "", saving: false, del: null, pub: null, canRemove: false };
  const overlay = () => document.querySelector("#overlay");
  const draw = () => { const o = overlay(); if (o && W.open) { W.reuse = W.card && !W.card.image && !W.photoBusy ? pullSource(ctx.cards ? ctx.cards() : [], W.card, !!(ctx.can && ctx.can(FOUND_ONLINE_PERMISSION))) : null; W.canRemove = !!(ctx.can && ctx.can("remove_content")); o.innerHTML = W.del ? deleteHtml(W) : W.pub ? publishHtml(W) : sheetHtml(W); } };
  const setError = (m) => { W.error = m; const e = document.getElementById("wiErr"); if (e) e.textContent = m; };

  // The region and appellation suggestions depend on the country and region typed so far; the note says what saving would add.
  function refreshPlace() {
    const f = W.form, L = W.lists;
    const fill = (id, names) => { const el = document.getElementById(id); if (el) el.innerHTML = names.map((n) => `<option value="${esc(n)}">`).join(""); };
    fill("dlRegions", regionsOf(L.areas, f.country)); fill("dlApps", appellationsOf(L.areas, f.country, f.region));
    const note = document.getElementById("wiPlaceNote"); if (note) note.innerHTML = placeNoteHtml(W);
  }
  async function open(card, title) {
    const o = overlay();
    W.open = true; W.title = title || ""; W.card = card; W.error = ""; W.unknown = []; W.addNew = false; W.saving = false; W.del = null; W.pub = null; W.photoBusy = false; W.photoConfirm = false; W.photoError = ""; W.photoNote = "";
    if (o) o.innerHTML = `<div class="overlay"><div class="sheet"><p class="muted" style="padding:20px">Loading…</p></div></div>`;
    try {
      if (!W.lists) { W.lists = await db.loadEditorLists(ctx.sb()); W.options = placeOptions(W.lists.areas); }
      setExtraGrapes([...W.lists.grapes.map((x) => x.name), ...BLEND_NAMES]);   // GSM is accepted too; it is turned into its three grapes on save
      W.info = await db.loadWineInfo(ctx.sb(), card.id);
      W.form = formFromInfo(W.info, W.lists);
      // The price comes from its own view; before database update 20 it is simply not offered.
      try { W.priceInfo = await loadWinePrice(ctx.sb(), card.id); W.form.price = centsToField(W.priceInfo.editorCents); } catch (_) { W.priceInfo = null; }
      draw();
    } catch (e) { W.open = false; if (o) o.innerHTML = ""; throw e; }
  }
  const close = () => { W.open = false; W.del = null; W.pub = null; const o = overlay(); if (o) o.innerHTML = ""; };

  // The photo is saved as soon as it is chosen (it does not wait for Save); the rest of the form is kept as typed.
  async function refreshCard() { if (ctx.onPhotoSaved) await ctx.onPhotoSaved(); const fresh = (ctx.cards ? ctx.cards() : []).find((c) => c.id === W.card.id); if (fresh) W.card = fresh; }
  async function addPhoto(file) {
    if (!file || W.photoBusy) return;
    const kind = ctx.photoKind ? ctx.photoKind() : "own_photography";
    const canFound = !!(ctx.can && ctx.can(FOUND_ONLINE_PERMISSION));
    if (kind === "found_online" && !canFound) { W.photoError = "Only the owner can add photos found online. Choose another source in Editor, Photos."; draw(); return; }
    W.photoBusy = true; W.photoConfirm = false; W.photoError = ""; W.photoNote = ""; draw();
    try {
      await uploadWinePhoto(ctx.sb(), W.card.id, file, kind);
      const share = await shareWinePhoto(ctx.sb(), ctx.cards ? ctx.cards() : [], W.card.id, kind, { canFound });   // the other vintages of this wine
      await refreshCard();
      W.photoNote = shareNote(share.done).trim();
      if (share.failed.length) W.photoError = `Saved, but ${share.failed.length} other ${share.failed.length === 1 ? "vintage" : "vintages"} could not get it: ${share.failed[0].message}`;
    } catch (e) { W.photoError = e.message || String(e); }
    W.photoBusy = false; draw();
  }
  async function reusePhoto(fromId, fromVintage) {
    if (W.photoBusy || !fromId) return;
    W.photoBusy = true; W.photoConfirm = false; W.photoError = ""; draw();
    try { await reuseWinePhoto(ctx.sb(), fromId, W.card.id, fromVintage); await refreshCard(); }
    catch (e) { W.photoError = e.message || String(e); }
    W.photoBusy = false; draw();
  }
  async function dropPhoto() {
    if (W.photoBusy) return;
    if (!W.photoConfirm) { W.photoConfirm = true; draw(); return; }
    W.photoBusy = true; W.photoConfirm = false; W.photoError = ""; draw();
    try { await removeWinePhoto(ctx.sb(), W.card.id); await refreshCard(); }
    catch (e) { W.photoError = e.message || String(e); }
    W.photoBusy = false; draw();
  }
  function askPublish() {
    const all = (ctx.cards ? ctx.cards() : []).map((c) => (c.id === W.card.id ? { ...c, wineStatus: "verified", archived: false } : c));
    W.pub = { plan: archivePlanFor(all, W.card.id), busy: false, error: "" };
    draw();
  }
  async function doPublish() {
    const p = W.pub;
    if (!p || p.busy) return;
    p.busy = true; p.error = ""; draw();
    try {
      await db.publishWine(ctx.sb(), W.card.id);
      if (p.plan && p.plan.archive.length) await db.archiveVintages(ctx.sb(), p.plan.archive.map((c) => c.id), p.plan.keep.id);
      // A vintage with no photo of its own borrows the best photo of the same wine (best effort: publishing never fails because of it).
      try {
        const src = pullSource(ctx.cards ? ctx.cards() : [], W.card, !!(ctx.can && ctx.can(FOUND_ONLINE_PERMISSION)));
        if (src) await reuseWinePhoto(ctx.sb(), src.id, W.card.id, src.vintage);
      } catch (_) { /* the editor can still tap "Use the ... photo" */ }
      const result = { name: W.title, plan: p.plan, selfId: W.card.id };
      W.lists = null; close();
      if (ctx.onPublished) await ctx.onPublished(result);
    } catch (e) { p.busy = false; p.error = "Could not publish: " + (e.message || e); draw(); }
  }
  async function askDelete() {
    if (!ctx.can || !ctx.can("remove_content")) return;
    W.del = { loading: true, check: null, error: "", deleting: false };
    draw();
    try { W.del.check = await db.wineDeleteCheck(ctx.sb(), W.card.id); }
    catch (e) { W.del.error = "Could not check this wine. " + (e.message || e); }
    W.del.loading = false;
    draw();
  }
  async function doDelete() {
    const d = W.del;
    if (!d || d.deleting || !d.check || !d.check.can_delete) return;
    d.deleting = true; d.error = ""; draw();
    try {
      let files = []; try { files = await db.winePhotoPaths(ctx.sb(), W.card.id); } catch (_) {}
      await db.deleteWineVintage(ctx.sb(), W.card.id);
      try { await db.removePhotoFiles(ctx.sb(), files); } catch (_) {}   // the records went with the wine; this clears the picture files
      W.lists = null;
      close();
      if (ctx.onDeleted) await ctx.onDeleted();
    } catch (e) { d.deleting = false; d.error = e.message || String(e); draw(); }
  }

  async function save() {
    if (W.saving) return;
    const f = W.form;
    const problem = validateInfo(f);
    if (problem) return setError(problem);
    f.labelGrapes = expandBlends(f.labelGrapes); f.otherGrapes = expandBlends(f.otherGrapes);   // GSM -> Grenache, Syrah, Mourvèdre
    const placePlan = planPlace(W.lists.areas, f);
    if (placePlan.error) return setError(placePlan.error);
    const dbNames = W.lists.grapes.map((g) => g.name), idx = grapeIndex(dbNames);
    const lc = checkGrapeText(f.labelGrapes, idx), oc = checkGrapeText(f.otherGrapes, idx);
    if (!lc.ok || !oc.ok) return setError(grapeProblem([...lc.bad, ...oc.bad]));
    // Names are on the list; the ones the database does not have yet are added (editors may add grapes).
    const label = resolveGrapes(lc.names, W.lists.grapes), other = resolveGrapes(oc.names, W.lists.grapes);
    W.unknown = [...label.unknown.map((name) => ({ name, where: "label" })), ...other.unknown.map((name) => ({ name, where: "other" }))];
    W.saving = true; setError(""); draw();
    try {
      const areaId = await savePlace(ctx.sb(), W.lists.areas, f);   // creates a country, region or appellation that is new
      await db.saveWineInfo(ctx.sb(), ctx.userId(), W.info, {
        producerName: f.producerName, wineName: f.wineName, vineyard: f.vineyard, year: f.year, nonVintage: f.nonVintage, style: f.style, areaId, reach: f.reach,
        labelGrapes: label.ids, otherGrapes: other.ids, newGrapes: W.unknown,
      }, W.lists);
    } catch (e) { W.saving = false; draw(); return setError("Could not save. " + (e.message || e)); }
    // The price is saved last, so a problem with it never loses the rest. It is only touched when it changed.
    let priceProblem = "";
    if (W.priceInfo) {
      const cents = parsePrice(f.price);
      if (cents !== W.priceInfo.editorCents) { try { await saveWinePrice(ctx.sb(), W.info.wine.id, cents); } catch (e) { priceProblem = String((e && e.message) || e); } }
    }
    if (priceProblem) { W.saving = false; W.priceInfo = null; draw(); return setError("The wine info was saved, but not the price: " + priceProblem); }   // the form stays open, so keep what it draws from
    W.lists = null;   // producers, grapes and places may have changed
    close();
    if (ctx.onSaved) await ctx.onSaved();
  }

  document.addEventListener("click", (ev) => {
    const t = ev.target.closest("[data-wi]");
    if (!t || !W.open || !W.form) return;
    const [action, arg] = t.dataset.wi.split(":");
    if (action === "photoremove") dropPhoto();
    else if (action === "photoreuse") reusePhoto(arg, (t.dataset.wi.split(":")[2] || ""));
    else if (action === "pubask") askPublish();
    else if (action === "pubgo") doPublish();
    else if (action === "pubcancel") { W.pub = null; draw(); }
    else if (action === "delask") askDelete();
    else if (action === "delgo") doDelete();
    else if (action === "delcancel") { W.del = null; draw(); }
    else if (W.del || W.pub) return;
    else if (action === "style") { W.form.style = arg; draw(); }
    else if (action === "save") save();
    else if (action === "close") close();
  });
  document.addEventListener("change", (ev) => {
    const t = ev.target;
    if (t && t.dataset && t.dataset.wiphoto !== undefined && W.open) { const f = t.files && t.files[0]; t.value = ""; addPhoto(f); }
  });
  document.addEventListener("input", (ev) => {
    const t = ev.target;
    if (!W.open || !W.form || !t.dataset || t.dataset.wif === undefined) return;
    const k = t.dataset.wif;
    if (k === "nonVintage") { W.form.nonVintage = t.checked; draw(); }
    else {
      W.form[k] = t.value;
      if (k === "country" || k === "region" || k === "appellation") refreshPlace();
      else if (k === "price") { const n = document.querySelector("[data-wif='price']"); const note = n && n.nextElementSibling; if (note) note.innerHTML = priceNoteHtml(W); }
    }
  });
  return { state: W, open, close };
}

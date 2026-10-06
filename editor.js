// Editor tab (only shown to editors). Three sections:
//   Structure: set the reference wine structure for each catalog wine (tannin for red styles, CO2 for
//              white, sparkling and rose; oak is unoaked or oaked). It is a baseline, not a "correct answer":
//              rating sliders start from it, and the palate compares each person's own ratings against it.
//              The rules (rules.js) suggest a starting point for every wine. 25 "gold set" wines are scored blind,
//              without suggestions, and the Rule test compares those scores with what the rules say.
//   Flags:     review what testers reported on quiz questions and wines.
//   Quiz:      edit, source and verify quiz questions.
//   Feedback:  read what testers sent from the app and mark it handled.
// Every change is logged by the database.
import { dimsFor, dimMeta, defaultFor, esc, wineName, placeLine, editorList, hasFullProfile, refsByVintage, clampDimValue, isChoice, choiceLabel, barDims, choiceDims, styleInfo } from "./logic.js?v=10";
import * as db from "./data.js?v=15";
import { marksHtml, dimControlHtml, syncChoiceControl } from "./views.js?v=20";
import { createReview } from "./review.js?v=6";
import { createWineInfo, publishSummary } from "./wineinfo.js?v=13";
import { groupSubmissions, planPromotion, duplicateGroups, rulesFrom } from "./catalog.js?v=2";
import { visibleKinds, FOUND_ONLINE_PERMISSION, photoSummary, photoList, photoTag, pullSource, shareWinePhoto, shareNote, uploadWinePhoto, removeWinePhoto, reuseWinePhoto } from "./winephotos.js?v=3";
import { communityHtml, loadSubmissionState, approvalPlan } from "./sharing.js?v=2";
import { infoLine } from "./wineline.js?v=1";
import { sortWines, sortSelectHtml, STRUCTURE_SORTS, PHOTO_SORTS } from "./sorting.js?v=1";
import { suggestStructure, values as ruleValues, goldInfo, GOLD, GROUPS, evaluateRules, reportText, TARGETS, RULES_VERSION } from "./rules.js?v=4";

const SECTIONS = [{ id: "structure", label: "Structure" }, { id: "catalog", label: "Catalog" }, { id: "photos", label: "Photos" }, { id: "flags", label: "Flags" }, { id: "quiz", label: "Quiz" }, { id: "feedback", label: "Feedback" }];
// Which sections each permission opens. A quiz reviewer sees Flags too, but the database only returns the flags on quiz questions.
export const SECTION_PERMISSIONS = { structure: ["catalog_edit"], catalog: ["catalog_edit"], photos: ["catalog_edit"], flags: ["catalog_edit", "quiz_verify"], quiz: ["quiz_verify"], feedback: ["feedback_read"] };
// A quiz reviewer has no catalog work, so Quiz comes first for them and is where they land.
export function sectionsFor(can) {
  const list = SECTIONS.filter((x) => SECTION_PERMISSIONS[x.id].some((p) => can(p)));
  return can("catalog_edit") ? list : [...list.filter((x) => x.id === "quiz"), ...list.filter((x) => x.id !== "quiz")];
}

const SCALE_GUIDE = `<details class="scaleguide"><summary>How to score (anchor wines)</summary>
  <p><b>Acidity:</b> 1 soft and round, 3 balanced, 5 sharp and mouth-watering (Mosel Riesling, Muscadet).</p>
  <p><b>Body:</b> 1 light and delicate (Pinot Grigio, Beaujolais), 3 medium (Merlot, Chardonnay), 5 full and heavy (Amarone, Barossa Shiraz).</p>
  <p><b>Tannin:</b> 1 almost none (Beaujolais), 3 medium (Merlot), 5 very grippy (young Barolo, Tannat).</p>
  <p><b>Sweetness:</b> Dry unless you can taste sugar. Then Off-dry (a hint, Kabinett), Semi-sweet (Spätlese), or Dessert sweet (Sauternes, Port).</p>
  <p><b>Oak:</b> No oak (steel or concrete), Neutral oak (old or large casks, little flavor), New oak (you can notice vanilla, toast or spice).</p>
  <p><b>CO\u2082:</b> None for still, Frizzy for a light spritz, Sparkling for full bubbles.</p></details>`;
const CONF_DOTS = { high: "\u25CF\u25CF\u25CF", medium: "\u25CF\u25CF\u25CB", low: "\u25CF\u25CB\u25CB" };
// What the rules said for one dimension, shown under its control.
function ruleNote(d, x) {
  if (!x) return "";
  const shown = isChoice(d) ? choiceLabel(d, x.value) : x.value;
  return `<div class="rulenote"><span class="conf" title="${x.confidence} confidence">${CONF_DOTS[x.confidence]}</span> Rules suggest <b>${esc(String(shown))}</b>. ${esc(x.why.join("; "))}</div>`;
}
// In blind scoring every line has to be scored on purpose. A line still showing its starting value is not a score.
const touchHtml = (d, s) => {
  if (s.mode !== "blind") return "";
  const shown = isChoice(d) ? choiceLabel(d, s.values[d.key]) : s.values[d.key];
  return s.touched.has(d.key) ? `<div class="touch done">Scored</div>` : `<div class="touch">Not scored yet. <button class="link" data-editor="keep:${d.key}">Score it as ${esc(String(shown))}</button></div>`;
};
function sheetHtml(E) {
  const s = E.sheet;
  const wrap = (d) => `<div class="dimwrap">${dimControlHtml(d, { value: s.values[d.key], adjusted: true }, { attr: "data-editor", slider: "data-edim", reset: false })}<div id="touch-${d.key}">${touchHtml(d, s)}</div>${s.mode === "suggest" || s.mode === "saved" ? ruleNote(d, s.suggestion && s.suggestion.dims[d.key]) : ""}</div>`;
  const dims = `${barDims(s.style).map(wrap).join("")}<div class="qlabel" style="margin-top:12px">Sweetness and CO\u2082</div>${choiceDims(s.style).map(wrap).join("")}`;
  const banner = s.mode === "blind"
    ? `<div class="goldbanner"><b>Gold set wine.</b> Score every line from your own knowledge. The rules\' suggestion is hidden so it cannot influence you. A line you have not touched does not count: tap "Score it as" if the value shown is right.</div>`
    : s.mode === "gold-saved"
      ? `<div class="goldbanner"><b>Gold set wine.</b> Your scores are saved. The rules\' suggestion stays hidden here. See the Rule test for the comparison. Changing a score now changes the test.</div>`
      : s.mode === "suggest"
        ? `<div class="rulebanner"><b>Suggested by the rules.</b> These are starting points, not facts. Check each one against what you know, change what is wrong, then save to confirm.</div>`
        : "";
  return `<div class="overlay"><div class="sheet" id="editorPanel">
    <div class="sheethead"><div class="sheettitle"><div class="serif big">${esc(s.name)}</div><div class="muted small">${esc(s.info || "")}</div><div class="muted small">Reference structure for a ${esc(s.style === "unknown" ? "wine of another type" : ((styleInfo(s.style) || {}).label || s.style).toLowerCase() + " wine")}. A baseline, not a correct answer.</div><button class="pill infobtn" data-editor="info:${s.vintageId}">Edit wine info</button></div>
      <div class="sheetbtns"><button class="pill wine" data-editor="save"${E.saving ? " disabled" : ""}>Save</button><button class="xbtn" data-editor="close" aria-label="Close">&times;</button></div></div>
    ${banner}${dims}${SCALE_GUIDE}<div id="editorErr" class="err">${esc(E.error || "")}</div>
    <button class="btn primary" data-editor="save"${E.saving ? " disabled" : ""}>Save reference</button></div></div>`;
}

const fmtDim = (d, v) => (typeof v !== "number" ? "-" : isChoice(d) ? choiceLabel(d, v) : String(v));
// Gold set wines that an editor has scored, paired with what the rules suggest for them.
export function scoredGold(E) {
  const rows = [];
  for (const c of E.cards) {
    const g = goldInfo(c);
    const ref = E.refs.get(c.id);
    if (!g || !hasFullProfile(ref, c.style)) continue;
    rows.push({ id: c.id, name: wineName(c), group: g.group, style: c.style, editor: ref, rules: ruleValues(suggestStructure(c)) });
  }
  return rows;
}
function ruleTestCard(E) {
  const rows = scoredGold(E);
  return `<div class="pcard"><div class="ptitle">Rule test</div>
    <p class="ptext">${rows.length} of ${GOLD.length} gold set wines scored. Score them without looking at any suggestion, then see how close the rules came.</p>
    <p class="muted small">Players' rating sliders, palate and Discover deck start from these rules (version ${esc(RULES_VERSION)}) for any wine you have not scored. Your own scores always win.</p>
    <button class="btn outline slim" data-editor="ruletest"${rows.length ? "" : " disabled"}>See results</button></div>`;
}
// ---------------------------------------------------------------- Catalog: how it grows
// What the section shows, worked out from the cards, what players submitted and what editors decided before.
export function catalogView(E) {
  const rules = rulesFrom(E.cat.config);
  const g = groupSubmissions(E.cat.rows, { rules, cards: E.cards, decisions: E.cat.decisions });
  const pending = E.cards.filter((c) => c.wineStatus === "pending_review" || c.wineStatus === "draft");
  return { rules, candidates: g.candidates, waiting: g.waiting, pending, dups: duplicateGroups(E.cards) };
}
function catalogHtml(E) {
  const C = E.cat;
  if (C.error) return `<div class="err">${esc(C.error)}</div><button class="btn outline" data-editor="cat:retry">Try again</button>`;
  if (!C.loaded) return `<p class="muted">Loading…</p>`;
  const v = C.view = catalogView(E);
  const vint = (c) => c.vintages.map((x) => `${esc(x.label)} (${x.entries})`).join(", ");
  const cand = v.candidates.map((c, i) => `<div class="candrow"><div class="candinfo"><div class="serif">${esc(c.name)}${c.grape_text ? ` <span class="muted small">${esc(c.grape_text)}</span>` : ""}</div>
      <div class="meta">${c.entries} journal entries from ${c.people} ${c.people === 1 ? "person" : "people"}. Vintages: ${vint(c)}</div>
      <div class="meta">${c.kind === "new" ? "New to the catalog" : `The catalog has up to ${c.catalogNewest}; players are on a newer vintage`}${c.vintageNote ? `. ${esc(c.vintageNote)}` : ""}</div></div>
      <div class="candbtns"><button class="btn primary slim" data-editor="cat:add:${i}"${C.busy ? " disabled" : ""}>Add</button><button class="btn outline slim" data-editor="cat:not:${i}"${C.busy ? " disabled" : ""}>Not now</button></div></div>`).join("");
  const waiting = v.waiting.slice(0, 8).map((c) => `<div class="meta">${esc(c.name)}: ${c.entries} of ${c.need} entries (${c.people} ${c.people === 1 ? "person" : "people"})</div>`).join("");
  const pend = v.pending.map((c) => `<div class="candrow"><div class="candinfo"><div class="serif">${esc(wineName(c))}</div><div class="meta">${infoLine(c) ? esc(infoLine(c)) + ". " : ""}${c.wineStatus === "pending_review" ? "Waiting for review" : esc(c.wineStatus)}</div></div>
      <div class="candbtns"><button class="btn outline slim" data-editor="cat:openwine:${esc(c.id)}">Open</button></div></div>`).join("");
  const dups = v.dups.map((d, i) => `<div class="candrow"><div class="candinfo"><div class="serif">${esc(d.name)}</div>
      <div class="meta">Vintages in the deck: ${d.years.join(", ")}. Keep ${d.years[0]}, archive ${d.archive.map((c) => c.vintage).join(", ")}.</div></div>
      <div class="candbtns"><button class="btn outline slim" data-editor="cat:dedupe:${i}"${C.busy ? " disabled" : ""}>Archive older</button></div></div>`).join("");
  return `${C.msg ? `<div class="notice">${esc(C.msg)}</div>` : ""}
    <h3 class="serif">Added by players</h3>
    <p class="muted small">Wines people added to their journals that are not in the catalog. A wine is offered here once it has ${v.rules.minEntries} journal entries${v.rules.minPeople > 1 ? ` from at least ${v.rules.minPeople} people` : ""}, whatever the vintage. Adding one creates it as <b>waiting for review</b>; players see it only after you publish it.</p>
    ${cand || `<p class="muted">Nothing has reached ${v.rules.minEntries} entries yet.</p>`}
    ${waiting ? `<details class="scaleguide"><summary>Getting close (${v.waiting.length})</summary>${waiting}</details>` : ""}
    <h3 class="serif">Waiting to be published (${v.pending.length})</h3>${pend || `<p class="muted">Nothing is waiting.</p>`}
    <h3 class="serif">Same wine, different vintages (${v.dups.length})</h3>
    <p class="muted small">Only the most recent vintage of a wine goes in the deck. Older vintages are archived: they stay for the people who swiped or journaled them, but are not shown again.</p>
    ${dups || `<p class="muted">No wine has more than one vintage in the deck.</p>`}`;
}

// ---------------------------------------------------------------- Photos: real bottle photos for the Discover cards
const PHOTO_PAGE = 40;
function photosHtml(E) {
  const P = E.ph, sum = photoSummary(E.cards);
  const list = sortWines(photoList(E.cards, { filter: P.filter, query: P.q }), P.sort);
  const shown = list.slice(0, P.show);
  const chip = (id, label, n) => `<button class="chip wide ed${P.filter === id ? " on" : ""}" data-editor="phfilter:${id}">${label}${n == null ? "" : ` (${n})`}</button>`;
  const kinds = visibleKinds(E.can).map((k) => `<button class="chip wide ed${P.kind === k.id ? " on" : ""}" data-editor="phkind:${k.id}">${esc(k.label)}</button>`).join("");
  const rows = shown.map((c) => {
    const busy = P.busy === c.id;
    const thumb = c.photo ? `<img class="rowthumb" src="${esc(c.photo)}" alt="" loading="lazy">` : `<div class="rowthumb empty" aria-hidden="true"></div>`;
    const remove = c.image ? (P.confirm === c.id ? `<button class="link danger" data-editor="phremove:${esc(c.id)}">Tap again to remove</button>` : `<button class="link" data-editor="phremove:${esc(c.id)}">Remove</button>`) : "";
    const re = c.image ? null : pullSource(E.cards, c, E.can(FOUND_ONLINE_PERMISSION));
    const tag = photoTag(c);
    const reuse = re ? `<button class="link" data-editor="phreuse:${esc(c.id)}:${esc(re.id)}">Use the ${esc(re.vintage || "earlier")} photo</button>` : "";
    return `<div class="candrow photorow">${thumb}<div class="candinfo"><div class="serif">${esc(wineName(c))}</div>
      <div class="meta">${esc(infoLine(c))}${c.wineStatus && c.wineStatus !== "verified" ? " (waiting for review)" : ""}</div>
      <button class="link" data-editor="phinfo:${esc(c.id)}">Edit wine info</button>${tag ? `<div class="muted tiny">Photo: ${esc(tag)}</div>` : ""}${remove}${reuse}</div>
      <div class="candbtns"><label class="btn ${c.image ? "outline" : "primary"} slim photobtn${busy || P.busy ? " disabled" : ""}">${busy ? "Saving…" : c.image ? "Replace" : "Add photo"}<input type="file" accept="image/*" data-photofor="${esc(c.id)}"${P.busy ? " disabled" : ""} hidden></label></div></div>`;
  }).join("");
  return `${communityHtml(E.sub, E.cards)}${P.msg ? `<div class="notice">${esc(P.msg)}</div>` : ""}${P.error ? `<div class="err">${esc(P.error)}</div>` : ""}
    <div class="photoprogress"><div class="serif big">${sum.withPhoto} of ${sum.total} wines have a photo</div><div class="lbar thin"><div style="width:${sum.pct}%"></div></div></div>
    <p class="muted small">A photo saved for one vintage is also used for the other vintages of the same wine that do not have their own. Licensed and community photos take priority over everything else.${E.can(FOUND_ONLINE_PERMISSION) ? " Photos marked Found online are temporary: a licensed or community photo replaces them." : ""} A real photo makes the Discover card come alive. Stand the bottle upright, label facing the camera, on a plain background in good light. Photos are saved small (about 900 px) so they load fast.</p>
    <div class="qlabel">Where are these photos from?</div><div class="chips left grid3">${kinds}</div>
    <div class="jbar"><input class="field" data-photo-q placeholder="Search wines" value="${esc(P.q)}" autocomplete="off">
      ${sortSelectHtml("data-photo-sort", PHOTO_SORTS, P.sort, "photos")}</div>
    <div class="chips left grid3">${chip("needs", "Needs a photo", sum.without)}${chip("has", "Has a photo", sum.withPhoto)}${E.can(FOUND_ONLINE_PERMISSION) ? chip("found", "Found online", sum.found) : ""}${chip("all", "All wines", sum.total)}</div>
    ${rows || `<p class="muted">${P.filter === "needs" ? "Every wine has a photo." : "No wines match."}</p>`}
    ${list.length > shown.length ? `<button class="btn outline" data-editor="phmore">Show more (${list.length - shown.length} left)</button>` : ""}`;
}

function listHtml(E) {
  if (E.loadError) return `<div class="err">${esc(E.loadError)}</div><button class="btn outline" data-editor="retry">Try again</button>`;
  if (!E.loaded) return `<p class="muted">Loading the catalog…</p>`;
  const done = E.cards.filter((c) => hasFullProfile(E.refs.get(c.id), c.style)).length;
  let list = editorList(E.cards, E.refs, { q: E.q, filter: E.filter === "gold" ? "all" : E.filter });
  if (E.filter === "gold") list = list.filter((c) => goldInfo(c));
  list = sortWines(list, E.sort);
  const rows = list.map((c) => {
    const has = hasFullProfile(E.refs.get(c.id), c.style);
    const gold = goldInfo(c);
    return `<button class="jrow" data-editor="open:${c.id}"><span class="jl"><span class="iname"><span class="serif trunc">${esc(wineName(c))}</span>${marksHtml(c, 16)}</span>
      <span class="meta trunc">${gold ? '<span class="goldtag">Gold set</span> ' : ""}${esc(infoLine(c))}</span></span>
      <span class="pill${has ? "" : " dark"}">${has ? "Edit" : "Set"}</span></button>`;
  }).join("");
  const empty = E.filter === "needs" ? "Every wine has a profile." : "No wines match.";
  return `${ruleTestCard(E)}<div class="jmeta"><span>${done} of ${E.cards.length} wines have a profile</span></div>${rows || `<p class="muted">${empty}</p>`}`;
}

// The Rule test screen: how close the rules came to what editors scored on the gold set.
function testHtml(E) {
  const rows = scoredGold(E);
  const all = evaluateRules(rows);
  const verdictClass = (v) => (v === "good" ? "vgood" : v === "ok" ? "vok" : "vbad");
  const groupBlock = (grp) => {
    const sub = rows.filter((r) => r.group === grp.id);
    if (!sub.length) return `<div class="pcard"><div class="ptitle">${esc(grp.title)}</div><p class="muted small">${esc(grp.note)} No wines scored in this group yet.</p></div>`;
    const res = evaluateRules(sub);
    const lines = Object.entries(res).map(([k, r]) => {
      const name = k === "co2" ? "CO\u2082" : k.charAt(0).toUpperCase() + k.slice(1);
      return r.kind === "scale"
        ? `<div class="kv"><span>${name}</span><span><span class="${verdictClass(r.verdict)}">${r.verdict}</span> &nbsp; avg error ${r.mae.toFixed(2)}, within 0.5: ${Math.round(r.within05 * 100)}%</span></div>`
        : `<div class="kv"><span>${name}</span><span><span class="${verdictClass(r.verdict)}">${r.verdict}</span> &nbsp; ${r.right} of ${r.n} exactly right</span></div>`;
    }).join("");
    return `<div class="pcard"><div class="ptitle">${esc(grp.title)} (${sub.length} wines)</div><p class="muted small">${esc(grp.note)}</p>${lines}</div>`;
  };
  const wineCards = rows.map((r) => {
    const dims = dimsFor(r.style).map((d) => {
      const e = r.editor[d.key], x = r.rules[d.key];
      const off = isChoice(d) ? e !== x : Math.abs(e - x) >= 1;
      return `<div class="cmp${off ? " off" : ""}"><span>${d.name}</span><span>${esc(fmtDim(d, e))} / ${esc(fmtDim(d, x))}</span></div>`;
    }).join("");
    return `<div class="pcard"><div class="small muted">${esc((GROUPS.find((g) => g.id === r.group) || {}).title || r.group)}</div><div class="serif" style="font-size:16px">${esc(r.name)}</div>
      <div class="muted tiny">You / rules. Highlighted when they differ by a point or more.</div><div class="cmpgrid">${dims}</div></div>`;
  }).join("");
  const text = reportText(all, rows);
  return `<div class="overlay"><div class="sheet" id="testPanel">
    <div class="sheethead"><div class="sheettitle"><div class="serif big">Rule test</div><div class="muted small">Rules version ${esc(RULES_VERSION)}. ${rows.length} of ${GOLD.length} gold wines scored.</div></div>
      <div class="sheetbtns"><button class="xbtn" data-editor="testclose" aria-label="Close">&times;</button></div></div>
    <p class="muted small">Targets: average error of 0.6 or less on the sliders is good, 0.8 is ok. For sweetness and oak, 75% exactly right is good and 60% is ok. For CO\u2082, 85% and 70%.${rows.length < GOLD.length ? " Results are rough until all " + GOLD.length + " are scored." : ""}</p>
    ${GROUPS.map(groupBlock).join("")}
    <div class="pcard"><div class="ptitle">Share these results</div><textarea class="field" rows="6" readonly id="testText">${esc(text)}</textarea>
      <button class="btn outline slim" data-editor="copytest">Copy results</button></div>
    <h3 class="psub">Wine by wine</h3>${wineCards}</div></div>`;
}

// ctx: { sb(), userId(), cards(), can(permission), roleLabel(), onSaved(), onWineChanged() }
export function createEditor(ctx) {
  const can = (p) => !!(ctx.can && ctx.can(p));
  const E = { can, sort: "producer", sub: { loaded: false, loading: false, error: "", items: [], busy: null, msg: "" }, section: (sectionsFor(can)[0] || { id: "structure" }).id, loaded: false, loadError: null, cards: [], refs: new Map(), rows: [], vintageToWine: new Map(), q: "", filter: "needs", sheet: null, saving: false, error: "",
    ph: { sort: "default", filter: "needs", q: "", kind: "own_photography", show: PHOTO_PAGE, busy: null, confirm: null, msg: "", error: "" },
    cat: { loaded: false, loading: false, error: "", rows: [], config: [], decisions: [], busy: false, msg: "", view: null } };
  let root = null;
  const overlay = () => document.querySelector("#overlay");
  const review = createReview({
    sb: ctx.sb, userId: ctx.userId, cards: ctx.cards,
    onChange: () => {
      const f = document.querySelector("[data-editor='sec:flags']"); if (f) f.textContent = flagsLabel();
      const k = document.querySelector("[data-editor='sec:feedback']"); if (k) k.textContent = feedbackLabel();
    },
    // "Open question" on a flag: switch to the Quiz section and open that question once it has loaded.
    // "Edit wine info" on a wine flag opens the same wine info form as the structure sheet.
    editWine: (id) => { const card = E.cards.find((c) => c.id === id); if (card) openInfo(card); },
    gotoQuiz: (id) => { review.leave(); E.section = "quiz"; draw(); const wait = setInterval(() => { if (review.state.loaded) { clearInterval(wait); review.openQuestion(id); } }, 50); setTimeout(() => clearInterval(wait), 5000); },
  });
  const wineinfo = createWineInfo({
    sb: ctx.sb, userId: ctx.userId, can,
    onSaved: async () => { if (ctx.onWineChanged) await ctx.onWineChanged(); E.cards = ctx.cards(); E.loaded = false; if (root && E.section === "structure") draw(); else if (root && E.section === "photos") drawPhotos(); },
    onDeleted: async () => { if (ctx.onWineChanged) await ctx.onWineChanged(); E.cards = ctx.cards(); E.loaded = false; if (root) draw(); },
    cards: ctx.cards, photoKind: () => E.ph.kind,
    onPhotoSaved: async () => { if (ctx.onWineChanged) await ctx.onWineChanged(); E.cards = ctx.cards(); if (root && E.section === "photos") drawPhotos(); },
    onPublished: async (r) => {
      if (ctx.onWineChanged) await ctx.onWineChanged();
      E.cards = ctx.cards(); E.loaded = false; E.cat.loaded = false; E.cat.msg = publishedMessage(r);
      if (root) draw();
    },
  });
  const publishedMessage = (r) => { const s = publishSummary(r.plan, r.selfId); return `Published ${r.name}. ${s.lines.join(" ")}`; };
  const flagsLabel = () => { const n = review.openFlags; return n ? `Flags (${n})` : "Flags"; };
  const feedbackLabel = () => { const n = review.newFeedback; return n ? `Feedback (${n})` : "Feedback"; };

  const showError = (msg) => { E.openError = msg; const el = document.getElementById("editorOpenErr"); if (el) el.textContent = msg; };
  const openInfo = (card) => { showError(""); return wineinfo.open(card, wineName(card)).catch((e) => { showError("Could not open wine info: " + (e.message || e)); const o = overlay(); if (o) o.innerHTML = ""; }); };
  const chips = () => `${ctx.roleLabel && ctx.roleLabel() ? `<div class="muted small" style="margin:2px 0 6px">Your access: <b>${esc(ctx.roleLabel())}</b></div>` : ""}<div id="editorOpenErr" class="err">${esc(E.openError || "")}</div><div class="chips left edtabs">${sectionsFor(can).map((x) => `<button class="chip wide ed${E.section === x.id ? " on" : ""}" data-editor="sec:${x.id}">${x.id === "flags" ? flagsLabel() : x.id === "feedback" ? feedbackLabel() : x.label}</button>`).join("")}</div>`;
  const structureShell = () => `<div class="jbar"><input class="field" data-editor-q placeholder="Search wines" value="${esc(E.q)}" autocomplete="off">
      ${sortSelectHtml("data-editor-sort", STRUCTURE_SORTS, E.sort, "structure")}
      <div class="chips left"><button class="chip wide${E.filter === "needs" ? " on" : ""}" data-editor="filter:needs">Needs a profile</button><button class="chip wide${E.filter === "all" ? " on" : ""}" data-editor="filter:all">All wines</button><button class="chip wide${E.filter === "gold" ? " on" : ""}" data-editor="filter:gold">Gold set</button></div></div>
    <div id="editorList"></div>`;
  const drawList = () => { const el = document.querySelector("#editorList"); if (el) el.innerHTML = listHtml(E); };
  function draw() {
    if (!root) return;
    root.innerHTML = `${chips()}<div id="editorSection" style="margin-top:10px"></div>`;
    const sec = document.querySelector("#editorSection");
    if (E.section === "structure") { sec.innerHTML = structureShell(); if (!E.loaded) load(); else { E.cards = ctx.cards(); drawList(); } }
    else if (E.section === "photos") { E.cards = ctx.cards(); if (!visibleKinds(can).some((k) => k.id === E.ph.kind)) E.ph.kind = "own_photography"; if (E.ph.filter === "found" && !can(FOUND_ONLINE_PERMISSION)) E.ph.filter = "needs"; if (!E.sub.loaded && !E.sub.loading) loadSubs(); sec.innerHTML = `<div id="photosBody">${photosHtml(E)}</div>`; }
    else if (E.section === "catalog") { E.cards = ctx.cards(); sec.innerHTML = `<div id="catalogBody">${catalogHtml(E)}</div>`; if (!E.cat.loaded && !E.cat.loading) loadCatalog(); }
    else review.mount(sec, E.section);
  }

  const drawCatalog = () => { const el = document.querySelector("#catalogBody"); if (el) el.innerHTML = catalogHtml(E); };
  async function loadCatalog() {
    const C = E.cat; C.loading = true; C.error = "";
    try { const r = await db.loadCatalogInputs(ctx.sb()); C.rows = r.rows; C.config = r.config; C.decisions = r.decisions; C.loaded = true; }
    catch (e) { C.error = "Could not load: " + (e.message || e); }
    C.loading = false; drawCatalog();
  }
  // Adds a candidate (pending review), refreshes the catalog and opens its wine info so the editor can complete it.
  async function catalogAdd(cand) {
    const C = E.cat; C.busy = true; C.msg = ""; drawCatalog();
    try {
      const lists = await db.loadEditorLists(ctx.sb());
      const vid = await db.addCatalogWine(ctx.sb(), ctx.userId(), planPromotion(cand, lists));
      if (ctx.onWineChanged) await ctx.onWineChanged();
      E.cards = ctx.cards();
      C.msg = `${cand.name} was added and is waiting for review. Fill in its place and details, then publish it.`;
      await loadCatalog();
      const card = E.cards.find((c) => c.id === vid);
      C.busy = false; drawCatalog();
      if (card) openInfo(card);
    } catch (e) { C.busy = false; C.error = "Could not add it. " + (e.message || e); drawCatalog(); }
  }
  async function catalogDismiss(cand) {
    const C = E.cat; C.busy = true; drawCatalog();
    try { await db.dismissCandidate(ctx.sb(), ctx.userId(), cand.key, cand.entries); await loadCatalog(); } catch (e) { C.error = "Could not save that. " + (e.message || e); }
    C.busy = false; drawCatalog();
  }
  async function catalogDedupe(group) {
    const C = E.cat; C.busy = true; C.msg = ""; drawCatalog();
    try {
      await db.archiveVintages(ctx.sb(), group.archive.map((c) => c.id), group.keep.id);
      if (ctx.onWineChanged) await ctx.onWineChanged();
      E.cards = ctx.cards(); E.loaded = false;
      C.msg = `${group.name}: kept ${group.years[0]}, archived ${group.archive.map((c) => c.vintage).join(", ")}.`;
    } catch (e) { C.error = "Could not archive. " + (e.message || e); }
    C.busy = false; drawCatalog();
  }
  const drawPhotos = () => { const el = document.querySelector("#photosBody"); if (el) { const q = el.querySelector("[data-photo-q]"); const keep = q && document.activeElement === q ? q.selectionStart : null; el.innerHTML = photosHtml(E); if (keep != null) { const n = el.querySelector("[data-photo-q]"); n.focus(); n.setSelectionRange(keep, keep); } } };
  async function photoAdd(id, file) {
    const P = E.ph, card = E.cards.find((c) => c.id === id);
    if (!card || !file || P.busy) return;
    if (P.kind === "found_online" && !can(FOUND_ONLINE_PERMISSION)) { P.error = "Only the owner can add photos found online. Choose another source."; drawPhotos(); return; }
    P.busy = id; P.msg = ""; P.error = ""; P.confirm = null; drawPhotos();
    try {
      await uploadWinePhoto(ctx.sb(), id, file, P.kind);
      // E.cards still describes the wines before this upload, which is what the sharing rule needs.
      const share = await shareWinePhoto(ctx.sb(), E.cards, id, P.kind, { canFound: can(FOUND_ONLINE_PERMISSION) });
      if (ctx.onWineChanged) await ctx.onWineChanged();
      E.cards = ctx.cards();
      P.msg = `${wineName(card)}: photo saved.${shareNote(share.done)}`;
      if (share.failed.length) P.error = `Saved, but ${share.failed.length} other ${share.failed.length === 1 ? "vintage" : "vintages"} could not get it: ${share.failed[0].message}`;
    } catch (e) { P.error = `${wineName(card)}: ${e.message || e}`; }
    P.busy = null; drawPhotos();
  }
  async function loadSubs() {
    const S = E.sub; S.loading = true; S.error = "";
    const r = await loadSubmissionState(ctx.sb());
    S.loaded = r.loaded; S.error = r.error; S.items = r.items; S.loading = false;
    if (E.section === "photos") drawPhotos();
  }
  async function subApprove(id) {
    const S = E.sub, item = S.items.find((x) => x.id === id), card = item && E.cards.find((c) => c.id === item.wine_vintage_id);
    if (!item || !card || S.busy) return;
    S.busy = id; S.msg = ""; S.error = ""; drawPhotos();
    try {
      const plan = approvalPlan(card.imageKind);
      await db.approveSubmission(ctx.sb(), item, plan.replaces);
      // E.cards still describes the wines before this approval, which is what the sharing rule needs.
      const share = plan.replaces ? await shareWinePhoto(ctx.sb(), E.cards, card.id, "verified_user", { canFound: can(FOUND_ONLINE_PERMISSION) }) : { done: [], failed: [] };
      S.items = S.items.filter((x) => x.id !== id);
      if (ctx.onWineChanged) await ctx.onWineChanged();
      E.cards = ctx.cards();
      S.msg = `${wineName(card)}: ${plan.replaces ? "the community photo is now on the card." : "approved. The licensed photo stays on the card."}${shareNote(share.done)}`;
      if (share.failed.length) S.error = `Approved, but ${share.failed.length} other ${share.failed.length === 1 ? "vintage" : "vintages"} could not get it: ${share.failed[0].message}`;
    } catch (e) { S.error = `${wineName(card)}: ${e.message || e}`; }
    S.busy = null; drawPhotos();
  }
  async function subReject(id) {
    const S = E.sub, item = S.items.find((x) => x.id === id);
    if (!item || S.busy) return;
    S.busy = id; S.msg = ""; S.error = ""; drawPhotos();
    try { await db.rejectSubmission(ctx.sb(), id); S.items = S.items.filter((x) => x.id !== id); S.msg = "Photo rejected. The player is not told, and it is never shown."; }
    catch (e) { S.error = String(e.message || e); }
    S.busy = null; drawPhotos();
  }
  async function photoReuse(id, fromId) {
    const P = E.ph, card = E.cards.find((c) => c.id === id), from = E.cards.find((c) => c.id === fromId);
    if (!card || !from || P.busy) return;
    P.busy = id; P.msg = ""; P.error = ""; P.confirm = null; drawPhotos();
    try {
      await reuseWinePhoto(ctx.sb(), fromId, id, from.vintage);
      if (ctx.onWineChanged) await ctx.onWineChanged();
      E.cards = ctx.cards();
      P.msg = `${wineName(card)}: now uses the ${from.vintage || "earlier"} photo.`;
    } catch (e) { P.error = `${wineName(card)}: ${e.message || e}`; }
    P.busy = null; drawPhotos();
  }
  async function photoRemove(id) {
    const P = E.ph, card = E.cards.find((c) => c.id === id);
    if (!card || P.busy) return;
    if (P.confirm !== id) { P.confirm = id; drawPhotos(); return; }
    P.busy = id; P.confirm = null; P.msg = ""; P.error = ""; drawPhotos();
    try { await removeWinePhoto(ctx.sb(), id); if (ctx.onWineChanged) await ctx.onWineChanged(); E.cards = ctx.cards(); P.msg = `${wineName(card)}: photo removed.`; }
    catch (e) { P.error = `${wineName(card)}: ${e.message || e}`; }
    P.busy = null; drawPhotos();
  }
  async function load() {
    E.loadError = null; E.loaded = false; drawList();
    try {
      const [vintageToWine, rows] = await Promise.all([db.loadVintageWines(ctx.sb()), db.loadReferenceRows(ctx.sb())]);
      E.cards = ctx.cards(); E.rows = rows; E.vintageToWine = vintageToWine;
      E.refs = refsByVintage(vintageToWine, rows);
      E.loaded = true;
    } catch (e) { E.loadError = "Could not load the catalog: " + (e.message || e); }
    drawList();
  }
  function syncSheet() {
    const s = E.sheet;
    if (!s) return;
    dimsFor(s.style).forEach((d) => {
      if (isChoice(d)) syncChoiceControl(d, { value: s.values[d.key], adjusted: true }, "data-editor");
      else {
        const r = document.querySelector(`[data-edim="${d.key}"]`);
        if (r && Number(r.value) !== s.values[d.key]) r.value = s.values[d.key];
      }
    });
    if (s.mode === "blind") dimsFor(s.style).forEach((d) => { const el = document.getElementById("touch-" + d.key); if (el) el.innerHTML = touchHtml(d, s); });
    document.querySelectorAll("[data-editor='save']").forEach((b) => { b.disabled = E.saving; });
    const err = document.getElementById("editorErr");
    if (err) err.textContent = E.error || "";
  }
  async function save() {
    const s = E.sheet;
    if (!s || E.saving) return;
    if (s.mode === "blind") {
      const left = dimsFor(s.style).filter((d) => !s.touched.has(d.key)).map((d) => d.name);
      if (left.length) { E.error = `Score every line first. Still to score: ${left.join(", ")}.`; syncSheet(); return; }
    }
    E.saving = true; E.error = ""; syncSheet();
    try {
      await db.saveReferences(ctx.sb(), ctx.userId(), s.wineId, s.values, E.rows);
      await load();
      if (ctx.onSaved) await ctx.onSaved();   // the app reloads its copy so rating sliders use the new values right away
      E.saving = false; E.sheet = null; overlay().innerHTML = "";
    } catch (e) {
      E.saving = false; E.error = "Could not save: " + (e.message || e); syncSheet();
    }
  }

  document.addEventListener("click", (ev) => {
    const t = ev.target.closest("[data-editor]");
    if (!t || (!root && !E.sheet && !document.getElementById("testPanel"))) return;
    const [action, a, b] = t.dataset.editor.split(":");
    if (action === "sec") { if (E.section !== a) { E.openError = ""; review.leave(); E.sheet = null; overlay().innerHTML = ""; E.section = a; draw(); } }
    else if (action === "filter") { E.filter = a; draw(); }
    else if (action === "phfilter") { E.ph.filter = a; E.ph.show = PHOTO_PAGE; E.ph.confirm = null; drawPhotos(); }
    else if (action === "phkind") { E.ph.kind = a; drawPhotos(); }
    else if (action === "phmore") { E.ph.show += PHOTO_PAGE; drawPhotos(); }
    else if (action === "phremove") photoRemove(a);
    else if (action === "phinfo") { const card = E.cards.find((c) => c.id === a); if (card) openInfo(card); }
    else if (action === "phreuse") photoReuse(a, b);
    else if (action === "subok") subApprove(a);
    else if (action === "subno") subReject(a);
    else if (action === "subretry") { E.sub.loaded = false; E.sub.error = ""; loadSubs(); }
    else if (action === "cat") {
      const v = E.cat.view;
      if (a === "retry") { E.cat.loaded = false; E.cat.error = ""; draw(); }
      else if (a === "add" && v && v.candidates[Number(b)] && !E.cat.busy) catalogAdd(v.candidates[Number(b)]);
      else if (a === "not" && v && v.candidates[Number(b)] && !E.cat.busy) catalogDismiss(v.candidates[Number(b)]);
      else if (a === "dedupe" && v && v.dups[Number(b)] && !E.cat.busy) catalogDedupe(v.dups[Number(b)]);
      else if (a === "openwine") { const card = E.cards.find((c) => c.id === b); if (card) openInfo(card); }
    }
    else if (action === "retry") load();
    else if (action === "open") {
      const card = E.cards.find((c) => c.id === a);
      const cur = E.refs.get(a) || {};
      const hasRef = hasFullProfile(cur, card.style);
      const gold = goldInfo(card);
      const suggestion = gold ? null : suggestStructure(card);   // gold set wines never show a suggestion, so scoring stays blind
      const startFor = (d) => (typeof cur[d.key] === "number" ? clampDimValue(d, cur[d.key]) : suggestion ? clampDimValue(d, suggestion.dims[d.key].value) : defaultFor(d, card.style));
      E.sheet = {
        vintageId: a, wineId: E.vintageToWine.get(a), name: wineName(card), info: infoLine(card), style: card.style, suggestion,
        mode: gold ? (hasRef ? "gold-saved" : "blind") : hasRef ? "saved" : "suggest", touched: new Set(),
        values: Object.fromEntries(dimsFor(card.style).map((d) => [d.key, startFor(d)])),
      };
      E.error = ""; overlay().innerHTML = sheetHtml(E);
    }
    else if (action === "nudge") { E.sheet.values[a] = clampDimValue(dimMeta(a), E.sheet.values[a] + Number(b)); E.sheet.touched.add(a); syncSheet(); }
    else if (action === "choice") { E.sheet.values[a] = Number(b); E.sheet.touched.add(a); syncSheet(); }
    else if (action === "sweet") { if (E.sheet.values[a] === 0) E.sheet.values[a] = 1; E.sheet.touched.add(a); syncSheet(); }
    else if (action === "info") {
      const card = E.cards.find((c) => c.id === a);
      E.sheet = null;
      openInfo(card);
    }
    else if (action === "keep") { E.sheet.touched.add(a); syncSheet(); }
    else if (action === "save") save();
    else if (action === "close") { E.sheet = null; overlay().innerHTML = ""; }
    else if (action === "ruletest") overlay().innerHTML = testHtml(E);
    else if (action === "testclose") overlay().innerHTML = "";
    else if (action === "copytest") {
      const box = document.getElementById("testText");
      if (!box) return;
      const done = () => { t.textContent = "Copied"; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(box.value).then(done, () => { box.select(); t.textContent = "Selected: copy it"; });
      else { box.select(); t.textContent = "Selected: copy it"; }
    }
  });
  document.addEventListener("input", (ev) => {
    const t = ev.target;
    if (t.dataset && t.dataset.edim && E.sheet) { E.sheet.values[t.dataset.edim] = clampDimValue(dimMeta(t.dataset.edim), Number(t.value)); E.sheet.touched.add(t.dataset.edim); syncSheet(); }
    else if (t.dataset && t.dataset.editorQ !== undefined) { E.q = t.value; drawList(); }
    else if (t.dataset && t.dataset.photoQ !== undefined) { E.ph.q = t.value; E.ph.show = PHOTO_PAGE; drawPhotos(); }
    else if (t.dataset && t.dataset.editorSort !== undefined) { E.sort = t.value; drawList(); }
    else if (t.dataset && t.dataset.photoSort !== undefined) { E.ph.sort = t.value; E.ph.show = PHOTO_PAGE; drawPhotos(); }
  });
  // A picture chosen (or taken) for a wine in the Photos list.
  document.addEventListener("change", (ev) => {
    const t = ev.target;
    if (t && t.dataset && t.dataset.photofor && root) { const f = t.files && t.files[0]; t.value = ""; photoAdd(t.dataset.photofor, f); }
  });

  return {
    state: E, review,
    mount(el) { root = el; const ok = sectionsFor(can); if (ok.length && !ok.some((x) => x.id === E.section)) E.section = ok[0].id; draw(); },
    leave() { root = null; review.leave(); E.sheet = null; const o = overlay(); if (o) o.innerHTML = ""; },
  };
}

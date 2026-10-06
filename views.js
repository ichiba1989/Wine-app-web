// Screens. Every function here takes data and returns an HTML string; nothing touches the network.
import {
  FAMILIARITY, FLAGS, VERDICTS, isChoice, GROUPS, GROUP_PAGE, SORTS, YEARS,
  esc, wineName, entryCard, entryName, verdictShort, groupEntries, filterEntries, sortCards,
  WINE_FLAG_REASONS, photoCount, WINE_STYLES, barDims, choiceDims } from "./logic.js?v=10";
import { splitGrapeParts, splitPlace } from "./blends.js?v=1";
import { infoLine, entryInfoLine } from "./wineline.js?v=1";
import { flavorsForCard, placeFor } from "./flavors.js?v=1";
import { bottleSilhouette, flavorRowHtml, tintFor } from "./visuals.js?v=2";
import { countryMapSvg, zoomPlan } from "./maps.js?v=3";
import { imageSearchUrl } from "./winelinks.js?v=1";

// The grape and place inputs shared by the two forms. The form keeps one grape text and one place text; these show them as
// "main varietal" and "other varietals (if blended)", and as "country" and "region". app.js puts them back together as you type.
// scope is "form" (Add a wine) or "wef" (Change wine info), so the right text is filled.
function grapeAndPlaceInputs(form, scope) {
  const g = splitGrapeParts(form.grape), p = splitPlace(form.region);
  const tidy = `autocomplete="off" autocapitalize="words" spellcheck="false"`;
  return `<div class="qlabel">Main varietal</div>
    <input class="field" data-gmain data-pscope="${scope}" data-grapes="single" placeholder="The grape on the label (only if you know). GSM works" value="${esc(g.main)}" ${tidy}>
    <div class="qlabel">Other varietals (if blended)</div>
    <input class="field" data-gother data-pscope="${scope}" data-grapes="multi" placeholder="Other grapes in the blend, separated by commas" value="${esc(g.other)}" ${tidy}>
    <div class="qlabel">Country</div>
    <input class="field" data-pcountry data-pscope="${scope}" placeholder="Only if you know" value="${esc(p.country)}" autocomplete="off">
    <div class="qlabel">Region</div>
    <input class="field" data-pregion data-pscope="${scope}" placeholder="For example Piedmont, or Barolo, Piedmont" value="${esc(p.region)}" autocomplete="off">`;
}

// ---------------------------------------------------------------- drawings
// Country flag and a red / white / sparkling symbol. Rose, fortified and unknown styles have no symbol yet.
export function marksHtml(card, size = 26) {
  const symbol = ["red", "white", "sparkling"].includes(card.style) ? card.style : null;
  const flag = FLAGS[card.country];
  if (!flag && !symbol) return "";
  let mark = "";
  if (symbol === "sparkling") {
    mark = `<svg width="${size}" height="${size}" viewBox="0 0 32 36"><path d="M11 4 h10 l-1 14 c-.4 5 -1.6 7 -4 7 s-3.6 -2 -4 -7 z" fill="#E8D9A0" stroke="#8C7530" stroke-width="1.5" stroke-linejoin="round"/><path d="M16 25 v7 M11 33 h10" stroke="#8C7530" stroke-width="1.5" stroke-linecap="round"/><circle cx="14.5" cy="15" r="1.1" fill="#8C7530"/><circle cx="17.5" cy="11" r="1" fill="#8C7530"/><circle cx="16" cy="19" r=".9" fill="#8C7530"/><circle cx="26" cy="9" r="1.4" fill="none" stroke="#8C7530"/><circle cx="6" cy="14" r="1.2" fill="none" stroke="#8C7530"/></svg>`;
  } else if (symbol) {
    const fill = symbol === "white" ? "#C9D27A" : "#5B1030", edge = symbol === "white" ? "#8A9A3A" : "#3A0A1F";
    const berries = [[8, 12], [16, 12], [24, 12], [12, 20], [20, 20], [16, 28]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5" fill="${fill}" stroke="${edge}"/>`).join("");
    mark = `<svg width="${size}" height="${size}" viewBox="0 0 32 36"><path d="M16 2 C16 6 18 8 22 8" stroke="#4E6B3A" stroke-width="2" fill="none" stroke-linecap="round"/>${berries}</svg>`;
  }
  return `<span class="marks">${flag ? `<span class="flag" style="font-size:${size}px">${flag}</span>` : ""}${mark}</span>`;
}

// A small picture next to a wine name, when the user added a photo to its journal entry.
export const thumbHtml = (urls, path, size = 40) => (path && urls && urls.get(path) ? `<img class="thumb" src="${esc(urls.get(path))}" alt="Your photo" width="${size}" height="${size}">` : "");

// A small picture of the catalog bottle, when the wine has a bottle photo. Used in the Swipes and Journal lists only: the Discover card never shows photos.
export const bottleThumbHtml = (card, size = 40) => (card && card.photo ? `<img class="thumb bottle" src="${esc(card.photo)}" alt="Bottle of ${esc(wineName(card))}" width="${size}" height="${size}" loading="lazy" decoding="async">` : "");

// ---------------------------------------------------------------- Discover
// What the card draws for a wine that is not a photo: a bottle shaped by its grape and tinted by its type, a map of its country with a pin,
// and six flavors. Nothing here uses a label, a logo or a picture of a real bottle. stats is null until players have written enough about the wine.
export function visualFor(c, stats = null) {
  try {
    const fl = flavorsForCard(c, stats), place = placeFor(c), plan = zoomPlan(c);
    return { shape: fl.shape, type: fl.type, flavors: fl.picks, map: countryMapSvg(c.country, place, fl.type, 64), zoomable: !!plan };
  } catch (e) { return { shape: "bordeaux", type: c.style, flavors: [], map: "", zoomable: false }; }   // a card that cannot be read still shows its name and facts
}
// The card, top to bottom: the producer and the wine's name at the same large size (the producer matters as much as the wine) with the year beside
// the producer, a one-line summary (type and place), then one soft tinted panel holding an abstract bottle, the six flavors and the map, and last the facts in small type.
// A wine with no separate wine name shows just the producer. The name is a link to a Google image search for that wine
// (winelinks.js); wine info is not edited from the deck. The card never shows a bottle photo.
export function cardHtml(c) {
  const labels = ["recognize", "unknown", "had"].map((k) => `<div class="swipe-label" data-label="${k}" style="background:${FAMILIARITY[k].color}">${esc(FAMILIARITY[k].label)}</div>`).join("");
  const v = visualFor(c), href = imageSearchUrl(c), t = tintFor(v.type);
  const map = v.map ? `<${v.zoomable ? "button" : "div"} class="mapbtn${v.zoomable ? "" : " still"}"${v.zoomable ? ` data-zoom="${esc(c.id)}" aria-label="Show where this wine is from"` : ""}>${v.map}${v.zoomable ? '<span class="badge" aria-hidden="true">+</span>' : ""}</${v.zoomable ? "button" : "div"}>` : "";
  const place = c.appellation || c.region || c.country || "";
  const flag = FLAGS[c.country];
  const summary = [t.label !== "Other" ? esc(t.label) : "", place ? `${flag ? `<span class="flag">${flag}</span> ` : ""}${esc(place)}` : ""].filter(Boolean).join(" · ");
  const facts = c.facts.filter((f) => f.text !== place);   // the place is already in the summary line
  return `<div class="card" id="card">${labels}
    <div class="body">
      <a class="winelink" data-wimg href="${esc(href)}" target="_blank" rel="noopener noreferrer" draggable="false" aria-label="Search Google Images for ${esc(wineName(c))}">
        <div class="topline"><div class="producer serif">${esc(c.producer)}</div>${c.vintage ? `<span class="vpill">${esc(c.vintage)}</span>` : ""}</div>
        ${c.cuvee ? `<div class="title serif">${esc(c.cuvee)}</div>` : ""}</a>
      ${summary ? `<div class="metaline"><span class="tdot" style="background:${t.dot}"></span><span>${summary}</span></div>` : ""}
      <div class="visrow" style="background:${t.pin}1a">${bottleSilhouette(v.shape, v.type)}${flavorRowHtml(v.flavors)}${map}</div>
      <div class="facts">${facts.map((f) => `<span class="${f.derived ? "derived" : ""}">${esc(f.text)}</span>`).join("")}</div>
    </div></div>`;
}
export function discoverHtml({ deck, interest, banner, counts, feedback = false, flaggedId = null, nudge = false }) {
  const bannerHtml = banner ? `<div class="banner" data-action="dismiss">${esc(banner)} (tap to dismiss)</div>` : "";
  if (!deck.length) {
    return `${bannerHtml}<div class="center"><div class="serif" style="font-size:22px">No more wines to show.</div>
      <div class="muted">If you expected some, check that the sample wines were published for testing.</div></div>`;
  }
  // The card, its button row and the save-your-journal reminder are one block, centred between the header and the tab bar, so the space is even above and below.
  return `${bannerHtml}<div class="deckstage">
    <div class="cardwrap">${deck.length > 1 ? '<div class="behind"></div>' : ""}${cardHtml(deck[0])}</div>
    <div class="belowcard"><button class="notint" data-action="notint" aria-pressed="false" aria-label="Not interested in this wine">Not interested</button>${feedback ? `<span class="fbline">${flaggedId === deck[0].id ? '<span class="muted">Thanks, an editor will review it.</span>' : '<button class="link" data-action="wineflag" aria-label="Report a problem with this wine">Report a problem</button>'}</span>` : ""}</div>
    ${nudge ? `<div class="nudge"><b>Don't lose your journal.</b> Save it with an email so it follows you to any phone.
      <div class="nudgeacts"><button class="btn primary slim" data-account="open:save">Save with email</button><button class="link" data-action="nudgeoff">Not now</button></div></div>` : ""}</div>`;
}

// ---------------------------------------------------------------- Swipes
const sortSelect = (id, value) =>
  `<select class="sortsel" data-sort="${id}" aria-label="Sort this list by">${SORTS.map((s) => `<option value="${s.id}"${s.id === value ? " selected" : ""}>Sort by: ${s.label}</option>`).join("")}</select>`;

function section(id, title, count, open, inner) {
  return `<div class="sect"><button class="sect-head" data-action="toggle:${id}" aria-expanded="${open}"><span>${esc(title)} (${count})</span><span class="chev">${open ? "▲" : "▼"}</span></button>${open ? `<div class="sect-body">${inner}</div>` : ""}</div>`;
}
function item(card, actions, extra = "", thumb = "") {
  actions += `<button class="delsmall" data-action="delswipe:${card.id}" aria-label="Delete this swipe">Delete</button>`;
  const where = infoLine(card);   // varietal, vineyard, appellation, region, country: up to three, most important first
  return `<div class="item withthumb">${thumb}<div class="ibody"><div class="iname"><button class="namebtn serif" data-action="wineinfo:${esc(card.id)}" aria-label="Change wine info for ${esc(wineName(card))}">${esc(wineName(card))} <span class="ed" aria-hidden="true">&#9998;</span></button>${marksHtml(card, 16)}</div>
    <div class="meta">${esc(where)}${extra}</div><div class="acts">${actions}</div></div></div>`;
}
const pill = (action, label, dark) => `<button class="pill${dark ? " dark" : ""}" data-action="${action}">${esc(label)}</button>`;

export function swipesHtml(lists, sw, photoUrls) {
  const sortOf = (id) => sw.sort[id] || "recent";
  const listBody = (id, cards, actionsFor) => {
    if (!cards.length) return `<div class="muted small">Nothing here yet.</div>`;
    const sorted = sortCards(cards, sortOf(id), lists.order);
    return (cards.length > 1 ? sortSelect(id, sortOf(id)) : "") + sorted.map((c) => item(c, actionsFor(c), "", bottleThumbHtml(c))).join("");
  };
  const review = (c) => pill(`review:${c.id}`, "Review the wine", true);
  const parts = [];
  const isOpen = (id) => !!sw.open[id];
  parts.push(section("rec", "Recognized", lists.rec.length, isOpen("rec"),
    listBody("rec", lists.rec, (c) => review(c) + pill(`setint:${c.id}:nope`, "Not interested"))));
  parts.push(section("unk", "Don't know it", lists.unk.length, isOpen("unk"),
    listBody("unk", lists.unk, (c) => review(c) + pill(`setint:${c.id}:nope`, "Not interested"))));
  parts.push(section("notint", "Not interested", lists.notInt.length, isOpen("notint"),
    listBody("notint", lists.notInt, (c) => review(c) + (sw.noFam && sw.noFam.has(c.id) ? pill(`unswipe:${c.id}`, "Put back") : pill(`setint:${c.id}:try`, "Put back")))));
  const triedBody = !lists.tried.length ? `<div class="muted small">Nothing here yet. Wines you rate are kept here.</div>`
    : (lists.tried.length > 1 ? sortSelect("tried", sortOf("tried")) : "") +
      sortCards(lists.tried, sortOf("tried"), lists.order).map((c) =>
        item(c, pill(`entry:${c.entry.id}`, "View review", true), `<br>${esc(verdictShort(c.entry.verdict) || "")}, ${esc(c.entry.consumed_on || "")}`, thumbHtml(photoUrls, c.entry.first_photo_path) || bottleThumbHtml(c))).join("");
  parts.push(section("tried", "Wines Tried from Discover", lists.tried.length, isOpen("tried"), triedBody));
  // Bottom of the page on purpose: these already appear in the Journal.
  const hadBody = !lists.had.length ? `<div class="muted small">Nothing here yet.</div>`
    : (lists.had.length > 1 ? sortSelect("had", sortOf("had")) : "") +
      sortCards(lists.had, sortOf("had"), lists.order).map((c) => {
        const entry = lists.entryOf.get(c.id);
        return item(c, entry ? pill(`entry:${entry.id}`, entry.verdict ? "View review" : "Rate this bottle", true) : pill(`review:${c.id}`, "Review the wine", true), "", thumbHtml(photoUrls, entry && entry.first_photo_path) || bottleThumbHtml(c));
      }).join("");
  const any = lists.rec.length + lists.unk.length + lists.notInt.length + lists.tried.length + lists.had.length;
  return (any ? "" : `<p class="muted">Swipe some wines in Discover and they will show up here.</p>`) +
    `<div class="stack">${parts.join("")}</div><div class="stack" style="margin-top:36px">${section("had", "Had this bottle (also in your Journal)", lists.had.length, isOpen("had"), hadBody)}</div>`;
}

// ---------------------------------------------------------------- Journal
export function journalShellHtml(j) {
  const opt = (v, label, cur) => `<option value="${v}"${v === cur ? " selected" : ""}>${label}</option>`;
  return `<div class="jbar">
      <div class="jtop"><input class="field" data-jq placeholder="Search your wines" value="${esc(j.q)}" autocomplete="off">
        <button class="pill dark big" data-action="addwine">+ Add a wine</button></div>
      <div class="jsel">
        <select class="sortsel" data-jby aria-label="Group by">${GROUPS.map((g) => opt(g.id, "Group: " + g.label, j.by)).join("")}</select>
        <select class="sortsel" data-jverdict aria-label="Filter by verdict">${opt("all", "All verdicts", j.verdict)}${VERDICTS.map((v) => opt(v.code, v.short, j.verdict)).join("")}${opt("none", "No verdict yet", j.verdict)}</select>
      </div></div>
    <div id="jmeta" class="jmeta"></div><div id="jlist"></div>`;
}
export function journalMetaHtml(entries, filtered, j, groups) {
  const searching = j.q.trim() !== "";
  const n = filtered.length;
  const links = (j.by !== "flat" && groups.length > 1 && !searching)
    ? `<span class="links"><button class="link" data-action="jexpand">Expand all</button><button class="link" data-action="jcollapse">Collapse all</button></span>` : "";
  return `<span>${n} ${n === 1 ? "wine" : "wines"}${n !== entries.length ? ` of ${entries.length}` : ""}</span>${links}`;
}
// Small journals open up by default; big ones start collapsed.
export const groupIsOpen = (j, key, total, searching, by) => searching || by === "flat" || (key in j.open ? j.open[key] : total <= 10);

export function journalListHtml(entries, j, photoUrls, cards = []) {
  const cardsById = new Map(cards.map((c) => [c.id, c]));
  const filtered = filterEntries(entries, { q: j.q, verdict: j.verdict });
  const groups = groupEntries(filtered, j.by);
  const searching = j.q.trim() !== "";
  if (!entries.length) return `<p class="muted">No wines logged yet. Swipe up on a bottle you've had, or tap "+ Add a wine".</p>`;
  if (!filtered.length) return `<p class="muted">No wines match.</p>`;
  const rows = (g) => {
    const limit = j.limits[g.key] || GROUP_PAGE;
    const shown = g.items.slice(0, limit).map((e) => {
      const c = entryCard(e); const v = verdictShort(e.verdict);
      return `<button class="jrow" data-action="entry:${e.id}">${thumbHtml(photoUrls, e.first_photo_path) || bottleThumbHtml(e.wine_vintage_id ? cardsById.get(e.wine_vintage_id) : null)}<span class="jl">
        <span class="iname"><span class="serif trunc">${esc(entryName(e))}</span><span class="ed edbtn" role="button" tabindex="0" data-action="wineinfo-entry:${e.id}" aria-label="Change wine info">&#9998;</span>${marksHtml(c, 16)}</span>
        ${entryInfoLine(e, e.wine_vintage_id ? cardsById.get(e.wine_vintage_id) : null) ? `<span class="meta grapeline trunc">${esc(entryInfoLine(e, e.wine_vintage_id ? cardsById.get(e.wine_vintage_id) : null))}</span>` : ""}
        <span class="meta trunc"><b class="${v ? "wine" : ""}">${esc(v || "No verdict yet")}</b>${e.consumed_on ? ", " + esc(e.consumed_on) : ""}${e.food ? ", with " + esc(e.food) : ""}${e.is_outside_wine ? ", not in catalog" : ""}</span></span>
        ${v ? "" : `<span class="pill dark">Rate</span>`}</button>`;
    }).join("");
    const more = g.items.length > limit ? `<button class="link block" data-action="jmore:${encodeURIComponent(g.key)}">Show ${Math.min(GROUP_PAGE, g.items.length - limit)} more (${g.items.length - limit} left)</button>` : "";
    return shown + more;
  };
  const html = groups.map((g) => {
    if (j.by === "flat") return `<div class="sect"><div class="sect-body">${rows(g)}</div></div>`;
    const open = groupIsOpen(j, g.key, entries.length, searching, j.by);
    return `<div class="sect"><button class="sect-head" data-action="jtoggle:${encodeURIComponent(g.key)}" aria-expanded="${open}"><span>${esc(g.label)}</span><span>${g.items.length} <span class="chev">${open ? "▲" : "▼"}</span></span></button>${open ? `<div class="sect-body">${rows(g)}</div>` : ""}</div>`;
  }).join("");
  return `<div class="stack">${html}</div>`;
}

// ---------------------------------------------------------------- rating sheet
export function photosHtml(sheet) {
  const existing = sheet.photos.existing.map((p) => `<div class="ph${p.removed ? " gone" : ""}">${p.url ? `<img src="${esc(p.url)}" alt="Your photo">` : ""}<button class="phx" data-sheet="togglephoto:${p.id}" aria-label="${p.removed ? "Keep this photo" : "Remove this photo"}">${p.removed ? "↺" : "×"}</button></div>`).join("");
  const queued = sheet.photos.queued.map((p) => `<div class="ph"><img src="${esc(p.url)}" alt="New photo"><button class="phx" data-sheet="unqueue:${p.key}" aria-label="Remove this photo">×</button></div>`).join("");
  const label = photoCount(sheet) ? "Add more photos" : "Add photos";
  return `<div class="phs">${existing}${queued}</div>
    <label class="pill addph">${label}<input type="file" accept="image/*" multiple hidden data-photo="sheet"></label>`;
}
// A structure control. Scales are sliders; oak and CO2 are buttons with a fixed set of choices (no values in between).
// attr: the data attribute that carries clicks ("data-sheet" in the rating sheet, "data-editor" in the editor).
// slider: the attribute that identifies the range input. reset: whether to show the Reset link.
export function dimControlHtml(d, x, { attr = "data-sheet", slider = "data-dim", reset = true } = {}) {
  const resetLink = reset ? `<button id="reset-${d.key}" class="link" ${attr}="reset:${d.key}" style="visibility:${x.adjusted ? "visible" : "hidden"}">Reset</button>` : "";
  const head = `<div class="dim"><div class="dimtop"><span>${d.name}</span>${resetLink}</div>`;   // every control below starts from this heading
  const segbtn = (v, k, extra = "") => `<button class="segbtn${x.value === v ? " on" : ""}${x.value === v && !x.adjusted ? " def" : ""}${extra}" ${attr}="choice:${d.key}:${v}" aria-pressed="${x.value === v}">${esc(d.labels[k])}</button>`;
  if (d.ui === "drysweet") {
    // Most wines are dry, so the first question is only Dry or Sweet. Sweet then opens the three levels.
    const sweet = x.value > 0;
    const levels = d.values.map((v, k) => (v > 0 ? segbtn(v, k) : "")).join("");
    return `${head}
      <div class="seg" role="group" aria-label="${d.name}">${segbtn(0, 0)}<button class="segbtn${sweet ? " on" : ""}${sweet && !x.adjusted ? " def" : ""}" ${attr}="sweet:${d.key}" aria-pressed="${sweet}">Sweet</button></div>
      <div class="seg sub" data-sweetsub${sweet ? "" : " hidden"} role="group" aria-label="How sweet">${levels}</div></div>`;
  }
  if (d.ui === "steps") {
    // A slider with a few fixed stops (oak). The + and - buttons move one stop; the labels show where it is.
    const at = d.values.indexOf(x.value);
    const stops = d.labels.map((l, k) => `<span data-steplabel="${d.key}:${k}" class="${k === at ? "on" : ""}">${esc(l)}</span>`).join("");
    return `${head}
      <div class="dimrow"><button class="round" ${attr}="nudge:${d.key}:-1" aria-label="Less ${d.name.toLowerCase()}">&minus;</button>
        <input type="range" min="${d.values[0]}" max="${d.values[d.values.length - 1]}" step="1" value="${x.value}" ${slider}="${d.key}" aria-label="${d.name}: ${d.labels.join(", ")}">
        <button class="round" ${attr}="nudge:${d.key}:1" aria-label="More ${d.name.toLowerCase()}">+</button></div>
      <div class="steplabels">${stops}</div></div>`;
  }
  if (isChoice(d)) {
    const btns = d.values.map((v, k) => segbtn(v, k)).join("");
    return `${head}<div class="seg" role="group" aria-label="${d.name}">${btns}</div></div>`;
  }
  return `${head}
      <div class="dimrow"><button class="round" ${attr}="nudge:${d.key}:-0.5" aria-label="Less ${d.name.toLowerCase()}">&minus;</button>
        <input type="range" min="1" max="5" step="0.1" value="${x.value}" ${slider}="${d.key}" aria-label="${d.name}, from ${d.lo} to ${d.hi}">
        <button class="round" ${attr}="nudge:${d.key}:0.5" aria-label="More ${d.name.toLowerCase()}">+</button></div>
      <div class="dimlabels"><span>${d.lo}</span><span>${d.hi}</span></div></div>`;
}
// Keeps a fixed-choice control in step with its value (used by the rating sheet and the editor, which differ only in the data attribute).
export function syncChoiceControl(d, x, attr = "data-sheet", root = document) {
  if (d.ui === "steps") {
    const r = root.querySelector(`[data-dim="${d.key}"], [data-edim="${d.key}"]`);
    if (r && Number(r.value) !== x.value) r.value = x.value;
    root.querySelectorAll(`[data-steplabel^="${d.key}:"]`).forEach((el) => el.classList.toggle("on", Number(el.dataset.steplabel.split(":")[1]) === d.values.indexOf(x.value)));
    return;
  }
  root.querySelectorAll(`[${attr}^="choice:${d.key}:"]`).forEach((b) => {
    const on = Number(b.getAttribute(attr).split(":")[2]) === x.value;
    b.classList.toggle("on", on); b.classList.toggle("def", on && !x.adjusted); b.setAttribute("aria-pressed", String(on));
  });
  if (d.ui === "drysweet") {
    const sweet = x.value > 0;
    const sw = root.querySelector(`[${attr}^="sweet:"]`);
    if (sw) { sw.classList.toggle("on", sweet); sw.classList.toggle("def", sweet && !x.adjusted); sw.setAttribute("aria-pressed", String(sweet)); }
    const sub = root.querySelector("[data-sweetsub]");
    if (sub) sub.hidden = !sweet;
  }
}
// The rating window is a short run of numbered pages. Swipe, use the corner arrows, or tap a number. Save is on every page.
export const SHEET_PAGES = [
  { id: "verdict", title: "Your take" },
  { id: "structure", title: "How it tasted" },
  { id: "character", title: "Sweetness and bubbles" },
  { id: "details", title: "Details" },
  { id: "notes", title: "Notes and photos" },
];
// The wine this entry is about, with a way to correct it (journal entries only).
export const wineCardHtml = (sheet) => `<div class="winecard"><div class="muted small">Wine</div><div class="serif" id="wcname">${esc(sheet.target.name)}</div>
  <button class="link" data-sheet="editinfo">Change wine info</button></div>`;
// Page 2: the type of wine, then all the sliders together (acidity, body, tannin, oak).
export function structurePageHtml(sheet) {
  const bars = barDims(sheet.style).filter((d) => sheet.dims[d.key]).map((d) => dimControlHtml(d, sheet.dims[d.key])).join("");
  return `<h3 class="serif">How it tasted</h3>${bars}`;
}
// Page 3: the buttons together (sweetness, and CO2 for wines that are not red).
export function characterPageHtml(sheet) {
  const choices = choiceDims(sheet.style).filter((d) => sheet.dims[d.key]).map((d) => dimControlHtml(d, sheet.dims[d.key])).join("");
  return `<h3 class="serif">Sweetness and bubbles</h3><div class="muted small">Most wines are dry and still. Change only what you noticed.</div>${choices}`;
}
// The big button at the bottom: Next on the first four pages, Save on the last. (Save stays at the top of every page.)
// Page 1 waits for a verdict, because choosing one is what moves on.
export function footState(page, verdict, saving) {
  const last = SHEET_PAGES.length - 1;
  if (page < last) return { action: "next", label: "Next", disabled: page === 0 && !verdict };
  return { action: "save", label: "Save to journal", disabled: !verdict || !!saving };
}
export function sheetHtml(sheet, { saving = false, error = "", page = 0 } = {}) {
  const verdicts = VERDICTS.map((v) => `<button class="vbtn${sheet.verdict === v.code ? " on" : ""}" data-sheet="verdict:${v.code}">${esc(v.label)}</button>`).join("");
  const canSave = !!sheet.verdict && !saving;
  const n = SHEET_PAGES.length;
  const steps = SHEET_PAGES.map((p, i) => `<button class="wstep${i === page ? " on" : ""}" data-sheet="page:${i}" aria-label="Step ${i + 1} of ${n}, ${esc(p.title)}">${i + 1}</button>`).join("");
  const pages = [
    `<h3 class="serif">How was it?</h3><div class="verdicts">${verdicts}</div><div class="muted small">Pick one to go to the next step.</div>`,
    structurePageHtml(sheet),
    characterPageHtml(sheet),
    `<h3 class="serif">Details</h3>${sheet.entryId ? wineCardHtml(sheet) : ""}<div class="two"><input class="field" type="date" data-field="date" value="${esc(sheet.date)}" aria-label="Date">
      <input class="field" inputmode="decimal" data-field="price" placeholder="Price you paid ($)" value="${esc(sheet.price)}"></div>
      <div class="two"><input class="field" data-field="food" placeholder="Food" value="${esc(sheet.food)}"><input class="field" data-field="occasion" placeholder="Occasion" value="${esc(sheet.occasion)}"></div>`,
    `<h3 class="serif">Notes and photos</h3><textarea class="field" data-field="notes" rows="4" placeholder="Notes">${esc(sheet.notes)}</textarea>
      <div id="sheetPhotos" class="photoarea">${photosHtml(sheet)}</div>
      ${sheet.entryId ? `<div class="deleterow"><button class="deletelink" data-sheet="delete">Delete this entry</button></div>` : ""}`,
  ];
  return `<div class="overlay"><div class="sheet" id="sheetPanel" data-page="${page}">
    <div class="wtop">
      <div class="wnav"><button class="wcorner" data-sheet="prev" aria-label="Back">&lsaquo;</button><div class="wsteps" role="group" aria-label="Steps">${steps}</div><button class="wcorner" data-sheet="next" aria-label="Next">&rsaquo;</button></div>
      <div class="sheethead"><div class="sheettitle"><div class="serif big">${esc(sheet.target.name)}</div><div class="muted small" id="wtitle">Step ${page + 1} of ${n}: ${esc(SHEET_PAGES[page].title)}</div></div>
        <div class="sheetbtns"><button class="pill wine" data-sheet="save"${canSave ? "" : " disabled"}>Save</button><button class="xbtn" data-sheet="close" aria-label="Close">&times;</button></div></div>
    </div>
    <div class="wpages" id="wpages">${pages.map((h, i) => `<section class="wpage" data-wpage="${i}"${i === page ? "" : " hidden"}>${h}</section>`).join("")}</div>
    <div id="sheetErr" class="err">${esc(error)}</div>
    <div class="wfoot">${(() => { const f = footState(page, sheet.verdict, saving); return `<button class="btn primary" id="wfootbtn" data-sheet="${f.action}"${f.disabled ? " disabled" : ""}>${f.label}</button>`; })()}${sheet.verdict ? "" : `<div class="muted small">Pick a verdict on step 1 to save.</div>`}</div>
  </div></div>`;
}

// A confirmation that sits on top of whatever is open. Buttons carry data-confirm="yes" or "no".
// Short on purpose: the title, which wine, and the two buttons. What is kept is one small tap away.
export function confirmHtml({ title, body = "", more = "", yes = "Delete", error = "", busy = false }) {
  return `<div class="overlay top"><div class="sheet small" role="alertdialog" aria-label="${esc(title)}">
    <div class="serif big">${esc(title)}</div>${body ? `<div class="serif confirmname">${body}</div>` : ""}
    ${more ? `<details class="whatkept"><summary>What is kept?</summary><p class="muted small">${more}</p></details>` : ""}
    <div id="confirmErr" class="err">${esc(error)}</div>
    <div class="two"><button class="btn outline" data-confirm="no"${busy ? " disabled" : ""}>Cancel</button><button class="btn danger" data-confirm="yes"${busy ? " disabled" : ""}>${esc(yes)}</button></div></div></div>`;
}
export const KEPT_NOTE = "Your name, account, photos and notes are removed. Only the anonymous rating is kept, and if you enter this wine again it replaces that copy.";
export const SWIPE_KEPT_NOTE = "Your account link is removed. Only an anonymous record of the swipe is kept, and if you swipe this wine again it replaces that copy.";

// ---------------------------------------------------------------- add a wine by hand
export function formPhotosHtml(form) {
  const thumbs = (form.photos || []).map((p) => `<div class="ph"><img src="${esc(p.url)}" alt="Your bottle photo"><button class="phx" data-action="formunqueue:${p.key}" aria-label="Remove this photo">×</button></div>`).join("");
  return `<div class="phs">${thumbs}</div><div class="photobtns">
    <label class="pill dark">Take a photo<input type="file" accept="image/*" capture="environment" hidden data-photo="form"></label>
    <label class="pill">Choose from library<input type="file" accept="image/*" multiple hidden data-photo="form"></label></div>
    ${(form.photos || []).length ? `<div class="muted small">Automatic recognition comes later. For now, describe the wine yourself.</div>` : ""}`;
}
// The vintage menu is the same in both wine forms.
const yearOptions = (form) => `<option value="">Vintage (optional)</option><option value="NV"${form.vintage === "NV" ? " selected" : ""}>Non-vintage (NV)</option>` +
  YEARS.map((y) => `<option value="${y}"${String(y) === form.vintage ? " selected" : ""}>${y}</option>`).join("");
export function addFormHtml(form, error = "") {
  const styles = [...WINE_STYLES.map((st) => [st.id, st.label]), ["unknown", "Other"]].map(([k, l]) => `<button class="vbtn tog${form.style === k ? " on" : ""}" data-action="formstyle:${k}">${l}</button>`).join("");
  return `<div class="overlay"><div class="sheet" id="sheetPanel">
    <div class="sheethead"><div class="sheettitle"><div class="serif big">Add a wine you drank</div><div class="muted small">Enter what is on the bottle.</div></div>
      <div class="sheetbtns"><button class="xbtn" data-action="closeform" aria-label="Close">&times;</button></div></div>
    <div id="formPhotos" class="photoarea top">${formPhotosHtml(form)}</div>
    <input class="field" data-form="producer" placeholder="Producer (required)" value="${esc(form.producer)}">
    <input class="field" data-form="wine_name" placeholder="Wine or cuvée" value="${esc(form.wine_name)}">
    <select class="field" data-form="vintage" aria-label="Vintage">${yearOptions(form)}</select>
    ${grapeAndPlaceInputs(form, "form")}
    <div class="three">${styles}</div>
    <div id="formErr" class="err">${esc(error)}</div>
    <button class="btn primary" data-action="addrate">Rate it now</button>
    <button class="btn outline" data-action="addnorate">Add without rating</button></div></div>`;
}

// ---------------------------------------------------------------- report a problem with a wine card
export function wineFlagHtml(flag) {
  const reasons = WINE_FLAG_REASONS.map((r, k) => `<button class="vbtn${flag.reason === r ? " on" : ""}" data-action="wfreason:${k}">${esc(r)}</button>`).join("");
  return `<div class="overlay"><div class="sheet" id="wfPanel">
    <div class="sheethead"><div class="sheettitle"><div class="serif big">Report a problem with this wine</div><div class="muted small">Tell us what looks wrong so an editor can check it.</div></div>
      <div class="sheetbtns"><button class="xbtn" data-action="wfclose" aria-label="Close">&times;</button></div></div>
    <div class="verdicts">${reasons}</div>
    <textarea class="field" rows="3" data-wfnote placeholder="Add a note or a source (optional)">${esc(flag.note)}</textarea>
    <div id="wfErr" class="err">${esc(flag.error || "")}</div>
    <button class="btn primary" data-action="wfsend"${flag.reason && !flag.sending ? "" : " disabled"}>Send to editors</button></div></div>`;
}

// ---------------------------------------------------------------- changing a wine's info (journal)
// form: { producer, wine_name, vintage, style, grape, region }; note says what the change will do.
export function wineEditHtml(form, { error = "", saving = false, note = "", canReset = false } = {}) {
  const styles = [...WINE_STYLES, { id: "unknown", label: "Other" }].map((st) => `<button class="vbtn tog${form.style === st.id ? " on" : ""}" data-wedit-style="${st.id}">${esc(st.label)}</button>`).join("");
  return `<div class="overlay top" id="winfoLayer"><div class="sheet" id="winfoPanel">
    <div class="sheethead"><div class="sheettitle"><div class="serif big">Change wine info</div><div class="muted small">${esc(note)}</div></div>
      <div class="sheetbtns"><button class="xbtn" data-wedit="close" aria-label="Close">&times;</button></div></div>
    <div class="qlabel">Producer</div><input class="field" data-wef="producer" value="${esc(form.producer)}" autocomplete="off">
    <div class="qlabel">Wine or cuvée</div><input class="field" data-wef="wine_name" value="${esc(form.wine_name)}" autocomplete="off">
    <div class="qlabel">Vintage</div><select class="field" data-wef="vintage" aria-label="Vintage">${yearOptions(form)}</select>
    <div class="qlabel">Type of wine</div><div class="three wide">${styles}</div>
    ${grapeAndPlaceInputs(form, "wef")}
    <div id="winfoErr" class="err">${esc(error)}</div>
    <button class="btn primary" data-wedit="save"${saving ? " disabled" : ""}>${saving ? "Saving…" : "Save wine info"}</button>
    ${canReset ? `<button class="link" data-wedit="reset"${saving ? " disabled" : ""}>Use the catalog's details again</button>` : ""}
    <button class="btn outline" data-wedit="close"${saving ? " disabled" : ""}>Cancel</button></div></div>`;
}

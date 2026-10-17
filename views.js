// Screens. Every function here takes data and returns an HTML string; nothing touches the network.
import {
  FAMILIARITY, FLAGS, VERDICTS, isChoice, GROUPS, GROUP_PAGE, SORTS, YEARS,
  esc, wineName, displayCuvee, entryCard, entryName, entryIncomplete, entryMissing, verdictShort, groupEntries, filterEntries, sortCards,
  WINE_FLAG_REASONS, photoCount, WINE_STYLES, barDims, choiceDims, dosageLabel } from "./logic.js?v=22";
import { splitGrapeParts, splitPlace } from "./blends.js?v=2";
import { REACTIONS, iconHtml, SKIP_LIMIT } from "./reactions.js?v=3";
import { say, proToolsOn } from "./words.js?v=1";
import { SPEECH_LANGS, speechLangNow } from "./winewords.js?v=1";
import { GUESS_FIELDS, scoreGuess, summarize, RESULT_WORDS } from "./blind.js?v=2";
import { SW_TABS, SW_KINDS, SW_GROUPS, SW_SORTS, entriesFor, tabCounts, filtersOn, stylesIn, filterEntries as filterSwipes, groupEntries as groupSwipes, fitBand } from "./swipetabs.js?v=6";
import { infoLine, entryInfoLine } from "./wineline.js?v=3";
import { flavorsForCard, placeFor } from "./flavors.js?v=3";
import { bottleSilhouette, flavorRowHtml, tintFor } from "./visuals.js?v=4";
import { countryMapSvg, zoomPlan, hasCountry } from "./maps.js?v=6";
import { imageSearchUrl } from "./winelinks.js?v=3";

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
    // The map can be opened whenever the country is drawn: the card's map then finds the appellation, or shows the country (atlas.js placeOfCard).
    return { shape: fl.shape, type: fl.type, flavors: fl.picks, map: countryMapSvg(c.country, place, fl.type, 64), zoomable: !!plan || hasCountry(c.country) };
  } catch (e) { return { shape: "bordeaux", type: c.style, flavors: [], map: "", zoomable: false }; }   // a card that cannot be read still shows its name and facts
}
// The card, top to bottom: the producer and the wine's name at the same large size (the producer matters as much as the wine) with the year beside
// the producer, a one-line summary (type and place), then one soft tinted panel holding an abstract bottle, the six flavors and the map, and last the facts in small type.
// A wine with no separate wine name shows just the producer. The name is a link to a Google image search for that wine
// (winelinks.js); wine info is not edited from the deck. The card never shows a bottle photo.
// The zoom icon on the map: a small magnifier with a plus in the map's corner, so it is clear the map can be tapped to see where the wine is from.
export const mapZoomIconHtml = (hint = false) => `<span class="badge${hint ? " hint" : ""}" aria-hidden="true"><svg viewBox="0 0 32 32" width="20" height="20"><circle cx="13" cy="13" r="8.5" fill="none" stroke="currentColor" stroke-width="3"/><path d="M19.5 19.5 L27 27" stroke="currentColor" stroke-width="3.6" stroke-linecap="round"/><path d="M13 9 V17 M9 13 H17" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/></svg></span>`;
export function cardHtml(c, { mapHint = false } = {}) {
  const labels = ["like", "dislike", "had", "dont_know"].map((k) => `<div class="swipe-label" data-label="${k}" role="img" aria-label="${esc(REACTIONS[k].label)}" style="background:${REACTIONS[k].color}">${k === "like" || k === "dislike" ? iconHtml(k, 34) : esc(REACTIONS[k].label)}</div>`).join("");
  const v = visualFor(c), href = imageSearchUrl(c), t = tintFor(v.type);
  const map = v.map ? `<${v.zoomable ? "button" : "div"} class="mapbtn${v.zoomable ? "" : " still"}"${v.zoomable ? ` data-zoom="${esc(c.id)}" aria-label="Show where this wine is from"` : ""}>${v.map}${v.zoomable ? mapZoomIconHtml(mapHint) : ""}</${v.zoomable ? "button" : "div"}>` : "";
  const place = c.appellation || c.region || c.country || "";
  const flag = FLAGS[c.country];
  const dosage = c.style === "sparkling" && c.dosage ? dosageLabel(c.dosage) : "";   // how sweet, as the label says (logic.js DOSAGES)
  // The appellation and its designation read together ("Morgon AOC"), so the card says plainly what the label says.
  const placeText = c.appellation && c.designation ? `${c.appellation} ${c.designation}` : place;
  const summary = [t.label !== "Other" ? esc(t.label) : "", dosage ? esc(dosage) : "", place ? `${flag ? `<span class="flag">${flag}</span> ` : ""}${esc(placeText)}` : ""].filter(Boolean).join(" · ");
  const facts = c.facts.filter((f) => f.text !== place);   // the place is already in the summary line
  return `<div class="card" id="card">${labels}<button class="zreset" data-zreset hidden aria-label="Reset zoom">Reset zoom</button>
    <div class="body">
      <a class="winelink" data-wimg href="${esc(href)}" target="_blank" rel="noopener noreferrer" draggable="false" aria-label="Search Google Images for ${esc(wineName(c))}">
        <div class="topline"><div class="producer serif">${esc(c.producer)}</div>${c.vintage ? `<span class="vpill">${esc(c.vintage)}</span>` : ""}</div>
        ${displayCuvee(c) ? `<div class="title serif">${esc(displayCuvee(c))}</div>` : ""}</a>
      ${summary ? `<div class="metaline"><span class="tdot" style="background:${t.dot}"></span><span>${summary}</span></div>` : ""}
      <div class="visrow" style="background:${t.pin}1a">${bottleSilhouette(v.shape, v.type)}${flavorRowHtml(v.flavors)}${map}</div>
      <div class="facts">${facts.map((f) => `<span class="${f.derived ? "derived" : ""}">${esc(f.text)}</span>`).join("")}</div>
    </div></div>`;
}
// The answers as buttons: thumbs down (swipe left), Skip (buttons only) and thumbs up (swipe right), in the order they sit on the screen. "I've had this bottle"
// (swipe up) is the small button under them. The row can be switched off in Settings when swiping is on.
export const ANSWER_BUTTONS = [{ kind: "dislike" }, { kind: "dont_know" }, { kind: "like" }];
// The face of an answer button: a thumb for like and dislike, the word Skip with its arrow for skip. The name is always there for screen readers.
export const answerFace = (kind) => (kind === "dont_know" ? `${esc(REACTIONS[kind].label)} ${iconHtml(kind, 18)}` : iconHtml(kind, 26));
export const answerButtonsHtml = () => `<div class="answers" role="group" aria-label="Your answer">${ANSWER_BUTTONS.map((a) =>
  `<button class="ans" data-action="answer:${a.kind}" aria-label="${esc(REACTIONS[a.kind].label)}" style="--c:${REACTIONS[a.kind].color}">${answerFace(a.kind)}</button>`).join("")}</div>`;
export function discoverHtml({ deck, loading = false, interest, banner, counts, feedback = false, flaggedId = null, nudge = false, buttons = true, mapHint = false }) {
  const bannerHtml = banner ? `<div class="banner" data-action="dismiss">${esc(banner)} (tap to dismiss)</div>` : "";
  if (!deck.length && loading) return `${bannerHtml}<div class="center muted">Loading more wines…</div>`;   // the catalog is still arriving (app.js enterMain)
  if (!deck.length) {
    return `${bannerHtml}<div class="center"><div class="serif" style="font-size:22px">No more wines to show.</div>
      <div class="muted">If you expected some, check that the sample wines were published for testing.</div></div>`;
  }
  // The card, its button row and the save-your-journal reminder are one block, centred between the header and the tab bar, so the space is even above and below.
  return `${bannerHtml}<div class="deckstage">
    <div class="cardwrap">${deck.length > 1 ? '<div class="behind"></div>' : ""}${cardHtml(deck[0], { mapHint })}</div>
    ${buttons ? answerButtonsHtml() : ""}
    <div class="belowcard"><button class="hadbtn" data-action="answer:had" aria-label="I've had this bottle: it goes into your journal">I've had this bottle</button><button class="zoombtn" data-action="zoomcard" aria-label="Zoom in on the card">&#128269; Zoom</button>${feedback ? `<span class="fbline">${flaggedId === deck[0].id ? '<span class="muted">Thanks, an editor will review it.</span>' : '<button class="link" data-action="wineflag" aria-label="Report a problem with this wine">Report a problem</button>'}</span>` : ""}</div>
    ${nudge ? `<div class="nudge"><b>Don't lose your journal.</b> Save it with an email so it follows you to any phone.
      <div class="nudgeacts"><button class="btn primary slim" data-account="open:save">Save with email</button><button class="link" data-action="nudgeoff">Not now</button></div></div>` : ""}</div>`;
}

// ---------------------------------------------------------------- Swipes
// A tab view: Like and dislike | Don't know | All. Each tab picks a grouping (grape, region, producer, vintage, how well it fits), and each group opens to
// a list with its own search, type filter and sort. The rules for this are in swipetabs.js; app.js keeps the choices in state.sw.
function item(card, actions, extra = "", thumb = "") {
  actions += `<button class="delsmall" data-action="delswipe:${card.id}" aria-label="Delete this swipe">Delete</button>`;
  const where = infoLine(card);   // varietal, vineyard, appellation, region, country: up to three, most important first
  return `<div class="item withthumb">${thumb}<div class="ibody"><div class="iname"><button class="namebtn serif" data-action="wineinfo:${esc(card.id)}" aria-label="Change wine info for ${esc(wineName(card))}">${esc(wineName(card))} <span class="ed" aria-hidden="true">&#9998;</span></button>${marksHtml(card, 16)}</div>
    <div class="meta">${esc(where)}${extra}</div><div class="acts">${actions}</div></div></div>`;
}
const pill = (action, label, dark) => `<button class="pill${dark ? " dark" : ""}" data-action="${action}">${esc(label)}</button>`;
const opt = (v, label, cur) => `<option value="${esc(v)}"${v === cur ? " selected" : ""}>${esc(label)}</option>`;

// An answer as a small icon button (thumb up, thumb down), named for screen readers.
const iconPill = (action, kind, label) => `<button class="pill icon" data-action="${action}" aria-label="${esc(label)}" title="${esc(label)}">${iconHtml(kind, 18)}</button>`;
const SWITCH_UP = (c) => iconPill(`react:${c.id}:like`, "like", "Change to thumbs up");
const SWITCH_DOWN = (c) => iconPill(`react:${c.id}:dislike`, "dislike", "Change to thumbs down");

// One wine with the buttons that fit how it was answered. A thumb can be switched to the other; "Put back" returns the wine to the deck (a fresh start).
function swipeItem(e, lists, photoUrls, match) {
  const c = e.card, review = pill(`review:${c.id}`, "Review the wine", true);
  const fit = match && match.has(c.id) ? `<br>${esc((fitBand(match.get(c.id)) || {}).label || "")}` : "";
  if (e.kind === "liked") return item(c, review + SWITCH_DOWN(c) + pill(`unswipe:${c.id}`, "Put back"), fit, bottleThumbHtml(c));
  if (e.kind === "disliked") return item(c, review + SWITCH_UP(c) + pill(`unswipe:${c.id}`, "Put back"), fit, bottleThumbHtml(c));
  if (e.kind === "dontKnow") {
    const n = (lists.skipsOf && lists.skipsOf[c.id]) || 1;
    const note = `<br>${n >= SKIP_LIMIT ? "Skipped twice: not shown in Discover again" : "Skipped once: it comes back later in Discover"}`;
    return item(c, review + SWITCH_UP(c) + SWITCH_DOWN(c) + pill(`unswipe:${c.id}`, "Put back"), note + fit, bottleThumbHtml(c));
  }
  if (e.kind === "rec") return item(c, review + SWITCH_UP(c) + SWITCH_DOWN(c), fit, bottleThumbHtml(c));
  const entry = e.kind === "tried" ? c.entry : lists.entryOf.get(c.id);
  const note = e.kind === "tried" && entry ? `<br>${esc(verdictShort(entry.verdict) || "")}, ${esc(entry.consumed_on || "")}` : "";
  const act = entry ? pill(`entry:${entry.id}`, entry.verdict ? "View review" : "Rate this bottle", true) : review;
  return item(c, act, note + fit, thumbHtml(photoUrls, entry && entry.first_photo_path) || bottleThumbHtml(c));
}

// The part that changes while typing in the search box (the app redraws only this).
export function swipesListHtml(lists, sw, photoUrls, match = new Map()) {
  const all = entriesFor(lists, sw);
  const shown = filterSwipes(all, sw);
  if (!all.length) return `<p class="muted small">${{ skip: "Wines you skip show up here.", all: "Swipe some wines in Discover and they will show up here.", dislike: "No thumbs down yet.", like: "No thumbs up yet." }[sw.tab] || ""}</p>`;
  if (!shown.length) return `<p class="muted small">No wines match.</p>`;
  const groups = groupSwipes(shown, sw.group, { sort: sw.sort, order: lists.order, match });
  if (groups.length === 1 && !groups[0].label) return groups[0].entries.map((e) => swipeItem(e, lists, photoUrls, match)).join("");
  return groups.map((g) => {
    const key = [sw.tab, sw.status, sw.group, g.id].join("|");
    const open = sw.open[key] !== undefined ? sw.open[key] : groups.length === 1;
    return `<div class="sect"><button class="sect-head" data-action="swg:${encodeURIComponent(key)}" aria-expanded="${open}"><span>${esc(g.label)} (${g.entries.length})</span><span class="chev">${open ? "▲" : "▼"}</span></button>${open ? `<div class="sect-body">${g.entries.map((e) => swipeItem(e, lists, photoUrls, match)).join("")}</div>` : ""}</div>`;
  }).join("");
}

// One row: thumbs up, thumbs down, skip, all (each with its count), then a "…" button that opens the search, group, sort and type controls (shut by default so the first look is clean).
export function swipesHtml(lists, sw, photoUrls, match = new Map()) {
  const n = tabCounts(lists);
  const tabs = SW_TABS.map((t) => `<button class="swtab${sw.tab === t.id ? " on" : ""}" role="tab" aria-selected="${sw.tab === t.id}" aria-label="${esc(t.label)}, ${n[t.id]}" data-action="swtab:${t.id}">${iconHtml(t.icon, 22)}<span class="swn">${n[t.id]}</span></button>`).join("");
  const row = `<div class="swrow1"><div class="swtabs" role="tablist" aria-label="Swipe lists">${tabs}</div>
    <button class="swmore${sw.more ? " on" : ""}" data-action="swmore" aria-expanded="${!!sw.more}" aria-label="Search, group and sort">${iconHtml("more", 22)}${!sw.more && filtersOn(sw) ? '<span class="swdot" aria-hidden="true"></span>' : ""}</button></div>`;
  const status = sw.tab === "all" ? `<select class="sortsel" data-swsel="status" aria-label="Show">${opt("all", "Show: everything", sw.status)}${SW_KINDS.map((k) => opt(k.id, k.label, sw.status)).join("")}</select>` : "";
  const styles = stylesIn(entriesFor(lists, { ...sw, status: "all" }));
  const controls = !sw.more ? "" : `<div class="swpanel"><input class="field" data-swq placeholder="Search these wines" value="${esc(sw.q)}" autocomplete="off" aria-label="Search these wines">
    <div class="swrow">${status}<select class="sortsel" data-swsel="group" aria-label="Group by">${SW_GROUPS.map((g) => opt(g.id, "Group by: " + g.label, sw.group)).join("")}</select>
    <select class="sortsel" data-swsel="sort" aria-label="Sort by">${SW_SORTS.map((x) => opt(x.id, "Sort by: " + x.label, sw.sort)).join("")}</select>
    ${styles.length > 1 ? `<select class="sortsel" data-swsel="style" aria-label="Type of wine">${opt("all", "Type: all", sw.style)}${styles.map((t) => opt(t, "Type: " + t, sw.style)).join("")}</select>` : ""}</div></div>`;
  return `${row}${controls}<div id="swList" class="stack">${swipesListHtml(lists, sw, photoUrls, match)}</div>`;
}

// ---------------------------------------------------------------- Journal
export function journalShellHtml(j, pending = 0) {
  const opt = (v, label, cur) => `<option value="${v}"${v === cur ? " selected" : ""}>${label}</option>`;
  return `<div class="jbar">
      <div class="jtop"><input class="field" data-jq placeholder="${esc(say("search_wines"))}" value="${esc(j.q)}" autocomplete="off">
        <button class="pill dark big" data-action="addwine">+ Add a wine</button></div>
      <div class="jsel">
        <select class="sortsel" data-jby aria-label="Group by">${GROUPS.map((g) => opt(g.id, "Group: " + g.label, j.by)).join("")}</select>
        <select class="sortsel" data-jverdict aria-label="Filter by verdict">${opt("all", "All verdicts", j.verdict)}${VERDICTS.map((v) => opt(v.code, v.short, j.verdict)).join("")}${opt("none", "No verdict yet", j.verdict)}</select>
      </div>
      <div class="jimp"><button class="link small" data-action="atlas:open:journal">Map of my wines</button> <button class="link small" data-action="qnote">${esc(say("note_title"))}</button>${proToolsOn() ? ` <button class="link small" data-action="blind:open">${esc(say("blind_title"))}${pending ? ` (${pending} waiting)` : ""}</button> <button class="link small" data-action="export:notes">Export my notes</button>` : ""} <button class="link small" data-action="import:open">Import wines from a file</button></div></div>
    <div id="jmeta" class="jmeta"></div><div id="jlist"></div>`;
}
export function journalMetaHtml(entries, filtered, j, groups) {
  const searching = j.q.trim() !== "";
  const n = filtered.length;
  const links = (j.by !== "flat" && groups.length > 1 && !searching)
    ? `<span class="links"><button class="link" data-action="jexpand">Expand all</button><button class="link" data-action="jcollapse">Collapse all</button></span>` : "";
  const inc = entries.filter(entryIncomplete).length;   // wines still missing details: a chip filters to them (shown only when there are some, or while the filter is on)
  const chip = inc || j.incomplete ? `<button class="chip wide${j.incomplete ? " on" : ""}" data-action="jincomplete" aria-pressed="${!!j.incomplete}">Incomplete (${inc})</button>` : "";
  return `<span>${n} ${n === 1 ? "wine" : "wines"}${n !== entries.length ? ` of ${entries.length}` : ""}</span>${chip}${links}`;
}
// Small journals open up by default; big ones start collapsed.
export const groupIsOpen = (j, key, total, searching, by) => searching || by === "flat" || (key in j.open ? j.open[key] : total <= 10);

export function journalListHtml(entries, j, photoUrls, cards = []) {
  const cardsById = new Map(cards.map((c) => [c.id, c]));
  const filtered = filterEntries(entries, { q: j.q, verdict: j.verdict, incomplete: !!j.incomplete });
  const groups = groupEntries(filtered, j.by);
  const searching = j.q.trim() !== "";
  if (!entries.length) return `<p class="muted">No wines logged yet. Swipe up on a bottle you've had, tap "+ Add a wine", or import a list you already keep.</p>`;
  if (!filtered.length) return `<p class="muted">No wines match.</p>`;
  const rows = (g) => {
    const limit = j.limits[g.key] || GROUP_PAGE;
    const shown = g.items.slice(0, limit).map((e) => {
      const c = entryCard(e); const v = verdictShort(e.verdict);
      return `<button class="jrow" data-action="entry:${e.id}">${thumbHtml(photoUrls, e.first_photo_path) || bottleThumbHtml(e.wine_vintage_id ? cardsById.get(e.wine_vintage_id) : null)}<span class="jl">
        <span class="iname"><span class="serif trunc">${esc(entryName(e, e.wine_vintage_id ? cardsById.get(e.wine_vintage_id) : null))}</span><span class="ed edbtn" role="button" tabindex="0" data-action="wineinfo-entry:${e.id}" aria-label="Change wine info">&#9998;</span>${marksHtml(c, 16)}</span>
        ${entryInfoLine(e, e.wine_vintage_id ? cardsById.get(e.wine_vintage_id) : null) ? `<span class="meta grapeline trunc">${esc(entryInfoLine(e, e.wine_vintage_id ? cardsById.get(e.wine_vintage_id) : null))}</span>` : ""}
        <span class="meta trunc"><b class="${v ? "wine" : ""}">${esc(v || say("no_verdict"))}</b>${e.consumed_on ? ", " + esc(e.consumed_on) : ""}${e.food ? ", with " + esc(e.food) : ""}${e.is_outside_wine ? ", not in catalog" : ""}</span>${e.pending ? `<span class="meta waiting">Waiting to upload</span>` : ""}${entryIncomplete(e) ? `<span class="meta incomp">Incomplete: needs ${esc(entryMissing(e).join(", "))}</span>` : ""}</span>
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
export function sheetHtml(sheet, { saving = false, error = "", page = 0, onMap = false } = {}) {
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
    `<h3 class="serif">Notes and photos</h3><textarea class="field" data-field="notes" rows="4" placeholder="${esc(say("notes_hint"))}">${esc(sheet.notes)}</textarea>
    <div class="microw"><button type="button" class="pill mic" data-action="dictate:sheet" aria-pressed="false">${iconHtml("mic", 16)} <span>Speak your notes</span></button><span class="muted small micstatus" id="micStatus" role="status"></span></div>
    <div class="microw">${speakLangHtml()}</div>${wordFixHtml()}
      <div id="sheetPhotos" class="photoarea">${photosHtml(sheet)}</div>
      ${sheet.entryId ? `<div class="deleterow"><button class="deletelink" data-sheet="delete">Delete this entry</button></div>` : ""}`,
  ];
  return `<div class="overlay"><div class="sheet" id="sheetPanel" data-page="${page}">
    <div class="wtop">
      <div class="wnav"><button class="wcorner" data-sheet="prev" aria-label="Back">&lsaquo;</button><div class="wsteps" role="group" aria-label="Steps">${steps}</div><button class="wcorner" data-sheet="next" aria-label="Next">&rsaquo;</button></div>
      <div class="sheethead"><div class="sheettitle"><div class="serif big">${esc(sheet.target.name)}</div><div class="muted small" id="wtitle">Step ${page + 1} of ${n}: ${esc(SHEET_PAGES[page].title)}</div>${onMap ? `<button class="link small" data-action="atlas:sheet">Show on map</button>` : ""}</div>
        <div class="sheetbtns"><button class="pill wine" data-sheet="save"${canSave ? "" : " disabled"}>Save</button><button class="xbtn" data-sheet="close" aria-label="Close">&times;</button></div></div>
    </div>
    <div class="wpages" id="wpages">${pages.map((h, i) => `<section class="wpage" data-wpage="${i}"${i === page ? "" : " hidden"}>${h}</section>`).join("")}</div>
    <div id="sheetErr" class="err">${esc(error)}</div>
    <div class="wfoot">${(() => { const f = footState(page, sheet.verdict, saving); return `<button class="btn primary" id="wfootbtn" data-sheet="${f.action}"${f.disabled ? " disabled" : ""}>${f.label}</button>`; })()}${sheet.verdict ? "" : `<div class="muted small">Pick a verdict on step 1 to save.</div>`}</div>
  </div></div>`;
}

// A confirmation that sits on top of whatever is open. Buttons carry data-confirm="yes" or "no".
// Short on purpose: the title, which wine, and the two buttons.
export function confirmHtml({ title, body = "", yes = "Delete", error = "", busy = false }) {
  return `<div class="overlay top"><div class="sheet small" role="alertdialog" aria-label="${esc(title)}">
    <div class="serif big">${esc(title)}</div>${body ? `<div class="serif confirmname">${body}</div>` : ""}
    <div id="confirmErr" class="err">${esc(error)}</div>
    <div class="two"><button class="btn outline" data-confirm="no"${busy ? " disabled" : ""}>Cancel</button><button class="btn danger" data-confirm="yes"${busy ? " disabled" : ""}>${esc(yes)}</button></div></div></div>`;
}

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
    <div class="sheethead"><div class="sheettitle"><div class="serif big">${esc(say("add_title"))}</div><div class="muted small">Enter what is on the bottle. Missing something? Save it anyway and finish it later.</div></div>
      <div class="sheetbtns"><button class="xbtn" data-action="closeform" aria-label="Close">&times;</button></div></div>
    <div id="formPhotos" class="photoarea top">${formPhotosHtml(form)}</div>
    <input class="field" data-form="producer" placeholder="Producer" value="${esc(form.producer)}">
    <input class="field" data-form="wine_name" placeholder="Wine or cuvée" value="${esc(form.wine_name)}">
    <select class="field" data-form="vintage" aria-label="Vintage">${yearOptions(form)}</select>
    ${grapeAndPlaceInputs(form, "form")}
    <div class="three">${styles}</div>
    <div id="formErr" class="err">${esc(error)}</div>
    <button class="btn primary" data-action="addrate">Rate it now</button>
    <button class="btn outline" data-action="addnorate">Add without rating</button></div></div>`;
}

// "Speak in" picker and the line where fixed wine words are listed (app.js fills data-wordfix). Used next to every Speak button.
export const speakLangHtml = () => `<select class="sortsel speaklang" data-speaklang aria-label="Speak in">${SPEECH_LANGS.map((l) => `<option value="${l.id}"${l.id === speechLangNow() ? " selected" : ""}>Speak in: ${esc(l.label)}</option>`).join("")}</select>`;
export const wordFixHtml = () => `<div class="wordfix" data-wordfix role="status"></div>`;

// ---------------------------------------------------------------- a quick note (voice or typed), logged in the journal
// qn: { wine, text, listening, interim, error, saving }. The note is saved as a journal entry; if no wine is named it shows as an untitled, incomplete wine to finish later.
export function quickNoteHtml(qn, speech) {
  return `<div class="overlay"><div class="sheet" id="qnPanel">
    <div class="sheethead"><div class="sheettitle"><div class="serif big">${esc(say("note_title"))}</div><div class="muted small">${speech ? "Tap the microphone and talk, or type." : "Type your note, or use the microphone key on your keyboard."} It is saved in your Journal in your own words.</div></div>
      <div class="sheetbtns"><button class="xbtn" data-action="qn:close" aria-label="Close">&times;</button></div></div>
    <input class="field" data-qn="wine" placeholder="Which wine? (optional)" value="${esc(qn.wine)}" autocomplete="off">
    <textarea class="field" data-qn="text" rows="6" placeholder="What are you tasting or thinking?">${esc(qn.text)}</textarea>
    <div class="muted small micinterim" id="qnInterim" role="status">${esc(qn.interim || "")}</div>
    ${speech ? `<button type="button" class="btn outline" data-action="qn:mic" aria-pressed="${!!qn.listening}">${iconHtml("mic", 18)} ${qn.listening ? "Stop listening" : "Speak"}</button>${speakLangHtml()}` : ""}${wordFixHtml()}
    <div id="qnErr" class="err">${esc(qn.error || "")}</div>
    <button class="btn primary" data-action="qn:save"${qn.saving ? " disabled" : ""}>Save to my Journal</button></div></div>`;
}

// ---------------------------------------------------------------- blind tasting
// B: { step: home | guess | pick | result, guess, notes, q, typed, form, rows, error, listening, pending: [..], pickName }.
const RESULT_MARK = { match: "&#10003;", close: "~", miss: "&#10007;", skipped: "", unknown: "" };
export function blindHtml(B, cards, speech, styleLabel) {
  const head = (sub) => `<div class="sheethead"><div class="sheettitle"><div class="serif big">${esc(say("blind_title"))}</div><div class="muted small">${esc(sub)}</div></div>
      <div class="sheetbtns"><button class="xbtn" data-action="blind:close" aria-label="Close">&times;</button></div></div>`;
  const styles = [...WINE_STYLES.map((st) => [st.id, st.label])].map(([k, l]) => `<button class="vbtn tog${B.guess.style === k ? " on" : ""}" data-action="blind:style:${k}">${esc(l)}</button>`).join("");
  let body = "";
  if (B.step === "home") {
    const list = B.pending.map((b) => `<div class="pcard"><div class="small muted">Started ${esc(String(b.started).slice(0, 10))}</div><div class="ptext">${esc(GUESS_FIELDS.map((f) => b.guess[f.id]).filter(Boolean).join(", ") || "No guess written yet")}</div>
      <div class="acts"><button class="pill dark" data-action="blind:resume:${esc(b.id)}">Reveal this one</button><button class="pill" data-action="blind:drop:${esc(b.id)}">Remove</button></div></div>`).join("");
    body = `${head("Taste first. Name the wine, then find out what it was.")}<button class="btn primary" data-action="blind:new">Start a new blind tasting</button>${list ? `<h3 class="serif" style="margin-top:18px">Waiting to be revealed</h3>${list}` : ""}`;
  } else if (B.step === "guess") {
    body = `${head("Write what you think it is. Skip anything you cannot tell.")}
      <div class="qlabel">Type of wine</div><div class="three">${styles}</div>
      <input class="field" data-bl="grape" placeholder="Grape (or grapes, separated by commas)" value="${esc(B.guess.grape)}" autocomplete="off">
      <input class="field" data-bl="country" placeholder="Country" value="${esc(B.guess.country)}" autocomplete="off">
      <input class="field" data-bl="region" placeholder="Region or appellation" value="${esc(B.guess.region)}" autocomplete="off">
      <input class="field" data-bl="vintage" placeholder="Vintage (a year, or NV)" value="${esc(B.guess.vintage)}" inputmode="numeric" autocomplete="off">
      <div class="qlabel">Your tasting notes</div>
      <textarea class="field" data-bl="notes" rows="5" placeholder="${esc(say("notes_hint"))}">${esc(B.notes)}</textarea>
      <div class="muted small micinterim" id="blInterim" role="status"></div>
      ${speech ? `<button type="button" class="btn outline" data-action="blind:mic" aria-pressed="${!!B.listening}">${iconHtml("mic", 18)} ${B.listening ? "Stop listening" : "Speak"}</button>${speakLangHtml()}` : ""}${wordFixHtml()}
      <div id="blErr" class="err">${esc(B.error || "")}</div>
      <button class="btn primary" data-action="blind:reveal">Reveal the wine</button>
      <button class="btn outline" data-action="blind:later">Save and reveal later</button>`;
  } else if (B.step === "pick") {
    const term = String(B.q || "").trim().toLowerCase();
    const hits = term ? cards.filter((c) => !c.archived && wineName(c).toLowerCase().includes(term)).slice(0, 8) : [];
    const results = hits.map((c) => `<button class="jrow" data-action="blind:pick:${esc(c.id)}"><span class="jl"><span class="serif trunc">${esc(wineName(c))}</span><span class="meta trunc">${esc([c.appellation || c.region, c.country].filter(Boolean).join(", "))}</span></span></button>`).join("");
    const tf = B.form, ts = [...WINE_STYLES.map((st) => [st.id, st.label])].map(([k, l]) => `<button class="vbtn tog${tf.style === k ? " on" : ""}" data-action="blind:tstyle:${k}">${esc(l)}</button>`).join("");
    body = `${head("Which wine was it?")}<input class="field" data-bl="q" placeholder="Search the catalog by producer or wine" value="${esc(B.q || "")}" autocomplete="off">
      ${term ? results || `<p class="muted small">Nothing matches.</p>` : ""}
      <button class="link block" data-action="blind:typed">${B.typed ? "Hide the form" : "It is not in the catalog: type it in"}</button>
      ${B.typed ? `<input class="field" data-bt="producer" placeholder="Producer" value="${esc(tf.producer)}"><input class="field" data-bt="wine_name" placeholder="Wine or cuv\u00e9e" value="${esc(tf.wine_name)}">
        <input class="field" data-bt="vintage" placeholder="Vintage (a year, or NV)" value="${esc(tf.vintage)}"><div class="three">${ts}</div>
        <input class="field" data-bt="grape" placeholder="Grape (optional)" value="${esc(tf.grape)}"><input class="field" data-bt="country" placeholder="Country (optional)" value="${esc(tf.country)}"><input class="field" data-bt="region" placeholder="Region (optional)" value="${esc(tf.region)}">
        <button class="btn primary" data-action="blind:revealtyped">Reveal</button>` : ""}
      <div id="blErr" class="err">${esc(B.error || "")}</div><button class="btn outline" data-action="blind:backguess">Back to my guess</button>`;
  } else {
    const rows = B.rows, sum = summarize(rows);
    const table = rows.map((r) => `<tr class="br ${r.result}"><td>${esc(r.label)}</td><td>${esc(r.guess || "-")}</td><td>${esc(r.actual || "-")}</td><td><span class="bmark" aria-hidden="true">${RESULT_MARK[r.result]}</span> ${esc(RESULT_WORDS[r.result])}</td></tr>`).join("");
    body = `${head(B.pickName || "The reveal")}<div class="serif" style="font-size:20px;margin:6px 0">${esc(B.pickName || "")}</div>
      <div class="otablewrap"><table class="otable btable"><thead><tr><th>Field</th><th>Your guess</th><th>The wine</th><th></th></tr></thead><tbody>${table}</tbody></table></div>
      <p class="ptext">${sum.of ? `You scored <b>${sum.points} of ${sum.of}</b>.` : "You did not guess anything the app can compare."} Only facts already on record for the wine are used.</p>
      <button class="btn primary" data-action="blind:rate">Rate this wine</button><button class="btn outline" data-action="blind:backpick">Choose another wine</button>`;
  }
  return `<div class="overlay"><div class="sheet" id="blindPanel">${body}</div></div>`;
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

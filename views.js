// Screens. Every function here takes data and returns an HTML string; nothing touches the network.
import {
  FAMILIARITY, INTEREST, FLAGS, VERDICTS, DIMS, GROUPS, GROUP_PAGE, SORTS, YEARS,
  esc, wineName, entryCard, entryName, verdictShort, groupEntries, filterEntries, sortCards,
} from "./logic.js";

// ---------------------------------------------------------------- drawings
const GLASS = { white: "#5F7440", sparkling: "#3E4B38", rose: "#8A5560", neutral: "#34403A", red: "#2C1C22" };
export function bottleSvg(style) {
  const type = ["red", "white", "sparkling", "rose"].includes(style) ? style : style === "fortified" ? "red" : "neutral";
  const foil = type === "sparkling" ? "#B9A15A" : "#7B1E3A";
  return `<svg class="bottle" viewBox="0 0 120 300" aria-hidden="true">
    <path d="M50 8 h20 v70 c0 22 28 34 28 62 v140 a10 10 0 0 1 -10 10 h-56 a10 10 0 0 1 -10 -10 v-140 c0 -28 28 -40 28 -62 z" fill="${GLASS[type]}"/>
    <rect x="48" y="6" width="24" height="26" rx="3" fill="${foil}"/>
    <rect x="32" y="170" width="56" height="86" rx="2" fill="#E9E4D6"/>
    <rect x="40" y="186" width="40" height="5" fill="#B8B29F"/><rect x="44" y="198" width="32" height="4" fill="#CFC9B7"/><rect x="44" y="210" width="32" height="4" fill="#CFC9B7"/>
    <rect x="36" y="100" width="7" height="150" rx="3" fill="#fff" opacity=".12"/></svg>`;
}
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

// ---------------------------------------------------------------- Discover
export function cardHtml(c) {
  const labels = ["recognize", "unknown", "had"].map((k) => `<div class="swipe-label" data-label="${k}" style="background:${FAMILIARITY[k].color}">${esc(FAMILIARITY[k].label)}</div>`).join("");
  return `<div class="card" id="card">
    <div class="image">${bottleSvg(c.style)}<span class="sample">sample image, real photo goes here</span>${labels}</div>
    <div class="body">
      ${c.vintage ? `<div class="vintage serif">${esc(c.vintage)}</div>` : ""}
      <div class="prow"><div class="producer serif">${esc(c.producer)}</div>${marksHtml(c)}</div>
      ${c.cuvee ? `<div class="cuvee serif">${esc(c.cuvee)}</div>` : ""}
      <div class="facts">${c.facts.map((f) => `<div class="${f.derived ? "derived" : ""}">${esc(f.text)}</div>`).join("")}</div>
      <div class="legend">Dotted underline: from wine rules, not printed on the label.</div>
    </div></div>`;
}
export function discoverHtml({ deck, interest, banner, counts }) {
  const bannerHtml = banner ? `<div class="banner" data-action="dismiss">${esc(banner)} (tap to dismiss)</div>` : "";
  if (!deck.length) {
    return `${bannerHtml}<div class="center"><div class="serif" style="font-size:22px">No more wines to show.</div>
      <div class="muted">If you expected some, check that the sample wines were published for testing.</div></div>`;
  }
  const sw = ["try", "nope"].map((k) => `<button data-action="interest:${k}" class="${interest === k ? "on" : ""}" style="${interest === k ? `background:${INTEREST[k].color}` : ""}">${INTEREST[k].label}</button>`).join("");
  return `${bannerHtml}
    <div class="cardwrap">${deck.length > 1 ? '<div class="behind"></div>' : ""}${cardHtml(deck[0])}</div>
    <div class="switch">${sw}</div>
    <p class="hint">Swipe or double-tap an edge of the card: left if you don't know it, right if you recognize it, top if you've had this bottle.</p>
    <p class="counts">Saved so far: ${counts.swipes} swipes, ${counts.journal} journal entries</p>`;
}

// ---------------------------------------------------------------- Swipes
const sortSelect = (id, value) =>
  `<select class="sortsel" data-sort="${id}" aria-label="Sort this list by">${SORTS.map((s) => `<option value="${s.id}"${s.id === value ? " selected" : ""}>Sort by: ${s.label}</option>`).join("")}</select>`;

function section(id, title, count, open, inner) {
  return `<div class="sect"><button class="sect-head" data-action="toggle:${id}" aria-expanded="${open}"><span>${esc(title)} (${count})</span><span class="chev">${open ? "▲" : "▼"}</span></button>${open ? `<div class="sect-body">${inner}</div>` : ""}</div>`;
}
function item(card, actions, extra = "") {
  const where = [card.appellation || card.grape, card.country].filter(Boolean).join(", ");
  return `<div class="item"><div class="iname"><span class="serif">${esc(wineName(card))}</span>${marksHtml(card, 16)}</div>
    <div class="meta">${esc(where)}${extra}</div><div class="acts">${actions}</div></div>`;
}
const pill = (action, label, dark) => `<button class="pill${dark ? " dark" : ""}" data-action="${action}">${esc(label)}</button>`;

export function swipesHtml(lists, sw) {
  const sortOf = (id) => sw.sort[id] || "recent";
  const listBody = (id, cards, actionsFor) => {
    if (!cards.length) return `<div class="muted small">Nothing here yet.</div>`;
    const sorted = sortCards(cards, sortOf(id), lists.order);
    return (cards.length > 1 ? sortSelect(id, sortOf(id)) : "") + sorted.map((c) => item(c, actionsFor(c))).join("");
  };
  const review = (c) => pill(`review:${c.id}`, "Review the wine", true);
  const parts = [];
  const isOpen = (id) => !!sw.open[id];
  parts.push(section("rec", "Recognized and interested", lists.rec.length, isOpen("rec"),
    listBody("rec", lists.rec, (c) => review(c) + pill(`setint:${c.id}:nope`, "Not interested"))));
  parts.push(section("unk", "Don't know it, interested", lists.unk.length, isOpen("unk"),
    listBody("unk", lists.unk, (c) => review(c) + pill(`setint:${c.id}:nope`, "Not interested"))));
  parts.push(section("notint", "Not interested", lists.notInt.length, isOpen("notint"),
    listBody("notint", lists.notInt, (c) => review(c) + pill(`setint:${c.id}:try`, "Interested"))));
  const triedBody = !lists.tried.length ? `<div class="muted small">Nothing here yet. Wines you rate are kept here.</div>`
    : (lists.tried.length > 1 ? sortSelect("tried", sortOf("tried")) : "") +
      sortCards(lists.tried, sortOf("tried"), lists.order).map((c) =>
        item(c, pill(`entry:${c.entry.id}`, "View review", true), `<br>${esc(verdictShort(c.entry.verdict) || "")}, ${esc(c.entry.consumed_on || "")}`)).join("");
  parts.push(section("tried", "Wines Tried from Discover", lists.tried.length, isOpen("tried"), triedBody));
  // Bottom of the page on purpose: these already appear in the Journal.
  const hadBody = !lists.had.length ? `<div class="muted small">Nothing here yet.</div>`
    : (lists.had.length > 1 ? sortSelect("had", sortOf("had")) : "") +
      sortCards(lists.had, sortOf("had"), lists.order).map((c) => {
        const entry = lists.entryOf.get(c.id);
        return item(c, entry ? pill(`entry:${entry.id}`, entry.verdict ? "View review" : "Rate this bottle", true) : pill(`review:${c.id}`, "Review the wine", true));
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

export function journalListHtml(entries, j) {
  const filtered = filterEntries(entries, { q: j.q, verdict: j.verdict });
  const groups = groupEntries(filtered, j.by);
  const searching = j.q.trim() !== "";
  if (!entries.length) return `<p class="muted">No wines logged yet. Swipe up on a bottle you've had, or tap "+ Add a wine".</p>`;
  if (!filtered.length) return `<p class="muted">No wines match.</p>`;
  const rows = (g) => {
    const limit = j.limits[g.key] || GROUP_PAGE;
    const shown = g.items.slice(0, limit).map((e) => {
      const c = entryCard(e); const v = verdictShort(e.verdict);
      return `<button class="jrow" data-action="entry:${e.id}"><span class="jl">
        <span class="iname"><span class="serif trunc">${esc(entryName(e))}</span>${marksHtml(c, 16)}</span>
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
export function sheetHtml(sheet, { saving = false, error = "" } = {}) {
  const verdicts = VERDICTS.map((v) => `<button class="vbtn${sheet.verdict === v.code ? " on" : ""}" data-sheet="verdict:${v.code}">${esc(v.label)}</button>`).join("");
  const dims = DIMS.map((d) => {
    const x = sheet.dims[d.key];
    return `<div class="dim"><div class="dimtop"><span>${d.name}</span><button id="reset-${d.key}" class="link" data-sheet="reset:${d.key}" style="visibility:${x.adjusted ? "visible" : "hidden"}">Reset</button></div>
      <div class="dimrow"><button class="round" data-sheet="nudge:${d.key}:-0.5" aria-label="Less ${d.name.toLowerCase()}">&minus;</button>
        <input type="range" min="1" max="5" step="0.1" value="${x.value}" data-dim="${d.key}" aria-label="${d.name}, from ${d.lo} to ${d.hi}">
        <button class="round" data-sheet="nudge:${d.key}:0.5" aria-label="More ${d.name.toLowerCase()}">+</button></div>
      <div class="dimlabels"><span>${d.lo}</span><span>${d.hi}</span></div></div>`;
  }).join("");
  const canSave = !!sheet.verdict && !saving;
  return `<div class="overlay"><div class="sheet" id="sheetPanel">
    <div class="sheethead"><div class="sheettitle"><div class="serif big">${esc(sheet.target.name)}</div><div class="muted small">How was it?</div></div>
      <div class="sheetbtns"><button class="pill wine" data-sheet="save"${canSave ? "" : " disabled"}>Save</button><button class="xbtn" data-sheet="close" aria-label="Close">&times;</button></div></div>
    <div class="verdicts">${verdicts}</div>
    <h3 class="serif">Wine structure</h3>${dims}
    <div class="two"><input class="field" type="date" data-field="date" value="${esc(sheet.date)}" aria-label="Date">
      <input class="field" inputmode="decimal" data-field="price" placeholder="Price you paid ($)" value="${esc(sheet.price)}"></div>
    <div class="two"><input class="field" data-field="food" placeholder="Food" value="${esc(sheet.food)}"><input class="field" data-field="occasion" placeholder="Occasion" value="${esc(sheet.occasion)}"></div>
    <textarea class="field" data-field="notes" rows="3" placeholder="Notes">${esc(sheet.notes)}</textarea>
    <div id="sheetErr" class="err">${esc(error)}</div>
    <button class="btn primary" data-sheet="save"${canSave ? "" : " disabled"}>Save to journal</button></div></div>`;
}

// ---------------------------------------------------------------- add a wine by hand
export function addFormHtml(form, error = "") {
  const yearOpts = `<option value="">Vintage (optional)</option><option value="NV"${form.vintage === "NV" ? " selected" : ""}>Non-vintage (NV)</option>` +
    YEARS.map((y) => `<option value="${y}"${String(y) === form.vintage ? " selected" : ""}>${y}</option>`).join("");
  const styles = [["red", "Red"], ["white", "White"], ["sparkling", "Sparkling"]].map(([k, l]) => `<button class="vbtn tog${form.style === k ? " on" : ""}" data-action="formstyle:${k}">${l}</button>`).join("");
  return `<div class="overlay"><div class="sheet" id="sheetPanel">
    <div class="sheethead"><div class="sheettitle"><div class="serif big">Add a wine you drank</div><div class="muted small">Enter what is on the bottle.</div></div>
      <div class="sheetbtns"><button class="xbtn" data-action="closeform" aria-label="Close">&times;</button></div></div>
    <input class="field" data-form="producer" placeholder="Producer (required)" value="${esc(form.producer)}">
    <input class="field" data-form="wine_name" placeholder="Wine or cuvée" value="${esc(form.wine_name)}">
    <select class="field" data-form="vintage" aria-label="Vintage">${yearOpts}</select>
    <input class="field" data-form="grape" placeholder="Grape (only if you know)" value="${esc(form.grape)}">
    <input class="field" data-form="region" placeholder="Region (only if you know)" value="${esc(form.region)}">
    <div class="three">${styles}</div>
    <div id="formErr" class="err">${esc(error)}</div>
    <button class="btn primary" data-action="addrate">Rate it now</button>
    <button class="btn outline" data-action="addnorate">Add without rating</button></div></div>`;
}


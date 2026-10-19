// The Food screens inside the More tab: pick a wine and see its plate, the pairing chart, and Edit food (tweak a dish, build a plate, plan a menu).
// Every function here takes the screen state and returns an HTML string or the next state; nothing touches the network or the page. The rules
// (what rates Ideal or Avoid, what a tweak changes) are in foods.js; app.js holds the state and the clicks. Loaded on first use, like owner.js.
import { esc } from "./logic.js?v=25";
import {
  WINE_KINDS, FOODS, GROUPS, TWEAKS, PARTS, RATING_ORDER, RATING_LABEL, kindById, foodById, grapesOf, plateFor, chartOf, pair, bestKinds,
  tweaksFor, applyTweaks, platePairs, menuFromDishes, menuFromWines,
} from "./foods.js?v=4";
export { setPairingOverrides } from "./foods.js?v=4";

// f: { screen, kind, grapes, group, cell, openDish, tweak: { dish, kind, applied }, plate, menu: { mode, dishes, kinds } }
export const initialFood = () => ({
  screen: "home", kind: "full-red", grapes: false, group: "all", cell: null, openDish: null,
  tweak: { dish: "grilled-fish", kind: "full-red", applied: [] },
  plate: { main: "beef", sauce: "jus", side: "mushroom", cook: "grill" },
  menu: { mode: "dishes", dishes: [], kinds: [] },
});

// ---------------------------------------------------------------- small pieces
// Each rating has a symbol as well as a colour, so the chart reads without colour.
const MARK = { ideal: "●●", good: "●", okay: "○", avoid: "✕" };
const badge = (r) => `<span class="frate ${r}"><i aria-hidden="true">${MARK[r]}</i> ${esc(RATING_LABEL[r])}</span>`;
const back = (to, label) => `<button class="link back" data-action="fd:go:${to}">‹ ${esc(label)}</button>`;
const legend = () => `<div class="flegend muted small" aria-label="What the marks mean">${RATING_ORDER.map((r) => `<span class="frate ${r}"><i aria-hidden="true">${MARK[r]}</i> ${esc(RATING_LABEL[r])}</span>`).join("")}</div>`;
const reasonsHtml = (p) => p.reasons.length ? `<ul class="freasons">${p.reasons.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : "";
const kindChips = (cur, verb) => `<div class="fchips">${WINE_KINDS.map((k) => `<button class="chip wide${k.id === cur ? " on" : ""}" data-action="fd:${verb}:${k.id}" aria-pressed="${k.id === cur}" title="${esc(k.hint)}">${esc(k.label)}</button>`).join("")}</div>`;
const note = () => `<p class="muted tiny fnote">General pairing guidance from the feel of a dish and a wine, not a fact about any one bottle or a taste test. The rules are still being read by our editors.</p>`;

// ---------------------------------------------------------------- screens
function homeScreen() {
  return `<div class="games food">${back("more", "More")}<h2 class="serif gh">Food</h2>
    <button class="gtile" data-action="fd:go:pick"><div class="serif gt-title">Pick a wine, see its plate</div>
      <div class="muted small">Choose a style of wine and see which foods are ideal, good, or best avoided.</div></button>
    <button class="gtile" data-action="fd:go:chart"><div class="serif gt-title">Pairing chart</div>
      <div class="muted small">Every food against every style of wine on one page.</div></button>
    <button class="gtile" data-action="fd:go:edit"><div class="serif gt-title">Edit food</div>
      <div class="muted small">Change a dish, build a plate, or plan a whole menu so it suits the wine.</div></button>${note()}</div>`;
}

function dishChip(p, open) {
  return `<button class="fdish ${p.rating}${open ? " on" : ""}" data-action="fd:dish:${esc(p.food)}" aria-pressed="${open}"><i aria-hidden="true">${MARK[p.rating]}</i> ${esc(p.name)}</button>`;
}
function dishDetail(f, kind) {
  const fd = f.openDish && foodById(f.openDish); if (!fd) return "";
  const p = pair(fd, kind);
  return `<div class="pcard fdetail"><div class="serif">${esc(fd.name)} with ${esc(kind.label.toLowerCase())}</div><div class="fdrow">${badge(p.rating)}${p.pinned ? ` <span class="muted tiny">set by hand</span>` : ""}</div>${reasonsHtml(p)}
    <button class="btn outline fbtn" data-action="fd:tweakthis:${esc(fd.id)}:${esc(kind.id)}">Tweak this dish for ${esc(kind.label.toLowerCase())}</button></div>`;
}
function pickScreen(f) {
  const kind = kindById(f.kind) || WINE_KINDS[0], plate = plateFor(kind.id), grapes = grapesOf(kind.id);
  const shelves = RATING_ORDER.map((r) => `<div class="fshelf ${r}"><div class="fshead">${badge(r)} <span class="muted tiny">${plate.shelves[r].length}</span></div>
    <div class="fdishes">${plate.shelves[r].length ? plate.shelves[r].map((p) => dishChip(p, f.openDish === p.food)).join("") : `<span class="muted small">Nothing here.</span>`}</div></div>`).join("");
  return `<div class="games food">${back("home", "Food")}<h2 class="serif gh">Pick a wine</h2>${kindChips(kind.id, "kind")}
    <div class="pcard"><div class="serif">${esc(kind.label)}</div><div class="muted small">${esc(kind.hint)}</div>
      ${grapes.length ? `<button class="link small" data-action="fd:grapes" aria-expanded="${!!f.grapes}">${f.grapes ? "Hide" : "Show"} the grapes in this style</button>${f.grapes ? `<div class="muted small fgrapes">${grapes.map(esc).join(", ")}</div>` : ""}` : ""}</div>
    ${legend()}${shelves}${dishDetail(f, kind)}${note()}</div>`;
}

function chartScreen(f) {
  const foods = f.group === "all" ? FOODS : FOODS.filter((x) => x.group === f.group);
  const rows = chartOf(foods);
  const head = `<tr><th class="fsticky"></th>${WINE_KINDS.map((k) => `<th scope="col"><span>${esc(k.label)}</span></th>`).join("")}</tr>`;
  const body = rows.map((r) => `<tr><th scope="row" class="fsticky">${esc(r.food.name)}</th>${r.cells.map((c) => `<td><button class="fc ${c.rating}${f.cell && f.cell.food === c.food && f.cell.kind === c.kind ? " on" : ""}" data-action="fd:cell:${esc(c.food)}:${esc(c.kind)}" aria-label="${esc(r.food.name)} with ${esc(kindById(c.kind).label)}: ${esc(RATING_LABEL[c.rating])}"><i aria-hidden="true">${MARK[c.rating]}</i></button></td>`).join("")}</tr>`).join("");
  let detail = "";
  if (f.cell) { const fd = foodById(f.cell.food), k = kindById(f.cell.kind); if (fd && k) { const p = pair(fd, k); detail = `<div class="pcard fdetail"><div class="serif">${esc(fd.name)} with ${esc(k.label.toLowerCase())}</div><div class="fdrow">${badge(p.rating)}</div>${reasonsHtml(p)}<button class="btn outline fbtn" data-action="fd:tweakthis:${esc(fd.id)}:${esc(k.id)}">Tweak this dish for ${esc(k.label.toLowerCase())}</button></div>`; } }
  return `<div class="games food">${back("home", "Food")}<h2 class="serif gh">Pairing chart</h2>
    <div class="fchips"><button class="chip wide${f.group === "all" ? " on" : ""}" data-action="fd:group:all" aria-pressed="${f.group === "all"}">All</button>${GROUPS.map((g) => `<button class="chip wide${f.group === g.id ? " on" : ""}" data-action="fd:group:${g.id}" aria-pressed="${f.group === g.id}">${esc(g.label)}</button>`).join("")}</div>
    ${legend()}<div class="fscroll" role="region" aria-label="Pairing chart, scrolls sideways" tabindex="0"><table class="fchart"><thead>${head}</thead><tbody>${body}</tbody></table></div>${detail}${note()}</div>`;
}

function editScreen() {
  return `<div class="games food">${back("home", "Food")}<h2 class="serif gh">Edit food</h2>
    <button class="gtile" data-action="fd:go:tweak"><div class="serif gt-title">Tweak a dish to fit my wine</div><div class="muted small">Pick a dish and a wine and see small changes that help them get along.</div></button>
    <button class="gtile" data-action="fd:go:plate"><div class="serif gt-title">Build a plate from parts</div><div class="muted small">Choose the main, the sauce, the side and how it is cooked and watch the wines change.</div></button>
    <button class="gtile" data-action="fd:go:menu"><div class="serif gt-title">Plan a menu around a wine</div><div class="muted small">Put courses in order, with a wine for each, light to rich.</div></button>${note()}</div>`;
}

function tweakScreen(f) {
  const t = f.tweak, fd = foodById(t.dish) || FOODS[0], kind = kindById(t.kind) || WINE_KINDS[0];
  const before = pair(fd, kind), changed = applyTweaks(fd, t.applied), after = pair(changed, kind);
  const options = GROUPS.map((g) => `<optgroup label="${esc(g.label)}">${FOODS.filter((x) => x.group === g.id).map((x) => `<option value="${esc(x.id)}"${x.id === fd.id ? " selected" : ""}>${esc(x.name)}</option>`).join("")}</optgroup>`).join("");
  const helpful = tweaksFor(fd, kind.id, 6), chosen = TWEAKS.filter((x) => t.applied.includes(x.id));
  const list = [...helpful, ...chosen.filter((c) => !helpful.some((h) => h.id === c.id))];
  const rows = list.map((x) => `<label class="ftweak"><input type="checkbox" data-fd-tweak="${esc(x.id)}"${t.applied.includes(x.id) ? " checked" : ""}> <span><b>${esc(x.label)}</b><span class="muted small fwhy">${esc(x.why)}</span></span></label>`).join("");
  const alt = bestKinds(changed, 2).filter((b) => b.kind !== kind.id);
  return `<div class="games food">${back("edit", "Edit food")}<h2 class="serif gh">Tweak a dish</h2>
    <label class="muted small" for="fdDish">Dish</label><select id="fdDish" class="field" data-fd-select="tdish">${options}</select>
    <div class="muted small ftop">Wine</div>${kindChips(kind.id, "tkind")}
    <div class="pcard"><div class="fdrow"><span class="muted small">As it is</span> ${badge(before.rating)}${t.applied.length ? `<span class="muted small">→ with your changes</span> ${badge(after.rating)}` : ""}</div>${reasonsHtml(t.applied.length ? after : before)}</div>
    <h3 class="psub">${list.length ? "Changes that help" : "No simple change helps"}</h3>
    ${list.length ? `<div class="ftweaks">${rows}</div>` : `<p class="muted small">${before.rating === "ideal" ? "This dish already suits that wine." : `A different wine may suit this dish better: ${alt.length ? alt.map((b) => esc(kindById(b.kind).label.toLowerCase())).join(" or ") : "see Pick a wine"}.`}</p>`}
    ${t.applied.length ? `<button class="link small" data-action="fd:tclear">Start again</button>` : ""}${note()}</div>`;
}

function plateScreen(f) {
  const sel = f.plate, ranked = platePairs(sel), top = ranked.slice(0, 5);
  const slot = (title, key, items) => `<div class="fslot"><div class="muted small">${esc(title)}</div><div class="fchips">${items.map((x) => `<button class="chip wide${sel[key] === x.id ? " on" : ""}" data-action="fd:plate:${key}:${esc(x.id)}" aria-pressed="${sel[key] === x.id}">${esc(x.label)}</button>`).join("")}</div></div>`;
  return `<div class="games food">${back("edit", "Edit food")}<h2 class="serif gh">Build a plate</h2>
    ${slot("The main", "main", PARTS.main)}${slot("The sauce", "sauce", PARTS.sauce)}${slot("On the side", "side", PARTS.side)}${slot("How it is cooked", "cook", PARTS.cook)}
    <h3 class="psub">Wines that suit this plate</h3>${legend()}
    <div class="fplate">${top.map((p) => `<div class="fprow"><span class="serif">${esc(kindById(p.kind).label)}</span>${badge(p.rating)}</div>`).join("")}</div>
    <p class="muted small">Worst fit: ${esc(kindById(ranked[ranked.length - 1].kind).label.toLowerCase())}.</p>${note()}</div>`;
}

function menuScreen(f) {
  const m = f.menu;
  const modes = `<div class="fchips"><button class="chip wide${m.mode === "dishes" ? " on" : ""}" data-action="fd:mmode:dishes" aria-pressed="${m.mode === "dishes"}">Start from dishes</button><button class="chip wide${m.mode === "wines" ? " on" : ""}" data-action="fd:mmode:wines" aria-pressed="${m.mode === "wines"}">Start from wines</button></div>`;
  let pick, plan = "";
  if (m.mode === "dishes") {
    pick = GROUPS.map((g) => `<div class="muted small ftop">${esc(g.label)}</div><div class="fchips">${FOODS.filter((x) => x.group === g.id).map((x) => { const n = m.dishes.indexOf(x.id) + 1; return `<button class="chip wide${n ? " on" : ""}" data-action="fd:mdish:${esc(x.id)}" aria-pressed="${!!n}">${n ? `${n}. ` : ""}${esc(x.name)}</button>`; }).join("")}</div>`).join("");
    if (m.dishes.length) {
      const plan0 = menuFromDishes(m.dishes), same = plan0.suggestedOrder.join() === m.dishes.join();
      plan = `<h3 class="psub">Your menu</h3>${plan0.courses.map((c, i) => `<div class="pcard fcourse"><div class="muted tiny">Course ${i + 1}</div><div class="serif">${esc(c.food.name)}</div><div class="fdrow"><b>${esc(c.kind.label)}</b> ${badge(c.rating)}</div><div class="muted small">Also: ${c.others.map((o) => esc(o.kind.label.toLowerCase())).join(", ")}</div></div>`).join("")}
        ${plan0.notes.map((n) => `<div class="okbox fnote2">${esc(n.text)}</div>`).join("")}
        ${same ? "" : `<button class="btn outline fbtn" data-action="fd:mreorder">Put the courses in the natural order</button>`}`;
    }
  } else {
    pick = `<div class="muted small ftop">Choose the wines in the order you will serve them</div><div class="fchips">${WINE_KINDS.map((k) => { const n = m.kinds.indexOf(k.id) + 1; return `<button class="chip wide${n ? " on" : ""}" data-action="fd:mkind:${esc(k.id)}" aria-pressed="${!!n}">${n ? `${n}. ` : ""}${esc(k.label)}</button>`; }).join("")}</div>`;
    if (m.kinds.length) {
      const plan0 = menuFromWines(m.kinds), same = plan0.suggestedOrder.join() === m.kinds.join();
      plan = `<h3 class="psub">Your menu</h3>${plan0.courses.map((c, i) => `<div class="pcard fcourse"><div class="muted tiny">Course ${i + 1}</div><div class="serif">${esc(c.kind.label)}</div><div class="muted small">Serve with: ${c.dishes.map((d) => esc(d.name)).join(", ") || "nothing rates well"}</div></div>`).join("")}
        ${plan0.notes.map((n) => `<div class="okbox fnote2">${esc(n.text)}</div>`).join("")}
        ${same ? "" : `<button class="btn outline fbtn" data-action="fd:mreorder">Put the wines in the natural order</button>`}`;
    }
  }
  return `<div class="games food">${back("edit", "Edit food")}<h2 class="serif gh">Plan a menu</h2>${modes}${pick}${plan}
    ${(m.dishes.length || m.kinds.length) ? `<button class="link small" data-action="fd:mclear">Clear the menu</button>` : ""}${note()}</div>`;
}

export function foodHtml(f) {
  switch (f.screen) {
    case "pick": return pickScreen(f);
    case "chart": return chartScreen(f);
    case "edit": return editScreen();
    case "tweak": return tweakScreen(f);
    case "plate": return plateScreen(f);
    case "menu": return menuScreen(f);
    default: return homeScreen();
  }
}

// ---------------------------------------------------------------- the next state for a click (fd:verb:a:b)
const toggleIn = (list, id) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
export function foodAction(f, verb, a, b) {
  switch (verb) {
    case "go": return { ...f, screen: a, cell: null, openDish: null };
    case "kind": return { ...f, kind: a, openDish: null };
    case "grapes": return { ...f, grapes: !f.grapes };
    case "dish": return { ...f, openDish: f.openDish === a ? null : a };
    case "group": return { ...f, group: a, cell: null };
    case "cell": return { ...f, cell: f.cell && f.cell.food === a && f.cell.kind === b ? null : { food: a, kind: b } };
    case "tweakthis": return { ...f, screen: "tweak", tweak: { dish: a, kind: b, applied: [] } };
    case "tdish": return { ...f, tweak: { ...f.tweak, dish: a, applied: [] } };
    case "tkind": return { ...f, tweak: { ...f.tweak, kind: a, applied: [] } };
    case "ttoggle": return { ...f, tweak: { ...f.tweak, applied: toggleIn(f.tweak.applied, a) } };
    case "tclear": return { ...f, tweak: { ...f.tweak, applied: [] } };
    case "plate": return { ...f, plate: { ...f.plate, [a]: b } };
    case "mmode": return { ...f, menu: { ...f.menu, mode: a } };
    case "mdish": return { ...f, menu: { ...f.menu, dishes: toggleIn(f.menu.dishes, a) } };
    case "mkind": return { ...f, menu: { ...f.menu, kinds: toggleIn(f.menu.kinds, a) } };
    case "mclear": return { ...f, menu: { ...f.menu, dishes: [], kinds: [] } };
    case "mreorder": return { ...f, menu: f.menu.mode === "dishes" ? { ...f.menu, dishes: menuFromDishes(f.menu.dishes).suggestedOrder } : { ...f.menu, kinds: menuFromWines(f.menu.kinds).suggestedOrder } };
    default: return f;
  }
}

// At a restaurant: the screens in the More tab. The player says what they will eat, the occasion and how adventurous tonight is, gives the wine list
// (typed or pasted for now; photo reading is not switched on yet, the slot is here), checks what the app read from it, and gets three picks and a ranked list.
// Every function takes the screen state and returns an HTML string or the next state; nothing touches the network or the page. The rules are in
// winelist.js (reading the list from stated words only) and restaurant.js (the advice); app.js holds the state, the clicks and the saving.
// Loaded on first use, like foodview.js. Everything here works with no connection.
import { esc } from "./logic.js?v=23";
import { FOODS, GROUPS, foodById, RATING_LABEL } from "./foods.js?v=3";
import { readList, toCard, missingWords } from "./winelist.js?v=2";
export { placeIndex, catalogIndex } from "./winelist.js?v=2";
import { OCCASIONS, ADVENTURES, occasionById, matchDish, advise } from "./restaurant.js?v=3";

// r: { step, diners: [{ text, dish }], occasion, adventure, text, read, fixes, result, open, ordered, place, saved, saving, photoNote, showSkipped, error, history }
export const foodName = (id) => (foodById(id) || {}).name || id;
export const initialRest = (history = null) => ({
  step: "home", diners: [{ text: "", dish: null }], occasion: "casual", adventure: 1, text: "", read: null, fixes: {}, result: null, open: null,
  ordered: [], place: "", saved: false, saving: false, photoNote: false, showSkipped: false, error: "", history,
});

const STYLE_CHOICES = [["red", "Red"], ["white", "White"], ["rose", "Rosé"], ["sparkling", "Sparkling"], ["fortified", "Fortified"]];
const STYLE_WORD = { red: "Red", white: "White", rose: "Rosé", sparkling: "Sparkling", fortified: "Fortified" };
const nav = (back, next, nextLabel, disabled = false) => `<div class="rnav">${back ? `<button class="btn outline rback" data-action="rs:go:${back}">Back</button>` : ""}<button class="btn primary rnext" data-action="${next}"${disabled ? " disabled" : ""}>${esc(nextLabel)}</button></div>`;
const head = (title, step, of) => `<button class="link back" data-action="rs:go:home">‹ At a restaurant</button><div class="muted tiny rstep">Step ${step} of ${of}</div><h2 class="serif gh">${esc(title)}</h2>`;
const note = () => `<p class="muted tiny fnote">General guidance from the feel of a dish and a wine, and from what the list says. It is not a fact about any one bottle. The rules are still being read by our editors.</p>`;
const dateWord = (d) => { try { return new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); } catch (_) { return d || ""; } };

// ---------------------------------------------------------------- screens
function home(r, open) {
  const past = r.history && r.history.length ? `<h3 class="psub">Past visits</h3>${r.history.slice(0, 8).map((v) => `<div class="pcard rvisit"><div class="rvhead"><span class="serif">${esc(v.place_name || "A restaurant")}</span><span class="muted tiny">${esc(dateWord(v.visited_on))}</span></div>
      <div class="muted small">${esc((occasionById(v.occasion) || {}).label || "")}${v.ordered && v.ordered.length ? ` · You ordered ${esc(v.ordered.join(", "))}` : ""}</div>
      <button class="link tiny" data-action="rs:hide:${esc(v.id)}">Remove from my list</button></div>`).join("")}` : "";
  if (!open) return `<div class="games rest"><button class="link back" data-action="game:more">‹ More</button><h2 class="serif gh">At a restaurant</h2><div class="pcard"><div class="serif">Coming soon</div><p class="muted small">Tell us what you are eating and the occasion, give us the wine list, and we will suggest wines that suit the food and your taste.</p></div></div>`;
  return `<div class="games rest"><button class="link back" data-action="game:more">‹ More</button><h2 class="serif gh">At a restaurant</h2>
    <p class="ptext">Tell us what you are eating and the occasion, give us the wine list, and we will suggest wines that suit the food and your taste.</p>
    <button class="btn primary" data-action="rs:start">Start</button>${past}${note()}</div>`;
}

function eat(r) {
  const options = (cur) => `<option value="">Choose the closest dish</option>${GROUPS.map((g) => `<optgroup label="${esc(g.label)}">${FOODS.filter((x) => x.group === g.id).map((x) => `<option value="${esc(x.id)}"${x.id === cur ? " selected" : ""}>${esc(x.name)}</option>`).join("")}</optgroup>`).join("")}</optgroup>`;
  const rows = r.diners.map((d, i) => {
    const m = d.text.trim() && !d.dish ? "We did not recognise that dish. Choose the closest one below, or leave it out." : "";
    return `<div class="pcard rdiner"><div class="fdrow"><b>${r.diners.length > 1 ? `Person ${i + 1}` : "What are you having?"}</b>${r.diners.length > 1 ? `<button class="link tiny" data-action="rs:ddrop:${i}">Remove</button>` : ""}</div>
      <input class="field" data-rs-diner="${i}" placeholder="For example: ribeye steak, salmon, mushroom risotto" aria-label="Dish for person ${i + 1}" value="${esc(d.text)}" autocomplete="off">
      <select class="field" data-rs-dish="${i}" aria-label="Choose a dish">${options(d.dish)}</select>
      ${d.dish ? `<div class="muted small rmatch">Matched: ${esc(foodById(d.dish).name)}</div>` : m ? `<div class="muted small rmatch">${esc(m)}</div>` : ""}</div>`;
  }).join("");
  return `<div class="games rest">${head("What will you eat?", 1, 5)}${rows}
    <button class="btn outline" data-action="rs:dadd">+ Add another person</button>
    <p class="muted small">Skip this step to rank on your taste and the occasion alone.</p>${nav("", "rs:go:occasion", "Next")}${note()}</div>`;
}

function occasion(r) {
  return `<div class="games rest">${head("What is the occasion?", 2, 5)}${OCCASIONS.map((o) => `<button class="gtile${r.occasion === o.id ? " on" : ""}" data-action="rs:occ:${o.id}" aria-pressed="${r.occasion === o.id}"><div class="serif gt-title">${esc(o.label)}</div><div class="muted small">${esc(o.blurb)}</div></button>`).join("")}${nav("eat", "rs:go:adventure", "Next")}</div>`;
}
function adventure(r) {
  return `<div class="games rest">${head("How adventurous tonight?", 3, 5)}${ADVENTURES.map((a) => `<button class="gtile${r.adventure === a.id ? " on" : ""}" data-action="rs:adv:${a.id}" aria-pressed="${r.adventure === a.id}"><div class="serif gt-title">${esc(a.label)}</div><div class="muted small">${esc(a.blurb)}</div></button>`).join("")}${nav("occasion", "rs:go:list", "Next")}</div>`;
}

function list(r) {
  return `<div class="games rest">${head("The wine list", 4, 5)}
    <p class="ptext">Type or paste the wines, one to a line, with the year and price if the list has them. Section headings such as Red and White help.</p>
    <textarea class="field rtext" data-rs-list rows="10" aria-label="The wine list" placeholder="Whites&#10;2021 Sancerre  62&#10;Chablis Premier Cru 2019  78&#10;Reds&#10;2018 Barolo  120">${esc(r.text)}</textarea>
    <button class="btn outline" data-action="rs:photo">Take a photo of the list</button>
    ${r.photoNote ? `<div class="okbox rnote">Reading a photo of the list is not switched on yet. For now, type or paste the wines into the box above; the photo step will fill this same box.</div>` : ""}
    ${r.error ? `<div class="err">${esc(r.error)}</div>` : ""}${nav("adventure", "rs:read", "Read the list")}</div>`;
}

function check(r) {
  const rows = r.read.cards.map(({ line, card }) => {
    const fix = r.fixes[line.n] || {};
    if (fix.drop) return `<div class="pcard rline dropped"><span class="muted small">${esc(line.name)}</span> <button class="link tiny" data-action="rs:undrop:${line.n}">Put back</button></div>`;
    const c = r.fixed ? r.fixed[line.n] || card : card;
    const stated = [c.style !== "unknown" ? STYLE_WORD[c.style] : "", ...(c.grapes || []), c.appellation || c.region || (c.source === "list" ? c.country : "")].filter(Boolean);
    const miss = missingWords(c);
    return `<div class="pcard rline${c.confidence === "low" ? " low" : ""}"><div class="rlhead"><b>${esc(c.source === "catalog" ? `${c.vintage} ${c.producer} ${c.cuvee}`.trim() : line.name)}</b><span class="muted small">${esc([line.vintage, line.price ? line.price.text : ""].filter(Boolean).join(" · "))}</span></div>
      <div class="muted small">${c.source === "catalog" ? "In our catalog. " : ""}${stated.length ? `Reads as: ${esc(stated.join(", "))}.` : "Nothing stated."}${miss ? ` <span class="rmiss">${esc(miss)}</span>` : ""}</div>
      ${c.confidence === "high" ? "" : c.confidence !== "low" && !(r.editing || {})[line.n] ? `<button class="link tiny" data-action="rs:edit:${line.n}">Fix what it reads</button>` : `<div class="fchips rfix">${STYLE_CHOICES.map(([id, label]) => `<button class="chip wide${c.style === id ? " on" : ""}" data-action="rs:fixstyle:${line.n}:${id}" aria-pressed="${c.style === id}">${esc(label)}</button>`).join("")}
        <input class="field rgrape" data-rs-grape="${line.n}" placeholder="Grape (optional)" aria-label="Grape for ${esc(line.name)}" value="${esc(fix.grape || "")}" autocomplete="off"></div>`}
      <button class="link tiny" data-action="rs:drop:${line.n}">Not a wine, remove</button></div>`;
  }).join("");
  const kept = r.read.cards.filter((x) => !(r.fixes[x.line.n] || {}).drop).length;
  const skipped = r.read.skipped.length ? `<button class="link small" data-action="rs:skipped" aria-expanded="${r.showSkipped}">${r.showSkipped ? "Hide" : "Show"} ${r.read.skipped.length} line${r.read.skipped.length === 1 ? "" : "s"} that were not wines</button>${r.showSkipped ? `<ul class="muted small">${r.read.skipped.map((s) => `<li>${esc(s.raw)}</li>`).join("")}</ul>` : ""}` : "";
  return `<div class="games rest">${head("Check the list", 5, 5)}<p class="ptext">${kept} wine${kept === 1 ? "" : "s"} read. Fix anything that is wrong: a line the list does not describe is not judged unless you say what it is.</p>${rows}${skipped}${nav("list", "rs:results", "Get my picks", kept === 0)}</div>`;
}

function wineCard(p, open, ordered, pick = true) {
  const id = p.card.id, price = p.card.priceText;
  return `<div class="pcard rpick${open ? " open" : ""}">${p.pick && pick ? `<div class="rlabel">${esc(p.pick)}</div>` : ""}
    <button class="rwine" data-action="rs:open:${esc(id)}" aria-expanded="${open}"><span class="serif">${esc(p.label || p.name)}</span><span class="muted small">${esc(price)}${p.kind ? ` · ${esc(p.kind.label)}` : ""}</span></button>
    ${open || p.pick ? `<ul class="freasons">${p.why.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
    ${open && p.dishes.length > 1 ? `<div class="muted small">${p.dishes.map((d) => `${esc(d.name)}: ${esc(RATING_LABEL[d.rating])}`).join(" · ")}</div>` : ""}
    <button class="btn outline fbtn${ordered.includes(id) ? " on" : ""}" data-action="rs:order:${esc(id)}" aria-pressed="${ordered.includes(id)}">${ordered.includes(id) ? "✓ I ordered this" : "I ordered this"}</button></div>`;
}
function results(r) {
  const R = r.result;
  if (!R.picks.length && !R.ranked.length) return `<div class="games rest"><button class="link back" data-action="rs:go:check">‹ Check the list</button><h2 class="serif gh">Your picks</h2><div class="pcard"><p class="ptext">${esc((R.notes && R.notes[0]) || "Nothing on the list could be judged.")}</p></div></div>`;
  const saved = r.saved ? `<div class="okbox">Saved to your visits.</div>` : "";
  return `<div class="games rest"><button class="link back" data-action="rs:go:check">‹ Check the list</button><h2 class="serif gh">Your picks</h2>
    ${(R.notes || []).map((n) => `<div class="muted small">${esc(n)}</div>`).join("")}
    ${R.toast ? wineCard(R.toast, r.open === R.toast.card.id, r.ordered) : ""}
    ${R.picks.map((p) => wineCard(p, r.open === p.card.id, r.ordered)).join("")}
    <h3 class="psub">The whole list, best first</h3>
    ${R.ranked.map((p, i) => `<div class="rrank"><span class="muted small rnum">${i + 1}</span><div class="rrbody">${wineCard({ ...p, pick: "" }, r.open === p.card.id, r.ordered, false)}</div></div>`).join("")}
    ${R.unjudged.length ? `<h3 class="psub">Not enough on the list to judge</h3>${R.unjudged.map((u) => `<div class="pcard rline low"><b>${esc(u.card.cuvee)}</b> <span class="muted small">${esc(u.card.priceText)}</span><div class="muted small">${esc((u.why || [""])[0])}</div></div>`).join("")}` : ""}
    <h3 class="psub">Save this visit</h3><input class="field" data-rs-place placeholder="Where are you? (optional)" aria-label="Where are you" value="${esc(r.place)}" autocomplete="off">
    <button class="btn outline" data-action="rs:save"${r.saving || r.saved ? " disabled" : ""}>${r.saving ? "Saving…" : r.saved ? "Saved" : "Save this visit"}</button>${saved}
    <div class="rnav"><button class="btn outline rback" data-action="rs:start">Start again</button><button class="btn primary rnext" data-action="rs:go:home">Done</button></div>${note()}</div>`;
}

export function restHtml(r, flags = {}) {
  switch (r.step) {
    case "eat": return eat(r);
    case "occasion": return occasion(r);
    case "adventure": return adventure(r);
    case "list": return list(r);
    case "check": return r.read ? check(r) : list(r);
    case "results": return r.result ? results(r) : home(r, flags.open);
    default: return home(r, flags.open);
  }
}

// ---------------------------------------------------------------- the next state for a click (rs:verb:a:b)
const toggleIn = (list, id) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
// deps: { catalog, places, model, refs, crowd, journal, states } from app.js
export function restAction(r, verb, a, b, deps = {}) {
  switch (verb) {
    case "go": return { ...r, step: a, error: "" };
    case "start": return { ...initialRest(r.history), step: "eat" };
    case "dadd": return { ...r, diners: [...r.diners, { text: "", dish: null }] };
    case "ddrop": return { ...r, diners: r.diners.filter((_, i) => i !== Number(a)) };
    case "dtext": { const d = r.diners.map((x, i) => (i === Number(a) ? { text: b, dish: (matchDish(b) || {}).id || null } : x)); return { ...r, diners: d }; }
    case "dpick": return { ...r, diners: r.diners.map((x, i) => (i === Number(a) ? { ...x, dish: b || null } : x)) };
    case "occ": return { ...r, occasion: a };
    case "adv": return { ...r, adventure: Number(a) };
    case "ltext": return { ...r, text: a };
    case "photo": return { ...r, photoNote: true };
    case "read": {
      const read = readList(r.text, { catalog: deps.catalog || [], places: deps.places || [] });
      if (!read.cards.length) return { ...r, error: "No wines found yet. Type or paste at least one wine, with the year or price if the list has them." };
      return { ...r, read, fixes: {}, fixed: null, step: "check", error: "", result: null, saved: false, ordered: [] };
    }
    case "skipped": return { ...r, showSkipped: !r.showSkipped };
    case "fixstyle": return refix({ ...r, fixes: { ...r.fixes, [a]: { ...r.fixes[a], style: b } } }, deps);
    case "fixgrape": return refix({ ...r, fixes: { ...r.fixes, [a]: { ...r.fixes[a], grape: String(b || "").trim() } } }, deps);
    case "edit": return { ...r, editing: { ...(r.editing || {}), [a]: true } };
    case "drop": return { ...r, fixes: { ...r.fixes, [a]: { ...r.fixes[a], drop: true } } };
    case "undrop": return { ...r, fixes: { ...r.fixes, [a]: { ...r.fixes[a], drop: false } } };
    case "results": {
      const fixed = refix(r, deps).fixed || {};
      const cards = r.read.cards.filter((x) => !(r.fixes[x.line.n] || {}).drop).map((x) => ({ line: x.line, card: fixed[x.line.n] || x.card }));
      const dishes = r.diners.map((d) => (d.dish ? foodById(d.dish) : null)).filter(Boolean);
      const result = advise({ list: cards, dishes, occasion: r.occasion, adventure: r.adventure, catalog: deps.catalog || [], model: deps.model, refs: deps.refs || new Map(), crowd: deps.crowd || null, journal: deps.journal || [], states: deps.states || [] });
      return { ...r, result, step: "results", open: null, saved: false, ordered: [] };
    }
    case "open": return { ...r, open: r.open === a ? null : a };
    case "order": return { ...r, ordered: toggleIn(r.ordered, a), saved: false };
    case "place": return { ...r, place: a };
    default: return r;
  }
}
// Rebuilds the cards of the lines the player fixed (their word for the type or the grape), keeping the rest.
function refix(r, deps) {
  if (!r.read) return r;
  const fixed = { ...(r.fixed || {}) };
  r.read.cards.forEach(({ line }) => {
    const f = r.fixes[line.n]; if (!f || (!f.style && !f.grape)) { delete fixed[line.n]; return; }
    fixed[line.n] = toCard({ ...line, fix: f }, { catalog: deps.catalog || [], places: deps.places || [], placeIdx: deps.placeIdx, catalogIdx: deps.catalogIdx });
  });
  return { ...r, fixed };
}

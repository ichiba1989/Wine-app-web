// The professional tasting grid: a structured, more detailed way to assess a wine, for people with the "professional" tier.
// It follows the usual order of a systematic tasting: appearance, nose, palate, conclusions. The words are the common industry terms;
// it is not a copy of any organization's official form.
// The grid is an extra on top of the normal rating. Its answers for acidity, tannin, body, sweetness, oak and bubbles also move the
// five structure sliders, so the palate and the Discover deck keep working from the same lines for everyone.
// The rules at the top are pure (no browser, no network). The functions at the bottom talk to Supabase.
import { esc, dimsFor } from "./logic.js?v=11";

export const METHOD = "grid1";
export const FEATURE = "proTasting";

const LEVEL = ["low", "medium -", "medium", "medium +", "high"];
const STRENGTH = ["light", "medium -", "medium", "medium +", "pronounced"];
const BODY = ["light", "medium -", "medium", "medium +", "full"];
export const COLOURS = {
  white: ["lemon-green", "lemon", "gold", "amber", "brown"],
  rose: ["pink", "salmon", "orange"],
  red: ["purple", "ruby", "garnet", "tawny", "brown"],
};
const colourList = (style) => (style === "red" || style === "fortified" ? COLOURS.red : style === "rose" ? COLOURS.rose : COLOURS.white);

// Aromas and flavours: a first level (red fruit, spice, earth ...) and a second level that opens when you tap it
// (strawberry, raspberry, red cherry ...). The same list is used for the nose and the palate.
export const TAG_TREE = [
  { name: "citrus", children: ["lemon", "lime", "grapefruit", "orange peel"] },
  { name: "green fruit", children: ["green apple", "pear", "gooseberry"] },
  { name: "stone fruit", children: ["peach", "apricot", "nectarine"] },
  { name: "tropical fruit", children: ["banana", "lychee", "mango", "passion fruit", "pineapple"] },
  { name: "red fruit", children: ["strawberry", "raspberry", "red cherry", "cranberry", "red plum"] },
  { name: "black fruit", children: ["blackcurrant", "blackberry", "black cherry", "black plum", "blueberry"] },
  { name: "dried or cooked fruit", children: ["fig", "prune", "raisin", "jam", "stewed fruit"] },
  { name: "floral", children: ["blossom", "rose", "violet", "honeysuckle"] },
  { name: "herbal or green", children: ["grass", "green pepper", "mint", "eucalyptus", "thyme"] },
  { name: "spice", children: ["black pepper", "licorice", "clove", "cinnamon", "nutmeg"] },
  { name: "oak", children: ["vanilla", "toast", "smoke", "cedar", "coconut"] },
  { name: "winemaking", children: ["butter", "cream", "yeast", "biscuit or brioche"] },
  { name: "earth and mineral", children: ["wet stone", "chalk", "flint", "earth", "forest floor", "mushroom"] },
  { name: "age and other", children: ["honey", "almond", "hazelnut", "leather", "tobacco", "coffee", "chocolate", "caramel", "petrol"] },
];
// Every tag, first-level names first, so an index in this list identifies one tag.
export const CATEGORIES = TAG_TREE.map((c) => c.name);
export const TAG_LIST = [...CATEGORIES, ...TAG_TREE.flatMap((c) => c.children)];
export const parentOf = (tag) => (TAG_TREE.find((c) => c.children.includes(tag)) || {}).name || null;

// Every question. type "one" = pick one (tap again to clear), "tags" = pick any, "text" = free text.
// applies(style) decides whether a question is shown for this type of wine.
const hasDim = (style, key) => dimsFor(style).some((d) => d.key === key);
export const FIELDS = [
  { id: "clarity", section: "Appearance", label: "Clarity", type: "one", options: () => ["clear", "hazy"] },
  { id: "appIntensity", section: "Appearance", label: "Intensity", type: "one", scale: true, options: () => ["pale", "medium", "deep"] },
  { id: "colour", section: "Appearance", label: "Colour", type: "one", options: colourList },
  { id: "condition", section: "Nose", label: "Condition", type: "one", options: () => ["clean", "unclean"] },
  { id: "noseIntensity", section: "Nose", label: "Intensity", type: "one", scale: true, options: () => STRENGTH },
  { id: "development", section: "Nose", label: "Development", type: "one", options: () => ["youthful", "developing", "fully developed", "tired"] },
  { id: "aromas", section: "Nose", label: "Aromas", type: "tags" },
  { id: "sweetness", section: "Palate", label: "Sweetness", type: "one", scale: true, options: () => ["dry", "off-dry", "medium", "sweet", "luscious"] },
  { id: "acidity", section: "Palate", label: "Acidity", type: "one", scale: true, options: () => LEVEL },
  { id: "tannin", section: "Palate", label: "Tannin", type: "one", scale: true, options: () => LEVEL, applies: (st) => hasDim(st, "tannin") },
  { id: "alcohol", section: "Palate", label: "Alcohol", type: "one", scale: true, options: () => ["low", "medium", "high"] },
  { id: "body", section: "Palate", label: "Body", type: "one", scale: true, options: () => BODY },
  { id: "mousse", section: "Palate", label: "Mousse (bubbles)", type: "one", scale: true, options: () => ["delicate", "creamy", "aggressive"], applies: (st) => st === "sparkling" },
  { id: "oak", section: "Palate", label: "Oak", type: "one", scale: true, options: () => ["none", "subtle", "pronounced"] },
  { id: "flavourIntensity", section: "Palate", label: "Flavour intensity", type: "one", scale: true, options: () => STRENGTH },
  { id: "flavours", section: "Palate", label: "Flavours", type: "tags" },
  { id: "finish", section: "Palate", label: "Finish", type: "one", scale: true, options: () => ["short", "medium", "long"] },
  { id: "quality", section: "Conclusions", label: "Quality", type: "one", options: () => ["faulty", "poor", "acceptable", "good", "very good", "outstanding"] },
  { id: "readiness", section: "Conclusions", label: "Readiness", type: "one", options: () => ["too young", "drink now, may improve", "drink now, will not improve", "too old"] },
  { id: "note", section: "Conclusions", label: "Your notes", type: "text" },
];
// What a scale button says. "medium -" and "medium +" become "Med \u2212" and "Med +", so five steps fit on one line.
const SHORT = { "medium -": "Med \u2212", "medium +": "Med +", medium: "Med" };
export const shortLabel = (option) => SHORT[option] || option.charAt(0).toUpperCase() + option.slice(1);
export const SECTIONS = ["Appearance", "Nose", "Palate", "Conclusions"];
export const fieldsFor = (style) => FIELDS.filter((f) => !f.applies || f.applies(style));
const optionsOf = (f, style) => (f.options ? f.options(style) : []);

// ---------------------------------------------------------------- the rules
// Keeps only answers that are real options for this type of wine (so a stale answer, such as a colour for the wrong type, is dropped).
export function cleanGrid(grid, style) {
  const out = {}, g = grid || {};
  for (const f of fieldsFor(style)) {
    const v = g[f.id];
    if (f.type === "one") { if (optionsOf(f, style).includes(v)) out[f.id] = v; }
    else if (f.type === "tags") { const picked = TAG_LIST.filter((t) => Array.isArray(v) && v.includes(t)); if (picked.length) out[f.id] = picked; }
    else if (f.type === "text") { const t = String(v == null ? "" : v).trim().slice(0, 2000); if (t) out[f.id] = t; }
  }
  return out;
}
export const isEmptyGrid = (grid, style) => Object.keys(cleanGrid(grid, style)).length === 0;
export function gridCount(grid, style) {
  const total = fieldsFor(style).length, filled = Object.keys(cleanGrid(grid, style)).length;
  return { filled, total };
}
export function summaryText(grid, style) {
  const { filled, total } = gridCount(grid, style);
  return filled ? `${filled} of ${total} filled in` : "Not filled in yet";
}
// Tap an option: pick it, or clear it when it is already picked.
export function pickValue(grid, fieldId, optionIndex, style) {
  const f = fieldsFor(style).find((x) => x.id === fieldId);
  if (!f || f.type !== "one") return grid;
  const value = optionsOf(f, style)[optionIndex];
  if (value === undefined) return grid;
  const next = { ...grid };
  if (next[fieldId] === value) delete next[fieldId]; else next[fieldId] = value;
  return next;
}
// Tapping a first-level tag: it opens (and is picked). Tapping it again closes it; it stays picked only if one of its second-level tags is.
// Tapping a second-level tag picks or clears it, and picks its first-level tag. open is a list of "field:category" that are showing.
export function tapTag(grid, open, fieldId, tagIndex) {
  const f = FIELDS.find((x) => x.id === fieldId), tag = TAG_LIST[tagIndex];
  if (!f || f.type !== "tags" || tag === undefined) return { grid, open };
  const cur = Array.isArray(grid[fieldId]) ? grid[fieldId] : [];
  const put = (list) => { const next = { ...grid }; const ordered = TAG_LIST.filter((t) => list.includes(t)); if (ordered.length) next[fieldId] = ordered; else delete next[fieldId]; return next; };
  const category = CATEGORIES.includes(tag);
  if (category) {
    const key = `${fieldId}:${tag}`, children = TAG_TREE.find((c) => c.name === tag).children;
    if (!open.includes(key)) return { grid: put(cur.includes(tag) ? cur : [...cur, tag]), open: [...open, key] };
    const any = children.some((ch) => cur.includes(ch));
    return { grid: any ? grid : put(cur.filter((t) => t !== tag)), open: open.filter((k) => k !== key) };
  }
  const parent = parentOf(tag);
  const key = `${fieldId}:${parent}`;
  const list = cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag, ...(cur.includes(parent) ? [] : [parent])];
  return { grid: put(list), open: open.includes(key) ? open : [...open, key] };
}
// Which first-level tags should show open when a grid is opened: those that have a second-level tag picked.
export function openFromGrid(grid) {
  const out = [];
  ["aromas", "flavours"].forEach((f) => (Array.isArray(grid[f]) ? grid[f] : []).forEach((t) => { const p = parentOf(t); if (p && !out.includes(`${f}:${p}`)) out.push(`${f}:${p}`); }));
  return out;
}
// The structure lines the grid answers, as the app's values: scale lines 1 to 5, sweetness 0 to 3, oak 0 to 2, bubbles 2 (sparkling).
export function gridToDims(grid, style) {
  const g = cleanGrid(grid, style), out = {}, has = (k) => hasDim(style, k);
  if (has("acidity") && g.acidity) out.acidity = LEVEL.indexOf(g.acidity) + 1;
  if (has("tannin") && g.tannin) out.tannin = LEVEL.indexOf(g.tannin) + 1;
  if (has("body") && g.body) out.body = BODY.indexOf(g.body) + 1;
  if (has("sweetness") && g.sweetness) out.sweetness = { dry: 0, "off-dry": 1, medium: 2, sweet: 3, luscious: 3 }[g.sweetness];
  if (has("oak") && g.oak) out.oak = { none: 0, subtle: 1, pronounced: 2 }[g.oak];
  if (has("co2") && style === "sparkling" && g.mousse) out.co2 = 2;
  return out;
}

// ---------------------------------------------------------------- the screens
// The block shown on the Structure step of the rating window.
export function proBlockHtml(grid, style) {
  return `<div class="problock" data-problock><div class="serif" style="font-size:16px">Professional tasting grid</div>
    <div class="muted small">${esc(summaryText(grid, style))}. Appearance, nose, palate and conclusions. Each tap is kept and moves the sliders below.</div>
    <button class="btn outline slim" data-grid="open" style="margin-top:8px">${isEmptyGrid(grid, style) ? "Open the grid" : "Edit the grid"}</button></div>`;
}
const tagChip = (g, field, tag) => { const i = TAG_LIST.indexOf(tag); const on = Array.isArray(g[field]) && g[field].includes(tag); return `<button class="gopt tag${on ? " on" : ""}" data-grid="tag:${field}:${i}" aria-pressed="${on}">${esc(tag)}</button>`; };
function tagsHtml(g, open, field) {
  const picked = (cat, children) => children.filter((ch) => Array.isArray(g[field]) && g[field].includes(ch)).length;
  const first = TAG_TREE.map((c) => {
    const i = TAG_LIST.indexOf(c.name), on = Array.isArray(g[field]) && g[field].includes(c.name), n = picked(c.name, c.children), isOpen = open.includes(`${field}:${c.name}`);
    return `<button class="gopt tag cat${on ? " on" : ""}${isOpen ? " open" : ""}" data-grid="tag:${field}:${i}" aria-pressed="${on}" aria-expanded="${isOpen}">${esc(c.name)}${n ? ` (${n})` : ""}</button>`;
  }).join("");
  const second = TAG_TREE.map((c) => `<div class="gsub" data-gsub="${field}:${esc(c.name)}"${open.includes(`${field}:${c.name}`) ? "" : " hidden"}><div class="tiny muted">${esc(c.name)}</div><div class="gopts">${c.children.map((t) => tagChip(g, field, t)).join("")}</div></div>`).join("");
  return `<div class="gopts">${first}</div>${second}`;
}
function scaleHtml(g, f, style) {
  const opts = optionsOf(f, style);
  // A long word such as "Pronounced" gets a wider step, so it is never cut off.
  const cols = opts.map((o) => (shortLabel(o).length > 8 ? "1.7fr" : "1fr")).join(" ");
  return `<div class="gseg n${opts.length}" style="grid-template-columns:${cols}" role="group" aria-label="${esc(f.label)}">${opts.map((o, i) => `<button class="gstep${g[f.id] === o ? " on" : ""}" data-grid="pick:${f.id}:${i}" aria-pressed="${g[f.id] === o}">${esc(shortLabel(o))}</button>`).join("")}</div>`;
}
export function gridHtml(values, open, style, wineName, info = "") {
  const g = values || {}, openList = open || [];
  const body = SECTIONS.map((sec) => {
    const rows = fieldsFor(style).filter((f) => f.section === sec).map((f) => {
      if (f.type === "one") {
        if (f.scale) return `<div class="glabel">${esc(f.label)}</div>${scaleHtml(g, f, style)}`;
        const opts = optionsOf(f, style).map((o, i) => `<button class="gopt${g[f.id] === o ? " on" : ""}" data-grid="pick:${f.id}:${i}" aria-pressed="${g[f.id] === o}">${esc(o)}</button>`).join("");
        return `<div class="glabel">${esc(f.label)}</div><div class="gopts">${opts}</div>`;
      }
      if (f.type === "tags") return `<div class="glabel">${esc(f.label)}</div>${tagsHtml(g, openList, f.id)}`;
      return `<div class="glabel">${esc(f.label)}</div><textarea class="field" rows="4" data-grid-note placeholder="Anything else you want to record">${esc(g[f.id] || "")}</textarea>`;
    }).join("");
    return `<h3 class="serif gsec">${esc(sec)}</h3>${rows}`;
  }).join("");
  return `<div class="overlay top"><div class="sheet gridsheet" id="gridPanel">
    <div class="sheethead"><div class="sheettitle"><div class="serif big">Tasting grid</div><div class="muted small">${esc(wineName || "")}</div>${info ? `<div class="muted small">${esc(info)}</div>` : ""}</div>
      <div class="sheetbtns"><button class="pill wine" data-grid="close">Close</button></div></div>
    <p class="muted small">Every tap is kept straight away. Acidity, tannin, body, sweetness, oak and bubbles also set the structure sliders. Tap an answer again to clear it. For aromas and flavours, tap a group to open it.</p>
    <div id="gridMsg" class="err"></div>
    ${body}
    <button class="btn primary" data-grid="close">Close</button></div></div>`;
}
// Updates the open grid after a tap without redrawing it, so the page does not jump back to the top.
export function syncGridDom(values, open, style, root = document) {
  const g = values || {}, openList = open || [];
  root.querySelectorAll("[data-grid^='pick:']").forEach((b) => {
    const [, id, i] = b.dataset.grid.split(":");
    const f = fieldsFor(style).find((x) => x.id === id); const on = !!f && g[id] === optionsOf(f, style)[Number(i)];
    b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on));
  });
  root.querySelectorAll("[data-grid^='tag:']").forEach((b) => {
    const [, id, i] = b.dataset.grid.split(":"); const tag = TAG_LIST[Number(i)];
    const on = Array.isArray(g[id]) && g[id].includes(tag);
    b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on));
    if (CATEGORIES.includes(tag)) {
      const c = TAG_TREE.find((x) => x.name === tag), n = c.children.filter((ch) => Array.isArray(g[id]) && g[id].includes(ch)).length, isOpen = openList.includes(`${id}:${tag}`);
      b.classList.toggle("open", isOpen); b.setAttribute("aria-expanded", String(isOpen)); b.textContent = n ? `${tag} (${n})` : tag;
    }
  });
  root.querySelectorAll("[data-gsub]").forEach((el) => { el.hidden = !openList.includes(el.dataset.gsub); });
}

// ---------------------------------------------------------------- the database
export async function loadTasting(sb, consumptionId) {
  const { data, error } = await sb.from("tasting_notes").select("data").eq("consumption_id", consumptionId).maybeSingle();
  if (error) throw error;
  return (data && data.data) || {};
}
// An empty grid removes the note. Needs database update 21 and the professional tier.
export async function saveTasting(sb, consumptionId, grid, style) {
  const clean = cleanGrid(grid, style);
  if (!Object.keys(clean).length) {
    const { error } = await sb.from("tasting_notes").delete().eq("consumption_id", consumptionId);
    if (error) throw error;
    return;
  }
  const { error } = await sb.from("tasting_notes").upsert({ consumption_id: consumptionId, method: METHOD, data: clean, updated_at: new Date().toISOString() }, { onConflict: "consumption_id" });
  if (error) throw error;
}

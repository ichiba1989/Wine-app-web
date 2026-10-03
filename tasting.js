// The professional tasting grid: a structured, more detailed way to assess a wine, for people with the "professional" tier.
// It follows the usual order of a systematic tasting: appearance, nose, palate, conclusions. The words are the common industry terms;
// it is not a copy of any organization's official form.
// The grid is an extra on top of the normal rating. Its answers for acidity, tannin, body, sweetness, oak and bubbles also move the
// five structure sliders, so the palate and the Discover deck keep working from the same lines for everyone.
// The rules at the top are pure (no browser, no network). The functions at the bottom talk to Supabase.
import { esc, dimsFor } from "./logic.js?v=10";

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

// Aromas and flavours, in groups. The same list is used for the nose and the palate.
export const TAGS = [
  { group: "Fruit", tags: ["citrus", "green apple or pear", "stone fruit", "tropical fruit", "red fruit", "black fruit", "dried or cooked fruit"] },
  { group: "Floral and herbal", tags: ["floral", "herbal", "green or vegetal"] },
  { group: "Spice and oak", tags: ["black pepper", "sweet spice", "vanilla", "toast", "smoke", "cedar", "coconut"] },
  { group: "Winemaking", tags: ["butter or cream", "yeast or biscuit", "honey"] },
  { group: "Earth and age", tags: ["wet stone or mineral", "earth", "mushroom", "leather", "tobacco", "nuts", "coffee or chocolate"] },
];
export const TAG_LIST = TAGS.flatMap((g) => g.tags);

// Every question. type "one" = pick one (tap again to clear), "tags" = pick any, "text" = free text.
// applies(style) decides whether a question is shown for this type of wine.
const hasDim = (style, key) => dimsFor(style).some((d) => d.key === key);
export const FIELDS = [
  { id: "clarity", section: "Appearance", label: "Clarity", type: "one", options: () => ["clear", "hazy"] },
  { id: "appIntensity", section: "Appearance", label: "Intensity", type: "one", options: () => ["pale", "medium", "deep"] },
  { id: "colour", section: "Appearance", label: "Colour", type: "one", options: colourList },
  { id: "condition", section: "Nose", label: "Condition", type: "one", options: () => ["clean", "unclean"] },
  { id: "noseIntensity", section: "Nose", label: "Intensity", type: "one", options: () => STRENGTH },
  { id: "development", section: "Nose", label: "Development", type: "one", options: () => ["youthful", "developing", "fully developed", "tired"] },
  { id: "aromas", section: "Nose", label: "Aromas", type: "tags" },
  { id: "sweetness", section: "Palate", label: "Sweetness", type: "one", options: () => ["dry", "off-dry", "medium", "sweet", "luscious"] },
  { id: "acidity", section: "Palate", label: "Acidity", type: "one", options: () => LEVEL },
  { id: "tannin", section: "Palate", label: "Tannin", type: "one", options: () => LEVEL, applies: (st) => hasDim(st, "tannin") },
  { id: "alcohol", section: "Palate", label: "Alcohol", type: "one", options: () => ["low", "medium", "high"] },
  { id: "body", section: "Palate", label: "Body", type: "one", options: () => BODY },
  { id: "mousse", section: "Palate", label: "Mousse (bubbles)", type: "one", options: () => ["delicate", "creamy", "aggressive"], applies: (st) => st === "sparkling" },
  { id: "oak", section: "Palate", label: "Oak", type: "one", options: () => ["none", "subtle", "pronounced"] },
  { id: "flavourIntensity", section: "Palate", label: "Flavour intensity", type: "one", options: () => STRENGTH },
  { id: "flavours", section: "Palate", label: "Flavours", type: "tags" },
  { id: "finish", section: "Palate", label: "Finish", type: "one", options: () => ["short", "medium", "long"] },
  { id: "quality", section: "Conclusions", label: "Quality", type: "one", options: () => ["faulty", "poor", "acceptable", "good", "very good", "outstanding"] },
  { id: "readiness", section: "Conclusions", label: "Readiness", type: "one", options: () => ["too young", "drink now, may improve", "drink now, will not improve", "too old"] },
  { id: "note", section: "Conclusions", label: "Your notes", type: "text" },
];
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
export function toggleTag(grid, fieldId, tagIndex) {
  const f = FIELDS.find((x) => x.id === fieldId);
  const tag = TAG_LIST[tagIndex];
  if (!f || f.type !== "tags" || tag === undefined) return grid;
  const cur = Array.isArray(grid[fieldId]) ? grid[fieldId] : [];
  const next = { ...grid };
  const has = cur.includes(tag);
  const list = has ? cur.filter((t) => t !== tag) : [...cur, tag];
  if (list.length) next[fieldId] = list; else delete next[fieldId];
  return next;
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
    <div class="muted small">${esc(summaryText(grid, style))}. Appearance, nose, palate and conclusions. Your answers move the sliders below.</div>
    <button class="btn outline slim" data-grid="open" style="margin-top:8px">${isEmptyGrid(grid, style) ? "Open the grid" : "Edit the grid"}</button></div>`;
}
export function gridHtml(values, style, wineName) {
  const g = values || {};
  const body = SECTIONS.map((sec) => {
    const rows = fieldsFor(style).filter((f) => f.section === sec).map((f) => {
      if (f.type === "one") {
        const opts = optionsOf(f, style).map((o, i) => `<button class="gopt${g[f.id] === o ? " on" : ""}" data-grid="pick:${f.id}:${i}" aria-pressed="${g[f.id] === o}">${esc(o)}</button>`).join("");
        return `<div class="glabel">${esc(f.label)}</div><div class="gopts">${opts}</div>`;
      }
      if (f.type === "tags") {
        const groups = TAGS.map((grp) => `<div class="tiny muted" style="margin:6px 0 2px">${esc(grp.group)}</div><div class="gopts">${grp.tags.map((t) => { const i = TAG_LIST.indexOf(t); const on = Array.isArray(g[f.id]) && g[f.id].includes(t); return `<button class="gopt tag${on ? " on" : ""}" data-grid="tag:${f.id}:${i}" aria-pressed="${on}">${esc(t)}</button>`; }).join("")}</div>`).join("");
        return `<div class="glabel">${esc(f.label)}</div>${groups}`;
      }
      return `<div class="glabel">${esc(f.label)}</div><textarea class="field" rows="4" data-grid-note placeholder="Anything else you want to record">${esc(g[f.id] || "")}</textarea>`;
    }).join("");
    return `<h3 class="serif gsec">${esc(sec)}</h3>${rows}`;
  }).join("");
  return `<div class="overlay top"><div class="sheet gridsheet" id="gridPanel">
    <div class="sheethead"><div class="sheettitle"><div class="serif big">Tasting grid</div><div class="muted small">${esc(wineName || "")}</div></div>
      <div class="sheetbtns"><button class="pill wine" data-grid="done">Done</button><button class="xbtn" data-grid="cancel" aria-label="Close without keeping changes">&times;</button></div></div>
    <p class="muted small">Fill in only what you assess; tap an answer again to clear it. Tap Done to keep it. Acidity, tannin, body, sweetness, oak and bubbles also set the structure sliders.</p>
    ${body}
    <button class="btn primary" data-grid="done">Done</button></div></div>`;
}
// Updates the open grid after a tap without redrawing it, so the page does not jump back to the top.
export function syncGridDom(values, style, root = document) {
  const g = values || {};
  root.querySelectorAll("[data-grid^='pick:']").forEach((b) => {
    const [, id, i] = b.dataset.grid.split(":");
    const f = fieldsFor(style).find((x) => x.id === id); const on = !!f && g[id] === optionsOf(f, style)[Number(i)];
    b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on));
  });
  root.querySelectorAll("[data-grid^='tag:']").forEach((b) => {
    const [, id, i] = b.dataset.grid.split(":"); const on = Array.isArray(g[id]) && g[id].includes(TAG_LIST[Number(i)]);
    b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on));
  });
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

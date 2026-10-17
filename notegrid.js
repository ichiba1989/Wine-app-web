// Reading a tasting note into the professional tasting grid (tasting.js). Pure: no page, no network.
// The player's OWN words are matched against a LEGEND: what people say -> which grid answer it means. Three layers, strongest first:
//   3  the player's own legend (words they taught the app, and answers they pushed back on),
//   2  the shared legend (words players taught that an editor or the owner approved, plus the seed),
//   1  the seed in notelegend.js, and the level patterns below ("high acidity", "long finish", "full-bodied", ...).
// Nothing here knows anything about a wine: it only moves what the player said into the player's own grid, and when the words are unclear it leaves the answer empty.
// The player's taps always win (mergeFromNotes never overwrites an answer), and every value is checked against the wine's type with cleanGrid.
import { fold } from "./grapes.js?v=2";
import { FIELDS, TAG_LIST, parentOf, cleanGrid, fieldsFor } from "./tasting.js?v=14";
import { SEED_LEGEND } from "./notelegend.js?v=2";

// ---------------------------------------------------------------- reading the words
// "medium plus", "med +", "medium-" become single words so the level survives folding; hyphens and punctuation then become spaces.
const pre = (text) => String(text == null ? "" : text).toLowerCase()
  .replace(/\bmed(?:ium)?\s*(?:\+|plus)(?![a-z])/g, " mediumplus ").replace(/\bmed(?:ium)?\s*(?:-|−|minus)(?![a-z])/g, " mediumminus ");
// A word without its plural: cherries -> cherry, tannins -> tannin; "grass", "citrus" and "this" are left alone.
const sing = (w) => (w.length > 3 && w.endsWith("ies") ? w.slice(0, -3) + "y" : w.length > 3 && w.endsWith("s") && !/(ss|us|is)$/.test(w) ? w.slice(0, -1) : w);
export const words = (text) => fold(pre(text)).split(" ").filter(Boolean).map(sing);
export const keyOf = (phrase) => words(phrase).join(" ");

// Words that never need explaining (so they are not listed as "could not place") and negators.
const FILLER = new Set(("a about after all also always an and any are as at back be because been before being both but by can come could did do does down each even every for from get give go going good great had has have he her here him his how i if in into is it its just keep know last like little lot lots made make many may me more most much my near need new next no nor not now of off often on once one only or other our out over own quite really rather same see she should since so some still such take than that the their them then there these they thing this those through to too two under until up us use very want was way we well were what when where which while who why will with would year yes you your " +
  "wine wines glass bottle taste tasted tasting tastes nose palate finish note notes hint touch bit slightly fairly nice lovely beautiful lovely pleasant interesting really quite pretty overall definitely probably maybe seems seem feel feels felt think thought find found sort kind type style one first second then also with without and but however although though more less than very").split(/\s+/));
const NEGATORS = new Set(["no", "not", "without", "never", "hardly", "barely", "non", "lacking", "lacks", "nor", "less"]);
// The grid's own words, never "unplaced".
const GRIDWORDS = new Set(["acidity", "acid", "tannin", "alcohol", "body", "bodied", "sweetness", "oak", "oaked", "finish", "length", "colour", "color", "aroma", "bouquet", "flavour", "flavor", "intensity", "mousse", "bubble", "nose", "palate", "mediumplus", "mediumminus", "ripeness"]);

// ---------------------------------------------------------------- level patterns ("high acidity", "acidity is medium plus", "long finish")
const LEVEL = { low: "low", mediumminus: "medium -", medium: "medium", moderate: "medium", mediumplus: "medium +", high: "high" };
// "high" and "low" are left out of STRENGTH on purpose: in "palate: high acidity" the "high" belongs to the acidity.
const STRENGTH = { light: "light", mediumminus: "medium -", medium: "medium", moderate: "medium", mediumplus: "medium +", pronounced: "pronounced", intense: "pronounced", powerful: "pronounced", strong: "pronounced", expressive: "pronounced" };
const BODYW = { light: "light", mediumminus: "medium -", medium: "medium", mediumplus: "medium +", full: "full", heavy: "full" };
const NOUNS = [
  { nouns: ["acidity", "acid"], field: "acidity", map: LEVEL },
  { nouns: ["tannin", "tannic"], field: "tannin", map: LEVEL },
  { nouns: ["alcohol", "abv"], field: "alcohol", map: { low: "low", medium: "medium", moderate: "medium", mediumplus: "medium", high: "high" } },
  { nouns: ["body", "bodied"], field: "body", map: BODYW },
  { nouns: ["finish", "length"], field: "finish", map: { short: "short", medium: "medium", long: "long", lingering: "long", persistent: "long" } },
  { nouns: ["nose", "aroma", "bouquet"], field: "noseIntensity", map: STRENGTH },
  { nouns: ["flavour", "flavor", "palate"], field: "flavourIntensity", map: STRENGTH },
  { nouns: ["colour", "color"], field: "appIntensity", map: { pale: "pale", light: "pale", medium: "medium", deep: "deep", dark: "deep" } },
  { nouns: ["oak", "oaked"], field: "oak", map: { subtle: "subtle", light: "subtle", slight: "subtle", pronounced: "pronounced", heavy: "pronounced", strong: "pronounced", heavily: "pronounced" } },
];
const COLOUR_WORDS = new Set(["ruby", "garnet", "purple", "tawny", "lemon", "gold", "golden", "amber", "salmon", "pink", "straw", "brick", "orange"]);
const PASS = new Set(["is", "was", "are", "were", "feel", "feels", "very", "quite", "fairly", "rather", "a", "of", "in", "its", "has", "with"]);
// For a noun at position i: the level word just before it (high acidity) or just after (acidity is high). Returns { word, at } or null.
function levelAround(tokens, i, map, used) {
  for (const dir of [-1, 1]) {
    for (let step = 1, j = i + dir; step <= 3 && j >= 0 && j < tokens.length; step++, j += dir) {
      const w = tokens[j];
      if (map[w] !== undefined && !used[j]) return { word: w, at: j };
      if (!PASS.has(w)) break;
    }
  }
  return null;
}

// ---------------------------------------------------------------- compiling the legend
// layers: [{ layer: 1|2|3, entries: [{ phrase, field, value, rejected? }] }]. A rejected line switches that exact meaning off for the layers below it.
export function compileLegend(layers) {
  const byKey = new Map(), rejected = new Set();
  let maxWords = 1;
  for (const { layer, entries } of layers || []) for (const e of entries || []) {
    const key = keyOf(e.phrase);
    if (!key || !e.field || !e.value) continue;
    if (e.rejected) { rejected.add(`${key}|${e.field}|${e.value}`); continue; }
    maxWords = Math.max(maxWords, key.split(" ").length);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push({ field: e.field, value: e.value, layer });
  }
  return { byKey, rejected, maxWords };
}
export const SEED_COMPILED = compileLegend([{ layer: 1, entries: SEED_LEGEND }]);
export const compileWith = (shared = [], mine = []) => compileLegend([{ layer: 1, entries: SEED_LEGEND }, { layer: 2, entries: shared }, { layer: 3, entries: mine }]);

// ---------------------------------------------------------------- reading a note
const NOSE_CUES = new Set(["nose", "aroma", "bouquet", "smell", "smells", "scent"]);
const PALATE_CUES = new Set(["palate", "taste", "tastes", "flavour", "flavor", "mouth", "mouthfeel", "finish", "sip"]);
const clausesOf = (text) => String(text == null ? "" : text).split(/[.;!?\n,]+| but | while | although /i).map((c) => c.trim()).filter(Boolean);
// text: the player's notes; style: the wine's type (colours differ by type). legend: from compileWith (default: the seed only).
// Returns { values, evidence, tagPhrase, unplaced }: values is a partial grid (already passed through cleanGrid), evidence says which words gave each answer,
// unplaced lists meaningful words that matched nothing (the app offers to learn them).
export function gridFromNotes(text, style, legend = SEED_COMPILED) {
  const found = new Map();                    // field -> Map(value -> { layer, phrases })
  const tags = { aromas: new Map(), flavours: new Map() };
  const evidence = {}, unplaced = [], tagPhrase = {};
  const say = (field, phrase) => { (evidence[field] = evidence[field] || []).includes(phrase) || evidence[field].push(phrase); };
  const put = (field, value, layer, phrase) => {
    if (!found.has(field)) found.set(field, new Map());
    const m = found.get(field), cur = m.get(value);
    if (!cur) m.set(value, { layer, phrases: [phrase] }); else { cur.layer = Math.max(cur.layer, layer); if (!cur.phrases.includes(phrase)) cur.phrases.push(phrase); }
  };
  let mode = "nose";
  for (const clause of clausesOf(text)) {
    const tokens = words(clause), used = new Array(tokens.length).fill(false);
    if (!tokens.length) continue;
    if (tokens.some((t) => PALATE_CUES.has(t))) mode = "palate"; else if (tokens.some((t) => NOSE_CUES.has(t))) mode = "nose";
    // 1. the legend, longest phrase first
    for (let i = 0; i < tokens.length; i++) {
      for (let n = Math.min(legend.maxWords, tokens.length - i); n >= 1; n--) {
        const key = tokens.slice(i, i + n).join(" "), hits = legend.byKey.get(key);
        if (!hits) continue;
        if (used[i] && n === 1) continue;
        const negated = i > 0 && NEGATORS.has(tokens[i - 1]);
        if (negated) { for (let k = 0; k < n; k++) used[i + k] = true; break; }   // "not tannic": understood, but not turned into an answer
        const blocked = hits.every((h) => legend.rejected.has(`${key}|${h.field}|${h.value}`));
        // "dry finish" is about the finish, not sweetness
        const dryFinish = key === "dry" && /^(finish|tannin|ending)$/.test(tokens[i + 1] || "");
        if (!blocked && !dryFinish) {
          for (const h of hits) {
            if (legend.rejected.has(`${key}|${h.field}|${h.value}`)) continue;
            if (h.field === "tag") { const target = mode === "palate" ? "flavours" : "aromas"; const m = tags[target]; const cur = m.get(h.value); m.set(h.value, { layer: Math.max(cur ? cur.layer : 0, h.layer) }); tagPhrase[h.value] = key; say(target, key); }
            else { put(h.field, h.value, h.layer, key); }
          }
        }
        for (let k = 0; k < n; k++) used[i + k] = true;
        i += n - 1;
        break;
      }
    }
    // 2. level patterns: a level word beside the grid word it describes
    for (let i = 0; i < tokens.length; i++) {
      for (const rule of NOUNS) {
        if (!rule.nouns.includes(tokens[i])) continue;
        const hit = levelAround(tokens, i, rule.map, used);
        if (!hit) continue;
        const negated = hit.at > 0 && NEGATORS.has(tokens[hit.at - 1]) && hit.at < i;
        used[i] = used[hit.at] = true;
        if (negated) continue;
        put(rule.field, rule.map[hit.word], 1, `${hit.at < i ? tokens[hit.at] + " " + tokens[i] : tokens[i] + " " + tokens[hit.at]}`);
        if (rule.field === "noseIntensity") mode = "nose";
        if (rule.field === "flavourIntensity" || rule.field === "finish") mode = "palate";
      }
    }
    // 2b. "deep ruby", "pale lemon": the strength of the colour comes with the colour word
    for (let i = 0; i + 1 < tokens.length; i++) {
      const lvl = { pale: "pale", medium: "medium", deep: "deep" }[tokens[i]];
      if (lvl && COLOUR_WORDS.has(tokens[i + 1])) { used[i] = true; put("appIntensity", lvl, 1, `${tokens[i]} ${tokens[i + 1]}`); }
    }
    // 3. what is left over, for "could not place"
    tokens.forEach((t, i) => { if (!used[i] && t.length >= 4 && !FILLER.has(t) && !GRIDWORDS.has(t) && !/\d/.test(t) && !NEGATORS.has(t) && !unplaced.includes(t)) unplaced.push(t); });
  }
  // choose: one answer per field; two different answers at the same strength are unclear, so the field stays empty
  const raw = {};
  for (const [field, m] of found) {
    const best = [...m.entries()].sort((a, b) => b[1].layer - a[1].layer);
    let top = best.filter((x) => x[1].layer === best[0][1].layer);
    // "drink now but it will improve" says both things: that is "may improve"
    if (field === "readiness" && top.length === 2 && top.every((x) => /^drink now/.test(x[0]))) top = top.filter((x) => x[0] === "drink now, may improve");
    if (top.length === 1) { raw[field] = top[0][0]; evidence[field] = top[0][1].phrases; } else delete evidence[field];
  }
  for (const target of ["aromas", "flavours"]) {
    const picked = [...tags[target].keys()], withParents = new Set(picked);
    picked.forEach((t) => { const p = parentOf(t); if (p) withParents.add(p); });
    if (withParents.size) raw[target] = TAG_LIST.filter((t) => withParents.has(t));
  }
  // a faulty wine is also an unclean nose; "corked" lands in both on purpose
  const values = cleanGrid(raw, style);
  Object.keys(evidence).forEach((f) => { if (values[f] === undefined) delete evidence[f]; });
  // only words the grid really cannot place are offered; drop words that the legend already knows
  return { values, evidence, tagPhrase, unplaced: unplaced.filter((w) => !legend.byKey.has(w)).slice(0, 8) };
}

// ---------------------------------------------------------------- merging into the grid
// current: the player's grid so far. found: values from gridFromNotes. auto: what an earlier fill added and the player has not touched yet ({ field: true } or { field: [tags] }).
// Never overwrites an answer the player gave: only empty fields are filled, and tags are only added.
export function mergeFromNotes(current, found, auto = {}) {
  const values = { ...current }, added = {};
  for (const [field, v] of Object.entries(found || {})) {
    const f = FIELDS.find((x) => x.id === field);
    if (!f || f.type === "text") continue;
    if (f.type === "tags") {
      const have = Array.isArray(values[field]) ? values[field] : [];
      const mineAlready = new Set(have.filter((t) => !(Array.isArray(auto[field]) && auto[field].includes(t))));
      const fresh = v.filter((t) => !have.includes(t));
      if (fresh.length) { values[field] = TAG_LIST.filter((t) => have.includes(t) || fresh.includes(t)); added[field] = [...(Array.isArray(auto[field]) ? auto[field] : []), ...fresh]; }
      else if (Array.isArray(auto[field])) added[field] = auto[field].filter((t) => have.includes(t));
      void mineAlready;
    } else if (values[field] === undefined) { values[field] = v; added[field] = true; }
    else if (auto[field] === true) added[field] = true;   // still the app's answer: stays marked
  }
  return { values, auto: added };
}
// The player changed something: the field is theirs now, so its mark goes. Returns the fields that were auto-filled and are no longer the same answer (for "rejected").
export function touched(auto, before, after) {
  const next = { ...auto }, changed = [];
  for (const field of Object.keys(auto || {})) {
    const a = before[field], b = after[field];
    if (Array.isArray(auto[field])) {
      const keep = auto[field].filter((t) => Array.isArray(b) && b.includes(t));
      const dropped = auto[field].filter((t) => !keep.includes(t));
      if (dropped.length) changed.push({ field, tags: dropped });
      if (keep.length) next[field] = keep; else delete next[field];
    } else if (a !== b) { delete next[field]; changed.push({ field, value: a }); }
  }
  return { auto: next, changed };
}

// ---------------------------------------------------------------- teaching a word (the player's "I meant ...")
const MAX_WORDS = 4;
// A line the player teaches must be a short plain phrase and a real option of the wine's type. Returns { ok, entry } or { ok: false, why }.
export function legendEntry(phrase, field, value, style) {
  const p = String(phrase == null ? "" : phrase).trim();
  const w = words(p);
  if (!w.length || w.length > MAX_WORDS || p.length > 40) return { ok: false, why: "Use one to four short words." };
  if (/[@\d/\\:]/.test(p) || /https?|www\./i.test(p)) return { ok: false, why: "Use plain words only." };
  const f = fieldsFor(style).find((x) => x.id === field);
  const known = field === "tag" ? TAG_LIST.includes(value) : f && f.type === "one" && cleanGrid({ [field]: value }, style)[field] === value;
  if (!known) return { ok: false, why: "That answer is not an option for this wine." };
  return { ok: true, entry: { phrase: w.join(" "), field, value } };
}

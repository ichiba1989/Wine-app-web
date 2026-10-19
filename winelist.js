// A restaurant's wine list, read from typed or pasted text into wine-shaped lines. Pure (no browser, no network).
// Nothing is guessed (owner, 2026-10-19): a line is judged only by words it STATES (a section heading such as "Red", a type word such as "Brut" or
// "Rosso", a grape name, a place name) plus the stored rules that follow from them (rules.js: Sancerre's usual feel, aocgrapes.js: the grape an
// appellation's rules name). A line with too little is marked "not enough to judge" and the advice never picks it. A line that is exactly a catalog
// wine uses the catalog's own card. Prices are kept as printed and never converted.
//
// The shape of a line (see parseList):  { n, raw, name, vintage, price: { text, amounts }, section: { style, glass } }
// The shape of a card (see toCard): the same fields as logic.js cardFromRow (so recommend.js and deck.js read it unchanged) plus
//   listLine: the line number, source: "catalog" | "list", known: { style, grape, place }, confidence: "high" | "medium" | "low", priceText, said: [words it stated]
import { plainKey, matchKey } from "./text.js?v=2";
import { grapeIndex, resolveGrape } from "./grapes.js?v=2";
import { dosageFromText } from "./logic.js?v=23";
import { ruleGrapesFor } from "./aocgrapes.js?v=2";

// ---------------------------------------------------------------- reading lines
const YEAR = /\b(19[5-9]\d|20[0-3]\d)\b/;
const NV = /\b(?:n\.?\s?v\.?|non[- ]vintage|multi[- ]vintage|mv)\b/i;
const MONEY = "(?:[$€£]\\s?)?\\d{1,4}(?:[.,]\\d{1,2})?";
const PRICES_AT_END = new RegExp(`(?:^|[\\s.\\u2026\\u2014\\u2013-])((?:${MONEY})(?:\\s*[/|]\\s*(?:${MONEY}))*)\\s*$`);
// words that make a line a heading rather than a wine
const SECTION_WORDS = [
  { re: /\b(?:sparkling|bubbles?|bubbly|champagnes?|prosecco|cava|cr[eé]mant|spumante|franciacorta|sekt|m[eé]thode)\b/, style: "sparkling" },
  { re: /\b(?:fortified|port|porto|sherry|madeira|marsala)\b/, style: "fortified" },
  { re: /\b(?:ros[eé]s?|rosato|rosado)\b/, style: "rose" },
  { re: /\b(?:reds?|rouge|rosso|rossi|tintos?|rot|rotwein)\b/, style: "red" },
  { re: /\b(?:whites?|blanc|bianco|bianchi|blancos?|wei(?:ss|ß)|weisswein)\b/, style: "white" },
];
const GLASS = /\b(?:by the glass|btg|au verre|al bicchiere|glass(?:es)?)\b/;
const HEADING_ONLY = /^[\W_]*$/;
const fold = (s) => ` ${plainKey(s)} `.replace(/\s+/g, " ");

// The types a line itself states. Sparkling wins (Blanc de Blancs on a Champagne is still a sparkling wine); two different still types cancel each other.
export function stylesIn(text) {
  const t = fold(text), found = new Set();
  for (const w of SECTION_WORDS) if (w.re.test(t)) found.add(w.style);
  if (dosageFromText(text)) found.add("sparkling");
  if (found.has("sparkling")) return ["sparkling"];
  return [...found];
}

function readPrice(rest) {
  const m = PRICES_AT_END.exec(rest);
  if (!m) return null;
  const text = m[1].trim();
  const amounts = text.split(/[/|]/).map((x) => Number(x.replace(/[^\d.,]/g, "").replace(",", "."))).filter((x) => Number.isFinite(x) && x > 0);
  // a lone number that is a year is a vintage, not a price
  if (amounts.length === 1 && Number.isInteger(amounts[0]) && amounts[0] >= 1950 && amounts[0] <= 2039 && !/[$€£.,]/.test(text)) return null;
  return amounts.length ? { text, amounts, at: m.index + m[0].length - m[1].length - (m[0].length - m[0].trimStart().length) } : null;
}

// Text to lines. Returns { lines, skipped } where skipped are the lines that were not wines (headings, noise) so the screen can say so.
export function parseList(text) {
  const out = [], skipped = [];
  let section = { style: null, glass: false };
  String(text || "").split(/\r?\n/).forEach((rawLine, i) => {
    let s = rawLine.replace(/[\t]+/g, "  ").replace(/\s+…+\s*|\s*\.{3,}\s*/g, "  ").trim();
    if (!s || HEADING_ONLY.test(s)) return;
    const price = readPrice(s);
    const vint = NV.test(s) ? "NV" : (YEAR.exec(s) || [])[1] || "";
    let words = s;
    if (price) words = words.slice(0, words.lastIndexOf(price.text)).trim();
    const wordCount = fold(words).trim().split(" ").filter(Boolean).length;
    // a heading: no price, no vintage, short, and it names a section
    const heading = !price && !vint && wordCount <= 4 && (SECTION_WORDS.some((w) => w.re.test(fold(words))) || GLASS.test(fold(words)));
    if (heading) {
      const st = stylesIn(words);
      section = { style: st.length === 1 ? st[0] : null, glass: GLASS.test(fold(words)) || (section.glass && !st.length) };
      skipped.push({ raw: rawLine.trim(), why: "section heading" });
      return;
    }
    // a bin number at the start ("112  Chablis ...", "7. Barolo") is not part of the name
    words = words.replace(/^\s*\d{1,4}[.)]?\s+(?=\D)/, "").replace(YEAR, " ").replace(NV, " ").replace(/[\s,;:–—-]+$/g, "").replace(/\s{2,}/g, " ").trim();
    const nameWords = fold(words).trim().split(" ").filter(Boolean).length;
    if (!words || nameWords < 1 || (!price && !vint && nameWords < 2)) { skipped.push({ raw: rawLine.trim(), why: "not a wine line" }); return; }
    out.push({ n: out.length + 1, raw: rawLine.trim(), name: words, vintage: vint, price: price ? { text: price.text, amounts: price.amounts } : null, section: { ...section } });
  });
  return { lines: out, skipped };
}

// ---------------------------------------------------------------- what a line states
// places: [{ name, country, kind }] (flavors.js tables) plus the catalog's own appellations, regions and countries.
export function placeIndex(cards = [], places = []) {
  const seen = new Map();
  const add = (name, country, kind) => { const k = matchKey(name); if (k && k.length >= 4 && !seen.has(k + "|" + (country || ""))) seen.set(k + "|" + (country || ""), { name, country: country || "", kind: kind || "region", key: ` ${k} ` }); };
  places.forEach((p) => { if (p && p.name) add(p.name, p.country, p.kind); });
  cards.forEach((c) => { if (c.archived) return; if (c.appellation) add(c.appellation, c.country, "appellation"); if (c.region) add(c.region, c.country, "region"); });
  return [...seen.values()].sort((a, b) => b.key.length - a.key.length);   // the longest (most specific) name first
}
const COUNTRY_NAMES = ["France", "Italy", "Spain", "Portugal", "Germany", "Austria", "USA", "United States", "Argentina", "Chile", "Australia", "New Zealand", "South Africa", "Greece", "Hungary", "Lebanon", "Switzerland"];

function stated(name, section, idx, gIdx) {
  const t = ` ${matchKey(name)} `, said = [];
  // grapes: whole known names of one to three words
  const toks = plainKey(name).split(" ").filter(Boolean), grapes = [];
  for (let n = 3; n >= 1; n--) for (let i = 0; i + n <= toks.length; i++) {
    const phrase = toks.slice(i, i + n).join(" ");
    if (phrase.length < 4) continue;
    const g = resolveGrape(phrase, gIdx);
    if (g && !grapes.includes(g) && !grapes.some((x) => fold(x).includes(fold(g)))) { grapes.push(g); toks.splice(i, n, ...Array(n).fill("")); }
  }
  grapes.forEach((g) => said.push(g));
  // the most specific place named
  const hit = idx.find((p) => t.includes(p.key));
  let place = null;
  if (hit) { place = hit; said.push(hit.name); }
  else { const c = COUNTRY_NAMES.find((n) => t.includes(` ${matchKey(n)} `)); if (c) { place = { name: c, country: c === "United States" ? "USA" : c, kind: "country" }; said.push(c); } }
  // the type: the line's own words first, else its section
  const own = stylesIn(name);
  const style = own.length === 1 ? own[0] : (own.length === 0 && section && section.style) || null;
  const dose = dosageFromText(name);
  if (own.length === 1) said.push(own[0]);
  return { grapes, place, style, dose, said };
}

// ---------------------------------------------------------------- the catalog
// A line is exactly a catalog wine when its text holds the wine's producer and its wine name, and the vintages do not disagree.
export function catalogIndex(cards = []) {
  return cards.filter((c) => !c.archived && c.producer).map((c) => ({ card: c, p: ` ${matchKey(c.producer)} `, w: c.cuvee ? ` ${matchKey(c.cuvee)} ` : "" }))
    .sort((a, b) => b.p.length + b.w.length - (a.p.length + a.w.length));
}
export function matchCatalog(line, index) {
  const t = ` ${matchKey(line.name)} `;
  for (const e of index) {
    if (!t.includes(e.p)) continue;
    if (e.w && !t.includes(e.w)) continue;
    if (line.vintage && e.card.vintage && line.vintage !== e.card.vintage) continue;
    return e.card;
  }
  return null;
}

// ---------------------------------------------------------------- a line as a card
const STYLES = ["red", "white", "rose", "sparkling", "fortified"];
export function toCard(line, ctx = {}) {
  const { catalog = [], places = [], gIdx = grapeIndex() } = ctx;
  const hit = ctx.catalogIdx ? matchCatalog(line, ctx.catalogIdx) : null;
  const fix = line.fix || {};
  if (hit) return { ...hit, listLine: line.n, source: "catalog", known: { style: true, grape: !!hit.grape, place: !!(hit.appellation || hit.region || hit.country) }, confidence: "high", priceText: line.price ? line.price.text : "", said: [] };
  const st = stated(line.name, line.section, ctx.placeIdx || placeIndex(catalog, places), gIdx);
  const style = STYLES.includes(fix.style) ? fix.style : st.style || "unknown";
  const grapes = fix.grape ? fix.grape.split(/[,/&]| and /i).map((g) => resolveGrape(g.trim(), gIdx) || g.trim()).filter(Boolean) : st.grapes;
  const place = st.place, appellation = place && place.kind === "appellation" ? place.name : "", region = place && place.kind === "region" ? place.name : "";
  const country = place ? place.country : "";
  const card = {
    id: `list-${line.n}`, vintage: line.vintage || "", producer: "", cuvee: line.name, style, country, region, appellation, designation: "",
    grape: grapes.join("-"), grapes: [...grapes], ruleGrapes: [], reach: null, archived: false, wineStatus: "", image: null, facts: [],
    ...(st.dose && style === "sparkling" ? { dosage: st.dose.id } : {}),
    listLine: line.n, source: "list", priceText: line.price ? line.price.text : "", said: st.said,
  };
  card.ruleGrapes = ruleGrapesFor(card);   // the appellation's own rules may name the grape (Chablis: Chardonnay); a stored rule, not a guess
  card.raw = { label_grapes: grapes, rule_grapes: card.ruleGrapes };
  const known = { style: style !== "unknown", grape: grapes.length > 0 || card.ruleGrapes.length > 0, place: !!(appellation || region || country) };
  // enough to judge: a type, and a grape or a place to go with it
  const enough = known.style && (known.grape || known.place);
  return { ...card, known, confidence: enough ? "medium" : "low" };
}

// Everything at once: text -> { cards, skipped }. Each card keeps its line, so the screen can show and fix it.
export function readList(text, ctx = {}) {
  const { lines, skipped } = parseList(text);
  const placeIdx = ctx.placeIdx || placeIndex(ctx.catalog || [], ctx.places || []);
  const catalogIdx = ctx.catalogIdx || catalogIndex(ctx.catalog || []);
  const gIdx = ctx.gIdx || grapeIndex();
  const cards = [];
  lines.forEach((l) => {
    const card = toCard(l, { ...ctx, placeIdx, catalogIdx, gIdx });
    // a line with no price and no year is only a wine if it states a grape or a place (or is a catalog wine): "Thank you for dining with us" is not
    if (!l.price && !l.vintage && card.source !== "catalog" && !card.known.grape && !card.known.place) { skipped.push({ raw: l.raw, why: "not a wine line" }); return; }
    cards.push({ line: l, card });
  });
  return { cards, skipped };
}

// What is missing from a line, in everyday words (for the check screen).
export function missingWords(card) {
  if (card.confidence === "high") return "";
  const m = [];
  if (!card.known.style) m.push("the type (red, white, sparkling ...)");
  if (!card.known.grape && !card.known.place) m.push("a grape or a place");
  return m.length ? `The list does not say ${m.join(" or ")}.` : "";
}

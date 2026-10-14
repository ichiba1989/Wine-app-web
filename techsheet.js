// TECHSHEET: the rules for the Tech sheet (researched, sourced wine facts and the full-page sheet). Pure: no browser, no network.
// Part of one removable feature, see docs/TECHSHEET_REMOVAL.md. Switched on and off by app_config techsheet_enabled (access.js `techsheet`).
//
// The idea: a model may FIND a page and QUOTE it, but never decides. A fact counts as confirmed only by this stored rule (confirmRule):
//   * a producer's own site (a domain an Editor/Owner linked to that producer) confirms a fact by itself, or
//   * two different sites that an Editor/Owner approved give the same value.
// Everything else stays unconfirmed and is never printed as fact. Every fact keeps where it came from (address, quote, date, rule).
// The same rule runs in the research function (docs/functions/find-wine-facts) and here, so the Editors' queue and the tests use it too.

// ---------------------------------------------------------------- the closed list of fields
// level: "vintage" (about this bottling) or "producer" (about the estate). kind says how the value is read. Nothing outside this list can be stored.
export const GROUPS = [
  { id: "basics", title: "Basics" },
  { id: "story", title: "Producer story" },
  { id: "lab", title: "Lab numbers" },
];
export const CLOSURES = ["cork", "screwcap", "synthetic cork", "glass stopper", "crown cap", "other"];
export const TECH_FIELDS = [
  { id: "abv", group: "basics", label: "Alcohol (ABV)", level: "vintage", kind: "number", unit: "% vol", min: 5, max: 25, dec: 1 },
  { id: "bottle_size", group: "basics", label: "Bottle size", level: "vintage", kind: "volume", unit: "ml", min: 50, max: 30000 },
  { id: "closure", group: "basics", label: "Closure", level: "vintage", kind: "closure" },
  { id: "founded", group: "story", label: "Founded", level: "producer", kind: "year", min: 1000 },
  { id: "owner_winemaker", group: "story", label: "Owner / winemaker", level: "producer", kind: "text" },
  { id: "estate_size", group: "story", label: "Estate size", level: "producer", kind: "area", unit: "ha", min: 0.1, max: 20000, dec: 1 },
  { id: "website", group: "story", label: "Website", level: "producer", kind: "url" },
  { id: "awards", group: "story", label: "Awards", level: "producer", kind: "text", optional: true },
  { id: "residual_sugar", group: "lab", label: "Residual sugar", level: "vintage", kind: "number", unit: "g/L", min: 0, max: 450, dec: 1 },
  { id: "total_acidity", group: "lab", label: "Total acidity", level: "vintage", kind: "number", unit: "g/L", min: 2, max: 20, dec: 1 },
  { id: "ph", group: "lab", label: "pH", level: "vintage", kind: "number", unit: "", min: 2.5, max: 4.6, dec: 2 },
  { id: "so2_total", group: "lab", label: "Sulphites (total SO₂)", level: "vintage", kind: "number", unit: "mg/L", min: 0, max: 400, dec: 0 },
];
export const fieldById = (id) => TECH_FIELDS.find((f) => f.id === id) || null;
export const fieldsOf = (group) => TECH_FIELDS.filter((f) => f.group === group);
// What is ticked when the player opens the sheet for the first time: everything except the optional lines (awards).
export const DEFAULT_CHOICES = TECH_FIELDS.filter((f) => !f.optional).map((f) => f.id);
// A saved choice (from the phone) cleaned against the closed list; an unusable one falls back to the default.
export function cleanChoices(list) {
  const ok = (Array.isArray(list) ? list : []).filter((id, i, a) => !!fieldById(id) && a.indexOf(id) === i);
  return ok.length ? ok : DEFAULT_CHOICES.slice();
}
export function parseChoices(text) { try { return cleanChoices(JSON.parse(text)); } catch (_) { return DEFAULT_CHOICES.slice(); } }
export function toggleChoice(choices, id) { return choices.includes(id) ? choices.filter((x) => x !== id) : cleanChoices(choices.concat(id)); }
export function toggleGroup(choices, groupId) {
  const ids = fieldsOf(groupId).map((f) => f.id), all = ids.every((id) => choices.includes(id));
  const next = all ? choices.filter((id) => !ids.includes(id)) : [...new Set(choices.concat(ids))];
  return next;   // may be empty on purpose while the player is choosing; the sheet then shows nothing
}

// ---------------------------------------------------------------- reading a value
const num = (s) => {
  const m = String(s).replace(/ /g, " ").match(/-?\d+(?:[.,]\d+)?/);
  return m ? Number(m[0].replace(",", ".")) : NaN;
};
const round = (n, d) => { const k = Math.pow(10, d || 0); return Math.round(n * k) / k; };
// Turns what a page said ("13,5% vol.", "75 cl", "2.1 g/l") into the one stored form, or says why it cannot be used.
// Returns { ok, value (a string: the same fact always gives the same string), number? } or { ok: false, why }.
export function normaliseValue(fieldId, raw) {
  const f = fieldById(fieldId);
  if (!f) return { ok: false, why: "That is not one of the fields on the sheet." };
  const text = String(raw == null ? "" : raw).trim();
  if (!text) return { ok: false, why: "Empty." };
  if (f.kind === "number") {
    const n = num(text);
    if (!Number.isFinite(n)) return { ok: false, why: "No number found." };
    if (n < f.min || n > f.max) return { ok: false, why: `${f.label} must be between ${f.min} and ${f.max}${f.unit ? " " + f.unit : ""}.` };
    const v = round(n, f.dec);
    return { ok: true, value: String(v), number: v };
  }
  if (f.kind === "volume") {
    const n = num(text);
    if (!Number.isFinite(n)) return { ok: false, why: "No size found." };
    const t = text.toLowerCase();
    const ml = /\bcl\b/.test(t) ? n * 10 : /\bml\b/.test(t) ? n : /\bl\b|litre|liter/.test(t) ? n * 1000 : n < 50 ? n * 1000 : n;   // "1.5" alone is read as litres
    const v = Math.round(ml);
    if (v < f.min || v > f.max) return { ok: false, why: "Bottle size looks wrong." };
    return { ok: true, value: String(v), number: v };
  }
  if (f.kind === "area") {
    const n = num(text);
    if (!Number.isFinite(n)) return { ok: false, why: "No area found." };
    const ha = /acre/i.test(text) ? n * 0.404686 : n;
    if (ha < f.min || ha > f.max) return { ok: false, why: "Estate size looks wrong." };
    const v = round(ha, f.dec);
    return { ok: true, value: String(v), number: v };
  }
  if (f.kind === "year") {
    const m = text.match(/\b(1[0-9]{3}|20[0-9]{2})\b/);
    if (!m) return { ok: false, why: "No year found." };
    const y = Number(m[1]);
    if (y < f.min || y > new Date().getFullYear()) return { ok: false, why: "That year is not possible." };
    return { ok: true, value: String(y), number: y };
  }
  if (f.kind === "closure") {
    const t = text.toLowerCase();
    const v = /screw|stelvin/.test(t) ? "screwcap" : /synthetic|plastic/.test(t) ? "synthetic cork" : /glass|vinolok|vino-lok/.test(t) ? "glass stopper" : /crown/.test(t) ? "crown cap" : /cork|bouchon|sughero|corcho|korken/.test(t) ? "cork" : "";
    return v ? { ok: true, value: v } : { ok: false, why: "Closure not recognised." };
  }
  if (f.kind === "url") {
    const d = domainOf(text);
    return d ? { ok: true, value: d } : { ok: false, why: "Not a web address." };
  }
  const t = text.replace(/\s+/g, " ");
  return t.length > 240 ? { ok: false, why: "Too long; keep the quote to the fact." } : { ok: true, value: t };
}
export function displayValue(fieldId, value) {
  const f = fieldById(fieldId);
  if (!f || value == null || value === "") return "";
  if (f.id === "abv") return `${value}% vol`;
  if (f.kind === "volume") return Number(value) >= 1000 ? `${Number(value) / 1000} L` : `${value} ml`;
  if (f.kind === "area") return `${value} ha`;
  return f.unit ? `${value} ${f.unit}` : String(value);
}

// ---------------------------------------------------------------- sites
const TWO_PART_SUFFIX = /\.(co|com|org|net|gov|ac)\.[a-z]{2}$/;
// "https://www.domaine-x.co.uk/fr/page" -> "domaine-x.co.uk": the site, so two pages of one site are never counted as two sources.
export function domainOf(url) {
  let h = String(url || "").trim().toLowerCase();
  if (!h) return "";
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(h)) h = "https://" + h;
  try { h = new URL(h).hostname; } catch (_) { return ""; }
  h = h.replace(/^www\d?\./, "");
  if (!h.includes(".") || /[^a-z0-9.-]/.test(h)) return "";
  const parts = h.split(".");
  return TWO_PART_SUFFIX.test(h) ? parts.slice(-3).join(".") : parts.slice(-2).join(".");
}
const fold = (s) => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export const producerKey = (name) => fold(name);

// ---------------------------------------------------------------- checking a quote against a page (the part code does, not the model)
// page: the text of the page the function fetched. quote: the words the model says are on it. rawValue: the value as written in the quote.
// names: { producer, wine } - the page has to be about this wine. Returns { ok, reasons: [] }.
export function checkQuote({ page, quote, rawValue, names = {} }) {
  const reasons = [];
  const P = fold(page), Q = fold(quote);
  if (!Q || Q.length < 6) reasons.push("The quote is empty or too short.");
  else if (!P.includes(Q)) reasons.push("The quote is not on the page.");
  const V = fold(rawValue);
  if (!V || !Q.includes(V)) reasons.push("The value is not inside the quote.");
  const prod = fold(names.producer);
  if (prod && !P.includes(prod)) reasons.push("The page does not mention the producer.");
  const wine = fold(names.wine);
  if (wine && wine.split(" ").filter((w) => w.length > 3).some((w) => !P.includes(w))) reasons.push("The page does not mention the wine.");
  return { ok: reasons.length === 0, reasons };
}

// ---------------------------------------------------------------- the confirming rule
// candidates: [{ fact_key, value (already normalised), domain, quote_checked, status }]  (for ONE field of ONE subject)
// sources: [{ domain, kind: "producer" | "approved", producer_key }]   (what Editors/Owner approved)
// subject: { producer_key } - the producer of the wine this fact is about.
// Returns { status: "confirmed" | "conflict" | "waiting" | "none", rule, value, using: [candidates], reason }.
export function confirmRule(candidates, sources, subject = {}) {
  const usable = (candidates || []).filter((c) => c && c.status !== "rejected" && c.quote_checked && c.value != null && c.value !== "" && c.domain);
  if (!usable.length) return { status: "none", reason: "Nothing found yet." };
  const src = new Map();
  (sources || []).forEach((s) => { if (s && s.domain) src.set(s.domain, s); });
  const mine = (c) => { const s = src.get(c.domain); return !!s && s.kind === "producer" && !!subject.producer_key && s.producer_key === subject.producer_key; };
  const producer = usable.filter(mine);
  if (producer.length) {
    const values = [...new Set(producer.map((c) => c.value))];
    if (values.length > 1) return { status: "conflict", reason: "The producer's own pages disagree.", using: producer };
    return { status: "confirmed", rule: "producer_source", value: values[0], using: producer.filter((c, i, a) => a.findIndex((x) => x.domain === c.domain && x.value === c.value) === i) };
  }
  const approved = usable.filter((c) => src.has(c.domain));
  if (!approved.length) return { status: "waiting", reason: "None of these sites is an approved source yet.", using: usable };
  const byValue = new Map();
  approved.forEach((c) => { if (!byValue.has(c.value)) byValue.set(c.value, new Map()); byValue.get(c.value).set(c.domain, c); });
  const values = [...byValue.keys()];
  if (values.length > 1) return { status: "conflict", reason: "Approved sources disagree.", using: approved };   // any disagreement goes to an Editor, even when two sites agree with each other
  if (byValue.get(values[0]).size >= 2) return { status: "confirmed", rule: "two_sources", value: values[0], using: [...byValue.get(values[0]).values()] };
  return { status: "waiting", reason: "Only one approved source so far; a second one that agrees is needed.", using: approved };
}

// ---------------------------------------------------------------- the sheet
// identity: facts the app already holds, from the catalog or the player's own wine. facts: confirmed rows
// [{ fact_key, value, rule, sources: [{ url, domain, quote, fetched_at }], confirmed_at }]. unconfirmed: candidates not yet confirmed.
export function identityLines(w) {
  const x = w || {};
  const vintage = x.is_non_vintage ? "NV" : x.vintage_year != null ? String(x.vintage_year) : x.vintage || "";
  return [
    ["Producer", x.producer], ["Wine", x.wine_name || x.cuvee], ["Vintage", vintage],
    ["Type", x.style && x.style !== "unknown" ? x.style : ""], ["Place", [x.appellation, x.region, x.country].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", ") || x.region_text || ""],
    ["Grapes", x.grape || x.grape_text || ""],
  ].filter(([, v]) => v);
}
export function sheetModel({ identity, facts = [], choices = DEFAULT_CHOICES, unconfirmed = [] }) {
  const have = new Map((facts || []).map((f) => [f.fact_key, f]));
  const sections = GROUPS.map((g) => ({
    id: g.id, title: g.title,
    rows: fieldsOf(g.id).filter((f) => choices.includes(f.id)).map((f) => {
      const fact = have.get(f.id);
      return fact
        ? { id: f.id, label: f.label, status: "confirmed", value: displayValue(f.id, fact.value), rule: fact.rule || "", sources: (fact.sources || []).map((s) => ({ url: s.url || "", domain: s.domain || domainOf(s.url), fetched_at: s.fetched_at || "" })), confirmed_at: fact.confirmed_at || "" }
        : { id: f.id, label: f.label, status: "missing", value: "", rule: "", sources: [] };
    }),
  })).filter((s) => s.rows.length);
  const pending = (unconfirmed || []).filter((c) => choices.includes(c.fact_key) && !have.has(c.fact_key) && c.status !== "rejected")
    .map((c) => ({ id: c.fact_key, label: (fieldById(c.fact_key) || {}).label || c.fact_key, value: displayValue(c.fact_key, c.value), domain: c.domain || domainOf(c.source_url), url: c.source_url || "" }));
  return { identity: identityLines(identity), sections, unconfirmed: pending, confirmedCount: sections.reduce((n, s) => n + s.rows.filter((r) => r.status === "confirmed").length, 0) };
}
export const RULE_TEXT = { producer_source: "from the producer's own site", two_sources: "two approved sources agree", editor_entered: "entered and checked by an editor" };
// Plain text for Copy: identity, then each confirmed fact with its source. Missing lines are listed as "not confirmed yet".
export function sheetText(model, title = "") {
  const out = [];
  if (title) out.push(title, "");
  model.identity.forEach(([k, v]) => out.push(`${k}: ${v}`));
  model.sections.forEach((s) => {
    out.push("", s.title.toUpperCase());
    s.rows.forEach((r) => out.push(r.status === "confirmed" ? `${r.label}: ${r.value} (${r.sources.map((x) => x.domain).filter(Boolean).join(", ") || RULE_TEXT[r.rule] || "source on record"})` : `${r.label}: not confirmed yet`));
  });
  out.push("", "Confirmed from the producer's own site or from approved sources. Not a tasting opinion.");
  return out.join("\n");
}

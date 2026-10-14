#!/usr/bin/env node
// Checks a Tech sheet research results file against the REAL pages (docs/TECHSHEET_RESEARCH.md). Not part of the app; run it by hand.
//   node tools/verify-research.mjs techsheet-results.json --worklist techsheet-worklist-DATE.json [--out file] [--timeout 15000]
// For every find it fetches the cited page itself and uses checkQuote and normaliseValue from techsheet.js: the quote must really be on the page,
// the value must be inside the quote, and the page must name the producer (and the wine, for facts about a vintage). The producer and wine names
// come from the work list (the app's catalog), never from the results file. The model that did the research never marks its own work as checked.
//   quote_checked: true   the page was fetched and the quote is on it
//   dropped               the page was fetched and the quote is NOT on it (or the value/producer/wine does not match): not written to the output
//   quote_checked: false  the page could not be checked (PDF, not reachable, too big): kept, but it can never confirm a fact by itself
// No dependencies; needs Node 18 or newer.
import fs from "node:fs";
import crypto from "node:crypto";
import * as T from "../techsheet.js";

const args = process.argv.slice(2);
const flag = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const input = args[0] && !args[0].startsWith("--") ? args[0] : "";
const wlPath = flag("--worklist"), timeout = Number(flag("--timeout", 15000)), MAX_BYTES = 3 * 1024 * 1024;
if (!input || !wlPath) { console.error("Usage: node tools/verify-research.mjs results.json --worklist worklist.json [--out file]"); process.exit(2); }
const out = flag("--out", input.replace(/\.json$/i, "") + ".verified.json");

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "-", mdash: "-", rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"', eacute: "é", egrave: "è", agrave: "à", ocirc: "ô", ccedil: "ç", uuml: "ü", ouml: "ö", auml: "ä" };
export function htmlToText(html) {
  return String(html)
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => (ENT[n.toLowerCase()] !== undefined ? ENT[n.toLowerCase()] : " ")).replace(/\s+/g, " ").trim();
}
const cache = new Map();
async function getPage(url) {
  if (cache.has(url)) return cache.get(url);
  const p = (async () => {
    try {
      const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), timeout);
      const res = await fetch(url, { redirect: "follow", signal: ctl.signal, headers: { "user-agent": "WineAppFactChecker/1 (+owner-run verification)", accept: "text/html,text/plain" } });
      clearTimeout(timer);
      if (!res.ok) return { unverifiable: `The page answered ${res.status}.` };
      const type = String(res.headers.get("content-type") || "").toLowerCase();
      if (type.includes("pdf")) return { unverifiable: "PDF pages cannot be checked by this tool." };
      if (type && !/text\/|html|xml/.test(type)) return { unverifiable: `Not a text page (${type}).` };
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > MAX_BYTES) return { unverifiable: "The page is too large to check." };
      const raw = buf.toString("utf8");
      return { text: type.includes("plain") ? raw : htmlToText(raw), sha: crypto.createHash("sha256").update(buf).digest("hex"), at: new Date().toISOString() };
    } catch (e) { return { unverifiable: "The page could not be reached (" + (e && e.name === "AbortError" ? "timeout" : (e && e.message) || "error") + ")." }; }
  })();
  cache.set(url, p);
  return p;
}

const results = JSON.parse(fs.readFileSync(input, "utf8")), work = JSON.parse(fs.readFileSync(wlPath, "utf8"));
if (results.schema !== T.RESULTS_SCHEMA) { console.error(`Not a ${T.RESULTS_SCHEMA} file.`); process.exit(2); }
if (work.schema !== T.WORKLIST_SCHEMA) { console.error(`The work list must be a ${T.WORKLIST_SCHEMA} file.`); process.exit(2); }
const wines = new Map((work.wines || []).map((w) => [w.subject_key, w])), producers = new Map((work.producers || []).map((p) => [p.producer_key, p]));

const verified = { ...results, verified_by: "verify-research.mjs/1", verified_at: new Date().toISOString(), items: [], producer_sites: [], dropped: [] };
const stats = { checked: 0, unchecked: 0, dropped: 0 };
for (const it of Array.isArray(results.items) ? results.items : []) {
  const f = T.fieldById(it && it.fact_key);
  const drop = (why) => { verified.dropped.push({ fact_key: it && it.fact_key, subject_key: it && it.subject_key, url: it && it.url, why }); stats.dropped++; };
  if (!f) { drop(["Not a field on the sheet."]); continue; }
  const w = f.level === "vintage" ? wines.get(it.subject_key) : null, p = f.level === "producer" ? producers.get(it.subject_key) : producers.get(w && w.producer_key);
  if (!p || (f.level === "vintage" && !w)) { drop(["Not on the work list."]); continue; }
  if (!/^https?:\/\//i.test(String(it.url || ""))) { drop(["Not a web address."]); continue; }
  const pg = await getPage(it.url);
  const base = { ...it, producer: p.producer, wine: w ? w.wine : "", producer_key: p.producer_key };
  if (pg.unverifiable) { verified.items.push({ ...base, quote_checked: false, note: pg.unverifiable }); stats.unchecked++; continue; }
  const r = T.checkQuote({ page: pg.text, quote: it.quote, rawValue: it.raw_value, names: { producer: p.producer, wine: w ? w.wine : "" } });
  if (!r.ok) { drop(r.reasons); continue; }
  verified.items.push({ ...base, quote_checked: true, fetched_at: pg.at, page_sha256: pg.sha }); stats.checked++;
}
for (const s of Array.isArray(results.producer_sites) ? results.producer_sites : []) {
  const key = T.producerKey(s && (s.producer_key || s.producer)), p = producers.get(key);
  if (!p || !/^https?:\/\//i.test(String(s.url || ""))) { verified.dropped.push({ producer_key: key, url: s && s.url, why: ["Not on the work list or not a web address."] }); stats.dropped++; continue; }
  const pg = await getPage(s.url);
  if (pg.unverifiable) { verified.producer_sites.push({ ...s, producer_key: key, site_checked: false, note: pg.unverifiable }); continue; }
  if (!T.producerKey(pg.text).includes(T.producerKey(p.producer))) { verified.dropped.push({ producer_key: key, url: s.url, why: ["The page does not name the producer."] }); stats.dropped++; continue; }
  verified.producer_sites.push({ ...s, producer_key: key, site_checked: true, fetched_at: pg.at });
}
fs.writeFileSync(out, JSON.stringify(verified, null, 2));
console.log(`Checked against the page: ${stats.checked}. Could not be checked (kept, never confirm alone): ${stats.unchecked}. Dropped: ${stats.dropped}.`);
console.log(`Written: ${out}`);

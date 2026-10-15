// Fixing wine words in dictated text. Pure: no page, no network.
// Speech recognition is tuned for everyday English, so "Nebbiolo" comes out as "nebiolo" and "Gevrey-Chambertin" as "gevre chambertan". This file compares the words the player said
// with a vocabulary (grapes, the catalog's own producers and places, and the wine words in winewords.js) and corrects near misses to the real spelling.
// It is rule-based and only fixes SPELLING of the player's own words from known lists; it never adds a fact. Fixes are reversible (every fix keeps what was heard), weaker matches are only
// offered as "Did you mean", and an ordinary English word is never changed.
import { fold } from "./grapes.js?v=2";

// Ordinary words that must never be "corrected" into a wine word (the list is deliberately plain and short; add to it if a real word gets changed).
const COMMON = new Set(("a about after all also always an and any are as at back be because been beer but by can cold dark day did do does dry each easy even every fresh find first for from full get give go good great had has have he her here him his how i if in into is it its just keep know last light like little long look made make many may me more most much my near new next no not now of off old on one only or other our out over own past pretty quite rather red right rose same see she short should since so some soft still such sweet take than that the their them then there these they thin this those thought through to too two under until up us use very want was way we well were what when where which while white who why will with would year yes you your " +
  "reserve classic superior estate quiet wine wines glass bottle taste tasted tasting nose palate finish fruit fruity fruits berry berries cherry cherries plum plums apple pear peach lemon lime orange citrus oak oaky spice spicy pepper herb herbs flower floral earth earthy smoke smoky acid acidity body bodied balance balanced bright rich thick smooth crisp clean sharp bitter sour tart dense deep pale ripe young aged age vintage cellar dinner food meat fish cheese bread price cheap expensive buy drink drank bought good great nice lovely beautiful quite really very long short medium high low strong weak pink brown yellow gold golden amber purple ruby garnet black green blue cream butter vanilla toast toasty coffee chocolate honey sugar salt salty mineral stone wet dry sweet sweetness tannic tannins soft velvet silky").split(/\s+/).filter(Boolean));
const isCommon = (w) => COMMON.has(fold(w));

const flatOf = (s) => fold(s).replace(/ /g, "");
// A rough "how it sounds" key: first letter, then the consonants with look-alike spellings joined (ph=f, c/k/q=k, gn=n, doubles once). "nebbiolo" and "nebiolo" share one.
export function skeleton(s) {
  const f = flatOf(s).replace(/ph/g, "f").replace(/gn/g, "n").replace(/[ckq]+/g, "k").replace(/(.)\1+/g, "$1");
  return f ? f[0] + f.slice(1).replace(/[aeiouyhw]/g, "") : "";
}
// Edit distance with swaps counting as one, giving up early when it is bigger than `max`.
export function distance(a, b, max = 99) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const m = a.length, n = b.length;
  let prev2 = null, prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i]; let best = i;
    for (let j = 1; j <= n; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + c);
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v; if (v < best) best = v;
    }
    if (best > max) return max + 1;
    prev2 = prev; prev = cur;
  }
  return prev[n];
}

// lists: arrays of spellings (grapes, producers, places, curated words). Returns the vocabulary the matcher reads.
export function buildVocab(...lists) {
  const seen = new Set(), terms = [];
  for (const list of lists) for (const raw of list || []) {
    const canon = String(raw || "").trim();
    const flat = flatOf(canon);
    if (flat.length < 4 || seen.has(flat)) continue;
    seen.add(flat);
    terms.push({ canon, flat, key: skeleton(canon), words: fold(canon).split(" ").length });
  }
  const exact = new Map(terms.map((t) => [t.flat, t]));
  const byLen = new Map();
  terms.forEach((t) => { const k = t.flat.length; if (!byLen.has(k)) byLen.set(k, []); byLen.get(k).push(t); });
  return { terms, exact, byLen };
}

// How a group of heard words relates to the vocabulary: { term, kind } where kind is "same" (the right spelling, maybe in different case or without the hyphen),
// "fix" (a near miss, applied), "maybe" (a weaker near miss, only offered) or null.
export function matchGroup(words, vocab) {
  const flat = words.map(flatOf).join("");
  if (flat.length < 4) return null;
  if (words.length === 1 && isCommon(words[0])) return null;
  if (words.every(isCommon)) return null;
  const hit = vocab.exact.get(flat);
  if (hit) return { term: hit, kind: "same" };
  if (flat.length < 5) return null;
  const key = skeleton(words.join(" "));
  const room = Math.max(1, Math.ceil(flat.length * 0.3));
  let best = null;
  for (let len = flat.length - room; len <= flat.length + room; len++) {
    for (const t of vocab.byLen.get(len) || []) {
      const d = distance(flat, t.flat, room);
      if (d > room) continue;
      // "shardonay" for "Chardonnay": the first letter can sound the same (c, k, s, ch, sh), so the rest of the sound is compared on its own too.
      const sameKey = key && (key === t.key || (key.length >= 4 && key.slice(1) === t.key.slice(1))), sameStart = flat[0] === t.flat[0];
      let kind = null;
      if (d <= 1 && flat.length >= 5 && (sameKey || sameStart)) kind = "fix";
      else if (sameKey && flat.length >= 6 && d <= Math.ceil(flat.length * 0.3)) kind = "fix";
      else if (sameStart && flat.length >= 7 && d <= Math.ceil(flat.length * 0.25)) kind = "maybe";
      if (!kind) continue;
      const score = (kind === "fix" ? 2 : 1) * 100 - d * 10 + (sameKey ? 5 : 0) - Math.abs(flat.length - t.flat.length);
      if (!best || score > best.score) best = { term: t, kind, score };
    }
  }
  return best ? { term: best.term, kind: best.kind } : null;
}

// Splits "it was, uh, nebiolo!" into words with their punctuation kept aside, so a fix keeps the commas and full stops where they were.
const tokenize = (text) => String(text == null ? "" : text).split(/\s+/).filter(Boolean).map((w) => {
  const m = w.match(/^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u);
  return { pre: m[1], core: m[2], post: m[3] };
});
const MAX_WORDS = 3;
// text: what was heard. Returns { tokens, changes }: tokens are what to write ({ text, raw, id, kind }), changes lists the fixes and suggestions ({ id, kind, raw, out }) for the screen.
// kind "same" is applied without a note, "fix" is applied and listed (undo shows the raw words), "maybe" is not applied and only listed.
export function fixTerms(text, vocab) {
  const toks = tokenize(text), out = [], changes = [];
  let i = 0, id = 0;
  while (i < toks.length) {
    // Try the next 1, 2 and 3 words; a sure match (right spelling or a close fix) beats a weak suggestion, and a longer group beats a shorter one of the same strength.
    let hit = null, span = 1;
    const rank = { same: 3, fix: 3, maybe: 1 };
    for (let n = Math.min(MAX_WORDS, toks.length - i); n >= 1; n--) {
      const g = toks.slice(i, i + n).map((t) => t.core);
      if (g.some((w) => !w)) continue;
      const m = matchGroup(g, vocab);
      if (m && (!hit || rank[m.kind] > rank[hit.kind])) { hit = m; span = n; }
    }
    if (!hit) { const t = toks[i]; out.push({ text: t.pre + t.core + t.post, raw: t.pre + t.core + t.post, id: null, kind: null }); i++; continue; }
    const first = toks[i], last = toks[i + span - 1];
    const raw = toks.slice(i, i + span).map((t, k) => (k === 0 ? t.pre : "") + t.core + (k === span - 1 ? t.post : "")).join(" ");
    const fixed = first.pre + hit.term.canon + last.post;
    if (hit.kind === "same") { out.push({ text: fixed, raw, id: null, kind: "same" }); }
    else {
      const cid = "w" + (id++);
      out.push({ text: hit.kind === "fix" ? fixed : raw, raw, id: cid, kind: hit.kind, out: fixed });
      changes.push({ id: cid, kind: hit.kind, raw: raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""), out: hit.term.canon });
    }
    i += span;
  }
  return { tokens: out, changes, text: out.map((t) => t.text).join(" ") };
}

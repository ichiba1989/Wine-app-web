// How names are compared: the one place that says when two pieces of text count as the same (owner, 2026-10-15).
// These keys are ONLY for looking things up and comparing. A name is never rewritten by them: what an editor typed, or the official spelling
// (accents, hyphens, legal abbreviations such as "Sta. Rita Hills"), is what is stored and shown.
// Three strengths, from strict to loose:
//   caseKey   accents and capitals ignored; punctuation and hyphens still count ("Saint-Julien" is not "Saint Julien"). For deciding that a place
//             or producer already exists, so nothing is silently reused.
//   plainKey  also ignores punctuation and hyphens, and reads ß/œ/æ as ss/oe/ae. For lookups that were already this loose (flavours, tags,
//             Bingo tests, the import match, search boxes).
//   matchKey  also reads St./Ste./Sta. as Saint/Sainte/Santa. Only for SUGGESTING ("Looks like St.-Julien already in our list") and for search:
//             an editor confirms before anything is reused.
// Pure: no browser, no network.

const base = (s) => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export const caseKey = (s) => base(s).replace(/\s+/g, " ").trim();
export const plainKey = (s) => base(s).replace(/ß/g, "ss").replace(/œ/g, "oe").replace(/æ/g, "ae").replace(/[^a-z0-9]+/g, " ").trim();
export const matchKey = (s) => plainKey(s).replace(/\bst\b/g, "saint").replace(/\bste\b/g, "sainte").replace(/\bsta\b/g, "santa");

// How many single-letter changes turn one text into the other (stops counting past `max`).
export function editDistance(a, b, max = 2) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = cur[0];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

// Existing names that look like the typed one but are not the same text (for the "Looks like ... already in our list" prompt).
// Same after matchKey ("Saint-Julien" / "St.-Julien", "Donnhoff" / "Dönnhoff"), or one letter apart on a longer name ("Billecart Salmon" /
// "Billecart Salmonn"). A name already in the list exactly (caseKey) returns nothing: there is nothing to ask.
// Other names an editor confirmed for the same producer ("Donnhoff" for "Dönnhoff"): caseKey(alias) -> the name in the list (setNameAliases,
// from the database's producer_aliases). A typed alias is offered as its producer.
let ALIASES = new Map();
export const setNameAliases = (pairs) => { ALIASES = new Map((pairs || []).map(([alias, name]) => [caseKey(alias), name])); };
export function lookalikes(name, names, limit = 3) {
  const typed = String(name || "").trim();
  if (!typed) return [];
  const k = matchKey(typed), c = caseKey(typed);
  if (!k || (names || []).some((n) => caseKey(n) === c)) return [];
  const alias = ALIASES.get(c);
  if (alias && (names || []).includes(alias)) return [alias];
  const seen = new Set(), out = [];
  for (const n of names || []) {
    const nk = matchKey(n);
    if (!nk || seen.has(caseKey(n))) continue;
    if (nk === k || (k.length >= 6 && editDistance(nk, k, 1) <= 1)) { seen.add(caseKey(n)); out.push(n); if (out.length >= limit) break; }
  }
  return out;
}

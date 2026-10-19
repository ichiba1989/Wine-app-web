// Year in wine: what the player's own journal says about one year. Pure (no browser, no network).
// It only counts what the player recorded; nothing is guessed about a wine.
import { VERDICTS } from "./logic.js?v=23";

const yearOf = (e) => { const y = parseInt(String(e.consumed_on || "").slice(0, 4), 10); return Number.isFinite(y) ? y : null; };
const grapesOf = (e) => String(e.grape || "").split(/,|\/|&| and /i).map((g) => g.trim()).filter(Boolean);
const byDate = (a, b) => String(a.consumed_on || "").localeCompare(String(b.consumed_on || "")) || String(a.created_at || "").localeCompare(String(b.created_at || ""));
const WEIGHT = { buy: 2, drink: 1, none: 0, respect: -0.5, no: -2 };
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// The years that have journal entries, newest first.
export const recapYears = (journal) => [...new Set((journal || []).map(yearOf).filter(Boolean))].sort((a, b) => b - a);

const topOf = (counts) => [...counts].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0] || null;
const tally = (list) => { const m = new Map(); list.forEach((k) => { if (k) m.set(k, (m.get(k) || 0) + 1); }); return m; };

// A firsts line is a country or grape the player's journal shows for the first time in this year.
export function recapOf(journal, year) {
  const all = [...(journal || [])].sort(byDate);
  const mine = all.filter((e) => yearOf(e) === year);
  const before = all.filter((e) => yearOf(e) !== null && yearOf(e) < year);
  const seenCountry = new Set(before.map((e) => e.country).filter(Boolean));
  const seenGrape = new Set(before.flatMap(grapesOf));
  const newCountries = [], newGrapes = [];
  mine.forEach((e) => {
    if (e.country && !seenCountry.has(e.country)) { seenCountry.add(e.country); newCountries.push({ name: e.country, entry: e }); }
    grapesOf(e).forEach((g) => { if (!seenGrape.has(g)) { seenGrape.add(g); newGrapes.push({ name: g, entry: e }); } });
  });
  const rated = mine.filter((e) => e.verdict);
  const topRated = [...rated].filter((e) => (WEIGHT[e.verdict] || 0) > 0).sort((a, b) => WEIGHT[b.verdict] - WEIGHT[a.verdict] || byDate(a, b)).slice(0, 5);
  const months = tally(mine.map((e) => { const m = parseInt(String(e.consumed_on).slice(5, 7), 10); return m >= 1 && m <= 12 ? m : null; }));
  const busy = topOf(months);
  const topStyle = topOf(tally(mine.map((e) => e.style)));
  return {
    year, total: mine.length, rated: rated.length,
    countries: [...new Set(mine.map((e) => e.country).filter(Boolean))],
    grapes: [...new Set(mine.flatMap(grapesOf))],
    newCountries, newGrapes, topRated,
    verdicts: VERDICTS.map((v) => ({ code: v.code, label: v.short, count: rated.filter((e) => e.verdict === v.code).length })),
    busiestMonth: busy ? { name: MONTHS[busy[0] - 1], count: busy[1] } : null,
    topStyle: topStyle ? { style: topStyle[0], count: topStyle[1] } : null,
    pinned: mine.filter((e) => e.country),
  };
}

// The text a player can share or copy: only counts and the player's own wine names.
export function recapText(r, nameOf = (e) => e.wine_name || "a wine") {
  if (!r.total) return `My ${r.year} in wine: nothing recorded yet.`;
  const lines = [`My ${r.year} in wine`, `${r.total} wine${r.total === 1 ? "" : "s"} in my journal, ${r.rated} rated.`];
  if (r.countries.length) lines.push(`From ${r.countries.length} countr${r.countries.length === 1 ? "y" : "ies"}: ${r.countries.join(", ")}.`);
  if (r.newGrapes.length) lines.push(`First time with: ${r.newGrapes.slice(0, 5).map((g) => g.name).join(", ")}.`);
  if (r.topRated.length) lines.push(`Favourites: ${r.topRated.slice(0, 3).map((e) => nameOf(e)).join("; ")}.`);
  return lines.join("\n");
}

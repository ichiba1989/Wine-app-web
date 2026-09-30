// Profile tab: Overview, Palate, Knowledge, Explored and Trophies.
// The rules at the top are pure (no browser, no network) so they can be tested on their own.
// The controller at the bottom loads what it needs from Supabase and draws the tab.
import { DIMS, dimRange, VERDICTS, FLAGS, esc, styleLabel, verdictShort, entryCard, entryName } from "./logic.js?v=5";
import { marksHtml } from "./views.js?v=5";
import { accountCardHtml } from "./account.js?v=1";

// ---------------------------------------------------------------- settings
// How much each verdict counts toward the palate. A journal wine with no verdict yet counts a
// little (a quarter of "Would drink again").
export const VERDICT_WEIGHTS = { buy: 2, drink: 1, none: 0, respect: -0.5, no: -2 };
export const UNRATED_WEIGHT = 0.25;
export const TOPICS = ["Grapes", "Regions", "Producers", "Winemaking", "Other alcohol"];
export const DIFFS = [
  { id: "beginner", label: "Beginner" },
  { id: "enthusiast", label: "Enthusiast" },
  { id: "professional", label: "Professional" },
  { id: "scholar", label: "Scholar" },
];
// Rank titles by number of trophy tiers earned.
export const TROPHY_RANKS = [
  { min: 26, title: "Grand Cru" },
  { min: 21, title: "Expert" },
  { min: 16, title: "Connoisseur" },
  { min: 11, title: "Aficionado" },
  { min: 6, title: "Enthusiast" },
  { min: 0, title: "Getting into wine" },
];
export const trophyRank = (n) => TROPHY_RANKS.find((r) => n >= r.min).title;
export const TIER_NAMES = ["Bronze", "Silver", "Gold", "Platinum"];
export const TIER_COLORS = ["#A8743A", "#8C959B", "#C2A03A", "#5F7A8C"];
const weightOf = (verdict) => (verdict ? VERDICT_WEIGHTS[verdict] ?? 0 : UNRATED_WEIGHT);
const pctOf = (a, b) => (b ? Math.round((a / b) * 100) : null);

// ---------------------------------------------------------------- palate
// refs: { vintageToWine: Map, reference: rows from wine_reference_values, defaults: rows from wine_default_values }.
// A wine's baseline is its editor reference value, or failing that its suggested default.
export function baselines(refs) {
  const vintageToWine = refs.vintageToWine || new Map();
  const byWine = new Map(), byVintage = new Map(), defByWine = new Map();
  const put = (m, k, d, v) => { if (!m.has(k)) m.set(k, {}); m.get(k)[d] = Number(v); };
  (refs.reference || []).forEach((r) => (r.wine_vintage_id ? put(byVintage, r.wine_vintage_id, r.dimension_key, r.value) : put(byWine, r.wine_id, r.dimension_key, r.value)));
  (refs.defaults || []).forEach((r) => put(defByWine, r.wine_id, r.dimension_key, r.value));
  return (wineVintageId) => {
    if (!wineVintageId) return { base: null, ref: null };
    const wineId = vintageToWine.get(wineVintageId);
    const ref = { ...(byWine.get(wineId) || {}), ...(byVintage.get(wineVintageId) || {}) };
    const base = { ...(defByWine.get(wineId) || {}), ...ref };
    return { base: Object.keys(base).length ? base : null, ref: Object.keys(ref).length ? ref : null };
  };
}
// One entry per journal wine, with its saved structure ratings.
export function palateEntries(journal, perceptionRows, baselineFor = () => ({ base: null, ref: null })) {
  const byConsumption = new Map();
  (perceptionRows || []).forEach((r) => {
    if (!byConsumption.has(r.consumption_id)) byConsumption.set(r.consumption_id, []);
    byConsumption.get(r.consumption_id).push(r);
  });
  return journal.map((e) => {
    const perception = {}, adjusted = {};
    (byConsumption.get(e.id) || []).forEach((r) => { perception[r.dimension_key] = Number(r.value); adjusted[r.dimension_key] = !!r.adjusted; });
    const { base, ref } = baselineFor(e.wine_vintage_id);
    return { id: e.id, verdict: e.verdict || null, grape: e.grape, country: e.country, style: e.style, perception, adjusted, base, ref };
  });
}
// Preference lean per dimension, from -1 (low end) to 1 (high end). The user's rating is
// averaged with the baseline so personal perception alone does not drive the profile.
// Without a baseline, only ratings the user actually changed count. Every dimension is measured
// from its own middle, so the 1-5 scales, oak (0 or 1) and CO2 (0, 1 or 2) are all comparable.
export function computePalate(entries) {
  return DIMS.map((d) => {
    const { min, max, mid, half } = dimRange(d);
    let sum = 0, absW = 0, n = 0, pSum = 0, pN = 0;
    entries.forEach((e) => {
      const b = e.base && e.base[d.key] != null ? e.base[d.key] : null;
      const adj = !!(e.adjusted && e.adjusted[d.key]) && typeof e.perception[d.key] === "number";
      if (b === null && !adj) return;
      const baseVal = b === null ? mid : b;
      const effective = adj ? (e.perception[d.key] + baseVal) / 2 : baseVal;
      const w = weightOf(e.verdict);
      if (w !== 0) { sum += w * (effective - mid); absW += Math.abs(w); n += 1; }
      // "You notice more / less than the baseline" uses the raw difference, and only editor references.
      if (adj && e.ref && e.ref[d.key] != null) { pSum += e.perception[d.key] - e.ref[d.key]; pN += 1; }
    });
    const lean = absW ? Math.max(-1, Math.min(1, sum / (absW * half))) : 0;
    return { ...d, lean, n, offset: pN ? pSum / pN : 0, pN, notice: (max - min) / 4 };
  });
}
export const leanWords = (palate) => palate.filter((d) => d.n >= 2 && Math.abs(d.lean) > 0.2).map((d) => (d.lean > 0 ? d.hi : d.lo));
const listText = (a) => (a.length <= 1 ? a[0] || "" : `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`);

// One paragraph that sums up the structure lean and the other preferences seen so far.
export function palateSummary(entries, palate) {
  if (entries.length < 2) return "Add a couple of wines to your journal and a summary of your palate will appear here.";
  const top = (get, sign = 1, n = 2) => {
    const m = {};
    entries.forEach((e) => { const k = get(e); const w = weightOf(e.verdict) * sign; if (k && w > 0) m[k] = (m[k] || 0) + w; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n).map((x) => x[0]);
  };
  const out = [];
  const leans = leanWords(palate);
  out.push(leans.length ? `So far you lean ${listText(leans)}.` : "There is no clear lean in wine structure yet.");
  const grapes = top((e) => e.grape);
  const countries = top((e) => e.country);
  if (grapes.length && countries.length) out.push(`Your favorites include ${listText(grapes)}, most often from ${listText(countries)}.`);
  else if (grapes.length) out.push(`Your favorites include ${listText(grapes)}.`);
  else if (countries.length) out.push(`You have enjoyed wines most often from ${listText(countries)}.`);
  const style = top((e) => { const l = styleLabel(e.style); return l === "Other or unknown" ? null : l; }, 1, 1)[0];
  if (style) out.push(`You tend toward ${style.toLowerCase()} wines.`);
  const lessKeen = top((e) => e.grape, -1).filter((g) => !grapes.includes(g));
  if (lessKeen.length) out.push(`You have been less keen on ${listText(lessKeen)}.`);
  if (entries.some((e) => e.verdict === "respect")) out.push("You can appreciate wines that are not your style without writing off the whole category.");
  const unrated = entries.filter((e) => !e.verdict).length;
  out.push(unrated > 0
    ? `${unrated} ${unrated === 1 ? "wine in your journal is" : "wines in your journal are"} not rated yet. Rating and reviewing ${unrated === 1 ? "it" : "them"} will make this more accurate.`
    : "Rate and review more wines in your journal to keep sharpening this.");
  return out.join(" ");
}

// ---------------------------------------------------------------- knowledge
// answers: every quiz answer in time order. Percentages only; the number of questions is never shown.
// % correct uses the latest answer to each question, so a miss answered correctly later counts as correct.
export function quizProgress(questions, answers) {
  const latest = new Map();
  answers.forEach((a) => latest.set(a.question_id, a.result));
  const summarise = (qs) => {
    const answered = qs.filter((q) => latest.get(q.id) === "correct" || latest.get(q.id) === "wrong");
    return {
      completed: qs.length ? Math.round((qs.filter((q) => latest.has(q.id)).length / qs.length) * 100) : 0,
      correct: pctOf(answered.filter((q) => latest.get(q.id) === "correct").length, answered.length),
    };
  };
  return {
    latest,
    overall: summarise(questions),
    byTopic: TOPICS.map((t) => ({ id: t, label: t, ...summarise(questions.filter((q) => q.topic === t)) })),
    byDiff: DIFFS.map((d) => ({ ...d, ...summarise(questions.filter((q) => q.difficulty === d.id)) })),
  };
}
export function timedStats(runs) {
  if (!runs.length) return null;
  const answered = runs.reduce((a, r) => a + r.answered, 0);
  const correct = runs.reduce((a, r) => a + r.correct, 0);
  const secs = runs.reduce((a, r) => a + r.seconds, 0);
  const bestFor = (s) => { const rs = runs.filter((r) => r.seconds === s); return rs.length ? Math.max(...rs.map((r) => r.correct)) : null; };
  return {
    rounds: runs.length, accuracy: pctOf(correct, answered), bestStreak: Math.max(...runs.map((r) => r.best_streak)),
    best60: bestFor(60), best120: bestFor(120), avg: (answered / runs.length).toFixed(1),
    skipped: runs.reduce((a, r) => a + (r.skipped || 0), 0), answered,
    perQuestion: answered ? Math.round(secs / answered) : null,
    recent: [...runs].reverse().slice(0, 5),
  };
}

// ---------------------------------------------------------------- explored
export function exploredStats(journal, states, cards) {
  const fam = (k) => states.filter((s) => s.familiarity === k).length;
  const int = (k) => states.filter((s) => s.interest === k).length;
  const tried = [...new Set(journal.map((e) => e.country).filter(Boolean))];
  const all = [...new Set(cards.map((c) => c.country).filter(Boolean))];
  return {
    recognized: fam("recognize"), unknown: fam("unknown"), had: fam("had"), interested: int("try"), notInterested: int("nope"),
    verdicts: VERDICTS.map((v) => ({ label: v.short, count: journal.filter((e) => e.verdict === v.code).length })),
    unrated: journal.filter((e) => !e.verdict).length,
    countries: tried, notYet: all.filter((c) => !tried.includes(c)),
    grapes: [...new Set(journal.map((e) => e.grape).filter(Boolean))],
  };
}

// ---------------------------------------------------------------- trophies
// Each trophy has tiers (Bronze, Silver, Gold, Platinum). desc(n) describes the next target.
export function computeTrophies({ journal, states, answers, questionsById, runs, flagCount, perceptionRows }) {
  const rated = journal.filter((e) => e.verdict);
  const ratedIds = new Set(rated.map((e) => e.id));
  const correct = answers.filter((a) => a.result === "correct");
  const hard = correct.filter((a) => { const q = questionsById.get(a.question_id); return q && (q.difficulty === "professional" || q.difficulty === "scholar"); }).length;
  let best = 0, run = 0;
  answers.forEach((a) => { if (a.result === "correct") { run += 1; best = Math.max(best, run); } else run = 0; });
  const lastResult = new Map(), fixed = new Set();
  answers.forEach((a) => {
    if (a.result === "correct" && lastResult.has(a.question_id) && lastResult.get(a.question_id) !== "correct") fixed.add(a.question_id);
    lastResult.set(a.question_id, a.result);
  });
  const timedBest = (s) => Math.max(0, ...runs.filter((r) => r.seconds === s).map((r) => r.correct));
  const topicsMastered = new Set([...lastResult].filter(([, r]) => r === "correct").map(([id]) => (questionsById.get(id) || {}).topic).filter(Boolean)).size;
  const adjusted = (perceptionRows || []).filter((p) => p.adjusted && ratedIds.has(p.consumption_id)).length;

  const T = (id, icon, title, desc, current, tiers) => {
    const level = tiers.filter((t) => current >= t).length;
    const prev = level > 0 ? tiers[level - 1] : 0;
    const next = tiers[level];
    const maxed = next === undefined;
    return { id, icon, title, desc, current, tiers, level, next, maxed, earned: level > 0, progress: maxed ? 1 : (current - prev) / (next - prev) };
  };
  return [
    T("swipes", "layers", "Wine Spotter", (n) => `Swipe ${n} wines`, states.length, [1, 10, 50, 200]),
    T("reviews", "glass", "Taster", (n) => `Rate ${n} wines`, rated.length, [1, 5, 25, 100]),
    T("countries", "globe", "Globetrotter", (n) => `Rate wines from ${n} countries`, new Set(rated.map((e) => e.country).filter(Boolean)).size, [3, 6, 10]),
    T("bubbles", "sparkles", "Bubbles", (n) => `Rate ${n} sparkling wines`, rated.filter((e) => e.style === "sparkling").length, [1, 3, 10]),
    T("photos", "camera", "Shutterbug", (n) => `Add photos to ${n} reviews`, rated.filter((e) => e.first_photo_path).length, [1, 5, 20]),
    T("had", "check", "Been There", (n) => `Swipe up on ${n} bottles you've had`, states.filter((s) => s.familiarity === "had").length, [1, 5, 20]),
    T("trust", "award", "Trust Your Palate", (n) => `Adjust ${n} wine structure sliders`, adjusted, [5, 25, 100]),
    T("correct", "cap", "Quiz Starter", (n) => `Answer ${n} questions correctly`, correct.length, [5, 25, 100, 300]),
    T("streak", "flame", "On a Roll", (n) => `Get ${n} correct in a row`, best, [5, 10, 20]),
    T("second", "rotate", "Second Chance", (n) => `Turn ${n} missed questions into correct answers`, fixed.size, [1, 5, 20]),
    T("hard", "trophy", "Scholar's Path", (n) => `Answer ${n} Professional or Scholar questions correctly`, hard, [1, 10, 30]),
    T("quick", "timer", "Quick Draw", (n) => `Get ${n} correct in one 1-minute round`, timedBest(60), [3, 6, 10, 15]),
    T("clock", "timer", "Beat the Clock", (n) => `Get ${n} correct in one 2-minute round`, timedBest(120), [5, 10, 20, 30]),
    T("rounded", "grid", "Well Rounded", (n) => `Master questions in ${n} quiz topics`, topicsMastered, [2, 3, 5]),
    T("factcheck", "search", "Fact Checker", (n) => `Flag ${n} quiz questions or wines for review`, flagCount, [1, 5, 15]),
  ];
}
export const tiersEarned = (trophies) => trophies.reduce((a, t) => a + t.level, 0);

// ---------------------------------------------------------------- drawing
const icon = (paths, size = 20) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const PATHS = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  glass: '<path d="M8 3h8l-.5 6a3.5 3.5 0 0 1-7 0z"/><path d="M12 12.5V20"/><path d="M8.5 20h7"/>',
  cap: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4"/><path d="M12 13v4"/><path d="M8 21h8l-1-4H9z"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18"/><path d="M12 3a14 14 0 0 0 0 18"/>',
  sparkles: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  camera: '<path d="M4 7h3l2-3h6l2 3h3v12H4z"/><circle cx="12" cy="13" r="3.5"/>',
  check: '<path d="M4 12l5 5L20 6"/>',
  award: '<circle cx="12" cy="9" r="6"/><path d="M8.5 14l-1.5 7 5-3 5 3-1.5-7"/>',
  flame: '<path d="M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-4 2.5-5 .3 2 1.5 3 2.5 3-1-3 0-5.5 0-8z"/>',
  rotate: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M9 2h6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
};
const SUBS = [
  { id: "overview", label: "Overview", icon: "grid" },
  { id: "palate", label: "Palate", icon: "glass" },
  { id: "knowledge", label: "Knowledge", icon: "cap" },
  { id: "explored", label: "Explored", icon: "compass" },
  { id: "trophies", label: "Trophies", icon: "trophy" },
];
const card = (title, inner) => `<div class="pcard">${title ? `<div class="ptitle">${esc(title)}</div>` : ""}${inner}</div>`;
const flagName = (c) => `${FLAGS[c] || ""} ${esc(c)}`.trim();

function overviewHtml(P) {
  const rated = P.journal.filter((e) => e.verdict);
  // Newest by date, then by the time it was added (so two wines rated on the same day show the later one).
  const latest = [...rated].sort((a, b) => (b.consumed_on || "").localeCompare(a.consumed_on || "") || (b.created_at || "").localeCompare(a.created_at || ""))[0];
  const stat = (label, value) => `<div class="pstat"><div class="serif pnum">${value}</div><div class="muted small">${label}</div></div>`;
  const acquired = tiersEarned(P.trophies);
  const leans = leanWords(P.palate);
  return `<h2 class="serif ph">Overview</h2>
    <div class="pgrid">${stat("Wines rated", rated.length)}${stat("Wines swiped", P.states.length)}${stat("Quiz completed", P.questions.length ? `${P.quiz.overall.completed}%` : "–")}${stat("Quiz correct", P.quiz.overall.correct === null ? "–" : `${P.quiz.overall.correct}%`)}</div>
    ${card("Trophies", `<div class="serif pbig">${acquired}</div><div class="prank">${esc(trophyRank(acquired))}</div>`)}
    ${card("Your palate", `<p class="ptext">${leans.length ? `You lean ${esc(leans.join(", "))}.` : "Add a couple more wines to your journal to see your palate take shape."}</p>`)}
    ${latest ? card("Latest rating", `<div class="iname"><span class="serif">${esc(entryName(latest))}</span>${marksHtml(entryCard(latest), 16)}</div><div class="small wine"><b>${esc(verdictShort(latest.verdict))}</b></div>`) : ""}
    ${accountCardHtml(P.user)}
    ${P.userId ? `<div class="muted tiny uidline">Your account ID (needed to give you editor access): <span class="uid">${esc(P.userId)}</span></div>` : ""}`;
}

function palateHtml(P) {
  const bars = P.palate.map((d) => {
    const strong = d.n >= 2;
    const msg = !strong ? "Needs more wines" : d.lean > 0.2 ? `You lean ${d.hi}` : d.lean < -0.2 ? `You lean ${d.lo}` : "No clear lean yet";
    const pmsg = d.pN >= 2 && Math.abs(d.offset) >= d.notice ? `You tend to notice ${d.key === "co2" ? d.name : d.name.toLowerCase()} ${d.offset > 0 ? "more" : "less"} than the baseline` : "";
    return `<div class="dimrow2"><div class="dimends"><span>${d.lo}</span><b>${d.name}</b><span>${d.hi}</span></div>
      <div class="leanbar"><div class="knob" style="left:calc(${((d.lean + 1) / 2) * 100}% - 8px);opacity:${strong ? 1 : 0.35}"></div></div>
      <div class="small">${msg}</div>${pmsg ? `<div class="small slate">${pmsg}</div>` : ""}</div>`;
  }).join("");
  return `<h2 class="serif ph">Your palate so far</h2><div class="pcard">${bars}</div><p class="ptext para">${esc(palateSummary(P.entries, P.palate))}</p>`;
}

const WHEEL_COLORS = ["#7B1E3A", "#3E5C76", "#3A4B40", "#B08A3E", "#7A5C8E"];
// One wedge per topic. A wedge fills as more of that topic's questions have been answered,
// so gaps in knowledge show up as short wedges.
export function wheelSvg(byTopic) {
  const cx = 120, cy = 120, R = 108, n = byTopic.length;
  const pt = (r, a) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
  const wedge = (r, a0, a1) => `M ${cx} ${cy} L ${pt(r, a0)} A ${r} ${r} 0 0 1 ${pt(r, a1)} Z`;
  const parts = byTopic.map((d, i) => {
    const a0 = -Math.PI / 2 + (i / n) * 2 * Math.PI + 0.03, a1 = -Math.PI / 2 + ((i + 1) / n) * 2 * Math.PI - 0.03;
    const frac = d.completed / 100, col = WHEEL_COLORS[i % WHEEL_COLORS.length];
    return `<path d="${wedge(R, a0, a1)}" fill="#C3CFC1" opacity=".5"/>${frac > 0 ? `<path d="${wedge(R * frac, a0, a1)}" fill="${col}"/>` : ""}<path d="${wedge(R, a0, a1)}" fill="none" stroke="${col}" stroke-width="1.5"/>`;
  }).join("");
  return `<svg class="wheel" viewBox="0 0 240 240" role="img" aria-label="Knowledge wheel by topic">${parts}<circle cx="${cx}" cy="${cy}" r="${R * 0.5}" fill="none" stroke="#F2F5F0" stroke-dasharray="3 3"/><circle cx="${cx}" cy="${cy}" r="${R * 0.25}" fill="none" stroke="#F2F5F0" stroke-dasharray="3 3"/></svg>`;
}

function knowledgeHtml(P) {
  const q = P.quiz;
  const detail = (p) => `${p.completed}% completed${p.correct === null ? "" : `, ${p.correct}% correct`}`;
  if (!P.questions.length) return `<h2 class="serif ph">What you know</h2><p class="muted">No quiz questions yet. They appear here once the quiz questions are published.</p>`;
  const legend = q.byTopic.map((p, i) => `<div class="leg"><span><i style="background:${WHEEL_COLORS[i % WHEEL_COLORS.length]}"></i><b>${esc(p.label)}</b></span><span class="muted small">${detail(p)}</span></div>`).join("");
  const t = P.timed;
  const timed = !t ? card("Timed rounds", `<p class="muted small">No timed rounds yet. Try Timed in the Learn tab.</p>`)
    : card("Timed rounds", `<div class="tgrid">${[["Rounds played", t.rounds], ["Accuracy", t.accuracy === null ? "–" : `${t.accuracy}%`], ["Best streak", t.bestStreak], ["Best 1 min", t.best60 ?? "–"], ["Best 2 min", t.best120 ?? "–"], ["Avg per round", t.avg]]
        .map(([l, v]) => `<div class="tstat"><div class="serif">${v}</div><div class="muted tiny">${l}</div></div>`).join("")}</div>
      <p class="muted small">${t.answered} answered in total${t.skipped ? `, ${t.skipped} skipped` : ""}${t.perQuestion ? `, about ${t.perQuestion} seconds per question` : ""}.</p>
      <div class="small"><b>Recent rounds</b></div>${t.recent.map((r) => `<div class="muted small">${r.seconds / 60} min: ${r.correct} correct of ${r.answered}, best streak ${r.best_streak}</div>`).join("")}`);
  const diffs = q.byDiff.map((d) => `<div class="drow"><div class="dtop"><b>${d.label}</b><span class="muted small">${detail(d)}</span></div><div class="lbar"><div style="width:${d.completed}%"></div></div></div>`).join("");
  return `<h2 class="serif ph">What you know</h2><p class="muted small">Kept separate from what you like. Fill every wedge to round out your knowledge.</p>
    ${card("", wheelSvg(q.byTopic) + legend)}
    ${card("Overall", `<div class="twobig"><div><div class="serif pbig">${q.overall.completed}%</div><div class="muted small">completed</div></div><div><div class="serif pbig">${q.overall.correct === null ? "–" : q.overall.correct + "%"}</div><div class="muted small">correct</div></div></div>`)}
    ${timed}${card("By difficulty", diffs)}`;
}

function exploredHtml(P) {
  const x = P.explored;
  const verdicts = P.journal.length
    ? x.verdicts.map((v) => `<div class="kv"><span>${esc(v.label)}</span><span class="muted">${v.count}</span></div>`).join("") + `<div class="kv"><span>No verdict yet</span><span class="muted">${x.unrated}</span></div>`
    : `<p class="muted small">Nothing logged yet.</p>`;
  return `<h2 class="serif ph">What you've explored</h2>
    ${card("Your swipes", `<p class="ptext">${x.recognized} recognized, ${x.unknown} didn't know, ${x.had} had this bottle</p><p class="ptext">${x.interested} interested, ${x.notInterested} not interested</p>`)}
    ${card("Wines you've had", verdicts)}
    ${card("Countries", `<p class="ptext">${x.countries.length ? x.countries.map(flagName).join(", ") : "None yet"}</p>${x.notYet.length ? `<div class="muted small" style="margin-top:10px">Not yet explored</div><p class="ptext">${x.notYet.map(flagName).join(", ")}</p>` : ""}`)}
    ${card("Grapes you've had", `<p class="ptext">${x.grapes.length ? esc(x.grapes.join(", ")) : "None yet"}</p>`)}`;
}

function trophyTile(t) {
  const color = t.earned ? TIER_COLORS[t.level - 1] : "#C3CFC1";
  const target = t.maxed ? t.tiers[t.tiers.length - 1] : t.next;
  const dots = t.tiers.map((_, i) => `<i style="background:${i < t.level ? TIER_COLORS[i] : "#C3CFC1"}"></i>`).join("");
  return `<div class="trophy" style="border-color:${t.earned ? color : "#C3CFC1"}">
    <div class="ttop2"><span class="tbadge" style="background:${color};color:${t.earned ? "#fff" : "#5A6A5F"}">${icon(PATHS[t.icon])}</span><span class="tdots" aria-label="${t.level} of ${t.tiers.length} tiers">${dots}</span></div>
    <div class="ttl">${esc(t.title)}</div>${t.earned ? `<div class="tiny" style="color:${color};font-weight:600">${TIER_NAMES[t.level - 1]}</div>` : ""}
    <div class="muted small">${esc(t.desc(target))}</div>
    <div class="lbar"><div style="width:${t.progress * 100}%;background:${t.maxed ? color : "var(--slate)"}"></div></div>
    <div class="muted tiny">${t.maxed ? "Top tier reached" : `${t.current} of ${t.next}`}</div></div>`;
}
function trophiesHtml(P) {
  const not = P.trophies.filter((t) => !t.earned), got = P.trophies.filter((t) => t.earned);
  return `<h2 class="serif ph">Trophies</h2><p class="muted small">Each trophy has tiers. Keep going to reach the next one.</p>
    <h3 class="psub">Not earned yet (${not.length})</h3>${not.length ? `<div class="tgrid2">${not.map(trophyTile).join("")}</div>` : `<p class="muted small">You've started every trophy. Nice.</p>`}
    <h3 class="psub">Earned (${got.length})</h3>${got.length ? `<div class="tgrid2">${got.map(trophyTile).join("")}</div>` : `<p class="muted small">Nothing earned yet. Start with a swipe.</p>`}`;
}

export function profileHtml(P) {
  const tabs = SUBS.map((s) => `<button class="tile${P.sub === s.id ? " on" : ""}" data-prof="sub:${s.id}" aria-pressed="${P.sub === s.id}">${icon(PATHS[s.icon])}<span>${s.label}</span></button>`).join("");
  let body;
  if (P.error) body = `<div class="err">${esc(P.error)}</div><button class="btn outline" data-prof="retry">Try again</button>`;
  else if (!P.loaded) body = `<p class="muted">Loading your profile…</p>`;
  else body = { overview: overviewHtml, palate: palateHtml, knowledge: knowledgeHtml, explored: exploredHtml, trophies: trophiesHtml }[P.sub](P);
  return `<div class="profile"><div class="ptabs">${tabs}</div><div id="pbody">${body}</div></div>`;
}

// ---------------------------------------------------------------- controller
const must = ({ data, error }) => { if (error) throw error; return data; };
// Reads every row, 1000 at a time (Supabase returns at most 1000 rows per request).
async function allRows(makeQuery) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const rows = must(await makeQuery().range(from, from + 999));
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

// ctx: { sb(), journal(), states(), cards() }. The app refreshes the journal and swipes before mount.
export function createProfile(ctx) {
  const P = { sub: "overview", loaded: false, error: null, journal: [], states: [], questions: [], trophies: [], palate: [], entries: [] };
  let root = null, loadId = 0;
  const draw = () => { if (root) root.innerHTML = profileHtml(P); };

  async function load() {
    const my = ++loadId;
    P.error = null; draw();
    try {
      const sb = ctx.sb();
      const [questions, answers, runs, flags, perceptions, vintages, reference, defaults] = await Promise.all([
        sb.from("quiz_questions").select("id, topic, difficulty").then(must),
        allRows(() => sb.from("quiz_answers").select("question_id, result, created_at").order("created_at", { ascending: true })),
        allRows(() => sb.from("timed_runs").select("seconds, answered, correct, skipped, best_streak, created_at").order("created_at", { ascending: true })),
        sb.from("content_flags").select("id", { count: "exact", head: true }).then((r) => { if (r.error) throw r.error; return r.count || 0; }),
        allRows(() => sb.from("perceptions").select("consumption_id, dimension_key, value, adjusted")),
        allRows(() => sb.from("wine_vintages").select("id, wine_id")),
        sb.from("wine_reference_values").select("wine_id, wine_vintage_id, dimension_key, value").then(must),
        sb.from("wine_default_values").select("wine_id, dimension_key, value").then(must),
      ]);
      if (my !== loadId) return;
      P.journal = ctx.journal(); P.states = ctx.states();
      P.questions = questions;
      const questionsById = new Map(questions.map((q) => [q.id, q]));
      const baselineFor = baselines({ vintageToWine: new Map(vintages.map((v) => [v.id, v.wine_id])), reference, defaults });
      P.entries = palateEntries(P.journal, perceptions, baselineFor);
      P.palate = computePalate(P.entries);
      P.quiz = quizProgress(questions, answers);
      P.timed = timedStats(runs);
      P.explored = exploredStats(P.journal, P.states, ctx.cards());
      P.trophies = computeTrophies({ journal: P.journal, states: P.states, answers, questionsById, runs, flagCount: flags, perceptionRows: perceptions });
      P.loaded = true;
    } catch (e) {
      if (my !== loadId) return;
      P.error = "Could not load your profile: " + (e.message || e);
    }
    draw();
  }

  document.addEventListener("click", (ev) => {
    const t = ev.target.closest("[data-prof]");
    if (!t || !root) return;
    const [action, arg] = t.dataset.prof.split(":");
    if (action === "sub") { P.sub = arg; draw(); const c = document.querySelector("#content"); if (c) c.scrollTop = 0; }
    else if (action === "retry") load();
  });

  return {
    state: P,
    // Opens on Overview every time, with fresh numbers.
    mount(el) { root = el; P.sub = "overview"; P.loaded = false; P.userId = ctx.userId ? ctx.userId() : null; P.user = ctx.user ? ctx.user() : null; draw(); load(); },
    leave() { root = null; loadId++; },
  };
}

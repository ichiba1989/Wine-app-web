// TECHSHEET: the screens and the controller for the Tech sheet. Loaded on first use (app.js loadTechModule), only when access().techsheet is on.
// Part of one removable feature, see docs/TECHSHEET_REMOVAL.md. The rules are in techsheet.js (pure); the database calls are in data.js (marked TECHSHEET).
//   Player: pick the facts you want -> see which are confirmed (with where each came from) -> make a full printable page.
//   Staff (Editor tab, Facts): approved sites, the finds waiting for a decision, and typing a fact in with its source.
// A fact is shown as fact only when it is confirmed (techsheet.js confirmRule, or an Editor entered it with its source, or the player entered it themselves).
import { esc, wineName } from "./logic.js?v=14";
import { missingFields } from "./catalog.js?v=3";
import * as db from "./data.js?v=31";
import * as T from "./techsheet.js?v=1";

const KEY = "wine.techfields";   // the player's ticked fields, kept on this phone
const safeHref = (u) => (/^https?:\/\//i.test(String(u || "")) ? String(u) : "");
const link = (url, text) => (safeHref(url) ? `<a href="${esc(safeHref(url))}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>` : esc(text));
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} },
};
const RULE_CHIP = { producer_source: "Producer", two_sources: "2 sources", editor_entered: "Editor checked", player_entered: "Entered by you" };

// ---------------------------------------------------------------- the player's sheet
function pickHtml(S) {
  const m = S.model;
  const group = (g) => {
    const rows = T.fieldsOf(g.id);
    const all = rows.every((f) => S.choices.includes(f.id));
    return `<div class="tsgroup"><div class="tshead"><div class="serif">${esc(g.title)}</div><button class="link small" data-action="tech:group:${g.id}">${all ? "Clear" : "Select all"}</button></div>
      ${rows.map((f) => {
        const on = S.choices.includes(f.id), r = on ? m.sections.flatMap((s) => s.rows).find((x) => x.id === f.id) : null;
        const status = !on ? "" : r && r.status === "confirmed"
          ? `<div class="tsval"><b>${esc(r.value)}</b> <span class="gbadge ok">${esc(RULE_CHIP[r.rule] || "Confirmed")}</span> ${r.sources.map((x) => (x.domain ? `<span class="tssrc">${link(x.url, x.domain)}</span>` : "")).join(" ")}</div>`
          : `<div class="tsval muted small">Not confirmed yet</div>${S.private ? `<div class="two tsmine"><input class="field" data-tech-mine="${f.id}" placeholder="${f.unit ? esc(f.unit) : "Value"} (from the bottle)" aria-label="${esc(f.label)}"><button class="opill" data-action="tech:mine:${f.id}">Add</button></div>` : ""}`;
        const rm = on && r && r.status === "confirmed" && r.rule === "player_entered" ? ` <button class="link small" data-action="tech:unmine:${f.id}">Remove</button>` : "";
        return `<div class="tsrow"><button class="tscheck${on ? " on" : ""}" role="checkbox" aria-checked="${on}" data-action="tech:toggle:${f.id}">${on ? "&#10003;" : ""}</button><div class="tsmain"><div>${esc(f.label)}${rm}</div>${status}</div></div>`;
      }).join("")}</div>`;
  };
  const pending = m.unconfirmed.length ? `<details class="tspending"><summary>Found but not confirmed (${m.unconfirmed.length})</summary><p class="muted small">These are not on the sheet. A fact is only confirmed when the producer's own site, or two approved sites, give it.</p>${m.unconfirmed.map((u) => `<div class="small">${esc(u.label)}: ${esc(u.value)} &middot; ${link(u.url, u.domain || "source")}</div>`).join("")}</details>` : "";
  return `${S.error ? `<div class="err">${esc(S.error)}</div>` : ""}${S.msg ? `<div class="okmsg" role="status">${esc(S.msg)}</div>` : ""}
    <p class="muted small">Tick what you want on your sheet. Only confirmed facts are printed, each with where it came from.${S.private ? " This is your own wine: you can add what is on the bottle." : ""}</p>
    ${T.GROUPS.map(group).join("")}${pending}
    <button class="btn primary" data-action="tech:make"${m.confirmedCount ? "" : " disabled"}>Make the full page${m.confirmedCount ? ` (${m.confirmedCount} confirmed)` : ""}</button>
    ${m.confirmedCount ? "" : `<div class="muted small">Nothing is confirmed for this wine yet.</div>`}`;
}
function pageHtml(S) {
  const m = S.model;
  const srcs = [];
  m.sections.forEach((s) => s.rows.forEach((r) => r.sources.forEach((x) => { if (x.domain && !srcs.some((y) => y.url === x.url)) srcs.push(x); })));
  return `<article class="techpage"><h1 class="serif">${esc(S.name)}</h1><div class="muted small">Tech sheet &middot; ${esc(new Date().toISOString().slice(0, 10))}</div>
    <dl class="tsid">${m.identity.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
    ${m.sections.map((s) => `<section><h2 class="serif">${esc(s.title)}</h2><table class="tstable">${s.rows.map((r) => `<tr><th>${esc(r.label)}</th><td>${r.status === "confirmed" ? `<b>${esc(r.value)}</b> <span class="muted small">${esc(RULE_CHIP[r.rule] || "")}</span>` : `<span class="muted">not confirmed yet</span>`}</td></tr>`).join("")}</table></section>`).join("")}
    ${srcs.length ? `<section><h2 class="serif">Sources</h2><ol class="tssources">${srcs.map((x) => `<li>${link(x.url, x.url || x.domain)}${x.fetched_at ? ` <span class="muted small">(${esc(String(x.fetched_at).slice(0, 10))})</span>` : ""}</li>`).join("")}</ol></section>` : ""}
    <p class="muted small tsfoot">Confirmed from the producer's own site, from approved sources, or entered by the person named. This is not a tasting opinion.</p></article>
    <div class="tsbtns noprint"><button class="btn outline" data-action="tech:back">Back</button><button class="btn primary" data-action="tech:print">Print or save as PDF</button><button class="btn outline" data-action="tech:copy">Copy as text</button></div>`;
}
function shellHtml(S, body) {
  return `<div class="overlay techov"><div class="sheet techsheet" id="techPanel" role="dialog" aria-label="Tech sheet">
    <div class="sheethead noprint"><div class="sheettitle"><div class="serif big">Tech sheet</div><div class="muted small">${esc(S.name || "")}</div></div><div class="sheetbtns"><button class="xbtn" data-action="tech:close" aria-label="Close">&times;</button></div></div>${body}</div></div>`;
}

// ---------------------------------------------------------------- the controller
export function createTechSheet(ctx) {
  let S = null, root = null;
  const el = () => document.getElementById("techOverlay");
  const rebuild = () => {
    S.model = T.sheetModel({ identity: S.identity, facts: S.facts, choices: S.choices, unconfirmed: S.unconfirmed });
  };
  const draw = () => {
    const o = el(); if (!o) return;
    if (!S) { o.innerHTML = ""; return; }
    if (S.loading) { o.innerHTML = shellHtml(S, `<div class="center muted">Loading…</div>`); return; }
    if (S.blocked) { o.innerHTML = shellHtml(S, `<p>${esc(S.blocked)}</p>`); return; }
    o.innerHTML = shellHtml(S, S.page === "page" ? pageHtml(S) : pickHtml(S));
  };
  // subject: { wineVintageId } for a catalog wine, or { userWineId } for a wine the player typed in.
  async function open(subject) {
    S = { loading: true, page: "pick", choices: T.parseChoices(store.get(KEY)), facts: [], unconfirmed: [], model: null, identity: {}, name: "", private: !!subject.userWineId, subject, error: "", msg: "" };
    draw();
    try {
      if (subject.userWineId) {
        const w = await db.loadUserWine(ctx.sb(), subject.userWineId);
        S.identity = { producer: w.producer, wine_name: w.wine_name, vintage_year: w.vintage_year, is_non_vintage: w.is_non_vintage, style: w.style, grape_text: w.grape_text, region_text: w.region_text };
        S.name = [w.vintage_year, w.producer, w.wine_name].filter(Boolean).join(" ") || "Your wine";
        const miss = missingFields(w);
        if (miss.length) { S.blocked = `Add ${miss.join(", ")} to this wine first (tap the pencil on its journal entry), so a sheet can be matched to the right wine.`; S.loading = false; draw(); return; }
        const r = await db.loadMyWineFacts(ctx.sb(), subject.userWineId); S.facts = r.facts; S.unconfirmed = r.unconfirmed;
      } else {
        const card = ctx.cardById(subject.wineVintageId);
        if (!card) throw new Error("That wine is not in the list on this phone.");
        S.identity = card; S.name = wineName(card); S.producerKey = T.producerKey(card.producer);
        const r = await db.loadWineFacts(ctx.sb(), card.id, S.producerKey); S.facts = r.facts; S.unconfirmed = r.unconfirmed;
      }
    } catch (e) { S.error = String(e.message || e); }
    S.loading = false; rebuild(); draw();
  }
  const close = () => { S = null; draw(); };
  async function reloadMine() { const r = await db.loadMyWineFacts(ctx.sb(), S.subject.userWineId); S.facts = r.facts; S.unconfirmed = r.unconfirmed; rebuild(); }
  async function act(p) {   // p = the data-action split on ":" -> ["tech", verb, a, b]
    const [, verb, a] = p;
    if (verb === "close") return close();
    if (!S) return;
    S.error = ""; S.msg = "";
    try {
      if (verb === "toggle") { S.choices = T.toggleChoice(S.choices, a); store.set(KEY, JSON.stringify(S.choices)); rebuild(); }
      else if (verb === "group") { S.choices = T.toggleGroup(S.choices, a); store.set(KEY, JSON.stringify(S.choices)); rebuild(); }
      else if (verb === "make") { S.page = "page"; }
      else if (verb === "back") { S.page = "pick"; }
      else if (verb === "print") { window.print(); return; }
      else if (verb === "copy") {
        const txt = T.sheetText(S.model, S.name);
        try { await navigator.clipboard.writeText(txt); S.msg = "Copied."; } catch (_) { S.error = "Could not copy on this phone. Use Print or save as PDF instead."; }
      } else if (verb === "mine" && S.private) {
        const input = document.querySelector(`[data-tech-mine="${a}"]`), r = T.normaliseValue(a, input && input.value);
        if (!r.ok) S.error = r.why; else { await db.saveMyWineFact(ctx.sb(), ctx.userId(), S.subject.userWineId, a, r.value); await reloadMine(); S.msg = "Added."; }
      } else if (verb === "unmine" && S.private) { await db.removeMyWineFact(ctx.sb(), S.subject.userWineId, a); await reloadMine(); }
    } catch (e) { S.error = String(e.message || e); }
    draw();
  }
  return { open, close, act, isOpen: () => !!S };
}

// ---------------------------------------------------------------- staff: the Editor tab's Facts section
export function createFactsStaff(ctx) {
  const F = { tab: "sources", sources: null, queue: null, msg: "", error: "", loading: false, pick: null, matches: [] };
  let host = null;
  const tabs = [["sources", "Sources"], ["queue", "Waiting"], ["enter", "Enter a fact"]];
  const html = () => {
    const bar = `<div class="chips left">${tabs.map(([id, l]) => `<button class="chip wide${F.tab === id ? " on" : ""}" data-action="tech:fs:tab:${id}">${esc(l)}${id === "queue" && F.queue ? ` (${F.queue.length})` : ""}</button>`).join("")}</div>`;
    const note = `<div class="muted small">A fact is confirmed when a producer's own site gives it, or when two different approved sites give the same value. You decide which sites count here. ${F.error ? `<span class="err">${esc(F.error)}</span>` : ""}${F.msg ? `<span class="okmsg">${esc(F.msg)}</span>` : ""}</div>`;
    if (F.loading) return bar + `<div class="center muted">Loading…</div>`;
    if (F.tab === "sources") {
      const rows = (F.sources || []).map((s) => `<tr><td><b>${esc(s.domain)}</b></td><td>${s.kind === "producer" ? "Official site of " + esc(s.producer_key) : "Approved source"}</td><td><button class="opill" data-action="tech:fs:rmsource:${esc(s.id)}">Remove</button></td></tr>`).join("");
      return `${bar}${note}<div class="two"><input class="field" data-fs="domain" placeholder="Site, e.g. domaine-example.fr" autocomplete="off"><select class="field" data-fs="kind"><option value="approved">Approved source</option><option value="producer">Producer's official site</option></select></div>
        <input class="field" data-fs="producer" placeholder="For an official site: the producer's name as in the catalog" autocomplete="off"><button class="btn outline" data-action="tech:fs:addsource">Add site</button>
        <div class="otablewrap"><table class="otable"><thead><tr><th>Site</th><th>Counts as</th><th></th></tr></thead><tbody>${rows || `<tr><td colspan="3" class="muted">No sites yet.</td></tr>`}</tbody></table></div>`;
    }
    if (F.tab === "queue") {
      const rows = (F.queue || []).map((c) => `<tr><td>${esc((T.fieldById(c.fact_key) || {}).label || c.fact_key)}<br><span class="muted small">${esc(c.subject_type === "producer" ? c.subject_key : (ctx.cardName(c.subject_key) || c.subject_key))}</span></td><td><b>${esc(T.displayValue(c.fact_key, c.value))}</b><br><span class="small">&ldquo;${esc(c.quote)}&rdquo;</span><br>${link(c.source_url, c.domain)}</td><td><button class="opill" data-action="tech:fs:approve:${esc(c.id)}">Approve</button> <button class="opill" data-action="tech:fs:reject:${esc(c.id)}">Reject</button></td></tr>`).join("");
      return `${bar}${note}<div class="otablewrap"><table class="otable"><thead><tr><th>Fact</th><th>Found</th><th></th></tr></thead><tbody>${rows || `<tr><td colspan="3" class="muted">Nothing is waiting.</td></tr>`}</tbody></table></div>`;
    }
    const picked = F.pick ? `<div class="winecard"><b>${esc(F.pick.name)}</b><div class="muted small">${esc(F.pick.sub)}</div></div>` : "";
    const fieldOpts = T.TECH_FIELDS.map((f) => `<option value="${f.id}">${esc(f.label)} (${f.level === "producer" ? "about the producer" : "about this vintage"})</option>`).join("");
    return `${bar}${note}<div class="two"><input class="field" data-fs="q" placeholder="Find the wine" autocomplete="off"><button class="opill" data-action="tech:fs:find">Find</button></div>
      ${F.matches.map((c) => `<button class="jrow" data-action="tech:fs:pick:${esc(c.id)}"><span class="jl"><span class="serif trunc">${esc(wineName(c))}</span></span></button>`).join("")}${picked}
      <select class="field" data-fs="field">${fieldOpts}</select><input class="field" data-fs="value" placeholder="Value, as the page gives it (e.g. 13.5% vol)" autocomplete="off">
      <input class="field" data-fs="url" placeholder="Address of the page" autocomplete="off"><textarea class="field" data-fs="quote" rows="2" placeholder="Copy the exact words from the page that contain the value"></textarea>
      <button class="btn primary" data-action="tech:fs:save"${F.pick ? "" : " disabled"}>Save as confirmed</button>`;
  };
  const draw = () => { if (host) host.innerHTML = html(); };
  const v = (k) => (document.querySelector(`[data-fs="${k}"]`) || {}).value || "";
  async function load(tab) {
    F.loading = true; F.error = ""; draw();
    try { if (tab === "sources") F.sources = await db.loadFactSources(ctx.sb()); if (tab === "queue" || !F.queue) F.queue = await db.loadFactQueue(ctx.sb()); } catch (e) { F.error = String(e.message || e); }
    F.loading = false; draw();
  }
  return {
    mount(el) { host = el; F.msg = ""; draw(); load(F.tab); },
    async act(p) {
      const [, , verb, a, b] = p;   // ["tech","fs",verb,a,b]
      F.error = ""; F.msg = "";
      try {
        if (verb === "tab") { F.tab = a; draw(); return load(a); }
        if (verb === "addsource") {
          const domain = T.domainOf(v("domain")), kind = v("kind"), producer = T.producerKey(v("producer"));
          if (!domain) { F.error = "Write the site as a plain address."; return draw(); }
          if (kind === "producer" && !producer) { F.error = "Give the producer this site belongs to."; return draw(); }
          await db.addFactSource(ctx.sb(), domain, kind, kind === "producer" ? producer : null, null); F.msg = "Added."; return load("sources");
        }
        if (verb === "rmsource") { await db.removeFactSource(ctx.sb(), a); F.msg = "Removed."; return load("sources"); }
        if (verb === "approve" || verb === "reject") { await db.decideCandidate(ctx.sb(), a, verb === "approve"); F.msg = verb === "approve" ? "Approved." : "Rejected."; F.queue = null; return load("queue"); }
        if (verb === "find") { const q = v("q").toLowerCase().trim(); F.matches = q ? ctx.cards().filter((c) => wineName(c).toLowerCase().includes(q)).slice(0, 8) : []; return draw(); }
        if (verb === "pick") { const c = ctx.cardById(a); F.pick = c ? { id: c.id, name: wineName(c), sub: [c.vintage, c.style, c.country].filter(Boolean).join(" · "), producer: c.producer } : null; F.matches = []; return draw(); }
        if (verb === "save") {
          if (!F.pick) return;
          const field = T.fieldById(v("field")), r = T.normaliseValue(field.id, v("value")), site = T.domainOf(v("url")), quote = v("quote").trim();
          if (!r.ok) { F.error = r.why; return draw(); }
          if (!site) { F.error = "Give the address of the page."; return draw(); }
          if (quote.length < 6) { F.error = "Copy the exact words from the page."; return draw(); }
          const producerKey = T.producerKey(F.pick.producer);
          await db.enterFact(ctx.sb(), { subjectType: field.level, subjectKey: field.level === "producer" ? producerKey : F.pick.id, producerKey, factKey: field.id, value: r.value, url: v("url").trim(), quote });
          F.msg = `Saved: ${field.label} ${T.displayValue(field.id, r.value)}.`; return draw();
        }
      } catch (e) { F.error = String(e.message || e); draw(); }
    },
  };
}

// ---------------------------------------------------------------- the Owner page's Facts tab
const LEVELS = [["0", "Off", "Hidden from everyone"], ["1", "Staff only", "Editors and the Owner"], ["2", "Everyone", "All players"]];
export function ownerFactsHtml(info) {
  const lv = (LEVELS[info.level] || LEVELS[0])[2];
  const btn = ([n, label]) => `<button class="gopt${Number(n) === info.level ? " on" : ""}" data-action="owner:techlevel:${n}" aria-pressed="${Number(n) === info.level}">${esc(label)}</button>`;
  return `<div class="muted small onote">The Tech sheet shows researched, sourced facts for each wine. <b>Who sees it:</b> ${esc(lv)}. Off hides it at once and keeps all the data. To remove it completely see <code>docs/TECHSHEET_REMOVAL.md</code>.</div>
    <div class="gopts" role="group" aria-label="Who sees the Tech sheet">${LEVELS.map(btn).join("")}</div>
    ${info.error ? `<p class="err">${esc(info.error)}</p>` : info.counts ? `<p>${info.counts.facts} confirmed ${info.counts.facts === 1 ? "fact" : "facts"}, ${info.counts.waiting} waiting for an Editor.</p>` : `<p class="muted">Loading…</p>`}
    <p class="muted small">Researching wines automatically (a batch for the catalog, and "Look it up" for players) needs the research function, a search/AI service and its key. It is not switched on yet. Until then Editors enter facts by hand in the Editor tab, Facts.</p>`;
}

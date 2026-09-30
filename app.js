// The wine app for a phone browser. State, screens and events live here.
// Rules are in logic.js, database calls in data.js, and HTML in views.js.
// The first time, the page asks for your two Supabase values and remembers them in this browser.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  FAMILIARITY, esc, clamp01, shuffle, tapEdge, swipeKind, cardFromRow, filterEntries, groupEntries, swipeLists,
  sheetForCard, sheetForEntry, sheetForOutside, setDim, nudgeDim, resetDim, validateOutside, DIMS,
} from "./logic.js";
import * as db from "./data.js";
import { discoverHtml, swipesHtml, journalShellHtml, journalMetaHtml, journalListHtml, sheetHtml, addFormHtml } from "./views.js";
import { createLearn } from "./learn.js?v=1";
import { createProfile } from "./profile.js?v=1";

let SUPABASE_URL = "PASTE-YOUR-PROJECT-URL-HERE";
let SUPABASE_KEY = "PASTE-YOUR-PUBLISHABLE-KEY-HERE";

const $ = (s) => document.querySelector(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} },
};
if (SUPABASE_URL.startsWith("PASTE")) SUPABASE_URL = store.get("wine_url") || SUPABASE_URL;
if (SUPABASE_KEY.startsWith("PASTE")) SUPABASE_KEY = store.get("wine_key") || SUPABASE_KEY;
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

const state = {
  status: "loading",            // loading | setup | error | age | main
  error: null, banner: null, tab: "discover", underage: false,
  user: null, profile: null, sb: null,
  cards: [], deck: [], interest: "try", busy: false, counts: { swipes: 0, journal: 0 },
  states: [], journal: [],
  sw: { open: { rec: true }, sort: {} },
  j: { q: "", by: "verdict", verdict: "all", open: {}, limits: {} },
  sheet: null, sheetUi: { saving: false, error: "" },
  form: null,
};
const TITLES = { discover: "Discover", swipes: "Swipes", journal: "Journal", profile: "Profile", learn: "Learn" };

// The Learn tab lives in learn.js. It saves quiz answers itself and reports save problems through the banner.
const learn = createLearn({ sb: () => state.sb, user: () => state.user, profile: () => state.profile, onError: (m) => setBanner(m) });
// The Profile tab lives in profile.js. It reads the journal and swipes the app already loaded.
const profileTab = createProfile({ sb: () => state.sb, journal: () => state.journal, states: () => state.states, cards: () => state.cards });

// Counts for the Discover screen. Only swipes count as swipes (not later changes of interest).
async function loadCounts() {
  const [s, j] = await Promise.all([
    state.sb.from("encounters").select("id", { count: "exact", head: true }).eq("event", "swipe"),
    state.sb.from("consumptions").select("id", { count: "exact", head: true }),
  ]);
  if (s.error) throw s.error;
  if (j.error) throw j.error;
  return { swipes: s.count || 0, journal: j.count || 0 };
}

// ---------------------------------------------------------------- start up
async function init() {
  try {
    if (SUPABASE_URL.startsWith("PASTE") || SUPABASE_KEY.startsWith("PASTE")) { state.status = "setup"; return render(); }
    state.sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
    state.user = await db.ensureUser(state.sb);
    state.profile = await db.loadProfile(state.sb, state.user.id);
    if (state.profile.age_attested_at) await enterMain(); else { state.status = "age"; render(); }
  } catch (e) {
    state.status = "error"; state.error = e.message || String(e); render();
  }
}
async function refreshData() {
  const [states, journal, counts] = await Promise.all([db.loadStates(state.sb), db.loadJournal(state.sb), loadCounts()]);
  state.states = states; state.journal = journal; state.counts = counts;
}
async function enterMain() {
  state.cards = await db.loadCards(state.sb);
  await refreshData();
  const swiped = new Set(state.states.map((s) => s.wine_vintage_id));
  state.deck = shuffle(state.cards.filter((c) => !swiped.has(c.id)));
  state.status = "main"; render();
}

// ---------------------------------------------------------------- drawing the page
function setBanner(msg) {
  state.banner = msg;
  const el = $("#gbanner");
  if (el) { el.textContent = msg ? `${msg} (tap to dismiss)` : ""; el.hidden = !msg; }
}
function shellHtml() {
  const tab = (id, label) => `<button data-action="tab:${id}">${label}</button>`;
  return `<div class="top"><h1 class="serif" id="title"></h1><span class="muted small">Early build</span></div>
    <div id="gbanner" class="banner gb" data-action="dismiss" hidden></div>
    <div class="content" id="content"><div id="tabbody"></div></div>
    <nav class="tabs">${tab("discover", "Discover")}${tab("swipes", "Swipes")}${tab("journal", "Journal")}${tab("profile", "Profile")}${tab("learn", "Learn")}</nav>`;
}
function renderBody() {
  const body = $("#tabbody");
  if (!body) return;
  if (state.tab === "discover") {
    body.innerHTML = discoverHtml({ deck: state.deck, interest: state.interest, banner: null, counts: state.counts });
    const card = $("#card");
    if (card) attachCard(card);
  } else if (state.tab === "swipes") {
    body.innerHTML = swipesHtml(swipeLists(state.cards, state.states, state.journal), state.sw);
  } else if (state.tab === "learn") {
    learn.mount(body);
  } else if (state.tab === "profile") {
    profileTab.mount(body);
  } else {
    body.innerHTML = journalShellHtml(state.j);
    renderJournalList();
  }
}
// Typing in the search box only redraws the list, so the box keeps focus.
function renderJournalList() {
  const filtered = filterEntries(state.journal, { q: state.j.q, verdict: state.j.verdict });
  const groups = groupEntries(filtered, state.j.by);
  const meta = $("#jmeta"), list = $("#jlist");
  if (meta) meta.innerHTML = journalMetaHtml(state.journal, filtered, state.j, groups);
  if (list) list.innerHTML = journalListHtml(state.journal, state.j);
}
function render() {
  const app = $("#app");
  if (state.status === "main") {
    if (!$("#tabbody")) app.innerHTML = shellHtml();
    $("#title").textContent = TITLES[state.tab];
    document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.action === "tab:" + state.tab));
    setBanner(state.banner);
    return renderBody();
  }
  let html = "";
  if (state.status === "loading") html = `<div class="center muted">Loading…</div>`;
  else if (state.status === "setup") html = `<div class="center"><div class="serif" style="font-size:24px">Connect to your database</div>
      <div class="muted small">In Supabase, open Project Settings, then API. Copy the project URL and the publishable key (it starts with sb_publishable_) and paste them here. This browser remembers them.</div>
      <input id="cfgUrl" class="field" placeholder="Project URL (https://...supabase.co)" autocapitalize="off" autocomplete="off" spellcheck="false">
      <input id="cfgKey" class="field" placeholder="Publishable key (sb_publishable_...)" autocapitalize="off" autocomplete="off" spellcheck="false">
      ${state.banner ? `<div class="err">${esc(state.banner)}</div>` : ""}
      <button class="btn primary" data-action="savecfg">Save and start</button></div>`;
  else if (state.status === "error") html = `<div class="center"><div class="err">${esc(state.error)}</div>
      <div class="muted small">Check the two values you entered, that the database setup finished, and that anonymous sign-ins are switched on in Supabase.</div>
      <button class="btn outline" data-action="retry">Try again</button></div>`;
  else if (state.status === "age") html = `<div class="center"><div class="serif" style="font-size:32px;line-height:1.1">A game that learns your palate while teaching you about wine.</div>
      ${state.underage ? `<div class="muted">This app is for people 21 and older in the US. Come back when you're 21.</div>`
        : `<div class="muted">Are you 21 or older?</div><button class="btn primary" data-action="attest">I'm 21 or older</button><button class="btn outline" data-action="under">I'm under 21</button>`}
      ${state.banner ? `<div class="err">${esc(state.banner)}</div>` : ""}</div>`;
  app.innerHTML = html;
}

// ---------------------------------------------------------------- swiping (Discover)
async function fly(el, kind) {
  if (state.busy || !state.deck.length) return;
  state.busy = true;
  const card = state.deck[0];
  const W = window.innerWidth, H = window.innerHeight;
  const to = kind === "recognize" ? [W * 1.3, 0] : kind === "unknown" ? [-W * 1.3, 0] : [0, -H];
  if (el) { el.style.transition = "transform 220ms ease-in"; el.style.transform = `translate(${to[0]}px, ${to[1]}px) rotate(${to[0] / 20}deg)`; }
  await sleep(el ? 230 : 0);
  try {
    await db.recordSwipe(state.sb, card.id, kind, state.interest);
    state.deck.shift();
    state.interest = "try";
    setBanner(null);
    state.counts = await loadCounts();
  } catch (e) {
    setBanner("Could not save that swipe: " + (e.message || e));
  }
  state.busy = false;
  if (state.tab === "discover") renderBody();
}

function attachCard(el) {
  // Forgiving double-tap: fingers may wobble a little, and the second tap can be slower or a bit off.
  const TAP_MOVE = 18, DOUBLE_TAP_MS = 500, TAP_APART = 70;
  let start = null, dx = 0, dy = 0, lastTap = null, hintTimer = null;
  const label = (k) => el.querySelector(`[data-label="${k}"]`);
  const clearHint = () => { clearTimeout(hintTimer); ["recognize", "unknown", "had"].forEach((k) => { label(k).style.opacity = 0; }); };
  const showHint = (edge) => { clearHint(); if (edge) { label(edge).style.opacity = 0.55; hintTimer = setTimeout(clearHint, DOUBLE_TAP_MS + 50); } };
  const paint = () => {
    label("recognize").style.opacity = clamp01((dx - 40) / 80);
    label("unknown").style.opacity = clamp01((-dx - 40) / 80);
    label("had").style.opacity = clamp01((-dy - 40) / 80);
  };
  const settle = () => { el.style.transition = "transform 200ms ease-out"; el.style.transform = ""; dx = dy = 0; paint(); };
  el.addEventListener("pointerdown", (e) => {
    if (state.busy) return;
    start = { x: e.clientX, y: e.clientY }; dx = dy = 0;
    try { el.setPointerCapture(e.pointerId); } catch (_) {}
    el.style.transition = "none";
  });
  el.addEventListener("pointermove", (e) => {
    if (!start) return;
    dx = e.clientX - start.x; dy = e.clientY - start.y;
    el.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx / 20}deg)`;
    paint();
  });
  el.addEventListener("pointerup", (e) => {
    if (!start) return;
    const from = start; start = null;
    const kind = swipeKind(dx, dy);
    if (kind) { fly(el, kind); return; }
    settle();
    if (Math.hypot(e.clientX - from.x, e.clientY - from.y) < TAP_MOVE) {      // a tap that barely moved
      const now = Date.now();
      const r = el.getBoundingClientRect();
      const edge = tapEdge((from.x - r.left) / r.width, (from.y - r.top) / r.height);
      const prev = lastTap;
      if (prev && now - prev.t < DOUBLE_TAP_MS && Math.hypot(from.x - prev.x, from.y - prev.y) < TAP_APART) {
        lastTap = null; clearHint();                                             // second tap: a double-tap
        const kind2 = edge || prev.edge;                                         // if the second tap drifted inward, use the first tap's edge
        if (kind2) { label(kind2).style.opacity = 1; fly(el, kind2); }
      } else { lastTap = { t: now, x: from.x, y: from.y, edge }; showHint(edge); }
    }
  });
  el.addEventListener("pointercancel", () => { start = null; settle(); });
}

// ---------------------------------------------------------------- the rating sheet
function openSheet() {
  state.sheetUi = { saving: false, error: "" };
  $("#overlay").innerHTML = sheetHtml(state.sheet, state.sheetUi);
}
function closeOverlay() { state.sheet = null; state.form = null; $("#overlay").innerHTML = ""; }
// Updates the parts of the open sheet that change, without redrawing it (so typing and scrolling are not disturbed).
function syncSheet() {
  const s = state.sheet;
  if (!s) return;
  document.querySelectorAll("[data-sheet^='verdict:']").forEach((b) => b.classList.toggle("on", b.dataset.sheet === "verdict:" + s.verdict));
  DIMS.forEach((d) => {
    const r = document.querySelector(`[data-dim="${d.key}"]`);
    if (r && Number(r.value) !== s.dims[d.key].value) r.value = s.dims[d.key].value;
    const rs = document.getElementById("reset-" + d.key);
    if (rs) rs.style.visibility = s.dims[d.key].adjusted ? "visible" : "hidden";
  });
  document.querySelectorAll("[data-sheet='save']").forEach((b) => { b.disabled = !s.verdict || state.sheetUi.saving; });
  const err = $("#sheetErr");
  if (err) err.textContent = state.sheetUi.error || "";
}
async function openEntry(entry) {
  const rows = await db.loadPerceptions(state.sb, entry.id);
  state.sheet = sheetForEntry(entry, rows, today());
  openSheet();
}
async function saveSheet() {
  const s = state.sheet;
  if (!s || !s.verdict || state.sheetUi.saving) return;
  state.sheetUi = { saving: true, error: "" };
  syncSheet();
  try {
    await db.saveReview(state.sb, state.user.id, s, today());
    await refreshData();
    closeOverlay();
    state.tab = "journal";
    render();
  } catch (e) {
    state.sheetUi = { saving: false, error: "Could not save: " + (e.message || e) };
    syncSheet();
  }
}

// ---------------------------------------------------------------- clicks and typing
document.addEventListener("click", async (ev) => {
  const sheetBtn = ev.target.closest("[data-sheet]");
  if (sheetBtn) {
    const [action, a, b] = sheetBtn.dataset.sheet.split(":");
    if (action === "verdict") { state.sheet.verdict = a; syncSheet(); }
    else if (action === "nudge") { state.sheet = nudgeDim(state.sheet, a, Number(b)); syncSheet(); }
    else if (action === "reset") { state.sheet = resetDim(state.sheet, a); syncSheet(); }
    else if (action === "save") await saveSheet();
    else if (action === "close") closeOverlay();
    return;
  }
  const t = ev.target.closest("[data-action]");
  if (!t) return;
  const [action, a, b] = t.dataset.action.split(":");
  try {
    if (action === "attest") { state.profile = await db.attestAge(state.sb, state.user.id); await enterMain(); }
    else if (action === "under") { state.underage = true; render(); }
    else if (action === "retry") { state.status = "loading"; render(); init(); }
    else if (action === "dismiss") setBanner(null);
    else if (action === "savecfg") {
      const u = ($("#cfgUrl").value || "").trim(), k = ($("#cfgKey").value || "").trim();
      if (!/^https:\/\/.+/.test(u) || !k) { state.banner = "Paste both values. The URL should start with https://"; render(); return; }
      SUPABASE_URL = u.replace(/\/+$/, ""); SUPABASE_KEY = k; store.set("wine_url", SUPABASE_URL); store.set("wine_key", SUPABASE_KEY);
      state.banner = null; state.status = "loading"; render(); init();
    }
    else if (action === "interest") { if (!state.busy) { state.interest = a; renderBody(); } }
    else if (action === "tab") {
      if (state.tab === "learn" && a !== "learn") learn.leave();
      if (state.tab === "profile" && a !== "profile") profileTab.leave();
      state.tab = a;
      if (a === "swipes" || a === "journal" || a === "profile") await refreshData();
      render();
    }
    else if (action === "toggle") { state.sw.open[a] = !state.sw.open[a]; renderBody(); }
    else if (action === "setint") {
      await db.changeInterest(state.sb, state.user.id, a, b);
      const s = state.states.find((x) => x.wine_vintage_id === a);
      if (s) s.interest = b;
      renderBody();
    }
    else if (action === "review") {
      const entry = state.journal.find((j) => j.wine_vintage_id === a);
      if (entry) await openEntry(entry);
      else { state.sheet = sheetForCard(state.cards.find((c) => c.id === a), today()); openSheet(); }
    }
    else if (action === "entry") { const entry = state.journal.find((j) => j.id === a); if (entry) await openEntry(entry); }
    else if (action === "jtoggle") {
      const key = decodeURIComponent(a);
      const open = state.j.by === "flat" || state.j.q.trim() !== "" || (key in state.j.open ? state.j.open[key] : state.journal.length <= 10);
      state.j.open[key] = !open; renderJournalList();
    }
    else if (action === "jexpand" || action === "jcollapse") {
      groupEntries(filterEntries(state.journal, { q: state.j.q, verdict: state.j.verdict }), state.j.by).forEach((g) => { state.j.open[g.key] = action === "jexpand"; });
      renderJournalList();
    }
    else if (action === "jmore") { const key = decodeURIComponent(a); state.j.limits[key] = (state.j.limits[key] || 20) + 20; renderJournalList(); }
    else if (action === "addwine") {
      state.form = { producer: "", wine_name: "", vintage: "", grape: "", region: "", style: "" };
      $("#overlay").innerHTML = addFormHtml(state.form);
    }
    else if (action === "closeform") closeOverlay();
    else if (action === "formstyle") { state.form.style = state.form.style === a ? "" : a; $("#overlay").innerHTML = addFormHtml(state.form); }
    else if (action === "addrate" || action === "addnorate") {
      const problem = validateOutside(state.form);
      if (problem) { $("#formErr").textContent = problem; return; }
      if (action === "addrate") { state.sheet = sheetForOutside(state.form, today()); state.form = null; openSheet(); }
      else {
        await db.addWithoutRating(state.sb, state.user.id, state.form, today());
        await refreshData(); closeOverlay(); state.tab = "journal"; render();
      }
    }
  } catch (err) {
    if (state.status === "main") setBanner(String(err.message || err));
    else { state.banner = String(err.message || err); render(); }
  }
});

document.addEventListener("input", (ev) => {
  const t = ev.target;
  if (t.dataset.dim) { state.sheet = setDim(state.sheet, t.dataset.dim, Number(t.value)); syncSheet(); }
  else if (t.dataset.field && state.sheet) state.sheet[t.dataset.field] = t.value;
  else if (t.dataset.form && state.form) state.form[t.dataset.form] = t.value;
  else if (t.dataset.jq !== undefined) { state.j.q = t.value; renderJournalList(); }
  else if (t.dataset.jby !== undefined) { state.j.by = t.value; renderJournalList(); }
  else if (t.dataset.jverdict !== undefined) { state.j.verdict = t.value; renderJournalList(); }
  else if (t.dataset.sort) { state.sw.sort[t.dataset.sort] = t.value; renderBody(); }
});

window.__wine = { state, fly, render, init, learn, profile: profileTab };
init();

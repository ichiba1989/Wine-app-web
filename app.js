// The wine app for a phone browser. State, screens and events live here.
// Rules are in logic.js, database calls in data.js, and HTML in views.js.
// The two Supabase values come from config.js. If that file is missing or still has placeholders, the page asks for them and remembers them in this browser.
import {
  FAMILIARITY, wineName, esc, clamp01, shuffle, tapEdge, swipeKind, cardFromRow, filterEntries, groupEntries, swipeLists,
  sheetForCard, sheetForEntry, sheetForOutside, setDim, nudgeDim, resetDim, validateOutside, DIMS,
  queuePhoto, unqueuePhoto, toggleExistingPhoto, refsByVintage, feedbackOn, WINE_FLAG_REASONS, dimMeta, isChoice,
} from "./logic.js?v=5";
import * as db from "./data.js?v=6";
import { shrinkImage } from "./photos.js?v=4";
import {
  discoverHtml, swipesHtml, journalShellHtml, journalMetaHtml, journalListHtml, sheetHtml, addFormHtml, photosHtml, formPhotosHtml, wineFlagHtml, confirmHtml, KEPT_NOTE, SWIPE_KEPT_NOTE,
} from "./views.js?v=6";
import { createLearn } from "./learn.js?v=1";
import { createProfile } from "./profile.js?v=5";
import { createAccount, readPendingMerge, clearPendingMerge, mergeMessage } from "./account.js?v=3";
import { createFeedback } from "./feedback.js?v=1";
import { createEditor } from "./editor.js?v=3";

// The database library is delivered over the internet. It is pinned to one exact version, and if the first source is down the same version
// is tried from a second, independent one. The last resort is the newest 2.x from the first source.
const APP_VERSION = "11";   // shown to editors with each piece of feedback
const SUPABASE_JS_VERSION = "2.109.0";
const LIBRARY_URLS = [
  `https://esm.sh/@supabase/supabase-js@${SUPABASE_JS_VERSION}`,
  `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@${SUPABASE_JS_VERSION}/+esm`,
  "https://esm.sh/@supabase/supabase-js@2",
];
async function loadSupabaseLibrary() {
  let last;
  for (const url of LIBRARY_URLS) {
    try { const m = await import(url); if (typeof m.createClient === "function") return m.createClient; last = new Error("loaded but looks wrong"); }
    catch (e) { last = e; }
  }
  throw new Error("The database library could not be loaded from any of its sources (" + ((last && last.message) || last) + "). Check your connection and try again.");
}
// Keeps only https://host from whatever was pasted, so extra text such as /rest/v1 or a final slash cannot break every request.
function cleanProjectUrl(raw) {
  let t = String(raw || "").trim();
  if (!t || t.includes("PASTE")) return "";
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) t = "https://" + t;
  try { const u = new URL(t); return u.protocol === "https:" && u.hostname.includes(".") ? u.origin : ""; } catch (_) { return ""; }
}
let SUPABASE_URL = "PASTE-YOUR-PROJECT-URL-HERE";
let SUPABASE_KEY = "PASTE-YOUR-PUBLISHABLE-KEY-HERE";

const $ = (s) => document.querySelector(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} },
};
if (SUPABASE_URL.startsWith("PASTE")) SUPABASE_URL = cleanProjectUrl(store.get("wine_url")) || SUPABASE_URL;
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
  photoUrls: new Map(),                 // signed links for the photos shown in Journal and Swipes
  refs: new Map(),                      // wine_vintage_id -> reference structure values set by editors
  feedback: false,                      // feedback switch (feature_access), on for everyone for now
  wf: null, wfDone: null,               // "report a problem with this wine"
  confirm: null,                        // the delete confirmation that is open, if any
};
const isEditor = () => !!state.profile && ["editor", "admin"].includes(state.profile.role);
const TITLES = { discover: "Discover", swipes: "Swipes", journal: "Journal", profile: "Profile", learn: "Learn", editor: "Editor" };

// The Learn tab lives in learn.js. It saves quiz answers itself and reports save problems through the banner.
const learn = createLearn({ sb: () => state.sb, user: () => state.user, profile: () => state.profile, onError: (m) => setBanner(m) });
// The Profile tab lives in profile.js. It reads the journal and swipes the app already loaded.
const profileTab = createProfile({ sb: () => state.sb, userId: () => state.user.id, user: () => state.user, journal: () => state.journal, states: () => state.states, cards: () => state.cards });
// Email accounts live in account.js: a guest can attach an email, or sign in to an account they already have.
// Signing in or out reloads the page so everything starts clean for the right person.
const account = createAccount({
  sb: () => state.sb, user: () => state.user,
  setUser: (u) => { state.user = u; },
  canSave: () => state.status === "main",
  prepareMerge: () => db.prepareGuestMerge(state.sb),
  deleteAccount: () => db.deleteMyAccount(state.sb),
  reload: () => location.replace(location.pathname + location.search),
  onClose: () => { if (state.status === "main") render(); },
});
// Feedback from testers lives in feedback.js. Editors read it in the Editor tab.
const feedback = createFeedback({ sb: () => state.sb, user: () => state.user, screen: () => state.tab, version: () => APP_VERSION });
// A gentle reminder for guests who have started building a journal, shown on Discover until they save it or say "not now".
const showNudge = () => !!state.user && state.user.is_anonymous === true && !store.get("wine.nudgeOff") && (state.journal.length >= 1 || state.states.length >= 5);
// The Editor tab (editors only) lives in editor.js.
const editorTab = createEditor({ sb: () => state.sb, userId: () => state.user.id, cards: () => state.cards, onSaved: () => loadReferences() });

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
    // config.js (created once in the site's folder) carries the connection details for everyone who opens the link.
    try {
      const cfg = await import("./config.js?v=1");
      const u = cleanProjectUrl(cfg.SUPABASE_URL), k = String(cfg.SUPABASE_KEY || "").trim();
      if (u && k && !k.includes("PASTE")) { SUPABASE_URL = u; SUPABASE_KEY = k; }
    } catch (_) { /* no config.js: use what this browser saved, or ask */ }
    if (SUPABASE_URL.startsWith("PASTE") || SUPABASE_KEY.startsWith("PASTE")) { state.status = "setup"; return render(); }
    // An emailed link brings the person back to this page with a sign-in (or an error) in the address. Read it, then tidy the address.
    const back = new URLSearchParams(location.hash.replace(/^#/, ""));
    const linkError = back.get("error_description");
    const createClient = await loadSupabaseLibrary();
    state.sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    state.user = await db.ensureUser(state.sb);
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
    if (linkError) state.banner = "That email link did not work: " + linkError.replace(/\+/g, " ") + " Ask for a new code.";
    const carried = await carryOverGuest();
    state.profile = await db.loadProfile(state.sb, state.user.id);
    if (state.profile.age_attested_at) await enterMain(); else { state.status = "age"; render(); }
    if (carried && carried.error) setBanner(carried.error);
    else if (carried) setBanner(carried, true);
  } catch (e) {
    state.status = "error"; state.error = e.message || String(e); render();
  }
}
async function refreshData() {
  const [states, journal, counts] = await Promise.all([db.loadStates(state.sb), db.loadJournal(state.sb), loadCounts()]);
  state.states = states; state.journal = journal; state.counts = counts;
  // A photo link that cannot be made only means that picture is not shown; it never blocks the app.
  try { state.photoUrls = await db.signedUrls(state.sb, journal.map((j) => j.first_photo_path)); } catch (_) { state.photoUrls = new Map(); }
}
async function loadReferences() {
  try {
    const [vintageToWine, rows] = await Promise.all([db.loadVintageWines(state.sb), db.loadReferenceRows(state.sb)]);
    state.refs = refsByVintage(vintageToWine, rows);
  } catch (_) { state.refs = new Map(); }
}
async function enterMain() {
  state.cards = await db.loadCards(state.sb);
  await Promise.all([refreshData(), loadReferences()]);
  try { state.feedback = feedbackOn(await db.loadFeature(state.sb, "contentFeedback"), (state.profile || {}).tier || "default"); } catch (_) { state.feedback = false; }
  const swiped = new Set(state.states.map((s) => s.wine_vintage_id));
  state.deck = shuffle(state.cards.filter((c) => !swiped.has(c.id)));
  state.status = "main"; render();
}

// ---------------------------------------------------------------- drawing the page
function setBanner(msg, good = false) {
  state.banner = msg; state.bannerGood = good;
  const el = $("#gbanner");
  if (el) { el.textContent = msg ? `${msg} (tap to dismiss)` : ""; el.hidden = !msg; el.classList.toggle("good", !!good); }
}
// After signing in to an account from a guest session, bring the guest's progress along.
// Runs before the profile loads, so the account's data (and age confirmation) are complete when the app opens.
async function carryOverGuest() {
  const pending = readPendingMerge(localStorage);
  if (!pending || state.user.is_anonymous) return null;   // still a guest: keep the code until sign-in finishes or it expires
  clearPendingMerge(localStorage);                          // a code is only ever tried once
  try { return mergeMessage(await db.claimGuestMerge(state.sb, pending.token)); }
  catch (e) { return { error: "Could not carry over what you did as a guest: " + (e.message || e) }; }
}
function shellHtml() {
  const tab = (id, label) => `<button data-action="tab:${id}">${label}</button>`;
  const editorLink = isEditor() ? tab("editor", "Editor") : "";
  return `<div class="top"><h1 class="serif" id="title"></h1><span class="muted small">Early build</span></div>
    <div id="gbanner" class="banner gb" data-action="dismiss" hidden></div>
    <div class="content" id="content"><div id="tabbody"></div></div>
    <nav class="tabs">${tab("discover", "Discover")}${tab("swipes", "Swipes")}${tab("journal", "Journal")}${tab("profile", "Profile")}${tab("learn", "Learn")}${editorLink}</nav>`;
}
function renderBody() {
  const body = $("#tabbody");
  if (!body) return;
  if (state.tab === "discover") {
    body.innerHTML = discoverHtml({ deck: state.deck, interest: state.interest, banner: null, counts: state.counts, feedback: state.feedback, flaggedId: state.wfDone, nudge: showNudge() });
    const card = $("#card");
    if (card) attachCard(card);
  } else if (state.tab === "swipes") {
    body.innerHTML = swipesHtml(swipeLists(state.cards, state.states, state.journal), state.sw, state.photoUrls);
  } else if (state.tab === "learn") {
    learn.mount(body);
  } else if (state.tab === "profile") {
    profileTab.mount(body);
  } else if (state.tab === "editor") {
    editorTab.mount(body);
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
  if (list) list.innerHTML = journalListHtml(state.journal, state.j, state.photoUrls);
}
function render() {
  const app = $("#app");
  if (state.status !== "loading") { window.__booted = true; const be = document.getElementById("bootError"); if (be) be.hidden = true; }   // tells index.html the app started
  if (state.status === "main") {
    if (!$("#tabbody")) app.innerHTML = shellHtml();
    $("#title").textContent = TITLES[state.tab];
    document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.action === "tab:" + state.tab));
    setBanner(state.banner, state.bannerGood);
    return renderBody();
  }
  let html = "";
  if (state.status === "loading") html = `<div class="center muted">Loading…</div>`;
  else if (state.status === "setup") html = `<div class="center"><div class="serif" style="font-size:24px">Connect to your database</div>
      <div class="muted small">In Supabase, open Project Settings, then API. Copy the project URL and the publishable key (it starts with sb_publishable_) and paste them here. This browser remembers them.</div>
      <div class="muted small">Testing someone else's app? Ask the person who sent you the link. This screen should not appear for you.</div>
      <input id="cfgUrl" class="field" placeholder="Project URL (https://...supabase.co)" autocapitalize="off" autocomplete="off" spellcheck="false">
      <input id="cfgKey" class="field" placeholder="Publishable key (sb_publishable_...)" autocapitalize="off" autocomplete="off" spellcheck="false">
      ${state.banner ? `<div class="err">${esc(state.banner)}</div>` : ""}
      <button class="btn primary" data-action="savecfg">Save and start</button></div>`;
  else if (state.status === "error") html = `<div class="center"><div class="err">${esc(state.error)}</div>
      <div class="muted small">Check the two values you entered, that the database setup finished, and that anonymous sign-ins are switched on in Supabase.</div>
      <button class="btn outline" data-action="retry">Try again</button></div>`;
  else if (state.status === "age") html = `<div class="center"><div class="serif" style="font-size:32px;line-height:1.1">A game that learns your palate while teaching you about wine.</div>
      ${state.underage ? `<div class="muted">This app is for people 21 and older in the US. Come back when you're 21.</div>`
        : `<div class="muted">Are you 21 or older?</div><button class="btn primary" data-action="attest">I'm 21 or older</button><button class="btn outline" data-action="under">I'm under 21</button><button class="link" data-account="open:signin">I already have an account</button>`}
      <div class="muted small"><a class="link" href="privacy.html" target="_blank" rel="noopener">Privacy policy</a></div>
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
  DIMS.filter((d) => s.dims[d.key]).forEach((d) => {
    const x = s.dims[d.key];
    if (isChoice(d)) {
      document.querySelectorAll(`[data-sheet^="choice:${d.key}:"]`).forEach((b) => {
        const on = Number(b.dataset.sheet.split(":")[2]) === x.value;
        b.classList.toggle("on", on); b.classList.toggle("def", on && !x.adjusted); b.setAttribute("aria-pressed", String(on));
      });
    } else {
      const r = document.querySelector(`[data-dim="${d.key}"]`);
      if (r && Number(r.value) !== x.value) r.value = x.value;
    }
    const rs = document.getElementById("reset-" + d.key);
    if (rs) rs.style.visibility = x.adjusted ? "visible" : "hidden";
  });
  document.querySelectorAll("[data-sheet='save']").forEach((b) => { b.disabled = !s.verdict || state.sheetUi.saving; });
  const err = $("#sheetErr");
  if (err) err.textContent = state.sheetUi.error || "";
}
async function openEntry(entry) {
  const [rows, photos] = await Promise.all([db.loadPerceptions(state.sb, entry.id), db.loadEntryPhotos(state.sb, entry.id).catch(() => [])]);
  state.sheet = sheetForEntry(entry, rows, today(), (entry.wine_vintage_id && state.refs.get(entry.wine_vintage_id)) || {}, photos);
  openSheet();
}
const showPhotos = () => { const el = $("#sheetPhotos"); if (el && state.sheet) el.innerHTML = photosHtml(state.sheet); };
const showFormPhotos = () => { const el = $("#formPhotos"); if (el && state.form) el.innerHTML = formPhotosHtml(state.form); };
// Shrinks each chosen picture, then hands it to `add`. A picture that cannot be read is skipped with a message.
async function takePictures(files, add, fail) {
  for (const f of files) {
    try { add(await shrinkImage(f)); } catch (e) { fail(e.message || String(e)); }
  }
}
async function saveSheet() {
  const s0 = state.sheet;
  if (!s0 || !s0.verdict || state.sheetUi.saving) return;
  state.sheetUi = { saving: true, error: "" };
  syncSheet();
  try {
    // 1. the rating itself. From here on the entry exists, so a retry updates it instead of adding a second one.
    const id = await db.saveReview(state.sb, state.user.id, s0, today());
    state.sheet.entryId = id;
    // 2. pictures: upload the new ones, delete the ones marked for removal
    const removed = state.sheet.photos.existing.filter((p) => p.removed);
    const failedUp = await db.uploadPhotos(state.sb, state.user.id, id, state.sheet.photos.queued);
    const failedDel = await db.deletePhotos(state.sb, removed);
    await refreshData();
    if (failedUp.length || failedDel.length) {
      const stillThere = new Set(failedDel.map((f) => f.photo.id));
      state.sheet.photos = {
        existing: state.sheet.photos.existing.filter((p) => !p.removed || stillThere.has(p.id)),
        queued: failedUp.map((f) => f.photo),
      };
      showPhotos();
      const first = (failedUp[0] || failedDel[0]).message;
      state.sheetUi = { saving: false, error: `Your rating is saved, but ${failedUp.length + failedDel.length} photo change(s) did not go through: ${first}. Tap Save to try again.` };
      syncSheet();
      return;
    }
    closeOverlay();
    state.tab = "journal";
    render();
  } catch (e) {
    state.sheetUi = { saving: false, error: "Could not save: " + (e.message || e) };
    syncSheet();
  }
}

// ---------------------------------------------------------------- deleting entries and swipes
function askConfirm(cfg) { state.confirm = { ...cfg, busy: false, error: "" }; $("#confirm").innerHTML = confirmHtml(state.confirm); }
function closeConfirm() { state.confirm = null; $("#confirm").innerHTML = ""; }
function askDeleteEntry() {
  const id = state.sheet && state.sheet.entryId;
  if (!id) return;
  askConfirm({
    title: "Delete this entry?",
    body: `It is removed from your journal, along with its photos and notes. ${esc(KEPT_NOTE)}`,
    run: async () => { await db.deleteJournalEntry(state.sb, id); closeOverlay(); await refreshData(); state.tab = "journal"; render(); },
  });
}
function askDeleteSwipe(wineId) {
  const card = state.cards.find((c) => c.id === wineId);
  if (!card) return;
  askConfirm({
    title: "Delete this swipe?",
    body: `${esc(wineName(card))} goes back into Discover. ${esc(SWIPE_KEPT_NOTE)}`,
    run: async () => {
      await db.deleteSwipe(state.sb, wineId);
      await refreshData();
      state.deck = [card, ...state.deck.filter((c) => c.id !== wineId)];   // it can be swiped again, and is shown next
      renderBody();
    },
  });
}
document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("[data-confirm]");
  if (!t || !state.confirm) return;
  if (t.dataset.confirm === "no") { closeConfirm(); return; }
  const c = state.confirm;
  if (c.busy) return;
  c.busy = true; c.error = ""; $("#confirm").innerHTML = confirmHtml(c);
  try { await c.run(); closeConfirm(); }
  catch (e) { c.busy = false; c.error = "Could not delete: " + (e.message || e); $("#confirm").innerHTML = confirmHtml(c); }
});

// ---------------------------------------------------------------- clicks and typing
document.addEventListener("click", async (ev) => {
  const sheetBtn = ev.target.closest("[data-sheet]");
  if (sheetBtn) {
    const [action, a, b] = sheetBtn.dataset.sheet.split(":");
    if (action === "verdict") { state.sheet.verdict = a; syncSheet(); }
    else if (action === "nudge") { state.sheet = nudgeDim(state.sheet, a, Number(b)); syncSheet(); }
    else if (action === "choice") { state.sheet = setDim(state.sheet, a, Number(b)); syncSheet(); }
    else if (action === "reset") { state.sheet = resetDim(state.sheet, a); syncSheet(); }
    else if (action === "delete") askDeleteEntry();
    else if (action === "save") await saveSheet();
    else if (action === "close") closeOverlay();
    else if (action === "togglephoto") { state.sheet = toggleExistingPhoto(state.sheet, a); showPhotos(); }
    else if (action === "unqueue") { state.sheet = unqueuePhoto(state.sheet, a); showPhotos(); }
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
    else if (action === "nudgeoff") { store.set("wine.nudgeOff", "1"); renderBody(); }
    else if (action === "savecfg") {
      const u = cleanProjectUrl($("#cfgUrl").value), k = ($("#cfgKey").value || "").trim();
      if (!u || !k) { state.banner = "Paste both values. The URL should look like https://yourproject.supabase.co"; render(); return; }
      SUPABASE_URL = u; SUPABASE_KEY = k; store.set("wine_url", SUPABASE_URL); store.set("wine_key", SUPABASE_KEY);
      state.banner = null; state.status = "loading"; render(); init();
    }
    else if (action === "interest") { if (!state.busy) { state.interest = a; renderBody(); } }
    else if (action === "tab") {
      if (state.tab === "learn" && a !== "learn") learn.leave();
      if (state.tab === "profile" && a !== "profile") profileTab.leave();
      if (state.tab === "editor" && a !== "editor") editorTab.leave();
      state.tab = a;
      if (a === "swipes" || a === "journal" || a === "profile") await refreshData();
      render();
    }
    else if (action === "toggle") { state.sw.open[a] = !state.sw.open[a]; renderBody(); }
    else if (action === "delswipe") askDeleteSwipe(a);
    else if (action === "setint") {
      await db.changeInterest(state.sb, state.user.id, a, b);
      const s = state.states.find((x) => x.wine_vintage_id === a);
      if (s) s.interest = b;
      renderBody();
    }
    else if (action === "review") {
      const entry = state.journal.find((j) => j.wine_vintage_id === a);
      if (entry) await openEntry(entry);
      else { state.sheet = sheetForCard(state.cards.find((c) => c.id === a), today(), state.refs.get(a) || {}); openSheet(); }
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
      state.form = { producer: "", wine_name: "", vintage: "", grape: "", region: "", style: "", photos: [] };
      $("#overlay").innerHTML = addFormHtml(state.form);
    }
    else if (action === "closeform") closeOverlay();
    else if (action === "wineflag") { state.wf = { wineId: state.deck[0].id, reason: null, note: "", sending: false, error: "" }; $("#overlay").innerHTML = wineFlagHtml(state.wf); }
    else if (action === "wfclose") { state.wf = null; $("#overlay").innerHTML = ""; }
    else if (action === "wfreason") { state.wf.reason = WINE_FLAG_REASONS[Number(a)]; $("#overlay").innerHTML = wineFlagHtml(state.wf); }
    else if (action === "wfsend") {
      const f = state.wf;
      if (!f || !f.reason || f.sending) return;
      f.sending = true; f.error = "";
      try {
        await db.flagWine(state.sb, state.user.id, f.wineId, f.reason, f.note.trim());
        state.wfDone = f.wineId; state.wf = null; $("#overlay").innerHTML = ""; renderBody();
      } catch (e) { f.sending = false; f.error = "Could not send: " + (e.message || e); $("#overlay").innerHTML = wineFlagHtml(f); }
    }
    else if (action === "formstyle") { state.form.style = state.form.style === a ? "" : a; $("#overlay").innerHTML = addFormHtml(state.form); }
    else if (action === "formunqueue") { state.form.photos = state.form.photos.filter((p) => p.key !== a); showFormPhotos(); }
    else if (action === "addrate" || action === "addnorate") {
      const problem = validateOutside(state.form);
      if (problem) { $("#formErr").textContent = problem; return; }
      if (action === "addrate") { state.sheet = sheetForOutside(state.form, today()); state.form = null; openSheet(); }
      else {
        const photos = state.form.photos || [];
        const id = await db.addWithoutRating(state.sb, state.user.id, state.form, today());
        const failed = await db.uploadPhotos(state.sb, state.user.id, id, photos);
        await refreshData(); closeOverlay(); state.tab = "journal"; render();
        if (failed.length) setBanner(`Added, but ${failed.length} photo(s) did not upload: ${failed[0].message}. Open the entry and add them again.`);
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
  else if (t.dataset.wfnote !== undefined && state.wf) state.wf.note = t.value;
});

// Choosing pictures in the rating sheet or the add-a-wine form.
document.addEventListener("change", async (ev) => {
  const t = ev.target;
  if (!t.dataset || !t.dataset.photo || t.type !== "file") return;
  const files = [...t.files];
  t.value = "";
  if (t.dataset.photo === "sheet" && state.sheet) {
    await takePictures(files, (p) => { state.sheet = queuePhoto(state.sheet, p); showPhotos(); }, (m) => { state.sheetUi.error = m; syncSheet(); });
  } else if (t.dataset.photo === "form" && state.form) {
    await takePictures(files, (p) => { state.form.photos = [...(state.form.photos || []), p]; showFormPhotos(); }, (m) => { const e = $("#formErr"); if (e) e.textContent = m; });
  }
});

window.__wine = { state, fly, render, init, learn, profile: profileTab, editor: editorTab, account, feedback };
init();

// The wine app for a phone browser. State, screens and events live here.
// Rules are in logic.js, database calls in data.js, and HTML in views.js.
// The two Supabase values come from config.js. If that file is missing or still has placeholders, the page asks for them and remembers them in this browser.
import {
  FAMILIARITY, wineName, esc, clamp01, shuffle, swipeKind, cardFromRow, filterEntries, groupEntries, swipeLists,
  sheetForCard, sheetForEntry, sheetForOutside, setDim, nudgeDim, resetDim, validateOutside, DIMS,
  queuePhoto, unqueuePhoto, toggleExistingPhoto, refsByVintage, feedbackOn, WINE_FLAG_REASONS, dimMeta, isChoice, setStyle, choiceDims, barDims,
  dragPose, releaseVelocity, decideSwipe, flyPlan, wineEditForm, planWineEdit, validateWineEdit, retargetSheet } from "./logic.js?v=10";
import * as db from "./data.js?v=15";
import { sheetPhotosHtml, applyShareChanges } from "./sharing.js?v=2";
import { startingValues, structureMap, entryAsCard, rulesFor, applyDefaults } from "./structure.js?v=2";
import { shrinkImage } from "./photos.js?v=5";
import {
  visualFor, discoverHtml, swipesHtml, journalShellHtml, journalMetaHtml, journalListHtml, sheetHtml, addFormHtml, photosHtml, formPhotosHtml, wineFlagHtml, confirmHtml, KEPT_NOTE, SWIPE_KEPT_NOTE, footState, wineEditHtml, structurePageHtml, characterPageHtml, SHEET_PAGES, syncChoiceControl } from "./views.js?v=16";
import { createLearn } from "./learn.js?v=3";
import { wireGrapeInputs, checkGrapeInput, setExtraGrapes } from "./grapes.js?v=1";
import { expandBlends, BLEND_NAMES, joinGrapeParts, joinPlace } from "./blends.js?v=1";
import { loadPrices, applyPrices, tidyFacts } from "./pricing.js?v=1";
import { applyTaste, cleanTaste, feelBlockHtml, tastePageHtml, tasteInnerHtml, changeFrom, saveTaste, loadTaste } from "./feel.js?v=3";
import { zoomHtml, nextStep, applyStep, zoomPlan } from "./zoommap.js?v=1";
import { applyVisualTables } from "./visualdata.js?v=1";
import { diffForm, patchCard, patchEntry, loadMyInfo, saveMyInfo } from "./mywine.js?v=1";
import { consentHtml, needsConsent, acceptConsents, allAccepted, toggleConsent } from "./consent.js?v=2";
import { infoLine, entryInfoLine } from "./wineline.js?v=1";
import { FEATURE as PRO_FEATURE, proBlockHtml, gridHtml, syncGridDom, pickValue, tapTag, openFromGrid, cleanGrid, gridToDims, loadTasting, saveTasting, isEmptyGrid } from "./tasting.js?v=2";
import { buildDeck } from "./deck.js?v=2";
import { createProfile } from "./profile.js?v=13";
import { createAccount, readPendingMerge, clearPendingMerge, mergeMessage } from "./account.js?v=5";
import { createFeedback } from "./feedback.js?v=3";
import { createEditor } from "./editor.js?v=22";

// The database library is delivered over the internet. It is pinned to one exact version, and if the first source is down the same version
// is tried from a second, independent one. The last resort is the newest 2.x from the first source.
const APP_VERSION = "31";   // shown to editors with each piece of feedback
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
  cards: [], deck: [], busy: false, counts: { swipes: 0, journal: 0 },
  states: [], journal: [],
  sw: { open: { rec: true }, sort: {} },
  j: { q: "", by: "verdict", verdict: "all", open: {}, limits: {} },
  sheet: null, sheetUi: { saving: false, error: "" },
  form: null,
  photoUrls: new Map(),                 // signed links for the photos shown in Journal and Swipes
  quiz: null,                           // quiz results by topic, used to judge what the person knows
  crowd: new Map(),                     // how many players recognized each wine
  deckInfo: new Map(),                  // wine id -> { tier, fam, pref }: which deck each wine is in and why
  sinceDeck: 0,                         // swipes since the deck was last re-ranked
  access: { role: null, label: null, permissions: [] },   // what this person may do as staff: from the database
  zoom: null,                           // the open map overlay: { plan, step, at }
  mine: new Map(),                      // wine_vintage_id -> this player's private changes to the wine's details (mywine.js)
  consent: {}, consentBusy: false, consentError: "",   // the consent page: what is ticked
  pro: false,                           // this person has the professional tier: they get the tasting grid (feature switch proTasting)
  grid: null,                           // the tasting grid that is open: { values }
  refs: new Map(),                      // wine_vintage_id -> reference structure values set by editors
  feedback: false,                      // feedback switch (feature_access), on for everyone for now
  wf: null, wfDone: null,               // "report a problem with this wine"
  confirm: null,                        // the delete confirmation that is open, if any
  wedit: null,                          // the "change wine info" form that is open, if any
};
// What this person may do in the Editor tab comes from the database (staff roles, update 13).
const can = (permission) => !!state.access && state.access.permissions.includes(permission);
const isEditor = () => can("catalog_edit") || can("quiz_verify");
// Where a wine's starting structure comes from: an editor's score first, then the structure rules. See structure.js.
const cardById = (id) => state.cards.find((c) => c.id === id) || null;
const startFor = (card) => startingValues(card, card && state.refs.get(card.id));
const startForEntry = (entry) => (entry.wine_vintage_id ? startFor(cardById(entry.wine_vintage_id)) : startingValues(entryAsCard(entry), null));
// What the palate uses as a baseline from the rules alone (the editor's own scores are added in profile.js).
const ruleBase = (wineVintageId, entry) => rulesFor(wineVintageId ? cardById(wineVintageId) : entryAsCard(entry));
const TITLES = { discover: "Discover", swipes: "Swipes", journal: "Journal", profile: "Profile", learn: "Learn", editor: "Editor" };

// The Learn tab lives in learn.js. It saves quiz answers itself and reports save problems through the banner.
const learn = createLearn({ sb: () => state.sb, user: () => state.user, profile: () => state.profile, onError: (m) => setBanner(m) });
// The Profile tab lives in profile.js. It reads the journal and swipes the app already loaded.
const profileTab = createProfile({ ruleBase: (vid, entry) => ruleBase(vid, entry), sb: () => state.sb, userId: () => state.user.id, user: () => state.user, journal: () => state.journal, states: () => state.states, cards: () => state.cards });
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
const editorTab = createEditor({ sb: () => state.sb, userId: () => state.user.id, cards: () => state.cards, can, roleLabel: () => (state.access && state.access.label) || "", onSaved: () => loadReferences(), onWineChanged: async () => { state.cards = await loadAllCards(); rebuildDeck(); } });   // a deleted, archived, published or edited wine changes the Discover deck too

// The catalog cards, each with its price (an editor's price blended with players' prices, see pricing.js) and no repeated lines.
// Before database update 20 there are no prices; the cards still load.
// The vineyard is put on the card and added to its facts, right after the grape (before database update 22 there is none to show).
function addVineyard(card) {
  card.vineyard = String((card.raw && card.raw.vineyard) || "").trim();
  if (!card.vineyard) return card;
  const leading = (card.raw.label_grapes && card.raw.label_grapes.length ? 1 : 0) + (card.raw.rule_grapes && card.raw.rule_grapes.length ? 1 : 0);
  card.facts = [...card.facts.slice(0, leading), { text: card.vineyard, derived: false }, ...card.facts.slice(leading)];
  return card;
}
async function loadAllCards() {
  await applyVisualTables(state.sb);   // flavor weights and place nudges the Owner or an editor tuned in the database (the built-in set is used if there are none)
  try { state.mine = await loadMyInfo(state.sb); } catch (_) { state.mine = new Map(); }   // before database update 24 nobody has private changes
  const cards = (await db.loadCards(state.sb)).map((c) => {
    c.catalogForm = wineEditForm({ style: c.style }, c, null);   // the catalog's own details, kept so a change can be compared and undone
    return addVineyard(patchCard(c, state.mine.get(c.id)));
  });
  try { applyPrices(cards, await loadPrices(state.sb)); } catch (_) { cards.forEach(tidyFacts); }
  return cards;
}
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
  setExtraGrapes(BLEND_NAMES);   // GSM is accepted as a varietal (it becomes Grenache, Syrah and Mourvèdre when saved)
  wireGrapeInputs();   // suggestions under every grape field
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
    state.access = await db.loadAccess(state.sb, state.profile.role);
    if (!needsConsent(state.profile, store.get("wine.consent"))) await enterMain(); else { state.status = "age"; render(); }   // the one consent page: first time, or when its version changes
    if (carried && carried.error) setBanner(carried.error);
    else if (carried) setBanner(carried, true);
  } catch (e) {
    state.status = "error"; state.error = e.message || String(e); render();
  }
}
// A wine that was only marked "not interested" has no swipe date in the database view. Date it by that moment, so "recently swiped" sorts it correctly.
async function dateStates(states) {
  const open = states.filter((s) => !s.last_swiped_at);
  if (!open.length) return states;
  try {
    const last = new Map();
    for (let from = 0; ; from += 1000) {
      const { data, error } = await state.sb.from("encounters").select("wine_vintage_id, created_at").eq("event", "interest_change").order("created_at", { ascending: true }).range(from, from + 999);
      if (error) throw error;
      data.forEach((r) => last.set(r.wine_vintage_id, r.created_at));   // oldest first, so the latest wins
      if (data.length < 1000) break;
    }
    open.forEach((s) => { s.last_swiped_at = last.get(s.wine_vintage_id) || null; });
  } catch (_) { /* the wines are still listed; they just sort by name */ }
  return states;
}
async function refreshData() {
  const [states0, journal, counts] = await Promise.all([db.loadStates(state.sb), db.loadJournal(state.sb), loadCounts()]);
  const states = await dateStates(states0);
  state.states = states;
  if (state.mine.size) journal.forEach((e, i) => { if (e.wine_vintage_id && state.mine.has(e.wine_vintage_id)) journal[i] = patchEntry(e, state.mine.get(e.wine_vintage_id)); }); state.journal = journal; state.counts = counts;
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
  state.cards = await loadAllCards();
  await Promise.all([refreshData(), loadReferences()]);
  try { state.feedback = feedbackOn(await db.loadFeature(state.sb, "contentFeedback"), (state.profile || {}).tier || "default"); } catch (_) { state.feedback = false; }
  try { state.pro = feedbackOn(await db.loadFeature(state.sb, PRO_FEATURE), (state.profile || {}).tier || "default"); } catch (_) { state.pro = false; }   // off until database update 21 is run
  // What the person knows and what other players know both help decide the deck. Neither is essential.
  try { state.quiz = await db.loadQuizKnowledge(state.sb); } catch (_) { state.quiz = null; }
  try { state.crowd = await db.loadCrowd(state.sb); } catch (_) { state.crowd = new Map(); }
  rebuildDeck();
  state.status = "main"; render();
}
// The Discover deck: three decks (familiar, getting warmer, new territory) mixed by what the person knows and likes. See deck.js.
// ---------------------------------------------------------------- bottle photos on the cards
// The photo fades in once it has loaded. If it cannot be loaded, the drawn bottle is shown instead.
document.addEventListener("load", (ev) => { const t = ev.target; if (t && t.classList && t.classList.contains("winephoto")) t.classList.add("ready"); }, true);
document.addEventListener("error", (ev) => { const t = ev.target; if (t && t.classList && t.classList.contains("winephoto")) { const box = t.closest(".image"); if (box) box.classList.add("failed"); } }, true);
function settlePhotos() {   // a photo that was already loaded before the page was drawn
  document.querySelectorAll("img.winephoto").forEach((i) => { if (i.complete) { if (i.naturalWidth) i.classList.add("ready"); else { const b = i.closest(".image"); if (b) b.classList.add("failed"); } } });
}
// The next few cards' photos are fetched ahead of time, so a swipe never waits for a download. (Skipped when the phone is saving data.)
const photoCache = new Map();
function preloadPhotos(n = 4) {
  if (navigator.connection && navigator.connection.saveData) return;
  state.deck.slice(0, n).forEach((c) => {
    if (!c.photo || photoCache.has(c.photo)) return;
    const im = new Image(); im.decoding = "async"; im.src = c.photo; photoCache.set(c.photo, im);
  });
  while (photoCache.size > 16) photoCache.delete(photoCache.keys().next().value);
}
function rebuildDeck() {
  const r = buildDeck({ cards: state.cards, states: state.states, journal: state.journal, quiz: state.quiz, refs: structureMap(state.cards, state.refs), crowd: state.crowd });
  state.deck = r.deck; state.deckInfo = r.info; state.deckMix = r.mix; state.sinceDeck = 0;
  preloadPhotos();
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
  document.body.dataset.tab = state.tab;   // lets Discover use a slimmer header so the card is bigger
  if (state.tab === "discover") {
    body.innerHTML = discoverHtml({ deck: state.deck, banner: null, counts: state.counts, feedback: state.feedback, flaggedId: state.wfDone, nudge: showNudge() });
    const card = $("#card");
    if (card) attachCard(card);
    settlePhotos(); preloadPhotos();
  } else if (state.tab === "swipes") {
    body.innerHTML = swipesHtml(swipeLists(state.cards, state.states, state.journal), { ...state.sw, noFam: new Set(state.states.filter((x) => !x.familiarity).map((x) => x.wine_vintage_id)) }, state.photoUrls);
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
  if (list) list.innerHTML = journalListHtml(state.journal, state.j, state.photoUrls, state.cards);
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
  else if (state.status === "age") html = `${consentHtml({ accepted: state.consent, underage: state.underage, busy: state.consentBusy, error: state.consentError })}${state.banner ? `<div class="err" style="padding:0 20px">${esc(state.banner)}</div>` : ""}`;
  app.innerHTML = html;
}

// ---------------------------------------------------------------- swiping (Discover)
const reduceMotion = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
const behindOf = (el) => (el && el.parentElement ? el.parentElement.querySelector(".behind") : null);
// The card underneath rises toward the front as the top card is pulled away.
function paintBehind(el, progress, ms = 0) {
  const b = behindOf(el); if (!b) return;
  b.style.transition = ms ? `transform ${ms}ms cubic-bezier(.2,.9,.3,1), opacity ${ms}ms` : "none";
  b.style.transform = `scale(${0.95 + 0.05 * progress}) translateY(${10 - 10 * progress}px)`;
  b.style.opacity = String(0.7 + 0.3 * progress);
}
// The card leaves the way it was thrown, at the speed it was thrown. A tap or a double-tap sends it with a gentler push.
async function fly(el, kind, v = { dx: 0, dy: 0, vx: 0, vy: 0 }) {
  if (state.busy || !state.deck.length) return;
  state.busy = true;
  const card = state.deck[0];
  if (el) {
    el.classList.remove("dragging"); el.classList.add("leaving");
    const plan = flyPlan(kind, v.dx, v.dy, v.vx || (kind === "recognize" ? 0.9 : kind === "unknown" ? -0.9 : 0), v.vy || (kind === "had" ? -1.1 : 0), window.innerWidth, window.innerHeight);
    paintBehind(el, 1, plan.duration);
    if (el.animate && !reduceMotion()) {
      const from = el.style.transform || "translate3d(0px, 0px, 0)";
      const anim = el.animate([{ transform: from }, { transform: `translate3d(${plan.to[0]}px, ${plan.to[1]}px, 0) rotate(${plan.rot}deg) scale(1)` }],
        { duration: plan.duration, easing: "cubic-bezier(0.25, 0.6, 0.35, 1)", fill: "forwards" });
      try { await anim.finished; } catch (_) {}
    } else {
      el.style.transition = "transform 200ms ease-in"; el.style.transform = `translate(${plan.to[0]}px, ${plan.to[1]}px) rotate(${plan.rot}deg)`;
      await sleep(210);
    }
    if (navigator.vibrate) { try { navigator.vibrate(8); } catch (_) {} }
  }
  try {
    const interestUsed = "try";   // interest is implied: a wine the person swipes is a wine they are open to
    await db.recordSwipe(state.sb, card.id, kind, interestUsed);
    state.deck.shift();
    // What this swipe taught us counts straight away; every 8 swipes (or when the deck runs low) the rest of the deck is re-ranked.
    state.states = [...state.states.filter((x) => x.wine_vintage_id !== card.id), { wine_vintage_id: card.id, familiarity: kind, interest: interestUsed, last_swiped_at: new Date().toISOString() }];
    state.sinceDeck += 1;
    if (state.sinceDeck >= 8 || state.deck.length < 4) rebuildDeck();
    setBanner(null);
    state.counts = await loadCounts();
  } catch (e) {
    setBanner("Could not save that swipe: " + (e.message || e));
  }
  state.busy = false;
  if (state.tab === "discover") {
    renderBody();
    // The next card starts where the one underneath was, then settles forward.
    const nc = $("#card");
    if (nc && nc.animate && !reduceMotion()) nc.animate([{ transform: "scale(0.95) translateY(10px)", opacity: 0.85 }, { transform: "none", opacity: 1 }], { duration: 260, easing: "cubic-bezier(0.2, 0.9, 0.3, 1.15)" });
  }
}

// "Not interested": the button turns on for this one wine and the wine is filed under Not interested in Swipes straight away.
// It records that interest only (no "I recognize it" or "don't know it" is claimed), so it says nothing about what the person knows.
async function notInterested() {
  if (state.busy || !state.deck.length) return;
  state.busy = true;
  const card = state.deck[0], el = $("#card"), btn = document.querySelector("[data-action='notint']");
  if (btn) { btn.classList.add("on"); btn.setAttribute("aria-pressed", "true"); }
  if (el) {
    el.classList.remove("dragging"); el.classList.add("leaving");
    paintBehind(el, 1, 260);
    if (el.animate && !reduceMotion()) {
      const anim = el.animate([{ transform: "translate3d(0px, 0px, 0)", opacity: 1 }, { transform: `translate3d(0px, ${window.innerHeight * 0.9}px, 0) rotate(4deg)`, opacity: 0.2 }],
        { duration: 280, easing: "cubic-bezier(0.4, 0, 0.8, 0.6)", fill: "forwards" });
      try { await anim.finished; } catch (_) {}
    } else await sleep(120);
  }
  try {
    await db.changeInterest(state.sb, state.user.id, card.id, "nope");
    state.deck.shift();
    state.states = [...state.states.filter((x) => x.wine_vintage_id !== card.id), { wine_vintage_id: card.id, familiarity: null, interest: "nope", last_swiped_at: new Date().toISOString() }];
    state.sinceDeck += 1;
    if (state.sinceDeck >= 8 || state.deck.length < 4) rebuildDeck();
    setBanner(null);
  } catch (e) { setBanner("Could not save that: " + (e.message || e)); }
  state.busy = false;
  if (state.tab === "discover") {
    renderBody();
    const nc = $("#card");
    if (nc && nc.animate && !reduceMotion()) nc.animate([{ transform: "scale(0.95) translateY(10px)", opacity: 0.85 }, { transform: "none", opacity: 1 }], { duration: 260, easing: "cubic-bezier(0.2, 0.9, 0.3, 1.15)" });
  }
}

// The double-tap zones: a narrow strip down each side (left = don't know it, right = recognize it) and a thin strip across the top (had it).
// Everything in the middle of the card is not a zone, so a double-tap there does nothing. These are fractions of the card's width and height.
const EDGE_SIDE = 0.14, EDGE_TOP = 0.09;
const edgeOf = (fx, fy) => (fy < EDGE_TOP ? "had" : fx < EDGE_SIDE ? "unknown" : fx > 1 - EDGE_SIDE ? "recognize" : null);
function attachCard(el) {
  // Forgiving double-tap: fingers may wobble a little, and the second tap can be slower or a bit off.
  const TAP_MOVE = 18, DOUBLE_TAP_MS = 500, TAP_APART = 70;
  let start = null, dx = 0, dy = 0, lastTap = null, hintTimer = null, samples = [];
  const label = (k) => el.querySelector(`[data-label="${k}"]`);
  const clearHint = () => { clearTimeout(hintTimer); ["recognize", "unknown", "had"].forEach((k) => { label(k).style.opacity = 0; }); };
  const showHint = (edge) => { clearHint(); if (edge) { label(edge).style.opacity = 0.55; hintTimer = setTimeout(clearHint, DOUBLE_TAP_MS + 50); } };
  const paint = () => {
    label("recognize").style.opacity = clamp01((dx - 40) / 80);
    label("unknown").style.opacity = clamp01((-dx - 40) / 80);
    label("had").style.opacity = clamp01((-dy - 40) / 80);
  };
  // Not far enough: the card springs back past the middle and settles, like something with weight.
  const settle = () => {
    el.classList.remove("dragging");
    el.style.transition = reduceMotion() ? "transform 150ms ease-out" : "transform 460ms cubic-bezier(0.34, 1.6, 0.5, 1)";
    el.style.transform = ""; dx = dy = 0; paint(); paintBehind(el, 0, reduceMotion() ? 150 : 380);
  };
  el.addEventListener("pointerdown", (e) => {
    if (state.busy) return;
    start = { x: e.clientX, y: e.clientY }; dx = dy = 0; samples = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
    try { el.setPointerCapture(e.pointerId); } catch (_) {}
    el.style.transition = "none"; el.classList.add("dragging");
  });
  el.addEventListener("pointermove", (e) => {
    if (!start) return;
    dx = e.clientX - start.x; dy = e.clientY - start.y;
    samples.push({ x: e.clientX, y: e.clientY, t: performance.now() }); if (samples.length > 8) samples.shift();
    const pose = dragPose(dx, dy);
    el.style.transform = pose.transform;
    paintBehind(el, pose.progress);
    paint();
  });
  el.addEventListener("pointerup", (e) => {
    if (!start) return;
    const from = start; start = null;
    const { vx, vy } = releaseVelocity(samples);
    const kind = decideSwipe(dx, dy, vx, vy);
    if (kind) { fly(el, kind, { dx, dy, vx, vy }); return; }
    settle();
    if (Math.hypot(e.clientX - from.x, e.clientY - from.y) < TAP_MOVE) {      // a tap that barely moved
      // A tap on the map is only ever a tap on the map: it never counts toward a double-tap, whatever part of the card it is on.
      // The overlay opens a moment after the finger lifts, so the click that follows the tap lands on the card and not on the overlay.
      const hit = document.elementFromPoint(e.clientX, e.clientY), mapEl = hit && hit.closest("[data-zoom]");
      if (mapEl) { lastTap = null; clearHint(); const id = mapEl.dataset.zoom; setTimeout(() => openZoom(id), 60); return; }
      const now = Date.now();
      const r = el.getBoundingClientRect();
      const edge = edgeOf((from.x - r.left) / r.width, (from.y - r.top) / r.height);
      const prev = lastTap;
      if (prev && now - prev.t < DOUBLE_TAP_MS && Math.hypot(from.x - prev.x, from.y - prev.y) < TAP_APART) {
        lastTap = null; clearHint();                                             // second tap: a double-tap
        const kind2 = edge || prev.edge;                                         // if the second tap drifted inward, use the first tap's zone
        if (kind2) { label(kind2).style.opacity = 1; fly(el, kind2); }
      } else {
        lastTap = { t: now, x: from.x, y: from.y, edge }; showHint(edge);
      }
    }
  });
  el.addEventListener("pointercancel", () => { start = null; settle(); });
}

// ---------------------------------------------------------------- the rating sheet
function closeOverlay() { state.sheet = null; state.form = null; $("#overlay").innerHTML = ""; }
// Updates the parts of the open sheet that change, without redrawing it (so typing and scrolling are not disturbed).
function syncSheet() {
  const s = state.sheet;
  if (!s) return;
  document.querySelectorAll("[data-sheet^='verdict:']").forEach((b) => b.classList.toggle("on", b.dataset.sheet === "verdict:" + s.verdict));
  DIMS.filter((d) => s.dims[d.key]).forEach((d) => {
    const x = s.dims[d.key];
    if (isChoice(d)) syncChoiceControl(d, x);
    else {
      const r = document.querySelector(`[data-dim="${d.key}"]`);
      if (r && Number(r.value) !== x.value) r.value = x.value;
    }
    const rs = document.getElementById("reset-" + d.key);
    if (rs) rs.style.visibility = x.adjusted ? "visible" : "hidden";
  });
  document.querySelectorAll("[data-sheet='save']").forEach((b) => { b.disabled = !s.verdict || state.sheetUi.saving; });
  const hint = document.querySelector(".wfoot .muted"); if (hint) hint.hidden = !!s.verdict;
  syncFoot();
  const err = $("#sheetErr");
  if (err) err.textContent = state.sheetUi.error || "";
}
// The big button at the bottom is Next on every page but the last, where it saves.
function syncFoot() {
  const b = document.getElementById("wfootbtn");
  if (!b || !state.sheet) return;
  const f = footState(state.sheetUi.page || 0, state.sheet.verdict, state.sheetUi.saving);
  b.dataset.sheet = f.action; b.textContent = f.label; b.disabled = f.disabled;
}
function openSheet() {
  state.sheetUi = { ...state.sheetUi, saving: false, error: "", page: 0 };
  $("#overlay").innerHTML = sheetHtml(state.sheet, state.sheetUi);
  showPhotos();   // the photos block (sharing.js)
  showExtras(); showWineLine();
}
// Ordinary players do not see the structure sliders. Steps 2 and 3 are everyday words and questions instead (feel.js): "How did it taste?"
// and "A bit more". Their answers set that bottle's structure ratings behind the scenes, and those feed only the player's own palate profile.
// Professionals keep the sliders, with the words and the tasting grid (tasting.js) at the top of step 2.
const STEP_TITLES = ["Verdict", "How it tasted", "", "Details", "Notes and photos"];
const stepTitle = (i) => (state.pro ? SHEET_PAGES[i].title : STEP_TITLES[i]);
// Ordinary players skip step 3 (sweetness and bubbles sliders): the questions on step 2 cover it.
const pagesShown = () => [0, 1, 2, 3, 4].filter((i) => state.pro || i !== 2);
const stepLine = (page) => `Step ${pagesShown().indexOf(page) + 1} of ${pagesShown().length}: ${stepTitle(page)}`;
function paintSteps() {
  const shown = pagesShown();
  document.querySelectorAll(".wstep").forEach((el, i) => {
    el.hidden = !shown.includes(i);
    if (shown.includes(i)) { el.textContent = String(shown.indexOf(i) + 1); el.setAttribute("aria-label", `Step ${shown.indexOf(i) + 1} of ${shown.length}, ${stepTitle(i)}`); }
  });
  const t = $("#wtitle"); if (t && state.sheetUi) t.textContent = stepLine(state.sheetUi.page || 0);
}
// Steps 2 and 3, drawn for whoever is rating: questions (ordinary players) or sliders with the questions and the grid on top (professionals).
function showExtras() {
  const a = document.querySelector('[data-wpage="1"]');
  if (!state.sheet || !a) return;
  paintSteps();
  if (!state.pro) { a.innerHTML = tastePageHtml(state.sheet); return; }
  a.querySelectorAll("[data-feelblock], [data-problock]").forEach((e) => e.remove());
  a.insertAdjacentHTML("afterbegin", feelBlockHtml(state.sheet) + proBlockHtml(state.sheet.tasting || {}, state.sheet.style));
}
// The small line of wine info (varietal, vineyard, region ...) under the wine's name.
function sheetInfo(sheet) {
  if (!sheet) return "";
  const t = sheet.target || {};
  if (t.wineVintageId) return infoLine(cardById(t.wineVintageId));
  const e = sheet.entryId && state.journal.find((x) => x.id === sheet.entryId);
  if (e) return entryInfoLine(e, e.wine_vintage_id ? cardById(e.wine_vintage_id) : null);
  return t.form ? entryInfoLine(t.form, null) : "";
}
function showWineLine() {
  const big = document.querySelector("#sheetPanel .sheettitle .big");
  if (!big || !state.sheet) return;
  const old = document.getElementById("sheetInfo"); if (old) old.remove();
  // The name, with a pencil: tapping it changes the wine info.
  big.innerHTML = `${esc(state.sheet.target.name)}&nbsp;<button class="ed edbtn" id="sheetEdit" data-sheet="editinfo" aria-label="Change wine info">&#9998;</button>`;
  const info = sheetInfo(state.sheet);
  if (info) big.insertAdjacentHTML("afterend", `<div class="muted small" id="sheetInfo">${esc(info)}</div>`);
}
function openGrid() {
  if (!state.sheet) return;
  const values = JSON.parse(JSON.stringify(cleanGrid(state.sheet.tasting || {}, state.sheet.style)));
  state.grid = { values, open: openFromGrid(values), timer: null };
  $("#confirm").innerHTML = gridHtml(values, state.grid.open, state.sheet.style, state.sheet.target.name, sheetInfo(state.sheet));
}
const setGridMsg = (m) => { const el = document.getElementById("gridMsg"); if (el) el.textContent = m || ""; };
// Every tap is kept at once: it goes into the rating window (and moves the structure sliders), and for an entry that already exists it is also
// saved to the database a moment later. For a new entry it is saved together with the rating.
async function saveGridNow() {
  const g = state.grid, sheet = state.sheet;
  if (g) { clearTimeout(g.timer); g.timer = null; }
  if (!sheet || !sheet.entryId || !sheet.tastingDirty) return;
  try { await saveTasting(state.sb, sheet.entryId, sheet.tasting || {}, sheet.style); sheet.tastingDirty = false; setGridMsg(""); }
  catch (e) { setGridMsg("Not saved yet (" + (e.message || e) + "). It will be saved with the rating."); }
}
function scheduleGridSave() {
  const g = state.grid;
  if (!g || !state.sheet || !state.sheet.entryId) return;
  clearTimeout(g.timer); g.timer = setTimeout(saveGridNow, 600);
}
function applyGridLive(withDims = true) {
  if (!state.grid || !state.sheet) return;
  const style = state.sheet.style, clean = cleanGrid(state.grid.values, style);
  state.sheet.tasting = clean; state.sheet.tastingDirty = true;
  if (withDims) {
    Object.entries(gridToDims(clean, style)).forEach(([key, value]) => { if (state.sheet.dims[key]) state.sheet = setDim(state.sheet, key, value); });
    state.sheet.taste = null; state.sheet.tasteDirty = true; syncSheet(); showExtras();
  }
  scheduleGridSave();
}
async function closeGrid() { await saveGridNow(); state.grid = null; $("#confirm").innerHTML = ""; showExtras(); }
// Go to page n of the rating window (0 to 4). Everything stays on the page, so nothing entered is lost.
// dir (1 or -1) says which way to go when the page asked for is hidden.
function showSheetPage(n, dir = 1) {
  const last = SHEET_PAGES.length - 1;
  let page = Math.max(0, Math.min(last, n));
  while (!pagesShown().includes(page) && page > 0 && page < last) page += dir;
  state.sheetUi.page = page;
  document.querySelectorAll("#wpages .wpage").forEach((el) => { el.hidden = Number(el.dataset.wpage) !== page; });
  document.querySelectorAll(".wstep").forEach((b, i) => b.classList.toggle("on", i === page));
  const t = $("#wtitle"); if (t) t.textContent = stepLine(page);
  const panel = $("#sheetPanel"); if (panel) { panel.dataset.page = String(page); panel.scrollTop = 0; }
  syncFoot();
}
// ---------------------------------------------------------------- changing a wine's info
// Wine info is changed from the Swipes list, the Journal, the Profile and the rating window (the name, or the pencil next to it). It is not changed from the Discover deck.
// For a wine in the catalog this is a private version laid over the catalog's (mywine.js): only the player sees it and the catalog never moves.
// A wine the player typed in themselves is changed directly. Editors and the Owner change the catalog itself in the Editor tab.
const MY_NOTE = "This is your own version of the wine. Only you see it, and the catalog does not change.";
function openMyInfo(wineVintageId) {
  const card = cardById(wineVintageId);
  if (!card) return;
  const before = wineEditForm({ style: card.style }, card, null);
  state.wedit = { mode: "mine", card, before, form: { ...before }, saving: false, error: "", canReset: state.mine.has(card.id), note: MY_NOTE };
  drawWineEdit();
}
// From the rating window (the pencil by the name, or the link on the Details step) and from the Journal and Profile (by entry).
async function openEntryInfo(entry) {
  if (!entry) return;
  if (!entry.is_outside_wine && entry.wine_vintage_id) return openMyInfo(entry.wine_vintage_id);
  let userWine = null;
  try { userWine = await db.loadUserWine(state.sb, entry.user_wine_id); }
  catch (e) { setBanner("Could not open wine info: " + (e.message || e)); return; }
  const before = wineEditForm(entry, null, userWine);
  state.wedit = { entry, before, form: { ...before }, saving: false, error: "", note: "This wine is yours. If it matches a catalog wine, this entry moves to that wine." };
  drawWineEdit();
}
async function openWineEdit() {
  const s = state.sheet;
  if (!s) return;
  if (s.target.wineVintageId) return openMyInfo(s.target.wineVintageId);
  const entry = s.entryId && state.journal.find((e) => e.id === s.entryId);
  if (entry) return openEntryInfo(entry);
}
const drawWineEdit = () => { const w = state.wedit; $("#confirm").innerHTML = w ? wineEditHtml(w.form, { error: w.error, saving: w.saving, note: w.note, canReset: !!w.canReset }) : ""; };
const closeWineEdit = () => { state.wedit = null; $("#confirm").innerHTML = ""; };
function showWineChange() {
  const s = state.sheet; if (!s) return;
  const c = document.getElementById("wcname"); if (c) c.textContent = s.target.name;
  redrawStructurePages(); showPhotos(); showWineLine(); syncSheet();   // the photos block follows the wine
}
// After a private change: the cards, the journal and the deck are rebuilt from the database so every screen shows the player's version,
// and an open rating window follows the wine (its name, its type and so the questions it asks).
async function reloadWines(wineVintageId) {
  const wasOnTop = state.deck.length && state.deck[0].id === wineVintageId;
  state.cards = await loadAllCards();
  await refreshData();
  rebuildDeck();
  if (wasOnTop) { const c = cardById(wineVintageId); if (c) state.deck = [c, ...state.deck.filter((x) => x.id !== wineVintageId)]; }
  const s = state.sheet, card = cardById(wineVintageId);
  if (s && card && s.target.wineVintageId === wineVintageId) {
    let next = { ...s, target: { ...s.target, name: wineName(card) }, catalogStyle: card.style };
    if (next.style !== card.style) next = setStyle(next, card.style);
    state.sheet = { ...next, taste: cleanTaste(next.taste, next.style), tasteDirty: true };
    showWineChange();
  }
  if (state.tab === "journal") renderJournalList(); else renderBody();
}
async function saveMyWineEdit() {
  const w = state.wedit;
  checkGrapeInputs("wef"); syncGrapePlace("wef"); w.form.grape = expandBlends(w.form.grape);   // GSM -> its three grapes
  const problem = validateWineEdit(w.form);
  if (problem) { w.error = problem; const e = document.getElementById("winfoErr"); if (e) e.textContent = problem; return; }
  const data = diffForm(w.card.catalogForm, w.form);
  if (JSON.stringify(data) === JSON.stringify(state.mine.get(w.card.id) || {})) { closeWineEdit(); return; }
  w.saving = true; w.error = ""; drawWineEdit();
  try {
    await saveMyInfo(state.sb, state.user.id, w.card.id, data);
    const id = w.card.id;
    closeWineEdit();
    await reloadWines(id);
  } catch (e) { w.saving = false; w.error = "Could not save: " + (e.message || e) + (/my_wine_info|relation/i.test(String(e.message || e)) ? " (Run database update 24.)" : ""); drawWineEdit(); }
}
async function resetMyInfo() {
  const w = state.wedit;
  if (!w || !w.card) return;
  w.saving = true; drawWineEdit();
  try { await saveMyInfo(state.sb, state.user.id, w.card.id, {}); const id = w.card.id; closeWineEdit(); await reloadWines(id); }
  catch (e) { w.saving = false; w.error = "Could not reset: " + (e.message || e); drawWineEdit(); }
}
async function saveWineEdit() {
  const w = state.wedit;
  if (!w || w.saving) return;
  if (w.mode === "mine") return saveMyWineEdit();
  checkGrapeInputs("wef"); syncGrapePlace("wef"); w.form.grape = expandBlends(w.form.grape);   // GSM -> its three grapes
  const problem = validateWineEdit(w.form);
  if (problem) { w.error = problem; const e = document.getElementById("winfoErr"); if (e) e.textContent = problem; return; }
  const plan = planWineEdit(w.entry, w.before, w.form, state.cards);
  if (plan.action === "none") { closeWineEdit(); return; }
  w.saving = true; w.error = ""; drawWineEdit();
  try {
    await db.changeJournalWine(state.sb, state.user.id, w.entry, plan);
    await refreshData();
    const updated = state.journal.find((e) => e.id === w.entry.id);
    if (updated && state.sheet && state.sheet.entryId === updated.id) { state.sheet = retargetSheet(state.sheet, updated); showWineChange(); }
    closeWineEdit();
    if (state.tab === "journal") renderJournalList();
  } catch (e) { w.saving = false; w.error = "Could not save: " + (e.message || e); drawWineEdit(); }
}

// Changing the wine type changes which lines apply, so pages 2 and 3 are drawn again.
function redrawStructurePages() {
  const a = document.querySelector('[data-wpage="1"]'), b = document.querySelector('[data-wpage="2"]');
  if (state.pro) {
    if (a) a.innerHTML = structurePageHtml(state.sheet);
    if (b) b.innerHTML = characterPageHtml(state.sheet);
  }
  showExtras();
}
async function openEntry(entry) {
  const [rows, photos] = await Promise.all([db.loadPerceptions(state.sb, entry.id), db.loadEntryPhotos(state.sb, entry.id).catch(() => [])]);
  state.sheet = sheetForEntry(entry, rows, today(), startForEntry(entry), photos);
  state.sheet.photos.existing.forEach((p) => { const row = photos.find((r) => String(r.id) === String(p.id)); p.status = (row && row.share_status) || "private"; p.want = p.status === "submitted" || p.status === "approved"; });
  state.sheet.tasting = {}; state.sheet.tastingDirty = false; state.sheet.taste = null; state.sheet.tasteDirty = false;
  try { state.sheet.taste = await loadTaste(state.sb, entry.id, state.sheet); } catch (_) { /* before database update 23 nothing is remembered */ }
  if (state.pro) { try { state.sheet.tasting = await loadTasting(state.sb, entry.id); } catch (_) { /* before database update 21 there are no notes */ } }
  openSheet();
}
const showPhotos = () => { const el = $("#sheetPhotos"); if (el && state.sheet) el.innerHTML = sheetPhotosHtml(state.sheet); };
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
  state.sheetUi = { ...state.sheetUi, saving: true, error: "" };
  syncSheet();
  try {
    // 1. the rating itself. From here on the entry exists, so a retry updates it instead of adding a second one.
    const id = await db.saveReview(state.sb, state.user.id, s0, today());
    state.sheet.entryId = id;
    // 2. pictures: upload the new ones, delete the ones marked for removal
    const removed = state.sheet.photos.existing.filter((p) => p.removed);
    const shareNew = state.sheet.target.kind === "catalog";   // photos of catalog wines are offered to the editors (agreed on the consent page); wines typed in by hand are never shared
    const failedUp = await db.uploadPhotos(state.sb, state.user.id, id, state.sheet.photos.queued, shareNew);
    const failedDel = await db.deletePhotos(state.sb, removed);
    const failedShare = await applyShareChanges(state.sb, state.sheet.photos.existing.filter((p) => !p.removed || failedDel.some((f) => f.photo.id === p.id)));
    if (state.sheet.tasteDirty) { try { await saveTaste(state.sb, id, state.sheet.taste); state.sheet.tasteDirty = false; } catch (_) { /* before database update 23 the ratings are still saved */ } }
    if (state.pro && state.sheet.tastingDirty) {
      try { await saveTasting(state.sb, id, state.sheet.tasting || {}, state.sheet.style); state.sheet.tastingDirty = false; }
      catch (e) { failedShare.push({ message: "the tasting grid was not saved (" + (e.message || e) + ")" }); }
    }
    await refreshData();
    if (failedUp.length || failedDel.length || failedShare.length) {
      const stillThere = new Set(failedDel.map((f) => f.photo.id));
      state.sheet.photos = {
        existing: state.sheet.photos.existing.filter((p) => !p.removed || stillThere.has(p.id)),
        queued: failedUp.map((f) => f.photo),
      };
      showPhotos();
      const first = (failedUp[0] || failedDel[0] || failedShare[0]).message;
      state.sheetUi = { ...state.sheetUi, saving: false, error: `Your rating is saved, but ${failedUp.length + failedDel.length + failedShare.length} change(s) did not go through: ${first}. Tap Save to try again.` };
      syncSheet();
      return;
    }
    const notShared = failedUp.shareErrors || [];
    closeOverlay();
    state.tab = "journal";
    render();
    if (notShared.length) setBanner(`Saved. ${notShared.length} photo(s) could not be offered to the community (${notShared[0]}). They are still in your journal: open the entry and tap Share to try again.`);
  } catch (e) {
    state.sheetUi = { ...state.sheetUi, saving: false, error: "Could not save: " + (e.message || e) };
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
    body: esc(state.sheet.target.name),
    more: esc(KEPT_NOTE),
    run: async () => { await db.deleteJournalEntry(state.sb, id); closeOverlay(); await refreshData(); state.tab = "journal"; render(); },
  });
}
function askDeleteSwipe(wineId) {
  const card = state.cards.find((c) => c.id === wineId);
  if (!card) return;
  askConfirm({
    title: "Delete this swipe?",
    body: esc(wineName(card)),
    more: esc(SWIPE_KEPT_NOTE),
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

// ---------------------------------------------------------------- tapping outside the rating window closes it
let downOnBackdrop = false;
const isRatingBackdrop = (el) => !!(state.sheet && el && el.classList && el.classList.contains("overlay") && !el.classList.contains("top") && el.querySelector("#sheetPanel[data-page]"));
document.addEventListener("pointerdown", (ev) => { downOnBackdrop = isRatingBackdrop(ev.target); }, true);
document.addEventListener("click", (ev) => {
  const was = downOnBackdrop; downOnBackdrop = false;
  // Both the press and the release must be on the dimmed area, so dragging a slider past the edge of the window never closes it.
  if (was && isRatingBackdrop(ev.target)) closeOverlay();
}, true);

// ---------------------------------------------------------------- swiping between the pages of the rating window
let pageSwipe = null;
document.addEventListener("pointerdown", (ev) => {
  pageSwipe = null;
  if (!state.sheet || !ev.target.closest("#wpages")) return;
  if (ev.target.closest("input, textarea, select, label")) return;   // never while moving a slider or typing; buttons and empty space can start a swipe
  pageSwipe = { x: ev.clientX, y: ev.clientY };
});
document.addEventListener("pointerup", (ev) => {
  if (!pageSwipe || !state.sheet) return;
  const dx = ev.clientX - pageSwipe.x, dy = ev.clientY - pageSwipe.y;
  pageSwipe = null;
  if (Math.abs(dx) > 60 && Math.abs(dy) < 45) showSheetPage(state.sheetUi.page + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
});
document.addEventListener("pointercancel", () => { pageSwipe = null; });

// ---------------------------------------------------------------- clicks and typing
// ---------------------------------------------------------------- the map overlay (zoommap.js)
function openZoom(wineVintageId) {
  const card = cardById(wineVintageId), plan = card && zoomPlan(card);
  if (!plan || state.zoom) return;
  state.zoom = { plan, step: 0, at: performance.now() };
  $("#zoom").innerHTML = zoomHtml(plan, visualFor(card).type, 0);
  const x = document.querySelector("[data-zoomclose]"); if (x) x.focus();
}
function closeZoom() {
  if (!state.zoom) return;
  state.zoom = null; $("#zoom").innerHTML = "";
}
// A tap on the map: the next step, or close after the last one.
function zoomTap() {
  if (!state.zoom) return;
  const next = nextStep(state.zoom.plan, state.zoom.step);
  if (next === null) { closeZoom(); return; }
  state.zoom.step = next; applyStep($("#zoom"), state.zoom.plan, next);
}
document.addEventListener("click", (ev) => {
  const keyboardOpen = ev.target.closest("[data-zoom]");
  if (keyboardOpen && ev.detail === 0) { openZoom(keyboardOpen.dataset.zoom); return; }   // Enter or Space on the focused map; a finger or mouse goes through the card's own tap handling
  if (!state.zoom) return;
  if (performance.now() - state.zoom.at < 400) return;   // the click that trails the tap which opened the map must not move it on or close it
  if (ev.target.closest("[data-zoomclose]")) closeZoom();
  else if (ev.target.closest("[data-zoomstage]")) zoomTap();
  else if (ev.target.matches("[data-zoomback]")) closeZoom();   // a tap outside the box
});
document.addEventListener("keydown", (ev) => {
  if (!state.zoom) return;
  if (ev.key === "Escape") { ev.preventDefault(); closeZoom(); }
  else if ((ev.key === "Enter" || ev.key === " ") && ev.target.matches("[data-zoomstage]")) { ev.preventDefault(); zoomTap(); }
});
// The consent page (consent.js): tick boxes, Tick all, Accept and continue, I am under 21.
document.addEventListener("change", (ev) => {
  const t = ev.target;
  if (t.dataset && t.dataset.consent && state.status === "age") { state.consent = toggleConsent(state.consent, t.dataset.consent); render(); }
});
document.addEventListener("click", async (ev) => {
  if (state.status !== "age") return;
  if (ev.target.closest("[data-consent-under]")) { state.underage = true; render(); }
  else if (ev.target.closest("[data-consent-go]")) {
    if (!allAccepted(state.consent) || state.consentBusy) return;
    state.consentBusy = true; state.consentError = ""; render();
    try { state.profile = await acceptConsents(state.sb, state.user.id, state.profile, (v) => store.set("wine.consent", v)); state.consentBusy = false; await enterMain(); }
    catch (e) { state.consentBusy = false; state.consentError = "Could not save that: " + (e.message || e); render(); }
  }
});
// The questions (feel.js): "Was the wine balanced?", what stood out and how much, and alone or with food. Answering opens more options, so the
// block is redrawn after each tap. The answers set that bottle's structure ratings behind the scenes (private; they feed only the palate).
document.addEventListener("click", (ev) => {
  const q = ev.target.closest("[data-taste]");
  if (!q || !state.sheet) return;
  const change = changeFrom(q.dataset.taste);
  if (!change) return;
  const r = applyTaste(state.sheet, change);
  state.sheet = { ...state.sheet, dims: r.dims, taste: r.taste, tasteDirty: true };
  syncSheet();
  document.querySelectorAll("[data-tasteblock]").forEach((el) => { el.innerHTML = tasteInnerHtml(state.sheet); });
});
// The professional tasting grid (tasting.js). It sits above the rating window; every tap is kept straight away.
document.addEventListener("click", (ev) => {
  const b = ev.target.closest("[data-grid]");
  if (!b) return;
  const [action, id, i] = b.dataset.grid.split(":");
  if (action === "open") openGrid();
  else if (!state.grid) return;
  else if (action === "close") closeGrid();
  else if (action === "pick") { state.grid.values = pickValue(state.grid.values, id, Number(i), state.sheet.style); syncGridDom(state.grid.values, state.grid.open, state.sheet.style); applyGridLive(); }
  else if (action === "tag") { const r = tapTag(state.grid.values, state.grid.open, id, Number(i)); state.grid.values = r.grid; state.grid.open = r.open; syncGridDom(state.grid.values, state.grid.open, state.sheet.style); applyGridLive(); }
});
document.addEventListener("click", async (ev) => {
  const wb = ev.target.closest("[data-wedit], [data-wedit-style]");
  if (wb && state.wedit) {
    if (wb.dataset.weditStyle) {
      state.wedit.form.style = wb.dataset.weditStyle;
      document.querySelectorAll("[data-wedit-style]").forEach((b) => b.classList.toggle("on", b.dataset.weditStyle === state.wedit.form.style));
    } else if (wb.dataset.wedit === "save") await saveWineEdit();
    else if (wb.dataset.wedit === "reset") await resetMyInfo();
    else if (wb.dataset.wedit === "close") closeWineEdit();
    return;
  }
  const sheetBtn = ev.target.closest("[data-sheet]");
  if (sheetBtn) {
    const [action, a, b] = sheetBtn.dataset.sheet.split(":");
    if (action === "verdict") {
      state.sheet.verdict = a; syncSheet();
      if (state.sheetUi.page === 0) setTimeout(() => { if (state.sheet && state.sheet.verdict === a && state.sheetUi.page === 0) showSheetPage(1); }, 220);   // choosing a verdict moves on
    }
    else if (action === "prev") showSheetPage(state.sheetUi.page - 1, -1);
    else if (action === "next") showSheetPage(state.sheetUi.page + 1, 1);
    else if (action === "page") showSheetPage(Number(a));
    else if (action === "sweet") { if (state.sheet.dims[a] && state.sheet.dims[a].value === 0) state.sheet = setDim(state.sheet, a, 1); syncSheet(); }
    else if (action === "nudge") { state.sheet = nudgeDim(state.sheet, a, Number(b)); syncSheet(); }
    else if (action === "choice") { state.sheet = setDim(state.sheet, a, Number(b)); syncSheet(); }
    else if (action === "reset") { state.sheet = resetDim(state.sheet, a); syncSheet(); }
    else if (action === "editinfo") await openWineEdit();
    else if (action === "delete") askDeleteEntry();
    else if (action === "save") await saveSheet();
    else if (action === "close") closeOverlay();
    else if (action === "togglephoto") { state.sheet = toggleExistingPhoto(state.sheet, a); showPhotos(); }
    else if (action === "unqueue") { state.sheet = unqueuePhoto(state.sheet, a); showPhotos(); }
    else if (action === "sharephoto") { const p = state.sheet.photos.existing.find((x) => String(x.id) === String(a)); if (p) { p.want = !p.want; showPhotos(); } }
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
    else if (action === "notint") notInterested();
    else if (action === "wineinfo") openMyInfo(a);
    else if (action === "wineinfo-entry") openEntryInfo(state.journal.find((j) => j.id === a));
    else if (action === "unswipe") {   // "Put back" on a wine that was only marked not interested: it returns to the deck
      const card = cardById(a);
      await db.deleteSwipe(state.sb, a); await refreshData();
      if (card) state.deck = [card, ...state.deck.filter((c) => c.id !== a)];
      renderBody();
    }
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
      else { state.sheet = sheetForCard(cardById(a), today(), startFor(cardById(a))); openSheet(); }
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
      checkGrapeInputs("form"); syncGrapePlace("form"); state.form.grape = expandBlends(state.form.grape);   // GSM -> its three grapes
      const problem = validateOutside(state.form);
      if (problem) { $("#formErr").textContent = problem; return; }
      if (action === "addrate") { state.sheet = applyDefaults(sheetForOutside(state.form, today()), startingValues(entryAsCard(state.form), null)); state.form = null; openSheet(); }
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

// The forms show "main varietal", "other varietals", "country" and "region"; the form keeps one grape text and one place text.
function syncGrapePlace(scope) {
  const form = scope === "wef" ? (state.wedit && state.wedit.form) : state.form;
  if (!form) return;
  const val = (sel) => { const el = document.querySelector(`${sel}[data-pscope="${scope}"]`); return el ? el.value : ""; };
  form.grape = joinGrapeParts(val("[data-gmain]"), val("[data-gother]"));
  form.region = joinPlace(val("[data-pregion]"), val("[data-pcountry]"));
}
const checkGrapeInputs = (scope) => document.querySelectorAll(`[data-pscope="${scope}"][data-grapes]`).forEach((el) => checkGrapeInput(el));   // marks a grape that is not on the list
document.addEventListener("input", (ev) => {
  const t = ev.target;
  if (t.dataset.gridNote !== undefined && state.grid) { state.grid.values.note = t.value; applyGridLive(false); }
  else if (t.dataset.dim) { state.sheet = setDim(state.sheet, t.dataset.dim, Number(t.value)); syncSheet(); }
  else if (t.dataset.field && state.sheet) state.sheet[t.dataset.field] = t.value;
  else if (t.dataset.pscope !== undefined) syncGrapePlace(t.dataset.pscope);
  else if (t.dataset.form && state.form) state.form[t.dataset.form] = t.value;
  else if (t.dataset.wef && state.wedit) state.wedit.form[t.dataset.wef] = t.value;
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

window.__wine = { state, fly, render, init, learn, rebuildDeck, photoCache, profile: profileTab, editor: editorTab, account, feedback };
init();

// The wine app for a phone browser. State, screens and events live here.
// Rules are in logic.js, database calls in data.js, and HTML in views.js.
// The two Supabase values come from config.js. If that file is missing or still has placeholders, the page asks for them and remembers them in this browser.
import {
  wineName, esc, clamp01, filterEntries, groupEntries, swipeLists,
  sheetForCard, sheetForEntry, sheetForOutside, setDim, nudgeDim, resetDim, validateOutside, DIMS,
  queuePhoto, unqueuePhoto, toggleExistingPhoto, refsByVintage, feedbackOn, WINE_FLAG_REASONS, isChoice, setStyle,
  dragPose, releaseVelocity, decideSwipe, flyPlan, wineEditForm, planWineEdit, validateWineEdit, retargetSheet } from "./logic.js?v=10";
import * as db from "./data.js?v=15";
import { sheetPhotosHtml, applyShareChanges } from "./sharing.js?v=2";
import { startingValues, structureMap, entryAsCard, rulesFor, applyDefaults } from "./structure.js?v=2";
import { shrinkImage } from "./photos.js?v=5";
import {
  visualFor, discoverHtml, swipesHtml, journalShellHtml, journalMetaHtml, journalListHtml, sheetHtml, addFormHtml, formPhotosHtml, wineFlagHtml, confirmHtml, KEPT_NOTE, SWIPE_KEPT_NOTE, footState, wineEditHtml, structurePageHtml, characterPageHtml, SHEET_PAGES, syncChoiceControl } from "./views.js?v=25";
import { createLearn } from "./learn.js?v=3";
import { wireGrapeInputs, checkGrapeInput, setExtraGrapes } from "./grapes.js?v=1";
import { expandBlends, BLEND_NAMES, joinGrapeParts, joinPlace } from "./blends.js?v=1";
import { loadPrices, applyPrices, tidyFacts, parsePrice, saveWinePrice } from "./pricing.js?v=1";
import { applyTaste, cleanTaste, feelBlockHtml, tastePageHtml, tasteInnerHtml, changeFrom, saveTaste, loadTaste } from "./feel.js?v=6";
import { zoomHtml, nextStep, applyStep, zoomPlan } from "./zoommap.js?v=3";
import { applyVisualTables } from "./visualdata.js?v=1";
import { diffForm, patchCard, patchEntry, loadMyInfo, saveMyInfo } from "./mywine.js?v=1";
import { consentHtml, needsConsent, acceptConsents, allAccepted, toggleConsent } from "./consent.js?v=2";
import { infoLine, entryInfoLine } from "./wineline.js?v=1";
import { FEATURE as PRO_FEATURE, proBlockHtml, gridHtml, syncGridDom, pickValue, tapTag, openFromGrid, cleanGrid, gridToDims, loadTasting, saveTasting } from "./tasting.js?v=2";
import { buildDeck, userModel } from "./deck.js?v=4";
import { createProfile } from "./profile.js?v=14";
import { createAccount, readPendingMerge, clearPendingMerge, mergeMessage } from "./account.js?v=5";
import { createFeedback } from "./feedback.js?v=3";
import { createEditor } from "./editor.js?v=23";
import { SETTINGS_KEY, parseSettings, changeSetting, textScale, settingsHtml } from "./settings.js?v=3";
import { gamesHtml } from "./games.js?v=6";
import { parseAnswers, answer as totAnswer, nextPair, matchWines } from "./thisorthat.js?v=1";
import { demoHtml, attachDemo, STEPS as DEMO_STEPS } from "./demo.js?v=3";
import { ratedWines, allProgress, mergeMemory, parseMemory, unratedMatches, cardFacts, matches as bingoMatches, cardById as bingoCard } from "./bingo.js?v=2";
import { recommendMix, recommend } from "./recommend.js?v=3";
import { ownerHtml, ownerTableHtml, wineRows, checkCounts, bingoCoverage, toggleSort, nextConfigValue } from "./owner.js?v=1";
import { createWineInfo } from "./wineinfo.js?v=13";

// The database library is delivered over the internet. It is pinned to one exact version, and if the first source is down the same version
// is tried from a second, independent one. The last resort is the newest 2.x from the first source.
const APP_VERSION = "33";   // shown to editors with each piece of feedback
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

const OWNER_START = { tab: "wines", q: "", issue: "all", sort: { wines: { key: "producer", dir: 1 }, bingo: { key: "tier", dir: 1 } }, lens: "confident", player: "me", seed: "", weights: {}, open: {}, msg: "", wineIds: null, config: null, configError: "" };
const TOT_KEY = "wine.thisorthat";   // the This or That picks (thisorthat.js): only on this phone
const GAMES_KEY = "wine.games";   // which bingo cards this phone has cleared (bingo.js)
const state = {
  owner: { ...OWNER_START },                       // the Owner page (owner.js)
  g: { screen: "hub", cardId: null, sq: null },   // the Games tab: which screen is open
  gamesMemory: parseMemory(store.get(GAMES_KEY)),
  totAnswers: parseAnswers(store.get(TOT_KEY)),
  settings: parseSettings(store.get(SETTINGS_KEY)),   // this phone's choices from the gear in the header (settings.js)
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
// The owner page is for the owner only (the gear in Settings offers it). The database still decides what anyone may change.
const isOwner = () => !!state.access && (state.access.label === "Owner" || state.access.role === "owner" || state.access.role === "admin");
// Where a wine's starting structure comes from: an editor's score first, then the structure rules. See structure.js.
const cardById = (id) => state.cards.find((c) => c.id === id) || null;
const startFor = (card) => startingValues(card, card && state.refs.get(card.id));
const startForEntry = (entry) => (entry.wine_vintage_id ? startFor(cardById(entry.wine_vintage_id)) : startingValues(entryAsCard(entry), null));
// What the palate uses as a baseline from the rules alone (the editor's own scores are added in profile.js).
const ruleBase = (wineVintageId, entry) => rulesFor(wineVintageId ? cardById(wineVintageId) : entryAsCard(entry));
const TITLES = { discover: "Discover", swipes: "Swipes", journal: "Journal", profile: "Profile", learn: "Learn", games: "Games", editor: "Editor", owner: "Owner" };

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
  const cards = [];
  for (const c of await db.loadCards(state.sb)) {
    try {
      c.catalogForm = wineEditForm({ style: c.style }, c, null);   // the catalog's own details, kept so a change can be compared and undone
      cards.push(addVineyard(patchCard(c, state.mine.get(c.id))));
    } catch (e) { console.warn("A wine could not be read and was left out:", e); }   // one bad row must not take the whole deck down
  }
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
  maybeShowDemo();
}
// The Discover deck: three decks (familiar, getting warmer, new territory) mixed by what the person knows and likes. See deck.js.
// ---------------------------------------------------------------- bottle photos on the cards
// The photo fades in once it has loaded. If it cannot be loaded, the drawn bottle is shown instead.
document.addEventListener("load", (ev) => { const t = ev.target; if (t && t.classList && t.classList.contains("winephoto")) t.classList.add("ready"); }, true);
document.addEventListener("error", (ev) => { const t = ev.target; if (t && t.classList && t.classList.contains("winephoto")) { const box = t.closest(".image"); if (box) box.classList.add("failed"); } }, true);
function settlePhotos() {   // a photo that was already loaded before the page was drawn
  document.querySelectorAll("img.winephoto").forEach((i) => { if (i.complete) { if (i.naturalWidth) i.classList.add("ready"); else { const b = i.closest(".image"); if (b) b.classList.add("failed"); } } });
}
// Discover cards do not show bottle photos, so nothing is fetched ahead of time. (photoCache is kept only because window.__wine exposes it.)
const photoCache = new Map();
function rebuildDeck() {
  const r = buildDeck({ cards: state.cards, states: state.states, journal: state.journal, quiz: state.quiz, refs: structureMap(state.cards, state.refs), crowd: state.crowd });
  state.deck = r.deck; state.deckInfo = r.info; state.deckMix = r.mix; state.sinceDeck = 0;
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
  return `<div class="top"><h1 class="serif" id="title"></h1><div class="topright"><span class="muted small">Early build</span><button class="gear" data-action="settings" aria-label="Settings">&#9881;</button></div></div>
    <div id="gbanner" class="banner gb" data-action="dismiss" hidden></div>
    <div class="content" id="content"><div id="tabbody"></div></div>
    <nav class="tabs">${tab("discover", "Discover")}${tab("swipes", "Swipes")}${tab("journal", "Journal")}${tab("profile", "Profile")}${tab("learn", "Learn")}${tab("games", "Games")}${editorLink}</nav>`;
}
function renderBody() {
  const body = $("#tabbody");
  if (!body) return;
  document.body.dataset.tab = state.tab;   // lets Discover use a slimmer header so the card is bigger
  try { drawTab(body); } catch (e) { setBanner("Could not draw this screen: " + (e.message || e)); }
}
// ---- the Owner page (owner.js). Tables are worked out from the catalog cards already loaded; saving goes through data.js.
function ownerData() {
  const O = state.owner;
  if (state._ownerFor !== state.cards) { state._ownerFor = state.cards; state._ownerCache = { rows: wineRows(state.cards), bingo: bingoCoverage(state.cards) }; }
  const { rows, bingo } = state._ownerCache;
  return { rows, bingo, checks: checkCounts(rows), config: O.config, configError: O.configError, seedNames: [], seedOk: true, lensRows: [], ...(O.tab === "lenses" ? ownerLens() : {}) };
}
// The lens preview: the top picks of one lens for the owner's own profile, or for a brand-new player, using the weights typed on the page.
function ownerLens() {
  const O = state.owner, me = O.player === "me", refs = structureMap(state.cards, state.refs);
  const journal = me ? state.journal : [], states = me ? state.states : [];
  const model = userModel({ cards: state.cards, states, journal, quiz: me ? state.quiz : null, refs });
  const seed = O.lens === "similar" ? state.cards.find((c) => wineName(c) === O.seed) || null : null;
  const out = { seedNames: O.lens === "similar" ? state.cards.filter((c) => !c.archived).map((c) => wineName(c)) : [], seedOk: O.lens !== "similar" || !!seed, lensRows: [] };
  if (!out.seedOk) return out;
  const exclude = me ? new Set(state.journal.filter((e) => e.verdict && e.wine_vintage_id).map((e) => e.wine_vintage_id)) : new Set();
  const picks = recommend({ lens: O.lens, cards: state.cards, model, refs, crowd: state.crowd, journal, states, seed, weights: O.weights, exclude, limit: 15 });
  out.lensRows = picks.map((p) => ({ name: wineName(p.card), style: p.card.style || "", grapes: [...(p.card.grapes || []), ...(p.card.ruleGrapes || [])].join(", "), place: p.card.appellation || p.card.region || p.card.country || "", score: p.score, reason: p.reason }));
  return out;
}
const ownerRedraw = () => { const el = $("#ownerTable"); if (el && state.tab === "owner") el.innerHTML = ownerTableHtml(state.owner, ownerData()); };
function ownerSay(text) { state.owner.msg = text; const el = $("#ownerMsg"); if (el) el.textContent = text; }
async function ownerWineId(vintageId) {
  if (!state.owner.wineIds) state.owner.wineIds = await db.loadVintageWines(state.sb);
  const id = state.owner.wineIds.get(vintageId);
  if (!id) throw new Error("That wine could not be found.");
  return id;
}
async function ownerCardsChanged() { state.cards = await loadAllCards(); rebuildDeck(); }
async function loadOwnerConfig() {
  try { state.owner.config = await db.loadAppConfig(state.sb); state.owner.configError = ""; }
  catch (e) { state.owner.configError = "Could not load the settings: " + (e.message || e); }
  if (state.tab === "owner" && state.owner.tab === "config") ownerRedraw();
}
async function ownerSaveReach(vintageId, value) {
  const card = cardById(vintageId);
  if (!card || value === "") { ownerRedraw(); return; }
  try { await db.saveWineReach(state.sb, await ownerWineId(vintageId), value); card.reach = Number(value); state._ownerFor = null; rebuildDeck(); ownerSay(`Saved: ${wineName(card)}, reach ${value}.`); }
  catch (e) { ownerSay("Could not save: " + (e.message || e)); }
  ownerRedraw();
}
async function ownerSavePrice(vintageId) {
  const card = cardById(vintageId), input = document.querySelector(`[data-owner-price="${CSS.escape(vintageId)}"]`);
  if (!card || !input) return;
  const cents = parsePrice(input.value);
  if (Number.isNaN(cents)) { ownerSay("Enter a price like 24.99 (or leave it empty to clear it)."); return; }
  try { await saveWinePrice(state.sb, await ownerWineId(vintageId), cents); await ownerCardsChanged(); ownerSay(`Saved: ${wineName(card)}, price ${cents === null ? "cleared" : "$" + (cents / 100).toFixed(2)}.`); }
  catch (e) { ownerSay("Could not save: " + (e.message || e)); }
  ownerRedraw();
}
async function ownerSaveConfig(key) {
  const O = state.owner, row = (O.config || []).find((r) => r.key === key), input = document.querySelector(`[data-owner-cfg="${CSS.escape(key)}"]`);
  if (!row || !input) return;
  const next = nextConfigValue(row.value, input.value);
  if (next === null) { ownerSay("Enter a number, 0 or more."); return; }
  try { await db.saveAppConfig(state.sb, key, next); row.value = next; ownerSay(`Saved: ${key}.`); }
  catch (e) { ownerSay("Could not save: " + (e.message || e)); }
  ownerRedraw();
}
// "Edit all" opens the full wine editor from the Editor tab (all fields, grapes, place, photo, price).
const ownerWineInfo = createWineInfo({
  sb: () => state.sb, userId: () => state.user.id, can, cards: () => state.cards, photoKind: () => "own_photography",
  onSaved: async () => { await ownerCardsChanged(); state._ownerFor = null; ownerRedraw(); },
  onDeleted: async () => { await ownerCardsChanged(); state._ownerFor = null; ownerRedraw(); },
  onPhotoSaved: async () => { await ownerCardsChanged(); state._ownerFor = null; ownerRedraw(); },
  onPublished: async () => { await ownerCardsChanged(); state._ownerFor = null; ownerRedraw(); },
});

// Wine Bingo is worked out from the journal each time the Games tab is drawn: only rated wines count (see bingo.js).
function gamesView() {
  const cardsById = new Map(state.cards.map((c) => [c.id, c]));
  const progress = allProgress(ratedWines(state.journal, cardsById, new Date(), state.photoUrls));
  const { memory, news } = mergeMemory(state.gamesMemory, progress);
  if (memory !== state.gamesMemory) { state.gamesMemory = memory; store.set(GAMES_KEY, JSON.stringify(memory)); }
  let help = null;
  const c = state.g.screen === "card" ? bingoCard(state.g.cardId) : null;
  if (c && Number.isInteger(state.g.sq) && !progress.get(c.id).done[state.g.sq]) help = squareHelp(c.squares[state.g.sq], cardsById);
  // The wines for the This or That results are only worked out on that screen.
  const tot = { answers: state.totAnswers, matches: [] };
  if (state.g.screen === "tot" && (state.g.totResults || !nextPair(state.totAnswers))) tot.matches = matchWines({ answers: state.totAnswers, cards: state.cards, structure: structureMap(state.cards, state.refs) });
  return gamesHtml(state.g, { progress, memory, news, help, tot });
}
// Help for an empty square: a wine already in the journal that only needs rating, or else a few wines that would fill it, each from a different angle
// (recommend.js lenses: a safe bet, something different, a stretch). Other games can call recommendMix() or recommend() with their own accept() and lenses.
function squareHelp(square, cardsById) {
  const unrated = unratedMatches(square.test, state.journal, cardsById);
  if (unrated.length) return { unrated, recs: [] };
  const refs = structureMap(state.cards, state.refs);
  const model = userModel({ cards: state.cards, states: state.states, journal: state.journal, quiz: state.quiz, refs });
  const leaveOut = new Set([...state.journal.filter((e) => e.verdict && e.wine_vintage_id).map((e) => e.wine_vintage_id), ...state.states.filter((x) => x.interest === "nope").map((x) => x.wine_vintage_id)]);
  const cold = model.swipeCount + model.journalCount < 5;   // too little history to say "your taste"
  return { unrated: [], cold, recs: recommendMix({ cards: state.cards, model, refs, crowd: state.crowd, journal: state.journal, states: state.states, exclude: leaveOut, accept: (c) => bingoMatches(square.test, cardFacts(c)), lenses: ["confident", "unique", "challenge"] }) };
}
function drawTab(body) {
  if (state.tab === "discover") {
    body.innerHTML = discoverHtml({ deck: state.deck, banner: null, counts: state.counts, feedback: state.feedback, flaggedId: state.wfDone, nudge: showNudge(), buttons: state.settings.buttons, mapHint: mapHintFor(state.deck[0]) });
    const card = $("#card");
    if (card) attachCard(card);
    settlePhotos();
  } else if (state.tab === "swipes") {
    body.innerHTML = swipesHtml(swipeLists(state.cards, state.states, state.journal), { ...state.sw, noFam: new Set(state.states.filter((x) => !x.familiarity).map((x) => x.wine_vintage_id)) }, state.photoUrls);
  } else if (state.tab === "owner") {
    body.innerHTML = isOwner() ? ownerHtml(state.owner, ownerData()) : `<p class="muted">The owner page is only for the owner.</p>`;
    if (isOwner() && state.owner.tab === "config" && !state.owner.config && !state.owner.configError) loadOwnerConfig();
  } else if (state.tab === "games") {
    body.innerHTML = gamesView();
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
const reduceMotion = () => state.settings.motion === "reduce" || !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
// Text size and motion are set on the page itself, so every screen follows them.
function applySettings() {
  document.documentElement.style.setProperty("--ts", String(textScale(state.settings)));
  document.documentElement.classList.toggle("reduce-motion", state.settings.motion === "reduce");
}
// ---------------------------------------------------------------- "How the card works" (demo.js): once for a brand-new player, any time from Settings
// Brand new = never seen it, no swipes and no journal entries yet (so a returning player on a new phone is not interrupted). Nothing is saved but the "seen" flag.
function drawDemo() { $("#overlay").innerHTML = demoHtml(state.demo); attachDemo($("#overlay"), state.demo); }
function openDemo() { state.demo = { step: 0, done: {}, note: "" }; drawDemo(); }
function closeDemo() { state.demo = null; store.set("wine.demoSeen", "1"); $("#overlay").innerHTML = ""; }
function maybeShowDemo() {
  if (store.get("wine.demoSeen")) return;
  const fresh = !(state.journal || []).length && !(state.states || []).length;
  if (fresh && state.tab === "discover") openDemo(); else store.set("wine.demoSeen", "1");
}
function openSettings() { $("#overlay").innerHTML = settingsHtml(state.settings, state.user, { owner: isOwner() }); }
function closeSettings() { $("#overlay").innerHTML = ""; }
const behindOf = (el) => (el && el.parentElement ? el.parentElement.querySelector(".behind") : null);
// The card underneath rises toward the front as the top card is pulled away.
function paintBehind(el, progress, ms = 0) {
  const b = behindOf(el); if (!b) return;
  b.style.transition = ms ? `transform ${ms}ms cubic-bezier(.2,.9,.3,1), opacity ${ms}ms` : "none";
  b.style.transform = `scale(${0.95 + 0.05 * progress}) translateY(${10 - 10 * progress}px)`;
  b.style.opacity = String(0.7 + 0.3 * progress);
}
// The card leaves the way it was thrown, at the speed it was thrown. A tap or a double-tap sends it with a gentler push.
// Both ways of leaving a card (a swipe, and "Not interested") end the same way: save it, take the card out of the deck, remember what it taught us straight away,
// re-rank the rest every 8 swipes (or when the deck runs low), then draw the next card, which settles forward from where the one underneath was.
async function finishCard(card, save, row, failure, extra) {
  try {
    await save();
    state.deck.shift();
    state.states = [...state.states.filter((x) => x.wine_vintage_id !== card.id), { wine_vintage_id: card.id, last_swiped_at: new Date().toISOString(), ...row }];
    if (++state.sinceDeck >= 8 || state.deck.length < 4) rebuildDeck();
    setBanner(null);
    if (extra) await extra();
  } catch (e) { setBanner(failure + (e.message || e)); }
  state.busy = false;   // always set again, whatever went wrong above, so the deck can never freeze
  if (state.tab !== "discover") return;
  renderBody();
  const nc = $("#card");
  if (nc && nc.animate && !reduceMotion()) nc.animate([{ transform: "scale(0.95) translateY(10px)", opacity: 0.85 }, { transform: "none", opacity: 1 }], { duration: 260, easing: "cubic-bezier(0.2, 0.9, 0.3, 1.15)" });
}

// The card leaves the way it was thrown, at the speed it was thrown. A tap or a double-tap sends it with a gentler push.
async function fly(el, kind, v = { dx: 0, dy: 0, vx: 0, vy: 0 }) {
  if (state.busy || !state.deck.length) return;
  state.busy = true;
  const card = state.deck[0];
  if (el) try {
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
  } catch (_) { /* the exit animation is only for show: the card is still saved and removed */ }
  // interest is implied: a wine the person swipes is a wine they are open to
  await finishCard(card, () => db.recordSwipe(state.sb, card.id, kind, "try"), { familiarity: kind, interest: "try" }, "Could not save that swipe: ", async () => { state.counts = await loadCounts(); });
}

// "Not interested": the button turns on for this one wine and the wine is filed under Not interested in Swipes straight away.
// It records that interest only (no "I recognize it" or "don't know it" is claimed), so it says nothing about what the person knows.
async function notInterested() {
  if (state.busy || !state.deck.length) return;
  state.busy = true;
  const card = state.deck[0], el = $("#card"), btn = document.querySelector("[data-action='notint']");
  if (btn) { btn.classList.add("on"); btn.setAttribute("aria-pressed", "true"); }
  if (el) try {
    el.classList.remove("dragging"); el.classList.add("leaving");
    paintBehind(el, 1, 260);
    if (el.animate && !reduceMotion()) {
      const anim = el.animate([{ transform: "translate3d(0px, 0px, 0)", opacity: 1 }, { transform: `translate3d(0px, ${window.innerHeight * 0.9}px, 0) rotate(4deg)`, opacity: 0.2 }],
        { duration: 280, easing: "cubic-bezier(0.4, 0, 0.8, 0.6)", fill: "forwards" });
      try { await anim.finished; } catch (_) {}
    } else await sleep(120);
  } catch (_) { /* the exit animation is only for show: the card is still saved and removed */ }
  await finishCard(card, () => db.changeInterest(state.sb, state.user.id, card.id, "nope"), { familiarity: null, interest: "nope" }, "Could not save that: ");
}

// The double-tap zones: a narrow strip down each side (left = don't know it, right = recognize it) and a thin strip across the top (had it).
// Everything in the middle of the card is not a zone, so a double-tap there does nothing. These are fractions of the card's width and height.
const EDGE_SIDE = 0.14, EDGE_TOP = 0.09;
const edgeOf = (fx, fy) => (fy < EDGE_TOP ? "had" : fx < EDGE_SIDE ? "unknown" : fx > 1 - EDGE_SIDE ? "recognize" : null);
// The wine's name is a link to a Google image search. A finger on the card is captured by the card, so the browser would not follow the link by itself:
// the card opens it when a tap lands on it (once, even if the tap was a double-tap).
let lastImageOpen = 0;
function openImages(url) {
  if (!url || Date.now() - lastImageOpen < 900) return;
  lastImageOpen = Date.now();
  try { window.open(url, "_blank", "noopener,noreferrer"); } catch (_) { /* a blocked pop-up: nothing else to do */ }
}
// ---- zoom
// Two fingers on the card pinch it larger (up to 4 times), a double-tap on the middle zooms in or back out, and the Zoom button does the same
// for anyone who cannot pinch. While the card is zoomed, one finger moves the picture around and swiping is paused, so a pan can never
// answer a wine by accident. The Reset zoom chip (or another double-tap) puts it back. The card's words, flavors and map are what zoom.
const ZOOM_MAX = 4, ZOOM_TAP = 2.2, ZOOMED = 1.02;
const clampTo = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function attachCard(el) {
  // Forgiving double-tap: fingers may wobble a little, and the second tap can be slower or a bit off.
  const TAP_MOVE = 18, DOUBLE_TAP_MS = 500, TAP_APART = 70;
  let start = null, dx = 0, dy = 0, lastTap = null, hintTimer = null, samples = [];
  const swipeOn = () => state.settings.swipe;
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

  // zoom state: the picture is scaled s times, from its top-left corner, then moved by (tx, ty)
  const body = el.querySelector(".body"), chip = el.querySelector("[data-zreset]");
  const z = { s: 1, tx: 0, ty: 0 };
  const pts = new Map();               // the fingers on the card now, by pointer id
  let pinch = null, pan = null;
  const zoomed = () => z.s > ZOOMED;
  const fit = () => { const W = el.clientWidth, H = el.clientHeight; z.tx = clampTo(z.tx, W - z.s * W, 0); z.ty = clampTo(z.ty, H - z.s * H, 0); };
  const paintZoom = (animate) => {
    if (!body) return;
    body.style.transformOrigin = "0 0";
    body.style.transition = animate && !reduceMotion() ? "transform 180ms ease-out" : "none";
    body.style.transform = z.s === 1 && !z.tx && !z.ty ? "" : `translate(${z.tx}px, ${z.ty}px) scale(${z.s})`;
    if (chip) chip.hidden = !zoomed();
    el.classList.toggle("zoomed", zoomed());
  };
  // Zoom to scale s keeping the point (fx, fy) of the card where it is under the finger.
  const zoomAt = (s, fx, fy, animate) => {
    const s1 = clampTo(s, 1, ZOOM_MAX), k = s1 / z.s;
    z.tx = fx - (fx - z.tx) * k; z.ty = fy - (fy - z.ty) * k; z.s = s1;
    if (s1 <= ZOOMED) { z.s = 1; z.tx = 0; z.ty = 0; } else fit();
    paintZoom(animate);
  };
  const resetZoom = (animate = true) => { z.s = 1; z.tx = 0; z.ty = 0; paintZoom(animate); };
  const toggleZoom = (fx, fy) => {
    const r = el.getBoundingClientRect();
    if (zoomed()) resetZoom(); else zoomAt(ZOOM_TAP, fx == null ? r.width / 2 : fx, fy == null ? r.height / 2 : fy, true);
  };
  el.__resetZoom = resetZoom;          // the answer buttons use these, through the card
  el.__toggleZoom = () => { clearHint(); toggleZoom(); };
  const local = (p) => { const r = el.getBoundingClientRect(); return { x: p.x - r.left, y: p.y - r.top }; };
  const two = () => { const [a, b] = [...pts.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, m: local({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }) }; };

  // A tap that barely moved (on a swipe, or on a zoomed card that was not dragged).
  function tap(e, from) {
    // A tap on the map is only ever a tap on the map: it never counts toward a double-tap, whatever part of the card it is on.
    // The overlay opens a moment after the finger lifts, so the click that follows the tap lands on the card and not on the overlay.
    const hit = document.elementFromPoint(e.clientX, e.clientY), mapEl = hit && hit.closest("[data-zoom]"), nameEl = hit && hit.closest("a[data-wimg]");
    if (hit && hit.closest("[data-zreset]")) { lastTap = null; resetZoom(); return; }
    if (mapEl) { lastTap = null; clearHint(); const id = mapEl.dataset.zoom; setTimeout(() => openZoom(id), 60); return; }
    if (nameEl) { lastTap = null; clearHint(); openImages(nameEl.href); return; }
    const now = Date.now();
    const r = el.getBoundingClientRect();
    const edge = swipeOn() && !zoomed() ? edgeOf((from.x - r.left) / r.width, (from.y - r.top) / r.height) : null;
    const prev = lastTap;
    if (prev && now - prev.t < DOUBLE_TAP_MS && Math.hypot(from.x - prev.x, from.y - prev.y) < TAP_APART) {
      lastTap = null; clearHint();                                             // second tap: a double-tap
      const kind2 = edge || prev.edge;                                         // if the second tap drifted inward, use the first tap's zone
      if (kind2 && !zoomed()) { label(kind2).style.opacity = 1; fly(el, kind2); }
      else toggleZoom(from.x - r.left, from.y - r.top);                        // not on an edge: zoom in, or back out
    } else {
      lastTap = { t: now, x: from.x, y: from.y, edge }; showHint(edge);
    }
  }

  el.addEventListener("pointerdown", (e) => {
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { el.setPointerCapture(e.pointerId); } catch (_) {}
    if (pts.size === 2) {                                   // a second finger: pinch, and give up any swipe that had begun
      if (start) { start = null; settle(); }
      pan = null; lastTap = null; clearHint();
      const t = two(); pinch = { d0: t.d, s0: z.s, m0: t.m, tx0: z.tx, ty0: z.ty };
      return;
    }
    if (pts.size > 2 || state.busy) return;
    if (zoomed()) { pan = { x: e.clientX, y: e.clientY, tx: z.tx, ty: z.ty, moved: false }; return; }   // zoomed: one finger moves the picture
    start = { x: e.clientX, y: e.clientY }; dx = dy = 0; samples = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
    el.style.transition = "none"; if (swipeOn()) el.classList.add("dragging");
  });
  el.addEventListener("pointermove", (e) => {
    if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pts.size >= 2) {
      const t = two(), s1 = clampTo(pinch.s0 * t.d / pinch.d0, 1, ZOOM_MAX);
      const k = s1 / pinch.s0;                              // keep the point that was between the fingers under them, even as they drift
      z.s = s1; z.tx = t.m.x - (pinch.m0.x - pinch.tx0) * k; z.ty = t.m.y - (pinch.m0.y - pinch.ty0) * k; fit(); paintZoom(false);
      return;
    }
    if (pan && pts.size === 1) {
      const mx = e.clientX - pan.x, my = e.clientY - pan.y;
      if (Math.hypot(mx, my) > TAP_MOVE) pan.moved = true;
      if (pan.moved) { z.tx = pan.tx + mx; z.ty = pan.ty + my; fit(); paintZoom(false); }
      return;
    }
    if (!start) return;
    dx = e.clientX - start.x; dy = e.clientY - start.y;
    if (!swipeOn()) return;                                 // swiping is off in Settings: the card stays put (a tap still works)
    samples.push({ x: e.clientX, y: e.clientY, t: performance.now() }); if (samples.length > 8) samples.shift();
    const pose = dragPose(dx, dy);
    el.style.transform = pose.transform;
    paintBehind(el, pose.progress);
    paint();
  });
  el.addEventListener("pointerup", (e) => {
    pts.delete(e.pointerId);
    if (pinch) {                                            // the pinch ends when a finger lifts; the other finger does nothing until it lifts too
      if (pts.size < 2) { pinch = null; start = null; pan = null; if (!zoomed()) resetZoom(false); else paintZoom(false); }
      return;
    }
    if (pan) {
      const p = pan; pan = null;
      if (!p.moved) tap(e, { x: p.x, y: p.y });
      return;
    }
    if (!start) return;
    const from = start; start = null;
    const { vx, vy } = releaseVelocity(samples);
    const kind = swipeOn() ? decideSwipe(dx, dy, vx, vy) : null;
    if (kind) { fly(el, kind, { dx, dy, vx, vy }); return; }
    settle();
    if (Math.hypot(e.clientX - from.x, e.clientY - from.y) < TAP_MOVE) tap(e, from);   // a tap that barely moved
  });
  el.addEventListener("pointercancel", (e) => { pts.delete(e.pointerId); pinch = null; pan = null; start = null; settle(); });
  // If a browser does deliver the click to the link itself, the tap was already handled above: do not open it twice. (A keyboard click, detail 0, follows the link normally.)
  el.addEventListener("click", (ev) => {
    const a = ev.target.closest && ev.target.closest("a[data-wimg]"); if (a && ev.detail !== 0) ev.preventDefault();
    if (ev.detail === 0 && ev.target.closest && ev.target.closest("[data-zreset]")) resetZoom();
  });
}
// The map's zoom icon pulses a little on the first few cards a new player sees, so they notice it can be tapped. (Nothing pulses for reduced motion.)
function mapHintFor(card) {
  if (!card) return false;
  if (state.mapHintId === card.id) return true;
  const n = Number(store.get("wine.mapHint") || 0);
  if (n >= 3) return false;
  store.set("wine.mapHint", String(n + 1)); state.mapHintId = card.id;
  return true;
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
const STEP_TITLES = ["Your take", "How it tasted", "", "Details", "Notes and photos"];
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
  checkGrapeInputs("wef"); syncGrapePlace("wef"); w.form.grape = expandBlends(w.form.grape);   // GSM -> its three grapes
  const problem = validateWineEdit(w.form);
  if (problem) { w.error = problem; const e = document.getElementById("winfoErr"); if (e) e.textContent = problem; return; }
  if (w.mode === "mine") return saveMyWineEdit();
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
  const html = zoomHtml(plan, visualFor(card).type, 0);   // built first: if drawing fails, nothing is left half open
  state.zoom = { plan, step: 0, at: performance.now() };
  $("#zoom").innerHTML = html;
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
// The questions (feel.js): "Did the wine taste as expected?", what stood out and how much, and alone or with food. Answering opens more options, so the
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
    else if (action === "answer") {   // the same as swiping that way
      const el = $("#card");
      if (el) { if (el.__resetZoom) el.__resetZoom(false); const l = el.querySelector(`[data-label="${a}"]`); if (l) l.style.opacity = 1; }
      fly(el, a);
    }
    else if (action === "zoomcard") { const el = $("#card"); if (el && el.__toggleZoom) el.__toggleZoom(); }
    else if (action === "game") {     // game:hub, game:bingo, game:card:ID, game:sq:N, game:tot, game:pick:a|b, game:skip, game:totresults, game:totagain
      if (a === "hub") state.g = { screen: "hub", cardId: null, sq: null };
      else if (a === "bingo") state.g = { screen: "bingo", cardId: null, sq: null };
      else if (a === "card") state.g = { screen: "card", cardId: b, sq: null };
      else if (a === "sq") state.g = { ...state.g, sq: Number(b) };
      else if (a === "tot") state.g = { screen: "tot", cardId: null, sq: null, totResults: false };
      else if (a === "pick" || a === "skip") {   // This or That: the answer goes to the next question that has none yet
        const left = nextPair(state.totAnswers);
        if (left) { state.totAnswers = totAnswer(state.totAnswers, left.id, a === "skip" ? "skip" : b); store.set(TOT_KEY, JSON.stringify(state.totAnswers)); }
      }
      else if (a === "totresults") state.g = { ...state.g, totResults: true };
      else if (a === "totagain") { state.totAnswers = {}; store.set(TOT_KEY, "{}"); state.g = { screen: "tot", cardId: null, sq: null, totResults: false }; }
      renderBody();
      if (a === "sq") {                 // the details sit under the grid: bring them into view
        const d = document.querySelector(".bdetail");
        if (d && d.scrollIntoView) d.scrollIntoView({ block: "nearest", behavior: reduceMotion() ? "auto" : "smooth" });
      } else { const c = $("#content"); if (c) c.scrollTop = 0; }
    }
    else if (action === "owner" && isOwner()) {   // owner:open, owner:tab:ID, owner:sort:KEY, owner:toggle:ID, owner:filter:ISSUE, owner:resetw, owner:edit:ID, owner:saveprice:ID, owner:savecfg:KEY
      const O = state.owner;
      if (a === "open") { closeSettings(); state.tab = "owner"; O.msg = ""; render(); }
      else if (a === "tab") { O.tab = b; O.q = ""; O.msg = ""; renderBody(); }
      else if (a === "sort") { O.sort[O.tab] = toggleSort(O.sort[O.tab], b); ownerRedraw(); }
      else if (a === "toggle") { O.open[b] = !O.open[b]; ownerRedraw(); }
      else if (a === "filter") { O.tab = "wines"; O.issue = b; O.q = ""; renderBody(); }
      else if (a === "resetw") { O.weights = {}; renderBody(); }
      else if (a === "edit") { const card = cardById(b); if (card) await ownerWineInfo.open(card, ""); }
      else if (a === "saveprice") await ownerSavePrice(b);
      else if (a === "savecfg") await ownerSaveConfig(b);
    }
    else if (action === "settings") openSettings();
    else if (action === "setclose") closeSettings();
    else if (action === "demo") {     // demo:open, demo:next, demo:back, demo:close
      if (a === "open") openDemo();
      else if (a === "close") closeDemo();
      else if (state.demo) { state.demo.step = Math.max(0, Math.min(DEMO_STEPS.length - 1, state.demo.step + (a === "next" ? 1 : -1))); state.demo.note = ""; drawDemo(); }
    }
    else if (action === "set") {      // set:text:large, set:swipe:off, ...
      state.settings = changeSetting(state.settings, a, b);
      store.set(SETTINGS_KEY, JSON.stringify(state.settings));
      applySettings(); openSettings();
      if (state.tab === "discover") renderBody();   // the buttons under the card may have appeared or gone
    }
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
      if (a === "swipes" || a === "journal" || a === "profile" || a === "games") await refreshData();
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

// Once the app is running, a failure that no try block caught (a rejected promise, a script error) shows in the banner instead of failing silently.
const report = (m) => { if (state.status === "main") setBanner("Something went wrong: " + m + ". If it keeps happening, tap Send feedback in Profile."); };
window.addEventListener("unhandledrejection", (e) => report((e.reason && e.reason.message) || e.reason));
window.addEventListener("error", (e) => { if (e.filename && e.filename.indexOf(location.origin) === 0) report(e.message); });
// Owner page controls: typing searches the table, changing a box redraws it (or saves, for a wine's reach).
document.addEventListener("input", (ev) => {
  const t = ev.target;
  if (!t || !t.dataset || state.tab !== "owner") return;
  if ("ownerQ" in t.dataset) { state.owner.q = t.value; ownerRedraw(); }
  else if ("ownerSeed" in t.dataset) { state.owner.seed = t.value; ownerRedraw(); }
});
document.addEventListener("change", async (ev) => {
  const t = ev.target;
  if (!t || !t.dataset || state.tab !== "owner" || !isOwner()) return;
  const O = state.owner;
  if ("ownerIssue" in t.dataset) { O.issue = t.value; ownerRedraw(); }
  else if ("ownerLens" in t.dataset) { O.lens = t.value; renderBody(); }
  else if ("ownerPlayer" in t.dataset) { O.player = t.value; ownerRedraw(); }
  else if ("ownerW" in t.dataset) { const [lens, key] = t.dataset.ownerW.split(":"); O.weights = { ...O.weights, [lens]: { ...(O.weights[lens] || {}), [key]: t.value } }; ownerRedraw(); }
  else if ("ownerReach" in t.dataset) await ownerSaveReach(t.dataset.ownerReach, t.value);
});
applySettings();
window.__wine = { state, fly, render, init, learn, rebuildDeck, photoCache, profile: profileTab, editor: editorTab, account, feedback };
init();

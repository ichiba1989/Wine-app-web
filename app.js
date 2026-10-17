// The wine app for a phone browser. State, screens and events live here.
// Rules are in logic.js, database calls in data.js, and HTML in views.js.
// The two Supabase values come from config.js. If that file is missing or still has placeholders, the page asks for them and remembers them in this browser.
import {
  wineName, esc, clamp01, filterEntries, groupEntries, swipeLists,
  sheetForCard, sheetForEntry, sheetForOutside, setDim, nudgeDim, resetDim, validateOutside, DIMS, entryIncomplete, styleLabel,
  queuePhoto, unqueuePhoto, toggleExistingPhoto, refsByVintage, feedbackOn, WINE_FLAG_REASONS, isChoice, setStyle,
  dragPose, releaseVelocity, decideSwipe, flyPlan, wineEditForm, planWineEdit, validateWineEdit, retargetSheet } from "./logic.js?v=21";
import * as db from "./data.js?v=51";
import { sheetPhotosHtml, applyShareChanges } from "./sharing.js?v=26";
import { startingValues, structureMap, entryAsCard, rulesFor, applyDefaults } from "./structure.js?v=12";
import { shrinkImage } from "./photos.js?v=5";
import {
  visualFor, discoverHtml, swipesHtml, swipesListHtml, journalShellHtml, journalMetaHtml, journalListHtml, quickNoteHtml, speakLangHtml, blindHtml, sheetHtml, addFormHtml, formPhotosHtml, wineFlagHtml, confirmHtml, footState, wineEditHtml, structurePageHtml, characterPageHtml, SHEET_PAGES, syncChoiceControl } from "./views.js?v=45";
import { createLearn } from "./learn.js?v=17";
import { setMode } from "./words.js?v=1";
import { journalCsv, exportName } from "./exportcsv.js?v=8";
import { newBlind, cleanPending, hasGuess, scoreGuess, summarize, resultLine, notesAfterReveal, actualOfCard, actualOfForm } from "./blind.js?v=3";
import { composeNote, stampOf, noteProblem } from "./notes.js?v=1";
import { createDictation, dictationSupported } from "./dictation.js?v=5";
import { SW_START, defaultSortFor } from "./swipetabs.js?v=7";
import { gapWeights } from "./tags.js?v=5";
import { wireGrapeInputs, checkGrapeInput, setExtraGrapes, GRAPES, addGrapeShortcuts } from "./grapes.js?v=3";
import { buildVocab, fixTerms } from "./termfix.js?v=3";
import { WINE_TERMS, setSpeechLang, speechCodeOf } from "./winewords.js?v=1";
import { expandBlends, BLEND_NAMES, joinGrapeParts, joinPlace } from "./blends.js?v=3";
import { addGrapeSynonyms } from "./rules.js?v=6";
import { setPlaceLists } from "./geo.js?v=9";
import { setNameAliases } from "./text.js?v=3";
import { loadPrices, applyPrices, tidyFacts, parsePrice, saveWinePrice } from "./pricing.js?v=4";
import { applyTaste, cleanTaste, feelBlockHtml, tastePageHtml, tasteInnerHtml, changeFrom, saveTaste, loadTaste } from "./feel.js?v=17";
import { zoomHtml, nextStep, applyStep, zoomPlan } from "./zoommap.js?v=13";
import { applyVisualTables } from "./visualdata.js?v=4";
import { diffForm, patchCard, patchEntry, loadMyInfo, saveMyInfo } from "./mywine.js?v=11";
import { consentHtml, needsConsent, acceptConsents, allAccepted, toggleConsent } from "./consent.js?v=16";
import { infoLine, entryInfoLine } from "./wineline.js?v=4";
import { FEATURE as PRO_FEATURE, proBlockHtml, gridHtml, syncGridDom, pickValue, tapTag, openFromGrid, cleanGrid, gridToDims, loadTasting, saveTasting, paintNoteMarks, teachHtml, autoCount } from "./tasting.js?v=16";
import { gridFromNotes, mergeFromNotes, touched, legendEntry, compileWith } from "./notegrid.js?v=9";
import { buildDeck, userModel, prefOf, gapsOf } from "./deck.js?v=10";
import { createProfile } from "./profile.js?v=30";
import { createAccount, readPendingMerge, clearPendingMerge, mergeMessage } from "./account.js?v=19";
import { createFeedback } from "./feedback.js?v=13";
import { createEditor } from "./editor.js?v=57";
import { SETTINGS_KEY, parseSettings, changeSetting, textScale, settingsHtml } from "./settings.js?v=16";
import { gamesHtml } from "./games.js?v=23";
import { setSwipeConfig, reactionOf, LEGACY_OF, skipsOf } from "./reactions.js?v=3";
import { parseAnswers, answer as totAnswer, nextPair, matchWines, answerRow } from "./thisorthat.js?v=4";
import { ratedWines, allProgress, mergeMemory, parseMemory, unratedMatches, cardFacts, matches as bingoMatches, cardById as bingoCard } from "./bingo.js?v=5";
import * as GG from "./blindgame.js?v=10";
import { createVenueReview } from "./venuereview.js?v=30";
import { VENUE, venueCardsOf, readList, recheck as venueRecheck, listIds, linkMap, siteUrl } from "./venue.js?v=22";
import { recommendMix, recommend } from "./recommend.js?v=13";
import { createOffline, createIdbStore, makeThumb } from "./offline.js?v=3";
import { accessOf, PLANS, planIdOf, checkAssignment } from "./access.js?v=4";
import { setOffline, setCardLookup } from "./overlay.js?v=1";
// owner.js and demo.js are loaded when first needed (the Owner page; the first-time walkthrough), so everyone else does not download them at start.
let OWN = null, DEMO = null, IMP = null;
const loadOwnerModule = async () => (OWN = OWN || await import("./owner.js?v=40"));
const loadImportModule = async () => (IMP = IMP || await import("./importer.js?v=13"));
const loadDemoModule = async () => (DEMO = DEMO || await import("./demo.js?v=17"));
import { createWineInfo } from "./wineinfo.js?v=38";

// The database library is delivered over the internet. It is pinned to one exact version, and if the first source is down the same version
// is tried from a second, independent one. The last resort is the newest 2.x from the first source.
const APP_VERSION = "34";   // shown to editors with each piece of feedback
const SUPABASE_JS_VERSION = "2.109.0";
const LIBRARY_URLS = [
  "./vendor/supabase.js?v=1",   // the copy kept in this repository: the only one that works with no signal; the internet sources are the fallback
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
// Working offline (offline.js): a copy of what was read, a queue of changes made without a connection, and the sync that uploads them.
const offline = createOffline({ store: createIdbStore() });
setOffline(offline);
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

const OWNER_START = { tab: "wines", q: "", issue: "all", sort: { wines: { key: "producer", dir: 1 }, bingo: { key: "tier", dir: 1 } }, lens: "confident", player: "me", seed: "", weights: {}, open: {}, msg: "", wineIds: null, config: null, configError: "", tags: null, tagsError: "", legend: null, legendError: "", sel: null, tagFilter: "all", wineTags: undefined, wineTagsError: "" };
const TOT_KEY = "wine.thisorthat";   // the This or That picks (thisorthat.js): only on this phone
const GAMES_KEY = "wine.games";   // which bingo cards this phone has cleared (bingo.js)
const GUESS_KEY = "wine.guess";   // Guess the Glass: the best score of each mode (blindgame.js), only on this phone
const state = {
  owner: { ...OWNER_START },                       // the Owner page (owner.js)
  venue: { list: null, error: "", missing: false, preview: null, paste: "", q: "" },   // the venue's list (venue.js); null until it has loaded
  g: { screen: "hub", cardId: null, sq: null },   // the Games tab: which screen is open
  gamesMemory: parseMemory(store.get(GAMES_KEY)),
  totAnswers: parseAnswers(store.get(TOT_KEY)), totTaste: null,
  // Guess the Glass: the round being played, and what its follow-ups showed (kept so they do not change while the player reads them)
  guess: { memory: GG.parseMemory(store.get(GUESS_KEY)), level: "easy", play: null, message: "", lq: {}, lqChoices: {}, lqFor: {}, winesFor: {}, topicList: [] },
  settings: parseSettings(store.get(SETTINGS_KEY)),   // this phone's choices from the gear in the header (settings.js)
  status: "loading",            // loading | setup | error | age | main
  error: null, banner: null, tab: "discover", underage: false,
  user: null, profile: null, sb: null,
  cards: [], deck: [], busy: false, counts: { swipes: 0, journal: 0 },
  states: [], journal: [],
  sw: { ...SW_START, open: {} },
  j: { q: "", by: "verdict", verdict: "all", open: {}, limits: {} },
  sheet: null, sheetUi: { saving: false, error: "" },
  form: null,
  blind: null,                                     // the blind tasting sheet (blind.js)
  legend: { shared: [], mine: [], dbMine: false, loaded: false, compiled: null },   // the note legend (notegrid.js): shared lines and the player's own
  teach: null,                                     // the "what did you mean by this word" form in the open grid
  wf: null,                                        // wine words fixed in the last dictation (termfix.js), for the undo chips
  qn: null,                                        // the quick-note sheet (voice or typed notes in the journal)
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
// All of "who may do what" is worked out in access.js (docs/ROLES_AND_ACCESS.md); the database still decides what anyone may actually change.
const access = () => accessOf({ user: state.user, profile: state.profile, staff: state.access, features: { proTasting: state.pro, contentFeedback: state.feedback }, settings: state.settings });
const can = (permission) => access().can(permission);
const isEditor = () => access().isEditor;
const isOwner = () => access().isOwner;   // the Owner page (the gear in Settings offers it)
// Where a wine's starting structure comes from: an editor's score first, then the structure rules. See structure.js.
const cardById = (id) => state.cards.find((c) => c.id === id) || null;
const startFor = (card) => startingValues(card, card && state.refs.get(card.id));
const startForEntry = (entry) => (entry.wine_vintage_id ? startFor(cardById(entry.wine_vintage_id)) : startingValues(entryAsCard(entry), null));
// What the palate uses as a baseline from the rules alone (the editor's own scores are added in profile.js).
const ruleBase = (wineVintageId, entry) => rulesFor(wineVintageId ? cardById(wineVintageId) : entryAsCard(entry));
// The venue version (venue.js): Discover carries the venue's full name; the other tabs keep their names.
const TITLES = { discover: VENUE.name, swipes: "Swipes", journal: "Journal", profile: "Profile", learn: "Learn", games: "Games", editor: "Editor", owner: "Owner" };

// The Learn tab lives in learn.js. It saves quiz answers itself and reports save problems through the banner.
const learn = createLearn({ gapWeights: () => gapWeights(gapsOf(userModel({ cards: state.cards, states: state.states, journal: state.journal, quiz: state.quiz, refs: structureMap(state.cards, state.refs) }))), sb: () => state.sb, user: () => state.user, profile: () => state.profile, onError: (m) => setBanner(m) });
// The Profile tab lives in profile.js. It reads the journal and swipes the app already loaded.
const profileTab = createProfile({ fresh: () => state.refreshing || Promise.resolve(), ruleBase: (vid, entry) => ruleBase(vid, entry), sb: () => state.sb, userId: () => state.user.id, user: () => state.user, journal: () => state.journal, states: () => state.states, cards: () => state.cards });
// Email accounts live in account.js: a guest can attach an email, or sign in to an account they already have.
// Signing in or out reloads the page so everything starts clean for the right person.
const account = createAccount({
  sb: () => state.sb, user: () => state.user,
  setUser: (u) => { state.user = u; },
  canSave: () => state.status === "main",
  prepareMerge: () => db.prepareGuestMerge(state.sb),
  deleteAccount: () => db.deleteMyAccount(state.sb),
  reload: () => location.replace(location.pathname + location.search),
  clearOffline: () => offline.clearAll(),   // sign-out and deleting the account also remove the copy kept for working offline
  waiting: () => offline.status().pending,
  onClose: () => { if (state.status === "main") render(); },
});
// Feedback from testers lives in feedback.js. Editors read it in the Editor tab.
const feedback = createFeedback({ sb: () => state.sb, user: () => state.user, screen: () => state.tab, version: () => APP_VERSION });
// A gentle reminder for guests who have started building a journal, shown on Discover until they save it or say "not now".
const showNudge = () => access().isGuest && !store.get("wine.nudgeOff") && (state.journal.length >= 1 || state.states.length >= 5);
// The Editor tab (editors only) lives in editor.js.
// The Editor tab's venue section (venuereview.js): the venue's wines that are not in our catalog yet, reviewed and added one at a time.
const venueReview = createVenueReview({
  sb: () => state.sb, userId: () => state.user.id, list: () => state.venue.list, listError: () => state.venue.error, owner: () => isOwner(),
  onChanged: async () => { state.cards = await loadAllCards(); await loadVenue(); rebuildDeck(); },
});
const editorTab = createEditor({ venue: venueReview, sb: () => state.sb, userId: () => state.user.id, cards: () => state.cards, can, roleLabel: () => (state.access && state.access.label) || "", onSaved: () => loadReferences(), onWineChanged: async () => { state.cards = await loadAllCards(); rebuildDeck(); } });   // a deleted, archived, published or edited wine changes the Discover deck too

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
// Reads that do not depend on who is signed in (the catalog, the flavor tables, the references) are started as soon as the database client exists, so they run
// while sign-in and the profile load instead of after them. state.early holds the pending requests; once() uses one if it is there (and asks again if it failed).
const keepQuiet = (p) => { p.catch(() => {}); return p; };
function startEarlyLoads() {
  state.earlyCards = cardStream();   // the catalog, piece by piece (see loadAllCards)
  state.early = { visual: keepQuiet(applyVisualTables(state.sb)), vintages: keepQuiet(db.loadVintageWines(state.sb)), refs: keepQuiet(db.loadReferenceRows(state.sb)), lists: keepQuiet(db.loadReferenceLists(state.sb)) };
}
const once = (key, fn) => {
  const p = state.early && state.early[key];
  if (!p) return fn();
  delete state.early[key];
  return p.catch(() => fn());
};
// ---------------------------------------------------------------- the catalog, in steps (owner, 2026-10-17)
// The catalog arrives in pieces, small ones first (data.js loadCards), so Discover can show its first card as soon as the first piece is in.
// A stream starts reading at once and keeps every piece, so a listener that comes later is handed the pieces it missed first.
function cardStream() {
  const pieces = [], subs = new Set();
  const finished = db.loadCards(state.sb, { onPiece: (cards) => { pieces.push(cards); subs.forEach((f) => f(cards)); } });
  finished.catch(() => {});   // the listener sees the failure through finished
  return { finished, listen(f) { pieces.forEach(f); subs.add(f); } };
}
const takeCardStream = () => { const s = state.earlyCards; state.earlyCards = null; return s || cardStream(); };
// The catalog as cards. Small things every card needs come first and together: the flavor tables, the player's private wine changes, prices,
// the reference lists and the sweetness terms. Then each piece of the catalog is made into cards as it arrives and onCards(all cards so far, { saved })
// is told. A phone that has the whole catalog saved (offline.js) shows that copy at once ({ saved: true }) and the fresh pieces replace it as they
// come. Resolves with the fresh catalog only, so a wine taken out since the copy was saved is gone at the end.
async function loadAllCards(onCards = null) {
  const extrasP = Promise.all([
    once("visual", () => applyVisualTables(state.sb)),   // flavor weights and place nudges the Owner or an editor tuned in the database (the built-in set is used if there are none)
    loadMyInfo(state.sb).catch(() => new Map()),          // before database update 24 nobody has private changes
    loadPrices(state.sb).then((p) => ({ p }), () => null),
    once("lists", () => db.loadReferenceLists(state.sb)).catch(() => null),   // grape and producer aliases, designation rules, broad regions (built-in lists if none)
    db.loadDosages(state.sb).catch(() => null),            // sweetness terms, until the catalog view carries them itself (docs/catalog_speed.sql)
  ]).then(([, mine, prices, lists, dosages]) => { applyReferenceLists(lists); state.mine = mine; return { prices, dosages }; });
  state.mineReady = extrasP;   // the journal is patched with the player's private changes once they are in (refreshData)
  const stream = takeCardStream();   // started before anything is awaited, so the first piece is on its way
  const make = (raw, ex) => {
    const out = [];
    for (const c of raw) {
      try {
        if (!c.dosage && ex.dosages) { const d = ex.dosages.get(c.id); if (d) c.dosage = d; }
        c.catalogForm = wineEditForm({ style: c.style }, c, null);   // the catalog's own details, kept so a change can be compared and undone
        const card = addVineyard(patchCard(c, state.mine.get(c.id)));
        try { if (!ex.prices) throw new Error("no prices"); applyPrices([card], ex.prices.p); } catch (_) { tidyFacts(card); }
        out.push(card);
      } catch (e) { console.warn("A wine could not be read and was left out:", e); }   // one bad row must not take the whole deck down
    }
    return out;
  };
  const shown = new Map(), fresh = new Map();
  if (onCards) {
    const saved = await db.loadCards(state.sb, { saved: true }).catch(() => null);
    if (saved && saved.length) { const ex = await extrasP; make(saved, ex).forEach((c) => shown.set(c.id, c)); onCards([...shown.values()], { saved: true }); }
  }
  let chain = Promise.resolve();
  const piece = (raw) => { chain = chain.then(async () => {
    const ex = await extrasP;
    make(raw, ex).forEach((c) => { fresh.set(c.id, c); shown.set(c.id, c); });
    if (onCards) onCards([...shown.values()], { saved: false });
  }); };
  stream.listen(piece);
  try { await stream.finished; }
  catch (_) { const again = cardStream(); again.listen(piece); await again.finished; }   // one more try (the early read may have started before sign-in finished)
  await chain;
  await extrasP;
  return [...fresh.values()];
}
// The reference lists from the database (docs/reference_lists.sql): only rows in use or checked. Without them the built-in lists stay.
function applyReferenceLists(r) {
  if (!r) return;
  const used = (x) => x.status === "in use" || x.status === "checked";
  addGrapeShortcuts(r.grapeAliases.filter((x) => used(x) && x.kind === "shortcut").map((x) => [x.alias, x.grape]));
  addGrapeSynonyms(r.grapeAliases.filter((x) => used(x) && x.kind === "synonym").map((x) => [x.alias, x.grape]));
  const key = (c) => String(c || "").toLowerCase().trim();
  const broad = {}, designations = {};
  r.broadPlaces.filter(used).forEach((x) => { (broad[key(x.country)] = broad[key(x.country)] || []).push(x.name); });
  r.designationRules.filter(used).forEach((x) => { const c = (designations[key(x.country)] = designations[key(x.country)] || {}); (c[x.designation] = c[x.designation] || []).push(x.place_name); });
  setPlaceLists({ broad, designations });
  state.producerAliases = r.producerAliases.filter(used);
  setNameAliases(state.producerAliases.map((x) => [x.alias, x.producer_name || ""]).filter((x) => x[1]));
}
// Counts for the Discover screen. Only swipes count as swipes (not later changes of interest).
const loadCounts = () => db.countSwipesAndJournal(state.sb);

// ---------------------------------------------------------------- start up
// Offline, the profile comes from the copy kept on the phone (the person was signed in and had accepted the terms there).
async function loadProfileOrSaved() {
  try { return await db.loadProfile(state.sb, state.user.id); }
  catch (e) {
    const saved = await offline.savedSession();
    if (saved && saved.profile && saved.profile.id === state.user.id) return saved.profile;
    throw e;
  }
}
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
    const rawClient = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    await offline.load();
    state.sb = offline.wrap(rawClient);
    setCardLookup(cardById);
    startEarlyLoads();   // the catalog and other public reads run while sign-in and the profile load
    const savedUser = await offline.savedSession();
    state.user = await db.ensureUser(state.sb, savedUser && savedUser.user);
    if (await offline.rememberUser(state.user.id)) { /* the copy on this phone belonged to someone else: it has been cleared */ }
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
    if (linkError) state.banner = "That email link did not work: " + linkError.replace(/\+/g, " ") + " Ask for a new code.";
    const carried = await carryOverGuest();
    state.profile = await loadProfileOrSaved();
    state.access = await db.loadAccess(state.sb, state.profile.role);
    await offline.saveSession({ user: { id: state.user.id, is_anonymous: state.user.is_anonymous, email: state.user.email || null }, profile: state.profile });
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
let lastRefreshAt = 0;   // when the journal and swipes were last fetched; opening a tab only refetches them if this is old (see refreshInBackground)
async function refreshData(afterMine = null) {
  const [states0, journal, counts] = await Promise.all([db.loadStates(state.sb), db.loadJournal(state.sb), loadCounts()]);
  if (afterMine) await afterMine;   // at start-up the private wine changes arrive with the catalog; they must be in place before the journal is patched
  const states = await dateStates(states0);
  state.states = states;
  if (state.mine.size) journal.forEach((e, i) => { if (e.wine_vintage_id && state.mine.has(e.wine_vintage_id)) journal[i] = patchEntry(e, state.mine.get(e.wine_vintage_id)); }); state.journal = journal; state.counts = counts;
  // A photo link that cannot be made only means that picture is not shown; it never blocks the app.
  try { state.photoUrls = await db.signedUrls(state.sb, journal.map((j) => j.first_photo_path)); } catch (_) { state.photoUrls = new Map(); }
  await usePhotoFallbacks();   // offline, the few thumbnails kept on the phone stand in for the signed links
  lastRefreshAt = Date.now();
}
// Opening Swipes, Journal, Profile or Games shows the tab at once from what is already loaded and fetches fresh data behind it (at most every 30 seconds, or sooner
// after the player changes something). The tab is redrawn when the data arrives, unless it was Profile (which waits for this itself, see profile.js).
function refreshInBackground(tab) {
  if (state.refreshing || Date.now() - lastRefreshAt < 30000) return;
  state.refreshing = refreshData()
    .then(() => { if (state.tab === tab && tab !== "profile") renderBody(); }, (e) => console.warn("Could not refresh:", (e && e.message) || e))
    .then(() => { state.refreshing = null; });
}
async function loadReferences() {
  try {
    const [vintageToWine, rows] = await Promise.all([once("vintages", () => db.loadVintageWines(state.sb)), once("refs", () => db.loadReferenceRows(state.sb))]);
    state.refs = refsByVintage(vintageToWine, rows);
  } catch (_) { state.refs = new Map(); }
}
// Discover shows its first card as soon as the first piece of the catalog and the player's own swipes and journal are in (owner, 2026-10-17).
// Everything else keeps loading behind it: more of the catalog (the deck grows behind the card on screen, growDeck), the feature switches, quiz
// knowledge and what other players know (folded in when they arrive). While pieces are still coming, an empty deck says so (state.cardsLoading).
async function enterMain() {
  const tier = (state.profile || {}).tier || "default";
  let shown = false, first = null;
  const firstCards = new Promise((res) => { first = res; });
  state.cardsLoading = true;
  const cardsP = loadAllCards((cards) => { state.cards = cards; if (!shown) first(); else growDeck(); });
  const essentials = Promise.all([
    refreshData(state.mineReady),
    db.loadSwipeConfig(state.sb).then(setSwipeConfig, () => {}),   // the owner's numbers for likes, dislikes and "I don't know it"
    loadVenue(),   // the venue's list: the deck is built from it
  ]);
  const extras = Promise.all([
    loadReferences(),
    db.loadFeature(state.sb, "contentFeedback").then((r) => { state.feedback = feedbackOn(r, tier); }, () => { state.feedback = false; }),
    db.loadFeature(state.sb, PRO_FEATURE).then((r) => { state.pro = feedbackOn(r, tier); }, () => { state.pro = false; }),   // off until database update 21 is run
    db.loadQuizKnowledge(state.sb).then((q) => { state.quiz = q; }, () => {}),   // what the person knows and what other players know both help decide the deck
    db.loadCrowd(state.sb).then((c) => { state.crowd = c; }, () => {}),
    db.loadPlanSwitchOpen(state.sb).then((on) => { state.planSwitch = on; }, () => { state.planSwitch = false; }),   // whether Settings shows the Plan row
  ]);
  // The first card waits for the first piece (or the saved copy) and the player's own data, never for the whole catalog. If the catalog fails
  // before any piece arrives, the failure is shown as before.
  await Promise.race([Promise.all([firstCards, essentials]), cardsP]);
  await essentials;
  shown = true;
  rebuildDeck();
  state.status = "main"; render();
  startOffline();
  maybeShowDemo();
  extras.then(() => growDeck());
  try { state.cards = await cardsP; }
  catch (e) { console.warn("Part of the catalog could not be loaded:", e); setBanner("Not every wine could be loaded. Reopen the app to try again."); }   // keep the wines already in
  finally { state.cardsLoading = false; }
  growDeck(true);
  if (state.status === "main" && state.tab !== "discover") renderBody();   // tabs that list wines see the whole catalog now
}
// More of the catalog (or the extras) arrived: the deck is rebuilt behind the card on screen, at most every half second. The card on screen and
// the next one stay where they are, so a swipe in progress is never disturbed. An empty deck ("Loading more wines...") is redrawn at once.
let growTimer = null;
function growDeck(now = false) {
  clearTimeout(growTimer);
  const run = () => {
    growTimer = null;
    const wasEmpty = !state.deck.length;
    rebuildDeckBehind();
    if (wasEmpty && state.status === "main" && state.tab === "discover" && !state.busy) renderBody();
  };
  if (now) run(); else growTimer = setTimeout(run, 500);
}
// ---------------------------------------------------------------- working offline: the status chip, syncing, thumbnails, the service worker
let offlineStarted = false;
const PHOTO_MSG = "Photos need a connection. Try again when you are online.";
const THUMB_ENTRIES = 30;   // only the photos on this many of the newest journal entries are kept (as tiny pictures) for offline viewing
function paintNetChip() {
  const st = offline.status(), el = $("#netchip");
  document.body.classList.toggle("offline", !st.online);
  if (!el) return;
  const text = st.failed ? `${st.failed} could not upload` : st.syncing ? "Syncing..." : st.pending ? `${st.pending} ${st.pending === 1 ? "change" : "changes"} waiting` : !st.online ? "Offline" : "";
  el.textContent = text; el.hidden = !text; el.classList.toggle("bad", !!st.failed);
  if (st.pending && !st.online) maybeHomeTip();
}
// In a browser tab (not the installed app) an iPhone can erase what is kept after about a week unused, so while changes wait, a one-time tip suggests adding the app to the home screen.
function maybeHomeTip() {
  const installed = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
  if (installed || store.get("wine.homeTip") || state.status !== "main") return;
  store.set("wine.homeTip", "1");
  setBanner("Your changes are kept on this phone until you are online. For the safest keeping, add this app to your home screen (Share, then Add to Home Screen).");
}
// A small set of photo thumbnails (about 100 px) for the newest journal entries, kept for viewing offline. Only while online; never blocks anything.
async function keepThumbs() {
  if (!navigator.onLine) return;
  try {
    const have = await offline.thumbs(), fresh = state.journal.filter((j) => j.first_photo_path && !String(j.id).startsWith("tmp_")).slice(0, THUMB_ENTRIES);
    for (const j of fresh) {
      const url = state.photoUrls.get(j.first_photo_path);
      if (!url || have.has(j.first_photo_path)) continue;
      try { await offline.thumbPut(j.first_photo_path, await makeThumb(url)); } catch (_) { /* this one picture is simply not kept */ }
    }
  } catch (_) { /* thumbnails are a nicety */ }
}
async function usePhotoFallbacks() {
  try { const th = await offline.thumbs(); state.journal.forEach((j) => { if (j.first_photo_path && !state.photoUrls.get(j.first_photo_path) && th.get(j.first_photo_path)) state.photoUrls.set(j.first_photo_path, th.get(j.first_photo_path)); }); } catch (_) {}
}
function startOffline() {
  if (offlineStarted) return; offlineStarted = true;
  offline.subscribe(paintNetChip); paintNetChip();
  offline.start({ client: () => state.sb, synced: async () => { lastRefreshAt = 0; await refreshData(); state.counts = await loadCounts(); if (state.status === "main") { if (state.tab !== "discover") renderBody(); } if ($("#settingsPanel")) openSettings(); } });
  // The browser may be asked to keep this site's data, which protects the waiting changes from being cleared when space runs low.
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (_) {}
  // Photo buttons are online-only: offline they say so instead of opening the camera or the library.
  document.addEventListener("click", (ev) => { const t = ev.target; if (t && t.matches && t.matches("input[data-photo]") && !navigator.onLine) { ev.preventDefault(); ev.stopPropagation(); setBanner(PHOTO_MSG); } }, true);
  usePhotoFallbacks().then(keepThumbs);
  // The service worker lets the app open with no signal. It is tied to this build's version number.
  try { if ("serviceWorker" in navigator) { const v = (new URL(import.meta.url).searchParams.get("v")) || "0"; navigator.serviceWorker.register(`./sw.js?v=${v}`).then(() => navigator.serviceWorker.ready).then((reg) => {
    // The worker is told which of the app's own files this page has loaded, so it can keep every one of them.
    const urls = performance.getEntriesByType("resource").map((r) => r.name).filter((n) => n.startsWith(location.origin));
    if (reg.active) reg.active.postMessage({ type: "cache", urls: [...urls, new URL("./manifest.webmanifest", location.href).href] });
  }).catch(() => {}); } } catch (_) {}
  loadDemoModule().catch(() => {});   // the practice walkthrough is loaded ahead of time so it opens offline too
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
// ---------------------------------------------------------------- the venue's wines (venue.js)
// Every place that picks catalog wines to show or suggest uses only these: the deck, Bingo help, This or That wines, Guess the Glass.
// Until the list has loaded (or when it is empty) it is empty: the app never falls back to the whole catalog. The player's own record (journal, swipes,
// adding a wine they drank, import, blind tasting) still reads the whole catalog through state.cards.
// The venue's wines. Each one carries its page on the venue's website (shopUrl), or null when it is not on the website: the card's name then is not a link.
const venueCards = () => {
  if (!state.venue.list) return [];
  const links = linkMap(state.venue.list), cards = venueCardsOf(state.cards, state.venue.list);
  cards.forEach((c) => { c.shopUrl = links.get(c.id) || null; });
  return cards;
};
async function loadVenue() {
  try { state.venue.list = await db.loadVenueList(state.sb, VENUE.id); state.venue.error = ""; state.venue.missing = false; }
  catch (e) { state.venue.list = null; state.venue.missing = !!(e && e.missing); state.venue.error = (e && e.missing) ? e.message : "Could not load the list: " + ((e && e.message) || e); }
}
// Rebuilds the deck but keeps the card on screen and the next one in front (used while the catalog is still arriving).
function rebuildDeckBehind() {
  const keep = (state.deck || []).slice(0, 2), ids = new Set(keep.map((c) => c.id));
  rebuildDeck();
  state.deck = [...keep, ...state.deck.filter((c) => !ids.has(c.id))];
}
function rebuildDeck() {
  const r = buildDeck({ cards: state.cards, pool: venueCards(), states: state.states, journal: state.journal, quiz: state.quiz, refs: structureMap(state.cards, state.refs), crowd: state.crowd });
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
  if (offline.status().pending) return null;   // the guest's own changes must reach the server first, so the carry-over waits (the code is kept)
  clearPendingMerge(localStorage);                          // a code is only ever tried once
  try { return mergeMessage(await db.claimGuestMerge(state.sb, pending.token)); }
  catch (e) { return { error: "Could not carry over what you did as a guest: " + (e.message || e) }; }
}
function shellHtml() {
  const tab = (id, label) => `<button data-action="tab:${id}">${label}</button>`;
  const editorLink = isEditor() ? tab("editor", "Editor") : "";
  return `<div class="top"><h1 class="serif" id="title"></h1><div class="topright"><button class="netchip" id="netchip" data-action="syncinfo" hidden></button><span class="muted small">Early build</span><button class="gear" data-action="settings" aria-label="Settings">&#9881;</button></div></div>
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
  if (state._ownerFor !== state.cards) { state._ownerFor = state.cards; state._ownerCache = { rows: OWN.wineRows(state.cards), bingo: OWN.bingoCoverage(state.cards) }; }
  const { bingo } = state._ownerCache, rows = OWN.withTags(state._ownerCache.rows, O.wineTags, O.wineIds);
  return { rows, bingo, wineTags: O.wineTags, wineTagsError: O.wineTagsError, checks: OWN.checkCounts(rows), places: O.places, refLists: O.refLists, refListsError: O.refListsError, config: O.config, configError: O.configError, tags: O.tags, tagsError: O.tagsError, legend: O.legend, legendError: O.legendError, staff: O.staff, staffError: O.staffError, staffAudit: O.staffAudit, venue: state.venue, wineIds: O.wineIds, cards: state.cards, cardsById: new Map(state.cards.map((c) => [c.id, c])), seedNames: [], seedOk: true, lensRows: [], ...(O.tab === "lenses" ? ownerLens() : {}) };
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
const ownerRedraw = () => {
  const el = $("#ownerTable"); if (!el || state.tab !== "owner") return;
  el.innerHTML = OWN.ownerTableHtml(state.owner, ownerData());
  const vl = document.getElementById("ownerVenueLinks"); if (vl) venueReview.mountLinks(vl);   // the links box lives inside the table area
};
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
// ---------------------------------------------------------------- wine tags and ticked wines on the Wines tab (docs/wine_tags.sql)
async function loadOwnerWineTags() {
  const O = state.owner;
  O.wineTags = null; O.wineTagsError = "";
  try {
    const [wt, ids] = await Promise.all([db.loadWineTags(state.sb), O.wineIds ? O.wineIds : db.loadVintageWines(state.sb)]);
    O.wineIds = ids; O.wineTags = wt;   // null: the update has not been run
  } catch (e) { O.wineTagsError = "Could not load the tags: " + (e.message || e); }
  if (state.tab === "owner") renderBody();
}
const ownerSel = () => (state.owner.sel = state.owner.sel || new Set());
async function ownerWines(a, b) {
  const O = state.owner, sel = ownerSel();
  try {
    if (a === "selall") { OWN.shownWineRows(O, ownerData().rows).forEach((r) => sel.add(r.id)); }
    else if (a === "selnone") sel.clear();
    else if (a === "bulktag") {
      const pick = document.querySelector("[data-owner-bulktag]"), tagRow = pick && (O.wineTags.tags || []).find((t) => t.id === pick.value);
      if (!tagRow || !sel.size) { ownerSay("Tick some wines and pick a tag first."); return; }
      const wineIds = [...sel].map((v) => O.wineIds && O.wineIds.get(v)).filter(Boolean);
      const n = await db.tagWines(state.sb, wineIds, tagRow.id, b === "on");
      ownerSay(`${b === "on" ? "Tagged" : "Took the tag off"} ${n} ${n === 1 ? "wine" : "wines"}: ${tagRow.name}.`);
      await loadOwnerWineTags(); return;
    }
    else if (a === "bulkreach") {
      const pick = document.querySelector("[data-owner-bulkreach]");
      if (!pick || !pick.value || !sel.size) { ownerSay("Tick some wines and pick a reach first."); return; }
      if (!O.wineIds) O.wineIds = await db.loadVintageWines(state.sb);
      const value = pick.value === "clear" ? null : pick.value, wineIds = [...new Set([...sel].map((v) => O.wineIds.get(v)).filter(Boolean))];
      let done = 0;
      for (const w of wineIds) { await db.saveWineReach(state.sb, w, value); done++; }
      await ownerCardsChanged(); state._ownerFor = null;
      ownerSay(`Reach ${value === null ? "cleared" : `set to ${value}`} on ${done} ${done === 1 ? "wine" : "wines"}.`);
    }
    else if (a === "wtagadd") {
      const box = document.querySelector("[data-owner-wtagnew]"), name = box ? box.value.trim() : "";
      if (!name) { ownerSay("Write the tag name first."); return; }
      const row = await db.addWineTag(state.sb, name); ownerSay(`Added tag: ${row.name}.`); await loadOwnerWineTags(); return;
    }
    else if (a === "wtagrename") {
      const box = document.querySelector(`[data-owner-wtagname="${CSS.escape(b)}"]`), name = box ? box.value.trim() : "";
      if (!name) { ownerSay("A tag needs a name."); return; }
      await db.renameWineTag(state.sb, b, name); ownerSay(`Renamed to ${name}.`); await loadOwnerWineTags(); return;
    }
    else if (a === "wtagdel") {
      const t = (O.wineTags.tags || []).find((x) => x.id === b), n = OWN.tagCounts(O.wineTags).get(b) || 0;
      if (!t || !window.confirm(`Delete the tag "${t.name}"? It comes off ${n} ${n === 1 ? "wine" : "wines"}; the wines stay.`)) return;
      await db.deleteWineTag(state.sb, b); if (O.tagFilter === b) O.tagFilter = "all"; ownerSay(`Deleted tag: ${t.name}.`); await loadOwnerWineTags(); return;
    }
  } catch (e) { ownerSay(e.message || String(e)); }
  ownerRedraw();
}
async function ownerSaveReach(vintageId, value) {
  const card = cardById(vintageId);
  if (!card || value === "") { ownerRedraw(); return; }
  try { await db.saveWineReach(state.sb, await ownerWineId(vintageId), value); card.reach = Number(value); state._ownerFor = null; rebuildDeck(); ownerSay(`Saved: ${wineName(card)}, reach ${value}.`); }
  catch (e) { ownerSay("Could not save: " + (e.message || e)); }
  ownerRedraw();
}
// The place list checks (Owner page, Checks tab): geo.js placeChecks over the place list, and which places wines point at.
const PLACE_DISMISSED = "wine.placeDismissed";
async function loadOwnerPlaces() {
  state.owner.places = null;
  try {
    const [lists, used] = await Promise.all([db.loadEditorLists(state.sb), db.loadPlaceUse(state.sb)]);
    let dismissed = []; try { dismissed = JSON.parse(store.get(PLACE_DISMISSED) || "[]"); } catch (_) { dismissed = []; }
    state.owner.places = { list: OWN.placeChecks(lists.areas, used), dismissed, error: "" };
  } catch (e) { state.owner.places = { list: [], dismissed: [], error: "Could not load the place list: " + (e.message || e) }; }
  if (state.tab === "owner" && state.owner.tab === "checks") ownerRedraw();
}
async function ownerPlace(a, kind, ids) {
  const O = state.owner, P = O.places;
  if (!P) return;
  const id = `${kind}:${ids}`, check = P.list.find((c) => c.id === id);
  if (a === "placedismiss") { P.dismissed = [...(P.dismissed || []), id]; store.set(PLACE_DISMISSED, JSON.stringify(P.dismissed)); ownerRedraw(); return; }
  if (!check || !check.fix) return;
  try { await db.applyPlaceFix(state.sb, check.areaId, check.fix); ownerSay(`Done: ${check.title}: ${check.suggestion}.`); await loadOwnerPlaces(); }
  catch (e) { ownerSay("Not changed: " + (e.message || e)); ownerRedraw(); }
}
// The reference lists (Owner page, Lists tab; docs/reference_lists.sql). Producers are read too, to turn a typed producer name into its id.
async function loadOwnerLists() {
  const O = state.owner;
  O.refListsError = "";
  try {
    const [lists, ed] = await Promise.all([db.loadReferenceLists(state.sb), db.loadEditorLists(state.sb)]);
    if (!lists) throw new Error("These lists need a database update (docs/reference_lists.sql, then docs/reference_lists_seed.sql). Until then the app uses its built-in lists.");
    O.refLists = lists; O.refProducers = ed.producers;
  } catch (e) { O.refLists = null; O.refListsError = e.message || String(e); }
  if (state.tab === "owner" && O.tab === "lists") ownerRedraw();
}
async function ownerRef(a, b) {
  const O = state.owner, table = O.refKind || "grape_aliases";
  const field = { grape_aliases: "grapeAliases", producer_aliases: "producerAliases", place_designation_rules: "designationRules", broad_places: "broadPlaces" }[table];
  if (a === "refkind") { O.refKind = b; O.q = ""; renderBody(); return; }
  try {
    if (a === "refadd") {
      const v = {};
      document.querySelectorAll("[data-owner-ref]").forEach((el) => { v[el.dataset.ownerRef] = el.value.trim(); });
      const row = { ...v, status: "in use", basis: "owner" };
      if (table === "producer_aliases") {
        const p = (O.refProducers || []).find((x) => x.name.toLowerCase() === String(v.producer_name || "").toLowerCase());
        if (!p) throw new Error("Type the producer exactly as it is in our list.");
        delete row.producer_name; row.producer_id = p.id;
      }
      if (Object.values(v).some((x) => !x)) throw new Error("Fill in every box first.");
      await db.saveReferenceRow(state.sb, table, row); ownerSay("Added.");
    } else {
      const row = ((O.refLists && O.refLists[field]) || []).find((r) => String(r.id) === String(b));
      if (!row) return;
      if (a === "refremove") { await db.removeReferenceRow(state.sb, table, row.id); ownerSay("Removed."); }
      else if (a === "refuse") { await db.saveReferenceRow(state.sb, table, { id: row.id, status: "in use" }); ownerSay("Now in use."); }
      else if (a === "refcheck") { await db.saveReferenceRow(state.sb, table, { id: row.id, status: "checked", ...(table === "producer_aliases" ? {} : { checked_at: new Date().toISOString() }) }); ownerSay("Marked checked."); }
    }
    await loadOwnerLists();
    applyReferenceLists(O.refLists);   // the app uses the change at once
  } catch (e) { ownerSay("Not saved: " + (e.message || e)); ownerRedraw(); }
}
async function loadOwnerTags() {
  try { state.owner.tags = await db.loadQuizTags(state.sb); state.owner.tagsError = ""; }
  catch (e) { state.owner.tagsError = "Tags need one more database update (docs/quiz_tags.sql). " + (e.message || ""); }
  if (state.tab === "owner" && state.owner.tab === "tags") ownerRedraw();
}
async function loadOwnerLegend() {
  try {
    const shared = await db.loadSharedLegend(state.sb);
    if (shared === null) throw new Error("The legend needs one more database update (docs/note_legend.sql).");
    const [candidates, cfg] = await Promise.all([db.loadLegendCandidates(state.sb), db.loadAppConfig(state.sb).catch(() => [])]);
    const t = (cfg || []).find((r) => r.key === "legend_share_threshold");
    state.owner.legend = { shared, candidates, threshold: t ? Number(shownConfigValueOf(t)) || 3 : 3 }; state.owner.legendError = "";
  } catch (e) { state.owner.legendError = "Could not load the legend: " + (e.message || e); state.owner.legend = null; }
  if (state.tab === "owner" && state.owner.tab === "legend") ownerRedraw();
}
const shownConfigValueOf = (r) => (r && r.value !== null && typeof r.value === "object" ? r.value.value : r && r.value);
// After the shared legend changed: reload it for the owner's page and for the notes reader, so the change counts at once.
async function legendChanged() { await loadOwnerLegend(); state.legend.loaded = false; state.legend.compiled = null; }
async function ownerLegend(a, b) {
  const O = state.owner;
  try {
    if (a === "legendadd") {
      const phrase = (document.querySelector("[data-owner-legend-phrase]") || {}).value || "", means = (document.querySelector("[data-owner-legend-means]") || {}).value || "";
      const [field, ...rest] = means.split("|"), value = rest.join("|");
      // the picker lists answers for every wine type, so the answer only has to be real for one of them
      const tries = ["red", "white", "sparkling", "rose"].map((st) => legendEntry(phrase, field, value, st)), v = tries.find((r) => r.ok) || tries[0];
      if (!field || !value) { ownerSay("Write the word and choose what it means."); return; }
      if (!v.ok) { ownerSay(v.why); return; }
      const entry = v.entry;
      await db.approveLegend(state.sb, state.user.id, { ...entry, source: "owner", review: false });
      ownerSay(`Added: ${entry.phrase}.`);
    } else if (a === "legendapprove" || a === "legendreject") {
      const c = (O.legend && O.legend.candidates || [])[Number(b)]; if (!c) return;
      if (a === "legendapprove") await db.approveLegend(state.sb, state.user.id, c); else await db.rejectLegend(state.sb, state.user.id, c);
      ownerSay(a === "legendapprove" ? `Approved: ${c.phrase}.` : `Rejected: ${c.phrase}.`);
    } else if (a === "legendremove") { await db.removeSharedLegend(state.sb, b); ownerSay("Removed."); }
    await legendChanged();
  } catch (e) { ownerSay("Could not save: " + (e.message || e)); }
}
// ---- the venue's list (venue.js): the file is read by importer.js (loaded on first use), matched to the catalog, previewed, then saved.
function venueFile(text) {
  const V = state.venue, parsed = IMP.parseCsv(text || ""), table = [parsed.headers, ...parsed.rows];
  const r = readList(table, IMP.detectMapping(parsed.headers), state.cards);
  if (r.error) { V.preview = null; ownerSay(r.error); ownerRedraw(); return; }
  const have = listIds(V.list), haveText = new Set((V.list || []).filter((x) => !x.wine_vintage_id).map((x) => `${x.producer}|${x.wine_name}|${x.vintage}`.toLowerCase()));
  const rows = r.rows.map((x) => ({ ...x, onList: x.wine_vintage_id ? have.has(x.wine_vintage_id) : haveText.has(`${x.producer}|${x.wine_name}|${x.vintage}`.toLowerCase()) }));
  V.preview = { rows, fresh: rows.filter((x) => !x.onList), skipped: r.skipped || 0 };
  ownerSay(""); ownerRedraw();
}
async function venueChanged(msg) {
  await loadVenue(); rebuildDeck(); ownerSay(msg); ownerRedraw();
}
// The list table: one row (website link, edit the catalog wine, review it) or all ticked rows (vbulk:...).
const ownerVsel = () => (state.owner.vsel = state.owner.vsel || new Set());
async function ownerVenueRows(a, b) {
  const O = state.owner, sel = ownerVsel(), ids = [...sel], V = state.venue;
  const rowsOf = () => (V.list || []).filter((r) => sel.has(r.id));
  if (a === "vurl") {
    const box = document.querySelector(`[data-owner-vurl="${CSS.escape(b)}"]`), url = siteUrl(box ? box.value : "");
    if (url === null) { ownerSay(`Only a wine's page on ${VENUE.site} can be its link.`); return; }
    await db.saveVenueLink(state.sb, b, url ? { product_url: url, link_status: "found" } : { product_url: null, link_status: "not found" });
    await venueChanged(url ? "Link saved." : "Link taken off: marked not on the website."); return;
  }
  if (a === "vedit") { const card = cardById(b); if (card) await ownerWineInfo.open(card, ""); return; }
  if (a === "vreview") { venueReview.openRow(b); editorTab.state.section = "venue"; state.tab = "editor"; render(); return; }
  if (b === "all") { OWN.venueListRows(O, ownerData()).forEach((r) => sel.add(r.id)); ownerRedraw(); return; }
  if (b === "none") { sel.clear(); ownerRedraw(); return; }
  if (!ids.length) { ownerSay("Tick some wines first."); return; }
  if (b === "find" || b === "check") { await venueReview.runLinks(b, ids); ownerRedraw(); return; }
  if (b === "noweb" || b === "clear") {
    const n = await db.saveVenueLinks(state.sb, ids, b === "noweb" ? { product_url: null, link_status: "not found" } : { product_url: null, link_status: "" });
    await venueChanged(b === "noweb" ? `${n} marked not on the website (no link).` : `Links taken off ${n} ${n === 1 ? "wine" : "wines"}; Find links will look for them again.`); return;
  }
  if (b === "tagon" || b === "tagoff") {
    const pick = document.querySelector("[data-owner-vbulktag]"), tagRow = pick && O.wineTags && O.wineTags.tags.find((t) => t.id === pick.value);
    if (!tagRow) { ownerSay("Pick a tag first."); return; }
    if (!O.wineIds) O.wineIds = await db.loadVintageWines(state.sb);
    const wineIds = rowsOf().map((r) => r.wine_vintage_id && O.wineIds.get(r.wine_vintage_id)).filter(Boolean);
    if (!wineIds.length) { ownerSay("None of the ticked wines is in our catalog yet, so they cannot be tagged."); return; }
    const n = await db.tagWines(state.sb, wineIds, tagRow.id, b === "tagon");
    ownerSay(`${b === "tagon" ? "Tagged" : "Took the tag off"} ${n} ${n === 1 ? "wine" : "wines"}: ${tagRow.name}.${n < ids.length ? ` ${ids.length - n} not in our catalog yet were left out.` : ""}`);
    await loadOwnerWineTags(); return;
  }
  if (b === "remove") {
    if (!window.confirm(`Take ${ids.length} ${ids.length === 1 ? "wine" : "wines"} off the ${VENUE.name} list? They leave this version's deck; our catalog keeps them.`)) return;
    const n = await db.removeVenueRows(state.sb, ids); sel.clear();
    await venueChanged(`Removed ${n} ${n === 1 ? "wine" : "wines"} from the list.`);
  }
}
async function ownerVenue(a, b) {
  const V = state.venue;
  if (a === "vbulk" || a === "vurl" || a === "vedit" || a === "vreview") { try { await ownerVenueRows(a, b); } catch (e) { ownerSay("Not changed: " + (e.message || e)); } return; }
  try {
    if (a === "venueread") { await loadImportModule(); const box = document.querySelector("[data-owner-venuepaste]"); V.paste = box ? box.value : ""; venueFile(V.paste); }
    else if (a === "venuecancel") { V.preview = null; ownerRedraw(); }
    else if (a === "venuesave" && V.preview) { const n = await db.addVenueRows(state.sb, VENUE.id, V.preview.fresh, "file"); V.preview = null; V.paste = ""; await venueChanged(`Added ${n} ${n === 1 ? "wine" : "wines"} to the list.`); }
    else if (a === "venueadd") { const c = cardById(b); if (!c) return; await db.addVenueRows(state.sb, VENUE.id, [{ producer: c.producer, wine_name: c.cuvee, vintage: c.vintage || "", wine_vintage_id: c.id }], "hand"); await venueChanged(`Added: ${wineName(c)}.`); }
    else if (a === "venueremove") { await db.removeVenueRow(state.sb, b); await venueChanged("Removed from the list."); }
    else if (a === "venuerecheck") { const links = venueRecheck(V.list, state.cards); const n = links.length ? await db.linkVenueRows(state.sb, links) : 0; await venueChanged(n ? `${n} ${n === 1 ? "wine is" : "wines are"} now in the deck.` : "None of them is in our catalog yet."); }
  } catch (e) { ownerSay("Not changed: " + (e.message || e)); }
}
// ---- Roles tab: who has a staff role. Owner is never given or taken away here (access.js, and the database refuses it too).
async function loadOwnerStaff() {
  try { const [staff, audit] = await Promise.all([db.loadStaff(state.sb), db.loadStaffAudit(state.sb)]); state.owner.staff = staff; state.owner.staffAudit = audit; state.owner.staffError = ""; }
  catch (e) { state.owner.staffError = "Could not load the roles: " + (e.message || e); state.owner.staff = null; }
  if (state.tab === "owner" && state.owner.tab === "roles") ownerRedraw();
}
async function ownerStaff(a, b, c) {
  try {
    if (a === "staffadd") {
      const chk = checkAssignment((document.querySelector("[data-owner-staffemail]") || {}).value, (document.querySelector("[data-owner-staffrole]") || {}).value);
      if (!chk.ok) { ownerSay(chk.why); return; }
      await db.setStaffRole(state.sb, chk.email, chk.role); ownerSay(`Done: ${chk.email} is now ${chk.role === "editor" ? "an Editor" : "a Quiz reviewer"}.`);
    } else if (a === "staffset") {
      const row = (state.owner.staff || []).find((r) => String(r.user_id) === b); if (!row || !row.email) { ownerSay("That person has no email on record."); return; }
      const chk = checkAssignment(row.email, c); if (!chk.ok) { ownerSay(chk.why); return; }
      await db.setStaffRole(state.sb, chk.email, chk.role); ownerSay("Role changed.");
    } else if (a === "staffremove") { await db.removeStaff(state.sb, b); ownerSay("Role removed. They are a player again."); }
    state.owner.staff = null; await loadOwnerStaff();
  } catch (e) { ownerSay("Not changed: " + (e.message || e)); }
}
async function ownerAddTag() {
  const kind = document.querySelector("[data-owner-tagkind]"), name = document.querySelector("[data-owner-tagname]");
  if (!kind || !name || !name.value.trim()) { ownerSay("Write the tag name first."); return; }
  try {
    const row = await db.addQuizTag(state.sb, state.user.id, kind.value, name.value);
    if (state.owner.tags) state.owner.tags.tags.push(row);
    name.value = ""; ownerSay(`Added tag: ${row.name}.`);
  } catch (e) { ownerSay(/duplicate|unique/i.test(e.message || "") ? "That tag already exists." : "Could not add: " + (e.message || e)); }
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
  const next = OWN.nextConfigValue(row.value, input.value);
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
// The This or That results put the player's journal taste beside their picks. It is worked out once when the results open (profile.js tasteForGame) and the screen redraws when it arrives.
function ensureTotTaste() {
  if (state.totTaste || state.totLoading) return;
  state.totLoading = true; state.totTaste = { loading: true };
  profileTab.tasteForGame().then((t) => { state.totTaste = t; }, () => { state.totTaste = { error: true }; })
    .then(() => { state.totLoading = false; if (state.tab === "games" && state.g.screen === "tot") renderBody(); });
}
function gamesView() {
  const cardsById = new Map(state.cards.map((c) => [c.id, c]));
  const progress = allProgress(ratedWines(state.journal.filter((e) => !entryIncomplete(e)), cardsById, new Date(), state.photoUrls));
  const { memory, news } = mergeMemory(state.gamesMemory, progress);
  if (memory !== state.gamesMemory) { state.gamesMemory = memory; store.set(GAMES_KEY, JSON.stringify(memory)); }
  let help = null;
  const c = state.g.screen === "card" ? bingoCard(state.g.cardId) : null;
  if (c && Number.isInteger(state.g.sq) && !progress.get(c.id).done[state.g.sq]) help = squareHelp(c.squares[state.g.sq], cardsById);
  // The wines for the This or That results are only worked out on that screen.
  const tot = { answers: state.totAnswers, matches: [], taste: state.totTaste };
  if (state.g.screen === "tot" && (state.g.totResults || !nextPair(state.totAnswers))) tot.matches = matchWines({ answers: state.totAnswers, cards: venueCards(), structure: structureMap(state.cards, state.refs) });
  const guess = { ...state.guess, follow: state.g.screen === "guess" ? guessFollow() : null };
  return gamesHtml(state.g, { progress, memory, news, help, tot, guess });
}
// ---------------------------------------------------------------- Guess the Glass (blindgame.js)
// A round is built from the classics and the catalog (with the editors' structure). Nothing here is saved to the database except the quiz answers given
// in "Learn it" (ordinary quiz answers); the game itself never touches the taste model.
function startGuess(mode) {
  const G = state.guess;
  if (!GG.modeById(mode)) return;
  const items = GG.buildItems(venueCards(), state.refs, new Date(), { classics: false });   // the venue's own wines only (owner, 2026-10-14)
  const round = GG.makeRound(mode, items, { level: G.level, words: state.settings.mode });
  Object.assign(G, { lq: {}, lqChoices: {}, lqFor: {}, winesFor: {}, topicList: [], message: "" });
  if (!round.length) { G.play = null; G.message = "There are not enough wines for this mode yet."; return; }
  G.play = { mode, level: G.level, round, i: 0, picks: [] };
}
// After a pick (and on the result screen): quiz questions about the answer (learn.js), the topics Learn can open, and catalog wines to try (recommend.js).
function guessFollow() {
  const G = state.guess, play = G.play;
  if (!play) return null;
  const done = play.i >= play.round.length;
  if (!done && play.picks[play.i] === undefined) return null;
  const key = done ? "done" : play.i;
  const topics = done ? GG.missedTopics(play.round, play.picks) : play.round[play.i].topics;
  G.topicList = topics;
  const ready = learn.ready();
  const out = { topics: topics.map((t, k) => ({ name: GG.topicName(t), k, can: ready && learn.about([t], 1).length > 0 })), questions: [], wines: [] };
  if (!done && ready) {
    if (!G.lqFor[key]) G.lqFor[key] = learn.about(topics, 2);
    out.questions = G.lqFor[key].map((id) => {
      const q = learn.question(id); if (!q) return null;
      if (!G.lqChoices[id]) G.lqChoices[id] = learn.choicesOf(id);
      return { id, question: q.question, correct: q.correct_answer, choices: G.lqChoices[id], answered: G.lq[id] || null };
    }).filter(Boolean);
  }
  if (!G.winesFor[key]) G.winesFor[key] = guessWines(topics, done);
  out.wines = G.winesFor[key];
  return out;
}
// Catalog wines for the topics, picked by the player's taste model (recommend.js "Safe bet"), never one they have rated or turned down.
// During a question: up to 2 that share the grape (and the place, when there is one); after the round: one per missed topic, up to 3.
function guessWines(topics, done) {
  try {
    const refs = structureMap(state.cards, state.refs);
    const model = userModel({ cards: state.cards, states: state.states, journal: state.journal, quiz: state.quiz, refs });
    const leaveOut = new Set([...state.journal.filter((e) => e.verdict && e.wine_vintage_id).map((e) => e.wine_vintage_id), ...state.states.filter((x) => reactionOf(x) === "dislike").map((x) => x.wine_vintage_id)]);
    const base = { cards: venueCards(), model, refs, crowd: state.crowd, journal: state.journal, states: state.states, lens: "confident" };
    const useful = topics.filter((t) => t.kind !== "theme");
    if (done) {
      const out = [];
      useful.slice(0, 3).forEach((t) => { const [p] = recommend({ ...base, exclude: new Set([...leaveOut, ...out.map((r) => r.card.id)]), accept: (c) => GG.cardFitsTopic(c, t), limit: 1 }); if (p) out.push(p); });
      return out;
    }
    const grape = useful.find((t) => t.kind === "grape"), place = useful.find((t) => t.kind === "region");
    let picks = grape && place ? recommend({ ...base, exclude: leaveOut, accept: (c) => GG.cardFitsTopic(c, grape) && GG.cardFitsTopic(c, place), limit: 2 }) : [];
    if (picks.length < 2 && (grape || place)) picks = picks.concat(recommend({ ...base, exclude: new Set([...leaveOut, ...picks.map((r) => r.card.id)]), accept: (c) => GG.cardFitsTopic(c, grape || place), limit: 2 - picks.length }));
    return picks;
  } catch (e) { console.warn("Guess the Glass: no wines to suggest", e && e.message); return []; }
}
// Help for an empty square: a wine already in the journal that only needs rating, or else a few wines that would fill it, each from a different angle
// (recommend.js lenses: a safe bet, something different, a stretch). Other games can call recommendMix() or recommend() with their own accept() and lenses.
function squareHelp(square, cardsById) {
  const unrated = unratedMatches(square.test, state.journal.filter((e) => !entryIncomplete(e)), cardsById);
  if (unrated.length) return { unrated, recs: [] };
  const refs = structureMap(state.cards, state.refs);
  const model = userModel({ cards: state.cards, states: state.states, journal: state.journal, quiz: state.quiz, refs });
  const leaveOut = new Set([...state.journal.filter((e) => e.verdict && e.wine_vintage_id).map((e) => e.wine_vintage_id), ...state.states.filter((x) => reactionOf(x) === "dislike").map((x) => x.wine_vintage_id)]);
  const cold = model.swipeCount + model.journalCount < 5;   // too little history to say "your taste"
  return { unrated: [], cold, recs: recommendMix({ cards: venueCards(), model, refs, crowd: state.crowd, journal: state.journal, states: state.states, exclude: leaveOut, accept: (c) => bingoMatches(square.test, cardFacts(c)), lenses: ["confident", "unique", "challenge"] }) };
}
// How well each wine fits the player (0 to 1, the deck's taste model), worked out only when the Swipes tab groups or sorts by it.
function swipeMatch() {
  if (state.sw.group !== "match" && state.sw.sort !== "match") return new Map();
  const refs = structureMap(state.cards, state.refs);
  const model = userModel({ cards: state.cards, states: state.states, journal: state.journal, quiz: state.quiz, refs });
  return new Map(state.cards.map((c) => [c.id, prefOf(c, model, refs)]));
}
function drawTab(body) {
  if (state.tab === "discover") {
    body.innerHTML = discoverHtml({ venueEmpty: venueCards().length ? null : { name: VENUE.name, owner: isOwner() }, deck: state.deck, loading: !!state.cardsLoading, banner: null, counts: state.counts, feedback: state.feedback, flaggedId: state.wfDone, nudge: showNudge(), buttons: state.settings.buttons, mapHint: mapHintFor(state.deck[0]) });
    const card = $("#card");
    if (card) attachCard(card);
    settlePhotos();
  } else if (state.tab === "swipes") {
    body.innerHTML = swipesHtml(swipeLists(state.cards, state.states, state.journal), state.sw, state.photoUrls, swipeMatch());
  } else if (state.tab === "owner") {
    if (!isOwner()) body.innerHTML = `<p class="muted">The owner page is only for the owner.</p>`;
    else if (!OWN) { body.innerHTML = `<div class="center muted">Loading\u2026</div>`; loadOwnerModule().then(() => { if (state.tab === "owner") renderBody(); }); }
    else body.innerHTML = OWN.ownerHtml(state.owner, ownerData());
    const vl = document.getElementById("ownerVenueLinks"); if (vl) venueReview.mountLinks(vl);   // Find links / Check links on the list tab too
    if (isOwner() && state.owner.tab === "legend" && !state.owner.legend && !state.owner.legendError) loadOwnerLegend();
    if (isOwner() && (state.owner.tab === "wines" || state.owner.tab === "venue") && state.owner.wineTags === undefined) loadOwnerWineTags();
    if (isOwner() && state.owner.tab === "tags" && !state.owner.tags && !state.owner.tagsError) loadOwnerTags();
    if (isOwner() && state.owner.tab === "checks" && state.owner.places === undefined) loadOwnerPlaces();
    if (isOwner() && state.owner.tab === "lists" && state.owner.refLists === undefined) loadOwnerLists();
    if (isOwner() && state.owner.tab === "roles" && !state.owner.staff && !state.owner.staffError) loadOwnerStaff();
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
    body.innerHTML = journalShellHtml(state.j, blindPending().length);
    renderJournalList();
  }
}
// Typing in the search box only redraws the list, so the box keeps focus.
function renderJournalList() {
  const filtered = filterEntries(state.journal, { q: state.j.q, verdict: state.j.verdict, incomplete: !!state.j.incomplete });
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
  setMode(state.settings.mode);   // the words (words.js) follow "Who is this for"
  setSpeechLang(state.settings.lang);   // the "Speak in" pick (winewords.js)
}
// ---------------------------------------------------------------- "How the card works" (demo.js): once for a brand-new player, any time from Settings
// Brand new = never seen it, no swipes and no journal entries yet (so a returning player on a new phone is not interrupted). Nothing is saved but the "seen" flag.
function drawDemo() { $("#overlay").innerHTML = DEMO.demoHtml(state.demo); DEMO.attachDemo($("#overlay"), state.demo); }
async function openDemo() { await loadDemoModule(); state.demo = { step: 0, done: {}, note: "" }; drawDemo(); }
function closeDemo() { state.demo = null; store.set("wine.demoSeen", "1"); $("#overlay").innerHTML = ""; }
function maybeShowDemo() {
  if (store.get("wine.demoSeen")) return;
  const fresh = !(state.journal || []).length && !(state.states || []).length;
  if (fresh && state.tab === "discover") openDemo().catch(() => {}); else store.set("wine.demoSeen", "1");
}
// ---------------------------------------------------------------- import wines into the journal (importer.js, loaded when first opened)
function drawImport() {
  const I = state.imp; if (!I) return;
  const items = I.step === "map" ? IMP.buildItems(I.rows, { mapping: I.mapping, useRatings: I.useRatings, scale: I.scale, lookups: IMP.lookups(state.journal, state.cards), userId: state.user.id, limit: I.limit }) : [];
  $("#overlay").innerHTML = IMP.importHtml(I, items);
  return items;
}
async function openImport() {
  await loadImportModule();
  // Editors and the owner (anyone with staff access) and people on a tier listed in the importLarge feature switch may import more at once.
  // The database says how many this player may still add (docs/import_limit.sql). Until that script has been run, the page works the limit out itself.
  let allowance = null;
  try { allowance = await db.importAllowance(state.sb); } catch (_) { allowance = null; }
  const tier = (state.profile || {}).tier || "default";
  const large = can("import_extended") || (allowance ? false : await db.loadFeature(state.sb, IMP.FEATURE).then((r) => feedbackOn(r, tier), () => false));
  state.imp = { step: "pick", headers: [], rows: [], mapping: {}, useRatings: false, scale: 5, error: "", busy: false, result: null, text: "", allowance, limit: allowance ? Math.max(allowance.remaining, 0) : (large ? IMP.LIMIT_EXTENDED : IMP.LIMIT_REGULAR) };
  drawImport();
}
function readImportText(text) {
  const I = state.imp; if (!I) return;
  const t = IMP.parseCsv(text);
  if (!t.headers.length || !t.rows.length) { I.error = "I could not find any rows. The first line should name the columns, and there should be at least one wine under it."; return drawImport(); }
  I.headers = t.headers; I.rows = t.rows; I.mapping = IMP.detectMapping(t.headers); I.error = ""; I.step = "map";
  const col = I.mapping.rating;
  I.useRatings = IMP.USE_RATING_RULE && col != null; I.scale = col != null ? IMP.guessScale(t.rows.map((r) => r[col] || "")) : 5;
  drawImport();
}
async function runImport() {
  const I = state.imp; if (!I || I.busy) return;
  const items = IMP.buildItems(I.rows, { mapping: I.mapping, useRatings: I.useRatings, scale: I.scale, lookups: IMP.lookups(state.journal, state.cards), userId: state.user.id, limit: I.limit });
  const toAdd = items.filter((x) => x.status === "add");
  if (!toAdd.length) return;
  I.busy = true; I.error = ""; drawImport();
  try {
    const today = new Date().toLocaleDateString("en-CA");
    I.result = await db.importJournal(state.sb, state.user.id, toAdd, today);
    const s = IMP.summarize(items);
    I.skipped = [s.dup ? `${s.dup} skipped as already there or listed twice.` : "", s.skip ? `${s.skip} skipped for having no producer.` : ""].filter(Boolean).join(" ");
    lastRefreshAt = 0; await refreshData();
    I.step = "done";
  } catch (e) { I.error = "Could not import: " + (e.message || e); }
  I.busy = false; drawImport();
}
document.addEventListener("change", async (ev) => {
  const t = ev.target, I = state.imp;
  if (!I || !t || !t.dataset) return;
  if (t.dataset.importFile !== undefined && t.files && t.files[0]) {
    const f = t.files[0];
    if (f.size > 2 * 1024 * 1024) { I.error = "That file is too large (2 MB at most)."; return drawImport(); }
    try { readImportText(await f.text()); } catch (e) { I.error = "Could not read that file."; drawImport(); }
  } else if (t.dataset.importMap) { I.mapping = { ...I.mapping, [t.dataset.importMap]: Number(t.value) }; if (IMP.USE_RATING_RULE && t.dataset.importMap === "rating" && Number(t.value) >= 0) { I.scale = IMP.guessScale(I.rows.map((r) => r[Number(t.value)] || "")); I.useRatings = true; } drawImport(); }
  else if (t.dataset.importScale !== undefined) { I.scale = Number(t.value); drawImport(); }
});
document.addEventListener("input", (ev) => { const t = ev.target; if (state.imp && t && t.dataset && t.dataset.importText !== undefined) state.imp.text = t.value; });
const syncInfo = () => { const st = offline.status(); return { pending: st.pending, online: st.online, syncing: st.syncing, failed: offline.failedItems() }; };
// The Plan row (Standard / Pro) is a testing aid: it shows only while the owner keeps app_config plan_switch_open on (Owner page, Config tab). See docs/ROLES_AND_ACCESS.md.
const planInfo = () => (state.planSwitch ? { current: planIdOf(state.profile), plans: PLANS, busy: !!state.planBusy, error: state.planError || "" } : null);
function openSettings() { $("#overlay").innerHTML = settingsHtml(state.settings, state.user, { owner: isOwner(), sync: syncInfo(), plan: planInfo() }); }
async function choosePlan(plan) {
  if (state.planBusy || plan === planIdOf(state.profile)) return;
  state.planBusy = true; state.planError = ""; if ($("#settingsPanel")) openSettings();
  try {
    await db.setMyPlan(state.sb, plan);
    state.profile = await db.loadProfile(state.sb, state.user.id);   // the database says what the plan is now
    const tier = state.profile.tier || "default";
    const [pro, feedback] = await Promise.all([db.loadFeature(state.sb, PRO_FEATURE).then((r) => feedbackOn(r, tier), () => false), db.loadFeature(state.sb, "contentFeedback").then((r) => feedbackOn(r, tier), () => false)]);
    state.pro = pro; state.feedback = feedback;
    offline.saveSession({ user: { id: state.user.id, is_anonymous: state.user.is_anonymous, email: state.user.email || null }, profile: state.profile });
  } catch (e) { state.planError = "Could not change the plan: " + (e.message || e); }
  state.planBusy = false; if ($("#settingsPanel")) openSettings();
}
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
// Every way of leaving a card (a swipe, a button) ends the same way: save it, take the card out of the deck, remember what it taught us straight away,
// re-rank the rest every 8 swipes (or when the deck runs low), then draw the next card, which settles forward from where the one underneath was.
async function finishCard(card, save, row, failure, extra) {
  try {
    await save();
    lastRefreshAt = 0;   // the swipe (and maybe a new journal entry) is not in the loaded lists yet: the next tab opened refetches them
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
    const plan = flyPlan(kind, v.dx, v.dy, v.vx || (kind === "like" ? 0.9 : kind === "dislike" ? -0.9 : 0), v.vy || (kind === "had" ? -1.1 : kind === "dont_know" ? 0.9 : 0), window.innerWidth, window.innerHeight);
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
  // The answer, with a small note of what the deck knew about the wine when it was shown (kept for studying the deck later).
  const [familiarity, interest] = LEGACY_OF[kind];
  const before = state.states.find((x) => x.wine_vintage_id === card.id);   // a skipped wine can come round again: the second skip takes it out of the deck
  const skip_count = kind === "dont_know" ? skipsOf(before) + 1 : (before && before.skip_count) || 0;
  await finishCard(card, () => db.recordReaction(state.sb, card.id, kind, contextFor(card), { userId: state.user.id }), { reaction: kind, familiarity, interest, skip_count }, "Could not save that swipe: ", async () => { state.counts = await loadCounts(); });
}
const contextFor = (card) => { const i = state.deckInfo && state.deckInfo.get(card.id); const r2 = (n) => Math.round(n * 100) / 100; return i ? { tier: i.tier, fam: r2(i.fam), pref: r2(i.pref), skip: r2(i.skip || 0) } : null; };

// The double-tap zones: a narrow strip down each side (left = dislike, right = like) and a thin strip across the top (had it).
// Everything in the middle of the card is not a zone, so a double-tap there does nothing. These are fractions of the card's width and height.
const EDGE_SIDE = 0.14, EDGE_TOP = 0.09;
const edgeOf = (fx, fy) => (fy < EDGE_TOP ? "had" : fx < EDGE_SIDE ? "dislike" : fx > 1 - EDGE_SIDE ? "like" : null);
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
  const clearHint = () => { clearTimeout(hintTimer); ["like", "dislike", "had", "dont_know"].forEach((k) => { label(k).style.opacity = 0; }); };
  const showHint = (edge) => { clearHint(); if (edge) { label(edge).style.opacity = 0.55; hintTimer = setTimeout(clearHint, DOUBLE_TAP_MS + 50); } };
  const paint = () => {
    label("like").style.opacity = clamp01((dx - 40) / 80);
    label("dislike").style.opacity = clamp01((-dx - 40) / 80);
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
function closeOverlay() { stopDictation(); state.sheet = null; state.form = null; state.qn = null; $("#overlay").innerHTML = ""; }

// ------- speaking notes (dictation.js). One microphone at a time: into the rating sheet's notes box, or into a quick note.
let dictation = null, dictationTarget = null;
const stopDictation = () => { if (dictation) { dictation.stop(); } dictation = null; dictationTarget = null; };
// ------- wine words in dictated notes (termfix.js): spellings corrected from the grape list, the catalog's own names and the wine words in winewords.js
let vocabCache = null;
function wineVocab() {
  const n = state.cards.length;
  if (vocabCache && vocabCache.n === n) return vocabCache.v;
  const pick = (f) => state.cards.map(f).filter(Boolean);
  const v = buildVocab(GRAPES, WINE_TERMS, pick((c) => c.producer), pick((c) => c.cuvee), pick((c) => c.appellation), pick((c) => c.region), pick((c) => c.country));
  vocabCache = { n, v }; return v;
}
// Words the browser may favour while listening (where it supports that): the wine on screen first, then the player's journal, then the common wine words.
function biasPhrases(target) {
  const out = [], seen = new Set();
  const add = (t, boost) => { const k = String(t || "").trim(); if (k && k.length > 2 && !seen.has(k.toLowerCase()) && out.length < 200) { seen.add(k.toLowerCase()); out.push({ phrase: k, boost }); } };
  const fromCard = (c) => { if (!c) return; [c.producer, c.cuvee, c.appellation, c.region, c.country, ...(c.grapes || []), ...(c.ruleGrapes || [])].forEach((t) => add(t, 9)); };
  const fromEntry = (e) => { if (!e) return; [e.producer, e.wine_name, e.region, e.country, e.grape].forEach((t) => add(t, 9)); };
  if (target === "sheet" && state.sheet) { const t = state.sheet.target || {}; if (t.wineVintageId) fromCard(cardById(t.wineVintageId)); if (t.form) { const f = t.form; [f.producer, f.wine_name, f.grape, f.region].forEach((x) => add(x, 9)); } }
  if (target === "qn" && state.qn) add(state.qn.wine, 9);
  if (target === "blind" && state.blind) { const g = state.blind.guess || {}; [g.grape, g.country, g.region].forEach((x) => add(x, 8)); }
  state.journal.slice(0, 25).forEach(fromEntry);
  WINE_TERMS.slice(0, 110).forEach((t) => add(t, 5));
  GRAPES.slice(0, 40).forEach((t) => add(t, 3));
  return out;
}
const boxFor = (target) => document.querySelector(target === "blind" ? '[data-bl="notes"]' : target === "qn" ? '[data-qn="text"]' : '[data-field="notes"]');
const syncBox = (target, text) => { if (target === "sheet" && state.sheet) state.sheet.notes = text; else if (target === "qn" && state.qn) state.qn.text = text; else if (target === "blind" && state.blind) state.blind.notes = text; };
// The line under the notes box: "Wine words fixed: Nebbiolo (tap to undo). Did you mean Barolo? (tap to use)". Tapping swaps the words in the box and keeps the note in step.
function drawWordFix() {
  const el = document.querySelector("[data-wordfix]"), wf = state.wf;
  if (!el) return;
  const items = (wf ? wf.changes : []).map((c) => c.applied
    ? `<button class="chip wfix on" data-action="wfix:${c.id}" aria-label="Undo: ${esc(c.out)} back to ${esc(c.raw)}">${esc(c.out)} &#10003;</button>`
    : `<button class="chip wfix" data-action="wfix:${c.id}" aria-label="Use ${esc(c.out)} instead of ${esc(c.raw)}">${c.kind === "maybe" ? "Did you mean " : "Heard "}${esc(c.out)}?</button>`).join("");
  el.innerHTML = items ? `<div class="muted small">Wine words checked. Tap one to switch it.</div><div class="chips left">${items}</div>` : "";
}
function toggleFix(id) {
  const wf = state.wf; if (!wf) return;
  const c = wf.changes.find((x) => x.id === id), box = boxFor(wf.target); if (!c || !box) return;
  const from = c.applied ? c.out : c.raw, to = c.applied ? c.raw : c.out, i = box.value.indexOf(from);
  if (i < 0) return;   // the player has already edited those words by hand
  box.value = box.value.slice(0, i) + to + box.value.slice(i + from.length);
  syncBox(wf.target, box.value); c.applied = !c.applied; drawWordFix();
}
function dictateInto(target) {
  if (dictation && dictationTarget === target) { stopDictation(); showMic(target, false); return; }   // a second tap stops, and clears an old error
  stopDictation();
  const stamp = stampOf(new Date());
  const base = target === "sheet" ? (state.sheet ? state.sheet.notes || "" : "") : target === "blind" ? (state.blind ? state.blind.notes || "" : "") : (state.qn ? state.qn.text || "" : "");
  const show = (finals, interim) => {
    const fx = fixTerms(finals, wineVocab());   // only the finished words are checked, so nothing flickers while the player is still talking
    state.wf = { target, changes: fx.changes.map((c) => ({ ...c, applied: c.kind === "fix" })) };
    const text = composeNote(base, fx.text + (interim ? (fx.text ? " " : "") + interim : ""), stamp);
    if (target === "sheet" && state.sheet) { state.sheet.notes = text; const el = document.querySelector('[data-field="notes"]'); if (el) el.value = text; scheduleFill(); }
    if (target === "qn" && state.qn) { state.qn.text = text; const el = document.querySelector('[data-qn="text"]'); if (el) el.value = text; }
    if (target === "blind" && state.blind) { state.blind.notes = text; const el = document.querySelector('[data-bl="notes"]'); if (el) el.value = text; }
    drawWordFix();
  };
  const say = (m) => {   // the line under the notes box for this target
    const el = target === "blind" ? $("#blErr") : target === "qn" ? $("#qnErr") : $("#micStatus");
    if (el) el.textContent = m || "";
    if (target === "qn" && state.qn) state.qn.error = m || "";
  };
  dictationTarget = target;
  const mine = createDictation({
    onText: show,
    onClear: () => { say(""); state.wf = null; drawWordFix(); },
    options: () => ({ lang: speechCodeOf(state.settings.lang), phrases: biasPhrases(target) }),
    onNote: (m) => { const el = target === "blind" ? $("#blInterim") : target === "qn" ? $("#qnInterim") : $("#micStatus"); if (el) el.textContent = m; },
    onState: (on) => { showMic(target, on); if (!on && dictation === mine) { dictation = null; dictationTarget = null; } },
    // An error always ends the try: the button goes back to "Speak" so it can be tapped again, and the tap is never taken for "stop".
    onError: (m, reason) => {
      if (dictation === mine) { dictation = null; dictationTarget = null; }
      showMic(target, false); say(m);
      if (reason === "speech") { const box = document.querySelector(target === "blind" ? '[data-bl="notes"]' : target === "qn" ? '[data-qn="text"]' : '[data-field="notes"]'); if (box) box.focus(); }   // opens the keyboard, which has its own microphone key
    },
  });
  dictation = mine;
  mine.start();
}
// The microphone button of a target as listening (on) or not.
function showMic(target, on) {
  const sel = target === "blind" ? '[data-action="blind:mic"]' : target === "qn" ? '[data-action="qn:mic"]' : '[data-action="dictate:sheet"]';
  const b = document.querySelector(sel);
  if (target === "blind" && state.blind) state.blind.listening = on;
  if (target === "qn" && state.qn) state.qn.listening = on;
  if (!b) return;
  b.setAttribute("aria-pressed", String(on));
  if (target === "sheet") { const t = b.querySelector("span"); if (t) t.textContent = on ? "Stop listening" : "Speak your notes"; }
  else if (b.lastChild) b.lastChild.textContent = on ? " Stop listening" : " Speak";
}
// A spreadsheet file of the player's own journal (exportcsv.js), saved through the browser's download.
function exportNotes() {
  try {
    const blob = new Blob(["\ufeff" + journalCsv(state.journal)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = exportName(new Date()); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    setBanner(`Saved ${state.journal.length} ${state.journal.length === 1 ? "entry" : "entries"} to ${a.download}.`);
  } catch (e) { setBanner("Could not make the file: " + (e.message || e)); }
}
// ------- blind tasting (blind.js): a guess is kept on the phone until the wine is revealed
const BLIND_KEY = "wine.blind";
function blindPending() { try { return cleanPending(JSON.parse(store.get(BLIND_KEY) || "[]")); } catch (_) { return []; } }
const saveBlindPending = (list) => store.set(BLIND_KEY, JSON.stringify(cleanPending(list)));
const blankForm = () => ({ producer: "", wine_name: "", vintage: "", style: "", grape: "", country: "", region: "" });
function drawBlind(keepFocus) {
  const o = $("#overlay"), panel = document.getElementById("blindPanel"), top = panel ? panel.scrollTop : 0;
  o.innerHTML = blindHtml(state.blind, state.cards, dictationSupported(), styleLabel);
  const n = document.getElementById("blindPanel"); if (n) n.scrollTop = top;
  if (keepFocus) { const el = document.querySelector(keepFocus); if (el) { el.focus(); try { el.setSelectionRange(el.value.length, el.value.length); } catch (_) {} } }
}
async function blindAction(a, b) {
  if (a === "open") {
    const pending = blindPending();
    state.blind = { ...newBlind(), step: pending.length ? "home" : "guess", pending, q: "", typed: false, form: blankForm(), rows: null, error: "", listening: false, pickName: "", pickCard: null };
    drawBlind(); return;
  }
  const B = state.blind; if (!B) return;
  if (a === "close") { stopDictation(); state.blind = null; $("#overlay").innerHTML = ""; return; }
  if (a === "new") { B.step = "guess"; drawBlind(); return; }
  if (a === "style") { B.guess.style = B.guess.style === b ? "" : b; drawBlind(); return; }
  if (a === "mic") { dictateInto("blind"); return; }
  if (a === "drop") { saveBlindPending(B.pending.filter((x) => x.id !== b)); B.pending = blindPending(); if (!B.pending.length) B.step = "guess"; drawBlind(); return; }
  if (a === "resume") { const x = B.pending.find((y) => y.id === b); if (!x) return; Object.assign(B, { id: x.id, started: x.started, guess: { ...x.guess }, notes: x.notes, step: "pick", q: "" }); drawBlind(); return; }
  if (a === "later") {
    if (!hasGuess(B)) { B.error = "Write a guess or a note first."; const e = $("#blErr"); if (e) e.textContent = B.error; return; }
    stopDictation();
    saveBlindPending([{ id: B.id, started: B.started, guess: B.guess, notes: B.notes }, ...blindPending().filter((x) => x.id !== B.id)]);
    state.blind = null; $("#overlay").innerHTML = ""; if (state.tab === "journal") renderBody(); return;
  }
  if (a === "reveal") { stopDictation(); B.step = "pick"; B.error = ""; drawBlind(); return; }
  if (a === "backguess") { B.step = "guess"; drawBlind(); return; }
  if (a === "backpick") { B.step = "pick"; drawBlind(); return; }
  if (a === "typed") { B.typed = !B.typed; drawBlind(); return; }
  if (a === "tstyle") { B.form.style = B.form.style === b ? "" : b; drawBlind(); return; }
  if (a === "pick") {
    const card = cardById(b); if (!card) return;
    B.rows = scoreGuess(B.guess, actualOfCard(card), styleLabel); B.pickName = wineName(card); B.pickCard = card.id; B.pickForm = null; B.step = "result"; drawBlind(); return;
  }
  if (a === "revealtyped") {
    const f = B.form;
    if (!(f.producer.trim() || f.wine_name.trim())) { B.error = "Enter the producer or the wine's name."; const e = $("#blErr"); if (e) e.textContent = B.error; return; }
    B.rows = scoreGuess(B.guess, actualOfForm(f), styleLabel); B.pickName = [f.vintage, f.producer.trim(), f.wine_name.trim()].filter(Boolean).join(" "); B.pickCard = null; B.pickForm = { ...f }; B.step = "result"; drawBlind(); return;
  }
  if (a === "rate") {
    const stamp = stampOf(new Date()), line = resultLine(B.rows, summarize(B.rows));
    const id = B.id, card = B.pickCard ? cardById(B.pickCard) : null, form = B.pickForm;
    saveBlindPending(blindPending().filter((x) => x.id !== id));
    const notes = (existing) => notesAfterReveal(existing, B.notes, line, stamp);
    state.blind = null; $("#overlay").innerHTML = "";
    if (card) {
      const entry = state.journal.find((j) => j.wine_vintage_id === card.id);
      if (entry) await openEntry(entry); else { state.sheet = sheetForCard(card, today(), startFor(card)); openSheet(); }
      if (state.sheet) { state.sheet.notes = notes(state.sheet.notes); openSheet(); }
    } else if (form) {
      const f = { producer: form.producer, wine_name: form.wine_name, vintage: form.vintage, style: form.style || "unknown", grape: form.grape, region: joinPlace(form.region, form.country), photos: [] };
      state.sheet = applyDefaults(sheetForOutside(f, today()), startingValues(entryAsCard(f), null));
      state.sheet.notes = notes(""); openSheet();
    }
    return;
  }
}
async function quickNoteAction(a) {
  const q = state.qn; if (!q) return;
  if (a === "close") { closeOverlay(); return; }
  if (a === "mic") { dictateInto("qn"); return; }
  if (a === "save") {
    if (q.saving) return;
    stopDictation();
    const problem = noteProblem(q.text);
    if (problem) { q.error = problem; const e = $("#qnErr"); if (e) e.textContent = problem; return; }
    q.saving = true; q.error = "";
    const btn = document.querySelector('[data-action="qn:save"]'); if (btn) btn.disabled = true;
    try {
      const text = /^\[[A-Z][a-z]{2} \d{1,2}, \d\d:\d\d\]/.test(q.text.trim()) ? q.text.trim() : composeNote("", q.text, stampOf(new Date()));   // typed notes get their time too
      await db.addQuickNote(state.sb, state.user.id, { wine: q.wine.trim(), notes: text }, today());
      await refreshData(); closeOverlay(); state.tab = "journal"; render();
    } catch (e) { q.saving = false; q.error = "Could not save: " + (e.message || e); const er = $("#qnErr"); if (er) er.textContent = q.error; if (btn) btn.disabled = false; }
  }
}
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
  a.insertAdjacentHTML("afterbegin", feelBlockHtml(state.sheet) + proBlockHtml(state.sheet.tasting || {}, state.sheet.style, autoCount({ auto: state.sheet.tastingAuto })));
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
let gridTimer = null, fillTimer = null;
function openGrid() {
  if (!state.sheet) return;
  const values = JSON.parse(JSON.stringify(cleanGrid(state.sheet.tasting || {}, state.sheet.style)));
  state.grid = { values, open: openFromGrid(values) };
  $("#confirm").innerHTML = gridHtml(values, state.grid.open, state.sheet.style, state.sheet.target.name, sheetInfo(state.sheet));
  paintMarks();
  fillGridFromNotes();   // the notes fill in what they can as the grid opens
}
const setGridMsg = (m) => { const el = document.getElementById("gridMsg"); if (el) el.textContent = m || ""; };
// Every tap is kept at once: it goes into the rating window (and moves the structure sliders), and for an entry that already exists it is also
// saved to the database a moment later. For a new entry it is saved together with the rating.
async function saveGridNow() {
  const sheet = state.sheet;
  clearTimeout(gridTimer); gridTimer = null;
  if (!sheet || !sheet.entryId || !sheet.tastingDirty) return;
  try { await saveTasting(state.sb, sheet.entryId, sheet.tasting || {}, sheet.style); sheet.tastingDirty = false; setGridMsg(""); }
  catch (e) { setGridMsg("Not saved yet (" + (e.message || e) + "). It will be saved with the rating."); }
}
function scheduleGridSave() {
  if (!state.sheet || !state.sheet.entryId) return;
  clearTimeout(gridTimer); gridTimer = setTimeout(saveGridNow, 600);
}
// Puts a whole set of grid answers into the rating window: the same path as a tap (structure sliders, saving), whether or not the grid is open.
function applyValues(values, withDims = true) {
  const sheet = state.sheet; if (!sheet) return;
  const style = sheet.style, clean = cleanGrid(values, style);
  sheet.tasting = clean; sheet.tastingDirty = true;
  if (state.grid) { state.grid.values = JSON.parse(JSON.stringify(clean)); state.grid.open = [...new Set([...state.grid.open, ...openFromGrid(clean)])]; syncGridDom(state.grid.values, state.grid.open, style); }
  if (withDims) {
    Object.entries(gridToDims(clean, style)).forEach(([key, value]) => { if (state.sheet.dims[key]) state.sheet = setDim(state.sheet, key, value); });
    state.sheet.taste = null; state.sheet.tasteDirty = true; syncSheet(); showExtras();
  }
  paintMarks();
  scheduleGridSave();
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

// ------- the note legend: reading the notes into the grid (notegrid.js)
const LEGEND_KEY = "wine.legend";
const localMine = () => { try { const v = JSON.parse(store.get(LEGEND_KEY) || "[]"); return Array.isArray(v) ? v : []; } catch (_) { return []; } };
async function ensureLegend() {
  const L = state.legend;
  if (L.loaded) return;
  L.loaded = true;
  try {
    const [shared, mine] = await Promise.all([db.loadSharedLegend(state.sb), db.loadMyLegend(state.sb)]);
    L.shared = shared || []; L.dbMine = mine !== null; L.mine = mine !== null ? mine : localMine();
  } catch (_) { L.shared = []; L.dbMine = false; L.mine = localMine(); }
  L.compiled = null;
}
const compiledLegend = () => { const L = state.legend; return L.compiled || (L.compiled = compileWith(L.shared, L.mine)); };
// A word the player taught (rejected false) or an answer they pushed back on (rejected true). Kept in the database when it is there, otherwise on the phone.
async function addMineLegend(e) {
  const L = state.legend, key = (x) => `${x.phrase}|${x.field}|${x.value}`;
  L.mine = [...L.mine.filter((x) => key(x) !== key(e)), { phrase: e.phrase, field: e.field, value: e.value, rejected: !!e.rejected, share: !!e.share }];
  L.compiled = null;
  if (L.dbMine) { try { await db.saveMyLegend(state.sb, state.user.id, e); return; } catch (_) { /* fall back to the phone */ } }
  store.set(LEGEND_KEY, JSON.stringify(L.mine.slice(-300)));
}
const paintMarks = () => {
  const s = state.sheet; if (!s) return;
  const marks = { auto: s.tastingAuto || {}, evidence: s.tastingEvidence || {}, unplaced: s.unplaced || [] };
  if (state.grid) { paintNoteMarks(marks, state.grid.values, s.style); drawTeach(); }
};
function drawTeach() {
  const el = document.getElementById("gridTeach"); if (!el) return;
  el.innerHTML = state.teach ? teachHtml(state.teach, state.sheet.style, state.legend.dbMine) : "";
}
// Reads the notes and fills in the grid answers they give. The player's own answers are never overwritten, and an answer the player cleared in this rating is not put back.
async function fillGridFromNotes(manual = false) {
  const s = state.sheet;
  if (!s || !state.pro) return;
  await ensureLegend();
  if (state.sheet !== s) return;
  const found = gridFromNotes(s.notes || "", s.style, compiledLegend());
  const blocked = s.tastingBlocked || new Set();
  const values = {};
  for (const [f, v] of Object.entries(found.values)) {
    if (Array.isArray(v)) { const keep = v.filter((t) => !blocked.has(`${f}|${t}`)); if (keep.length) values[f] = keep; }
    else if (!blocked.has(`${f}|${v}`)) values[f] = v;
  }
  const cur = cleanGrid(s.tasting || {}, s.style);
  const r = mergeFromNotes(cur, values, s.tastingAuto || {});
  s.tastingAuto = r.auto; s.tastingEvidence = { ...(s.tastingEvidence || {}), ...found.evidence }; s.tastingTagPhrase = { ...(s.tastingTagPhrase || {}), ...found.tagPhrase }; s.unplaced = found.unplaced;
  if (JSON.stringify(r.values) !== JSON.stringify(cur)) applyValues(r.values);
  else { showExtras(); paintMarks(); if (manual) setGridMsg(found.unplaced.length ? "" : "Nothing new to fill in from your notes."); }
}
// Notes changed (typing or dictation): read them again a moment after the last change.
const scheduleFill = () => { if (!state.pro || !state.sheet) return; clearTimeout(fillTimer); fillTimer = setTimeout(() => fillGridFromNotes(), 900); };
// The player changed the grid by hand: the changed answers are theirs now. Answers they pushed back on are remembered so the notes do not put them back, and the words behind them are noted as "not that".
function afterGridTouch(before) {
  const s = state.sheet, g = state.grid; if (!s || !g) return;
  const after = cleanGrid(g.values, s.style);
  const t = touched(s.tastingAuto || {}, before, after);
  s.tastingAuto = t.auto;
  s.tastingBlocked = s.tastingBlocked || new Set();
  for (const c of t.changed) {
    const items = c.tags ? c.tags.map((tag) => ({ value: tag, phrase: (s.tastingTagPhrase || {})[tag], field: "tag" })) : [{ value: c.value, phrase: ((s.tastingEvidence || {})[c.field] || [])[0], field: c.field }];
    items.forEach((it) => { s.tastingBlocked.add(`${c.field}|${it.value}`); if (it.phrase && it.value !== undefined) addMineLegend({ phrase: it.phrase, field: it.field, value: it.value, rejected: true }); });
  }
  paintMarks(); showExtras();
}
function clearAutoAnswers() {
  const s = state.sheet; if (!s) return;
  const auto = s.tastingAuto || {}, vals = { ...cleanGrid(s.tasting || {}, s.style) };
  s.tastingBlocked = s.tastingBlocked || new Set();
  for (const [f, v] of Object.entries(auto)) {
    if (Array.isArray(v)) { vals[f] = (vals[f] || []).filter((t) => !v.includes(t)); v.forEach((t) => s.tastingBlocked.add(`${f}|${t}`)); if (!vals[f].length) delete vals[f]; }
    else { s.tastingBlocked.add(`${f}|${vals[f]}`); delete vals[f]; }
  }
  s.tastingAuto = {};
  applyValues(vals);
}
async function saveTeach() {
  const t = state.teach, s = state.sheet; if (!t || !s) return;
  const r = legendEntry(t.word, t.field, t.value, s.style);
  if (!r.ok) { t.error = r.why; drawTeach(); return; }
  await addMineLegend({ ...r.entry, share: !!t.share });
  state.teach = null; drawTeach();
  fillGridFromNotes(true);
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
  const problem = validateWineEdit(w.form, w.entry);
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
    run: async () => { await db.deleteJournalEntry(state.sb, id); closeOverlay(); await refreshData(); state.tab = "journal"; render(); },
  });
}
function askDeleteSwipe(wineId) {
  const card = state.cards.find((c) => c.id === wineId);
  if (!card) return;
  askConfirm({
    title: "Delete this swipe?",
    body: esc(wineName(card)),
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
  else if (action === "pick") { const before = cleanGrid(state.grid.values, state.sheet.style); state.grid.values = pickValue(state.grid.values, id, Number(i), state.sheet.style); syncGridDom(state.grid.values, state.grid.open, state.sheet.style); applyGridLive(); afterGridTouch(before); }
  else if (action === "tag") { const before = cleanGrid(state.grid.values, state.sheet.style); const r = tapTag(state.grid.values, state.grid.open, id, Number(i)); state.grid.values = r.grid; state.grid.open = r.open; syncGridDom(state.grid.values, state.grid.open, state.sheet.style); applyGridLive(); afterGridTouch(before); }
  else if (action === "fill") fillGridFromNotes(true);
  else if (action === "clearauto") clearAutoAnswers();
  else if (action === "teach") { state.teach = { word: id, field: "", value: "", share: false, error: "" }; drawTeach(); const el = document.getElementById("gridTeach"); if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" }); }
  else if (action === "tsave") saveTeach();
  else if (action === "tcancel") { state.teach = null; drawTeach(); }
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
  const [action, a, b, c] = t.dataset.action.split(":");
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
    else if (action === "react") {   // change one answer from the Swipes tab: react:WINE:like|dislike
      if (b === "like" || b === "dislike") {
        await db.recordReaction(state.sb, a, b, null, { userId: state.user.id });
        const [familiarity, interest] = LEGACY_OF[b];
        state.states = state.states.map((x) => (x.wine_vintage_id === a ? { ...x, reaction: b, familiarity, interest } : x));
        lastRefreshAt = 0; renderBody();
      }
    }
    else if (action === "answer") {   // the same as swiping that way
      const el = $("#card");
      if (el) { if (el.__resetZoom) el.__resetZoom(false); const l = el.querySelector(`[data-label="${a}"]`); if (l) l.style.opacity = 1; }
      fly(el, a);
    }
    else if (action === "zoomcard") { const el = $("#card"); if (el && el.__toggleZoom) el.__toggleZoom(); }
    else if (action === "game") {     // game:hub, game:bingo, game:card:ID, game:sq:N, game:tot, game:pick:a|b, game:skip, game:totresults, game:totagain, and Guess the Glass: game:guess, game:ghub, game:glevel:L, game:gplay:MODE, game:gpick:N, game:gnext, game:gagain, game:glq:QID:N, game:glearn:N
      if (a === "hub") state.g = { screen: "hub", cardId: null, sq: null };
      else if (a === "bingo") state.g = { screen: "bingo", cardId: null, sq: null };
      else if (a === "card") state.g = { screen: "card", cardId: b, sq: null };
      else if (a === "sq") state.g = { ...state.g, sq: Number(b) };
      else if (a === "tot") { state.g = { screen: "tot", cardId: null, sq: null, totResults: false }; state.totTaste = null; }
      else if (a === "pick" || a === "skip") {   // This or That: the answer goes to the next question that has none yet
        const left = nextPair(state.totAnswers);
        if (left) {
          const choice = a === "skip" ? "skip" : b;
          state.totAnswers = totAnswer(state.totAnswers, left.id, choice); store.set(TOT_KEY, JSON.stringify(state.totAnswers));
          // Saved for the owner's research (see thisorthat.js answerRow). The game never waits for it, and a failed save (for example, the table is not there yet) is not shown.
          const row = answerRow(state.user && state.user.id, left.id, choice);
          if (row && state.sb) db.saveThisOrThat(state.sb, row).catch((e) => console.warn("This or That answer not saved:", e && e.message));
        }
      }
      else if (a === "totresults") state.g = { ...state.g, totResults: true };
      else if (a === "guess" || a === "ghub") {   // the quiz questions are loaded behind it, so "Learn it" can show them
        state.g = { screen: "guess", cardId: null, sq: null }; state.guess.play = null; state.guess.message = "";
        learn.ensureLoaded().then(() => { if (state.tab === "games" && state.g.screen === "guess") renderBody(); });
      }
      else if (a === "glevel") state.guess.level = b === "hard" ? "hard" : "easy";
      else if (a === "gplay") startGuess(b);
      else if (a === "gagain") startGuess(state.guess.play ? state.guess.play.mode : "full");
      else if (a === "gpick") { const p = state.guess.play; if (p && p.round[p.i] && p.picks[p.i] === undefined) p.picks[p.i] = p.round[p.i].choices[Number(b)]; }
      else if (a === "gnext") {
        const p = state.guess.play;
        if (p && p.picks[p.i] !== undefined) {
          p.i += 1;
          if (p.i >= p.round.length) { state.guess.memory = GG.recordRound(state.guess.memory, p.mode, p.level, GG.scoreOf(p.round, p.picks)); store.set(GUESS_KEY, JSON.stringify(state.guess.memory)); }
        }
      }
      else if (a === "glq") {   // a quiz question answered inside the game: saved as an ordinary quiz answer
        const G = state.guess, choice = (G.lqChoices[b] || [])[Number(c)];
        if (!G.lq[b] && choice !== undefined) { const result = learn.answerOne(b, choice); if (result) G.lq[b] = { choice, result }; }
      }
      else if (a === "glearn") {   // opens Learn on the questions about that topic, until the player taps "Show all"
        const t = state.guess.topicList[Number(b)];
        if (t) { learn.focusOn(learn.about([t], 500), GG.topicName(t)); state.tab = "learn"; render(); return; }
      }
      else if (a === "totagain") { state.totAnswers = {}; store.set(TOT_KEY, "{}"); state.g = { screen: "tot", cardId: null, sq: null, totResults: false }; state.totTaste = null; }
      renderBody();
      if (state.g.screen === "tot" && (state.g.totResults || !nextPair(state.totAnswers))) ensureTotTaste();   // the results need the player's own taste to compare with
      if (a === "sq" || a === "gpick") {   // the details (bingo) or the answer and its Why (Guess the Glass) sit underneath: bring them into view
        const d = document.querySelector(a === "sq" ? ".bdetail" : ".greveal");
        if (d && d.scrollIntoView) d.scrollIntoView({ block: "nearest", behavior: reduceMotion() ? "auto" : "smooth" });
      } else if (a !== "glq" && a !== "glevel") { const el = $("#content"); if (el) el.scrollTop = 0; }
    }
    else if (action === "owner" && isOwner()) {   // owner:open, owner:tab:ID, owner:sort:KEY, owner:toggle:ID, owner:filter:ISSUE, owner:resetw, owner:edit:ID, owner:saveprice:ID, owner:savecfg:KEY
      await loadOwnerModule();
      const O = state.owner;
      if (a === "open") { closeSettings(); state.tab = "owner"; O.msg = ""; render(); }
      else if (a === "tab") { O.tab = b; O.q = ""; O.msg = ""; renderBody(); }
      else if (a === "sort") { O.sort[O.tab] = OWN.toggleSort(O.sort[O.tab], b); ownerRedraw(); }
      else if (a === "toggle") { O.open[b] = !O.open[b]; ownerRedraw(); }
      else if (a === "filter") { O.tab = "wines"; O.issue = b; O.q = ""; renderBody(); }
      else if (a === "resetw") { O.weights = {}; renderBody(); }
      else if (a === "edit") { const card = cardById(b); if (card) await ownerWineInfo.open(card, ""); }
      else if (a === "saveprice") await ownerSavePrice(b);
      else if (a === "savecfg") await ownerSaveConfig(b);
      else if (a === "addtag") await ownerAddTag();
      else if (["selall", "selnone", "bulktag", "bulkreach", "wtagadd", "wtagrename", "wtagdel"].includes(a)) await ownerWines(a, b);
      else if (a.startsWith("legend")) await ownerLegend(a, b);
      else if (a.startsWith("ref")) await ownerRef(a, b);
      else if (a === "placefix" || a === "placedismiss") await ownerPlace(a, b, t.dataset.action.split(":").slice(3).join(":"));
      else if (a.startsWith("staff")) await ownerStaff(a, b, c);
      else if (a.startsWith("venue") || ["vbulk", "vurl", "vedit", "vreview"].includes(a)) await ownerVenue(a, b);
    }
    else if (action === "settings" || action === "syncinfo") openSettings();
    else if (action === "setclose") closeSettings();
    else if (action === "plan") await choosePlan(a);   // plan:default, plan:pro
    else if (action === "sync") {   // sync:now, sync:retry:ID, sync:discard:ID
      if (a === "now") await offline.flush(); else if (a === "retry") await offline.retry(b); else if (a === "discard") await offline.discard(b);
      if ($("#settingsPanel")) openSettings();
    }
    else if (action === "import") {   // import:open, import:paste, import:back, import:ratings:on|off, import:go, import:done, import:close
      if (a === "open") await openImport();
      else if (a === "close") { state.imp = null; $("#overlay").innerHTML = ""; }
      else if (a === "paste") readImportText(state.imp ? state.imp.text : "");
      else if (a === "back" && state.imp) { state.imp.step = "pick"; state.imp.error = ""; drawImport(); }
      else if (a === "ratings" && state.imp) { state.imp.useRatings = b === "on"; drawImport(); }
      else if (a === "go") await runImport();
      else if (a === "done") { state.imp = null; $("#overlay").innerHTML = ""; state.tab = "journal"; render(); }
    }
    else if (action === "demo") {     // demo:open, demo:next, demo:back, demo:close
      if (a === "open") await openDemo();
      else if (a === "close") closeDemo();
      else if (state.demo) { state.demo.step = Math.max(0, Math.min(DEMO.STEPS.length - 1, state.demo.step + (a === "next" ? 1 : -1))); state.demo.note = ""; drawDemo(); }
    }
    else if (action === "set") {      // set:text:large, set:swipe:off, ...
      state.settings = changeSetting(state.settings, a, b);
      store.set(SETTINGS_KEY, JSON.stringify(state.settings));
      applySettings(); openSettings();
      if (state.tab === "discover" || a === "mode") renderBody();   // the buttons under the card may have appeared or gone; a new mode changes the words
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
      if (a === "swipes" || a === "journal" || a === "profile" || a === "games") refreshInBackground(a);   // the tab opens at once; fresh data is fetched behind it
      render();
    }
    else if (action === "toggle") { state.sw.open[a] = !state.sw.open[a]; renderBody(); }
    else if (action === "swtab") { state.sw = { ...state.sw, tab: a, status: "all", style: "all", q: "" }; renderBody(); }   // swtab:like|dislike|skip|all
    else if (action === "jincomplete") { state.j.incomplete = !state.j.incomplete; renderJournalList(); }
    else if (action === "swmore") { state.sw.more = !state.sw.more; renderBody(); }
    else if (action === "swg") { const key = decodeURIComponent(a), cur = state.sw.open[key]; state.sw.open[key] = cur === undefined ? false : !cur; renderBody(); }
    else if (action === "delswipe") askDeleteSwipe(a);
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
    else if (action === "dictate") dictateInto("sheet");                                   // speak into the rating sheet's notes
    else if (action === "qnote") { state.qn = { wine: "", text: "", interim: "", listening: false, error: "", saving: false }; $("#overlay").innerHTML = quickNoteHtml(state.qn, dictationSupported()); }
    else if (action === "wfix") toggleFix(a);                                             // wfix:ID
    else if (action === "export") exportNotes();                                           // export:notes
    else if (action === "blind") await blindAction(a, b);                                  // blind:open, blind:new, blind:reveal, blind:pick:ID, ...
    else if (action === "qn") await quickNoteAction(a);                                    // qn:mic, qn:save, qn:close
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
  else if (t.dataset.teach && state.teach) {   // the "what did you mean" form: line, answer, share
    if (t.dataset.teach === "share") state.teach.share = t.checked;
    else { state.teach[t.dataset.teach] = t.value; if (t.dataset.teach === "field") state.teach.value = ""; state.teach.error = ""; drawTeach(); }
  }
  else if (t.dataset.field && state.sheet) { state.sheet[t.dataset.field] = t.value; if (t.dataset.field === "notes") scheduleFill(); }
  else if (t.dataset.pscope !== undefined) syncGrapePlace(t.dataset.pscope);
  else if (t.dataset.speaklang !== undefined) { state.settings = changeSetting(state.settings, "lang", t.value); store.set(SETTINGS_KEY, JSON.stringify(state.settings)); applySettings(); }
  else if (t.dataset.qn && state.qn) state.qn[t.dataset.qn] = t.value;
  else if (t.dataset.bl && state.blind) { if (t.dataset.bl === "q") { state.blind.q = t.value; drawBlind('[data-bl="q"]'); } else if (t.dataset.bl === "notes") state.blind.notes = t.value; else state.blind.guess[t.dataset.bl] = t.value; }
  else if (t.dataset.bt && state.blind) state.blind.form[t.dataset.bt] = t.value;
  else if (t.dataset.form && state.form) state.form[t.dataset.form] = t.value;
  else if (t.dataset.wef && state.wedit) state.wedit.form[t.dataset.wef] = t.value;
  else if (t.dataset.jq !== undefined) { state.j.q = t.value; renderJournalList(); }
  else if (t.dataset.jby !== undefined) { state.j.by = t.value; renderJournalList(); }
  else if (t.dataset.jverdict !== undefined) { state.j.verdict = t.value; renderJournalList(); }
  else if (t.dataset.swsel) {   // group, sort, style or status on the Swipes tab
    state.sw[t.dataset.swsel] = t.value;
    if (t.dataset.swsel === "group") state.sw.sort = defaultSortFor(t.value === "recent" ? "recent" : t.value);
    renderBody();
  }
  else if (t.dataset.swq !== undefined) {   // the search box only redraws the list, so it keeps focus
    state.sw.q = t.value;
    const el = $("#swList");
    if (el) el.innerHTML = swipesListHtml(swipeLists(state.cards, state.states, state.journal), state.sw, state.photoUrls, swipeMatch());
  }
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
  else if ("ownerVenuepaste" in t.dataset) state.venue.paste = t.value;
  else if ("ownerVenueq" in t.dataset) {   // the table is redrawn, so the search box gets its focus back
    state.venue.q = t.value; ownerRedraw();
    const box = document.querySelector("[data-owner-venueq]"); if (box) { box.focus(); try { box.setSelectionRange(box.value.length, box.value.length); } catch (_) {} }
  }
});
document.addEventListener("change", async (ev) => {
  const t = ev.target;
  if (!t || !t.dataset || state.tab !== "owner" || !isOwner()) return;
  const O = state.owner;
  if ("ownerIssue" in t.dataset) { O.issue = t.value; ownerRedraw(); }
  else if ("ownerTagfilter" in t.dataset) { O.tagFilter = t.value; ownerRedraw(); }
  else if ("ownerVfilter" in t.dataset) { O.vfilter = t.value; ownerRedraw(); }
  else if ("ownerVsel" in t.dataset) {   // only the row and the count change, so the table keeps its scroll position
    const sel = ownerVsel(); if (t.checked) sel.add(t.dataset.ownerVsel); else sel.delete(t.dataset.ownerVsel);
    const tr = t.closest("tr"); if (tr) tr.classList.toggle("osel", t.checked);
    const bar = document.querySelector(".ovbulk"), d = ownerData();
    if (bar) bar.outerHTML = OWN.venueBulkBar(O, d, OWN.venueListRows(O, d));
  }
  else if ("ownerSel" in t.dataset) {   // only the row and the count change, so the table keeps its scroll position
    const sel = ownerSel(); if (t.checked) sel.add(t.dataset.ownerSel); else sel.delete(t.dataset.ownerSel);
    const tr = t.closest("tr"); if (tr) tr.classList.toggle("osel", t.checked);
    const bar = document.querySelector(".obulk"), d = ownerData();
    if (bar) bar.outerHTML = OWN.bulkBar(O, d, OWN.shownWineRows(O, d.rows));
  }
  else if ("ownerRolefilter" in t.dataset) { O.roleFilter = t.value; ownerRedraw(); }
  else if ("ownerLens" in t.dataset) { O.lens = t.value; renderBody(); }
  else if ("ownerPlayer" in t.dataset) { O.player = t.value; ownerRedraw(); }
  else if ("ownerW" in t.dataset) { const [lens, key] = t.dataset.ownerW.split(":"); O.weights = { ...O.weights, [lens]: { ...(O.weights[lens] || {}), [key]: t.value } }; ownerRedraw(); }
  else if ("ownerReach" in t.dataset) await ownerSaveReach(t.dataset.ownerReach, t.value);
  else if ("ownerVenuefile" in t.dataset && t.files && t.files[0]) {   // the venue's file, read here in the browser
    try { await loadImportModule(); venueFile(await t.files[0].text()); } catch (e) { ownerSay("Could not read the file: " + (e.message || e)); }
  }
});
applySettings();
window.__wine = { state, fly, render, init, learn, rebuildDeck, photoCache, profile: profileTab, editor: editorTab, account, feedback };
init();

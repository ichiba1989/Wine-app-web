// LIVE post-deployment smoke test for the privilege hardening (release 2). Runs the APP'S OWN data code (data.js, consent.js, visualdata.js,
// vendor/supabase.js) against the PRODUCTION database with the app's own PUBLIC key from config.js, exactly as a visitor's browser does.
// No secret key is used or needed. What it writes, all as one brand-new guest (the same as any first visit): the guest sign-in and its
// profile, the age and consent fields, one "Skip" answer that is then put back (hidden), and one journal note that is then deleted
// (hidden; the app never erases, convention 8). Everything else is read-only or a probe that must be refused. Prints the guest's id so
// the owner can find those rows. Usage: node docs/security/tests/live_smoke.mjs
const root = new URL("../../../", import.meta.url);
const cfg = await import(new URL("config.js", root).href);
const { createClient } = await import(new URL("vendor/supabase.js", root).href);
const db = await import(new URL("data.js?v=live", root).href);
const consent = await import(new URL("consent.js?v=live", root).href);
const visual = await import(new URL("visualdata.js?v=live", root).href);
const URL_ = String(cfg.SUPABASE_URL).replace(/\/$/, ""), KEY = String(cfg.SUPABASE_KEY);
if (/service_role|sb_secret_/.test(KEY)) { console.log("REFUSING: config.js does not hold the public key"); process.exit(3); }
const client = () => createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

let pass = 0, fail = 0;
const check = (ok, label, detail = "") => { if (ok) { pass++; console.log(`PASS  live: ${label}`); } else { fail++; console.log(`FAIL  live: ${label}  [${String(detail).slice(0, 300)}]`); } };
const attempt = async (label, fn, expect = () => true) => { try { const v = await fn(); check(expect(v), label, JSON.stringify(v)); return v; } catch (e) { check(false, label, e && (e.message || e)); return null; } };
const refused = async (label, fn) => { try { const r = await fn(); const e = r && r.error; check(!!e && (e.code === "42501" || /permission denied/i.test(e.message || "")), label, e ? `${e.code} ${e.message}` : "ALLOWED: " + JSON.stringify(r.data).slice(0, 120)); } catch (e) { check(false, label, e.message); } };

// 1. A signed-out visitor (the first visit's reads before the guest sign-in), and what it must no longer do.
const visitor = client();
const cards = await attempt("signed-out: the catalog loads in pieces (v_catalog_cards)", () => db.loadCards(visitor), (c) => Array.isArray(c) && c.length > 0);
if (cards) console.log(`      catalog: ${cards.length} wines`);
await attempt("signed-out: loadVintageWines", () => db.loadVintageWines(visitor), (m) => m && (m.size > 0 || Object.keys(m).length > 0));
await attempt("signed-out: loadReferenceRows", () => db.loadReferenceRows(visitor), Array.isArray);
await attempt("signed-out: loadReferenceLists (returns the lists, or null before reference_lists.sql)", () => db.loadReferenceLists(visitor), (r) => r === null || Array.isArray(r.grapeAliases));
await attempt("signed-out: loadVisualTables (flavor tables)", () => visual.loadVisualTables(visitor), (r) => r && Array.isArray(r.varietals));
await refused("signed-out: reading profiles is refused (permission denied)", () => visitor.from("profiles").select("id").limit(1));
await refused("signed-out: staff_list is refused (permission denied)", () => visitor.rpc("staff_list"));
await refused("signed-out: set_my_plan is refused (permission denied)", () => visitor.rpc("set_my_plan", { p_plan: "pro" }));

// 2. A new guest: sign-in, profile, consent, access, the catalog, a saved answer and a journal note (then hidden again).
const guest = client();
const user = await attempt("guest: anonymous sign-in (ensureUser)", () => db.ensureUser(guest), (u) => u && u.id && u.is_anonymous === true);
if (user) {
  console.log(`      test guest id: ${user.id}`);
  const profile = await attempt("guest: profile exists (sign-up trigger)", () => db.loadProfile(guest, user.id), (p) => p && p.id === user.id && !p.staff_role);
  await attempt("guest: age and consent recorded (acceptConsents)", () => consent.acceptConsents(guest, user.id, profile, () => {}), (p) => p && p.age_attested_rule);
  await attempt("guest: loadAccess = player, no staff permissions", () => db.loadAccess(guest, profile && profile.role), (a) => a && (!a.permissions || a.permissions.length === 0));
  await attempt("guest: the catalog loads signed in", () => db.loadCards(guest), (c) => c.length > 0);
  const { data: others } = await guest.from("profiles").select("id");
  check(Array.isArray(others) && others.length === 1 && others[0].id === user.id, "guest: sees only their own profile row", JSON.stringify(others).slice(0, 120));
  for (const [col, val] of [["staff_role", "owner"], ["role", "admin"], ["tier", "pro"]]) {
    await refused(`guest: cannot set their own ${col}`, () => guest.from("profiles").update({ [col]: val }).eq("id", user.id).select());
  }
  await attempt("guest: staff_list is refused by the function (not an owner)", async () => { const r = await guest.rpc("staff_list"); return r.error ? r.error.message : "allowed"; }, (m) => /Only the owner/.test(m));
  const wv = cards && cards[0] && (cards[0].id || (cards[0].raw && cards[0].raw.wine_vintage_id));
  if (wv) {
    await attempt("guest: a Skip answer is saved (recordReaction)", () => db.recordReaction(guest, wv, "dont_know", { test: "post-deploy" }), () => true);
    await attempt("guest: it reads back (loadStates)", () => db.loadStates(guest), (s) => JSON.stringify(s).includes(wv));
    await attempt("guest: Put back hides it (deleteSwipe)", () => db.deleteSwipe(guest, wv), () => true);
  } else check(false, "guest: no wine id found on the first card", JSON.stringify(cards && cards[0]).slice(0, 200));
  const today = new Date().toISOString().slice(0, 10);
  const entryId = await attempt("guest: a journal note is saved (addQuickNote: user_wines + consumptions)", () => db.addQuickNote(guest, user.id, { wine: "Post-deploy test note", notes: "automated check; hidden right after" }, today), (id) => !!id);
  if (entryId) {
    await attempt("guest: the journal reads it back (loadJournal)", () => db.loadJournal(guest), (rows) => JSON.stringify(rows).includes(String(entryId)));
    await attempt("guest: the note is deleted (hidden) again (deleteJournalEntry)", () => db.deleteJournalEntry(guest, entryId), () => true);
  }
  await attempt("guest: quiz questions and progress read (loadQuizKnowledge)", () => db.loadQuizKnowledge(guest), (k) => k && typeof k === "object");
  await attempt("guest: counts (countSwipesAndJournal)", () => db.countSwipesAndJournal(guest), (c) => c && typeof c === "object");
}
console.log(`\nLIVE SMOKE TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

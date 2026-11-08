// STAGING ONLY (Phase 2.0B.6). Runs the APP'S OWN data code (data.js, consent.js, visualdata.js and the bundled vendor/supabase.js,
// unchanged) against the disposable LOCAL Supabase stack, to show the hardening does not break what the app does: the first visit's
// public reads before sign-in (as anon), the guest sign-in, loading and updating the profile, the plan switch, and the Owner's Roles tab.
// Usage: node docs/security/tests/app_code_tests.mjs <phase>   with SB_ENV_FILE and CTR set (run_anon_tests.sh does this).
// Never targets a hosted project (the URL must be local); never prints a key or token. Synthetic users only.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const phase = process.argv[2] || "?";
const env = Object.fromEntries(readFileSync(process.env.SB_ENV_FILE, "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const URL_ = env.API_URL.replace(/\/$/, "");
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(URL_)) { console.log("REFUSING: not a local API URL"); process.exit(3); }
const KEY = env.PUBLISHABLE_KEY || env.ANON_KEY;   // the app's config.js holds the publishable key
const root = new URL("../../../", import.meta.url);
const { createClient } = await import(new URL("vendor/supabase.js", root).href);   // the app's own pinned library
const db = await import(new URL("data.js?v=test", root).href);
const consent = await import(new URL("consent.js?v=test", root).href);
const visual = await import(new URL("visualdata.js?v=test", root).href);
const sql = (q) => execFileSync("docker", ["exec", "-i", process.env.CTR, "psql", "-X", "-q", "-At", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input: q }).toString().trim();
const client = () => createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

let pass = 0, fail = 0;
const check = (ok, label, detail = "") => { if (ok) { pass++; console.log(`PASS  [${phase}] app code: ${label}`); } else { fail++; console.log(`FAIL  [${phase}] app code: ${label}  [${String(detail).slice(0, 300)}]`); } };
const attempt = async (label, fn, expect = (x) => true) => { try { const v = await fn(); check(expect(v), label, JSON.stringify(v)); return v; } catch (e) { check(false, label, e && (e.message || e)); return null; } };

// 1. The first visit, before the guest sign-in: the reads app.js startEarlyLoads sends with no session (role anon).
const visitor = client();
await attempt("first visit, before sign-in: loadCards (v_catalog_cards, in pieces)", () => db.loadCards(visitor), (cards) => Array.isArray(cards) && cards.length >= 1);
await attempt("first visit, before sign-in: loadVintageWines", () => db.loadVintageWines(visitor), (m) => m && (m.size >= 1 || Object.keys(m).length >= 1 || Array.isArray(m)));
await attempt("first visit, before sign-in: loadReferenceRows", () => db.loadReferenceRows(visitor), Array.isArray);
await attempt("first visit, before sign-in: loadReferenceLists (the four lists, with producers)", () => db.loadReferenceLists(visitor), (r) => r && Array.isArray(r.grapeAliases) && Array.isArray(r.producerAliases));
await attempt("first visit, before sign-in: loadVisualTables (flavor tables)", () => visual.loadVisualTables(visitor), (r) => r && r.varietals.length >= 1 && r.regions.length >= 1);

// 2. The guest: ensureUser signs in anonymously, then the profile, the consent page and the access lookup.
const guest = client();
const user = await attempt("ensureUser: anonymous sign-in (a new guest)", () => db.ensureUser(guest), (u) => u && u.id && u.is_anonymous === true);
if (user) {
  const profile = await attempt("loadProfile: the guest's profile row exists (sign-up trigger)", () => db.loadProfile(guest, user.id), (p) => p && p.id === user.id);
  await attempt("acceptConsents (consent.js): age and terms recorded", () => consent.acceptConsents(guest, user.id, profile, () => {}), (p) => p && p.age_attested_rule && p.consent_version);
  await attempt("attestAge", () => db.attestAge(guest, user.id), (p) => p && p.age_attested_rule === "US-21");
  await attempt("loadAccess: a guest is a player (no staff permissions)", () => db.loadAccess(guest, profile && profile.role), (a) => a && (!a.permissions || a.permissions.length === 0));
  await attempt("loadCards as the signed-in guest", () => db.loadCards(guest), (cards) => cards.length >= 1);
  await attempt("setMyPlan('pro') (the Settings plan row) and back", async () => { await db.setMyPlan(guest, "pro"); const t = sql(`select tier from public.profiles where id = '${user.id}'`); await db.setMyPlan(guest, "default"); return t; }, (t) => t === "pro");
  await attempt("loadStaff is refused for a guest", async () => { try { await db.loadStaff(guest); return "allowed"; } catch (e) { return String(e.message || e); } }, (m) => /Only the owner/.test(m));
}

// 3. The Owner's Roles tab (data.js loadStaff, setStaffRole, removeStaff), with a real password sign-in.
const ownerEmail = `app-owner-${phase}-${Date.now()}@staging.invalid`, memberEmail = `app-member-${phase}-${Date.now()}@staging.invalid`, pw = "Stg-" + Math.random().toString(36).slice(2) + "A1";
const ownerC = client(), memberC = client();
const o = await ownerC.auth.signUp({ email: ownerEmail, password: pw });
const m = await memberC.auth.signUp({ email: memberEmail, password: pw });
check(!o.error && !m.error, "two members sign up with email and password", (o.error || m.error || {}).message);
if (!o.error && !m.error) {
  sql(`update public.profiles set staff_role = 'owner' where id = '${o.data.user.id}'`);
  await attempt("the Owner's access has owner_page and settings_edit", () => db.loadAccess(ownerC, "player"), (a) => a && a.permissions.includes("owner_page") && a.permissions.includes("settings_edit"));
  await attempt("Roles tab: loadStaff lists the Owner", () => db.loadStaff(ownerC), (rows) => rows.some((r) => r.user_id === o.data.user.id));
  await attempt("Roles tab: setStaffRole gives the member Quiz reviewer", () => db.setStaffRole(ownerC, memberEmail, "quiz_reviewer"), () => sql(`select staff_role from public.profiles where id = '${m.data.user.id}'`) === "quiz_reviewer");
  await attempt("Roles tab: removeStaff takes it away", () => db.removeStaff(ownerC, m.data.user.id), () => sql(`select coalesce(staff_role, '<null>') from public.profiles where id = '${m.data.user.id}'`) === "<null>");
}

console.log(`\nAPP CODE TOTAL [${phase}]: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

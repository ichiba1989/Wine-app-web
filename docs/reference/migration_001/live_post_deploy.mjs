// LIVE post-deployment check for Migration 001 r5 (2026-11-08). Uses only the app's PUBLIC key from config.js, as a visitor's browser
// does: no secret key. Checks, against the production Data API, what a visitor and a guest can reach once 001 and 001a are in place:
// the private schema is not served, the read door answers (empty while reference_enabled is 0), and the review door refuses visitors
// and guests. Writes nothing but one new guest (any first visit does that). Usage: node docs/reference/migration_001/live_post_deploy.mjs
const root = new URL("../../../", import.meta.url);
const cfg = await import(new URL("config.js", root).href);
const { createClient } = await import(new URL("vendor/supabase.js", root).href);
// LOCAL_TEST_URL / LOCAL_TEST_KEY: only to try this check on a disposable local stack (a 127.0.0.1 or localhost address).
const local = process.env.LOCAL_TEST_URL && /^http:\/\/(127\.0\.0\.1|localhost):/.test(process.env.LOCAL_TEST_URL);
const URL_ = String(local ? process.env.LOCAL_TEST_URL : cfg.SUPABASE_URL).replace(/\/$/, ""), KEY = String(local ? process.env.LOCAL_TEST_KEY : cfg.SUPABASE_KEY);
if (/service_role/.test(KEY)) { console.log("REFUSING: config.js must hold the public key"); process.exit(3); }
let pass = 0, fail = 0;
const check = (ok, label, detail = "") => { if (ok) { pass++; console.log(`PASS  live 001: ${label}`); } else { fail++; console.log(`FAIL  live 001: ${label}  [${String(detail).slice(0, 300)}]`); } };
const rest = async (path, init = {}, token = null) => {
  const r = await fetch(URL_ + path, { ...init, headers: { apikey: KEY, "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}), ...(init.headers || {}) } });
  let js = null; try { js = await r.json(); } catch (_) {}
  return { st: r.status, js };
};

const door = await rest("/rest/v1/rpc/ref_published_names", { method: "POST", body: "{}" });
if (door.st === 404) {
  console.log("Migration 001 is not deployed yet (public.ref_published_names does not exist). Nothing else to check.");
  process.exit(0);
}
check(door.st === 200 && Array.isArray(door.js) && door.js.length === 0, "a signed-out visitor may call ref_published_names; it returns nothing while reference_enabled is 0", JSON.stringify(door));
for (const tbl of ["entities", "claim_versions", "review_events"]) {
  const r = await rest(`/rest/v1/${tbl}?select=*`, { headers: { "Accept-Profile": "wine_reference" } });
  check(r.st === 406 && r.js && r.js.code === "PGRST106", `the Data API does not serve wine_reference.${tbl} (406 PGRST106)`, JSON.stringify(r));
  const p = await rest(`/rest/v1/${tbl}?select=*`);
  check(p.st === 404, `no table called ${tbl} in the public API`, JSON.stringify(p));
}
const anonReview = await rest("/rest/v1/rpc/ref_review", { method: "POST", body: JSON.stringify({ p_table: "entities", p_id: "00000000-0000-0000-0000-000000000000", p_decision: "submit" }) });
check((anonReview.st === 401 || anonReview.st === 403) && anonReview.js && anonReview.js.code === "42501", "a signed-out visitor cannot call ref_review", JSON.stringify(anonReview));
const guest = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: g, error: ge } = await guest.auth.signInAnonymously();
check(!ge && g && g.session, "a guest signs in anonymously", ge && ge.message);
if (g && g.session) {
  console.log(`      test guest id: ${g.user.id}`);
  const r = await rest("/rest/v1/rpc/ref_review", { method: "POST", body: JSON.stringify({ p_table: "entities", p_id: "00000000-0000-0000-0000-000000000000", p_decision: "submit" }) }, g.session.access_token);
  check(r.st === 403 && /needs ref_edit/.test((r.js && r.js.message) || ""), "a guest is refused by ref_review (needs ref_edit)", JSON.stringify(r));
  const n = await rest("/rest/v1/rpc/ref_published_names", { method: "POST", body: "{}" }, g.session.access_token);
  check(n.st === 200 && Array.isArray(n.js) && n.js.length === 0, "the guest gets nothing from the read door while the switch is off", JSON.stringify(n));
}
console.log(`\nLIVE 001 TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

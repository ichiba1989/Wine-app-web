// LIVE post-deployment check for Migration 002 r1 (2026-11-08). Uses only the app's PUBLIC key from config.js, as a visitor's browser
// does: no secret key. Checks, against the production Data API, what a visitor and a guest can reach once 002 is in place: the two new
// doors (ref_draft, ref_staff) exist and refuse visitors and guests, the private schema (with the new legacy_links) is still not served,
// and the read door still returns nothing while reference_enabled is 0. Writes nothing but one new guest (any first visit does that).
// The Owner's own use of the doors is checked by the Owner in the app (Owner page, Reference tab), not here.
// Usage: node docs/reference/migration_002/live_post_deploy_002.mjs
const root = new URL("../../../", import.meta.url);
const cfg = await import(new URL("config.js", root).href);
const { createClient } = await import(new URL("vendor/supabase.js", root).href);
// LOCAL_TEST_URL / LOCAL_TEST_KEY: only to try this check on a disposable local stack (a 127.0.0.1 or localhost address).
const local = process.env.LOCAL_TEST_URL && /^http:\/\/(127\.0\.0\.1|localhost):/.test(process.env.LOCAL_TEST_URL);
const URL_ = String(local ? process.env.LOCAL_TEST_URL : cfg.SUPABASE_URL).replace(/\/$/, ""), KEY = String(local ? process.env.LOCAL_TEST_KEY : cfg.SUPABASE_KEY);
if (/service_role/.test(KEY)) { console.log("REFUSING: config.js must hold the public key"); process.exit(3); }
let pass = 0, fail = 0;
const check = (ok, label, detail = "") => { if (ok) { pass++; console.log(`PASS  live 002: ${label}`); } else { fail++; console.log(`FAIL  live 002: ${label}  [${String(detail).slice(0, 300)}]`); } };
const rest = async (path, init = {}, token = null) => {
  const r = await fetch(URL_ + path, { ...init, headers: { apikey: KEY, "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}), ...(init.headers || {}) } });
  let js = null; try { js = await r.json(); } catch (_) {}
  return { st: r.status, js };
};
const staff = (token) => rest("/rest/v1/rpc/ref_staff", { method: "POST", body: JSON.stringify({ p_what: "overview", p_args: {} }) }, token);
const draft = (token) => rest("/rest/v1/rpc/ref_draft", { method: "POST", body: JSON.stringify({ p_action: "create_entity", p_data: { kind: "place", name: "live check" } }) }, token);

const first = await staff();
if (first.st === 404 && first.js && first.js.code === "PGRST202") {
  console.log("Migration 002 is not deployed yet (public.ref_staff does not exist). Nothing else to check.");
  process.exit(0);
}
check((first.st === 401 || first.st === 403) && first.js && first.js.code === "42501", "a signed-out visitor cannot call ref_staff (the reference staff read)", JSON.stringify(first));
const d0 = await draft();
check((d0.st === 401 || d0.st === 403) && d0.js && d0.js.code === "42501", "a signed-out visitor cannot call ref_draft (the editorial door)", JSON.stringify(d0));
for (const tbl of ["legacy_links", "entities", "claim_versions"]) {
  const r = await rest(`/rest/v1/${tbl}?select=*`, { headers: { "Accept-Profile": "wine_reference" } });
  check(r.st === 406 && r.js && r.js.code === "PGRST106", `the Data API does not serve wine_reference.${tbl} (406 PGRST106)`, JSON.stringify(r));
  const p = await rest(`/rest/v1/${tbl}?select=*`);
  check(p.st === 404, `no table called ${tbl} in the public API`, JSON.stringify(p));
}
const names = await rest("/rest/v1/rpc/ref_published_names", { method: "POST", body: "{}" });
check(names.st === 200 && Array.isArray(names.js) && names.js.length === 0, "the read door still returns nothing while reference_enabled is 0", JSON.stringify(names));
const guest = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: g, error: ge } = await guest.auth.signInAnonymously();
check(!ge && g && g.session, "a guest signs in anonymously", ge && ge.message);
if (g && g.session) {
  console.log(`      test guest id: ${g.user.id}`);
  const s = await staff(g.session.access_token);
  check(s.st === 403 && /needs a reference permission/.test((s.js && s.js.message) || ""), "a guest is refused by ref_staff (needs a reference permission)", JSON.stringify(s));
  const d = await draft(g.session.access_token);
  check(d.st === 403 && /needs ref_edit/.test((d.js && d.js.message) || ""), "a guest is refused by ref_draft (needs ref_edit); nothing is written", JSON.stringify(d));
  const n = await rest("/rest/v1/rpc/ref_published_names", { method: "POST", body: "{}" }, g.session.access_token);
  check(n.st === 200 && Array.isArray(n.js) && n.js.length === 0, "the guest gets nothing from the read door while the switch is off", JSON.stringify(n));
}
console.log(`\nLIVE 002 TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

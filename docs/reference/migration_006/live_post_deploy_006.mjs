// LIVE post-deployment check for Migration 006 r1 (2026-11-25). Uses only the app's PUBLIC key from config.js, as a visitor's browser
// does: no secret key. Checks, against the production Data API, what a visitor and a guest can reach once 006 is in place: the new read door
// ref_browse exists and refuses visitors and guests (every action), the doors of 002 to 005 still refuse them, the private schema is still
// not served, and the read door still returns nothing while reference_enabled is 0. Writes nothing but one new guest (any first visit does that).
// The Owner's own use of the doors is checked by the Owner in the app (Owner page, Reference tab), not here.
// Usage: node docs/reference/migration_006/live_post_deploy_006.mjs
const root = new URL("../../../", import.meta.url);
const cfg = await import(new URL("config.js", root).href);
const { createClient } = await import(new URL("vendor/supabase.js", root).href);
// LOCAL_TEST_URL / LOCAL_TEST_KEY: only to try this check on a disposable local stack (a 127.0.0.1 or localhost address).
const local = process.env.LOCAL_TEST_URL && /^http:\/\/(127\.0\.0\.1|localhost):/.test(process.env.LOCAL_TEST_URL);
const URL_ = String(local ? process.env.LOCAL_TEST_URL : cfg.SUPABASE_URL).replace(/\/$/, ""), KEY = String(local ? process.env.LOCAL_TEST_KEY : cfg.SUPABASE_KEY);
if (/service_role/.test(KEY)) { console.log("REFUSING: config.js must hold the public key"); process.exit(3); }
let pass = 0, fail = 0;
const check = (ok, label, detail = "") => { if (ok) { pass++; console.log(`PASS  live 006: ${label}`); } else { fail++; console.log(`FAIL  live 006: ${label}  [${String(detail).slice(0, 300)}]`); } };
const rest = async (path, init = {}, token = null) => {
  const r = await fetch(URL_ + path, { ...init, headers: { apikey: KEY, "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}), ...(init.headers || {}) } });
  let js = null; try { js = await r.json(); } catch (_) {}
  return { st: r.status, js };
};
const staff = (token) => rest("/rest/v1/rpc/ref_staff", { method: "POST", body: JSON.stringify({ p_what: "overview", p_args: {} }) }, token);
const draft = (token) => rest("/rest/v1/rpc/ref_draft", { method: "POST", body: JSON.stringify({ p_action: "create_entity", p_data: { kind: "place", name: "live check" } }) }, token);

const tools = (token, action, data = {}) => rest("/rest/v1/rpc/ref_tools", { method: "POST", body: JSON.stringify({ p_action: action, p_data: data }) }, token);
const work = (token, action, data = {}) => rest("/rest/v1/rpc/ref_work", { method: "POST", body: JSON.stringify({ p_action: action, p_data: data }) }, token);
const rulesDoor = (token, action, data = {}) => rest("/rest/v1/rpc/ref_rules", { method: "POST", body: JSON.stringify({ p_action: action, p_data: data }) }, token);
const browse = (token, action, data = {}) => rest("/rest/v1/rpc/ref_browse", { method: "POST", body: JSON.stringify({ p_action: action, p_data: data }) }, token);
const BROWSE = ["evidence", "evidence_sources", "entities", "claims", "link_compare"];
const b0 = await browse(null, "entities");
if (b0.st === 404 && b0.js && b0.js.code === "PGRST202") {
  console.log("Migration 006 is not deployed yet (public.ref_browse does not exist). Nothing else to check.");
  process.exit(0);
}
for (const a of BROWSE) {
  const r = await browse(null, a, { table: "producers", catalog_id: "x" });
  check((r.st === 401 || r.st === 403) && r.js && r.js.code === "42501", `a signed-out visitor cannot call ref_browse (${a})`, JSON.stringify(r));
}
const r0 = await rulesDoor(null, "batches");
check((r0.st === 401 || r0.st === 403) && r0.js && r0.js.code === "42501", "a signed-out visitor cannot call ref_rules (a read)", JSON.stringify(r0));
const r1 = await rulesDoor(null, "stage", { lines: [] });
check((r1.st === 401 || r1.st === 403) && r1.js && r1.js.code === "42501", "a signed-out visitor cannot call ref_rules (staging)", JSON.stringify(r1));
const w0 = await work(null, "assignments");
check((w0.st === 401 || w0.st === 403) && w0.js && w0.js.code === "42501", "a signed-out visitor cannot call ref_work (a read)", JSON.stringify(w0));
const w1 = await work(null, "catalog_place_tree");
check((w1.st === 401 || w1.st === 403) && w1.js && w1.js.code === "42501", "a signed-out visitor cannot call ref_work (a write)", JSON.stringify(w1));
const t0 = await tools(null, "coverage");
check((t0.st === 401 || t0.st === 403) && t0.js && t0.js.code === "42501", "a signed-out visitor cannot call ref_tools (a read)", JSON.stringify(t0));
const t1 = await tools(null, "seed_from_catalog", { table: "producers" });
check((t1.st === 401 || t1.st === 403) && t1.js && t1.js.code === "42501", "a signed-out visitor cannot call ref_tools (a write)", JSON.stringify(t1));
const first = await staff();
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
  const tr = await tools(g.session.access_token, "coverage");
  check(tr.st === 403 && /needs a reference permission/.test((tr.js && tr.js.message) || ""), "a guest is refused by ref_tools reads (needs a reference permission)", JSON.stringify(tr));
  const tw = await tools(g.session.access_token, "seed_from_catalog", { table: "producers" });
  check(tw.st === 403 && /needs ref_edit/.test((tw.js && tw.js.message) || ""), "a guest is refused by ref_tools writes (needs ref_edit); nothing is written", JSON.stringify(tw));
  const wr = await work(g.session.access_token, "rule_grape_report", { lines: [] });
  check(wr.st === 403 && /needs a reference permission/.test((wr.js && wr.js.message) || ""), "a guest is refused by ref_work reads (needs a reference permission)", JSON.stringify(wr));
  const ww = await work(g.session.access_token, "catalog_place_tree");
  check(ww.st === 403 && /needs ref_edit/.test((ww.js && ww.js.message) || ""), "a guest is refused by ref_work writes (needs ref_edit); nothing is written", JSON.stringify(ww));
  const rr = await rulesDoor(g.session.access_token, "batches");
  check(rr.st === 403 && /needs a reference permission/.test((rr.js && rr.js.message) || ""), "a guest is refused by ref_rules reads (needs a reference permission)", JSON.stringify(rr));
  const rw = await rulesDoor(g.session.access_token, "stage", { lines: [] });
  check(rw.st === 403 && /needs ref_edit/.test((rw.js && rw.js.message) || ""), "a guest is refused by ref_rules staging (needs ref_edit); nothing is written", JSON.stringify(rw));
  for (const a of BROWSE) {
    const r = await browse(g.session.access_token, a, { table: "producers", catalog_id: "x" });
    check(r.st === 403 && /needs a reference permission/.test((r.js && r.js.message) || ""), `a guest is refused by ref_browse (${a}; needs a reference permission)`, JSON.stringify(r));
  }
  const n = await rest("/rest/v1/rpc/ref_published_names", { method: "POST", body: "{}" }, g.session.access_token);
  check(n.st === 200 && Array.isArray(n.js) && n.js.length === 0, "the guest gets nothing from the read door while the switch is off", JSON.stringify(n));
}
console.log(`\nLIVE 006 TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// STAGING ONLY. Migration 005 on the Owner page's Reference tab in a real (headless) browser, against the disposable LOCAL Supabase stack
// with 003, 004 and 005 installed (same harness as migration_003/tests/owner_ui_003.mjs). Used through the buttons: the grape rules staged
// for review (the app sends its real code list, aocgrapes.js), a candidate decided, a conflict-free import of an accepted rule as a draft
// fact. Writes only to the local stack. Usage: SB_ENV_FILE=... CTR=... PORT=8126 node docs/reference/migration_005/tests/owner_ui_005.mjs
import { chromium } from "/opt/node-tools/node_modules/playwright/index.mjs";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const env = Object.fromEntries(readFileSync(process.env.SB_ENV_FILE, "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const API = env.API_URL.replace(/\/$/, ""); if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(API)) { console.log("REFUSING: not local"); process.exit(3); }
const KEY = env.ANON_KEY, PORT = process.env.PORT || "8126";
const sql = (q) => execFileSync("docker", ["exec", "-i", process.env.CTR, "psql", "-X", "-q", "-At", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input: q }).toString().trim();
let pass = 0, fail = 0; const check = (ok, label, detail = "") => { if (ok) { pass++; console.log(`PASS  ui: ${label}`); } else { fail++; console.log(`FAIL  ui: ${label}  [${String(detail).slice(0, 300)}]`); } };

const email = `ui-owner-${Date.now()}@staging.invalid`;
const r = await fetch(API + "/auth/v1/signup", { method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "Stg-" + Math.random().toString(36).slice(2) + "A1" }) });
const session = await r.json(); const uid = session.user.id;
sql(`update public.profiles set staff_role = 'owner' where id = '${uid}'`);
const consentVersion = (readFileSync(new URL("../../../../consent.js", import.meta.url), "utf8").match(/CONSENT_VERSION\s*=\s*"([^"]+)"/) || [])[1];
sql(`update public.profiles set age_attested_at = now(), age_attested_rule = 'US-21', consent_version = '${consentVersion}', consent_at = now() where id = '${uid}'`);

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 860 } });
// The app accepts only an https project address (cleanProjectUrl), so it is given a stand-in https address whose requests the browser
// hands to the local stack (route.fetch); nothing leaves this machine.
const FAKE = "https://wineref.local.test";
await ctx.route("**/config.js*", (route) => route.fulfill({ status: 200, contentType: "application/javascript", body: `export const SUPABASE_URL = ${JSON.stringify(FAKE)};\nexport const SUPABASE_KEY = ${JSON.stringify(KEY)};\n` }));
// The test database holds only stand-ins for the catalog, not every player table the app reads at start-up. A read of a table that is
// not there, or a column the stand-in lacks (PGRST205, 42P01, 42703, PGRST200), is answered as an empty list, so the app opens as it would
// for a new player. Only plain table reads (GET or HEAD, not rpc/) are answered this way; every write and every ref_* call is real.
const missing = new Set();
await ctx.route(FAKE + "/**", async (route) => {
  const req = route.request(); const url = req.url(); const resp = await route.fetch({ url: url.replace(FAKE, API) });
  const read = (req.method() === "GET" || req.method() === "HEAD") && /\/rest\/v1\/(?!rpc\/)[a-z_]+/.test(url);
  if (read && resp.status() >= 400 && resp.status() < 500) {
    const body = await resp.text();
    if (req.method() === "HEAD" || /PGRST205|42P01|42703|PGRST200/.test(body)) {
      missing.add(url.split("/rest/v1/")[1].split("?")[0]);
      return route.fulfill({ status: 200, contentType: "application/json", headers: { "content-range": "*/0" }, body: "[]" });
    }
    return route.fulfill({ status: resp.status(), contentType: "application/json", body });
  }
  await route.fulfill({ response: resp });
});
const storageKey = `sb-${new URL(FAKE).hostname.split(".")[0]}-auth-token`;
await ctx.addInitScript(({ k, v, cv }) => { localStorage.setItem(k, v); localStorage.setItem("wine.demoSeen", "1"); localStorage.setItem("wine.consent", cv); }, { k: storageKey, v: JSON.stringify(session), cv: consentVersion });
const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
await p.goto(`http://127.0.0.1:${PORT}/index.html`);
const failed = []; p.on("response", (res) => { if (res.url().startsWith(FAKE) && res.status() >= 400) failed.push(`${res.status()} ${res.url().replace(FAKE, "").split("?")[0]}`); });
await p.waitForSelector('[data-action="settings"]', { timeout: 60000 }).catch(async () => { console.log("PAGE:", (await p.evaluate(() => document.body.innerText)).slice(0, 400), "\nFAILED:", failed.join(", ")); });
await p.waitForFunction(() => window.__wine && window.__wine.state && window.__wine.state.access, null, { timeout: 30000 });
const who = await p.evaluate(() => ({ id: window.__wine.state.user.id, perms: window.__wine.state.access.permissions }));
check(who.id === uid && who.perms.includes("owner_page"), "the app opens signed in as the local Owner, with the Owner page permission", JSON.stringify(who));

// A button inside an open sheet (#overlay) wins over one with the same action on the page beneath it (the venue version has two).
const act = async (action, wait = 900) => {
  const sel = `[data-action="${action}"]`, inSheet = p.locator(`#overlay ${sel}`);
  await ((await inSheet.count()) ? inSheet.first() : p.locator(sel).first()).click(); await p.waitForTimeout(wait);
};
const msg = () => p.evaluate(() => window.__wine.state.owner.msg || "");
const R = () => p.evaluate(() => window.__wine.state.owner.wref);
await act("settings", 500); await act("owner:open", 800); await act("owner:tab:reference", 1500);
await p.waitForSelector('[data-action="owner:wrnew"]', { timeout: 20000 }).catch(() => {});
check(await p.isVisible('[data-action="owner:wrnew"]'), "the Reference tab opens with the new-draft form",
  await p.evaluate(() => JSON.stringify({ err: window.__wine.state.owner.wrefError, msg: window.__wine.state.owner.msg, text: (document.querySelector("#ownerTable") || document.body).innerText.slice(0, 300) })));
check(/Not shown to players/.test(await p.textContent("#ownerTable")), "it says nothing is shown to players (reference_enabled is 0)");
const O = () => p.evaluate(() => { const o = window.__wine.state.owner; return { tax: o.wrTax, cov: o.wrCov, queue: o.wrQueue, imp: o.wrImport, err: o.wr3Error, msg: o.msg }; });
const CATALOG = "select md5(string_agg(t, '|' order by t)) from (select 'p'||p::text t from public.producers p union all select 'w'||w::text from public.wines w union all select 'v'||v::text from public.wine_vintages v union all select 'g'||g::text from public.grapes g union all select 'a'||a::text from public.geo_areas a) x";
const cat0 = sql(CATALOG);
sql(readFileSync(new URL("./prereq_catalog_005.sql", import.meta.url), "utf8"));   // the table-only stand-in row (this test's own)
const AGR = "select md5(string_agg(to_jsonb(r)::text, '|' order by r.rule_ref)) from public.appellation_grape_rules r", agr0 = sql(AGR);

// stage the real code list against the stand-in table
await act("owner:wrview:rules", 2500);
check(/Review and import/.test(await p.textContent("#ownerTable")) && /No batch yet/.test(await p.textContent("#ownerTable")), "Grape rules: the review section opens (no batch yet)", JSON.stringify((await O()).err));
await act("owner:wrrules:stage", 2500);
const batch = await p.evaluate(() => (window.__wine.state.owner.wrBatches || [])[0]);
check(batch && batch.code_lines > 50 && batch.table_rows === 3 && /Staged:/.test(await msg()), "Stage for review: a batch of the whole code list against the table's 3 rows", await msg());
check(/Conflicts \(\d+\)/.test(await p.textContent("#ownerTable")) && /Agree \(1\)/.test(await p.textContent("#ownerTable")), "the states are listed with their counts (Morgon/Gamay agrees)");

// the agreeing Morgon/Gamay rule: take the code list's version
await act("owner:wrcandstate:agree", 1500);
const cand = await p.evaluate(() => (window.__wine.state.owner.wrCands || []).find((c) => c.appellation === "Morgon" && c.grape === "Gamay"));
check(cand && cand.code_rule === "primary" && cand.table_rule === "primary", "the Agree group shows Morgon / Gamay from both lists", JSON.stringify(cand));
check(await p.isVisible(`[data-action="owner:wrcand:${cand.id}:accept_code"]`) && await p.isVisible(`[data-action="owner:wrcand:${cand.id}:accept_table"]`), "both sides can be taken (each has a source)");
await act(`owner:wrcand:${cand.id}:accept_code`, 1500);
check(sql(`select decision from wine_reference.rule_import_candidates where id = '${cand.id}'`) === "accept_code", "Use the code list's: saved", await msg());

// an unresolved line offers no decision
await act("owner:wrcandstate:unresolved", 1500);
const un = await p.evaluate(() => (window.__wine.state.owner.wrCands || [])[0]);
check(un && !(await p.isVisible(`[data-action^="owner:wrcand:${un.id}:accept"]`)), "a candidate not found in the catalog offers no accept button");

// import: waits for the type, then for the links, then makes a draft
await act("owner:wrrules:import", 1800);
check(/still proposed/.test(await msg()), "Import waits while the type is proposed", await msg());
await act("owner:wrview:types", 900); await act("owner:wrtype:relationship:rules_name_grape:active", 1200);
for (const t of ["geo_areas", "grapes"]) { await act("owner:wrview:links", 1200); await act(`owner:wrlinktab:${t}`, 1200); await act("owner:wrtool:seed", 1500); await act("owner:wrtool:confirm", 1500); }
await act("owner:wrview:rules", 2500); await act("owner:wrrules:import", 2000);
check(/1 draft facts made/.test(await msg()) && sql("select count(*) from wine_reference.claims where relationship_type = 'rules_name_grape'") === "1", "Import accepted as drafts: one draft fact (Morgon's rules name Gamay)", await msg());
check(sql("select count(*) from wine_reference.claim_versions where published_at is not null") === "0", "nothing is published");
check(sql(AGR) === agr0 && sql(CATALOG) === cat0, "appellation_grape_rules and the old catalog are unchanged");
check(errs.length === 0, "no page errors", errs.join(" | "));
console.log(`      (player tables not in the test database, answered as empty: ${[...missing].sort().join(", ") || "none"})`);
await browser.close();
console.log(`\nOWNER UI TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

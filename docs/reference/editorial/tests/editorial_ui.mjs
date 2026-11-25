// STAGING ONLY. The editorial work queue on the Owner page's Reference tab in a real (headless) browser, against the disposable LOCAL
// Supabase stack (same harness as migration_003/tests/owner_ui_003.mjs). EXPECT=full: 003, 004 and 005 installed: the To do view, its
// bulk Submit/Approve steps, ticked catalog links confirmed together, ticked grape-rule candidates decided together (never a conflict).
// EXPECT=002: only 002 installed: the To do view names the parts it cannot count yet. Writes only to the local stack.
// Usage: SB_ENV_FILE=... CTR=... PORT=8126 EXPECT=full|002 node docs/reference/editorial/tests/editorial_ui.mjs
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
const O = () => p.evaluate(() => { const o = window.__wine.state.owner; return { tax: o.wrTax, cov: o.wrCov, queue: o.wrQueue, imp: o.wrImport, err: o.wr3Error, msg: o.msg }; });
const CATALOG = "select md5(string_agg(t, '|' order by t)) from (select 'p'||p::text t from public.producers p union all select 'w'||w::text from public.wines w union all select 'v'||v::text from public.wine_vintages v union all select 'g'||g::text from public.grapes g union all select 'a'||a::text from public.geo_areas a) x";
const cat0 = sql(CATALOG);
const EXPECT = process.env.EXPECT || "full";
const Qd = () => p.evaluate(() => window.__wine.state.owner.wrQueueAll);
const item = async (t) => ((await Qd()) || { items: [] }).items.findIndex((i) => i.text.startsWith(t));

await act("owner:wrview:todo", 2500);
let Q = await Qd();
if (EXPECT === "002") {
  check(Q && Q.missing.includes("migration 003") && Q.missing.includes("migration 005") && /Not counted yet \(needs migration 003, migration 005\)/.test(await p.textContent("#ownerTable")),
    "To do on a 002-only database: the parts of 003 and 005 are named as not counted yet", JSON.stringify(Q));
  check(Q.items.some((i) => i.area === "Types"), "the parts 002 can count are still listed (recommended types)");
} else {
  check(Q && Q.missing.length === 0 && Q.items.length === 1 && Q.items[0].area === "Types" && /edition_of/.test(Q.items[0].text), "To do on an empty reference: only the recommended types (your decision)", JSON.stringify(Q));
  // two draft places, then their names and themselves submitted and approved from the To do view
  for (const n of ["Todo Place One", "Todo Place Two"]) { await act("owner:wrview:entities", 800); await p.selectOption('[data-wr="kind"]', "place"); await p.fill('[data-wr="name"]', n); await act("owner:wrnew", 1200); }
  await act("owner:wrview:todo", 2500);
  check((await Qd()).items[await item("names written")].n === 2 && (await Qd()).items[await item("things still drafts")].n === 2, "To do: two draft names and two draft things");
  for (const t of ["names written", "things still drafts", "names waiting", "things waiting"]) { const i = await item(t); if (i >= 0) await act(`owner:wrtodo:${i}`, 2000); await act("owner:wrview:todo", 2000); }
  check(sql("select string_agg(distinct status::text, ',') from wine_reference.entities where kind = 'place'") === "verified" && (await item("approved things not yet published")) >= 0,
    "Submit them / Approve them: names first, then the places; the places now wait only for publishing (never done in bulk)", await msg());
  // ticked catalog links confirmed together
  await act("owner:wrview:links", 1500); await act("owner:wrtool:seed", 2000); await act("owner:wrfilter:waiting", 1500);
  const ids = await p.$$eval('[data-action^="owner:wrtick:"]', (els) => els.map((e) => e.dataset.action.split(":")[2]));
  await act(`owner:wrtick:${ids[0]}`, 300); await act(`owner:wrtick:${ids[1]}`, 300);
  check(/2 ticked/.test(await p.textContent("#ownerTable")), "ticking two suggested links shows the bulk bar");
  await act("owner:wrticked:confirmed", 2000);
  check(sql("select count(*) from wine_reference.legacy_links where catalog_table = 'producers' and status = 'confirmed'") === "2" && /Confirmed: 2 of 2/.test(await msg()), "Confirm ticked: exactly the two ticked links are confirmed", await msg());
  // grape-rule review: tick the agreeing line, never a conflict
  await act("owner:wrview:rules", 2500); await act("owner:wrrules:stage", 2500); await act("owner:wrcandstate:conflict", 1500);
  check(!(await p.$('[data-action^="owner:wrrtick:"]')), "a conflict has no tick box (decided one by one)");
  await act("owner:wrcandstate:agree", 1500);
  const rid = (await p.$$eval('[data-action^="owner:wrrtick:"]', (els) => els.map((e) => e.dataset.action.split(":")[2])))[0];
  await act(`owner:wrrtick:${rid}`, 300); await act("owner:wrrticked:accept_code", 2000);
  check(sql(`select decision from wine_reference.rule_import_candidates where id = '${rid}'`) === "accept_code", "Use the code list's (ticked): the ticked agreeing candidate is decided", await msg());
  await act("owner:wrview:todo", 2500);
  check((await item("candidates in the latest batch")) >= 0 && (await item("producers waiting")) >= 0, "To do now lists the grape-rule candidates still to decide and the producer link still waiting");
  check(sql("select count(*) from wine_reference.claim_versions where published_at is not null") === "0" && sql("select count(*) from wine_reference.entities where published_at is not null") === "0", "nothing was published from the To do view");
}
check(sql(CATALOG) === cat0, "the old catalog itself is unchanged");
check(errs.length === 0, "no page errors", errs.join(" | "));
console.log(`      (player tables not in the test database, answered as empty: ${[...missing].sort().join(", ") || "none"})`);
await browser.close();
console.log(`\nOWNER UI TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

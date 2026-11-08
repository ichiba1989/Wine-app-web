// STAGING ONLY. Migration 003 on the Owner page's Reference tab in a real (headless) browser, against the disposable LOCAL Supabase stack
// with 003 installed (same harness as migration_002/tests/owner_ui.mjs: a real local Owner, the app's own files, a stand-in https address
// routed to the local stack). Used through the buttons: a synthetic approved list pasted and checked, imported and published; the type
// recommendations; catalog drafts, the unambiguous confirmations, an undo; product + edition from the catalog. Writes only to the local
// stack. Usage: SB_ENV_FILE=... CTR=... PORT=8126 node docs/reference/migration_003/tests/owner_ui_003.mjs   (with the repo served on PORT)
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

// the approved document as a source, then the subject areas pasted from a spreadsheet (synthetic codes and names)
await act("owner:wrview:sources", 800);
await p.fill('[data-wr="stitle"]', "UI approved subject list (synthetic)"); await act("owner:wrsource", 1200);
await act("owner:wrview:taxonomy", 1500);
check((await O()).tax && Array.isArray((await O()).tax.domains), "Subject areas: the view opens (migration 003 found)", JSON.stringify((await O()).err));
const tsv = ["domain\tcode\tparent\tsort\tname:en\tname:fr\tname:ja", "UI1\tUI1\t\t1\tUI domain\tDomaine UI\tUI領域",
  "UI1\tUI1.1.1\tUI1.1\t1\tUI leaf\tFeuille UI\t", "UI1\tUI1.1\t\t1\tUI subdomain\tSous-domaine UI\tUIサブ"].join("\n");
await p.selectOption('[data-wr="tsv"]', { label: "UI approved subject list (synthetic): " + new Date().toISOString().slice(0, 10) }).catch(async () => {
  const opts = await p.$$eval('[data-wr="tsv"] option', (os) => os.map((o) => [o.value, o.textContent])); const o = opts.find(([, t]) => t.startsWith("UI approved subject list")); if (o) await p.selectOption('[data-wr="tsv"]', o[0]); });
await p.fill('[data-wr="ttext"]', tsv); await act("owner:wrtax:check", 1500);
let o = await O();
check(o.imp && o.imp.dry_run && o.imp.new_domains.length === 1 && o.imp.new_nodes.length === 2 && o.imp.conflicts.length === 0, "Check: 1 new domain and 2 new subdomains, nothing saved", JSON.stringify(o.imp));
check(sql("select count(*) from wine_reference.taxonomy_domains where code = 'UI1'") === "0", "the check saved nothing");
await p.fill('[data-wr="ttext"]', tsv); await act("owner:wrtax:import", 1800);
o = await O();
check(sql("select count(*) from wine_reference.taxonomy_nodes where code like 'UI1.%'") === "2" && /Imported/.test(await p.textContent("#ownerTable")), "Import: the domain and both subdomains are saved as drafts", JSON.stringify(o.imp));
const dom = (o.tax.domains || []).find((d) => d.code === "UI1");
check(dom && dom.nodes.map((n) => n.code).join(",") === "UI1.1,UI1.1.1" && /UI領域/.test(await p.textContent("#ownerTable")), "the tree shows the subdomains in order with their names (Japanese included)");
for (const dec of ["submit", "approve", "publish"]) await act(`owner:wrtaxrev:UI1:${dec}`, 1800);
check(sql("select count(*) from wine_reference.entities e join wine_reference.taxonomy_nodes n on n.entity_id = e.id where n.code like 'UI1.%' and e.published_at is not null") === "2"
  && sql("select count(*) from wine_reference.taxonomy_domains d join wine_reference.entities e on e.id = d.entity_id where d.code = 'UI1' and e.published_at is not null") === "1",
  "Submit all, Approve all, Publish all: the domain and its subdomains are published", await msg());

// the type recommendations (advice only; nothing is switched on)
await act("owner:wrview:types", 900);
const types = await p.textContent("#ownerTable");
check(/Recommended now/.test(types) && /Your decision/.test(types) && sql("select count(*) from wine_reference.relationship_types where status = 'active'") === "0", "Types: recommendations are shown (bottle format is your decision); nothing is switched on by them");

// catalog links: drafts, the unambiguous confirmations, an undo
await act("owner:wrview:links", 1500);
o = await O();
check(o.cov && o.cov.tables.find((t) => t.catalog_table === "producers").unlinked === 3 && /3 catalog rows/.test(await p.textContent("#ownerTable")), "Catalog links: coverage for producers (3 rows, none linked)", JSON.stringify(o.cov));
await act("owner:wrtool:seed", 2000);
check(/3 drafts made/.test(await msg()) && sql("select count(*) from wine_reference.legacy_links where catalog_table = 'producers' and status = 'suggested' and match_method = 'created_from_catalog'") === "3", "Make drafts: one draft producer per row, each a suggestion", await msg());
await act("owner:wrtool:confirm", 2000);
check(/3 confirmed/.test(await msg()) && sql("select count(*) from wine_reference.legacy_links where catalog_table = 'producers' and status = 'confirmed'") === "3", "Confirm the unambiguous ones: the three rows made from themselves are confirmed", await msg());
await act("owner:wrfilter:confirmed", 1500);
o = await O();
const firstLink = o.queue.rows[0].links[0].id;
await act(`owner:wrundo:${firstLink}`, 1500);
check(sql(`select status from wine_reference.legacy_links where id = '${firstLink}'`) === "rejected", "Undo: a confirmed link becomes rejected (history kept)", await msg());

// product + edition from the catalog's vintages
await act("owner:wrlinktab:wine_vintages", 1500);
await act("owner:wrtool:identity", 2500);
check(/7 built/.test(await msg()) && /Facts waiting for their type to be switched on/.test(await msg()), "Build product + edition for the next 25: all 7 vintages; the facts wait for their types", await msg());
check(sql("select count(*) from wine_reference.entities where kind = 'wine_edition'") === "7" && sql("select count(*) from wine_reference.entities where kind = 'wine_product'") === "6", "7 editions and 6 products (the two vintages of one wine share its product)");
await act("owner:wrfilter:waiting", 1500);
check(/made from this row/.test(await p.textContent("#ownerTable")), "the queue shows each edition as a suggestion made from that row");

check(sql(CATALOG) === cat0, "the old catalog itself is unchanged");
check(errs.length === 0, "no page errors", errs.join(" | "));
check(!/Not saved/.test(await msg()), "the last action was saved", await msg());
console.log(`      (player tables not in the test database, answered as empty: ${[...missing].sort().join(", ") || "none"})`);
await browser.close();
console.log(`\nOWNER UI TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

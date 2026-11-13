// STAGING ONLY. Migration 004 on the Owner page's Reference tab in a real (headless) browser, against the disposable LOCAL Supabase stack
// with 003 and 004 installed (same harness as migration_003/tests/owner_ui_003.mjs). Used through the buttons: the place tree and the
// label grapes drafted from the catalog, a thing put in a subject area and reviewed, and the grape-rules check. Writes only to the local
// stack. Usage: SB_ENV_FILE=... CTR=... PORT=8126 node docs/reference/migration_004/tests/owner_ui_004.mjs   (with the repo served on PORT)
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

// switch on the two types these drafts need (the owner's decision; done here only on the test stack)
await act("owner:wrview:types", 900); await act("owner:wrtype:relationship:part_of:active", 1200); await act("owner:wrtype:relationship:made_from:active", 1200);
check(sql("select string_agg(code, ',' order by code) from wine_reference.relationship_types where status = 'active'") === "made_from,part_of", "Types: part_of and made_from switched on (test stack only)");

// the place tree from the catalog
await act("owner:wrview:links", 1500); await act("owner:wrlinktab:geo_areas", 1500);
await act("owner:wrtool:seed", 1800); await act("owner:wrtool:confirm", 1800);
await act("owner:wrtool:placetree", 2000);
check(/3 "part of" drafts made/.test(await msg()) && sql("select count(*) from wine_reference.claims where relationship_type = 'part_of'") === "3", "Draft the place tree: three 'part of' drafts from the catalog's own tree", await msg());

// the label grapes
await act("owner:wrlinktab:grapes", 1500); await act("owner:wrtool:seed", 1800); await act("owner:wrtool:confirm", 1800);
await act("owner:wrlinktab:wine_vintages", 1500); await act("owner:wrtool:identity", 2500);
await act("owner:wrtool:grapes", 2000);
check(/2 "made from" drafts/.test(await msg()) && /2 grapes skipped/.test(await msg()) && sql("select count(*) from wine_reference.claims where relationship_type = 'made_from'") === "2",
  "Draft grapes from the labels: one 'made from' draft per edition of the wine (2020 and NV; the label grape), the rule grape skipped for each", await msg());

// a subject area, then a place put in it and reviewed
await act("owner:wrview:sources", 800); await p.fill('[data-wr="stitle"]', "UI subject list 004 (synthetic)"); await act("owner:wrsource", 1200);
await act("owner:wrview:taxonomy", 1500);
const opts = await p.$$eval('[data-wr="tsv"] option', (os) => os.map((o) => [o.value, o.textContent])); const so = opts.find(([, t]) => t.startsWith("UI subject list 004"));
await p.selectOption('[data-wr="tsv"]', so[0]);
await p.fill('[data-wr="ttext"]', "domain\tcode\tparent\tname:en\nUA\tUA\t\tUI area\nUA\tUA.1\t\tUI places"); await act("owner:wrtax:import", 1800);
const morgon = sql("select l.entity_id from wine_reference.legacy_links l join public.geo_areas g on g.id::text = l.catalog_id where l.catalog_table = 'geo_areas' and l.status = 'confirmed' and g.name = 'Morgon'");
await act("owner:wrview:entities", 1500); await act(`owner:wropen:${morgon}`, 2000);
check(await p.isVisible('[data-wr="anode"]'), "an opened thing shows the subject-area form", await p.evaluate(() => JSON.stringify({ a: window.__wine.state.owner.wrAssign, e: window.__wine.state.owner.wr4Error })));
await p.selectOption('[data-wr="anode"]', "UA.1"); await p.check('[data-wr="aprimary"]'); await act(`owner:wrassignadd:${morgon}`, 2000);
const aid = sql(`select id from wine_reference.taxonomy_assignments where entity_id = '${morgon}'`);
check(aid && /Subject area UA\.1/.test(await p.textContent("#ownerTable")), "Put in subject area: Morgon is in UA.1 (a draft, shown on its row)", await msg());
await act(`owner:wrassign:${aid}:submit`, 1500); await act(`owner:wrassign:${aid}:approve`, 1500);
check(sql(`select status || '/' || is_primary from wine_reference.taxonomy_assignments where id = '${aid}'`) === "verified/true", "Submit and Approve on the assignment: approved, as the main subject area", await msg());

// the grape-rules check (read-only)
const agr0 = sql("select md5(string_agg(to_jsonb(r)::text, '|' order by r.rule_ref)) from public.appellation_grape_rules r");
await act("owner:wrview:rules", 2500);
const txt = await p.textContent("#ownerTable");
check(/read-only comparison/.test(txt) && /2 rows/.test(txt) && /role/.test(txt), "Grape rules: the check names the table, its rows and columns, and says it changes nothing", txt.slice(0, 300));
check(/<b>1<\/b> code lines are in both/.test(await p.innerHTML("#ownerTable")), "the code list's Morgon/Gamay line is found in the table");
await act("owner:wrrulefilter:extra", 600);
check(/Stand-in Hill/.test(await p.textContent("#ownerTable")) && /permitted/.test(await p.textContent("#ownerTable")), "Only in the table: the row no code line matches, with its place and stored role");
check(sql("select md5(string_agg(to_jsonb(r)::text, '|' order by r.rule_ref)) from public.appellation_grape_rules r") === agr0, "the check changed nothing in appellation_grape_rules");

check(sql(CATALOG) === cat0, "the old catalog itself is unchanged");
check(errs.length === 0, "no page errors", errs.join(" | "));
check(!/Not saved/.test(await msg()), "the last action was saved", await msg());
console.log(`      (player tables not in the test database, answered as empty: ${[...missing].sort().join(", ") || "none"})`);
await browser.close();
console.log(`\nOWNER UI TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

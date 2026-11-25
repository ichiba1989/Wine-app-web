// STAGING ONLY. The review-to-publication workflow on the Owner page's Reference tab in a real (headless) browser, against the disposable
// LOCAL Supabase stack with 003, 004 and 005 installed (same harness as migration_003/tests/owner_ui_003.mjs): long runs (make drafts for all,
// build product + edition for all), evidence added to a draft fact, publishing one at a time with a confirmation from To do, and a
// duplicate merged with "Replace with". Writes only to the local stack. Usage: SB_ENV_FILE=... CTR=... PORT=8126 node .../editorial_ui2.mjs
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
const Qd = () => p.evaluate(() => window.__wine.state.owner.wrQueueAll);
const item = async (t) => ((await Qd()) || { items: [] }).items.findIndex((i) => i.text.startsWith(t));

// long runs: every grape row drafted; every vintage built (product + edition), in steps
await act("owner:wrview:links", 1500); await act("owner:wrlinktab:grapes", 1500);
await act("owner:wrtool:seedall", 4000);
check(/Done: 3 drafts made/.test(await msg()) && sql("select count(*) from wine_reference.legacy_links where catalog_table = 'grapes'") === "3", "Make drafts for all not linked: every grape row drafted, in steps", await msg());
await act("owner:wrview:types", 900); await act("owner:wrtype:relationship:edition_of:active", 1200);   // test stack only: the owner's switch
await act("owner:wrview:links", 1500); await act("owner:wrlinktab:wine_vintages", 1500); await act("owner:wrtool:identityall", 6000);
check(/Done: 7 vintages built/.test(await msg()) && sql("select count(*) from wine_reference.entities where kind = 'wine_edition'") === "7", "Build product + edition for all: all 7 vintages", await msg());

// a fact drafted from the catalog has no evidence; add it in the Facts view
const ver = sql("select v.id from wine_reference.claim_versions v join wine_reference.claims c on c.id = v.claim_id where c.relationship_type = 'edition_of' limit 1");
check(ver && sql(`select count(*) from wine_reference.claim_evidence where claim_version_id = '${ver}'`) === "0", "an edition_of fact drafted from the catalog starts without evidence");
await act("owner:wrview:sources", 800); await p.fill('[data-wr="stitle"]', "UI producer technical sheet (synthetic)"); await act("owner:wrsource", 1200);
await act("owner:wrview:claims", 1500); await act(`owner:wrevopen:${ver}`, 600);
const sv = await p.$$eval('[data-wr="evsv"] option', (os) => os.map((o) => [o.value, o.textContent]).find(([, t]) => t.startsWith("UI producer technical sheet"))[0]);
await p.selectOption('[data-wr="evsv"]', sv); await p.fill('[data-wr="evloc"]', "page 1"); await act(`owner:wrevadd:${ver}`, 1500);
check(sql(`select count(*) from wine_reference.claim_evidence where claim_version_id = '${ver}' and modality = 'documentary' and locator = 'page 1'`) === "1", "Add evidence: the draft fact now has documentary evidence", await msg());

// publish one at a time, from To do, with a confirmation
for (const n of ["Pub Place A", "Pub Place B"]) { await act("owner:wrview:entities", 800); await p.selectOption('[data-wr="kind"]', "place"); await p.fill('[data-wr="name"]', n); await act("owner:wrnew", 1200); }
await act("owner:wrview:todo", 2500);
for (const t of ["names written", "things still drafts", "names waiting", "things waiting"]) { const i = await item(t); if (i >= 0) await act(`owner:wrtodo:${i}`, 2000); await act("owner:wrview:todo", 2000); }
const pi = await item("approved things not yet published");
const labels = pi >= 0 ? (await Qd()).items[pi].publish.rows.map((r) => r.label) : [];
check(labels.includes("Pub Place A") && labels.includes("Pub Place B"), "To do: the two approved places are among the things waiting for publishing (with everything else approved in bulk)", JSON.stringify(labels));
await act(`owner:wrpubq:${pi}`, 500);
const target = (await Qd()).items[pi].publish.rows.find((r) => r.label === "Pub Place A");
await act(`owner:wrpub:${target.id}`, 400);
check(/Confirm: publish/.test(await p.textContent("#ownerTable")) && sql(`select published_at is null from wine_reference.entities where id = '${target.id}'`) === "t", "Publish asks for a confirmation first (nothing published yet)");
await act(`owner:wrpubok:entities:${target.id}`, 2000);
check(sql(`select published_at is not null from wine_reference.entities where id = '${target.id}'`) === "t"
  && sql("select count(*) from wine_reference.entities e join wine_reference.entity_names n on n.entity_id = e.id where n.name = 'Pub Place B' and e.published_at is null") === "1",
  "Confirm: exactly that place is published; the other still waits", await msg());

// merge a duplicate: retire one draft producer in favour of an approved one
const prods = sql("select string_agg(e.id::text, ',' order by n.name) from wine_reference.entities e join wine_reference.entity_names n on n.entity_id = e.id where e.kind = 'grape_variety'").split(",");
const keep = prods[0], dup = prods[1];
for (const dec of ["submit", "approve"]) if (sql(`select status from wine_reference.entities where id = '${keep}'`) !== "verified") await act(`owner:wrent:${keep}:${dec}`, 1200);   // already approved by the bulk step above
await act("owner:wrview:entities", 1200); await act(`owner:wropen:${dup}`, 1500);
await p.selectOption('[data-wr="replby"]', keep); await p.fill('[data-wr="replnote"]', "same variety, test"); await act(`owner:wrreplace:${dup}`, 500);
check(/Confirm: replace/.test(await p.textContent("#ownerTable")) && sql(`select status from wine_reference.entities where id = '${dup}'`) !== "retired", "Replace with asks for a confirmation first");
await act(`owner:wrreplaceok:${dup}`, 2000);
check(sql(`select status || '/' || (superseded_by = '${keep}') from wine_reference.entities where id = '${dup}'`) === "retired/true", "Confirm: the duplicate is retired and points at the variety kept (nothing deleted)", await msg());
check(sql(`select count(*) from wine_reference.entity_names where entity_id = '${dup}'`) !== "0", "its names stay on record");

check(sql("select public.cfg_number('reference_enabled', 0) < 1") === "t", "reference_enabled is still off");
check(sql(CATALOG) === cat0, "the old catalog itself is unchanged");
check(errs.length === 0, "no page errors", errs.join(" | "));
console.log(`      (player tables not in the test database, answered as empty: ${[...missing].sort().join(", ") || "none"})`);
await browser.close();
console.log(`\nOWNER UI TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

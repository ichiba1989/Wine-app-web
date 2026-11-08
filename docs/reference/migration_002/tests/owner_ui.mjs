// STAGING ONLY. The Owner page's Reference tab in a real (headless) browser, against the disposable LOCAL Supabase stack with migration
// 002 installed. The app's files are served from the repository; config.js is answered with the LOCAL address and key (this test only).
// A real local Owner (GoTrue sign-up, staff_role owner) is signed in by putting the session where the database library keeps it.
// The app only accepts an https address, so a stand-in https address is routed to the local stack inside the browser. Then
// the tab is used through its buttons: a place drafted, submitted, approved (own work) and published; a source with rights; a type
// switched on; a fact with evidence published; an old catalog row made into a draft and linked, then confirmed. Writes only to the local
// stack. Usage: SB_ENV_FILE=... CTR=... PORT=8126 node docs/reference/migration_002/tests/owner_ui.mjs   (with the repo served on PORT)
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

const act = async (action, wait = 900) => { await p.click(`[data-action="${action}"]`); await p.waitForTimeout(wait); };
const msg = () => p.evaluate(() => window.__wine.state.owner.msg || "");
const R = () => p.evaluate(() => window.__wine.state.owner.wref);
await act("settings", 500); await act("owner:open", 800); await act("owner:tab:reference", 1500);
await p.waitForSelector('[data-action="owner:wrnew"]', { timeout: 20000 }).catch(() => {});
check(await p.isVisible('[data-action="owner:wrnew"]'), "the Reference tab opens with the new-draft form",
  await p.evaluate(() => JSON.stringify({ err: window.__wine.state.owner.wrefError, msg: window.__wine.state.owner.msg, text: (document.querySelector("#ownerTable") || document.body).innerText.slice(0, 300) })));
check(/Not shown to players/.test(await p.textContent("#ownerTable")), "it says nothing is shown to players (reference_enabled is 0)");

// a place: draft, submit, approve (own work), publish
await p.selectOption('[data-wr="kind"]', "place"); await p.fill('[data-wr="name"]', "UI Test Region"); await act("owner:wrnew", 1200);
let ent = (await R()).entities.find((e) => (e.names || []).some((n) => n.name === "UI Test Region"));
check(ent && ent.status === "draft", "Create draft: the place appears as a draft", await msg());
for (const dec of ["submit", "approve", "publish"]) await act(`owner:wrent:${ent.id}:${dec}`, 1200);
ent = (await R()).entities.find((e) => e.id === ent.id);
check(ent.status === "verified" && ent.published_at, "Submit, Approve, Publish: the place and its name are published", JSON.stringify(ent));
check(sql(`select count(*) from wine_reference.review_events where actor = '${uid}' and decision = 'approve' and owner_override`) === "2", "the two self-approvals (name, place) are recorded as owner approvals");
await act(`owner:wropen:${ent.id}`, 500); await p.fill('[data-wr="addname"]', "Région test UI"); await p.selectOption('[data-wr="addlang"]', "fr"); await act(`owner:wraddname:${ent.id}`, 1200);
ent = (await R()).entities.find((e) => e.id === ent.id);
check((ent.names || []).some((n) => n.name === "Région test UI" && n.language === "fr" && n.status === "draft"), "Names: a French name is added as a draft to the published place");
await p.selectOption('[data-wr="kind"]', "place"); await p.fill('[data-wr="name"]', "UI Test Village"); await act("owner:wrnew", 1200);
const village = (await R()).entities.find((e) => (e.names || []).some((n) => n.name === "UI Test Village"));
for (const dec of ["submit", "approve", "publish"]) await act(`owner:wrent:${village.id}:${dec}`, 1100);

// a source with its rights
await act("owner:wrview:sources", 800);
await p.fill('[data-wr="stitle"]', "UI test specification"); await p.fill('[data-wr="slicence"]', "test-open"); await p.check('[data-wr="squote"]'); await act("owner:wrsource", 1200);
let src = (await R()).sources.find((s) => s.title === "UI test specification");
check(src && src.versions.length === 1 && src.versions[0].rights && src.versions[0].rights.allows_quote, "Create source: the source, its version and its rights (quotable) are drafted");
await act(`owner:wrsrc:${src.id}:submit`, 1400); await act(`owner:wrsrc:${src.id}:approve`, 1400);
src = (await R()).sources.find((s) => s.id === src.id);
check(src.status === "verified" && src.versions[0].status === "verified" && src.versions[0].rights.status === "verified", "Submit all, Approve all: source, rights and version approved", JSON.stringify(src));

// a type switched on, then a fact with evidence
await act("owner:wrview:types", 800); await act("owner:wrtype:relationship:part_of:active", 1200);
check((await R()).relationship_types.find((t) => t.code === "part_of").status === "active", "Types: Switch on makes part_of usable");
await act("owner:wrview:claims", 900);
await p.selectOption('[data-wr="csubject"]', village.id); await p.selectOption('[data-wr="ctype"]', "rel:part_of"); await p.selectOption('[data-wr="cobject"]', ent.id);
await p.selectOption('[data-wr="csv"]', src.versions[0].id); await p.fill('[data-wr="cloc"]', "article 1"); await act("owner:wrclaim", 1300);
let claim = (await R()).claims.find((c) => c.subject_entity_id === village.id);
check(claim && claim.versions[0].status === "draft" && claim.versions[0].evidence === 1, "Create fact: the village is part of the region, with one piece of evidence", await msg());
for (const dec of ["submit", "approve", "publish"]) await act(`owner:wrver:${claim.versions[0].id}:${dec}`, 1200);
claim = (await R()).claims.find((c) => c.id === claim.id);
check(claim.versions[0].published_at && claim.versions[0].current, "Submit, Approve, Publish: the fact is published and current", JSON.stringify(claim.versions[0]));

// the old catalog: make a draft from a catalog row and link it; confirm
await act("owner:wrview:links", 1500);
const sug = await p.evaluate(() => window.__wine.state.owner.wrSuggest);
check(sug && sug.basis === "old catalog, not verified" && sug.rows.length >= 1, "Catalog links: the producers report is shown, marked old catalog, not verified");
const row = sug.rows[0];
await act(`owner:wrmake:${row.catalog_table}:${row.catalog_id}`, 1500);
const link = (await R()).links.find((l) => l.catalog_id === String(row.catalog_id));
check(link && link.status === "suggested", "Make a draft and link: a draft producer is made and a suggested link recorded", await msg());
await act(`owner:wrdecide:${link.id}:confirmed`, 1300);
check((await R()).links.find((l) => l.id === link.id).status === "confirmed", "Confirm: the link is confirmed");
check(!(await p.evaluate(() => window.__wine.state.owner.wrSuggest.rows)).some((x) => String(x.catalog_id) === String(row.catalog_id)), "the confirmed catalog row leaves the report");
check(sql(`select count(*) from public.producers where id::text = '${row.catalog_id}'`) === "1", "the old catalog row itself is unchanged");
check(errs.length === 0, "no page errors", errs.join(" | "));
check(!/Not saved/.test(await msg()), "the last action was saved", await msg());
console.log(`      (player tables not in the test database, answered as empty: ${[...missing].sort().join(", ") || "none"})`);
await browser.close();
console.log(`\nOWNER UI TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// STAGING ONLY. Migration 006's screens on the Owner page's Reference tab in a real (headless) browser, against the disposable LOCAL
// Supabase stack (same harness as docs/reference/editorial/tests/editorial_ui2.mjs). EXPECT=full (006 installed): the Evidence review
// (approve the source, then its version, then the fact, then publish it with a confirmation; a blocked fact shows its reasons and no
// step), Browse all beyond 300 things (Show more to the end), many things put in one subject area (confirmation, progress, Stop, a
// refusal reported on its own), and two candidate links compared side by side then decided by an explicit choice. EXPECT=none (006 not
// installed): every new view says it needs migration 006 and the rest of the tab still works. Writes only to the local stack. Some claim
// types are switched on here (test only). Usage: SB_ENV_FILE=... CTR=... PORT=8126 EXPECT=full|none node .../owner_ui_006.mjs
import { chromium } from "/opt/node-tools/node_modules/playwright/index.mjs";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const env = Object.fromEntries(readFileSync(process.env.SB_ENV_FILE, "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const API = env.API_URL.replace(/\/$/, ""); if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(API)) { console.log("REFUSING: not local"); process.exit(3); }
const KEY = env.ANON_KEY, PORT = process.env.PORT || "8126", FULL = (process.env.EXPECT || "full") === "full";
const sql = (q) => execFileSync("docker", ["exec", "-i", process.env.CTR, "psql", "-X", "-q", "-At", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input: q }).toString().trim();
let pass = 0, fail = 0; const check = (ok, label, detail = "") => { if (ok) { pass++; console.log(`PASS  ui: ${label}`); } else { fail++; console.log(`FAIL  ui: ${label}  [${String(detail).slice(0, 300)}]`); } };

const email = `ui6-owner-${Date.now()}@staging.invalid`;
const r = await fetch(API + "/auth/v1/signup", { method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "Stg-" + Math.random().toString(36).slice(2) + "A1" }) });
const session = await r.json(); const uid = session.user.id;
sql(`update public.profiles set staff_role = 'owner' where id = '${uid}'`);
const consentVersion = (readFileSync(new URL("../../../../consent.js", import.meta.url), "utf8").match(/CONSENT_VERSION\s*=\s*"([^"]+)"/) || [])[1];
sql(`update public.profiles set age_attested_at = now(), age_attested_rule = 'US-21', consent_version = '${consentVersion}', consent_at = now() where id = '${uid}'`);
const rpc = async (fn, body) => { const x = await fetch(`${API}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: KEY, Authorization: "Bearer " + session.access_token, "Content-Type": "application/json" }, body: JSON.stringify(body) }); const js = await x.json().catch(() => null); if (!x.ok) throw new Error(`${fn}: ${x.status} ${JSON.stringify(js)}`); return js; };
const draft = (a, d) => rpc("ref_draft", { p_action: a, p_data: d }), review = (t, id, dec) => rpc("ref_review", { p_table: t, p_id: id, p_decision: dec, p_note: "" });
const tools = (a, d) => rpc("ref_tools", { p_action: a, p_data: d });
const CATALOG = "select md5(string_agg(t, '|' order by t)) from (select 'p'||p::text t from public.producers p union all select 'w'||w::text from public.wines w union all select 'v'||v::text from public.wine_vintages v union all select 'g'||g::text from public.grapes g union all select 'a'||a::text from public.geo_areas a) x";
const cat0 = sql(CATALOG);

// ---------------------------------------------------------------- the content the screens are tried on (through the real doors)
const P_ROW = sql("select id from public.producers where name = 'Domaine Exemple'");
const PR1 = (await draft("create_entity", { kind: "producer", name: "Domaine Exemple", language: "fr" })).entity_id;
const PR2 = (await draft("create_entity", { kind: "producer", name: "Exemple (Domaine)", language: "en" })).entity_id;
await draft("link_catalog", { catalog_table: "producers", catalog_id: P_ROW, entity_id: PR1 }); await draft("link_catalog", { catalog_table: "producers", catalog_id: P_ROW, entity_id: PR2 });
let C1 = null, SRC = null;
if (FULL) {
  for (const code of ["rules_name_grape", "part_of"]) await draft("set_type_status", { table: "relationship", code, status: "active" });   // test stack only
  const ent = async (kind, name) => { const e = await draft("create_entity", { kind, name, language: "en" }); for (const [t, id] of [["entity_names", e.name_id], ["entities", e.entity_id]]) { await review(t, id, "submit"); await review(t, id, "approve"); } await review("entities", e.entity_id, "publish"); return e.entity_id; };
  const place = await ent("place", "UI Appellation"), grape = await ent("grape_variety", "UI Grape");
  SRC = await draft("create_source", { kind: "regulation", title: "UI official rules (synthetic)", url: "https://example.org/ui-rules" });
  C1 = await draft("create_claim", { subject_entity_id: place, relationship_type: "rules_name_grape", object_entity_id: grape, qualifiers: { rule: "sole" },
                                     evidence: [{ source_version_id: SRC.source_version_id, modality: "documentary", role: "supports", locator: "article 2" }] });
  sql(`insert into wine_reference.entities (kind, note) select 'place', 'ui page' from generate_series(1, 340);
       insert into wine_reference.entity_names (entity_id, name, language, name_kind, is_preferred) select id, 'UI Page ' || id, 'en', 'common', true from wine_reference.entities where note = 'ui page';`);
  await tools("create_domain", { code: "TSTUI", sort_order: 1, names: [{ name: "UI domain", language: "en" }] });
  await tools("create_node", { domain: "TSTUI", code: "TSTUI.01", names: [{ name: "UI area", language: "en" }] });
}

// ---------------------------------------------------------------- the app, signed in as the local Owner
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 860 } });
const FAKE = "https://wineref.local.test";
await ctx.route("**/config.js*", (route) => route.fulfill({ status: 200, contentType: "application/javascript", body: `export const SUPABASE_URL = ${JSON.stringify(FAKE)};\nexport const SUPABASE_KEY = ${JSON.stringify(KEY)};\n` }));
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
await p.waitForSelector('[data-action="settings"]', { timeout: 60000 });
await p.waitForFunction(() => window.__wine && window.__wine.state && window.__wine.state.access, null, { timeout: 30000 });
const act = async (action, wait = 900) => {
  const sel = `[data-action="${action}"]`, inSheet = p.locator(`#overlay ${sel}`);
  await ((await inSheet.count()) ? inSheet.first() : p.locator(sel).first()).click(); await p.waitForTimeout(wait);
};
const text = () => p.textContent("#ownerTable");
const msg = () => p.evaluate(() => window.__wine.state.owner.msg || "");
await act("settings", 500); await act("owner:open", 800); await act("owner:tab:reference", 1500);
await p.waitForSelector('[data-action="owner:wrview:evidence"]', { timeout: 20000 });
check(await p.isVisible('[data-action="owner:wrview:evidence"]') && await p.isVisible('[data-action="owner:wrview:browse"]'), "the Reference tab has the Evidence review and Browse all views");

if (!FULL) {
  await act("owner:wrview:evidence", 1500);
  check(/needs migration 006/.test(await text()), "without 006: the Evidence review says it needs migration 006", await text());
  await act("owner:wrview:browse", 1500);
  check(/needs migration 006/.test(await text()), "without 006: Browse all says it needs migration 006");
  await act("owner:wrview:links", 1500); await act("owner:wrfilter:several", 1500);
  await act(`owner:wrcmp:${P_ROW}`, 1500);
  check(/needs migration 006/.test(await text()) && sql("select count(*) from wine_reference.legacy_links where status = 'suggested'") === "2", "without 006: Compare side by side says so and decides nothing");
  await act("owner:wrview:entities", 1500);
  check(/Exemple \(Domaine\)/.test(await text()), "without 006: the rest of the tab works as before (Places & things)");
  await act("owner:wrview:todo", 2500);
  check(!/needs migration 006/.test(await text()) && /Places & things/.test(await text()), "without 006: To do works as before");
} else {
  // ---------------------------------------------------------------- the evidence review, in the order of the work
  await act("owner:wrview:evidence", 2500);
  let t = await text();
  check(/UI official rules \(synthetic\)/.test(t) && /Approve the source before its versions/.test(t) && await p.$(`[data-action="owner:wrevrev:sources:${SRC.source_id}:submit"]`), "1. the source the fact relies on is listed, with what its version waits for and Submit", t.slice(0, 400));
  check(/Cannot be published:|Before it can be published:/.test(t) && /no supporting evidence from a verified, current source version/.test(t) && !(await p.$(`[data-action="owner:wrpub:${C1.claim_version_id}"]`)),
        "3. the fact shows why it cannot be published, with no Publish button", t.slice(0, 600));
  await act(`owner:wrevrev:sources:${SRC.source_id}:submit`, 1800); await act(`owner:wrevrev:source_versions:${SRC.source_version_id}:submit`, 1800);
  t = await text();
  check(/Approve the source before its versions/.test(t) && !(await p.$(`[data-action="owner:wrevrev:source_versions:${SRC.source_version_id}:approve"]`)) && await p.$(`[data-action="owner:wrevrev:sources:${SRC.source_id}:approve"]`),
        "2. the version cannot be approved before its source: no Approve on the version, Approve on the source", t.slice(0, 500));
  await act(`owner:wrevrev:sources:${SRC.source_id}:approve`, 1800);
  await act(`owner:wrevrev:source_versions:${SRC.source_version_id}:approve`, 1800);
  check(sql(`select s.status || '/' || v.status from wine_reference.sources s join wine_reference.source_versions v on v.source_id = s.id where v.id = '${SRC.source_version_id}'`) === "verified/verified",
        "1–2. the source, then its version, approved from the screen (owner approvals)", await msg());
  check(/No source is waiting/.test(await text()), "the sources list is empty once everything is approved");
  await act("owner:wrevstage:draft", 1500); await act(`owner:wrevrev:claim_versions:${C1.claim_version_id}:submit`, 1800);
  await act("owner:wrevstage:pending_review", 1500); await act(`owner:wrevrev:claim_versions:${C1.claim_version_id}:approve`, 1800);
  await act("owner:wrevstage:publishable", 1500);
  check(await p.$(`[data-action="owner:wrpub:${C1.claim_version_id}"]`), "3–4. once approved, the fact is ready to publish");
  await act(`owner:wrpub:${C1.claim_version_id}`, 500);
  check(/Confirm: publish/.test(await text()) && sql(`select published_at is null from wine_reference.claim_versions where id = '${C1.claim_version_id}'`) === "t", "5. Publish asks for a confirmation first (nothing published yet)");
  await act(`owner:wrpubok:claim_versions:${C1.claim_version_id}`, 2000);
  check(sql(`select published_at is not null from wine_reference.claim_versions where id = '${C1.claim_version_id}'`) === "t", "5. Confirm: that one fact is published", await msg());
  await act("owner:wrevstage:published", 1500); check(/current/.test(await text()), "the published fact is listed as current");

  // ---------------------------------------------------------------- Browse all, beyond 300
  await act("owner:wrview:browse", 2500);
  const B = () => p.evaluate(() => { const b = window.__wine.state.owner.wrBrowse; return b && { n: b.rows.length, total: b.total, next: !!b.next, ids: b.rows.map((r) => r.id) }; });
  let b = await B(); const total = Number(sql("select count(*) from wine_reference.entities where status <> 'retired'"));
  check(b.n === 50 && b.total === total && total > 300 && /50 of \d+ shown/.test(await text()), `Browse all: the first 50 of ${total} things, with the total`, JSON.stringify(b));
  while ((await B()).next) await act("owner:wrbpage:more", 900);
  b = await B();
  check(b.n === total && new Set(b.ids).size === total && /End of the list/.test(await text()), `Show more to the end: all ${total} things, none twice`, JSON.stringify({ n: b.n, total }));
  await p.fill('[data-wr="bq"]', "UI Grape"); await act("owner:wrbgo", 1500);
  check((await B()).n === 1 && /UI Grape/.test(await text()), "search by name (server-side)");
  await p.fill('[data-wr="bq"]', "no such thing at all"); await act("owner:wrbgo", 1500);
  check(/Nothing matches/.test(await text()), "an empty result says so");
  await act("owner:wrbwhat:claims", 1500);
  check(/rules_name_grape/.test(await text()) && /End of the list: 1 of 1/.test(await text()), "Facts: the list of every fact, server-backed");

  // ---------------------------------------------------------------- many things into one subject area: confirmation, progress, Stop, a refusal
  await act("owner:wrbwhat:entities", 1500);
  await p.selectOption('[data-wr="basgn"]', "TSTUI.01"); await act("owner:wrbasgn", 1800);
  await act("owner:wrbtickall", 500);
  const ticked = await p.evaluate(() => window.__wine.state.owner.wrAsg.ticks.slice());
  const can = await p.evaluate(() => window.__wine.state.owner.wrBrowse.rows.filter((r) => r.assign === "").length), N = ticked.length;
  check(N === can && N >= 40 && /a subject area itself/.test(await text()), `Tick all that can be added: the ${N} shown that can (subject areas themselves cannot)`, `${N} / ${can}`);
  await tools("assign_taxonomy", { entity_id: ticked[1], node: "TSTUI.01" });   // someone else assigns one behind the screen's back
  await act("owner:wrbasgnask", 400);
  check(new RegExp(`Confirm: assign ${N}`).test(await text()) && sql("select count(*) from wine_reference.taxonomy_assignments") === "1", "assigning asks for a confirmation first");
  await p.locator('[data-action="owner:wrbasgnok"]').click();
  await p.waitForSelector('[data-action="owner:wrbasgnstop"]', { timeout: 5000 }).catch(() => {});
  await p.waitForTimeout(150); await p.evaluate(() => { const b = document.querySelector('[data-action="owner:wrbasgnstop"]'); if (b) b.click(); });   // redrawn after each item
  await p.waitForFunction(() => { const a = window.__wine.state.owner.wrAsg; return a && a.run && !a.run.running; }, null, { timeout: 30000 });
  await p.waitForTimeout(1500);
  const run = await p.evaluate(() => window.__wine.state.owner.wrAsg.run);
  const inDb = Number(sql("select count(*) from wine_reference.taxonomy_assignments")) - 1;
  check(run.stopped && run.results.length < N && run.ok === inDb, `Stop: the run stopped after ${run.results.length} of ${N}; exactly those saved (${inDb})`, JSON.stringify({ ...run, results: run.results.length }));
  check(!run.results.some((x) => x.ok === false) || run.results.find((x) => x.id === ticked[1] && !x.ok), "a refusal is reported on its own line (the one assigned meanwhile)");
  check(/Stopped:/.test(await text()), "the result line says it stopped, with what was done, refused and not tried");
  await act("owner:wrbtickall", 400); await act("owner:wrbasgnask", 400); await act("owner:wrbasgnok", 300);
  await p.waitForFunction(() => { const a = window.__wine.state.owner.wrAsg; return a && a.run && !a.run.running; }, null, { timeout: 60000 }); await p.waitForTimeout(1500);
  const run2 = await p.evaluate(() => window.__wine.state.owner.wrAsg.run);
  check(!run2.stopped && Number(sql("select count(*) from wine_reference.taxonomy_assignments where status = 'draft'")) === N, `run again: every remaining one is added (${N} draft assignments in all, each to be reviewed)`, JSON.stringify({ ok: run2.ok, of: run2.of }));
  check(/already in this subject area/.test(await text()), "the added things now say they are already in the subject area");
  check(sql("select count(*) from wine_reference.taxonomy_domains") === "1" && sql("select count(*) from wine_reference.taxonomy_nodes") === "1", "no subject area was created by the assigning");

  // ---------------------------------------------------------------- two candidates side by side; an explicit choice
  await act("owner:wrview:links", 2000); await act("owner:wrfilter:several", 1500);
  await act(`owner:wrcmp:${P_ROW}`, 1800);
  t = await text();
  check(/2 candidates/.test(t) && /A name is exactly the catalog's/.test(t) && /No name matches the catalog's/.test(t) && /Nothing is chosen for you/.test(t), "Compare side by side: both candidates with their names, status and what is worth noticing", t.slice(0, 600));
  const l1 = sql(`select id from wine_reference.legacy_links where entity_id = '${PR1}'`);
  await act(`owner:wrcmppick:${l1}`, 400);
  check(/Confirm "Domaine Exemple" for "Domaine Exemple"\?/.test(await text()) && sql("select count(*) from wine_reference.legacy_links where status = 'suggested'") === "2", "Choose this one asks for a confirmation first (nothing decided yet)");
  await act(`owner:wrcmpok:${l1}`, 2000);
  check(sql(`select string_agg(status, ',' order by status) from wine_reference.legacy_links where catalog_id = '${P_ROW}'`) === "confirmed,rejected", "Confirm: the chosen link is confirmed; the other is rejected by 003's rule", await msg());
}

check(sql("select public.cfg_number('reference_enabled', 0) < 1") === "t", "reference_enabled is still off");
check(sql(CATALOG) === cat0, "the old catalog itself is unchanged");
check(errs.length === 0, "no page errors", errs.join(" | "));
console.log(`      (player tables not in the test database, answered as empty: ${[...missing].sort().join(", ") || "none"})`);
await browser.close();
console.log(`\nOWNER UI TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

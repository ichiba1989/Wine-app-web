// LIVE post-deployment browser check (release 2 hardening). Serves the published files of main ("/") and vwm ("/vwm/") locally, exactly
// as GitHub Pages copies them (no build), and opens them in a phone-sized headless browser against the PRODUCTION database with the
// app's own public key (config.js). Each version: a first visit (a new guest), the consent page, Discover's first card, then every tab.
// Writes only what any first visit writes (a guest and its consent). Records page errors and any database request refused with 401/403.
// Usage: SITE=<folder with main at its root and vwm in vwm/> PORT=8125 node docs/security/tests/live_ui.mjs
import { chromium } from "/opt/node-tools/node_modules/playwright/index.mjs";
const PORT = process.env.PORT || "8125", BASE = `http://127.0.0.1:${PORT}`;
const browser = await chromium.launch({ args: ["--no-sandbox"] });
let pass = 0, fail = 0;
const check = (ok, label, detail = "") => { if (ok) { pass++; console.log(`PASS  ui: ${label}`); } else { fail++; console.log(`FAIL  ui: ${label}  [${String(detail).slice(0, 400)}]`); } };

for (const [name, path] of [["main", "/"], ["vwm", "/vwm/"]]) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const p = await ctx.newPage();
  const errs = [], refused = [], dbErrors = [];
  p.on("pageerror", (e) => errs.push(e.message));
  p.on("response", async (r) => {
    const u = r.url();
    if (!/supabase\.co/.test(u)) return;
    const st = r.status(), short = u.replace(/^https:\/\/[^/]+/, "").split("?")[0];
    if (st === 401 || st === 403) { let body = ""; try { body = (await r.text()).slice(0, 160); } catch (_) {} refused.push(`${st} ${short} ${body}`); }
    else if (st >= 500) dbErrors.push(`${st} ${short}`);
  });
  await p.goto(BASE + path, { waitUntil: "domcontentloaded" });
  await p.waitForFunction(() => document.querySelector("[data-consent-go]") || document.querySelector("#tabbody"), null, { timeout: 60000 });
  const consentShown = !!(await p.$("[data-consent-go]"));
  check(consentShown, `${name}: a first visit reaches the consent page (guest signed in, profile loaded)`);
  if (consentShown) {
    const n = await p.locator("input[data-consent]").count();   // the page redraws after each tick, so look each box up again
    for (let i = 0; i < n; i++) { await p.locator("input[data-consent]").nth(i).check(); await p.waitForTimeout(200); }
    await p.click("[data-consent-go]");
  }
  await p.waitForSelector("#tabbody", { timeout: 60000 });
  await p.waitForFunction(() => window.__wine && window.__wine.state && window.__wine.state.deck && window.__wine.state.deck.length > 0, null, { timeout: 90000 }).catch(() => {});
  const st = await p.evaluate(() => { const s = window.__wine.state; return { deck: (s.deck || []).length, guest: !!(s.user && s.user.is_anonymous), id: s.user && s.user.id, consent: !!(s.profile && s.profile.consent_version), age: !!(s.profile && s.profile.age_attested_at), staff: s.profile && s.profile.staff_role, tab: s.tab }; });
  console.log(`      ${name}: test guest id ${st.id}`);
  check(st.guest && st.age && st.consent, `${name}: the guest's age and consent are saved on the profile`, JSON.stringify(st));
  check(st.deck > 0 && st.tab === "discover", `${name}: Discover shows its deck (${st.deck} wines)`, JSON.stringify(st));
  check(!st.staff, `${name}: the guest has no staff role`, st.staff);
  await p.waitForTimeout(1500);
  if (await p.$("#demoPanel")) {   // "How the card works" opens once for a brand-new player (convention 14): expected; close it with its own button
    check(true, `${name}: the practice card opens for a brand-new player (as designed)`);
    await p.click('#demoPanel [data-action="demo:close"]'); await p.waitForTimeout(500);
  }
  for (const t of ["swipes", "journal", "profile", "learn", "games"]) {
    await p.click(`.tabs button[data-action="tab:${t}"]`);
    await p.waitForTimeout(1500);
    const cur = await p.evaluate(() => window.__wine.state.tab);
    check(cur === t, `${name}: the ${t === "games" ? "More" : t} tab opens`, cur);
  }
  await p.click('.tabs button[data-action="tab:discover"]'); await p.waitForTimeout(800);
  check(errs.length === 0, `${name}: no page errors`, errs.join(" | "));
  check(refused.length === 0, `${name}: no database request refused (401/403) during the visit`, refused.join(" | "));
  check(dbErrors.length === 0, `${name}: no database server errors`, dbErrors.join(" | "));
  await ctx.close();
}
await browser.close();
console.log(`\nLIVE UI TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

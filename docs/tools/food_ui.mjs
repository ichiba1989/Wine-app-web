import { chromium } from "/opt/node-tools/node_modules/playwright/index.mjs";
import fs from "fs";
const SP = process.env.SP || new URL(".", import.meta.url).pathname.replace(/\/$/, ""), PORT = process.env.PORT || 8125;
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const lib = fs.readFileSync(SP + "/" + (process.env.LIB || "stub_quiz.js"), "utf8"), cards = fs.readFileSync(SP + "/cards_r.json", "utf8");
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, serviceWorkers: "block" });
await ctx.route(/esm\.sh|cdn\.jsdelivr\.net|vendor\/supabase\.js/, (r) => r.fulfill({ status: 200, contentType: "application/javascript", headers: { "access-control-allow-origin": "*" }, body: lib }));
await ctx.route("**/__cards.json", (r) => r.fulfill({ status: 200, contentType: "application/json", body: cards }));
const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
await p.addInitScript({ content: `window.__LAT = 10; localStorage.setItem("wine.consent", "2026-10-e"); localStorage.setItem("wine.demoSeen", "1"); window.__EMPTY = 1; ${process.env.INIT || ""}` });
await p.goto(`http://localhost:${PORT}/index.html`); await p.waitForSelector("#tabbody .card");

await p.evaluate(() => { const c = window.__wine.state.cards.find((x) => x.style === 'red') || window.__wine.state.cards[0]; const b = document.createElement('button'); b.dataset.action = 'review:' + c.id; document.body.appendChild(b); b.click(); });
await p.waitForTimeout(1000);
await p.screenshot({ path: SP + '/food0.png' });
const link = await p.$('[data-action="food:sheet"]');
ok(!!link, 'Food ideas link on the sheet');
if (link) {
  await link.click(); await p.waitForTimeout(300);
  const txt = await p.textContent('#foodIdeas');
  ok(!(await p.$eval('#foodIdeas', (e) => e.hidden)), 'box visible: ' + txt.slice(0, 120));
  await p.screenshot({ path: SP + '/food1.png' });
  await link.click(); ok(await p.$eval('#foodIdeas', (e) => e.hidden), 'second tap hides');
}
ok(errs.length === 0, 'no errors ' + errs.join(' | '));
console.log(`pass ${pass} fail ${fail}`); await browser.close();

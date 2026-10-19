import { chromium } from "/opt/node-tools/node_modules/playwright/index.mjs";
import fs from "fs";
const SP = process.env.SP || new URL(".", import.meta.url).pathname.replace(/\/$/, ""), PORT = process.env.PORT || 8125;
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const lib = fs.readFileSync(SP + "/" + (process.env.LIB || "stub_quiz.js"), "utf8"), cards = fs.readFileSync(SP + "/cards_m3.json", "utf8");
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, serviceWorkers: "block" });
await ctx.route(/esm\.sh|cdn\.jsdelivr\.net|vendor\/supabase\.js/, (r) => r.fulfill({ status: 200, contentType: "application/javascript", headers: { "access-control-allow-origin": "*" }, body: lib }));
await ctx.route("**/__cards.json", (r) => r.fulfill({ status: 200, contentType: "application/json", body: cards }));
const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
await p.addInitScript({ content: `window.__LAT = 10; localStorage.setItem("wine.consent", "2026-10-e"); localStorage.setItem("wine.demoSeen", "1"); window.__EMPTY = 1; ${process.env.INIT || ""}` });
await p.goto(`http://localhost:${PORT}/index.html`); await p.waitForSelector("#tabbody .card");
let found = false;
for (let i = 0; i < 30; i++) { if (/Arnaud Mortet/.test(await p.textContent("#card"))) { found = true; break; } await p.click('button:has-text("Skip")').catch(() => {}); await p.waitForTimeout(300); }
ok(found, "the Mortet card comes up");
if (found) {
  ok(/Charmes-Chambertin Grand Cru/.test(await p.textContent("#card .title")), "title reads Charmes-Chambertin Grand Cru: " + await p.textContent("#card .title"));
  const facts = await p.$$eval("#card .facts span", (s) => s.map((x) => x.textContent));
  ok(facts.includes("Pinot Noir"), "Pinot Noir from the rule: " + facts.join(" | "));
  await p.screenshot({ path: SP + "/mortet-card.png" });
  // Atlas: Charmes-Chambertin page, wines to try lines
  const z = await p.$("#card [data-zoom]"); await z.focus(); await p.keyboard.press("Enter"); await p.waitForSelector(".acard [data-atlas=full]", { timeout: 8000 });
  ok(/Charmes-Chambertin/.test(await p.textContent(".acardt")), "card map on Charmes-Chambertin");
  await p.waitForTimeout(450); await p.click(".acard [data-atlas=full]"); await p.waitForSelector("#atlas [data-atlas-page]:not([hidden])", { timeout: 8000 });
  const page = (await p.textContent("[data-atlas-page]")).replace(/\s+/g, " ");
  ok(/Grapes its rules name\s*Pinot Noir/.test(page), "page names Pinot Noir");
  const tries = await p.$$eval("[data-atlas-page] .jrow.still", (r) => r.map((x) => x.textContent.replace(/\s+/g, " ")));
  ok(tries.some((t) => /Charmes-Chambertin Grand Cru/.test(t) && /Pinot Noir · Charmes-Chambertin/.test(t)), "wines to try: name + info line: " + tries.join(" || "));
  await p.screenshot({ path: SP + "/mortet-atlas.png" });
}
ok(errs.length === 0, "no errors " + errs.join(" | "));
console.log(`pass ${pass} fail ${fail}`); await browser.close();

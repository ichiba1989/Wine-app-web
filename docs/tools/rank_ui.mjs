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
const seen = {};
for (let i = 0; i < 40 && !(seen.b && seen.c); i++) {
  const t = (await p.textContent("#card")).replace(/\s+/g, " ");
  if (/Beau-Séjour Bécot/.test(t) && !seen.b) { seen.b = 1;
    ok(/^\s*Saint-Émilion Grand Cru\s*$/.test(await p.textContent("#card .title")), "Bécot title: " + await p.textContent("#card .title"));
    ok(/Saint-Émilion Grand Cru AOC/.test(await p.textContent("#card .metaline")), "Bécot summary: " + await p.textContent("#card .metaline"));
    await p.screenshot({ path: SP + "/rank-card.png" });
    const z = await p.$("#card [data-zoom]"); await z.focus(); await p.keyboard.press("Enter"); await p.waitForSelector(".acard [data-atlas=full]", { timeout: 8000 });
    await p.waitForTimeout(600);
    ok(/Saint-Émilion Grand Cru/.test(await p.textContent(".acardt")), "card map names it: " + await p.textContent(".acardt"));
    ok(await p.$$eval(".acard path, .acard polygon", (x) => x.length) > 0, "outline drawn");
    await p.screenshot({ path: SP + "/rank-map.png" });
    await p.keyboard.press("Escape"); await p.waitForTimeout(400);
    const close = await p.$(".acard [data-atlas=close], .acard .xbtn"); if (close) { await close.click().catch(() => {}); await p.waitForTimeout(300); }
  }
  if (/Dauvissat/.test(t) && !seen.c) { seen.c = 1;
    ok(/Chablis Grand Cru Les Clos/.test(await p.textContent("#card .title")), "Chablis title: " + await p.textContent("#card .title"));
    const facts = await p.$$eval("#card .facts span", (s) => s.map((x) => x.textContent));
    ok(facts.includes("Chardonnay"), "Chardonnay from the rule: " + facts.join(" | "));
  }
  await p.click('button:has-text("Skip")').catch(() => {}); await p.waitForTimeout(300);
}
ok(seen.b && seen.c, "both cards came up " + JSON.stringify(seen));
ok(errs.length === 0, "no errors " + errs.join(" | "));
console.log(`pass ${pass} fail ${fail}`); await browser.close();

import { chromium } from "/opt/node-tools/node_modules/playwright/index.mjs";
import fs from "fs";
const SP = process.env.SP || new URL(".", import.meta.url).pathname.replace(/\/$/, ""), PORT = process.env.PORT || 8125;
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const lib = fs.readFileSync(SP + "/" + (process.env.LIB || "stub_quiz.js"), "utf8"), cards = fs.readFileSync(SP + "/cards_m.json", "utf8");
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, serviceWorkers: "block" });
await ctx.route(/esm\.sh|cdn\.jsdelivr\.net|vendor\/supabase\.js/, (r) => r.fulfill({ status: 200, contentType: "application/javascript", headers: { "access-control-allow-origin": "*" }, body: lib }));
await ctx.route("**/__cards.json", (r) => r.fulfill({ status: 200, contentType: "application/json", body: cards }));
const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => { errs.push(e.message); console.log("ERR", e.stack.split("\n").slice(0, 3).join(" <- ")); });
await p.addInitScript({ content: `window.__LAT = 10; localStorage.setItem("wine.consent", "2026-10-e"); localStorage.setItem("wine.demoSeen", "1"); window.__EMPTY = 1; ${process.env.INIT || ""}` });
await p.goto(`http://localhost:${PORT}/index.html`); await p.waitForSelector("#tabbody .card");
let found = false;
for (let i = 0; i < 30; i++) {
  const t = await p.textContent("#card");
  if (/Foillard/.test(t)) { found = true; break; }
  await p.click('button:has-text("Skip")').catch(() => {}); await p.waitForTimeout(250);
}
ok(found, "the Foillard card comes up");
if (found) {
  const meta = (await p.textContent("#card .metaline")).replace(/\s+/g, " ");
  ok(/Morgon AOC/.test(meta), "summary says Morgon AOC: " + meta);
  const facts = await p.$$eval("#card .facts span", (s) => s.map((x) => x.textContent));
  ok(facts.includes("Gamay"), "Gamay shown from the rule: " + facts.join(" | "));
  ok(!facts.includes("AOC"), "no loose AOC chip");
  const z = await p.$("#card [data-zoom]"); await z.focus(); await p.keyboard.press("Enter");
  await p.waitForSelector(".acard .astage svg path", { timeout: 8000 });
  ok(/Morgon/.test(await p.textContent(".acardt")) && /Beaujolais/.test(await p.textContent(".acardt")), "card map titled Morgon, Beaujolais: " + (await p.textContent(".acardt")).replace(/\s+/g, " "));
  ok((await p.$eval("[data-atlas-sel]", (e) => e.getAttribute("d").length)) > 50, "Morgon outline marked");
  ok(/INAO/.test(await p.textContent(".acardfoot")), "INAO named");
  await p.screenshot({ path: SP + "/morgon-card.png" });
  await p.waitForTimeout(450); await p.click(".acard [data-atlas=full]"); await p.waitForSelector("#atlas [data-atlas-page]:not([hidden])", { timeout: 8000 });
  const page = (await p.textContent("[data-atlas-page]")).replace(/\s+/g, " ");
  ok(/Morgon/.test(page) && /France › Beaujolais › Morgon/.test(page), "Atlas page chain: " + page.slice(0, 120));
  ok(/AOC/.test(page), "designation on the page");
  await p.screenshot({ path: SP + "/morgon-atlas.png" });
  await p.keyboard.press("Escape"); await p.keyboard.press("Escape");
}
// the Alsace card (no region) is tappable and opens on its AOC
let alsace = false;
for (let i = 0; i < 30; i++) { const t = await p.textContent("#card").catch(() => ""); if (/Domaine Test Alsace/.test(t)) { alsace = true; break; } await p.click('button:has-text("Skip")').catch(() => {}); await p.waitForTimeout(250); }
ok(alsace, "the Alsace card comes up");
if (alsace) {
  const z = await p.$("#card [data-zoom]"); ok(!!z, "Alsace map is tappable");
  if (z) { await z.focus(); await p.keyboard.press("Enter"); await p.waitForSelector(".acard", { timeout: 8000 }); ok(/Alsace/.test(await p.textContent(".acardt")), "opens on Alsace: " + (await p.textContent(".acardt")).replace(/\s+/g, " ")); }
}
ok(errs.length === 0, "no errors " + errs.join(" | "));
console.log(`pass ${pass} fail ${fail}`); await browser.close();

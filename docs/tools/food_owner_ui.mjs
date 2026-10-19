// Food pairing pins: the Owner page's Pairings tab, and what players then see (main app, fake database).
import { chromium } from "/opt/node-tools/node_modules/playwright/index.mjs";
import fs from "fs";
const SP = process.env.SP || new URL(".", import.meta.url).pathname.replace(/\/$/, ""), PORT = process.env.PORT || 8125;
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const lib = fs.readFileSync(SP + "/" + (process.env.LIB || "stub_quiz.js"), "utf8"), cards = fs.readFileSync(SP + "/cards_r.json", "utf8");
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
async function session(init, fn) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, serviceWorkers: "block" });
  await ctx.route(/esm\.sh|cdn\.jsdelivr\.net|vendor\/supabase\.js/, (r) => r.fulfill({ status: 200, contentType: "application/javascript", headers: { "access-control-allow-origin": "*" }, body: lib }));
  await ctx.route("**/__cards.json", (r) => r.fulfill({ status: 200, contentType: "application/json", body: cards }));
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.addInitScript({ content: `window.__LAT = 10; localStorage.setItem("wine.consent", "2026-10-e"); localStorage.setItem("wine.demoSeen", "1"); window.__EMPTY = 1; ${init} ${process.env.INIT || ""}` });
  await p.goto(`http://localhost:${PORT}/index.html`); await p.waitForSelector("#tabbody .card");
  await fn(p); ok(errs.length === 0, "no errors " + errs.join(" | ")); await ctx.close();
}
const txt = async (p, s = "#tabbody") => (await p.textContent(s)).replace(/\s+/g, " ");
const click = async (p, sel) => { await p.click(sel); await p.waitForTimeout(300); };
const synth = (p, action) => p.evaluate((a) => { const b = document.createElement("button"); b.dataset.action = a; document.body.appendChild(b); b.click(); b.remove(); }, action);
const openFood = async (p) => { await click(p, '.tabs [data-action="tab:games"]'); await click(p, '[data-action="game:food"]'); await click(p, '[data-action="fd:go:pick"]'); await click(p, '[data-action="fd:kind:crisp-white"]'); await p.waitForTimeout(400); };
// 1. the owner pins steak with crisp white
await session(`window.__ROLE = "admin"; window.__PINS = [];`, async (p) => {
  await synth(p, "owner:open"); await p.waitForTimeout(500); await synth(p, "owner:tab:pairings"); await p.waitForTimeout(700);
  let t = await txt(p, "#content"); ok(/Rules say/.test(t) && /Steak and grilled red meat/.test(t), "Pairings tab lists dishes: " + t.slice(0, 100));
  await click(p, '[data-action="owner:pkind:crisp-white"]');
  await p.fill("[data-owner-preason]", "Chosen by hand for the test");
  await click(p, '[data-action="owner:ppin:steak:ideal"]'); await p.waitForTimeout(500);
  const w = await p.evaluate(() => window.__PINS.slice()); ok(w.length === 1 && w[0].food_id === "steak" && w[0].kind_id === "crisp-white" && w[0].rating === "ideal" && w[0].reason === "Chosen by hand for the test", "pin saved: " + JSON.stringify(w));
  t = await txt(p, "#content"); ok(/Chosen by hand for the test/.test(t), "pin shows with its reason");
  await p.screenshot({ path: SP + "/food-owner.png" });
});
// 2. a player sees the pin
await session(`window.__PINS = [{ id: 1, food_id: "steak", kind_id: "crisp-white", rating: "ideal", reason: "Chosen by hand for the test", status: "in use" }, { id: 2, food_id: "salad", kind_id: "crisp-white", rating: "avoid", reason: "Not used", status: "suggested" }];`, async (p) => {
  await openFood(p);
  const ideal = await p.$$eval(".fshelf.ideal .fdish", (b) => b.map((x) => x.textContent.trim()));
  ok(ideal.some((x) => /Steak/.test(x)), "the pin moves steak to Ideal: " + ideal.join(" | "));
  ok(ideal.some((x) => /Green salads/.test(x)), "a suggested pin is not used (salad stays Ideal)");
  await click(p, '.fdish:has-text("Steak")'); ok(/Chosen by hand for the test/.test(await txt(p)) && /set by hand/.test(await txt(p)), "the reason and 'set by hand' show");
});
// 3. without the table the rules stand and nothing breaks
await session(`window.__NOPINS = true; window.__ROLE = "admin";`, async (p) => {
  await openFood(p);
  const ideal = await p.$$eval(".fshelf.ideal .fdish", (b) => b.map((x) => x.textContent.trim()));
  ok(!ideal.some((x) => /Steak/.test(x)) && ideal.some((x) => /Oysters/.test(x)), "no table: the rules alone: " + ideal.join(" | "));
  await synth(p, "owner:open"); await p.waitForTimeout(500); await synth(p, "owner:tab:pairings"); await p.waitForTimeout(700);
  ok(/database update/.test(await txt(p, "#content")), "Owner tab says the update is needed");
});
console.log(`food_owner_ui: ${pass} pass ${fail} fail`); await browser.close();

// The More tab and the Food screens (main app, fake database). Needs: python3 -m http.server 8125 from the repository root.
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
const txt = async (s = "#tabbody") => (await p.textContent(s)).replace(/\s+/g, " ");
const click = async (sel) => { await p.click(sel); await p.waitForTimeout(250); };
// the tab bar
const tabs = await p.$$eval(".tabs button", (b) => b.map((x) => x.textContent));
ok(tabs.includes("More") && !tabs.includes("Games"), "tab bar: " + tabs.join());
await click('.tabs [data-action="tab:games"]');
let t = await txt(); ok(/More/.test(t) && /Games/.test(t) && /Food/.test(t), "More shows Games and Food: " + t.slice(0, 80));
// Games still works
await click('[data-action="game:hub"]'); t = await txt(); ok(/Wine Bingo/.test(t) && /This or That/.test(t) && /Guess the Glass/.test(t), "Games hub");
await click('[data-action="game:bingo"]'); ok(/Wine Bingo/.test(await txt()), "Bingo opens");
await click('[data-action="game:hub"]'); await click('[data-action="game:more"]'); ok(/Food/.test(await txt()), "back to More");
// Food home
await click('[data-action="game:food"]'); await p.waitForSelector(".food");
t = await txt(); ok(/Pick a wine, see its plate/.test(t) && /Pairing chart/.test(t) && /Edit food/.test(t), "Food home");
// Pick a wine
await click('[data-action="fd:go:pick"]'); await click('[data-action="fd:kind:full-red"]');
ok((await p.$$(".fshelf")).length === 4, "four shelves");
const ideal = await p.$$eval(".fshelf.ideal .fdish", (b) => b.map((x) => x.textContent.trim()));
ok(ideal.some((x) => /Steak/.test(x)) && !ideal.some((x) => /Oysters/.test(x)), "full red ideal: " + ideal.join(" | "));
await click('[data-action="fd:grapes"]'); ok(/Cabernet Sauvignon/.test(await txt()), "grapes in full red");
await click('.fshelf.ideal .fdish'); ok(/Tweak this dish/.test(await txt()), "dish detail with reasons and tweak button");
await p.screenshot({ path: SP + "/food-pick.png" });
await click('[data-action="fd:kind:rose"]'); ok(!/Show the grapes|Hide the grapes/.test(await txt()), "no grapes listed for rosé");
// Chart
await click('[data-action="fd:go:home"]'); await click('[data-action="fd:go:chart"]');
ok((await p.$$(".fchart tbody tr")).length >= 25 && (await p.$$(".fchart thead th")).length === 11, "chart size");
ok((await p.$$eval(".fc", (b) => b.every((x) => x.getAttribute("aria-label") && x.textContent.trim().length))) , "every cell has a symbol and a label");
const w = await p.$eval(".fscroll", (e) => ({ sw: e.scrollWidth, cw: e.clientWidth })); ok(w.sw > w.cw, "chart scrolls sideways on a phone");
const page = await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1); ok(page, "page itself does not scroll sideways");
await click('.fc.ideal'); ok(/Tweak this dish/.test(await txt()), "chart cell detail");
await click('[data-action="fd:group:fish"]'); ok((await p.$$(".fchart tbody tr")).length === 6, "group filter: fish");
await p.screenshot({ path: SP + "/food-chart.png" });
// Tweak a dish (from the chart cell)
await click('[data-action="fd:go:home"]'); await click('[data-action="fd:go:edit"]'); await click('[data-action="fd:go:tweak"]');
await p.selectOption("#fdDish", "curry"); await p.waitForTimeout(200); await click('[data-action="fd:tkind:full-red"]');
t = await txt(); ok(/Tone down the chili/.test(t), "curry with full red offers less chili");
await p.check('[data-fd-tweak="lessspice"]'); await p.waitForTimeout(250); ok(/with your changes/.test(await txt()), "applied tweak shows the new rating");
await p.screenshot({ path: SP + "/food-tweak.png" });
// Build a plate
await click('[data-action="fd:go:edit"]'); await click('[data-action="fd:go:plate"]');
await click('[data-action="fd:plate:main:whitefish"]'); await click('[data-action="fd:plate:cook:steam"]'); await click('[data-action="fd:plate:sauce:lemon"]');
const top = await p.$$eval(".fprow .serif", (e) => e.map((x) => x.textContent)); ok(/white|Dry sparkling|Ros/.test(top[0]), "fish plate top wine: " + top.join());
await click('[data-action="fd:plate:main:beef"]'); await click('[data-action="fd:plate:sauce:jus"]'); await click('[data-action="fd:plate:cook:grill"]');
const top2 = await p.$$eval(".fprow .serif", (e) => e.map((x) => x.textContent)); ok(/red/i.test(top2[0]), "beef plate top wine: " + top2.join());
await p.screenshot({ path: SP + "/food-plate.png" });
// Plan a menu
await click('[data-action="fd:go:edit"]'); await click('[data-action="fd:go:menu"]');
await click('[data-action="fd:mdish:steak"]'); await click('[data-action="fd:mdish:oysters"]'); await click('[data-action="fd:mdish:chocolate"]');
t = await txt(); ok(/Course 1/.test(t) && /can taste thin/.test(t), "menu flags the heavy-then-light order");
await click('[data-action="fd:mreorder"]'); const order = await p.$$eval(".fcourse .serif", (e) => e.map((x) => x.textContent)); ok(/Oysters/.test(order[0]) && /Chocolate/.test(order[2]), "reordered: " + order.join(" > "));
await click('[data-action="fd:mmode:wines"]'); await click('[data-action="fd:mkind:full-red"]'); await click('[data-action="fd:mkind:crisp-white"]');
ok(/can taste thin/.test(await txt()), "wine order flagged");
await p.screenshot({ path: SP + "/food-menu.png" });
ok(errs.length === 0, "no errors " + errs.join(" | "));
console.log(`food_more_ui: ${pass} pass ${fail} fail`); await browser.close();

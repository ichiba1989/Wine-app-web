// At a restaurant: the whole flow in the More tab (main app, fake database). Needs: python3 -m http.server 8125 from the repository root.
import { chromium } from "/opt/node-tools/node_modules/playwright/index.mjs";
import fs from "fs";
const SP = process.env.SP || new URL(".", import.meta.url).pathname.replace(/\/$/, ""), PORT = process.env.PORT || 8125;
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const lib = fs.readFileSync(SP + "/" + (process.env.LIB || "stub_quiz.js"), "utf8"), cards = fs.readFileSync(SP + "/cards_r.json", "utf8");
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
const LIST = `Sparkling
Champagne Brut NV ........ 95
Prosecco  12 / 48
Whites
2021 Sancerre, Domaine X 62
Chablis Premier Cru 2019   78
Chardonnay, Sonoma Coast 2020  70
Reds
2018 Barolo  120
Pinot Noir Willamette Valley 2020 68
House Red 9 / 34
Château Beau-Séjour Bécot 2019 140
Rosé
Provence Rosé 2023 52
Thank you for dining with us`;
async function session(init, fn, { offline = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, serviceWorkers: "block" });
  await ctx.route(/esm\.sh|cdn\.jsdelivr\.net|vendor\/supabase\.js/, (r) => r.fulfill({ status: 200, contentType: "application/javascript", headers: { "access-control-allow-origin": "*" }, body: lib }));
  await ctx.route("**/__cards.json", (r) => r.fulfill({ status: 200, contentType: "application/json", body: cards }));
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.addInitScript({ content: `window.__LAT = 10; localStorage.setItem("wine.consent", "2026-10-e"); localStorage.setItem("wine.demoSeen", "1"); window.__EMPTY = 1; ${init} ${process.env.INIT || ""}` });
  await p.goto(`http://localhost:${PORT}/index.html`); await p.waitForSelector("#tabbody .card");
  if (offline) { await p.waitForTimeout(5500); await ctx.setOffline(true); }   // after the start-up reads and the quiet preloads
  await fn(p, ctx); ok(errs.length === 0, "no errors " + errs.join(" | ")); await ctx.close();
}
const txt = async (p, s = "#tabbody") => (await p.textContent(s)).replace(/\s+/g, " ");
const click = async (p, sel) => { await p.click(sel); await p.waitForTimeout(250); };
const openRest = async (p) => { await click(p, '.tabs [data-action="tab:games"]'); await click(p, '[data-action="game:rest"]'); await p.waitForTimeout(500); };
// 1. the whole flow, as the owner (who always sees it), with the network cut after start-up
await session(`window.__ROLE = "admin"; window.__VISITS = [];`, async (p, ctx) => {
  await openRest(p);
  ok(/At a restaurant/.test(await txt(p)) && (await p.$('[data-action="rs:start"]')), "the door opens on its home screen");
  await click(p, '[data-action="rs:start"]');
  await p.fill('[data-rs-diner="0"]', "Ribeye steak"); await p.press('[data-rs-diner="0"]', "Tab"); await p.waitForTimeout(300);
  ok(/Matched: Steak and grilled red meat/.test(await txt(p)), "typed dish is matched: " + (await txt(p)).slice(0, 160));
  await click(p, '[data-action="rs:dadd"]');
  await p.selectOption('[data-rs-dish="1"]', "salmon"); await p.waitForTimeout(250);
  ok(/Matched: Roast or grilled salmon/.test(await txt(p)), "a dish chosen from the list");
  await p.fill('[data-rs-diner="0"]', "grandma's secret dish"); await p.press('[data-rs-diner="0"]', "Tab"); await p.waitForTimeout(250);
  ok(/did not recognise/.test(await txt(p)), "an unknown dish is not guessed");
  await p.fill('[data-rs-diner="0"]', "ribeye"); await p.press('[data-rs-diner="0"]', "Tab"); await p.waitForTimeout(250);
  await click(p, '[data-action="rs:go:occasion"]'); await click(p, '[data-action="rs:occ:celebration"]');
  await click(p, '[data-action="rs:go:adventure"]'); await click(p, '[data-action="rs:adv:1"]');
  await click(p, '[data-action="rs:go:list"]');
  await click(p, '[data-action="rs:photo"]'); ok(/not switched on yet/.test(await txt(p)), "the photo button explains it is not on yet");
  await click(p, '[data-action="rs:read"]'); ok(/Add one at least|No wines found/.test(await txt(p)) || /No wines found/.test(await txt(p)), "an empty list is refused kindly");
  await p.fill("[data-rs-list]", LIST);
  await click(p, '[data-action="rs:read"]'); await p.waitForSelector(".rline");
  let t = await txt(p); ok(/10 wines read/.test(t), "ten wines read: " + t.slice(0, 90));
  ok(/House Red/.test(t) && /does not say/.test(t), "a thin line says what is missing");
  ok(!/Thank you for dining/.test((await p.$$eval(".rline", (e) => e.map((x) => x.textContent)).then((a) => a.join(" ")))), "noise is not a wine");
  await p.screenshot({ path: SP + "/rest-check.png", fullPage: false });
  // fix the thin line: it is red and Merlot
  const n = await p.$eval('.rline.low [data-action^="rs:fixstyle"]', (b) => b.dataset.action.split(":")[2]);
  await click(p, `[data-action="rs:fixstyle:${n}:red"]`);
  await p.fill(`[data-rs-grape="${n}"]`, "Merlot"); await p.press(`[data-rs-grape="${n}"]`, "Tab"); await p.waitForTimeout(300);
  ok(/Reads as: Red, Merlot/.test(await txt(p)), "the player's words are used: " + (await txt(p)).match(/Reads as: Red, Merlot/));
  await click(p, '[data-action="rs:results"]'); await p.waitForSelector(".rpick");
  t = await txt(p);
  ok(/To start/.test(t) && /Safe bet/.test(t) && /Something different/.test(t) && /A stretch/.test(t), "toast and the three picks: " + t.slice(0, 120));
  const labels = await p.$$eval(".rlabel", (e) => e.map((x) => x.textContent)); ok(labels.length === 4, "four labelled cards: " + labels.join(", "));
  ok((await p.$$(".rpick .freasons li")).length >= 8, "every pick has reasons");
  ok(!/shelf|wallet/i.test(t), "no shopping talk");
  ok((await p.$$(".rrank")).length >= 9, "the whole list is ranked");
  ok(/House Red|Thank you/.test(t) === false || /Not enough on the list/.test(t) === false, "no unknown-feel line is ranked");
  await p.screenshot({ path: SP + "/rest-results.png" });
  // order one and save
  await click(p, '.rpick .fbtn'); ok(/I ordered this/.test(await txt(p)), "mark a wine as ordered");
  await p.fill("[data-rs-place]", "Chez Test"); await click(p, '[data-action="rs:save"]'); await p.waitForTimeout(400);
  // with no signal the save waits in the outbox (restaurants often have none), then uploads when the phone is back online
  ok(/1 change/.test(await txt(p, "#netchip")), "saved with no signal: waiting to upload: " + (await txt(p, "#netchip")));
  ok(((await p.evaluate(() => (window.__writes || []).filter((x) => x.table === "restaurant_visits"))).length) === 0, "nothing was sent while offline");
  await ctx.setOffline(false); await p.waitForTimeout(3500);
  const w = await p.evaluate(() => (window.__writes || []).filter((x) => x.table === "restaurant_visits"));
  ok(w.length === 1, "one visit uploaded once back online: " + w.length);
  const row = w[0] && w[0].rows[0];
  ok(row && row.place_name === "Chez Test" && row.occasion === "celebration" && row.dishes.length === 2 && row.ordered.length === 1 && new Set(row.ordered).size === 1 && row.picks.length >= 3, "the visit holds the text: " + JSON.stringify(row && { p: row.place_name, o: row.occasion, d: row.dishes.length, ord: row.ordered, picks: row.picks.length }));
  ok(row && !JSON.stringify(row).match(/photo|image|blob|data:/i), "no photo or image in what is kept");
  ok(/Saved/.test(await txt(p)), "it says saved");
  // back home: the past visit is listed, and can be removed
  await click(p, '[data-action="rs:go:home"]');
  ok(/Chez Test/.test(await txt(p)), "past visits lists it");
  await p.screenshot({ path: SP + "/rest-home.png" });
}, { offline: true });
// 2. players do not see it until the switch is on
await session(`window.__ROLE = "player";`, async (p) => {
  await openRest(p); ok(/Coming soon/.test(await txt(p)) && !(await p.$('[data-action="rs:start"]')), "a player sees Coming soon while the switch is off");
});
await session(`window.__ROLE = "player"; window.__CONFIG = [{ key: "restaurant_visits_open", value: 1 }]; window.__VISITS = [{ id: 7, visited_on: "2026-10-01", place_name: "Old Place", occasion: "date", ordered: ["2018 Barolo"], dishes: [], picks: [] }];`, async (p) => {
  await openRest(p); await p.waitForTimeout(500);
  ok(/Old Place/.test(await txt(p)) && (await p.$('[data-action="rs:start"]')), "with the switch on a player sees it and their past visits");
});
console.log(`restaurant_ui: ${pass} pass ${fail} fail`); await browser.close();

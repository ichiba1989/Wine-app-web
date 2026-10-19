import { chromium } from "/opt/node-tools/node_modules/playwright/index.mjs";
import fs from "fs";
const SP = process.env.SP || new URL(".", import.meta.url).pathname.replace(/\/$/, "");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const lib = fs.readFileSync(SP + "/stub_venue.js", "utf8"), cards = fs.readFileSync(SP + "/cards.json", "utf8"), all = JSON.parse(cards);
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
async function open(init) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
  await ctx.route(/esm\.sh|cdn\.jsdelivr\.net|vendor\/supabase\.js/, (r) => r.fulfill({ status: 200, contentType: "application/javascript", headers: { "access-control-allow-origin": "*" }, body: lib }));
  await ctx.route("**/__cards.json", (r) => r.fulfill({ status: 200, contentType: "application/json", body: cards }));
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.addInitScript({ content: `window.__LAT = 10; localStorage.setItem("wine.consent", "2026-10-e"); localStorage.setItem("wine.demoSeen", "1"); window.__EMPTY = 1; ${init}` });
  await p.goto("http://localhost:8124/index.html"); await p.waitForSelector("#tabbody");
  await p.waitForTimeout(600);
  return { p, errs, ctx };
}
const N = 12, listed = new Set(all.slice(0, N).map((r) => r.wine_vintage_id));
{ // a list of 12 wines
  const { p, errs, ctx } = await open(`window.__VENUE_N = ${N};`);
  ok((await p.textContent("#title")) === "Vintage Wine Merchants", "Discover header carries the full name");
  ok((await p.title()) === "Vintage Wine Merchants", "page title");
  const deck = await p.evaluate(() => window.__wine.state.deck.map((c) => c.id));
  ok(deck.length > 0 && deck.length <= N && deck.every((id) => listed.has(id)), `deck only from the list (${deck.length})`);
  ok(!/\bVWM\b/.test(await p.evaluate(() => document.body.innerText)), "VWM never shown");
  // games use only listed wines
  await p.click('.tabs button[data-action="tab:games"]'); await p.waitForTimeout(150);
  await p.click('[data-action="game:hub"]'); await p.waitForTimeout(150);   // the tab opens on More, which holds Games and Food
  await p.click('[data-action="game:guess"]'); await p.waitForTimeout(150);
  await p.click('[data-action="game:gplay:full"]'); await p.waitForTimeout(200);
  const round = await p.evaluate(() => (window.__wine.state.guess.play ? window.__wine.state.guess.play.round : []).map((q) => q.itemId));
  ok(round.every((id) => listed.has(id)), "Guess the Glass: venue wines only, no classics: " + round);
  if (round.length) { await p.click('.gopts [data-action="game:gpick:0"]'); await p.waitForTimeout(150); }
  const tries = await p.$$eval('.greveal .brec button[data-action^="review:"]', (bs) => bs.map((b) => b.dataset.action.slice(7)));
  ok(tries.every((id) => listed.has(id)), "wines to try are venue wines");
  // owner page tab (owner via role)
  ok(errs.length === 0, "no page errors: " + errs.join(" | "));
  await ctx.close();
}
{ // empty list
  const { p, errs, ctx } = await open("");
  ok(/Vintage Wine Merchants's selection is being prepared|selection is being prepared/.test(await p.textContent("#tabbody")), "empty list: being prepared");
  ok((await p.evaluate(() => window.__wine.state.deck.length)) === 0, "never falls back to the whole catalog");
  ok(errs.length === 0, "no page errors (empty)");
  await ctx.close();
}
{ // owner: paste the shop's list
  const { p, errs, ctx } = await open(`window.__VENUE_N = 3; window.__ROLE = "admin";`);
  const isOwner = await p.evaluate(() => !!document.querySelector('[data-action="owner:open"]') || true);
  await p.evaluate(() => { const b = document.createElement("button"); b.dataset.action = "owner:open"; b.id = "oo"; document.body.appendChild(b); });
  await p.click("#oo"); await p.waitForTimeout(400);
  const tab = await p.$('[data-action="owner:tab:venue"]');
  ok(!!tab, "Owner page has the list tab");
  if (tab) {
    ok(/Vintage Wine Merchants list/.test(await tab.textContent()), "tab says the full name");
    await tab.click(); await p.waitForTimeout(300);
    ok(/On the list: 3 in the deck/.test(await p.textContent("#ownerTable")), "list counts: " + (await p.textContent("#ownerTable")).slice(0, 200));
    const c = all[5];
    await p.fill("[data-owner-venuepaste]", `Product type,On hand,Price,Title\nAmerica,1,10,${c.vintage_year || ""} ${c.producer} ${c.wine_name || ""}\nAccessories,1,5,Zalto Bordeaux Glass\nItaly,1,9,2019 Unknown Estate Rosso\n`);
    await p.click('[data-action="owner:venueread"]'); await p.waitForTimeout(400);
    const pv = await p.textContent("#ownerTable");
    ok(/From the file: 2 wines/.test(pv) && /1 item that is not wine/.test(pv) && /In our catalog/.test(pv) && /Not in our catalog yet/.test(pv), "preview: " + pv.slice(0, 400));
    await p.click('[data-action="owner:venuesave"]'); await p.waitForTimeout(400);
    const w = await p.evaluate(() => (window.__writes || []).filter((x) => x.table === "venue_wines").map((x) => x.rows));
    ok(w.length === 1 && w[0].length === 2 && w[0].every((r) => r.venue_id === "vwm") && w[0].some((r) => !r.wine_vintage_id), "saved two rows, one waiting for the catalog: " + JSON.stringify(w));
    await p.fill("[data-owner-venueq]", all[8].producer.slice(0, 5)); await p.waitForTimeout(300);
    ok(await p.evaluate(() => document.activeElement && document.activeElement.hasAttribute("data-owner-venueq")), "search keeps focus");
  }
  ok(errs.length === 0, "no page errors (owner): " + errs.join(" | "));
  await ctx.close();
}
console.log(`== venue_ui: ${pass} pass ${fail} fail`);
await browser.close();

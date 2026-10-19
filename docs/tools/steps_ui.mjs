import { chromium } from "/opt/node-tools/node_modules/playwright/index.mjs";
import fs from "fs";
const SP = process.env.SP || new URL(".", import.meta.url).pathname.replace(/\/$/, ""), PORT = process.env.PORT || "8125";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const lib = fs.readFileSync(SP + "/stub_venue.js", "utf8"), cardsTxt = fs.readFileSync(SP + "/cards.json", "utf8"), cards = JSON.parse(cardsTxt);
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
const firstPiece = cards.map((r, i) => [r, i]).filter(([r]) => parseInt(r.wine_vintage_id.slice(0, 8), 16) < 0x100000000 / 64).map(([, i]) => i);
async function newCtx() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await ctx.route(/esm\.sh|cdn\.jsdelivr\.net|vendor\/supabase\.js/, (r) => r.fulfill({ status: 200, contentType: "application/javascript", headers: { "access-control-allow-origin": "*" }, body: lib }));
  await ctx.route("**/__cards.json", (r) => r.fulfill({ status: 200, contentType: "application/json", body: cardsTxt }));
  return ctx;
}
async function open(ctx, init) {
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.addInitScript({ content: `window.__LAT = 20; localStorage.setItem("wine.consent", "2026-10-e"); localStorage.setItem("wine.demoSeen", "1"); window.__ROLE = "player"; ${init}` });
  const t0 = Date.now();
  await p.goto(`http://localhost:${PORT}/index.html`);
  return { p, errs, t0 };
}
const cardId = (p) => p.evaluate(() => { const c = document.querySelector("#card .producer"); return c ? c.textContent : null; });
{ // a first visit: the first card shows after the first (small) piece, long before the last piece; the card stays put while the rest arrives
  const ctx = await newCtx();
  const { p, errs } = await open(ctx, "window.__EMPTY = 1; window.__CARD_MS_PER_ROW = 25;");
  await p.waitForSelector("#card", { timeout: 15000 });
  const shownAt = await p.evaluate(() => performance.now());
  const first = await cardId(p);
  await p.waitForFunction(() => (window.__pieces || []).length >= 18, null, { timeout: 30000 }).catch(() => {});
  const pieces = await p.evaluate(() => window.__pieces || []);
  const lastAt = Math.max(...pieces.map((x) => x.t));
  ok(pieces.length >= 18 && pieces.reduce((n, x) => n + x.n, 0) === cards.length, "every wine read once, in " + pieces.length + " pieces: " + pieces.reduce((n, x) => n + x.n, 0));
  ok(shownAt < lastAt - 1000, `first card at ${Math.round(shownAt)} ms, before the last piece at ${lastAt} ms`);
  ok(pieces[0].n <= 5, "the first piece is small: " + pieces[0].n);
  await p.waitForTimeout(800);
  ok((await cardId(p)) === first, "the card on screen did not change while the rest arrived");
  ok(await p.evaluate(() => document.querySelectorAll("#card").length === 1), "one card on screen");
  // the deck now holds the whole catalog: swipe a few and the next cards come from all over it
  for (let i = 0; i < 3; i++) { await p.click('[data-action="answer:like"]'); await p.waitForTimeout(500); }
  ok((await cardId(p)) && (await cardId(p)) !== first, "swiping works and moves on");
  ok(!errs.length, "no page errors: " + errs.join(" | "));
  // a second visit on the same phone: the saved copy shows the first card before any catalog piece comes back
  const { p: p2, errs: e2 } = await open(ctx, "window.__EMPTY = 1; window.__CARD_MS_PER_ROW = 600;");
  await p2.waitForSelector("#card", { timeout: 15000 });
  const at2 = await p2.evaluate(() => performance.now()), pieces2 = await p2.evaluate(() => (window.__pieces || []).length);
  ok(pieces2 === 0, `second visit: card from the saved copy at ${Math.round(at2)} ms, ${pieces2} pieces back yet`);
  ok(!e2.length, "no page errors (second visit): " + e2.join(" | "));
  await ctx.close();
}
{ // every wine of the first piece already swiped: the deck is empty for a moment and says the wines are still coming
  const ctx = await newCtx();
  const states = JSON.stringify(firstPiece.map((i) => ({ i, r: "like" })));
  const { p, errs } = await open(ctx, `window.__STATES = ${states}; window.__CARD_MS_PER_ROW = 120;`);
  await p.waitForSelector("#tabbody", { timeout: 15000 });
  await p.waitForFunction(() => /Loading more wines|No more wines/.test(document.body.textContent) || document.querySelector("#card"), null, { timeout: 15000 });
  const txt = await p.textContent("#tabbody");
  ok(/Loading more wines/.test(txt) && !/No more wines/.test(txt), "says the wines are still coming: " + txt.slice(0, 80));
  await p.waitForSelector("#card", { timeout: 30000 }).catch(() => {});
  ok(!!(await p.$("#card")), "a card appears when the next piece arrives");
  ok(!errs.length, "no page errors: " + errs.join(" | "));
  await ctx.close();
}
console.log(`== steps_ui: ${pass} pass ${fail} fail`);
await browser.close();

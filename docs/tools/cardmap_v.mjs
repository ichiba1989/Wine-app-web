import { chromium } from "/opt/node-tools/node_modules/playwright/index.mjs";
import fs from "fs";
const SP = process.env.SP || new URL(".", import.meta.url).pathname.replace(/\/$/, ""), PORT = process.env.PORT || 8125;
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const lib = fs.readFileSync(SP + "/stub_venue.js", "utf8"), cards = fs.readFileSync(SP + "/cards.json", "utf8");
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, serviceWorkers: "block" });
await ctx.route(/esm\.sh|cdn\.jsdelivr\.net|vendor\/supabase\.js/, (r) => r.fulfill({ status: 200, contentType: "application/javascript", headers: { "access-control-allow-origin": "*" }, body: lib }));
await ctx.route("**/__cards.json", (r) => r.fulfill({ status: 200, contentType: "application/json", body: cards }));
const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => { errs.push(e.message); console.log("ERR", e.stack.split("\n").slice(0, 3).join(" <- ")); });
const reqs = []; p.on("request", (r) => reqs.push(r.url()));
await p.addInitScript({ content: `window.__LAT = 10; window.__VENUE_N = 60; localStorage.setItem("wine.consent", "2026-10-e"); localStorage.setItem("wine.demoSeen", "1");` });
await p.goto(`http://localhost:8124/index.html`); await p.waitForSelector("#tabbody .card");
// find a card with a tappable map
let z = null;
for (let i = 0; i < 30 && !(z = await p.$("[data-zoom]")); i++) { await p.click('[data-action^="react:skip"], button:has-text("Skip")').catch(() => {}); await p.waitForTimeout(150); }
ok(!!z, "a card with a map");
ok(!reqs.some((u) => /atlas/.test(u)), "no map files at start");
// a real tap on the card's map (the card's own tap handling)
const b = await z.boundingBox();
await p.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
await p.waitForSelector(".acard .astage svg path", { timeout: 8000 }).catch(() => {});
ok(!!(await p.$(".acard")), "tapping the card's map opens the card map");
ok(reqs.some((u) => /atlaslite\.js/.test(u)) && !reqs.some((u) => /atlasdata\.js/.test(u)), "loads the light data only");
await p.waitForTimeout(500);
ok(!!(await p.$(".acard")), "still open after the trailing click");
const title = await p.textContent(".acardt");
ok(title.trim().length > 0, "place named: " + title.replace(/\s+/g, " ").trim());
await p.screenshot({ path: SP + "/cardmap-open.png" });
const vb = () => p.$eval("[data-atlas-base]", (s) => s.getAttribute("viewBox").split(" ").map(Number));
const w0 = (await vb())[2];
for (let i = 0; i < 8; i++) { await p.click('.acard [data-atlas="zin"]'); await p.waitForTimeout(30); }
const wMin = (await vb())[2];
ok(Math.abs(wMin - 2) < 1e-6, "zoom in stops at the card limit: " + wMin.toFixed(2));
for (let i = 0; i < 12; i++) { await p.click('.acard [data-atlas="zout"]'); await p.waitForTimeout(30); }
const wMax = (await vb())[2];
ok(Math.abs(wMax - 140) < 1e-6, "zoom out stops at the card limit: " + wMax.toFixed(1));
await p.click('.acard [data-atlas="world"]'); await p.waitForTimeout(50);
ok(Math.abs((await vb())[2] - w0) < 1e-6, "home goes back to the wine");
// drag pans
const box = await p.$eval(".acard [data-atlas-stage]", (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
const v1 = await vb();
await p.mouse.move(box.x + 150, box.y + 150); await p.mouse.down(); await p.mouse.move(box.x + 80, box.y + 110, { steps: 5 }); await p.mouse.up();
const v2 = await vb(); ok(v2[0] > v1[0] && v2[1] > v1[1], "drag pans");
ok(!!(await p.$(".acard .aover .apin")), "the wine's pin is drawn");
// pinch
const cdp = await ctx.newCDPSession(p); const cx = box.x + box.w / 2, cy = box.y + box.h / 2, wa = (await vb())[2];
const tp = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i })) });
await tp("touchStart", [[cx - 60, cy], [cx + 60, cy]]); for (let s = 1; s <= 5; s++) await tp("touchMove", [[cx - 60 + s * 10, cy], [cx + 60 - s * 10, cy]]); await tp("touchEnd", []);
await p.waitForTimeout(80); ok((await vb())[2] > wa, "pinch zooms out");
// Escape closes, page behind still Discover
await p.keyboard.press("Escape"); await p.waitForTimeout(50);
ok(!(await p.$(".acard")), "Escape closes");
// reopen with keyboard and open the full Atlas
await z.focus().catch(() => {}); const z2 = await p.$("[data-zoom]"); await z2.focus(); await p.keyboard.press("Enter"); await p.waitForSelector(".acard [data-atlas=full]");
await p.waitForTimeout(450); await p.click(".acard [data-atlas=full]"); await p.waitForSelector("#atlas .atlas:not(.acard) [data-atlas-page]:not([hidden])", { timeout: 8000 }).catch(() => {});
ok(!(await p.$(".acard")), "card map closed");
ok(await p.$eval("#atlas", (e) => !e.hidden), "full Atlas opened on the place");
ok(reqs.some((u) => /atlasdata\.js/.test(u)), "full data loaded for the Atlas");
await p.keyboard.press("Escape"); await p.keyboard.press("Escape"); await p.waitForTimeout(50);
// tap outside the box closes
const z3 = await p.$("[data-zoom]"); await z3.focus(); await p.keyboard.press("Enter"); await p.waitForSelector(".acard"); await p.waitForTimeout(450);
await p.mouse.click(5, 5); await p.waitForTimeout(50); ok(!(await p.$(".acard")), "tap outside closes");
// small map on the card uses the Atlas colours
ok(/f6f1e1/.test(await p.$eval("[data-zoom] svg", (s) => s.innerHTML)), "card silhouette in Atlas colours");
ok(errs.length === 0, "no errors: " + errs.join(" | "));
console.log(`pass ${pass} fail ${fail}`); await browser.close();

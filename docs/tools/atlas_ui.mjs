import { chromium } from "/opt/node-tools/node_modules/playwright/index.mjs";
import fs from "fs";
const SP = process.env.SP || new URL(".", import.meta.url).pathname.replace(/\/$/, ""), PORT = process.env.PORT || 8125;
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const lib = fs.readFileSync(SP + "/stub_quiz.js", "utf8"), cards = fs.readFileSync(SP + "/cards.json", "utf8");
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
const QUIZ = [{ id: "q1", topic: "Regions", difficulty: "beginner", question: "Which grape is Margaux mostly planted with?", correct_answer: "Cabernet Sauvignon", distractors: ["Gamay", "Syrah"] }];
const init = `window.__QUIZ = ${JSON.stringify(QUIZ)};`;
async function open(vw = 390, vh = 780) {
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, hasTouch: true, serviceWorkers: "block" });
  await ctx.route(/esm\.sh|cdn\.jsdelivr\.net|vendor\/supabase\.js/, (r) => r.fulfill({ status: 200, contentType: "application/javascript", headers: { "access-control-allow-origin": "*" }, body: lib }));
  await ctx.route("**/__cards.json", (r) => r.fulfill({ status: 200, contentType: "application/json", body: cards }));
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => { errs.push(e.message); console.log("ERR", e.stack.split("\n").slice(0,4).join(" <- ")); });
  const reqs = []; p.on("request", (r) => reqs.push(r.url()));
  await p.addInitScript({ content: `window.__LAT = 10; localStorage.setItem("wine.consent", "2026-10-e"); localStorage.setItem("wine.demoSeen", "1"); ${init}` });
  await p.goto(`http://localhost:${PORT}/index.html`); await p.waitForSelector("#tabbody .card");
  return { p, errs, ctx, reqs };
}
const noHScroll = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const vb = (p) => p.$eval("[data-atlas-base]", (s) => s.getAttribute("viewBox").split(" ").map(Number));
{
  const { p, errs, ctx, reqs } = await open();
  ok(!reqs.some((u) => /atlas/.test(u)), "atlas files not loaded at start");
  // From Learn
  await p.click('.tabs button[data-action="tab:learn"]'); await p.waitForSelector(".atlasbtn");
  await p.click(".atlasbtn"); await p.waitForSelector(".atlas .astage svg path");
  ok(reqs.some((u) => /atlasdata\.js/.test(u)), "map data loaded on open");
  ok(await p.$eval("#atlas", (e) => !e.hidden), "atlas shown");
  const pins = await p.$$(".aover .apin");
  ok(pins.length > 0, "journal pins drawn: " + pins.length);
  await p.screenshot({ path: SP + "/atlas-world.png" });
  // zoom buttons
  const v0 = await vb(p);
  await p.click('[data-atlas="zin"]'); await p.waitForTimeout(50);
  const v1 = await vb(p);
  ok(Math.abs(v1[2] - v0[2] / 2) < 0.01 * v0[2], "+ halves the width");
  await p.click('[data-atlas="zout"]'); await p.waitForTimeout(50);
  ok(Math.abs((await vb(p))[2] - v0[2]) < 0.01 * v0[2], "- restores");
  // pan with a mouse drag
  const box = await p.$eval("[data-atlas-stage]", (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  await p.mouse.move(box.x + 200, box.y + 200); await p.mouse.down(); await p.mouse.move(box.x + 120, box.y + 160, { steps: 6 }); await p.mouse.up();
  const v2 = await vb(p);
  ok(v2[0] > v0[0] && v2[1] > v0[1], "drag pans the map: " + v0.slice(0, 2) + " -> " + v2.slice(0, 2));
  // pinch with two touch pointers (CDP)
  const cdp = await ctx.newCDPSession(p);
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2, w0 = (await vb(p))[2];
  const tp = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i })) });
  await tp("touchStart", [[cx - 30, cy], [cx + 30, cy]]);
  for (let s = 1; s <= 6; s++) await tp("touchMove", [[cx - 30 - s * 15, cy], [cx + 30 + s * 15, cy]]);
  await tp("touchEnd", []);
  await p.waitForTimeout(100);
  const w1 = (await vb(p))[2];
  ok(w1 < w0 * 0.5, `pinch zooms in: ${w0.toFixed(1)} -> ${w1.toFixed(1)}`);
  // search a place, open its page
  await p.fill("[data-atlas-search]", "margaux"); await p.waitForTimeout(50);
  await p.click('[data-atlas-found] [data-atlas^="place:"]'); await p.waitForSelector("[data-atlas-page]:not([hidden])");
  const page = await p.textContent("[data-atlas-page]");
  ok(/Margaux/.test(page) && /France/.test(page), "place page: name and chain");
  ok(/published by INAO/.test(page), "Margaux has its INAO outline");
  ok((await p.$eval("[data-atlas-sel]", (e) => e.getAttribute("d").length)) > 50, "Margaux outline drawn");
  ok(/INAO/.test(await p.textContent(".asrc")), "INAO credited on the map");
  ok(/Bordeaux/.test(page), "chain has the region from the catalog");
  ok(/Climate/.test(page), "climate rule shown");
  ok(/Your wines from here/.test(page), "own wines listed: " + page.slice(0, 300));
  ok(/Learn about Margaux/.test(page), "Learn button when a question names it");
  await p.screenshot({ path: SP + "/atlas-margaux.png" });
  ok(await noHScroll(p), "no horizontal scroll");
  // Learn link
  await p.click('[data-atlas="learn"]'); await p.waitForTimeout(300);
  ok(await p.$eval("#atlas", (e) => e.hidden), "atlas closed for Learn");
  ok(/Topic: Margaux/.test(await p.textContent("#tabbody")), "learn focused on Margaux");
  // From the Journal, then a pin, then an entry opens the rating sheet above the map
  await p.click('.tabs button[data-action="tab:journal"]'); await p.waitForSelector('[data-action="atlas:open:journal"]');
  await p.click('[data-action="atlas:open:journal"]'); await p.waitForSelector(".aover .apin");
  for (let t = 0; t < 8; t++) {   // a cluster zooms in; tap again until a single place opens its page
    await p.$eval(".aover .apin", (g) => g.dispatchEvent(new MouseEvent("click", { bubbles: true }))); await p.waitForTimeout(150);
    if (await p.$eval("[data-atlas-page]", (e) => !e.hidden)) { console.log("pin opened after", t + 1, "taps"); break; }
  }
  ok(await p.$eval("[data-atlas-page]", (e) => !e.hidden), "pin opens a place page");
  const entryBtn = await p.$('[data-atlas-page] [data-action^="entry:"]');
  ok(!!entryBtn, "entry listed on the page");
  if (entryBtn) { await entryBtn.click(); await p.waitForSelector("#sheetPanel"); ok(true, "rating sheet opened");
    const z = await p.evaluate(() => [getComputedStyle(document.querySelector(".overlay")).zIndex, getComputedStyle(document.querySelector(".atlas")).zIndex]);
    ok(Number(z[0]) > Number(z[1]), "sheet above the atlas");
    const onMap = await p.$('[data-action="atlas:sheet"]'); ok(!!onMap, "Show on map on the sheet");
    if (onMap) { await onMap.click(); await p.waitForSelector("[data-atlas-page]:not([hidden])"); ok(!(await p.$("#sheetPanel")), "sheet closed, page open"); }
  }
  // filters
  await p.click('[data-atlas="show:catalog"]'); await p.waitForTimeout(100);
  const all = (await p.$$(".aover .apin")).length;
  await p.click('[data-atlas="style:white"]'); await p.waitForTimeout(100);
  ok(true, `catalog pins ${all}`);
  await p.click('[data-atlas="show:untried"]'); await p.waitForTimeout(100);
  ok((await p.$$(".aover .apin")).length === 0, "not tried: no pins");
  await p.click('[data-atlas="world"]'); await p.waitForTimeout(100);
  await p.click('[data-atlas="zin"]'); await p.click('[data-atlas="zin"]'); await p.waitForTimeout(100);
  ok((await p.$$(".aover .adot.untried")).length > 0, "untried places shown");
  // country page
  await p.click('[data-atlas="show:journal"]'); await p.click('[data-atlas="world"]'); await p.waitForTimeout(100);
  await p.screenshot({ path: SP + "/atlas-world2.png" });
  const usa = await p.$('.aover text[data-atlas="country:USA"]');
  if (usa) { await usa.dispatchEvent("click"); await p.waitForTimeout(100); ok(/Wine regions/.test(await p.textContent("[data-atlas-page]")), "country page"); } else ok(false, "USA label");
  // close via Escape twice
  await p.keyboard.press("Escape"); await p.keyboard.press("Escape"); await p.waitForTimeout(50);
  ok(await p.$eval("#atlas", (e) => e.hidden), "escape closes");
  // Discover card map: Open in the Atlas
  await p.click('.tabs button[data-action="tab:discover"]'); await p.waitForTimeout(200);
  const z = await p.$("[data-zoom]");
  if (z) { await z.focus(); await p.keyboard.press("Enter"); await p.waitForSelector(".acard [data-atlas=full]"); await p.waitForTimeout(450); await p.click(".acard [data-atlas=full]"); await p.waitForSelector("#atlas [data-atlas-page]:not([hidden])"); ok(!(await p.$(".acard")), "card map closed, atlas on the place"); }
  else console.log("(card had no map)");
  // Profile link
  await p.keyboard.press("Escape"); await p.keyboard.press("Escape");
  await p.click('.tabs button[data-action="tab:profile"]'); await p.waitForTimeout(300);
  await p.click('[data-action="profile:sub:explored"], [data-psub="explored"], button:has-text("Explored")').catch(() => {});
  await p.waitForTimeout(200);
  ok(!!(await p.$('[data-action="atlas:open:journal"]')), "profile link");
  ok(errs.length === 0, "no page errors: " + errs.join(" | "));
  await ctx.close();
}
{ // a small screen
  const { p, errs, ctx } = await open(320, 560);
  await p.click('.tabs button[data-action="tab:learn"]'); await p.waitForSelector(".atlasbtn"); await p.click(".atlasbtn"); await p.waitForSelector(".aover .apin");
  await p.fill("[data-atlas-search]", "napa"); await p.click('[data-atlas-found] [data-atlas^="place:"]'); await p.waitForSelector("[data-atlas-page]:not([hidden])");
  ok(await noHScroll(p), "small: no horizontal scroll");
  ok(/official American Viticultural Area/.test(await p.textContent("[data-atlas-page]")), "Napa has its AVA outline");
  ok((await p.$eval("[data-atlas-sel]", (e) => e.getAttribute("d").length)) > 50, "outline drawn");
  await p.screenshot({ path: SP + "/atlas-napa-small.png" });
  // A region never takes an AOC's outline; a tiny grand cru still has one
  await p.fill("[data-atlas-search]", "bordeaux"); await p.click('[data-atlas-found] [data-atlas="place:france|bordeaux"]'); await p.waitForTimeout(100);
  ok(/No outline on file/.test(await p.textContent("[data-atlas-page]")), "region Bordeaux: no AOC outline");
  await p.fill("[data-atlas-search]", "julien"); await p.click('[data-atlas-found] [data-atlas^="place:"]'); await p.waitForTimeout(100);
  ok(/published by INAO/.test(await p.textContent("[data-atlas-page]")), "St.-Julien finds Saint-Julien");
  await p.screenshot({ path: SP + "/atlas-julien-small.png" });
  ok(errs.length === 0, "small: no errors " + errs.join(" | "));
  await ctx.close();
}
console.log(`pass ${pass} fail ${fail}`);
await browser.close();

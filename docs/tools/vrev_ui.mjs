import { chromium } from "/opt/node-tools/node_modules/playwright/index.mjs";
import fs from "fs";
const SP = process.env.SP || new URL(".", import.meta.url).pathname.replace(/\/$/, "");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const lib = fs.readFileSync(SP + "/stub_venue.js", "utf8"), cards = fs.readFileSync(SP + "/cards.json", "utf8");
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
const rows = [
  { id: "r1", wine_vintage_id: null, producer: "", wine_name: "Ridge Vineyards Monte Bello Santa Cruz Mountains", vintage: "2019", shop_type: "America", source: "file" },
  { id: "r2", wine_vintage_id: null, producer: "", wine_name: "Billecart Salmon Champagne Brut Le Reserve", vintage: "", shop_type: "Sparkling Wine", source: "file" },
  { id: "r3", wine_vintage_id: null, producer: "", wine_name: "Some Unknown Producer Red Blend", vintage: "2021", shop_type: "", source: "file" },
  { id: "r4", wine_vintage_id: null, producer: "", wine_name: "Nikka Limited Edition Super Nikka Reviaval", vintage: "", shop_type: "", source: "file" },
  { id: "r7", wine_vintage_id: null, producer: "", wine_name: "Prieler Blaufrankisch Ried Goldberg Schutzen am Gebirge Leithaberg", vintage: "2018", shop_type: "", source: "file" },
  { id: "r6", wine_vintage_id: null, producer: "", wine_name: "Dönnhoff Riesling Spätlese Niederhäuser Hermannshöhle", vintage: "2019", shop_type: "", source: "file" },
  { id: "r5", wine_vintage_id: null, producer: "", wine_name: "Voerzio Martini Barolo Cerequio DOCG", vintage: "2016", shop_type: "Italy", source: "file" },
];
// 1200 extra linked rows: the list is longer than one read (1000 rows); the review must still see every unlinked row.
const many = Array.from({ length: 1200 }, (_, i) => ({ id: "m" + i, wine_vintage_id: "x" + i, producer: "", wine_name: "Linked " + i, vintage: "", shop_type: "", source: "file" }));
const areas = [{ id: "c1", name: "France", level: "country", parent_id: null }, { id: "a2", name: "Champagne", level: "region", parent_id: "c1" },
  { id: "c2", name: "USA", level: "country", parent_id: null }, { id: "r2", name: "California", level: "region", parent_id: "c2" }, { id: "bx", name: "Bordeaux", level: "region", parent_id: "c1" }, { id: "sj", name: "St.-Julien", level: "appellation", parent_id: "bx" }, { id: "c3", name: "Italy", level: "country", parent_id: null }, { id: "r3", name: "Piedmont", level: "region", parent_id: "c3" }, { id: "a3", name: "Barolo", level: "appellation", parent_id: "r3" }];
async function open(role, height = 900) {
  const ctx = await browser.newContext({ viewport: { width: 390, height } });
  await ctx.route(/esm\.sh|cdn\.jsdelivr\.net|vendor\/supabase\.js/, (r) => r.fulfill({ status: 200, contentType: "application/javascript", headers: { "access-control-allow-origin": "*" }, body: lib }));
  await ctx.route("**/__cards.json", (r) => r.fulfill({ status: 200, contentType: "application/json", body: cards }));
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.addInitScript({ content: `window.__LAT = 10; localStorage.setItem("wine.consent", "2026-10-e"); localStorage.setItem("wine.demoSeen", "1"); window.__EMPTY = 1; window.__ROLE = "${role}";
    window.__VENUE_ROWS = ${JSON.stringify([...rows, ...many])}; window.__PRODUCERS = [{ id: "p1", name: "Ridge Vineyards" }]; window.__AREAS = ${JSON.stringify(areas)}; window.__GRAPES = [{ id: "g1", name: "Cabernet Sauvignon" }];` });
  await p.goto("http://localhost:8124/index.html"); await p.waitForSelector("#tabbody"); await p.waitForTimeout(600);
  return { p, errs, ctx };
}
const val = (p, f) => p.inputValue(`[data-vr-f="${f}"]`);
{
  const { p, errs, ctx } = await open("editor");
  await p.click('[data-action="tab:editor"]'); await p.waitForTimeout(300);
  const chip = await p.$('[data-editor="sec:venue"]');
  ok(!!chip && (await chip.textContent()) === "Vintage Wine Merchants", "Editor has the venue section, full name");
  await chip.click(); await p.waitForSelector(".vrcard"); await p.waitForTimeout(300);
  let txt = await p.textContent(".vrev");
  ok(/\b7 wines to add/.test(txt), "count over a list longer than 1000 rows: " + txt.slice(0, 90));
  // Austria first: Leithaberg is a DAC, filled in automatically from the rule list
  ok(/Prieler/.test(await p.textContent(".vrtitle")), "sorted by country: Austria first");
  ok(await p.$eval('#vrDesig [data-vrdesig="DAC"]', (b) => b.classList.contains("on")) && /Leithaberg is DAC \(our rule list\)/.test(await p.textContent("#vrDesig")), "DAC automatic: " + await p.textContent("#vrDesig"));
  ok((await val(p, "wine")) === "Ried Goldberg Schutzen am Gebirge" && /Leithaberg, Burgenland, Austria/.test(await p.textContent("#vrPlaceNow")), "place Leithaberg; vineyard and village in the name");
  await p.click('[data-vr="skip"]'); await p.waitForTimeout(100);
  ok(/Billecart Salmon Champagne/.test(await p.textContent(".vrtitle")), "then France");
  ok((await val(p, "producer")) === "Billecart Salmon" && (await val(p, "wine")) === "Le Reserve", "prepared producer split; the place (Champagne) is taken out of the wine name: " + await val(p, "wine"));
  ok(await p.$eval('[data-vr="split:2"]', (b) => b.classList.contains("on")) && !(await p.$eval('[data-vr="split:3"]', (b) => b.classList.contains("on"))), "word chips show the split");
  ok(await p.$eval('[data-vr="style:sparkling"]', (b) => b.classList.contains("on")) && (await val(p, "vintage")) === "NV", "type and NV prepared");
  ok(/Champagne, France/.test(await p.textContent("#vrPlaceNow")) && !/will be created/.test(await p.textContent("#vrPlaceNow")), "prepared place found in the list: " + await p.textContent("#vrPlaceNow"));
  // fits on one screen (390 x 844)
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(100);
  const bottom = await p.$eval(".vrbtns", (e) => e.getBoundingClientRect().bottom + window.scrollY);
  const bar = await p.evaluate(() => { const t = document.querySelector('[data-action="tab:editor"]'); return t ? t.getBoundingClientRect().top : 844; });
  ok(bottom <= bar, "the whole form fits on one phone screen above the tab bar: buttons end at " + Math.round(bottom) + ", bar at " + Math.round(bar));
  await p.screenshot({ path: SP + "/vrev-first.png" });
  // search a place
  await p.fill("#vrPlaceQ", "barol"); await p.waitForTimeout(80);
  ok((await p.$$eval(".vrhit", (b) => b.map((x) => x.textContent))).join() === "Barolo, Piedmont, Italy", "search shows matching places");
  ok((await p.evaluate(() => document.activeElement && document.activeElement.id)) === "vrPlaceQ", "typing keeps the focus");
  await p.click(".vrhit"); await p.waitForTimeout(80);
  ok(/Barolo, Piedmont, Italy/.test(await p.textContent("#vrPlaceNow")) && !(await p.$(".vrhit")), "tapping a result picks it");
  await p.fill("#vrPlaceQ", "Ay"); await p.waitForTimeout(80);
  ok(/No place called that yet/.test(await p.textContent("#vrHits")), "no match offers a new place");
  await p.click('#vrHits [data-vr="type"]'); await p.waitForTimeout(80);
  await p.fill('[data-vr-p="appellation"]', "Aÿ"); await p.fill('[data-vr-p="region"]', "Champagne"); await p.fill('[data-vr-p="country"]', "France"); await p.waitForTimeout(80);
  ok(/New: Aÿ \(appellation\)/.test(await p.textContent("#vrPlaceNow")), "typed new place: what will be created: " + await p.textContent("#vrPlaceNow"));
  await p.fill('[data-vr-f="producer"]', "Billecart-Salmon");
  await p.click('[data-vr="add:rev"]'); await p.waitForTimeout(600);
  const w = await p.evaluate(() => (window.__writes || []).map((x) => ({ t: x.table, r: x.rows[0] })));
  const geo = w.filter((x) => x.t === "geo_areas"), wine = w.find((x) => x.t === "wines"), vin = w.find((x) => x.t === "wine_vintages"), src = w.find((x) => x.t === "wine_source_records");
  ok(geo.length === 1 && geo[0].r.name === "Aÿ" && geo[0].r.level === "appellation" && geo[0].r.parent_id === "a2", "only the missing place is created, under Champagne: " + JSON.stringify(geo));
  ok(w.some((x) => x.t === "producers" && x.r.name === "Billecart-Salmon"), "edited producer saved");
  ok(wine && wine.r.status === "pending_review" && wine.r.style === "sparkling" && /^geo_areas-/.test(wine.r.appellation_id) && wine.r.name === "Le Reserve" && wine.r.dosage === "brut" && wine.r.dosage_basis === "label", "wine waiting for review, at the new place, Brut in its own field: " + JSON.stringify(wine));
  ok(vin && vin.r.is_non_vintage === true && vin.r.vintage_year === null, "NV vintage");
  ok(src && /Billecart Salmon Champagne Brut Le Reserve/.test(src.r.listed_as), "source keeps the shop's title");
  txt = await p.textContent(".vrev");
  ok(/Added: Billecart-Salmon/.test(txt) && /Dönnhoff/.test(await p.textContent(".vrtitle")), "moves to the next wine (Germany next): " + await p.textContent(".vrtitle"));
  // Germany: only the broad region is the place; the village and vineyard stay in the wine name; no place designation
  ok(/Nahe, Germany/.test(await p.textContent("#vrPlaceNow")) && (await val(p, "wine")) === "Spätlese Niederhäuser Hermannshöhle", "German place is the region, vineyard in the name: " + await p.textContent("#vrPlaceNow") + " / " + await val(p, "wine"));
  ok(/has no place designation/.test(await p.textContent("#vrDesig")) && !(await p.$("#vrDesig .chip")), "no German designation chips");
  await p.click('[data-vr="type"]'); await p.waitForTimeout(80);
  await p.fill('[data-vr-p="appellation"]', "Niederhäuser Hermannshöhle"); await p.waitForTimeout(80);
  ok(/choose the wine region/.test(await p.textContent("#vrPlaceNow")), "a vineyard typed as the place is refused: " + await p.textContent("#vrPlaceNow"));
  await p.fill('[data-vr-p="appellation"]', ""); await p.waitForTimeout(80);
  await p.click('[data-vr="add:rev"]'); await p.waitForTimeout(600);
  const geoDE = await p.evaluate(() => (window.__writes || []).filter((x) => x.table === "geo_areas").map((x) => x.rows[0]));
  ok(geoDE.some((r) => r.name === "Nahe" && !r.classification) && !geoDE.some((r) => /Hermannsh/.test(r.name)), "only Germany and Nahe created: " + JSON.stringify(geoDE));
  ok(/Voerzio Martini Barolo/.test(await p.textContent(".vrtitle")), "then Italy: " + await p.textContent(".vrtitle"));
  // designation: from the title (Barolo has none in the place list yet), kept on the place, not in the wine name
  ok((await val(p, "wine")) === "Cerequio", "DOCG and the place are not in the wine name: " + await val(p, "wine"));
  ok(await p.$eval('#vrDesig [data-vrdesig="DOCG"]', (b) => b.classList.contains("on")) && /Barolo is DOCG \(our rule list\)/.test(await p.textContent("#vrDesig")) && /kept on Barolo/.test(await p.textContent("#vrDesig")), "designation from the rule list: " + await p.textContent("#vrDesig"));
  await p.click('[data-vr="add:rev"]'); await p.waitForTimeout(600);
  const rpc = await p.evaluate(() => (window.__rpc || []).filter((x) => x.n === "fill_place_designation"));
  ok(rpc.length === 1 && rpc[0].args.p_area === "a3" && rpc[0].args.p_value === "DOCG", "fills Barolo's designation: " + JSON.stringify(rpc));
  ok(/Ridge Vineyards Monte Bello/.test(await p.textContent(".vrtitle")), "then the USA: " + await p.textContent(".vrtitle"));
  ok((await p.$$eval("#vrDesig .chip", (b) => b.map((x) => x.textContent))).join() === "AVA,None", "US choices");
  txt = await p.textContent(".vrev");
  ok((await val(p, "producer")) === "Ridge Vineyards" && /a producer we already have/.test(txt), "known producer");
  ok((await val(p, "wine")) === "Monte Bello", "the place's words are not left in the wine name: " + await val(p, "wine"));
  await p.click('[data-vr="split:1"]'); await p.waitForTimeout(80);
  ok((await val(p, "producer")) === "Ridge" && (await val(p, "wine")) === "Vineyards Monte Bello", "a new split keeps the place out of the name too: " + await val(p, "wine"));
  await p.click('[data-vr="split:2"]'); await p.waitForTimeout(80);
  ok(/Santa Cruz Mountains, California, USA/.test(await p.textContent("#vrPlaceNow")) && /New: Santa Cruz Mountains \(appellation\)/.test(await p.textContent("#vrPlaceNow")), "prepared place not in the list yet: says it will be created: " + await p.textContent("#vrPlaceNow"));
  await p.fill('[data-vr-f="grapes"]', "Cabernet Sauvignon, Merlot");
  await p.click('[data-vr="add:pub"]'); await p.waitForTimeout(600);
  const w2 = await p.evaluate(() => (window.__writes || []).map((x) => ({ t: x.table, r: x.rows })));
  const wines = w2.filter((x) => x.t === "wines");
  ok(wines.length === 4 && wines[3].r[0].status === "verified" && wines[3].r[0].style === "red", "published at once when chosen: " + JSON.stringify(wines.map((w) => [w.r[0].name, w.r[0].status])));
  ok(w2.some((x) => x.t === "grapes" && x.r[0].name === "Merlot") && w2.some((x) => x.t === "wine_grapes" && x.r.length === 2 && x.r[0].grape_id === "g1"), "known grape reused, new grape added");
  // next: the rows without a prepared country come last; the not-a-wine hint
  txt = await p.textContent(".vrev");
  ok(/Nikka|Some Unknown/.test(await p.textContent(".vrtitle")), "rows with no country last");
  if (/Nikka/.test(await p.textContent(".vrtitle"))) ok(/looks like a spirit/.test(txt), "not-a-wine hint"); else { await p.click('[data-vr="skip"]'); await p.waitForTimeout(80); ok(/looks like a spirit/.test(await p.textContent(".vrev")), "not-a-wine hint"); }
  ok(!(await p.$('[data-vr="remove"]')), "an editor cannot remove rows from the list");
  ok(errs.length === 0, "no page errors: " + errs.join(" | "));
  await p.screenshot({ path: SP + "/vrev-editor.png" });
  await ctx.close();
}
{
  const { p, errs, ctx } = await open("player");
  ok(!(await p.$('[data-action="tab:editor"]')), "players have no Editor tab");
  await ctx.close();
}
{ // "Looks like ... already in our list" in the review: never swapped silently
  const { p, errs, ctx } = await open("editor");
  await p.click('[data-action="tab:editor"]'); await p.waitForTimeout(300);
  await p.click('[data-editor="sec:venue"]'); await p.waitForSelector(".vrcard"); await p.waitForTimeout(300);
  await p.click('[data-vr="type"]'); await p.waitForTimeout(80);
  await p.fill('[data-vr-p="country"]', "France"); await p.fill('[data-vr-p="region"]', "Bordeaux"); await p.fill('[data-vr-p="appellation"]', "Saint-Julien"); await p.waitForTimeout(80);
  // typed places redraw only the place line: the question appears after a redraw (a tap) or in the line itself
  ok(/Looks like St\.-Julien already in our list/.test(await p.textContent("#vrPlaceNow")), "place look-alike asked: " + await p.textContent("#vrPlaceNow"));
  await p.click('#vrPlaceNow [data-vrlook="appellation"]'); await p.waitForTimeout(80);
  ok(/St\.-Julien, Bordeaux, France/.test(await p.textContent("#vrPlaceNow")) && !/Looks like/.test(await p.textContent("#vrPlaceNow")), "Use it picks the list's place");
  await p.fill('[data-vr-f="producer"]', "Ridge Vineyard"); await p.waitForTimeout(80);
  ok(/Looks like Ridge Vineyards/.test(await p.textContent("#vrProdLook")), "producer look-alike asked: " + await p.textContent("#vrProdLook"));
  await p.click('[data-vrkeep="producer"]'); await p.waitForTimeout(80);
  ok((await p.inputValue('[data-vr-f="producer"]')) === "Ridge Vineyard" && !(await p.textContent("#vrProdLook")).trim(), "Keep mine keeps the typed name");
  ok(errs.length === 0, "no page errors: " + errs.join(" | "));
  await ctx.close();
}
console.log(`== vrev_ui: ${pass} pass ${fail} fail`);
await browser.close();

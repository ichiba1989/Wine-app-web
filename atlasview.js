// The Atlas screen: the map the player moves around in (one finger pans, two fingers pinch, a double-tap or + zooms in, - zooms out, the house goes
// back to the world), their wines pinned on it, and a page for each place. Opened from Learn, the Journal, a journal entry, the card's map and Profile.
// The same screen is the Discover card's map ("card" mode): a box over the card with the wine's place and its outline, the same moves within
// tighter limits (atlas.js CARD: a continent down to about 60 km), no pins or pages, and "Open in the Atlas". Each mode is handed its map data:
// atlasdata.js for the Atlas, the lighter atlaslite.js for the card (app.js loads them on first use, so neither costs anything at start-up).
// The rules are in atlas.js; this file draws and listens. While a finger moves only the map's viewBox changes; pins and labels are drawn again when
// the finger lifts.
import * as A from "./atlas.js?v=7";
import { esc } from "./logic.js?v=24";
import { infoLine } from "./wineline.js?v=4";   // grape · appellation · region, under a wine's name

const SEA = "#d6e4ea", LAND = "#efeadb", WINE_LAND = "#f6f1e1", BORDER = "#9aa893", PROVINCE = "#c4bfa8", AREA = "#7b2d43";
const STYLE_WORD = { red: "Red", white: "White", sparkling: "Sparkling", rose: "Rosé", fortified: "Fortified" };
const KIND_WORD = { country: "Country", region: "Region", appellation: "Wine area" };
const SHAPES_OF = new Map();   // the shapes worked out once for each data file
// A French AOC wider than about 60 km (Bordeaux, Crémant de Bourgogne, Languedoc ...) would blanket the map with its scattered vineyard pieces.
const wide = (a) => Math.max(a.bbox[2] - a.bbox[0], a.bbox[3] - a.bbox[1]) > 0.8;

// ctx: { cards(), pool(), journal(), states(), cardsById(), nameOf(card), entryName(entry), suggest(place) -> [{ card, reason }],
//        quizFor(topics) -> number of questions, learnAbout(topics, label), textScale(), close(), openFull(placeKey) (card mode) }
export function createAtlas(ctx) {
  let root = null, st = null, SHAPES = null;

  // ---------------------------------------------------------------- opening and closing
  // opts: { data: the map data module, show: "journal" | "liked" | "catalog" | "untried", place: key, fit: "pins",
  //         card: { place: key, color } for the Discover card's map }
  function open(el, opts = {}) {
    if (!SHAPES_OF.has(opts.data)) SHAPES_OF.set(opts.data, A.buildShapes(opts.data));
    SHAPES = SHAPES_OF.get(opts.data);
    if (root) close();   // opened again (Show on map from a sheet over the map): start afresh
    root = el;
    // The card's map: the wine's own appellation (or region) on this data, else its country.
    const card = opts.card ? A.placeOfCard(opts.card, places()) || countryPlace(opts.card.country) : null;
    st = { show: opts.show || "journal", style: "", view: A.WORLD_VIEW, page: null, search: "", pointers: new Map(), gesture: null, lastTap: 0,
      card: card ? { place: card, color: opts.card.color || AREA } : null, lim: card ? A.CARD : A.FULL, openedAt: Date.now() };
    root.innerHTML = st.card ? cardShellHtml() : shellHtml();
    root.hidden = false;
    document.body.classList.add("atlasopen");
    bind();
    const aspect = aspectOf();
    st.view = A.clampView(A.WORLD_VIEW, aspect, st.lim);
    drawBase();
    const place = opts.place && places().find((p) => p.key === opts.place);
    if (st.card) cardHome();
    else if (place) { flyTo(place, false); openPage({ kind: "place", key: place.key }); }
    else if (opts.fit === "pins") fitPins();
    else st.view = A.fitView([-125, -45, 150, 55], aspect, 0.02, 3, st.lim);
    setViewBox(); drawOver();
    const x = root.querySelector("[data-atlas=close]"); if (x) x.focus();
  }
  function close() {
    if (!root) return;
    document.removeEventListener("keydown", onKey);
    root.innerHTML = ""; root.hidden = true; document.body.classList.remove("atlasopen");
    root = null; st = null;
  }
  const isOpen = () => !!root;

  // ---------------------------------------------------------------- data
  // The places on the map: PLACES, and the catalog's appellations that have an outline in this data (atlas.js catalogPlaces).
  let PL = { shapes: null, cards: null, list: [] };
  const places = () => {
    const cards = ctx.cards();
    if (PL.shapes !== SHAPES || PL.cards !== cards) { const known = A.atlasPlaces(); PL = { shapes: SHAPES, cards, list: [...known, ...A.catalogPlaces(SHAPES, cards, known)] }; }
    return PL.list;
  };
  const placeOf = (c) => A.placeOfCard(c, places());
  // A wine that names no place we have: its country, shown whole.
  const countryPlace = (name) => { const c = name && SHAPES.countries.find((x) => x.name === name); return c ? { key: null, name: c.name, kind: "country", country: c.name, bbox: c.bbox } : null; };
  let COUNTRIES_OF = { cards: null, set: new Set() };
  const catalogCountries = () => { const c = ctx.cards(); if (COUNTRIES_OF.cards !== c) COUNTRIES_OF = { cards: c, set: new Set(c.map((x) => x.country).filter(Boolean)) }; return COUNTRIES_OF.set; };
  const pinSet = () => {
    if (st.card) return { pins: st.card.place.kind === "country" ? [] : [{ id: "card", place: st.card.place, color: st.card.color }], unplaced: 0 };   // the card's map shows only its wine
    const show = st.show === "untried" ? "journal" : st.show;
    return A.pinsOf({ show, style: st.style, journal: ctx.journal(), states: ctx.states(), cards: ctx.pool(), cardsById: ctx.cardsById(), nameOf: ctx.nameOf, entryName: ctx.entryName, placeOf });
  };

  // ---------------------------------------------------------------- the screen
  function shellHtml() {
    const chips = [...A.SHOW, { id: "untried", label: "Not tried yet" }].map((s) => `<button class="chip${st.show === s.id ? " on" : ""}" data-atlas="show:${s.id}">${esc(s.label)}</button>`).join("");
    const styles = A.STYLES.map((s) => `<button class="chip${st.style === s.id ? " on" : ""}" data-atlas="style:${s.id}">${esc(s.label)}</button>`).join("");
    return `<div class="atlas" role="dialog" aria-modal="true" aria-label="Atlas">
      <div class="atop">
        <button class="xbtn" data-atlas="close" aria-label="Close the atlas">&times;</button>
        <div class="serif big">Atlas</div>
        <input class="field asearch" data-atlas-search type="search" placeholder="Find a place" aria-label="Find a place" autocomplete="off">
      </div>
      <div class="afind" data-atlas-found></div>
      <div class="chips left achips" data-atlas-chips>${chips}</div>
      <div class="chips left achips" data-atlas-styles>${styles}</div>
      <div class="astage" data-atlas-stage>
        <svg class="abase" data-atlas-base preserveAspectRatio="none" aria-hidden="true"></svg>
        <svg class="aover" data-atlas-over role="group" aria-label="Places and pins"></svg>
        <div class="actl">
          <button data-atlas="zin" aria-label="Zoom in">+</button><button data-atlas="zout" aria-label="Zoom out">&minus;</button><button data-atlas="world" aria-label="Back to the whole world">&#8962;</button>
        </div>
        <div class="ascale" data-atlas-scale></div>
        <div class="asrc">Map data: <a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener">Natural Earth</a>, <a href="https://github.com/UCDavisLibrary/ava" target="_blank" rel="noopener">UC Davis AVA project</a>, <a href="https://www.data.gouv.fr/datasets/delimitation-parcellaire-des-aoc-viticoles-de-linao" target="_blank" rel="noopener">INAO</a></div>
        <div class="anote" data-atlas-note></div>
      </div>
      <div class="apage" data-atlas-page hidden></div>
    </div>`;
  }
  // The card's map: a box over the Discover card, the wine's place named at the top.
  function cardShellHtml() {
    const p = st.card.place, area = p.kind === "country" ? null : A.areaFor(SHAPES, p);
    const note = p.kind === "country" ? "This wine names no place we have on the map, so its country is shown." : area ? A.AREA_SOURCE[area.source] || "" : "No outline on file: the dot marks roughly where it is.";
    return `<div class="atlas acard" role="dialog" aria-modal="true" aria-label="Where this wine is from" data-atlas="back">
      <div class="acardbox">
        <div class="atop"><div class="acardt"><div class="serif big">${esc(p.name)}</div><div class="muted small">${esc(p.kind === "country" ? "" : p.kind === "region" ? p.country : [regionOf(p), p.country].filter(Boolean).join(", "))}</div></div>
          <button class="xbtn" data-atlas="close" aria-label="Close the map">&times;</button></div>
        <div class="astage" data-atlas-stage>
          <svg class="abase" data-atlas-base preserveAspectRatio="none" aria-hidden="true"></svg>
          <svg class="aover" data-atlas-over role="group" aria-label="Places"></svg>
          <div class="actl">
            <button data-atlas="zin" aria-label="Zoom in">+</button><button data-atlas="zout" aria-label="Zoom out">&minus;</button><button data-atlas="world" aria-label="Back to this wine's place">&#8962;</button>
          </div>
          <div class="ascale" data-atlas-scale></div>
          <div class="asrc">Map data: Natural Earth, UC Davis AVA project, INAO</div>
          <div class="anote" data-atlas-note></div>
        </div>
        <div class="acardfoot"><span class="muted tiny">${esc(note)}</span><button class="pill dark" data-atlas="full">Open in the Atlas</button></div>
      </div></div>`;
  }
  // The region a place's wines are filed under in the catalog (for the card map's second line), else nothing.
  const regionOf = (p) => { const f = A.placeFacts(p.key, { places: places(), cards: ctx.cards() }); const r = f && f.chain.find((s) => s.kind === "region"); return r ? r.name : ""; };
  // The card map's starting view: the wine's outline when there is one, else its place; the outline is marked.
  function cardHome() {
    const p = st.card.place, area = p.kind === "country" ? null : A.areaFor(SHAPES, p), aspect = aspectOf();
    if (p.kind === "country") { st.view = A.fitView(p.bbox, aspect, 0.06, 3, st.lim); $("[data-atlas-sel]").setAttribute("d", ""); return; }
    // A small appellation opens as close as the card's map goes; a place with no outline wide enough to see where in the country it is.
    st.view = area ? A.fitView(area.bbox, aspect, 0.8, A.CARD.min, st.lim) : A.viewAt(p.lon, p.lat, p.kind === "region" ? 40 : 12, aspect, st.lim);
    $("[data-atlas-sel]").setAttribute("d", area ? area.d : "");
  }
  const $ = (sel) => root.querySelector(sel);
  const stageBox = () => { const s = $("[data-atlas-stage]"); return { w: s.clientWidth || 360, h: s.clientHeight || 420 }; };
  const aspectOf = () => { const b = stageBox(); return b.h / b.w; };
  const ts = () => (ctx.textScale ? ctx.textScale() : 1);

  // The base map: sea, countries, province lines and wine areas, drawn once; only the viewBox moves after that.
  function drawBase() {
    const svg = $("[data-atlas-base]");
    if (!svg.dataset.drawn) {
      const countries = SHAPES.countries.map((c) => `<path class="acountry${c.wine ? " wine" : ""}" d="${c.d}" fill="${c.wine ? WINE_LAND : LAND}" stroke="${BORDER}"/>`).join("");
      const provinces = SHAPES.provinces.map((p) => `<path d="${p.d}"/>`).join("");
      // US wine areas are solid shapes and get a light fill. French AOCs are the vineyard land itself (patchy, and they overlap: Margaux lies inside
      // Bordeaux), so they are thin lines only, and the very wide ones (Bordeaux, Bourgogne, Côtes du Rhône ...) are drawn only when their page is open.
      const areas = SHAPES.areas.map((a, i) => (a.kind === "aoc" ? "" : `<path data-area="${i}" d="${a.d}"/>`)).join("");
      const aocs = SHAPES.areas.map((a, i) => (a.kind === "aoc" && !wide(a) ? `<path data-area="${i}" d="${a.d}"/>` : "")).join("");
      svg.innerHTML = `<rect x="-2000" y="-2000" width="5000" height="5000" fill="${SEA}"/><g class="aland">${countries}</g><g class="aprov" fill="none" stroke="${PROVINCE}">${provinces}</g><g class="aareas" fill="${AREA}" fill-opacity=".08" stroke="${AREA}" stroke-opacity=".55">${areas}</g><g class="aareas aaoc" fill="none" stroke="${AREA}" stroke-opacity=".4">${aocs}</g><path class="asel" data-atlas-sel d="" fill="${AREA}" fill-opacity=".22" stroke="${AREA}"/>`;
      svg.dataset.drawn = "1";
    }
    setViewBox();
  }
  function setViewBox() {
    const v = st.view, svg = $("[data-atlas-base]");
    svg.setAttribute("viewBox", `${v.x} ${v.y} ${v.w} ${v.h}`);
    const level = A.levelOf(v);
    svg.dataset.level = level;
  }

  // Pins, place dots and labels, in screen pixels.
  function drawOver() {
    const { w, h } = stageBox(), v = st.view, level = A.levelOf(v), k = ts(), over = $("[data-atlas-over]");
    over.setAttribute("viewBox", `0 0 ${w} ${h}`);
    const P = (lon, lat) => A.toScreen(v, w, lon, lat), inside = ([x, y]) => x > -20 && x < w + 20 && y > -20 && y < h + 20;
    const taken = [{ x0: w - 52, x1: w, y0: 0, y1: 150 }, { x0: 0, x1: 150, y0: h - 34, y1: h }];
    let shapes = "", labels = [];
    // Country names (the world and country views).
    // The world view names only the countries our catalog has wines from; closer in, the neighbours are named too (paler).
    const hasWines = catalogCountries();
    if (level === "world" || level === "country")
      SHAPES.countries.filter((c) => c.label && (hasWines.has(c.name) || level === "country")).forEach((c) => { const xy = P(c.label[0], c.label[1]); if (inside(xy)) labels.push({ x: xy[0], y: xy[1], text: c.name, size: (hasWines.has(c.name) ? 12 : 10) * k, cls: hasWines.has(c.name) ? "lc" : "lc dim", dot: false, caps: true, act: `country:${c.name}` }); });
    // Wine areas with a boundary (the region view and closer): their names on the shape.
    if (level === "region" || level === "local")
      SHAPES.areas.forEach((a) => { if (a.kind === "aoc" && wide(a)) return; const xy = P(a.label[0], a.label[1]); if (inside(xy)) labels.push({ x: xy[0], y: xy[1], text: a.name, size: 9.5 * k, cls: "la", dot: false }); });
    // Places: tappable dots.
    const pinData = pinSet(), groups = A.byPlace(pinData.pins), pinned = new Set(groups.map((g) => g.place.key));
    const untried = st.show === "untried" ? new Set(A.untriedPlaces(places(), pinData.pins).map((p) => p.key)) : null;
    const dots = [];
    places().forEach((p) => {
      const show = untried ? untried.has(p.key) && (level !== "world") : A.placeShows(p, level) && !pinned.has(p.key);
      if (!show) return;
      const xy = P(p.lon, p.lat); if (!inside(xy)) return;
      dots.push({ p, xy });
    });
    dots.forEach(({ p, xy }) => {
      const r = p.kind === "region" ? 4.5 : 3.5;
      shapes += `<circle class="adot${untried ? " untried" : ""}" cx="${xy[0].toFixed(1)}" cy="${xy[1].toFixed(1)}" r="${r}" data-atlas="place:${esc(p.key)}"/><circle class="ahit" cx="${xy[0].toFixed(1)}" cy="${xy[1].toFixed(1)}" r="14" data-atlas="place:${esc(p.key)}"><title>${esc(p.name)}</title></circle>`;
    });
    // Pins, joined when they would overlap.
    const clusters = untried ? [] : A.clusterScreen(groups.map((g) => ({ ...g, xy: P(g.place.lon, g.place.lat) })), (g) => g.xy, 28);
    st.clusters = clusters;
    clusters.forEach((c, i) => {
      if (!inside([c.x, c.y])) return;
      const r = c.count > 1 ? Math.min(17, 9 + Math.log2(c.count) * 2.2) : 7.5, color = c.groups[0].color;
      shapes += `<g class="apin" data-atlas="cluster:${i}" role="button" aria-label="${esc(c.groups.map((g) => g.place.name).join(", "))}"><circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="${r.toFixed(1)}" fill="${color}" stroke="#fff" stroke-width="2"/>${c.count > 1 ? `<text x="${c.x.toFixed(1)}" y="${(c.y + 4 * k).toFixed(1)}" font-size="${11 * k}" text-anchor="middle" fill="#fff" font-weight="700">${c.count}</text>` : ""}<circle class="ahit" cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="${Math.max(r, 16)}"/></g>`;
      taken.push({ x0: c.x - r, x1: c.x + r, y0: c.y - r, y1: c.y + r });
    });
    // The open page's place stays marked.
    const sel = st.page && st.page.kind === "place" && places().find((p) => p.key === st.page.key);
    if (sel) { const xy = P(sel.lon, sel.lat); shapes += `<circle cx="${xy[0].toFixed(1)}" cy="${xy[1].toFixed(1)}" r="12" fill="none" stroke="${AREA}" stroke-width="2.5"/>`; taken.push({ x0: xy[0] - 12, x1: xy[0] + 12, y0: xy[1] - 12, y1: xy[1] + 12 }); }
    // Place names beside their dots and pins: the open place first, then pins, then regions, then the rest.
    const named = [
      ...(sel ? [{ p: sel, xy: P(sel.lon, sel.lat), w: 4, gap: 15 }] : []),
      ...clusters.filter((c) => c.groups.length === 1).map((c) => ({ p: c.groups[0].place, xy: [c.x, c.y], w: 3, gap: 11 })),
      ...dots.map((d) => ({ ...d, w: d.p.kind === "region" ? 2 : 1 })),
    ].sort((a, b) => b.w - a.w);
    const seen = new Set();
    const placeLabels = named.filter((n) => !seen.has(n.p.key) && seen.add(n.p.key)).map((n) => ({ x: n.xy[0], y: n.xy[1], text: n.p.name, size: (n.w >= 3 ? 12 : n.p.kind === "region" ? 11.5 : 10.5) * k, cls: n.w >= 3 ? "lp strong" : n.p.kind === "region" ? "lp reg" : "lp", dot: true, gap: n.gap, act: `place:${n.p.key}` }));
    // Villages, for finding one's way in the closest view (names only).
    const placeNames = new Set(places().map((x) => x.name.toLowerCase()));   // a village that is also one of our places is named once, as the place
    const vill = level === "local" ? A.villages().filter((x) => !placeNames.has(x.name.toLowerCase())).map((x) => ({ xy: P(x.lon, x.lat), name: x.name })).filter((x) => inside(x.xy)).map((x) => ({ x: x.xy[0], y: x.xy[1], text: x.name, size: 9.5 * k, cls: "lv", dot: true })) : [];
    const fitted = A.fitLabels([...placeLabels, ...labels.filter((l) => l.cls.startsWith("lc")), ...labels.filter((l) => l.cls === "la"), ...vill], w, h, taken);
    const text = fitted.map((l) => `<text class="${l.cls}" x="${l.x.toFixed(1)}" y="${l.y.toFixed(1)}" font-size="${l.size.toFixed(1)}" text-anchor="${l.anchor}"${l.act ? ` data-atlas="${esc(l.act)}"` : ""}>${esc(l.text)}</text>`).join("");
    const vdots = vill.filter((x) => fitted.some((f) => f.text === x.text)).map((x) => `<circle cx="${x.x.toFixed(1)}" cy="${x.y.toFixed(1)}" r="2" fill="#7d8a80"/>`).join("");
    over.innerHTML = vdots + shapes + text;
    // Scale bar and a line on what is shown.
    const sc = A.scaleFor(v, w);
    $("[data-atlas-scale]").innerHTML = `<i style="width:${Math.round(sc.px)}px"></i><span>${sc.km} km</span>`;
    const note = st.card ? "" : st.show === "untried" ? "Places you have not had a wine from yet" : pinData.pins.length ? "" : st.show === "journal" ? "No wines from your journal on the map yet" : st.show === "liked" ? "No liked swipes on the map yet" : "No wines to show";
    $("[data-atlas-note]").textContent = note;
  }

  // ---------------------------------------------------------------- moving the map
  function setView(v, redraw = true) { st.view = A.clampView(v, aspectOf(), st.lim); setViewBox(); if (redraw) drawOver(); }
  function flyTo(place, redraw = true) {
    const area = A.areaFor(SHAPES, place), aspect = aspectOf();
    const v = area ? A.fitView(area.bbox, aspect, 0.35, 1.2, st.lim) : A.viewAt(place.lon, place.lat, place.kind === "region" ? 14 : 4, aspect, st.lim);
    // Leave room for the page sheet, which covers the lower part of the map: the place sits in the upper half.
    setView({ ...v, y: v.y + v.h * 0.25 }, redraw);
  }
  function fitPins() {
    const pins = pinSet().pins;
    if (!pins.length) { st.view = A.fitView([-125, -45, 150, 55], aspectOf(), 0.02, 3, st.lim); return; }
    const lons = pins.map((p) => p.place.lon), lats = pins.map((p) => p.place.lat);
    st.view = A.fitView([Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)], aspectOf(), 0.25, 6, st.lim);
  }
  function zoomBy(f, fx = 0.5, fy = 0.5) { setView(A.zoomView(st.view, f, fx, fy, aspectOf(), st.lim)); }

  // Fingers: one pans, two pinch; a quick second tap zooms in on that point.
  function bind() {
    const stage = $("[data-atlas-stage]"), over = $("[data-atlas-over]");
    const frac = (e) => { const r = stage.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
    stage.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".actl, .asrc")) return;
      st.pointers.set(e.pointerId, frac(e));
      if (stage.setPointerCapture) try { stage.setPointerCapture(e.pointerId); } catch (_) { /* a synthetic pointer */ }
      st.gesture = { start: new Map(st.pointers), view: st.view, moved: false, at: Date.now() };
    });
    stage.addEventListener("pointermove", (e) => {
      if (!st.pointers.has(e.pointerId) || !st.gesture) return;
      st.pointers.set(e.pointerId, frac(e));
      const g = st.gesture, ids = [...st.pointers.keys()].filter((id) => g.start.has(id)), aspect = aspectOf();
      if (ids.length >= 2) {
        const [a0, b0] = ids.slice(0, 2).map((id) => g.start.get(id)), [a1, b1] = ids.slice(0, 2).map((id) => st.pointers.get(id));
        const d0 = Math.hypot(a0[0] - b0[0], (a0[1] - b0[1]) * aspect), d1 = Math.hypot(a1[0] - b1[0], (a1[1] - b1[1]) * aspect);
        if (d0 > 0.01) {
          const m0 = [(a0[0] + b0[0]) / 2, (a0[1] + b0[1]) / 2], m1 = [(a1[0] + b1[0]) / 2, (a1[1] + b1[1]) / 2];
          let v = A.zoomView(g.view, d1 / d0, m0[0], m0[1], aspect, st.lim);
          v = A.panView(v, m1[0] - m0[0], m1[1] - m0[1], aspect, st.lim);
          st.view = v; g.moved = true;
        }
      } else if (ids.length === 1) {
        const s = g.start.get(ids[0]), p = st.pointers.get(ids[0]), dx = p[0] - s[0], dy = p[1] - s[1];
        if (g.moved || Math.hypot(dx, dy * aspect) > 0.015) { st.view = A.panView(g.view, dx, dy, aspect, st.lim); g.moved = true; }
      }
      if (g.moved) { over.classList.add("moving"); setViewBox(); }
    });
    const end = (e) => {
      if (!st || !st.pointers.has(e.pointerId)) return;
      st.pointers.delete(e.pointerId);
      const g = st.gesture;
      if (st.pointers.size) { st.gesture = { start: new Map(st.pointers), view: st.view, moved: g ? g.moved : false, at: Date.now() }; return; }
      st.gesture = null;
      over.classList.remove("moving");
      if (g && g.moved) { drawOver(); st.lastTap = 0; st.movedAt = Date.now(); return; }
      // A tap: a second one soon after zooms in there (unless it was on a pin or a place, which the click handles).
      const now = Date.now(), [fx, fy] = frac(e);
      if (!e.target.closest("[data-atlas]") && now - st.lastTap < 320) { st.lastTap = 0; zoomBy(2.5, fx, fy); return; }
      st.lastTap = now;
    };
    stage.addEventListener("pointerup", end);
    stage.addEventListener("pointercancel", end);
    stage.addEventListener("wheel", (e) => { e.preventDefault(); const [fx, fy] = frac(e); zoomBy(e.deltaY < 0 ? 1.25 : 0.8, fx, fy); }, { passive: false });
    const shell = $(".atlas");   // the listeners go on the screen itself, which is made anew each time the Atlas opens
    shell.addEventListener("click", onClick);
    shell.addEventListener("input", (e) => { if (e.target.matches("[data-atlas-search]")) { st.search = e.target.value; showFound(); } });
    document.addEventListener("keydown", onKey);
  }
  // Escape closes the page, then the Atlas; + and - zoom (not while typing in the search). A rating sheet opened from the map takes its own keys.
  function onKey(e) {
    if (!st || document.querySelector("#overlay .overlay")) return;
    if (e.key === "Escape") { e.preventDefault(); if (st.page) closePage(); else ctx.close(); }   // the card's map has no page: it closes
    else if (e.target.matches("input, textarea, select")) return;
    else if (e.key === "+" || e.key === "=") zoomBy(2);
    else if (e.key === "-") zoomBy(0.5);
  }

  function onClick(e) {
    const t = e.target.closest("[data-atlas]");
    if (!t || !st) return;
    if (Date.now() - (st.movedAt || 0) < 350 && t.closest("[data-atlas-stage]")) return;   // the click that ends a drag is not a tap
    if (st.card && Date.now() - st.openedAt < 400) return;   // the click that trails the tap which opened the card's map must not close it
    const [a, ...rest] = t.dataset.atlas.split(":"), b = rest.join(":");
    if (st.card) {   // the card's map: close (the button, or a tap outside the box), zoom, home, or the full Atlas; its places are only to look at
      if (a === "close" || (a === "back" && e.target === t)) ctx.close();
      else if (a === "zin") zoomBy(2);
      else if (a === "zout") zoomBy(0.5);
      else if (a === "world") { cardHome(); setView(st.view); }
      else if (a === "full") ctx.openFull(st.card.place.key);   // a country has no key: the Atlas opens on the world
      return;
    }
    if (a === "close") ctx.close();
    else if (a === "zin") zoomBy(2);
    else if (a === "zout") zoomBy(0.5);
    else if (a === "world") setView(A.fitView([-125, -45, 150, 55], aspectOf(), 0.02, 3, st.lim));
    else if (a === "show") { st.show = b; refreshChips(); if (b !== "untried") fitPins(); setView(st.view); }
    else if (a === "style") { st.style = st.style === b ? "" : b; refreshChips(); drawOver(); }
    else if (a === "place") { const p = places().find((x) => x.key === b); if (p) { st.search = ""; showFound(); openPage({ kind: "place", key: p.key }); flyTo(p); } }
    else if (a === "country") { const c = SHAPES.countries.find((x) => x.name === b); if (c) { openPage({ kind: "country", name: b }); setView(A.fitView(c.bbox, aspectOf(), 0.08, 3, st.lim)); } }
    else if (a === "cluster") {
      const c = st.clusters[Number(b)]; if (!c) return;
      if (c.groups.length === 1) { openPage({ kind: "place", key: c.groups[0].place.key }); flyTo(c.groups[0].place); return; }
      const lons = c.groups.map((g) => g.place.lon), lats = c.groups.map((g) => g.place.lat);
      setView(A.fitView([Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)], aspectOf(), 0.4, A.MIN_W * 2, st.lim));
    }
    else if (a === "pageclose") closePage();
    else if (a === "learn") { const f = st.page && st.page.facts; if (f) ctx.learnAbout(A.topicsOf(f), f.place.name); }
  }
  function refreshChips() {
    root.querySelectorAll("[data-atlas^='show:']").forEach((x) => x.classList.toggle("on", x.dataset.atlas === "show:" + st.show));
    root.querySelectorAll("[data-atlas^='style:']").forEach((x) => x.classList.toggle("on", x.dataset.atlas === "style:" + st.style));
  }
  // The search: places whose name holds every typed word.
  function showFound() {
    const box = $("[data-atlas-found]"), q = st.search.trim().toLowerCase();
    if (q.length < 2) { box.innerHTML = ""; return; }
    const words = q.split(/\s+/), fold = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const hits = places().filter((p) => words.every((w) => fold(p.name + " " + p.country).includes(fold(w)))).slice(0, 8);
    const countries = SHAPES.countries.filter((c) => c.wine && words.every((w) => fold(c.name).includes(fold(w)))).slice(0, 3);
    box.innerHTML = [...countries.map((c) => `<button class="chip" data-atlas="country:${esc(c.name)}">${esc(c.name)}</button>`), ...hits.map((p) => `<button class="chip" data-atlas="place:${esc(p.key)}">${esc(p.name)}<span class="muted">, ${esc(p.country)}</span></button>`)].join("") || `<span class="muted small">No place by that name on the map</span>`;
  }

  // ---------------------------------------------------------------- a place's page
  function openPage(page) {
    if (page.kind === "place") page.facts = A.placeFacts(page.key, { places: places(), cards: ctx.cards(), shapes: SHAPES });
    else page.facts = A.countryFacts(page.name, { places: places(), cards: ctx.cards() });
    if (!page.facts) return;
    st.page = page;
    const el = $("[data-atlas-page]");
    el.innerHTML = page.kind === "place" ? placeHtml(page.facts) : countryHtml(page.facts);
    el.hidden = false; el.scrollTop = 0;
    const sel = $("[data-atlas-sel]"), area = page.kind === "place" && A.areaFor(SHAPES, page.facts.place);
    sel.setAttribute("d", area ? area.d : "");
  }
  function closePage() { st.page = null; const el = $("[data-atlas-page]"); el.hidden = true; el.innerHTML = ""; $("[data-atlas-sel]").setAttribute("d", ""); drawOver(); }

  const chipList = (names) => names.map((n) => `<span class="chip still">${esc(n)}</span>`).join("");
  const section = (title, body, note = "") => (body ? `<div class="asec"><div class="asect">${esc(title)}</div>${body}${note ? `<div class="muted tiny">${esc(note)}</div>` : ""}</div>` : "");
  function myWinesHere(place) {
    const journal = A.pinsOf({ show: "journal", journal: ctx.journal(), cardsById: ctx.cardsById(), entryName: ctx.entryName, placeOf }).pins.filter((p) => p.place.key === place.key);
    const liked = A.pinsOf({ show: "liked", states: ctx.states(), cardsById: ctx.cardsById(), nameOf: ctx.nameOf, placeOf }).pins.filter((p) => p.place.key === place.key && !journal.some((j) => j.cardId === p.cardId));
    const lineOf = (p) => { const c = p.cardId && ctx.cardsById().get(p.cardId); return (c && infoLine(c)) || STYLE_WORD[p.style] || ""; };
    const rows = [...journal.map((p) => `<button class="jrow" data-action="entry:${esc(p.id)}"><span class="adotc" style="background:${p.color}"></span><span class="jl"><span class="serif trunc">${esc(p.name)}</span><span class="meta trunc">${esc(lineOf(p))}</span></span></button>`),
      ...liked.map((p) => `<div class="jrow still"><span class="adotc" style="background:${p.color}"></span><span class="jl"><span class="serif trunc">${esc(p.name)}</span><span class="meta trunc">Liked swipe${lineOf(p) ? " · " + esc(lineOf(p)) : ""}</span></span><button class="pill" data-action="review:${esc(p.cardId)}">I've had it: rate it</button></div>`)];
    return rows.join("");
  }
  function placeHtml(f) {
    const p = f.place;
    const chain = f.chain.map((s, i) => (i === f.chain.length - 1 ? `<b>${esc(s.name)}</b>` : s.kind === "country" ? `<button class="alink" data-atlas="country:${esc(s.name)}">${esc(s.name)}</button>` : s.key ? `<button class="alink" data-atlas="place:${esc(s.key)}">${esc(s.name)}</button>` : esc(s.name))).join(" › ");
    const boundary = f.area ? A.AREA_SOURCE[f.area.source] || "" : `No outline on file: the dot marks roughly where it is.`;
    const mine = myWinesHere(p);
    const tries = ctx.suggest(p) || [];
    const tryRows = tries.map((r) => `<div class="jrow still"><span class="jl"><span class="serif trunc">${esc(ctx.nameOf(r.card))}</span>${infoLine(r.card) ? `<span class="meta trunc">${esc(infoLine(r.card))}</span>` : ""}${r.reason ? `<span class="meta">${esc(r.reason)}</span>` : ""}</span><button class="pill" data-action="review:${esc(r.card.id)}">I've had it: rate it</button></div>`).join("");
    const quiz = ctx.quizFor(A.topicsOf(f));
    return `<div class="apagehead"><div><div class="muted tiny">${esc(KIND_WORD[p.kind] || "Place")}${f.designation ? ` · ${esc(f.designation)}` : ""}</div><div class="serif big">${esc(p.name)}</div><div class="small">${chain}</div></div>
        <button class="xbtn" data-atlas="pageclose" aria-label="Close the page">&times;</button></div>
      <div class="muted tiny">${esc(boundary)}</div>
      ${section("Your wines from here", mine)}
      ${section("Climate", f.climate ? `<p class="ptext">${esc(f.climate.text)}</p>` : "", "From our climate rule: typical for the place, not a fact about any one bottle.")}
      ${section("Grapes its rules name", f.ruleGrapes.length ? chipList(f.ruleGrapes) : "")}
      ${section("Grapes in our wines from here", f.labelGrapes.length ? chipList(f.labelGrapes) : "", "As written on the labels.")}
      ${section("Notes this place adds", f.flavors.length ? chipList(f.flavors) : "", "Typical notes our flavour rules add for wines from here.")}
      ${section("Wines to try from here", tryRows)}
      ${quiz ? `<button class="btn" data-atlas="learn">Learn about ${esc(p.name)}</button>` : ""}
      ${section("Nearby", f.nearby.map((n) => `<button class="chip" data-atlas="place:${esc(n.key)}">${esc(n.name)}</button>`).join(""))}`;
  }
  function countryHtml(f) {
    return `<div class="apagehead"><div><div class="muted tiny">Country</div><div class="serif big">${esc(f.country)}</div></div><button class="xbtn" data-atlas="pageclose" aria-label="Close the page">&times;</button></div>
      ${section("Wine regions", f.regions.map((r) => `<button class="chip" data-atlas="place:${esc(r.key)}">${esc(r.name)}</button>`).join(""))}
      ${section("Grapes in our wines from here", f.labelGrapes.length ? chipList(f.labelGrapes) : "", "As written on the labels.")}
      ${section("Types of wine", f.styles.length ? chipList(f.styles.map((s) => STYLE_WORD[s] || s)) : "")}
      ${!f.regions.length && !f.labelGrapes.length ? `<p class="muted small">We have no wine places on the map here yet.</p>` : ""}`;
  }

  // Redraw after the window changes size (a phone turned sideways).
  window.addEventListener("resize", () => { if (root && st) setView(st.view); });

  return { open, close, isOpen, redraw: () => { if (root && st) { drawOver(); if (st.page) openPage(st.page); } } };
}

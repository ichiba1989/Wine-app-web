// The card's maps, drawn by code as SVG text: the country silhouette with a pin (64 px), and the two zoom views (region, then vineyard).
//   Projection: equirectangular with a cosine-of-latitude correction on x, fitted to the box.
//   What a tap shows (the fallback rules): a vineyard shape  -> region view, then vineyard view
//                                          a known place     -> region view only; a second tap closes
//                                          no known place    -> the map has no + badge and is not tappable
// Anything drawn from schematic data says so. Pure: no browser, no network.
import { COUNTRY, VILLAGES, DETAIL } from "./geodata.js?v=1";
import { placeFor, tables } from "./flavors.js?v=1";
import { fold, placeKey } from "./flavordata.js?v=1";
import { tintFor } from "./visuals.js?v=1";

const COS = (lat) => Math.cos((lat * Math.PI) / 180);
const r1 = (n) => Math.round(n * 10) / 10;
const path = (pts) => "M" + pts.map(([x, y]) => `${r1(x)} ${r1(y)}`).join(" L") + " z";
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ---------------------------------------------------------------- the country map
export function hasCountry(country) { return !!COUNTRY[country]; }
// A projection that fits a country into a size x size box with a margin.
export function fitCountry(country, size = 64, pad = 5) {
  const polys = COUNTRY[country];
  if (!polys) return null;
  const all = polys.flat(), lats = all.map((p) => p[1]), lons = all.map((p) => p[0]);
  const latMin = Math.min(...lats), latMax = Math.max(...lats), lonMin = Math.min(...lons), lonMax = Math.max(...lons), lat0 = (latMin + latMax) / 2, c = COS(lat0);
  const w = (lonMax - lonMin) * c, h = latMax - latMin, s = Math.min((size - 2 * pad) / w, (size - 2 * pad) / h);
  const ox = (size - w * s) / 2, oy = (size - h * s) / 2;
  return { project: (lon, lat) => [ox + (lon - lonMin) * c * s, oy + (latMax - lat) * s], size, scale: s };
}
// The silhouette of the country with the wine's pin. Returns "" if the country has no outline.
export function countryMapSvg(country, place, type = "red", size = 64) {
  const fit = fitCountry(country, size);
  if (!fit) return "";
  const t = tintFor(type);
  const land = COUNTRY[country].map((poly) => `<path d="${path(poly.map(([lon, lat]) => fit.project(lon, lat)))}" fill="#cfdacb" stroke="#8fa38c" stroke-width="1" stroke-linejoin="round"/>`).join("");
  let pin = "";
  if (place && Number.isFinite(place.lat) && Number.isFinite(place.lon)) {
    const [x, y] = fit.project(place.lon, place.lat);
    pin = `<circle cx="${r1(x)}" cy="${r1(y)}" r="5" fill="${t.pin}" opacity=".28"/><circle cx="${r1(x)}" cy="${r1(y)}" r="3" fill="${t.pin}" stroke="#fff" stroke-width="1.3"/>`;
  }
  return `<svg class="cmap" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">${land}${pin}</svg>`;
}

// ---------------------------------------------------------------- what a tap on the map shows
const foldedWords = (s) => ` ${fold(s)} `;
// A vineyard with a schematic shape that the wine belongs to (its vineyard or its name mentions it, in the same country).
export function detailFor(card) {
  const hay = [card.vineyard, card.cuvee, card.raw && card.raw.wine_name].filter(Boolean).map(foldedWords);
  for (const [key, d] of Object.entries(DETAIL)) if (fold(d.country) === fold(card.country) && hay.some((h) => h.includes(` ${key} `))) return { key, ...d };
  return null;
}
// null = the map is not tappable. Otherwise { place, detail, steps: ["region"] or ["region", "vineyard"] }.
export function zoomPlan(card) {
  const place = placeFor(card);
  if (!place) return null;
  const detail = detailFor(card);
  return { place, detail, steps: detail ? ["region", "vineyard"] : ["region"] };
}
// The one-line caption for each step.
export function captionFor(plan, step) {
  if (step === "vineyard" && plan.detail) return `${plan.detail.name}, ${plan.detail.place}${plan.detail.schematic ? ". Schematic outline" : ""}`;
  return `${plan.place.name}${plan.place.country ? ", " + plan.place.country : ""}`;
}

// ---------------------------------------------------------------- labels that do not overlap
const textW = (t, size) => t.length * size * 0.56;
const hit = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
// items: [{ x, y, text, size, weight }] in order of importance. Returns the drawn <text> elements; a label that fits nowhere is left out (its dot stays).
export function placeLabels(items, S, avoid = []) {
  const taken = [...avoid], out = [];
  for (const raw of items) {
    const room = Math.floor((S * 0.56) / (raw.size * 0.56));   // a long name is cut so it fits
    const it = raw.text.length > room ? { ...raw, text: raw.text.slice(0, room - 1) + "\u2026" } : raw;
    const w = textW(it.text, it.size), h = it.size;
    const g = it.gap || 7;   // how far the label stands from its dot (the pin's own label stands further out)
    const tries = [[g, 3.6, "start"], [-g, 3.6, "end"], [0, -g - 2, "middle"], [0, g + 8, "middle"], [g + 1, -g, "start"], [-g - 1, -g, "end"], [g + 1, g + 9, "start"], [-g - 1, g + 9, "end"]];
    for (const [dx, dy, anchor] of tries) {
      const x = it.x + dx, y = it.y + dy, x0 = anchor === "start" ? x : anchor === "end" ? x - w : x - w / 2;
      const box = { x0, x1: x0 + w, y0: y - h * 0.8, y1: y + h * 0.25 };
      if (box.x0 < 3 || box.x1 > S - 3 || box.y0 < 3 || box.y1 > S - 3) continue;
      if (taken.some((t) => hit(box, t))) continue;
      taken.push(box);
      out.push(`<text x="${r1(x)}" y="${r1(y)}" font-size="${it.size}" font-weight="${it.weight || 400}" fill="#1c2a24" text-anchor="${anchor}" paint-order="stroke" stroke="#f1f5ef" stroke-width="3.2">${esc(it.text)}</text>`);
      break;
    }
  }
  return out.join("");
}

// ---------------------------------------------------------------- the region view
const niceKm = (km) => [1, 2, 5, 10, 20, 50, 100, 200].find((n) => n >= km * 0.6) || 200;
// The view to draw: a curated region whose window holds the wine's place, else a window around the place with the nearby places as dots.
export function regionView(place) {
  const c = COS(place.lat);
  let best = null;
  for (const [key, v] of Object.entries(VILLAGES)) {
    if (!key.startsWith(fold(place.country) + "|")) continue;
    const dlat = Math.abs(place.lat - v.view[0]), dlon = Math.abs(place.lon - v.view[1]) * COS(v.view[0]);
    if (dlat <= v.span * 0.4 && dlon <= v.span * 0.4 && (!best || dlat + dlon < best.d))   // well inside the window, so the pin and its label are never at the edge
      best = { key, v, d: dlat + dlon };
  }
  if (best) return { center: best.v.view, span: best.v.span, zone: best.v.zone, dots: best.v.villages.map(([name, lat, lon]) => ({ name, lat, lon })), curated: true };
  let span = place.kind === "region" ? 2.4 : 1.1, dots = [];
  for (let widen = 0; widen < 3; widen++) {
    dots = [...tables().REGION.values()].filter((p) => p.country === place.country && p.name !== place.name && Number.isFinite(p.lat) && Math.abs(p.lat - place.lat) <= span * 0.46 && Math.abs(p.lon - place.lon) * c <= span * 0.46)
      .sort((a, b) => Math.hypot(a.lat - place.lat, (a.lon - place.lon) * c) - Math.hypot(b.lat - place.lat, (b.lon - place.lon) * c)).slice(0, 7).map((p) => ({ name: p.name, lat: p.lat, lon: p.lon }));
    if (dots.length >= 2) break;
    span *= 2;
  }
  return { center: [place.lat, place.lon], span, zone: place.kind === "region" ? span * 0.22 : Math.min(span * 0.12, 0.25), dots, curated: false };
}
export function regionViewSvg(place, type = "red") {
  const v = regionView(place), t = tintFor(type), S = 300, k = S / v.span, c = COS(v.center[0]);
  const P = (lat, lon) => [S / 2 + (lon - v.center[1]) * c * k, S / 2 - (lat - v.center[0]) * k];
  const [px, py] = P(place.lat, place.lon), zr = v.zone * k;
  const grid = [1, 2, 3].map((i) => `<path d="M${(S / 4) * i} 0 V${S} M0 ${(S / 4) * i} H${S}" stroke="#d8e2d4" stroke-width=".8"/>`).join("");
  const near = v.dots.map((d) => ({ ...d, xy: P(d.lat, d.lon) })).filter((d) => d.xy[0] >= 6 && d.xy[0] <= S - 6 && d.xy[1] >= 8 && d.xy[1] <= S - 6 && fold(d.name) !== fold(place.name) && Math.hypot(d.xy[0] - px, d.xy[1] - py) > 11);
  const dots = near.map((d) => `<circle cx="${r1(d.xy[0])}" cy="${r1(d.xy[1])}" r="3.4" fill="#6f8a6c"/>`).join("");
  const label = placeLabels([{ x: px, y: py, text: place.name, size: 12.5, weight: 700, gap: 12 }, ...near.sort((a, b) => Math.hypot(a.xy[0] - px, a.xy[1] - py) - Math.hypot(b.xy[0] - px, b.xy[1] - py)).map((d) => ({ x: d.xy[0], y: d.xy[1], text: d.name, size: 11 }))], S, [{ x0: px - 9, x1: px + 9, y0: py - 9, y1: py + 9 }, { x0: 8, x1: 150, y0: S - 28, y1: S - 6 }]);
  const km = niceKm(((S * 0.28) / k) * 111), bar = (km / 111) * k * c;
  return `<svg class="zsvg" viewBox="0 0 ${S} ${S}" aria-hidden="true"><rect width="${S}" height="${S}" fill="#eaf0e6"/>${grid}
    <ellipse cx="${r1(px)}" cy="${r1(py)}" rx="${r1(zr)}" ry="${r1(zr * 0.85)}" fill="${t.pin}" opacity=".16" stroke="${t.pin}" stroke-width="1" stroke-dasharray="4 3"/>
    ${dots}<circle cx="${r1(px)}" cy="${r1(py)}" r="9" fill="${t.pin}" opacity=".25"/><circle cx="${r1(px)}" cy="${r1(py)}" r="5.2" fill="${t.pin}" stroke="#fff" stroke-width="2"/>${label}
    <path d="M12 ${S - 14} h${r1(bar)} M12 ${S - 18} v8 M${r1(12 + bar)} ${S - 18} v8" stroke="#33443a" stroke-width="1.4" fill="none"/><text x="12" y="${S - 22}" font-size="10" fill="#33443a">about ${km} km</text></svg>`;
}

// ---------------------------------------------------------------- the vineyard view (schematic)
export function vineyardViewSvg(d, type = "red") {
  const t = tintFor(type), S = 300, pts = [...d.outline, ...d.neighbors.flatMap((n) => n.poly), ...(d.communeLine || [])];
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const m = 34, s = Math.min((S - 2 * m) / (x1 - x0), (S - 2 * m) / (y1 - y0)), ox = (S - (x1 - x0) * s) / 2 - x0 * s, oy = (S - (y1 - y0) * s) / 2 + y1 * s;
  const Q = ([x, y]) => [ox + x * s, oy - y * s];
  const cen = (poly) => { const q = poly.map(Q); return [q.reduce((a, p) => a + p[0], 0) / q.length, q.reduce((a, p) => a + p[1], 0) / q.length]; };
  const neigh = d.neighbors.map((n) => { const [cx, cy] = cen(n.poly), w = textW(n.name, 10), x = Math.max(6 + w / 2, Math.min(S - 6 - w / 2, cx)); return `<path d="${path(n.poly.map(Q))}" fill="#dfe7da" stroke="#9fb09b" stroke-width="1"/><text x="${r1(x)}" y="${r1(cy)}" font-size="10" fill="#4a5a50" text-anchor="middle" paint-order="stroke" stroke="#eaf0e6" stroke-width="2.5">${esc(n.name)}</text>`; }).join("");
  const [ccx, ccy] = cen(d.outline);
  const commune = d.communeLine ? `<path d="${"M" + d.communeLine.map(Q).map(([x, y]) => `${r1(x)} ${r1(y)}`).join(" L")}" stroke="#7a3a4a" stroke-width="1.2" stroke-dasharray="5 3" fill="none"/>` : "";
  const m100 = d.scale, bar = m100 * s;
  const facts = [d.slope, d.elevation && `Elevation ${d.elevation}`].filter(Boolean);
  return `<svg class="zsvg" viewBox="0 0 ${S} ${S}" aria-hidden="true"><rect width="${S}" height="${S}" fill="#eaf0e6"/>${neigh}
    <path d="${path(d.outline.map(Q))}" fill="${t.pin}" fill-opacity=".3" stroke="${t.pin}" stroke-width="2" stroke-linejoin="round"/>${commune}
    <text x="${r1(ccx)}" y="${r1(ccy)}" font-size="13" font-weight="700" fill="#1c2a24" text-anchor="middle" paint-order="stroke" stroke="#eaf0e6" stroke-width="3.5">${esc(d.name)}</text>
    <text x="${r1(ccx)}" y="${r1(ccy + 14)}" font-size="10" fill="#33443a" text-anchor="middle" paint-order="stroke" stroke="#eaf0e6" stroke-width="3">${d.area} ha</text>
    ${d.north ? `<g transform="translate(${S - 22} 24)"><path d="M0 -12 L6 6 L0 2 L-6 6z" fill="#33443a"/><text y="18" font-size="9" fill="#33443a" text-anchor="middle">N</text></g>` : ""}
    <path d="M12 ${S - 14} h${r1(bar)} M12 ${S - 18} v8 M${r1(12 + bar)} ${S - 18} v8" stroke="#33443a" stroke-width="1.4" fill="none"/><text x="12" y="${S - 22}" font-size="10" fill="#33443a">${m100} m</text>
    ${facts.map((f, i) => `<text x="${S - 10}" y="${S - 22 + i * -12}" font-size="10" fill="#33443a" text-anchor="end">${esc(f)}</text>`).join("")}
    ${d.schematic ? `<g transform="translate(8 8)"><rect width="104" height="18" rx="9" fill="#fff" stroke="#c9a227"/><text x="52" y="12.4" font-size="10" fill="#7a5a10" text-anchor="middle">Schematic outline</text></g>` : ""}</svg>`;
}

// Where the pin sits in the region view, as fractions of its width and height: the zoom grows out of this point.
export function regionPin(place) {
  const v = regionView(place), c = COS(v.center[0]), k = 300 / v.span;
  return [Math.min(0.95, Math.max(0.05, (300 / 2 + (place.lon - v.center[1]) * c * k) / 300)), Math.min(0.95, Math.max(0.05, (300 / 2 - (place.lat - v.center[0]) * k) / 300))];
}

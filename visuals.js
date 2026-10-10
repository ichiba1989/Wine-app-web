// The card's drawings, all made by code (no photos, labels or logos): four bottle silhouettes tinted by the type of wine, and 42 flat flavor icons.
// Pure: they return SVG text.
import { LABEL } from "./flavordata.js?v=1";

// ---------------------------------------------------------------- bottles
// Each shape is one path in a 100 x 300 box; the capsule is the foil at the top. The glass and capsule colours come from the type of wine.
export const SHAPES = {
  bordeaux: { d: "M43 8 h14 v62 c0 12 4 18 14 28 c10 10 11 20 11 38 v140 a12 12 0 0 1 -12 12 h-40 a12 12 0 0 1 -12 -12 v-140 c0 -18 1 -28 11 -38 c10 -10 14 -16 14 -28 z", cap: { x: 41, w: 18, h: 30 } },
  burgundy: { d: "M43 8 h14 v52 c0 22 26 40 26 84 v138 a12 12 0 0 1 -12 12 h-42 a12 12 0 0 1 -12 -12 v-138 c0 -44 26 -62 26 -84 z", cap: { x: 41, w: 18, h: 30 } },
  hock: { d: "M43 8 h14 v66 c0 24 20 36 20 70 v140 a12 12 0 0 1 -12 12 h-30 a12 12 0 0 1 -12 -12 v-140 c0 -34 20 -46 20 -70 z", cap: { x: 41, w: 18, h: 30 } },
  champagne: { d: "M40 8 h20 v46 c0 24 30 40 30 90 v136 a14 14 0 0 1 -14 14 h-52 a14 14 0 0 1 -14 -14 v-136 c0 -50 30 -66 30 -90 z", cap: { x: 38, w: 24, h: 52 } },
};
export const TYPE = {
  red: { glass: "#5b2333", capsule: "#8a2b43", pin: "#7B1E3A", dot: "#7B1E3A", label: "Red" },
  white: { glass: "#cdd58a", capsule: "#b9a64a", pin: "#B79A2E", dot: "#C9B24A", label: "White" },
  rose: { glass: "#eba3ad", capsule: "#d1707c", pin: "#D36A78", dot: "#E58A96", label: "Ros\u00e9" },
  sparkling: { glass: "#d4dba6", capsule: "#c9a227", pin: "#C9A227", dot: "#D8B84A", label: "Sparkling" },
  orange: { glass: "#e0a15a", capsule: "#b9722a", pin: "#C9822E", dot: "#E0A15A", label: "Orange" },
  fortified: { glass: "#6b3a24", capsule: "#8a5a2a", pin: "#8a5a2a", dot: "#8a5a2a", label: "Fortified" },
  unknown: { glass: "#8a948f", capsule: "#6f7a75", pin: "#6f7a75", dot: "#8a948f", label: "Other" },
};
export const tintFor = (type) => TYPE[type] || TYPE.unknown;
// The bottle: a flat, abstract silhouette in the colour of the wine's type, no label art or highlights. class "bottle" is what the card's CSS sizes.
export function bottleSilhouette(shape = "bordeaux", type = "red") {
  const sh = SHAPES[shape] || SHAPES.bordeaux, t = tintFor(type);
  return `<svg class="bottle" viewBox="0 0 100 300" aria-hidden="true" data-shape="${shape in SHAPES ? shape : "bordeaux"}">
    <path d="${sh.d}" fill="${t.glass}"/>
    <rect x="${sh.cap.x}" y="6" width="${sh.cap.w}" height="${sh.cap.h}" rx="3" fill="${t.capsule}"/>
    </svg>`;
}

// ---------------------------------------------------------------- flavor icons
// Each glyph is drawn in a 24 x 24 box; flavorIcon puts it on a dark round badge.
const petals = (n, rx, ry, dist, fill, cx = 12, cy = 12) => Array.from({ length: n }, (_, i) => `<ellipse cx="${cx}" cy="${cy - dist}" rx="${rx}" ry="${ry}" fill="${fill}" transform="rotate(${(360 / n) * i} ${cx} ${cy})"/>`).join("");
const dots = (pts, r, fill) => pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`).join("");
const leaf = (x, y, rot = 0, fill = "#5fae4a") => `<path d="M0 0 C3 -1 6 -4 6 -7 C3 -7 0 -4 0 0z" fill="${fill}" transform="translate(${x} ${y}) rotate(${rot})"/>`;
export const G = {
  blackcurrant: `${dots([[8, 14.5], [15.5, 14.5], [11.8, 8.8]], 4.2, "#4a2f7a")}${dots([[6.8, 13.2], [14.3, 13.2], [10.6, 7.5]], 1.1, "#9a7ad0")}<path d="M11.8 5 L12.6 2.2" stroke="#5fae4a" stroke-width="1.4" stroke-linecap="round"/>`,
  blackberry: `${dots([[8.5, 15], [12, 15], [15.5, 15], [10.2, 11.6], [13.8, 11.6], [12, 8.2], [8.2, 11.8]], 2.7, "#3f2a63")}${dots([[7.7, 14.2], [11.2, 14.2], [14.7, 14.2], [11.4, 7.5]], .8, "#9a7ad0")}${leaf(12, 6.5, -20)}`,
  plum: `<circle cx="12" cy="13.5" r="7.5" fill="#6a3a8c"/><path d="M12 6.5 C9.5 12 9.5 16 12 21" stroke="#9a6ac0" stroke-width="1.2" fill="none"/><ellipse cx="9" cy="11" rx="1.6" ry="2.6" fill="#fff" opacity=".22"/><path d="M12 6.4 L12.5 3" stroke="#7a5a3a" stroke-width="1.3" stroke-linecap="round"/>${leaf(12.6, 4, 20)}`,
  cherry: `<path d="M8 15 Q10 6 15.5 3 M16 14.5 Q15.8 8 15.5 3" stroke="#6a8a3a" stroke-width="1.3" fill="none" stroke-linecap="round"/>${dots([[8, 16.5], [16, 16]], 4.3, "#d63a4a")}${dots([[6.7, 15.2], [14.7, 14.8]], 1.1, "#ffb0b6")}${leaf(15.5, 3.6, -10)}`,
  strawberry: `<path d="M12 21.5 C5 17 3.8 11 6.6 8.6 C8.8 6.8 11 7.8 12 9.4 C13 7.8 15.2 6.8 17.4 8.6 C20.2 11 19 17 12 21.5z" fill="#e0434f"/>${dots([[9, 12], [12, 11.5], [15, 12], [10, 15], [14, 15], [12, 18]], .8, "#ffe27a")}<path d="M7.8 8.2 L12 6.4 L16.2 8.2 L14 9.4 L12 8.2 L10 9.4z" fill="#4f9a3a"/>`,
  raspberry: `${dots([[8.4, 15.4], [12, 15.8], [15.6, 15.4], [9.6, 12], [14.4, 12], [12, 9.2], [10.4, 18.4], [13.6, 18.4], [7.4, 12], [16.6, 12]], 2.2, "#d83a6a")}${dots([[7.6, 14.7], [11.2, 15], [14.8, 14.7]], .7, "#ff9ab8")}${leaf(12, 8, -10)}`,
  lemon: `<path d="M2.8 12 C3.2 11 4 10.6 5 10.8 C7 6 17 6 19 10.8 C20 10.6 20.8 11 21.2 12 C20.8 13 20 13.4 19 13.2 C17 18 7 18 5 13.2 C4 13.4 3.2 13 2.8 12z" fill="#f2d04a"/><path d="M7.5 10.5 Q12 8.2 16.5 10.5" stroke="#fff6b0" stroke-width="1.2" fill="none" stroke-linecap="round" opacity=".8"/>`,
  lime: `<circle cx="12" cy="12" r="8.4" fill="#6fb53a"/><circle cx="12" cy="12" r="6.9" fill="#d3ef86"/>${Array.from({ length: 6 }, (_, i) => `<path d="M12 12 L12 5.6" stroke="#8fcf4a" stroke-width="1.1" transform="rotate(${60 * i} 12 12)"/>`).join("")}<circle cx="12" cy="12" r="1.1" fill="#8fcf4a"/>`,
  grapefruit: `<circle cx="12" cy="12" r="8.4" fill="#e8604f"/><circle cx="12" cy="12" r="6.9" fill="#f9a99a"/>${Array.from({ length: 8 }, (_, i) => `<path d="M12 12 L12 5.8" stroke="#fde0d8" stroke-width="1" transform="rotate(${45 * i} 12 12)"/>`).join("")}<circle cx="12" cy="12" r="1.1" fill="#fde0d8"/>`,
  orange: `<circle cx="12" cy="13" r="7.6" fill="#f08a2c"/>${dots([[9, 11], [14.5, 10.5], [10.5, 15.5], [15.5, 15], [12, 13]], .55, "#c96a14")}<ellipse cx="9.4" cy="9.6" rx="1.8" ry="2.6" fill="#fff" opacity=".22" transform="rotate(30 9.4 9.6)"/>${leaf(12.4, 5.6, 10)}`,
  apple: `<path d="M12 8.2 C9.4 5.8 4.6 7.2 4.6 12.8 C4.6 17.6 8 21 10.6 21 C11.4 21 11.7 20.6 12 20.6 C12.3 20.6 12.6 21 13.4 21 C16 21 19.4 17.6 19.4 12.8 C19.4 7.2 14.6 5.8 12 8.2z" fill="#7fc34a"/><path d="M12 8 Q12.4 5 14.2 3.6" stroke="#6b4a2a" stroke-width="1.3" fill="none" stroke-linecap="round"/>${leaf(12.8, 5.8, 10)}<ellipse cx="8.2" cy="12" rx="1.4" ry="2.6" fill="#fff" opacity=".25"/>`,
  pear: `<path d="M12 4.4 C10.6 4.4 10 6 10 7.6 C10 9.8 6 10.8 6 15.2 C6 18.6 8.6 21 12 21 C15.4 21 18 18.6 18 15.2 C18 10.8 14 9.8 14 7.6 C14 6 13.4 4.4 12 4.4z" fill="#c4d65a"/><path d="M12 4.6 L12.6 2.4" stroke="#6b4a2a" stroke-width="1.3" stroke-linecap="round"/>${leaf(12.6, 3.4, 20)}<ellipse cx="9.4" cy="15" rx="1.3" ry="2.6" fill="#fff" opacity=".28"/>`,
  peach: `<circle cx="12" cy="13.2" r="7.6" fill="#f4a77a"/><path d="M12 6 Q8.8 13 12 20.6" stroke="#e0785a" stroke-width="1.2" fill="none"/><ellipse cx="9" cy="11" rx="1.6" ry="2.4" fill="#fff" opacity=".25"/>${leaf(12.6, 5.8, 20)}`,
  apricot: `<circle cx="12" cy="13.4" r="6.8" fill="#f0a030"/><path d="M12 7 Q9.4 13.4 12 20" stroke="#cf7a14" stroke-width="1.1" fill="none"/><ellipse cx="9.4" cy="11.6" rx="1.3" ry="2" fill="#fff" opacity=".25"/>${leaf(12.4, 6.4, 10)}`,
  pineapple: `<ellipse cx="12" cy="15.2" rx="5.8" ry="7" fill="#f2c230"/>${[[-3, 0], [0, 0], [3, 0]].map(([dx]) => `<path d="M${12 + dx} 9 L${12 + dx} 22" stroke="#c9941a" stroke-width=".8" opacity=".7"/>`).join("")}<path d="M7 12 L17 18 M7 17 L16 22 M17 12 L7 18 M16.5 17 L8 22" stroke="#c9941a" stroke-width=".8" opacity=".7"/><path d="M12 8.6 L8.6 3 L10.6 5.6 L12 2.2 L13.4 5.6 L15.4 3 z" fill="#4f9a3a"/>`,
  passionfruit: `<circle cx="12" cy="12" r="8.2" fill="#7a4a8c"/><circle cx="12" cy="12" r="5.8" fill="#f2d870"/>${dots([[10, 10.5], [13.5, 10], [11.5, 13], [14, 13.5], [9.6, 13.5], [12.4, 15.4]], 1, "#4a2f3a")}`,
  melon: `<circle cx="12" cy="12" r="8.4" fill="#8fc96a"/><circle cx="12" cy="12" r="6.9" fill="#f6c98c"/>${dots([[10, 10.5], [13.5, 10.4], [12, 13], [9.6, 13.4], [14.4, 13.4]], .9, "#c98a4a")}`,
  gooseberry: `<ellipse cx="12" cy="13.2" rx="6.6" ry="7.2" fill="#b8d878"/>${[-3.6, 0, 3.6].map((dx) => `<path d="M${12 + dx * .5} 6.4 Q${12 + dx * 1.6} 13 ${12 + dx * .5} 20" stroke="#86aa44" stroke-width=".9" fill="none"/>`).join("")}<path d="M10.5 6.4 L12 4 L13.5 6.4" stroke="#6b7a3a" stroke-width="1.2" fill="none" stroke-linecap="round"/>`,
  rose: `<circle cx="12" cy="12" r="8.4" fill="#e86a8a"/><path d="M12 12 m-1.6 0 a1.6 1.6 0 1 1 3.2 0 a3.4 3.4 0 1 1 -6.8 0 a5.2 5.2 0 1 1 10.4 0" stroke="#a82e52" stroke-width="1.3" fill="none" stroke-linecap="round"/>`,
  violet: `${petals(5, 2.9, 4, 3.6, "#9b7ad8")}<circle cx="12" cy="12" r="2" fill="#f2d84a"/>`,
  flowers: `${petals(5, 3, 4.2, 4, "#f6f1e4")}${petals(5, 1.2, 2, 4, "#e6dcc4")}<circle cx="12" cy="12" r="2.1" fill="#f0c030"/>`,
  grass: `<path d="M4 21 C5 13 6.5 8 7.2 4 C8.6 9 9.2 14 9.6 21z" fill="#6fb53a"/><path d="M9 21 C10 12 11.5 7 12.4 2.6 C14 8 14.6 14 14.8 21z" fill="#8fcf4a"/><path d="M14.4 21 C15 14 16.4 9 18 5.4 C19 10 19.4 15 19.8 21z" fill="#5fae4a"/>`,
  bellpepper: `<path d="M12 7 C7 5.4 4.4 9 5.4 14 C6 18.4 8.6 21 12 21 C15.4 21 18 18.4 18.6 14 C19.6 9 17 5.4 12 7z" fill="#4aa84a"/><path d="M12 7.4 Q10.4 14 12 20.6 M8.4 9 Q7.6 15 9.8 20 M15.6 9 Q16.4 15 14.2 20" stroke="#2f7a2f" stroke-width=".9" fill="none"/><path d="M12 7.4 L12.4 3.6 L14.6 3" stroke="#6b8a2a" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  herb: `<path d="M12 21 L12 4" stroke="#4f8a3a" stroke-width="1.3" stroke-linecap="round"/>${[[12, 8, -50], [12, 8, 50], [12, 12.5, -50], [12, 12.5, 50], [12, 17, -50], [12, 17, 50]].map(([x, y, r]) => `<ellipse cx="${x + (r < 0 ? -3 : 3)}" cy="${y}" rx="3" ry="1.4" fill="#6fb53a" transform="rotate(${r < 0 ? -25 : 25} ${x + (r < 0 ? -3 : 3)} ${y})"/>`).join("")}<ellipse cx="12" cy="3.6" rx="1.3" ry="2.2" fill="#8fcf4a"/>`,
  mint: `<path d="M12 20 C5 18 3.4 10 7 5 C13 5 17 10 12 20z" fill="#5fcf9a"/><path d="M12 20 C19 18 20.6 10 17 5 C14 5 13 8 12 11z" fill="#3fb67a" opacity=".85"/><path d="M12 19 L8.4 7" stroke="#2f8a5a" stroke-width=".9" stroke-linecap="round"/><path d="M12 19 L12 21.6" stroke="#6b8a3a" stroke-width="1.3" stroke-linecap="round"/>`,
  vanilla: `<path d="M5 19.4 C10 17.6 15 12 19 4.6" stroke="#4a301c" stroke-width="3.4" fill="none" stroke-linecap="round"/><path d="M5 19.4 C10 17.6 15 12 19 4.6" stroke="#7a5a3a" stroke-width="1" fill="none" stroke-linecap="round" opacity=".6"/>${petals(5, 1.5, 2.2, 2.6, "#f6efe0", 8, 7)}<circle cx="8" cy="7" r="1" fill="#f0c030"/>`,
  cedar: `<path d="M12 2.4 L7 9 H10 L5.6 14.6 H10 L6.6 19.4 H17.4 L14 14.6 H18.4 L14 9 H17z" fill="#5a9a4a"/><rect x="10.8" y="19" width="2.4" height="3" fill="#7a5a3a"/>`,
  toast: `<path d="M6 6.4 C6 3.4 11 2.6 12 4.4 C13 2.6 18 3.4 18 6.4 C18 8 17.2 8.6 17.2 9.4 V19.6 C17.2 20.4 16.6 21 15.8 21 H8.2 C7.4 21 6.8 20.4 6.8 19.6 V9.4 C6.8 8.6 6 8 6 6.4z" fill="#c98a3a"/><path d="M8.4 7 C8.4 5.4 11 5 12 6.2 C13 5 15.6 5.4 15.6 7 C15.6 8 15 8.4 15 9 V18.6 H9 V9 C9 8.4 8.4 8 8.4 7z" fill="#f0d090"/>`,
  chocolate: `<rect x="5" y="3.6" width="14" height="17" rx="2" fill="#6b3f2a"/>${[[7, 5.6], [12, 5.6], [7, 10.6], [12, 10.6], [7, 15.6], [12, 15.6]].map(([x, y]) => `<rect x="${x}" y="${y}" width="4.6" height="4" rx=".8" fill="#8a5a3a"/>`).join("")}<path d="M5 3.6 H19 V6 L5 6z" fill="#fff" opacity=".1"/>`,
  pepper: `${dots([[8.4, 15], [15.6, 15], [12, 8.8], [12, 15.4], [8.6, 10.2], [15.4, 9.6]], 3.1, "#7a6652")}${dots([[7.4, 14], [14.6, 14], [11, 7.8], [11, 14.4], [7.6, 9.2], [14.4, 8.6]], 1, "#d8c8ac")}${dots([[9.6, 16.2], [16.6, 16.2], [13, 10]], .5, "#4a3a2a")}`,
  earth: `<path d="M3.6 12.6 C3.6 6.8 8 4.4 12 4.4 C16 4.4 20.4 6.8 20.4 12.6 C20.4 13.4 19.8 13.8 19 13.8 H5 C4.2 13.8 3.6 13.4 3.6 12.6z" fill="#b8865a"/>${dots([[8, 9.2], [12.4, 7.6], [15.6, 10.6], [10.6, 11.8]], 1.3, "#f0dcc0")}<path d="M9.4 13.8 H14.6 L14 20.4 C14 21 13.4 21.4 12 21.4 C10.6 21.4 10 21 10 20.4z" fill="#ecdcc0"/>`,
  slate: `<path d="M3.4 17.4 L13 15 L20.6 17.8 L11 20.4z" fill="#6f7a86"/><path d="M3.4 13 L13 10.6 L20.6 13.4 L11 16z" fill="#8a96a3"/><path d="M3.4 8.6 L13 6.2 L20.6 9 L11 11.6z" fill="#a8b2bd"/><path d="M3.4 8.6 V13 L11 15.6 V11.6z" fill="#7d8894"/>`,
  chalk: `<path d="M5.6 15.4 C4.6 11 7.6 6.4 12 5.6 C16.4 4.8 20 8 19.6 12.4 C19.2 16.6 15.6 19.6 11.6 19.2 C8.6 18.8 6.2 17.6 5.6 15.4z" fill="#f2f0e6"/><path d="M8.6 15 Q11 12 15.6 13.6 M9 10.4 Q12 9 15 10" stroke="#cfcab6" stroke-width="1" fill="none" stroke-linecap="round"/><path d="M5.6 15.4 C6.2 17.6 8.6 18.8 11.6 19.2 C15.6 19.6 19.2 16.6 19.6 12.4 C17 16.6 9 18 5.6 15.4z" fill="#d6d2c0"/>`,
  tar: `<path d="M12 3.6 C9 8 5.6 11 5.6 15.2 C5.6 18.6 8.4 21 12 21 C15.6 21 18.4 18.6 18.4 15.2 C18.4 11 15 8 12 3.6z" fill="#3a3a3a" stroke="#7a7a7a" stroke-width=".9"/><ellipse cx="9.2" cy="14.6" rx="1.4" ry="2.8" fill="#fff" opacity=".4" transform="rotate(15 9.2 14.6)"/>`,
  petrol: `<path d="M12 3.2 C9 7.6 5.8 10.6 5.8 14.8 C5.8 18.2 8.6 20.8 12 20.8 C15.4 20.8 18.2 18.2 18.2 14.8 C18.2 10.6 15 7.6 12 3.2z" fill="#e8c840"/><path d="M12 3.2 C15 7.6 18.2 10.6 18.2 14.8 C18.2 18.2 15.4 20.8 12 20.8 C14.6 18.6 15.6 15 14.4 11.6 C13.8 9.4 12.8 5.4 12 3.2z" fill="#c9a420" opacity=".55"/><ellipse cx="9.2" cy="14.4" rx="1.3" ry="2.6" fill="#fff" opacity=".4" transform="rotate(15 9.2 14.4)"/>`,
  tea: `<path d="M4.6 10.4 H17 V15 C17 18 15 20 11.8 20 C8.6 20 4.6 18 4.6 15z" fill="#e8dcc0"/><path d="M17 11.6 H18.4 C20.4 11.6 20.4 16 18.2 16 H16.8" stroke="#e8dcc0" stroke-width="1.6" fill="none"/><ellipse cx="10.8" cy="10.4" rx="6.2" ry="1.5" fill="#b8844a"/><path d="M8 7.6 Q9 6 8 4.4 M11.6 7.6 Q12.6 6 11.6 4.4 M15 7.6 Q16 6 15 4.4" stroke="#d8d2c6" stroke-width="1.1" fill="none" stroke-linecap="round" opacity=".8"/>`,
  leather: `<rect x="2.6" y="8.6" width="18.8" height="6.8" rx="1.6" fill="#a0653a"/><path d="M4.6 10.6 H19.4 M4.6 13.4 H19.4" stroke="#e0b88a" stroke-width=".9" stroke-dasharray="1.6 1.4" fill="none"/><rect x="13.4" y="7.4" width="5" height="9.2" rx="1" fill="none" stroke="#d8d2c6" stroke-width="1.4"/><rect x="15.4" y="11.4" width="3.6" height="1.2" fill="#d8d2c6"/>`,
  licorice: `<path d="M12 12 m0 0 a1.8 1.8 0 1 1 3.6 0 a4.4 4.4 0 1 1 -8.8 0 a7 7 0 1 1 14 0" stroke="#5a5a62" stroke-width="3.4" fill="none" stroke-linecap="round"/><path d="M12 12 m0 0 a1.8 1.8 0 1 1 3.6 0 a4.4 4.4 0 1 1 -8.8 0 a7 7 0 1 1 14 0" stroke="#b0b0b8" stroke-width=".9" fill="none" stroke-linecap="round" opacity=".7"/>`,
  butter: `<path d="M3.6 10 L8.4 6.4 H20.4 L15.6 10z" fill="#fbefb0"/><path d="M3.6 10 H15.6 V19 H3.6z" fill="#f6e38a"/><path d="M15.6 10 L20.4 6.4 V15.4 L15.6 19z" fill="#e0c860"/><path d="M5.6 13 H13.6" stroke="#fff6c0" stroke-width="1" opacity=".7"/>`,
  brioche: `<path d="M3.8 16.4 C3.2 10.4 7.4 7 12 7 C16.6 7 20.8 10.4 20.2 16.4 C20.1 18 19 19 17.4 19 H6.6 C5 19 3.9 18 3.8 16.4z" fill="#e0a860"/><circle cx="12" cy="5.8" r="2.8" fill="#d99a4a"/><path d="M7 12 Q12 9.6 17 12" stroke="#f6d8a0" stroke-width="1.2" fill="none" stroke-linecap="round" opacity=".8"/><path d="M9 16 Q12 17.2 15 16" stroke="#b9803a" stroke-width="1" fill="none" stroke-linecap="round"/>`,
  almond: `<path d="M12 3.6 C16.6 7 18.4 13 15 18.4 C14 20 13 21 12 21 C11 21 10 20 9 18.4 C5.6 13 7.4 7 12 3.6z" fill="#d8b890"/><path d="M12 6 Q12.4 12 12 19" stroke="#a98860" stroke-width="1" fill="none"/><ellipse cx="9.8" cy="12" rx="1.1" ry="3" fill="#fff" opacity=".3"/>`,
  honey: `${[[8.8, 8.6], [15.2, 8.6], [12, 14.2]].map(([x, y]) => `<path d="M${x} ${y - 4.2} L${x + 3.6} ${y - 2.1} V${y + 2.1} L${x} ${y + 4.2} L${x - 3.6} ${y + 2.1} V${y - 2.1}z" fill="#f0b030" stroke="#c98a14" stroke-width=".8"/>`).join("")}<path d="M12 19 C11.4 20 11.6 21.4 12.4 21.4 C13.2 21.4 13.4 20 12.8 19z" fill="#f0b030"/>`,
};
export const FLAVOR_ICON_KEYS = Object.keys(G);
// A flavor icon: the glyph on a dark round badge. size is the badge's width in pixels.
export function flavorIcon(key, size = 30) {
  const glyph = G[key];
  if (!glyph) return "";
  return `<svg class="fico" viewBox="0 0 24 24" width="${size}" height="${size}" role="img" aria-label="${(LABEL[key] || key).replace(/"/g, "")}"><circle cx="12" cy="12" r="12" fill="#26332f"/><g transform="translate(3.2 3.2) scale(.73)">${glyph}</g></svg>`;
}
// The row of six flavors under the name: each icon with its label (which may wrap to two lines).
export function flavorRowHtml(picks) {
  if (!picks || !picks.length) return "";
  return `<div class="flavors" role="list" aria-label="Flavors">${picks.map((p) => `<div class="fl" role="listitem">${flavorIcon(p.key, 30)}<span>${p.label}</span></div>`).join("")}</div>`;
}

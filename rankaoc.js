// "Grand Cru" appellations that lie on the same land as a wider one (owner, 2026-10-18; all versions).
// In France a few rank words are not a word on the label inside an appellation but an appellation of their own, on the same ground as a wider
// one: Saint-Émilion Grand Cru lies inside Saint-Émilion, Chablis Grand Cru inside Chablis, Banyuls Grand Cru inside Banyuls, and each of the 51
// Alsace grands crus is its own AOC ("Alsace Grand Cru Furstentum") inside Alsace. A wine whose label names one of them belongs to that
// appellation, not to the wider one: Château Beau-Séjour Bécot is AOC Saint-Émilion Grand Cru. Filing it under Saint-Émilion with "Grand Cru"
// left in its name made the card say "St.-Émilion AOC".
// The list is INAO's own: every name here is an AOC in INAO's published delimitation (the same open file the Atlas outlines come from, Licence
// Ouverte; data.gouv.fr "Délimitation parcellaire des AOC viticoles de l'INAO"), so the place is created with the official name, and the move
// is made only by a stored rule (the label's words, product rule (2)) or, for a wine whose stored name does not say it, a cited source
// (docs/rank_appellations.mjs). Not here: Champagne's Grand Cru and 1er Cru (words on the label inside AOC Champagne), Chablis Premier Cru (a
// mention inside AOC Chablis), Italian "Classico" (a subzone of its DOC), and Burgundy's grands crus (already places of their own).
// Pure: no browser, no network. Read by logic.js (displayCuvee), geo.js (place names and checks), wineinfo.js (the editor's hint), venue.js on
// the venue branch, and docs/rank_appellations.mjs (the database copy and the catalog fix).
import { matchKey } from "./text.js?v=2";

export const RANK_SOURCE = "https://www.data.gouv.fr/fr/datasets/delimitation-parcellaire-des-aoc-viticoles-de-linao/";
// The 51 Alsace grands crus, spelled as INAO's file spells them (the AOC is "Alsace grand cru" followed by the name).
const ALSACE_GRANDS_CRUS = ["Altenberg de Bergbieten", "Altenberg de Bergheim", "Altenberg de Wolxheim", "Brand", "Bruderthal", "Eichberg", "Engelberg",
  "Florimont", "Frankstein", "Froehn", "Furstentum", "Geisberg", "Gloeckelberg", "Goldert", "Hatschbourg", "Hengst", "Kaefferkopf", "Kanzlerberg",
  "Kastelberg", "Kessler", "Kirchberg de Barr", "Kirchberg de Ribeauvillé", "Kitterlé", "Mambourg", "Mandelberg", "Marckrain", "Moenchberg",
  "Muenchberg", "Ollwiller", "Osterberg", "Pfersigberg", "Pfingstberg", "Praelatenberg", "Rangen", "Rosacker", "Saering", "Schlossberg",
  "Schoenenbourg", "Sommerberg", "Sonnenglanz", "Spiegel", "Sporen", "Steinert", "Steingrubler", "Steinklotz", "Vorbourg", "Wiebelsberg",
  "Wineck-Schlossberg", "Winzenberg", "Zinnkoepfle", "Zotzenberg"];

// within: the wider appellation on the same land; appellation: the place's name in our list; inao: the name in INAO's file;
// vineyard: for Alsace, the grand cru's own name, which the label must carry beside "Grand Cru".
const L = (within, appellation, inao, vineyard = "") => ({ country: "France", within, appellation, inao, vineyard, words: "Grand Cru", source: RANK_SOURCE, read: "2026-10-18" });
export const RANK_APPELLATIONS = [
  L("Saint-Émilion", "Saint-Émilion Grand Cru", "Saint-Emilion grand cru"),
  L("Chablis", "Chablis Grand Cru", "Chablis Grand Cru"),
  L("Banyuls", "Banyuls Grand Cru", "Banyuls grand cru"),
  ...ALSACE_GRANDS_CRUS.map((v) => L("Alsace", `Alsace Grand Cru ${v}`, `Alsace grand cru ${v}`, v)),
];

// ---------------------------------------------------------------- rules
const words = (s) => ` ${matchKey(s)} `;
const holds = (text, part) => words(text).includes(words(part));   // whole words, accents, capitals and "St." ignored
// Is this place name one of the list's own appellations? (A new place may then carry "Grand Cru" in its name: it is the AOC's name.)
export const isRankAppellation = (name) => !!name && RANK_APPELLATIONS.some((r) => matchKey(r.appellation) === matchKey(name));
export const rankLineOf = (name) => RANK_APPELLATIONS.find((r) => matchKey(r.appellation) === matchKey(name)) || null;
// The appellation a wine belongs to by its label's words, or null. place: { country, appellation }; text: the wine's name, or a shop's title.
// Saint-Émilion + "Grand Cru" -> Saint-Émilion Grand Cru; Chablis + "Les Clos Grand Cru" -> Chablis Grand Cru; Alsace + "Furstentum Grand Cru"
// -> Alsace Grand Cru Furstentum. An Alsace name with a grand cru's name but not the words "Grand Cru" ("Pfingstberg") is not moved by the rule:
// a wine from that vineyard may be bottled as plain Alsace, so it needs a source.
export function rankAppellationFor(place, text) {
  const t = String(text || "");
  if (!place || !place.appellation || !holds(t, "grand cru")) return null;
  if (place.country && matchKey(place.country) !== "france") return null;
  const lines = RANK_APPELLATIONS.filter((r) => matchKey(r.within) === matchKey(place.appellation));
  if (!lines.length) return null;
  if (!lines[0].vineyard) return lines[0];
  // Alsace: the longest grand cru name in the text ("Kirchberg de Barr" before "Kirchberg"; "Wineck-Schlossberg" before "Schlossberg")
  const found = lines.filter((r) => holds(t, r.vineyard)).sort((a, b) => b.vineyard.length - a.vineyard.length);
  return found[0] || null;
}
// What is left of a name once the words its appellation already says are taken off (displayCuvee in logic.js):
// "Sporen Vieilles Vignes Grand Cru" at Alsace Grand Cru Sporen -> "Vieilles Vignes"; "1er Grand Cru" at Saint-Émilion Grand Cru -> "" (the rank
// of the château's classification is not part of the AOC; owner, 2026-10-18: the title reads "Saint-Émilion Grand Cru").
const RANK_WORDS = new Set(["grand", "cru", "premier", "1er", "classe", "aoc", "aop", "appellation", "controlee", "protegee"]);
export function nameBeyondRank(name, appellation) {
  const app = new Set(matchKey(appellation).split(" "));
  return String(name || "").split(/\s+/).filter((w) => { const k = matchKey(w); return k && !app.has(k) && !RANK_WORDS.has(k); }).join(" ").trim();
}

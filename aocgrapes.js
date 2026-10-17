// The grapes an appellation's own rules name, for wines whose label names none (owner, 2026-10-17; all versions).
// A French AOC's rules (the INAO "cahier des charges") or an Italian DOCG's (the "disciplinare") say which grapes its wines are made from. When
// they name ONE grape for a type of wine, a wine of that type from there is made from that grape: a stored rule, not a guess (product rule (2)).
//   rule "only": the rules allow that grape alone (Chablis: "issus exclusivement du cépage chardonnay B"; Barolo: "esclusivamente dal vitigno Nebbiolo").
//   rule "main": it is the required principal grape and the rules allow small accessory shares, mixed into the vineyard (Morgon: gamay N, with
//                aligoté, chardonnay and melon at most 15% of each plot). The card shows the grape all the same, in the "from a rule" style.
// Appellations whose rules allow several grapes on an equal footing (Bordeaux, Champagne, Châteauneuf-du-Pape, the Côte de Beaune whites that
// allow Pinot Blanc beside Chardonnay ...) are not in the list: their rules do not say what is in the bottle. US AVAs have no grape rules at all.
// Each line keeps its source and the day it was read. checked: true only when the official text itself was read (quoted); lines from secondary
// summaries are kept with checked: false ("to check"): they are offered to editors as a suggestion but never filled into the catalog or shown on
// a card until an editor has read the official text and set checked to true (then regenerate docs/appellation_grapes_fill.sql).
// Pure: no browser, no network. Read by logic.js cardFromRow (checked lines only), wineinfo.js (suggestions) and docs/appellation_grapes.mjs.
import { plainKey, matchKey } from "./text.js?v=3";

const R = (country, appellation, style, grape, rule, checked, source, note = "") => ({ country, appellation, style, grape, rule, checked, source, read: "2026-10-17", note });
const GAMAY_CRU = "Beaujolais cru: gamay N is the principal grape; aligoté B, chardonnay B and melon B are allowed only mixed into the vineyard, at most 15% of each plot.";
const COTE_DOR_RED = "Côte d'Or red: pinot noir N is the principal grape; chardonnay B, pinot blanc B and pinot gris G are allowed only mixed into the vineyard, at most 15% of each plot.";
const TO_CHECK = "Read in secondary summaries only: an editor must read the official cahier des charges before this line is used.";

export const APPELLATION_GRAPES = [
  // ---------------------------------------------------------------- Beaujolais crus (red)
  R("France", "Morgon", "red", "Gamay", "main", true, "https://extranet.inao.gouv.fr/fichier/PNO-CDCMorgon-221130.pdf", GAMAY_CRU),
  R("France", "Moulin-à-Vent", "red", "Gamay", "main", true, "https://extranet.inao.gouv.fr/fichier/PNO-CDCMoulin-%C3%A0-Vent-CN221130.pdf", GAMAY_CRU),
  R("France", "Fleurie", "red", "Gamay", "main", true, "https://www.musee-boissons.com/pdf/2013_decret_2013-88.pdf", GAMAY_CRU + " (décret n° 2013-88)"),
  R("France", "Chénas", "red", "Gamay", "main", true, "https://extranet.inao.gouv.fr/fichier/PNOcdc-Chenas-ce200717.pdf", GAMAY_CRU),
  R("France", "Chiroubles", "red", "Gamay", "main", true, "https://www.siqocert.fr/cahier-des-charges/cdc-chiroubles.pdf", GAMAY_CRU),
  R("France", "Saint-Amour", "red", "Gamay", "main", true, "https://extranet.inao.gouv.fr/fichier/PNO-CDCSaint-Amour-CN221130.pdf", GAMAY_CRU),
  R("France", "Régnié", "red", "Gamay", "main", false, "", TO_CHECK),
  // ---------------------------------------------------------------- Côte d'Or (red)
  R("France", "Vosne-Romanée", "red", "Pinot Noir", "main", true, "https://extranet.inao.gouv.fr/fichier/PNOCDCVosne-Romanee.pdf", COTE_DOR_RED),
  R("France", "Pommard", "red", "Pinot Noir", "main", true, "https://extranet.inao.gouv.fr/fichier/PNOCDCPommard.pdf", COTE_DOR_RED),
  R("France", "Volnay", "red", "Pinot Noir", "main", true, "https://extranet.inao.gouv.fr/fichier/PNOCDC-Volnay.pdf", COTE_DOR_RED),
  R("France", "Gevrey-Chambertin", "red", "Pinot Noir", "main", true, "https://extranet.inao.gouv.fr/fichier/PNOCDCGevreyChambertin.pdf", COTE_DOR_RED),
  ...["Chambolle-Musigny", "Morey-Saint-Denis", "Beaune", "Monthélie", "Savigny-lès-Beaune", "Auxey-Duresses", "Fixin", "Marsannay", "Vougeot", "Côte de Nuits-Villages",
    "Chambertin", "Chambertin-Clos de Bèze", "Charmes-Chambertin", "Mazoyères-Chambertin", "Mazis-Chambertin", "Griotte-Chambertin", "Chapelle-Chambertin",
    "Clos de la Roche", "Clos Saint-Denis", "Clos des Lambrays", "Bonnes-Mares", "Musigny", "Clos de Vougeot", "Échezeaux", "Grands-Échezeaux",
    "Richebourg", "Romanée-Saint-Vivant", "Corton"].map((a) => R("France", a, "red", "Pinot Noir", "main", false, "", TO_CHECK + " " + COTE_DOR_RED)),
  // ---------------------------------------------------------------- Chablis (white)
  R("France", "Chablis", "white", "Chardonnay", "only", true, "https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000021229093/2010-01-27", "« Les vins sont issus exclusivement du cépage chardonnay B. »"),
  R("France", "Chablis Grand Cru", "white", "Chardonnay", "only", true, "https://www.chablis.fr/gallery_files/site/25717/25779/25782.pdf", "« Les vins sont issus exclusivement du cépage chardonnay B. »"),
  R("France", "Petit Chablis", "white", "Chardonnay", "only", true, "https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000021229093/2010-01-27", "« Les vins sont issus exclusivement du cépage chardonnay B. » (the 2009 text covering Petit Chablis, Chablis and Chablis Grand Cru)"),
  // ---------------------------------------------------------------- Côte de Beaune grands crus (white)
  ...["Montrachet", "Chevalier-Montrachet", "Bâtard-Montrachet", "Bienvenues-Bâtard-Montrachet", "Criots-Bâtard-Montrachet", "Corton-Charlemagne"]
    .map((a) => R("France", a, "white", "Chardonnay", "only", false, "", TO_CHECK)),
  // ---------------------------------------------------------------- Rhône (red)
  R("France", "Côte-Rôtie", "red", "Syrah", "main", true, "https://extranet.inao.gouv.fr/fichier/PNO2023AOPCoteRotie.pdf", "Syrah N is the principal grape and at least 80% of each estate's vines; viognier B is the accessory grape."),
  R("France", "Cornas", "red", "Syrah", "only", false, "", TO_CHECK),
  R("France", "Hermitage", "red", "Syrah", "main", false, "", TO_CHECK),
  // ---------------------------------------------------------------- Loire
  R("France", "Sancerre", "white", "Sauvignon Blanc", "only", false, "", TO_CHECK),
  R("France", "Sancerre", "red", "Pinot Noir", "only", false, "", TO_CHECK),
  R("France", "Sancerre", "rose", "Pinot Noir", "only", false, "", TO_CHECK),
  // ---------------------------------------------------------------- Italy
  R("Italy", "Barolo", "red", "Nebbiolo", "only", true, "https://www.regione.piemonte.it/web/media/6424/download", "Art. 2: « devono essere ottenuti da uve provenienti dai vigneti composti esclusivamente dal vitigno Nebbiolo »."),
  R("Italy", "Brunello di Montalcino", "red", "Sangiovese", "only", true, "https://aisitalia.it/Disciplinari/Toscana/DOCG/Brunello%20di%20Montalcino.pdf", "« ottenuto dalle uve provenienti dai vigneti composti, nell'ambito aziendale, esclusivamente dal vitigno Sangiovese »."),
];

// ---------------------------------------------------------------- lookups
const keyOf = (country, appellation, style) => `${plainKey(country)}|${matchKey(appellation)}|${style}`;
const BY_KEY = new Map(APPELLATION_GRAPES.map((r) => [keyOf(r.country, r.appellation, r.style), r]));
// The rule line for a wine (country, appellation and type of wine), or null. checkedOnly: leave out lines still to check.
export function ruleLineFor(card, { checkedOnly = true } = {}) {
  if (!card || !card.country || !card.appellation || !card.style) return null;
  const r = BY_KEY.get(keyOf(card.country, card.appellation, card.style));
  return r && (r.checked || !checkedOnly) ? r : null;
}
// The grapes a card may show from its appellation's rules: only when the label names none and the database holds no rule grape yet.
export function ruleGrapesFor(card) {
  if ((card.grapes && card.grapes.length) || (card.ruleGrapes && card.ruleGrapes.length)) return [];
  const r = ruleLineFor(card);
  return r ? [r.grape] : [];
}

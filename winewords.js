// Wine words the speech recognizer tends to get wrong, kept in ONE place so the owner can add to them. Pure data: no browser, no network.
// termfix.js uses them (with the grape list and the catalog's own names) to correct the spelling of words the player said. They are spellings only: nothing here says anything about a wine.
// Italian
const IT = ["riserva", "classico", "superiore", "vendemmia", "appassimento", "ripasso", "passito", "spumante", "frizzante", "metodo classico", "barrique", "botte", "cantina",
  "azienda agricola", "tenuta", "podere", "vigneto", "sapido", "tannico", "fermo", "Amarone della Valpolicella", "Brunello di Montalcino", "Vino Nobile di Montepulciano",
  "Barolo", "Barbaresco", "Chianti Classico", "Gavi di Gavi", "Franciacorta", "Prosecco", "Valpolicella", "Montepulciano d'Abruzzo", "Sagrantino di Montefalco", "Taurasi", "Etna Rosso", "Soave Classico",
  "Piemonte", "Toscana", "Veneto", "Friuli", "Campania", "Sicilia", "Puglia", "Sardegna", "Alto Adige", "Langhe", "Roero", "Valtellina", "Bolgheri", "Lugana", "Verdicchio", "Vermentino", "Aglianico", "Nerello Mascalese", "Primitivo", "Negroamaro", "Lagrein", "Teroldego", "Cannonau"];
// French
const FR = ["cuvée", "terroir", "sur lie", "grand cru", "premier cru", "climat", "lieu-dit", "domaine", "château", "clos", "vigneron", "élevage", "millésime", "pétillant", "crémant",
  "méthode traditionnelle", "brut nature", "minéralité", "boisé", "mousseux", "vendange", "vin jaune", "sélection de grains nobles", "vieilles vignes", "bâtonnage", "malolactique", "demi-sec", "moelleux", "cépage",
  "Gevrey-Chambertin", "Chambolle-Musigny", "Vosne-Romanée", "Nuits-Saint-Georges", "Puligny-Montrachet", "Chassagne-Montrachet", "Meursault", "Pouilly-Fuissé", "Pouilly-Fumé", "Sancerre", "Châteauneuf-du-Pape",
  "Gigondas", "Vacqueyras", "Côte-Rôtie", "Condrieu", "Hermitage", "Crozes-Hermitage", "Saint-Joseph", "Saint-Émilion", "Pomerol", "Pauillac", "Saint-Julien", "Saint-Estèphe", "Margaux", "Pessac-Léognan", "Sauternes",
  "Chablis", "Champagne", "Bourgogne", "Beaujolais", "Morgon", "Fleurie", "Moulin-à-Vent", "Alsace", "Muscadet", "Vouvray", "Savennières", "Bandol", "Languedoc", "Roussillon", "Banyuls", "Jurançon", "Cahors", "Madiran", "Loire", "Rhône", "Médoc",
  "Gamay", "Mourvèdre", "Cinsault", "Chenin Blanc", "Sémillon", "Viognier", "Marsanne", "Roussanne", "Grenache", "Syrah", "Cabernet Franc", "Melon de Bourgogne", "Gewürztraminer"];
// German and Austrian
const DE = ["trocken", "halbtrocken", "feinherb", "Spätlese", "Auslese", "Kabinett", "Eiswein", "Beerenauslese", "Trockenbeerenauslese", "Grosses Gewächs", "Sekt", "Weingut", "Riesling", "Grüner Veltliner", "Blaufränkisch", "Zweigelt", "Mosel", "Rheingau", "Pfalz", "Wachau", "Kamptal", "Kremstal"];
// Spanish and Portuguese
const ES = ["crianza", "reserva", "gran reserva", "joven", "bodega", "cava", "fino", "amontillado", "oloroso", "manzanilla", "Pedro Ximénez", "Rioja", "Ribera del Duero", "Priorat", "Rías Baixas", "Albariño", "Tempranillo", "Garnacha", "Verdejo", "Godello", "Mencía", "Bierzo", "Jerez", "Douro", "Vinho Verde", "Alvarinho", "Touriga Nacional", "quinta", "colheita", "vinho do Porto"];
// Tasting and making words that are easy to mishear in any language
const TASTING = ["tannin", "terroir", "minerality", "petrichor", "brettanomyces", "malolactic", "lees", "lees ageing", "oxidative", "reductive", "bâtonnage", "carbonic maceration", "whole bunch", "skin contact", "orange wine", "pét-nat", "pétillant naturel",
  "residual sugar", "volatile acidity", "botrytis", "noble rot", "ullage", "decant", "diacetyl", "cassis", "garrigue", "sous-bois", "petroleum", "kerosene", "graphite", "saline", "umami"];
export const WINE_TERMS = [...IT, ...FR, ...DE, ...ES, ...TASTING];
// The languages offered for "Speak in" (the browser's own language codes). "auto" follows the phone.
export const SPEECH_LANGS = [
  { id: "auto", label: "Phone language", code: "" }, { id: "en", label: "English", code: "en-US" }, { id: "it", label: "Italiano", code: "it-IT" },
  { id: "fr", label: "Français", code: "fr-FR" }, { id: "es", label: "Español", code: "es-ES" }, { id: "de", label: "Deutsch", code: "de-DE" },
];
export const speechCodeOf = (id) => (SPEECH_LANGS.find((l) => l.id === id) || SPEECH_LANGS[0]).code;
// The language chosen on this phone (set by app.js from Settings; views read it to mark the picker).
let langNow = "auto";
export const cleanLang = (id) => (SPEECH_LANGS.some((l) => l.id === id) ? id : "auto");
export const setSpeechLang = (id) => { langNow = cleanLang(id); return langNow; };
export const speechLangNow = () => langNow;

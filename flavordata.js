// The data behind the card visuals: the 42 flavors (names, categories, words that mention them), the flavor profile of each grape (VAR),
// and the places (REGION: where they are, and a small nudge to the flavors the place adds). These tables are also kept in the database
// (flavor_varietals, flavor_regions) so the Owner or an editor can tune them; what is here is the starting set, and the database wins where both have a row.
// Pure data: no browser, no network.

// ---------------------------------------------------------------- flavors
export const LABEL = {
  blackcurrant: "Black currant", blackberry: "Blackberry", plum: "Plum", cherry: "Cherry", strawberry: "Strawberry", raspberry: "Raspberry",
  lemon: "Lemon", lime: "Lime", grapefruit: "Grapefruit", orange: "Orange peel",
  apple: "Green apple", pear: "Pear", peach: "Peach", apricot: "Apricot",
  pineapple: "Pineapple", passionfruit: "Passion fruit", melon: "Melon", gooseberry: "Gooseberry",
  rose: "Rose", violet: "Violet", flowers: "White flowers",
  grass: "Cut grass", bellpepper: "Bell pepper", herb: "Wild herbs", mint: "Mint",
  vanilla: "Vanilla", cedar: "Cedar", toast: "Toast", chocolate: "Chocolate", pepper: "Black pepper",
  earth: "Forest floor", slate: "Slate", chalk: "Chalk", tar: "Tar", petrol: "Petrol", tea: "Tea",
  leather: "Leather", licorice: "Licorice",
  butter: "Butter", brioche: "Brioche", almond: "Almond", honey: "Honey",
};
export const FLAVOR_KEYS = Object.keys(LABEL);
export const CATS = {
  darkfruit: ["blackcurrant", "blackberry", "plum"],
  redfruit: ["cherry", "strawberry", "raspberry"],
  citrus: ["lemon", "lime", "grapefruit", "orange"],
  orchard: ["apple", "pear", "peach", "apricot"],
  tropical: ["pineapple", "passionfruit", "melon", "gooseberry"],
  floral: ["rose", "violet", "flowers"],
  green: ["grass", "bellpepper", "herb", "mint"],
  oak: ["vanilla", "cedar", "toast", "chocolate", "pepper"],
  earth: ["earth", "slate", "chalk", "tar", "petrol", "tea"],
  savory: ["leather", "licorice"],
  creamy: ["butter", "brioche", "almond"],
  sweet: ["honey"],
};
// Words that mention a flavor in a journal note. Matched as whole words with a simple ending (s, es, y, ed), so "tart" is not tar and "limestone" is not lime.
export const SYN = {
  blackcurrant: ["blackcurrant", "black currant", "cassis"], blackberry: ["blackberry", "bramble"], plum: ["plum", "prune"], cherry: ["cherry"],
  strawberry: ["strawberry"], raspberry: ["raspberry"], lemon: ["lemon"], lime: ["lime"], grapefruit: ["grapefruit"], orange: ["orange", "tangerine", "mandarin"],
  apple: ["apple"], pear: ["pear"], peach: ["peach", "nectarine"], apricot: ["apricot"], pineapple: ["pineapple"], passionfruit: ["passion fruit", "passionfruit"],
  melon: ["melon", "cantaloupe", "honeydew"], gooseberry: ["gooseberry"], rose: ["rose", "rose petal"], violet: ["violet"],
  flowers: ["flower", "floral", "blossom", "jasmine", "honeysuckle", "elderflower"], grass: ["grass", "hay"], bellpepper: ["bell pepper", "green pepper", "capsicum"],
  herb: ["herb", "thyme", "rosemary", "sage", "oregano", "garrigue"], mint: ["mint", "eucalyptus"], vanilla: ["vanilla"], cedar: ["cedar", "cigar box", "pencil"],
  toast: ["toast", "smoke"], chocolate: ["chocolate", "cocoa", "mocha", "coffee"], pepper: ["pepper"], earth: ["earth", "forest floor", "mushroom", "truffle", "soil"],
  slate: ["slate", "stone", "mineral", "flint", "wet stone"], chalk: ["chalk", "limestone"], tar: ["tar", "asphalt"], petrol: ["petrol", "gasoline", "kerosene", "diesel"],
  tea: ["tea", "tobacco"], leather: ["leather", "saddle"], licorice: ["licorice", "liquorice", "anise", "aniseed"], butter: ["butter", "cream"],
  brioche: ["brioche", "biscuit", "bread", "yeast"], almond: ["almond", "marzipan", "hazelnut"], honey: ["honey", "caramel"],
};

// ---------------------------------------------------------------- grapes
// weights 1..5, listed most characteristic first (the order breaks ties). shape: bordeaux, burgundy, hock or champagne. type: red or white.
const v = (label, type, shape, ...f) => ({ label, type, shape, f: Object.fromEntries(f.map(([k, w]) => [k, w])) });
export const VAR = {
  cabernetsauvignon: v("Cabernet Sauvignon", "red", "bordeaux", ["blackcurrant", 5], ["cedar", 4], ["bellpepper", 3], ["vanilla", 3], ["blackberry", 3], ["mint", 2], ["chocolate", 2], ["leather", 2], ["plum", 2]),
  merlot: v("Merlot", "red", "bordeaux", ["plum", 5], ["blackberry", 4], ["cherry", 4], ["chocolate", 3], ["vanilla", 3], ["cedar", 2], ["earth", 2], ["herb", 1]),
  pinotnoir: v("Pinot Noir", "red", "burgundy", ["cherry", 5], ["strawberry", 4], ["raspberry", 4], ["rose", 3], ["earth", 3], ["violet", 2], ["pepper", 2], ["leather", 2]),
  nebbiolo: v("Nebbiolo", "red", "burgundy", ["rose", 5], ["tar", 5], ["cherry", 4], ["leather", 3], ["licorice", 3], ["violet", 2], ["earth", 2]),
  syrah: v("Syrah", "red", "burgundy", ["blackberry", 5], ["pepper", 5], ["plum", 4], ["licorice", 3], ["leather", 2], ["violet", 2], ["chocolate", 2], ["vanilla", 2]),
  shiraz: v("Shiraz", "red", "bordeaux", ["blackberry", 5], ["plum", 4], ["pepper", 4], ["chocolate", 3], ["vanilla", 3], ["licorice", 3], ["leather", 2], ["mint", 2]),
  malbec: v("Malbec", "red", "bordeaux", ["plum", 5], ["blackberry", 5], ["violet", 3], ["chocolate", 3], ["vanilla", 3], ["cherry", 2], ["leather", 2]),
  tempranillo: v("Tempranillo", "red", "bordeaux", ["cherry", 5], ["plum", 4], ["leather", 4], ["vanilla", 3], ["cedar", 3], ["herb", 2], ["licorice", 2]),
  sangiovese: v("Sangiovese", "red", "bordeaux", ["cherry", 5], ["herb", 3], ["leather", 3], ["earth", 3], ["plum", 3], ["tar", 2], ["violet", 2]),
  zinfandel: v("Zinfandel", "red", "bordeaux", ["blackberry", 5], ["plum", 4], ["pepper", 4], ["raspberry", 3], ["cherry", 3], ["vanilla", 2], ["licorice", 2]),
  garnacha: v("Garnacha", "red", "burgundy", ["strawberry", 5], ["raspberry", 4], ["pepper", 3], ["herb", 3], ["cherry", 3], ["licorice", 2]),
  aglianico: v("Aglianico", "red", "bordeaux", ["blackberry", 5], ["tar", 4], ["plum", 4], ["leather", 3], ["licorice", 3], ["earth", 3], ["cherry", 2]),
  carmenere: v("Carmenère", "red", "bordeaux", ["bellpepper", 5], ["blackberry", 4], ["plum", 4], ["pepper", 3], ["chocolate", 3], ["mint", 2]),
  gamay: v("Gamay", "red", "burgundy", ["strawberry", 5], ["raspberry", 4], ["cherry", 4], ["violet", 3], ["pepper", 2], ["earth", 1]),
  monastrell: v("Monastrell", "red", "bordeaux", ["blackberry", 5], ["plum", 4], ["leather", 3], ["earth", 3], ["pepper", 3], ["licorice", 2]),
  montepulciano: v("Montepulciano", "red", "bordeaux", ["cherry", 5], ["plum", 4], ["blackberry", 3], ["licorice", 3], ["pepper", 2], ["earth", 2]),
  primitivo: v("Primitivo", "red", "bordeaux", ["plum", 5], ["blackberry", 4], ["raspberry", 3], ["licorice", 3], ["vanilla", 2], ["pepper", 2]),
  saperavi: v("Saperavi", "red", "bordeaux", ["blackberry", 5], ["plum", 4], ["pepper", 3], ["earth", 3], ["leather", 2], ["cherry", 2]),
  chardonnay: v("Chardonnay", "white", "burgundy", ["apple", 5], ["butter", 4], ["lemon", 3], ["pear", 3], ["vanilla", 3], ["toast", 3], ["peach", 3], ["pineapple", 2], ["brioche", 2], ["chalk", 2]),
  sauvignonblanc: v("Sauvignon Blanc", "white", "bordeaux", ["grapefruit", 5], ["grass", 5], ["gooseberry", 4], ["passionfruit", 4], ["lime", 3], ["bellpepper", 2], ["melon", 2], ["herb", 2]),
  riesling: v("Riesling", "white", "hock", ["lime", 4], ["apple", 4], ["petrol", 4], ["peach", 3], ["slate", 3], ["honey", 3], ["apricot", 3], ["lemon", 3], ["flowers", 3]),
  pinotgris: v("Pinot Gris", "white", "burgundy", ["pear", 5], ["apple", 4], ["lemon", 3], ["melon", 3], ["almond", 3], ["flowers", 2], ["honey", 2], ["peach", 2]),
  cheninblanc: v("Chenin Blanc", "white", "hock", ["apple", 5], ["pear", 4], ["honey", 4], ["lemon", 3], ["peach", 3], ["almond", 2], ["chalk", 2], ["herb", 1]),
  viognier: v("Viognier", "white", "burgundy", ["apricot", 5], ["peach", 5], ["flowers", 4], ["honey", 3], ["melon", 2], ["pear", 2], ["vanilla", 1]),
  albarino: v("Albariño", "white", "hock", ["lemon", 5], ["grapefruit", 4], ["peach", 4], ["apple", 3], ["slate", 2], ["flowers", 2]),
  gruner: v("Grüner Veltliner", "white", "hock", ["pepper", 5], ["grapefruit", 4], ["apple", 4], ["lemon", 3], ["lime", 3], ["herb", 3]),
  vermentino: v("Vermentino", "white", "bordeaux", ["lemon", 5], ["lime", 4], ["apple", 3], ["almond", 3], ["herb", 3], ["pear", 2]),
  glera: v("Glera", "white", "champagne", ["apple", 5], ["pear", 5], ["peach", 3], ["flowers", 3], ["lemon", 3], ["melon", 2], ["honey", 1]),
  cortese: v("Cortese", "white", "bordeaux", ["lemon", 5], ["apple", 4], ["almond", 3], ["flowers", 3], ["lime", 2], ["pear", 2]),
  melon: v("Melon de Bourgogne", "white", "burgundy", ["lemon", 5], ["apple", 4], ["lime", 3], ["chalk", 3], ["slate", 2], ["pear", 2]),
  manzoni: v("Manzoni Bianco", "white", "bordeaux", ["pear", 4], ["apple", 4], ["peach", 3], ["flowers", 3], ["lemon", 3], ["almond", 2]),
  moscato: v("Moscato", "white", "hock", ["peach", 5], ["flowers", 5], ["apricot", 4], ["honey", 3], ["orange", 3], ["lemon", 2]),
  // the same grape made as a sparkling or a rosé wine tastes different (no oak, more bread and chalk; more red berry and melon), so these take over for those types
  chardonnaysparkling: v("Chardonnay", "sparkling", "champagne", ["apple", 5], ["lemon", 4], ["brioche", 4], ["pear", 3], ["almond", 3], ["chalk", 3], ["flowers", 2], ["toast", 2]),
  pinotnoirsparkling: v("Pinot Noir", "sparkling", "champagne", ["strawberry", 4], ["apple", 4], ["brioche", 4], ["cherry", 3], ["lemon", 3], ["raspberry", 3], ["toast", 2], ["almond", 2]),
  pinotnoirrose: v("Pinot Noir", "rose", "bordeaux", ["strawberry", 5], ["cherry", 3], ["raspberry", 3], ["melon", 2], ["lemon", 2], ["flowers", 2]),
  garnacharose: v("Garnacha", "rose", "bordeaux", ["strawberry", 5], ["raspberry", 3], ["melon", 3], ["herb", 3], ["lemon", 2], ["flowers", 2]),
  // stand-ins for a wine whose grape is not known or is a blend: chosen by the type of wine
  genericred: v("Red wine", "red", "bordeaux", ["plum", 4], ["cherry", 4], ["blackberry", 3], ["vanilla", 2], ["pepper", 2], ["cedar", 2]),
  genericwhite: v("White wine", "white", "bordeaux", ["apple", 4], ["lemon", 4], ["pear", 3], ["peach", 3], ["flowers", 2], ["melon", 2]),
  genericrose: v("Rosé", "rose", "bordeaux", ["strawberry", 5], ["raspberry", 3], ["melon", 3], ["lemon", 2], ["flowers", 2], ["cherry", 2]),
  genericsparkling: v("Sparkling wine", "sparkling", "champagne", ["apple", 4], ["lemon", 4], ["brioche", 4], ["pear", 3], ["almond", 2], ["flowers", 2]),
  genericfortified: v("Fortified wine", "red", "bordeaux", ["plum", 5], ["blackberry", 4], ["chocolate", 4], ["almond", 3], ["vanilla", 3], ["pepper", 2], ["licorice", 2]),
};
// Other names for the same grape (a grape's key is its name in lower case without spaces or accents).
export const VAR_ALIASES = {
  pinotnero: "pinotnoir", pinotgrigio: "pinotgris", grenache: "garnacha", mourvedre: "monastrell", moscatobianco: "moscato", moscatodasti: "moscato",
  gruner: "gruner", grunerveltliner: "gruner", meloudebourgogne: "melon", melondebourgogne: "melon", manzonibianco: "manzoni", albarino: "albarino",
  prosecco: "glera", cheninblanc: "cheninblanc", sauvignon: "sauvignonblanc", cabernet: "cabernetsauvignon", tintafino: "tempranillo", syrahshiraz: "syrah",
};

// ---------------------------------------------------------------- places
// [country, name, kind, lat, lon, nudges]. A nudge is 1 or 2 and is added to a flavor's weight for wines from there. A place with a nudge-less entry still gives the map its pin.
const P = (country, name, kind, lat, lon, add = {}) => ({ country, name, kind, lat, lon, add });
export const PLACES = [
  P("USA", "California", "region", 37.6, -121.9), P("USA", "Napa Valley", "appellation", 38.5, -122.4, { vanilla: 1, blackcurrant: 1 }), P("USA", "Sonoma County", "appellation", 38.55, -122.9),
  P("USA", "Sonoma Valley", "appellation", 38.35, -122.47, { blackberry: 1 }), P("USA", "Russian River Valley", "appellation", 38.5, -122.9, { cherry: 1, raspberry: 1 }),
  P("USA", "Dry Creek Valley", "appellation", 38.65, -122.95, { blackberry: 1, pepper: 1 }), P("USA", "Sonoma Coast", "appellation", 38.45, -123.05, { cherry: 1 }),
  P("USA", "West Sonoma Coast", "appellation", 38.45, -123.15, { cherry: 1 }), P("USA", "Fort Ross-Seaview", "appellation", 38.6, -123.3, { cherry: 1, earth: 1 }),
  P("USA", "Rutherford", "appellation", 38.46, -122.42, { earth: 1 }), P("USA", "Spring Mountain District", "appellation", 38.55, -122.55, { blackberry: 1 }),
  P("USA", "Paso Robles Willow Creek District", "appellation", 35.6, -120.8, { plum: 1 }), P("USA", "Santa Barbara County", "appellation", 34.65, -120.15),
  P("USA", "Sta. Rita Hills", "appellation", 34.66, -120.34, { cherry: 1, earth: 1 }), P("USA", "Monterey", "appellation", 36.4, -121.5), P("USA", "Central Coast", "appellation", 35.8, -120.8),
  P("USA", "Clarksburg", "appellation", 38.4, -121.55), P("USA", "Eagle Peak", "appellation", 39.2, -123.2),
  P("USA", "Oregon", "region", 44.9, -123.0), P("USA", "Willamette Valley", "appellation", 45.0, -123.1, { earth: 1, cherry: 1 }), P("USA", "Dundee Hills", "appellation", 45.28, -123.0, { cherry: 1 }),
  P("USA", "Eola-Amity Hills", "appellation", 44.97, -123.25, { earth: 1 }), P("USA", "Yamhill-Carlton", "appellation", 45.3, -123.22, { cherry: 1 }),
  P("USA", "Washington", "region", 46.7, -119.7), P("USA", "Columbia Valley", "appellation", 46.2, -119.5, { blackberry: 1 }), P("USA", "Walla Walla Valley", "appellation", 46.05, -118.4, { earth: 1, blackcurrant: 1 }),
  P("USA", "New York", "region", 42.9, -76.8), P("USA", "Finger Lakes", "appellation", 42.65, -76.95, { lime: 1, slate: 1 }),
  P("France", "Bordeaux", "region", 44.9, -0.55, { cedar: 1, earth: 1 }), P("France", "Margaux", "appellation", 45.04, -0.67, { violet: 1 }), P("France", "St.-Julien", "appellation", 45.15, -0.75, { cedar: 1 }),
  P("France", "Pessac-Léognan", "appellation", 44.75, -0.63, { earth: 1 }), P("France", "St.-Émilion", "appellation", 44.89, -0.15, { plum: 1 }),
  P("France", "Burgundy", "region", 47.0, 4.8, { earth: 1 }), P("France", "Beaune", "appellation", 47.02, 4.84, { earth: 1 }), P("France", "Bourgogne", "appellation", 47.0, 4.8), P("France", "Bourgogne Côte d'Or", "appellation", 47.15, 4.95, { earth: 1 }),
  P("France", "Chablis", "appellation", 47.81, 3.8, { chalk: 2, lemon: 1 }), P("France", "Pouilly-Fuissé", "appellation", 46.3, 4.72, { butter: 1 }),
  P("France", "Beaujolais", "region", 46.15, 4.65, { violet: 1 }), P("France", "Beaujolais-Villages", "appellation", 46.15, 4.65), P("France", "Champagne", "region", 49.05, 3.95, { brioche: 2, chalk: 1 }),
  P("France", "Loire Valley", "region", 47.35, 0.6, { herb: 1 }), P("France", "Sancerre", "appellation", 47.33, 2.84, { grass: 1, chalk: 1 }), P("France", "Savennières", "appellation", 47.36, -0.66, { honey: 1 }),
  P("France", "Muscadet de Sèvre et Maine Clisson", "appellation", 47.1, -1.35, { chalk: 1 }),
  P("France", "Rhône Valley", "region", 44.4, 4.8, { pepper: 1, herb: 1 }), P("France", "Châteauneuf-du-Pape", "appellation", 44.06, 4.83, { herb: 2 }), P("France", "Côtes du Rhône", "appellation", 44.25, 4.75, { pepper: 1 }),
  P("France", "Gigondas", "appellation", 44.17, 5.0, { herb: 1 }), P("France", "St.-Joseph", "appellation", 45.07, 4.8, { pepper: 1 }),
  P("France", "Provence", "region", 43.5, 6.2, { herb: 2 }), P("France", "Cassis", "appellation", 43.21, 5.54, { herb: 1 }), P("France", "Côtes de Provence", "appellation", 43.45, 6.3), P("France", "Coteaux Varois en Provence", "appellation", 43.45, 6.0),
  P("Italy", "Piedmont", "region", 44.7, 8.0, { earth: 2 }), P("Italy", "Barolo", "appellation", 44.61, 7.94, { rose: 1, tar: 1 }), P("Italy", "Barbaresco", "appellation", 44.73, 8.08, { rose: 1 }),
  P("Italy", "Gavi", "appellation", 44.68, 8.81, { lemon: 1 }), P("Italy", "Moscato d'Asti", "appellation", 44.7, 8.2, { flowers: 1 }),
  P("Italy", "Tuscany", "region", 43.3, 11.2, { herb: 1, earth: 1 }), P("Italy", "Chianti Classico", "appellation", 43.5, 11.3, { cherry: 1 }), P("Italy", "Chianti Rufina", "appellation", 43.83, 11.47, { cherry: 1 }),
  P("Italy", "Brunello di Montalcino", "appellation", 43.05, 11.49, { leather: 1 }), P("Italy", "Maremma Toscana", "appellation", 42.8, 11.1), P("Italy", "Toscana", "appellation", 43.3, 11.2),
  P("Italy", "Veneto", "region", 45.6, 11.6), P("Italy", "Conegliano Valdobbiadene Prosecco Superiore", "appellation", 45.9, 12.0, { apple: 1 }), P("Italy", "Prosecco", "appellation", 45.8, 12.2, { apple: 1 }),
  P("Italy", "Rosso del Veronese", "appellation", 45.45, 11.0), P("Italy", "Valpolicella Ripasso", "appellation", 45.55, 10.95, { cherry: 1, leather: 1 }),
  P("Italy", "Sicily", "region", 37.6, 14.0), P("Italy", "Etna", "appellation", 37.75, 15.0, { earth: 1, rose: 1 }), P("Italy", "Campania", "region", 40.9, 14.8), P("Italy", "Taurasi", "appellation", 41.0, 15.0, { tar: 1 }),
  P("Italy", "Abruzzo", "region", 42.2, 14.0), P("Italy", "Montepulciano d'Abruzzo", "appellation", 42.3, 14.2), P("Italy", "Puglia", "region", 40.8, 17.0), P("Italy", "Salento", "appellation", 40.3, 18.1),
  P("Italy", "Lombardy", "region", 45.6, 9.8), P("Italy", "Oltrepò Pavese", "appellation", 44.95, 9.1), P("Italy", "Liguria", "region", 44.2, 9.2), P("Italy", "Colli di Luni", "appellation", 44.1, 9.9, { herb: 1 }),
  P("Italy", "Emilia-Romagna", "region", 44.5, 11.0), P("Italy", "Emilia", "appellation", 44.6, 10.5), P("Italy", "Trentino-Alto Adige", "region", 46.3, 11.3), P("Italy", "Trentino", "appellation", 46.1, 11.1),
  P("Italy", "Valdadige", "appellation", 45.9, 11.0), P("Italy", "Vigneti delle Dolomiti", "appellation", 46.2, 11.2), P("Italy", "Delle Venezie", "appellation", 45.8, 12.0), P("Italy", "Lazio", "appellation", 41.9, 12.8),
  P("Spain", "Rioja", "region", 42.3, -2.5, { vanilla: 1, leather: 1 }), P("Spain", "Castilla y León", "region", 41.7, -4.5), P("Spain", "Ribera del Duero", "appellation", 41.65, -3.7, { blackberry: 1, vanilla: 1 }),
  P("Spain", "Catalonia", "region", 41.4, 1.6), P("Spain", "Montsant", "appellation", 41.3, 0.8, { licorice: 1, herb: 1 }), P("Spain", "Cava", "appellation", 41.4, 1.8, { brioche: 1 }),
  P("Spain", "Aragón", "region", 41.5, -1.0), P("Spain", "Calatayud", "appellation", 41.35, -1.64, { raspberry: 1 }), P("Spain", "Campo de Borja", "appellation", 41.8, -1.5),
  P("Spain", "Galicia", "region", 42.5, -8.2), P("Spain", "Rías Baixas", "appellation", 42.4, -8.7, { lemon: 1 }), P("Spain", "Madrid", "region", 40.4, -3.7), P("Spain", "Vinos de Madrid Sierra de Gredos", "appellation", 40.3, -4.6, { raspberry: 1 }),
  P("Spain", "Jumilla", "appellation", 38.48, -1.33, { plum: 1 }),
  P("Portugal", "Douro", "region", 41.15, -7.6, { plum: 1 }), P("Portugal", "Vinho Verde", "appellation", 41.6, -8.3, { lime: 1 }),
  P("Germany", "Mosel", "appellation", 49.95, 7.0, { slate: 2, lime: 1 }), P("Austria", "Niederösterreich", "appellation", 48.4, 15.7, { pepper: 1 }),
  P("Argentina", "Mendoza", "region", -33.0, -68.8, { plum: 1, violet: 1 }), P("Argentina", "Agrelo", "appellation", -33.1, -68.9), P("Argentina", "Gualtallary", "appellation", -33.4, -69.2, { herb: 1 }), P("Argentina", "Paraje Altamira", "appellation", -33.7, -69.0, { earth: 1 }),
  P("Chile", "Central Valley", "region", -34.2, -70.7), P("Chile", "Maipo Valley", "appellation", -33.7, -70.7, { blackcurrant: 1, mint: 1 }), P("Chile", "Colchagua Valley", "region", -34.65, -71.2, { chocolate: 1 }), P("Chile", "Apalta", "appellation", -34.6, -71.4, { chocolate: 1 }),
  P("Australia", "South Australia", "region", -34.5, 138.8), P("Australia", "Barossa", "appellation", -34.55, 138.95, { chocolate: 1, pepper: 1 }), P("Australia", "South Eastern Australia", "appellation", -34.5, 146.0),
  P("New Zealand", "South Island", "region", -43.5, 170.5), P("New Zealand", "Marlborough", "appellation", -41.5, 173.9, { grapefruit: 1, grass: 1 }), P("New Zealand", "Central Otago", "appellation", -45.0, 169.2, { cherry: 1, herb: 1 }),
  P("South Africa", "Western Cape", "region", -33.8, 19.5), P("South Africa", "Stellenbosch", "appellation", -33.9, 18.85, { earth: 1 }),
];
// Where a country's pin goes when a wine has no more specific place.
export const COUNTRY_CENTER = { USA: [39.5, -98.5], France: [46.6, 2.5], Italy: [42.8, 12.5], Spain: [40.2, -3.6], Portugal: [39.6, -8.0], Germany: [51.0, 10.3], Austria: [47.6, 14.2],
  Argentina: [-35.0, -65.0], Chile: [-33.5, -70.7], Australia: [-25.5, 134.0], "New Zealand": [-41.0, 173.0], "South Africa": [-30.5, 24.5] };

export const fold = (s) => String(s == null ? "" : s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export const varKey = (name) => fold(name).replace(/ /g, "");
export const placeKey = (country, name) => `${fold(country)}|${fold(name)}`;

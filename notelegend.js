// The starting legend: what people say in tasting notes, and which answer in the tasting grid (tasting.js) it means. Pure data: no browser, no network.
// Each line is [what is said, grid field, grid answer]. "tag" lines are aromas and flavours: whether a tag goes under Aromas (nose) or Flavours (palate) depends on where in the note it was said.
// This is the SEED. The legend grows: words players teach the app (a player's own legend, then the shared legend that editors and the owner approve) are matched first; this list is the fallback,
// and the same lines can live in the database (note_legend, source "seed") so the owner can edit them without a code change. Words are folded and singularized before matching (see notegrid.js),
// so "Zippy Acidity" and "zippy acidities" are the same line. Wine words in Italian, French, Spanish and German sit beside the English ones.
// Keep each line SPECIFIC. A word that could mean two things ("soft", "rich", "fresh") is left out on purpose: the app would rather leave an answer empty than guess.
const L = [];
const add = (field, value, phrases) => phrases.forEach((p) => L.push([p, field, value]));

// acidity
add("acidity", "high", ["zippy", "zesty", "racy", "mouthwatering", "mouth watering", "tart", "bracing", "tangy", "lively acidity", "searing acidity", "crisp acidity", "crisp", "vibrant acidity", "high acid"]);
add("acidity", "low", ["flabby", "low acid", "lacking acidity", "lacks acidity", "soft acidity"]);
// tannin
add("tannin", "high", ["grippy", "chewy", "astringent", "gripping", "drying tannin", "chunky tannin", "aggressive tannin", "high tannin"]);
add("tannin", "medium +", ["firm tannin", "structured tannin"]);
add("tannin", "medium -", ["soft tannin", "smooth tannin", "supple tannin"]);
add("tannin", "low", ["no tannin", "tannin free", "low tannin"]);
// body
add("body", "full", ["full bodied", "weighty", "heavy bodied", "big wine", "full body"]);
add("body", "light", ["light bodied", "thin", "light body"]);
add("body", "medium", ["medium bodied", "medium body"]);
// sweetness
add("sweetness", "dry", ["bone dry", "dry", "secco", "sec", "trocken", "seco", "brut nature", "extra brut", "brut"]);
add("sweetness", "off-dry", ["off dry", "semi dry", "demi sec", "halbtrocken", "semi secco", "medium dry", "extra dry"]);
add("sweetness", "medium", ["medium sweet", "semi sweet", "amabile", "demi doux", "feinherb"]);
add("sweetness", "sweet", ["sweet", "dolce", "doux", "moelleux", "dulce", "suss", "lieblich"]);
add("sweetness", "luscious", ["luscious", "syrupy", "unctuous", "very sweet", "liquoroso"]);
// fruit ripeness (a clue to the climate). "jammy", "cooked fruit" and "stewed" are also aroma tags: a phrase may mean both.
add("fruitRipeness", "under-ripe", ["under ripe", "underripe", "unripe", "unripe fruit", "tart fruit", "sour fruit", "zippy fruit", "crunchy fruit"]);
add("fruitRipeness", "just ripe", ["just ripe", "barely ripe", "fresh fruit", "crisp fruit", "bright fruit"]);
add("fruitRipeness", "ripe", ["ripe fruit", "juicy fruit", "succulent fruit", "sun ripened"]);
add("fruitRipeness", "over-ripe", ["over ripe", "overripe", "jammy", "jam like", "cooked fruit", "baked fruit", "stewed", "stewed fruit", "raisined", "pruney", "sun baked"]);
// alcohol
add("alcohol", "high", ["boozy", "warming", "alcoholic", "high abv", "high alcohol", "hot finish"]);
add("alcohol", "low", ["low abv", "low alcohol", "light alcohol"]);
// oak
add("oak", "none", ["unoaked", "no oak", "oak free", "stainless steel", "without oak"]);
add("oak", "subtle", ["subtle oak", "light oak", "touch of oak", "hint of oak", "little oak", "well integrated oak", "gentle oak", "restrained oak"]);
add("oak", "pronounced", ["oaky", "heavily oaked", "pronounced oak", "lots of oak", "woody", "toasty oak", "heavy oak", "obvious oak", "new oak"]);
// bubbles (sparkling)
add("mousse", "delicate", ["fine bubble", "fine mousse", "delicate mousse", "delicate bubble", "fine perlage", "perlage fine"]);
add("mousse", "creamy", ["creamy mousse", "creamy bubble"]);
add("mousse", "aggressive", ["aggressive bubble", "coarse bubble", "big bubble", "aggressive mousse", "frothy"]);
// finish
add("finish", "long", ["long finish", "lingering", "persistent", "endless finish", "long length", "goes on and on"]);
add("finish", "short", ["short finish", "abrupt", "disappears quickly", "short length"]);
add("finish", "medium", ["medium finish"]);
// appearance
add("clarity", "clear", ["brilliant", "crystal clear", "clear", "limpid"]);
add("clarity", "hazy", ["hazy", "cloudy", "turbid", "murky", "unfiltered"]);
add("appIntensity", "deep", ["inky", "opaque", "dark colour", "dark color", "deep colour", "deep color", "very dark"]);
add("appIntensity", "pale", ["pale colour", "pale color", "watery colour", "light colour", "light color", "very pale"]);
add("colour", "ruby", ["ruby"]); add("colour", "garnet", ["garnet"]); add("colour", "purple", ["purple", "violet colour", "violet hue"]); add("colour", "tawny", ["tawny"]);
add("colour", "lemon", ["lemon colour", "lemon yellow", "pale lemon", "lemon hue"]); add("colour", "lemon-green", ["lemon green", "green tinge", "greenish"]);
add("colour", "gold", ["gold", "golden"]); add("colour", "amber", ["amber"]); add("colour", "pink", ["pink"]); add("colour", "salmon", ["salmon"]); add("colour", "orange", ["orange colour", "orange hue", "orange wine"]);
add("colour", "brown", ["brown", "brownish"]);
// nose
add("condition", "clean", ["clean nose", "clean aroma", "clean on the nose"]);
add("condition", "unclean", ["unclean", "musty", "corked", "mouldy", "moldy", "smells off", "off nose", "off aroma", "wet cardboard", "tca"]);
add("development", "youthful", ["youthful", "primary fruit", "primary aroma", "very young", "young wine"]);
add("development", "developing", ["developing", "evolving", "some development", "starting to develop"]);
add("development", "fully developed", ["fully developed", "mature", "tertiary", "evolved", "well aged", "fully mature"]);
add("development", "tired", ["tired", "oxidised", "oxidized", "past its best", "over the hill", "oxidative"]);
// conclusions
add("quality", "faulty", ["corked", "faulty", "bottle fault", "flawed"]);
add("quality", "poor", ["poor quality", "poor wine", "poorly made"]);
add("quality", "acceptable", ["acceptable", "acceptable quality", "average quality", "ordinary"]);
add("quality", "good", ["good quality", "well made"]);
add("quality", "very good", ["very good quality", "very good wine", "very well made"]);
add("quality", "outstanding", ["outstanding", "exceptional", "superb", "world class", "magnificent"]);
add("readiness", "too young", ["too young", "needs time", "needs ageing", "needs aging", "needs cellaring", "not ready", "wait a few years"]);
add("readiness", "drink now, may improve", ["will improve", "can age", "may improve", "drink now or keep", "drinking well with potential"]);
add("readiness", "drink now, will not improve", ["drink now", "ready to drink", "at its peak", "at peak", "drinking beautifully", "no need to age"]);
add("readiness", "too old", ["too old", "past its best", "over the hill", "past it"]);

// Aromas and flavours: words mapped to tags of the grid's list (tasting.js TAG_TREE). A word that fits several tags of one group goes to the GROUP, never to a guessed subtype.
const T = (tag, phrases) => phrases.forEach((p) => L.push([p, "tag", tag]));
T("citrus", ["citrus", "orange", "tangerine", "mandarin", "citrusy"]); T("lemon", ["lemon", "lemony", "lemon zest"]); T("lime", ["lime", "lime zest"]); T("grapefruit", ["grapefruit", "pomelo"]);
T("orange peel", ["orange peel", "orange zest", "marmalade"]);
T("green fruit", ["green fruit", "apple", "orchard fruit"]); T("green apple", ["green apple", "granny smith"]); T("pear", ["pear"]); T("gooseberry", ["gooseberry"]);
T("stone fruit", ["stone fruit"]); T("peach", ["peach", "white peach"]); T("apricot", ["apricot"]); T("nectarine", ["nectarine"]);
T("tropical fruit", ["tropical", "tropical fruit"]); T("banana", ["banana"]); T("lychee", ["lychee", "litchi"]); T("mango", ["mango"]); T("passion fruit", ["passion fruit", "passionfruit"]); T("pineapple", ["pineapple"]);
T("red fruit", ["red fruit", "cherry", "red berry", "sour cherry", "morello"]); T("strawberry", ["strawberry", "wild strawberry"]); T("raspberry", ["raspberry"]); T("red cherry", ["red cherry"]); T("cranberry", ["cranberry"]); T("red plum", ["red plum"]);
T("black fruit", ["black fruit", "dark fruit", "black berry fruit"]); T("blackcurrant", ["blackcurrant", "black currant", "cassis"]); T("blackberry", ["blackberry", "bramble"]); T("black cherry", ["black cherry", "dark cherry"]); T("black plum", ["black plum"]); T("blueberry", ["blueberry", "bilberry"]);
T("dried or cooked fruit", ["dried fruit", "cooked fruit", "baked fruit"]); T("fig", ["fig"]); T("prune", ["prune"]); T("raisin", ["raisin", "sultana"]); T("jam", ["jam", "jammy", "preserve"]); T("stewed fruit", ["stewed fruit", "stewed"]);
T("floral", ["floral", "flower", "perfumed"]); T("blossom", ["blossom", "elderflower", "acacia", "orange blossom"]); T("rose", ["rose petal", "rose", "rose water"]); T("violet", ["violet"]); T("honeysuckle", ["honeysuckle", "jasmine"]);
T("herbal or green", ["herbal", "herb", "garrigue", "green note"]); T("grass", ["grass", "grassy", "cut grass", "hay"]); T("green pepper", ["green pepper", "bell pepper", "capsicum", "pyrazine"]); T("mint", ["mint", "minty", "menthol"]); T("eucalyptus", ["eucalyptus", "eucalypt"]); T("thyme", ["thyme", "rosemary", "sage", "oregano"]);
T("spice", ["spice", "spicy", "pepper", "peppery", "white pepper", "baking spice"]); T("black pepper", ["black pepper"]); T("licorice", ["licorice", "liquorice", "anise", "aniseed", "fennel"]); T("clove", ["clove"]); T("cinnamon", ["cinnamon"]); T("nutmeg", ["nutmeg"]);
T("oak", ["oak aroma", "oak flavour", "oak flavor"]); T("vanilla", ["vanilla"]); T("toast", ["toast", "toasty", "toasted"]); T("smoke", ["smoke", "smoky", "smokey", "bacon", "charred"]); T("cedar", ["cedar", "cedarwood", "cigar box", "pencil shaving"]); T("coconut", ["coconut"]);
T("winemaking", ["lees", "winemaking"]); T("butter", ["butter", "buttery", "butterscotch"]); T("cream", ["cream", "yogurt", "yoghurt"]); T("yeast", ["yeast", "yeasty", "bread dough", "sourdough"]); T("biscuit or brioche", ["brioche", "biscuit", "bready", "pastry", "shortbread"]);
T("earth and mineral", ["mineral", "minerality", "mineral note", "saline", "salty", "chalky", "stony"]); T("wet stone", ["wet stone", "wet rock", "wet pebble", "petrichor"]); T("chalk", ["chalk", "limestone"]); T("flint", ["flint", "flinty", "gunflint", "struck match", "matchstick"]);
T("earth", ["earth", "earthy", "soil", "dust", "dusty", "graphite", "tar"]); T("forest floor", ["forest floor", "undergrowth", "sous bois", "damp leaves"]); T("mushroom", ["mushroom", "truffle", "porcini"]);
T("age and other", ["age note", "aged character"]); T("honey", ["honey", "honeyed", "beeswax"]); T("almond", ["almond", "marzipan"]); T("hazelnut", ["hazelnut", "walnut", "nutty"]); T("leather", ["leather", "saddle"]); T("tobacco", ["tobacco", "cigar"]);
T("coffee", ["coffee", "espresso", "mocha"]); T("chocolate", ["chocolate", "cocoa", "cacao", "dark chocolate"]); T("caramel", ["caramel", "toffee", "butterscotch candy", "dulce de leche"]); T("petrol", ["petrol", "kerosene", "diesel", "gasoline", "petroleum"]);

export const SEED_LEGEND = L.map(([phrase, field, value]) => ({ phrase, field, value, source: "seed" }));

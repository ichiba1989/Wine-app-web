// Grape varietals: one extensive list, the matching rules, and the typeahead that every grape field uses.
// The list and rules at the top are pure (no browser, no network), so they can be tested on their own.
// The typeahead at the bottom touches the page: any <input data-grapes> gets suggestions as you type,
// and anything that is not on the list is rejected (the field is marked and saving is blocked).

// The most common grapes come first, so suggestions favour them. Names are as printed on labels
// (Syrah and Shiraz are both here, because which one the label says matters).
const LIST = `
Cabernet Sauvignon
Chardonnay
Pinot Noir
Merlot
Sauvignon Blanc
Syrah
Shiraz
Zinfandel
Malbec
Riesling
Pinot Grigio
Pinot Gris
Sangiovese
Tempranillo
Grenache
Garnacha
Cabernet Franc
Chenin Blanc
Viognier
Gewürztraminer
Moscato
Nebbiolo
Barbera
Sémillon
Gamay
Mourvèdre
Monastrell
Petite Sirah
Durif
Petit Verdot
Carmenère
Pinotage
Albariño
Verdejo
Grüner Veltliner
Glera
Vermentino
Primitivo
Montepulciano
Nero d'Avola
Aglianico
Dolcetto
Corvina
Garganega
Trebbiano
Cortese
Arneis
Fiano
Falanghina
Verdicchio
Pecorino
Negroamaro
Pinot Blanc
Pinot Bianco
Pinot Nero
Pinot Meunier
Meunier
Muscat
Muscat Blanc à Petits Grains
Muscat of Alexandria
Muscat Ottonel
Moscato Bianco
Moscato Giallo
Moscatel
Marsanne
Roussanne
Grenache Blanc
Grenache Gris
Cinsault
Cinsaut
Carignan
Carignano
Cariñena
Mazuelo
Graciano
Bobal
Mencía
Godello
Viura
Macabeo
Palomino
Pedro Ximénez
Parellada
Xarel·lo
Torrontés
Tannat
Touriga Nacional
Touriga Franca
Tinta Roriz
Tinta Barroca
Tinto Cão
Tinta Cão
Aragonez
Alvarinho
Arinto
Loureiro
Verdelho
Bual
Boal
Sercial
Malvasia
Malvasia Bianca
Malvasia Nera
Malvasía
Silvaner
Sylvaner
Müller-Thurgau
Kerner
Scheurebe
Bacchus
Spätburgunder
Dornfelder
Lemberger
Blaufränkisch
Zweigelt
St. Laurent
Sankt Laurent
Blauburger
Welschriesling
Furmint
Hárslevelű
Kadarka
Kékfrankos
Assyrtiko
Xinomavro
Agiorgitiko
Moschofilero
Savatiano
Roditis
Malagousia
Mavrodaphne
Rkatsiteli
Saperavi
Mtsvane
Plavac Mali
Graševina
Pošip
Fetească Neagră
Fetească Albă
Fetească Regală
Aligoté
Auxerrois
Altesse
Jacquère
Savagnin
Melon de Bourgogne
Muscadelle
Colombard
Ugni Blanc
Folle Blanche
Clairette
Bourboulenc
Picpoul
Piquepoul Blanc
Rolle
Petit Manseng
Gros Manseng
Mauzac
Chasselas
Mondeuse
Poulsard
Trousseau
Counoise
Négrette
Fer Servadou
Duras
Côt
Alicante Bouschet
Marselan
Caladoc
Arinarnoa
Abouriou
Pineau d'Aunis
Romorantin
Gouais Blanc
Sacy
Terret Noir
Terret Blanc
Aramon
Cabernet Gris
Chardonnay Musqué
Sauvignon Gris
Sauvignon Vert
Sauvignonasse
Friulano
Ribolla Gialla
Picolit
Verduzzo
Pignolo
Refosco
Refosco dal Peduncolo Rosso
Schioppettino
Teroldego
Lagrein
Schiava
Vernatsch
Marzemino
Raboso
Tazzelenghe
Lambrusco
Lambrusco di Sorbara
Lambrusco Grasparossa
Lambrusco Salamino
Lambrusco Maestri
Croatina
Bonarda
Uva Rara
Vespolina
Freisa
Grignolino
Brachetto
Ruchè
Pelaverga
Ormeasco
Rossese
Pigato
Bosco
Erbaluce
Timorasso
Favorita
Nascetta
Albana
Pagadebit
Turbiana
Durella
Vespaiola
Nosiola
Manzoni Bianco
Incrocio Manzoni
Petite Arvine
Arvine
Amigne
Humagne Rouge
Humagne Blanche
Cornalin
Fumin
Petit Rouge
Prié Blanc
Canaiolo
Colorino
Ciliegiolo
Mammolo
Sagrantino
Aleatico
Cesanese
Nero di Troia
Uva di Troia
Susumaniello
Piedirosso
Casavecchia
Pallagrello Nero
Pallagrello Bianco
Tintilia
Lacrima
Vernaccia Nera
Vernaccia
Vernaccia di San Gimignano
Vernaccia di Oristano
Nerello Mascalese
Nerello Cappuccio
Frappato
Gaglioppo
Magliocco
Cannonau
Bovale
Monica
Perricone
Nocera
Carricante
Catarratto
Grillo
Inzolia
Ansonica
Zibibbo
Greco
Greco Bianco
Greco Nero
Coda di Volpe
Biancolella
Forastera
Bombino Bianco
Bombino Nero
Nuragus
Cococciola
Passerina
Grechetto
Trebbiano Toscano
Trebbiano d'Abruzzo
Trebbiano Spoletino
Trebbiano Romagnolo
Malvasia di Candia Aromatica
Malvasia Istriana
Malvasia Puntinata
Moscadello
Fortana
Ancellotta
Sciascinoso
Garnacha Tintorera
Garnacha Blanca
Garnacha Peluda
Tinto Fino
Tinta de Toro
Tinta del País
Cencibel
Tempranillo Blanco
Prieto Picudo
Rufete
Caíño Tinto
Caíño Blanco
Espadeiro
Treixadura
Loureira
Albillo
Albillo Mayor
Doña Blanca
Cayetana Blanca
Pardina
Jaén
Jaén Tinto
Maturana Tinta
Maturana Blanca
Malvasía Riojana
Calagraño
Merseguera
Forcallat
Planta Nova
Verdil
Airén
Listán Negro
Listán Blanco
Listán Prieto
Negramoll
Baboso Negro
Vijariego Negro
Marmajuelo
Callet
Manto Negro
Fogoneu
Prensal Blanc
Trepat
Sumoll
Mandó
Garró
Gonfaus
Hondarrabi Zuri
Hondarrabi Beltza
Pedro Giménez
Moscatel de Alejandría
Moscatel de Grano Menudo
Moscatel Romano
Touriga Fêmea
Tinta Miúda
Tinta Amarela
Trincadeira
Trincadeira Preta
Castelão
Periquita
Baga
Alfrocheiro
Bastardo
Sousão
Vinhão
Borraçal
Amaral
Rufete Serrano
Tinta Francisca
Avesso
Azal
Trajadura
Encruzado
Bical
Cerceal
Cerceal Branco
Fernão Pires
Maria Gomes
Rabigato
Viosinho
Gouveio
Malvasia Fina
Códega do Larinho
Terrantez
Tinta Negra
Negra Mole
Síria
Roupeiro
Antão Vaz
Perrum
Rabo de Ovelha
Seara Nova
Esgana Cão
Sercialinho
Verdelho Tinto
Riesling Italico
Rheinriesling
Ortega
Optima
Siegerrebe
Huxelrebe
Würzer
Gutedel
Grauburgunder
Weißburgunder
Weissburgunder
Frühburgunder
Portugieser
Blauer Portugieser
Trollinger
Regent
Acolon
Dunkelfelder
Schwarzriesling
Samtrot
Traminer
Roter Traminer
Roter Veltliner
Frühroter Veltliner
Neuburger
Rotgipfler
Zierfandler
Muskateller
Gelber Muskateller
Räuschling
Completer
Heida
Paien
Rèze
Himbertscha
Lafnetscha
Diolinoir
Gamaret
Garanoir
Mara
Cabernet Dorsa
Cabernet Mitos
Cabernet Cortis
Cabernet Carbon
Johanniter
Solaris
Muscaris
Rondo
Souvignier Gris
Pinotin
Hárslevelű
Juhfark
Zéta
Kéknyelű
Olaszrizling
Sárgamuskotály
Cserszegi Fűszeres
Irsai Olivér
Királyleányka
Bianca
Leányka
Tămâioasă Românească
Crâmpoșie
Kisi
Khikhvi
Tsolikouri
Tsitska
Aleksandrouli
Mujuretuli
Ojaleshi
Otskhanuri Sapere
Areni
Voskehat
Kangun
Malvazija Istarska
Grk
Žlahtina
Debit
Maraština
Vugava
Babić
Teran
Refošk
Zelen
Pinela
Rebula
Kraljevina
Frankovka
Portugizac
Bogdanuša
Trnjak
Vranac
Kratošija
Smederevka
Prokupac
Tamjanika
Žilavka
Blatina
Župljanka
Mavrud
Melnik
Rubin
Gamza
Pamid
Dimiat
Misket Cherven
Mandilaria
Kotsifali
Vilana
Liatiko
Limniona
Athiri
Aidani
Robola
Vidiano
Debina
Mavrotragano
Negoska
Stavroto
Vertzami
Kydonitsa
Dafni
Plyto
Thrapsathiri
Xynisteri
Maratheftiko
Mavro
Ofthalmo
Öküzgözü
Boğazkere
Kalecik Karası
Narince
Emir
Sultaniye
Papazkarası
Obeidi
Merwah
Argaman
Marawi
Hanepoot
Steen
Crouchen
Cape Riesling
Colombar
Chenel
Ruby Cabernet
Rubired
Charbono
Valdiguié
Napa Gamay
Mission
Criolla Chica
Criolla Grande
Cereza
Torrontés Riojano
Torrontés Sanjuanino
Torrontés Mendocino
País
Lenoir
Black Spanish
Norton
Cynthiana
Concord
Catawba
Niagara
Delaware
Traminette
Vignoles
Chardonel
Cayuga White
Vidal Blanc
Seyval Blanc
Chambourcin
Baco Noir
Maréchal Foch
Marquette
Frontenac
Frontenac Gris
La Crescent
Léon Millot
De Chaunac
Noiret
Corot Noir
St. Croix
Blanc du Bois
Muscadine
Scuppernong
Orange Muscat
Black Muscat
Muscat Hamburg
Symphony
Flora
Emerald Riesling
Tarrango
Muscat à Petits Grains Rouge
Sémillon Gris
Muscadelle du Bordelais
Picardan
Brun Argenté
Roussette
Ugni
Chasan
Jurançon Noir
Prunelard
Béquignol
Castets
Saint-Macaire
Pinot Teinturier
Teinturier
Petit Meslier
Arbane
Fromenteau
Savagnin Rose
Merlot Blanc
Pinot Noir Précoce
Madeleine Angevine
Early Muscat
Villard Noir
Villard Blanc
Mourisco
Albarín Blanco
Albarín Negro
Brancellao
Sousón
Mouratón
Merenzao
Ferrol
Blanca de Monterrey
Lado
`;

// Short forms people actually type, mapped to the name on the list.
const ALIASES = {
  "cab sauv": "Cabernet Sauvignon", "cab sav": "Cabernet Sauvignon", "cabernet": "Cabernet Sauvignon", "cab": "Cabernet Sauvignon",
  "cab franc": "Cabernet Franc", "sauv blanc": "Sauvignon Blanc", "sauvignon": "Sauvignon Blanc", "chard": "Chardonnay",
  "pinot": "Pinot Noir", "grigio": "Pinot Grigio", "gris": "Pinot Gris", "syrah shiraz": "Syrah", "petite syrah": "Petite Sirah",
  "gruner": "Grüner Veltliner", "gruner veltliner": "Grüner Veltliner", "albarino": "Albariño", "muscat blanc": "Muscat Blanc à Petits Grains",
  "muscat canelli": "Muscat", "moscato d asti": "Moscato Bianco", "nero davola": "Nero d'Avola", "tinta roriz tempranillo": "Tinta Roriz",
};

// ---------------------------------------------------------------- pure rules
// Lowercase, no accents, no punctuation: "Grüner Veltliner" and "gruner  veltliner" match.
export const fold = (s) => String(s == null ? "" : s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/·/g, "l").replace(/ß/g, "ss").replace(/[’'`.]/g, "").replace(/[-_/]/g, " ").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

// When a grape is listed twice (with and without an accent) the first spelling is the one kept.
const firstSpellings = (names) => { const seen = new Map(); names.forEach((n) => { const k = fold(n); if (k && !seen.has(k)) seen.set(k, n); }); return [...seen.values()]; };
export const GRAPES = firstSpellings(LIST.split("\n").map((x) => x.trim()).filter(Boolean));

// Builds a matcher from the built-in list plus any extra names (for example grapes already in the database).
export function grapeIndex(extra = []) {
  const names = firstSpellings([...GRAPES, ...extra.map((x) => String(x || "").trim()).filter(Boolean)]);
  const byFold = new Map(names.map((n) => [fold(n), n]));
  Object.entries(ALIASES).forEach(([a, n]) => { if (!byFold.has(a) && byFold.has(fold(n))) byFold.set(a, byFold.get(fold(n))); });
  return { names, byFold, folded: names.map((n) => [fold(n), n]) };
}
const DEFAULT_INDEX = grapeIndex();

// The name on the list that this text means, or null.
export const resolveGrape = (text, index = DEFAULT_INDEX) => index.byFold.get(fold(text)) || null;

// Suggestions for what has been typed so far: names that start with it first, then names with a word that starts with it,
// then names that contain it. Within each group the list order (most common first) is kept.
export function suggestGrapes(query, index = DEFAULT_INDEX, limit = 8) {
  const q = fold(query);
  if (!q) return [];
  const starts = [], words = [], inside = [];
  for (const [f, n] of index.folded) {
    if (f.startsWith(q)) starts.push(n);
    else if (f.split(" ").some((w) => w.startsWith(q))) words.push(n);
    else if (q.length >= 3 && f.includes(q)) inside.push(n);
  }
  Object.entries(ALIASES).forEach(([a, n]) => { if (a.startsWith(q) && index.byFold.has(fold(n)) && ![...starts, ...words, ...inside].includes(index.byFold.get(fold(n)))) starts.push(index.byFold.get(fold(n))); });
  return [...starts, ...words, ...inside].slice(0, limit);
}

// Several grapes are separated by a comma, a slash, a semicolon or " & ". A hyphen is part of a name (Müller-Thurgau).
export const splitGrapeText = (text) => String(text || "").split(/[,;/]|\s&\s/).map((x) => x.trim()).filter(Boolean);

// { ok, names (on the list, no repeats), bad (typed names that are not on the list) }. Empty text is fine: a grape is optional.
export function checkGrapeText(text, index = DEFAULT_INDEX) {
  const names = [], bad = [];
  splitGrapeText(text).forEach((part) => {
    const n = resolveGrape(part, index);
    if (n) { if (!names.includes(n)) names.push(n); } else bad.push(part);
  });
  return { ok: bad.length === 0, names, bad };
}
export const grapeProblem = (bad) => (bad.length ? `${bad.map((b) => `\u201C${b}\u201D`).join(", ")} ${bad.length === 1 ? "is" : "are"} not on the grape list. Start typing and pick from the suggestions.` : "");

// The part of the text being typed: the last grape when the caret is at the end, otherwise the one the caret is in.
export function currentSegment(text, caret) {
  const t = String(text || "");
  const at = typeof caret === "number" && caret >= 0 && caret <= t.length ? caret : t.length;
  const before = t.slice(0, at), after = t.slice(at);
  const start = Math.max(before.lastIndexOf(","), before.lastIndexOf(";"), before.lastIndexOf("/")) + 1;
  const m = after.search(/[,;/]/);
  const end = m === -1 ? t.length : at + m;
  return { start, end, query: t.slice(start, end).trim() };
}
// The text with the segment being typed replaced by a chosen name.
export function applySuggestion(text, seg, name, multi) {
  const t = String(text || "");
  const head = t.slice(0, seg.start).replace(/\s+$/, ""), tail = t.slice(seg.end).replace(/^\s+/, "");
  const lead = head ? head + (head.endsWith(",") ? " " : ", ") : "";
  const rest = tail ? (tail.startsWith(",") ? tail : ", " + tail) : (multi ? "" : "");
  return lead + name + rest;
}

// ---------------------------------------------------------------- typeahead (browser)
// Any <input data-grapes="multi"> (several grapes, separated by commas) or <input data-grapes="one"> gets a suggestion list
// under it. Tapping a suggestion fills it in. Text that is not on the list is marked and its message shown under the field;
// the screens that own the field also refuse to save it (see checkGrapeText).
// Fields whose list also includes database grapes: set data-grapes-extra="<id of a <script type=application/json> with names>" (optional).
// Extra names the screens know about (for example grapes already in the database). Set by the screen that loads them.
let EXTRA = [];
export const setExtraGrapes = (names) => { EXTRA = Array.isArray(names) ? names : []; };
let wired = false;
export function wireGrapeInputs(getExtra = () => EXTRA) {
  if (wired || typeof document === "undefined") return;
  wired = true;
  let indexKey = "", index = DEFAULT_INDEX;
  const idx = () => { const extra = getExtra() || []; const key = extra.length + ":" + (extra[0] || "") + ":" + (extra[extra.length - 1] || ""); if (key !== indexKey) { indexKey = key; index = grapeIndex(extra); } return index; };
  const box = (input) => { let b = input.nextElementSibling; if (!b || !b.classList.contains("sugg")) { b = document.createElement("div"); b.className = "sugg"; b.setAttribute("role", "listbox"); b.hidden = true; input.insertAdjacentElement("afterend", b); } return b; };
  const msg = (input) => { const b = box(input); let m = b.nextElementSibling; if (!m || !m.classList.contains("gerr")) { m = document.createElement("div"); m.className = "gerr"; m.setAttribute("role", "alert"); b.insertAdjacentElement("afterend", m); } return m; };
  const hide = (input) => { const b = input.nextElementSibling; if (b && b.classList.contains("sugg")) { b.hidden = true; b.innerHTML = ""; } };
  const mark = (input) => {
    const res = checkGrapeText(input.value, idx());
    const m = msg(input);
    input.classList.toggle("bad", !res.ok);
    input.setAttribute("aria-invalid", String(!res.ok));
    m.textContent = res.ok ? "" : grapeProblem(res.bad);
    return res;
  };
  const show = (input) => {
    const multi = input.dataset.grapes === "multi";
    const seg = currentSegment(input.value, input.selectionStart);
    const list = suggestGrapes(seg.query, idx(), 8);
    const b = box(input);
    if (!list.length) { b.hidden = true; b.innerHTML = ""; return; }
    b.innerHTML = list.map((n) => `<button type="button" class="sugg-item" role="option" data-sugg="${n.replace(/"/g, "&quot;")}">${n.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</button>`).join("");
    b.hidden = false;
    b.dataset.multi = multi ? "1" : "";
  };
  document.addEventListener("input", (ev) => {
    const t = ev.target;
    if (!t || !t.matches || !t.matches("input[data-grapes]") || ev.__fromGrapeUi) return;
    show(t);
    if (t.classList.contains("bad")) mark(t);   // once flagged, keep the message in step while the person fixes it
  });
  document.addEventListener("focusin", (ev) => { const t = ev.target; if (t && t.matches && t.matches("input[data-grapes]")) show(t); });
  document.addEventListener("focusout", (ev) => {
    const t = ev.target;
    if (!t || !t.matches || !t.matches("input[data-grapes]")) return;
    setTimeout(() => {
      hide(t);
      const res = mark(t);
      if (res.ok && res.names.length && t.value.trim() !== res.names.join(", ")) {   // tidy the text: right spelling, one comma and a space between grapes
        t.value = res.names.join(", ");
        const e = new Event("input", { bubbles: true }); e.__fromGrapeUi = true; t.dispatchEvent(e);
      }
    }, 160);
  });
  // Keep the field focused while a suggestion is tapped.
  document.addEventListener("pointerdown", (ev) => { if (ev.target && ev.target.closest && ev.target.closest(".sugg-item")) ev.preventDefault(); });
  document.addEventListener("click", (ev) => {
    const b = ev.target && ev.target.closest && ev.target.closest(".sugg-item");
    if (!b) return;
    const input = b.parentElement.previousElementSibling;
    if (!input || !input.matches("input[data-grapes]")) return;
    const multi = input.dataset.grapes === "multi";
    const seg = currentSegment(input.value, input.selectionStart);
    input.value = applySuggestion(input.value, seg, b.dataset.sugg, multi);
    const e = new Event("input", { bubbles: true }); e.__fromGrapeUi = true; input.dispatchEvent(e);
    hide(input); mark(input);
    input.focus();
  });
}
// Called by a screen before it saves: marks the field and returns the result.
export function checkGrapeInput(input, extra = EXTRA) {
  const res = checkGrapeText(input ? input.value : "", grapeIndex(extra));
  if (input) {
    input.classList.toggle("bad", !res.ok);
    let b = input.nextElementSibling; if (b && b.classList.contains("sugg")) b = b.nextElementSibling;
    if (b && b.classList.contains("gerr")) b.textContent = res.ok ? "" : grapeProblem(res.bad);
  }
  return res;
}

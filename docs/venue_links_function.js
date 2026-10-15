// Supabase Edge Function "venue-links" (Vintage Wine Merchants branch). Deploy it as described in docs/VENUE_LINKS.md.
// It only READS the venue's public website and returns what it found; it never writes to the database (the editor's app saves the results,
// under the editor's own access). It never fetches any other website.
//   { action: "find", rows: [{ id, title, vintage }] }   -> { source, results: [{ id, url }] }   a page on the website for each wine, or url null
//   { action: "check", rows: [{ id, title, vintage, url }] } -> { results: [{ id, status: "ok" | "gone" | "different" | "error", reason }] }
// A wine is only linked when the website shows the same wine: the same words (accents, capitals, punctuation and bottle sizes aside) and the
// same vintage. When two pages could fit, or none does, there is no link. Nothing is guessed.
const SITE = "https://www.vintagewinemerchants.com";
const HOSTS = ["www.vintagewinemerchants.com", "vintagewinemerchants.com"];
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const MAX_ROWS = 60;

// ---------------------------------------------------------------- matching words (the same idea as venue.js parseTitle)
const SIZE = /\b\d+(?:[.,]\d+)?\s?(?:ml|l|cl)\b|\bmagnum\b|\bcan\b|\(\s*[a-z]?\d{2,4}\s*\)/gi;
export const words = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(SIZE, " ").replace(/[^a-z0-9]+/g, " ").trim()
  .split(" ").filter((w) => w && !/^(19|20)\d{2}$/.test(w) && w !== "nv");
export const yearOf = (s) => { const m = String(s || "").match(/\b(19|20)\d{2}\b/); return m ? m[0] : ""; };
// Each product's words are worked out once (a list of 2000 wines against 2500 pages would otherwise redo them millions of times and run
// past the server's time limit), and the pages are grouped by vintage year so a wine is only compared with pages of its own year.
const PREPARED = new WeakMap();
function prepare(products) {
  let ix = PREPARED.get(products);
  if (ix) return ix;
  ix = new Map();
  for (const p of products) {
    const w = words(p.title), item = { p, key: w.join(" "), set: new Set(w), len: w.length }, y = yearOf(p.title) || "NV";
    if (!ix.has(y)) ix.set(y, []);
    ix.get(y).push(item);
  }
  PREPARED.set(products, ix);
  return ix;
}
// products: [{ title, url }]. Returns the one page that is the same wine, or null.
export function matchProduct(row, products) {
  const want = words(row.title), key = want.join(" ");
  if (!want.length) return null;
  const fits = prepare(products).get(row.vintage && row.vintage !== "NV" ? row.vintage : "NV") || [];
  const exact = fits.filter((x) => x.key === key);
  if (exact.length === 1) return exact[0].p;
  if (exact.length > 1) return null;
  const wider = fits.filter((x) => x.len <= want.length + 2 && want.every((w) => x.set.has(w)));
  return wider.length === 1 ? wider[0].p : null;
}
// Is this page still the wine? Its title must hold the wine's words and the same vintage.
export function pageMatches(row, pageTitle) {
  const have = new Set(words(pageTitle)), want = words(row.title);
  if (!want.length || !pageTitle) return false;
  const share = want.filter((w) => have.has(w)).length / want.length;
  const y = yearOf(pageTitle);
  return share >= 0.8 && (!row.vintage || row.vintage === "NV" ? true : !y || y === row.vintage);
}

// ---------------------------------------------------------------- reading the website's catalogue
async function getJson(url) { const r = await fetch(url, { headers: { accept: "application/json" } }); if (!r.ok) throw new Error(`${r.status}`); return r.json(); }
// Shopify stores list their products at /products.json; WooCommerce at /wp-json/wc/store/products. The first that answers is used.
async function catalogue() {
  try {
    const out = [];
    for (let page = 1; page <= 40; page++) {
      const j = await getJson(`${SITE}/products.json?limit=250&page=${page}`);
      const list = (j && j.products) || [];
      list.forEach((p) => out.push({ title: p.title, url: `${SITE}/products/${p.handle}` }));
      if (list.length < 250) break;
    }
    if (out.length) return { source: "shopify", products: out };
  } catch (_) { /* not Shopify */ }
  try {
    const out = [];
    for (let page = 1; page <= 60; page++) {
      const list = await getJson(`${SITE}/wp-json/wc/store/products?per_page=100&page=${page}`);
      (list || []).forEach((p) => out.push({ title: String(p.name || "").replace(/<[^>]+>/g, ""), url: p.permalink }));
      if (!list || list.length < 100) break;
    }
    if (out.length) return { source: "woocommerce", products: out };
  } catch (_) { /* not WooCommerce */ }
  return { source: "", products: [] };
}
const onSite = (url) => { try { const u = new URL(url); return u.protocol === "https:" && HOSTS.includes(u.hostname); } catch (_) { return false; } };
// The page's own title, read from the page HEAD only: the body has other <title> tags (the payment-card icons at the bottom of every page
// carry titles such as "American Express"), which must never be taken for the wine.
const NAMED = { eacute: "é", egrave: "è", ecirc: "ê", agrave: "à", acirc: "â", ocirc: "ô", ouml: "ö", uuml: "ü", auml: "ä", ccedil: "ç", ntilde: "ñ", iacute: "í", aacute: "á", oacute: "ó", uacute: "ú", nbsp: " " };
const unescape = (t) => t.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&([a-z]+);/gi, (m, n) => NAMED[n.toLowerCase()] || m).replace(/&amp;/g, "&").replace(/&#39;|&rsquo;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&ndash;|&#8211;/g, "–").replace(/\s+/g, " ").trim();
export const titleOf = (html) => {
  const head = (String(html).match(/<head[\s>][\s\S]*?<\/head>/i) || [""])[0];
  const metas = head.match(/<meta\b[^>]*>/gi) || [];
  const og = metas.find((m) => /property\s*=\s*["']og:title["']/i.test(m));
  const content = og && (og.match(/content\s*=\s*"([^"]*)"/i) || og.match(/content\s*=\s*'([^']*)'/i));
  if (content && content[1].trim()) return unescape(content[1]);
  return unescape((head.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "");
};
// A Shopify product page also answers as data at <page>.json, which names the product without any page around it.
async function productTitle(url) {
  try {
    const u = new URL(url);
    if (!/^\/products\/[^/]+\/?$/.test(u.pathname)) return null;
    const r = await fetch(`${u.origin}${u.pathname.replace(/\/$/, "")}.json`, { headers: { accept: "application/json" } });
    if (r.status === 404 || r.status === 410) return { gone: r.status };
    if (!r.ok) return null;
    const j = await r.json();
    return j && j.product && j.product.title ? { title: String(j.product.title) } : null;
  } catch (_) { return null; }
}
async function check(row) {
  if (!onSite(row.url)) return { id: row.id, status: "different", reason: "not a page on the venue's website" };
  try {
    const data = await productTitle(row.url);
    if (data && data.gone) return { id: row.id, status: "gone", reason: `the page answers ${data.gone}` };
    if (data && data.title) return pageMatches(row, data.title) ? { id: row.id, status: "ok", reason: data.title } : { id: row.id, status: "different", reason: `the page shows "${data.title}"` };
    const r = await fetch(row.url, { redirect: "follow" });
    if (r.status === 404 || r.status === 410) return { id: row.id, status: "gone", reason: `the page answers ${r.status}` };
    if (!r.ok) return { id: row.id, status: "error", reason: `the page answers ${r.status}` };
    const final = new URL(r.url);
    if (!HOSTS.includes(final.hostname) || final.pathname === "/" || final.pathname.split("/").filter(Boolean).length < 2) return { id: row.id, status: "gone", reason: "the page now sends you elsewhere" };
    const title = titleOf(await r.text());
    if (!title) return { id: row.id, status: "error", reason: "the page's title could not be read" };   // never removed for that
    return pageMatches(row, title) ? { id: row.id, status: "ok", reason: title } : { id: row.id, status: "different", reason: `the page shows "${title}"` };
  } catch (e) { return { id: row.id, status: "error", reason: String(e.message || e) }; }
}

if (typeof Deno !== "undefined") Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
  try {
    const { action, rows } = await req.json();
    if (action === "find") {   // the catalogue is read once, so the whole list can be matched in one call
      const list = (rows || []).slice(0, 5000);
      const cat = await catalogue();
      if (!cat.products.length) return reply({ source: "", results: [], error: "The venue's website did not list its products (neither a Shopify nor a WooCommerce product list answered)." });
      return reply({ source: cat.source, count: cat.products.length, results: list.map((r) => { const m = matchProduct(r, cat.products); return { id: r.id, url: m ? m.url : null, title: m ? m.title : "" }; }) });
    }
    if (action === "check") {   // each page is opened, so a call checks at most MAX_ROWS (the app sends batches)
      const list = (rows || []).slice(0, MAX_ROWS), results = [];
      for (let i = 0; i < list.length; i += 4) results.push(...(await Promise.all(list.slice(i, i + 4).map(check))));
      return reply({ results });
    }
    return reply({ error: "Unknown action." }, 400);
  } catch (e) { return reply({ error: String(e.message || e) }, 500); }
});

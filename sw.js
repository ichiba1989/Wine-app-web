// The service worker: lets the app open with no signal, in a browser tab and when installed.
// Its only job is to keep copies of the app's own files. It never touches the database (those calls are other web addresses and are left alone).
// The file is registered as sw.js?v=N with the same N as app.js, so a new release is a new worker with a new cache; the old cache is removed when it takes over.
//   * Files with a ?v= number in their address (the modules) and the vendor folder never change under the same address: served from the copy first.
//   * The page itself (index.html), config.js and privacy.html are asked of the network first (with a short wait), so a new release is found when online; the copy is the fallback.
//   * A small number of bottle thumbnails from public storage are kept too (a capped set), so the lists still show them offline. Photos of the player's own (private, signed links) are never kept here.
const VERSION = new URL(self.location).searchParams.get("v") || "0";
// The venue version is published at /vwm/ on the same site as the main app, so its copies have their own name: the main app's worker only clears
// "wine-app-" copies and this one only clears "vwm-app-" copies, so neither removes the other's files.
const PREFIX = "vwm-app-";
const APP = `${PREFIX}${VERSION}`, IMAGES = "wine-img";
const IMAGE_LIMIT = 60;
const PAGE_WAIT_MS = 4000;

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(APP);
    // index.html is the one file that must be there for the app to open; the modules are added as the page reports them (see the message handler).
    try { await c.add(new Request("./index.html", { cache: "reload" })); } catch (_) {}
    self.skipWaiting();
  })());
});
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith(PREFIX) && k !== APP) await caches.delete(k);
    await self.clients.claim();
  })());
});

// The page sends the addresses it has loaded (modules, vendor library) so the first visit is complete without loading everything twice.
self.addEventListener("message", (e) => {
  const d = e.data;
  if (!d || d.type !== "cache" || !Array.isArray(d.urls)) return;
  e.waitUntil((async () => {
    const c = await caches.open(APP);
    for (const u of d.urls) {
      try { const url = new URL(u, self.location); if (url.origin !== self.location.origin || await c.match(url.href)) continue; const r = await fetch(url.href); if (r.ok) await c.put(url.href, r); } catch (_) {}
    }
  })());
});

const isVersioned = (url) => url.searchParams.has("v") || url.pathname.includes("/vendor/");
const isPublicImage = (url) => /\/storage\/v1\/object\/public\//.test(url.pathname);

async function networkFirst(req, wait) {
  const c = await caches.open(APP);
  try {
    const r = await Promise.race([fetch(req), new Promise((_, rej) => setTimeout(() => rej(new Error("slow")), wait))]);
    if (r && r.ok) c.put(req, r.clone());
    return r;
  } catch (e) {
    const hit = await c.match(req, { ignoreSearch: false }) || (req.mode === "navigate" ? await c.match("./index.html") : null);
    if (hit) return hit;
    try { return await fetch(req); } catch (_) { return new Response("You are offline and this page has not been saved yet.", { status: 503, headers: { "content-type": "text/plain" } }); }
  }
}
async function cacheFirst(req) {
  const c = await caches.open(APP), hit = await c.match(req);
  if (hit) return hit;
  const r = await fetch(req);
  if (r && r.ok) c.put(req, r.clone());
  return r;
}
async function image(req) {
  const c = await caches.open(IMAGES), hit = await c.match(req.url);
  if (hit) return hit;
  try {
    const r = await fetch(req.url, { mode: "cors" });   // a readable copy (not opaque), so it stays small in the cache
    if (r.ok) {
      const keys = await c.keys();
      for (let i = 0; i <= keys.length - IMAGE_LIMIT; i++) await c.delete(keys[i]);   // oldest first
      c.put(req.url, r.clone());
    }
    return r;
  } catch (_) { return fetch(req); }
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (url.pathname.endsWith("/sw.js")) return;   // always the browser's own check for a new worker
    if (/\/(config\.js|privacy\.html)$/.test(url.pathname) || req.mode === "navigate" || url.pathname.endsWith("/") || url.pathname.endsWith("/index.html")) { e.respondWith(networkFirst(req, PAGE_WAIT_MS)); return; }
    if (isVersioned(url) || /\.(png|svg|webmanifest|json)$/.test(url.pathname)) { e.respondWith(cacheFirst(req)); return; }
    e.respondWith(networkFirst(req, PAGE_WAIT_MS));
    return;
  }
  if (req.destination === "image" && isPublicImage(url)) e.respondWith(image(req));
});

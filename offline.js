// Working with no connection: a copy of what the app last read, a queue of changes made while offline, and the sync that uploads them when the phone is online again.
// It wraps the database client (wrap) so the rest of the app keeps calling sb.from(...) and sb.rpc(...) exactly as before:
//   * READS are remembered on the phone (IndexedDB) every time they succeed; offline (or when the network fails) the last copy is returned instead.
//   * WRITES are online-only unless the code marks them with .queue(effect). A marked write that cannot be sent goes into the outbox with its EFFECT (see overlay.js, which lays the
//     effects over what the server last said), and is replayed in order when online. A new row gets a temporary id ("tmp_...") that later queued steps can use; at replay the real
//     id the server gives replaces it everywhere. A write the database refuses is moved to the "could not upload" list with the reason, never dropped silently.
//   * Photos are never queued: anything that needs the storage service needs a connection.
// The pieces that need no browser (the queue, the replay, the id swap) are written against a small store so they can be tested in Node. IndexedDB is used when it exists, else memory.
const DB_NAME = "wine-offline";
const READ_TIMEOUT = 12000;
const WRITE = new Set(["insert", "update", "upsert", "delete"]);
const CACHEABLE_RPC = new Set(["my_staff_access"]);   // reads done through a function that are safe to keep a copy of
export const OFFLINE_CODE = "OFFLINE";

// ---------------------------------------------------------------- the stores
export function createMemoryStore() {
  const m = new Map();
  return { async get(k) { return m.has(k) ? m.get(k) : undefined; }, async set(k, v) { m.set(k, v); }, async del(k) { m.delete(k); }, async clear() { m.clear(); }, async keys() { return [...m.keys()]; } };
}
export function createIdbStore(name = DB_NAME) {
  const fallback = createMemoryStore();
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(name, 1);
      req.onupgradeneeded = () => req.result.createObjectStore("kv");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (e) { reject(e); }
  }));
  const tx = async (mode, fn) => {
    const db = await open();
    return new Promise((resolve, reject) => { const t = db.transaction("kv", mode), s = t.objectStore("kv"), r = fn(s); t.oncomplete = () => resolve(r && "result" in r ? r.result : undefined); t.onerror = () => reject(t.error); t.onabort = () => reject(t.error); });
  };
  const safe = (fn, fb) => async (...a) => { try { return await fn(...a); } catch (_) { return fb(...a); } };   // private browsing or a full disk: fall back to memory for this visit
  return {
    get: safe((k) => tx("readonly", (s) => s.get(k)), (k) => fallback.get(k)),
    set: safe((k, v) => tx("readwrite", (s) => s.put(v, k)), (k, v) => fallback.set(k, v)),
    del: safe((k) => tx("readwrite", (s) => s.delete(k)), (k) => fallback.del(k)),
    clear: safe(() => tx("readwrite", (s) => s.clear()), () => fallback.clear()),
    keys: safe(() => tx("readonly", (s) => s.getAllKeys()), () => fallback.keys()),
  };
}

// ---------------------------------------------------------------- small helpers
const uuidDefault = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === "x" ? r : (r & 3) | 8).toString(16); }));
const clone = (v) => (typeof structuredClone === "function" ? structuredClone(v) : JSON.parse(JSON.stringify(v)));
export function isNetworkError(e) {
  if (!e) return false;
  const m = String(e.message || e);
  return e.code === "NETWORK" || e.status === 0 || /failed to fetch|networkerror|network error|load failed|fetch failed|err_internet|network request failed|timed out/i.test(m) || (e.name === "TypeError" && /fetch/i.test(m));
}
// A string equal to a temporary id is replaced by the real one, anywhere inside the value.
export function swapIds(v, map) {
  if (typeof v === "string") return Object.prototype.hasOwnProperty.call(map, v) ? map[v] : v;
  if (Array.isArray(v)) return v.map((x) => swapIds(x, map));
  if (v && typeof v === "object") { const o = {}; for (const k of Object.keys(v)) o[k] = swapIds(v[k], map); return o; }
  return v;
}
const stable = (calls, extra) => JSON.stringify([calls, extra === undefined ? null : extra]);
const needsConnection = (what = "This") => ({ data: null, count: null, status: 0, statusText: "offline", error: { message: `${what} needs a connection. Try again when you are online.`, code: OFFLINE_CODE } });
const withTimeout = (p, ms) => { let t; return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(Object.assign(new Error("The request timed out"), { code: "NETWORK" })), ms); })]).finally(() => clearTimeout(t)); };
const LABELS = { state: "a swipe", stateDelete: "removing a swipe", entry: "a journal entry", entryPatch: "a change to a journal entry", entryDelete: "removing a journal entry", answer: "a quiz answer", archiveRemove: "a quiz archive change", tasting: "a tasting grid" };
export const describe = (item) => {
  const e = (item.effects || [])[0];
  if (e && LABELS[e.t]) return LABELS[e.t];
  return item.rpc ? item.rpc.replace(/_/g, " ") : `a change to ${String(item.table || "your data").replace(/_/g, " ")}`;
};

// ---------------------------------------------------------------- the offline layer
export function createOffline({ store, online = () => (typeof navigator === "undefined" ? true : navigator.onLine !== false), uuid = uuidDefault, now = () => Date.now(), maxQueue = 1000, useLocks = true } = {}) {
  store = store || createIdbStore();
  let queue = [], failed = [], idmap = {}, loaded = null, syncing = false, getClient = null, onSynced = null, saving = Promise.resolve();
  const listeners = new Set();
  const notify = () => { const s = status(); listeners.forEach((f) => { try { f(s); } catch (_) {} }); };
  const status = () => ({ online: online(), pending: queue.length, failed: failed.length, syncing });
  const save = () => (saving = saving.then(() => Promise.all([store.set("outbox", queue), store.set("failed", failed), store.set("idmap", idmap)])).catch(() => {}));
  const load = () => loaded || (loaded = (async () => { queue = (await store.get("outbox")) || []; failed = (await store.get("failed")) || []; idmap = (await store.get("idmap")) || {}; })());
  const fillTmp = (e, tmp) => (tmp ? swapIds(e, { $new: tmp }) : e);

  function wrap(sb) {
    const recorder = (spec) => {
      const calls = [];
      let marked = false, effect = null;
      const exec = () => { let q = spec.rpc ? sb.rpc(spec.rpc, spec.args, spec.opts) : sb.from(spec.table); for (const [m, a] of calls) q = q[m](...a); return q; };
      const run = async () => {
        await load();
        const isWrite = spec.rpc ? !CACHEABLE_RPC.has(spec.rpc) : calls.some(([m]) => WRITE.has(m));
        if (!isWrite) return read();
        return marked ? queued() : direct();
      };
      const direct = async () => {
        if (!online()) return needsConnection();
        try { return await exec(); } catch (e) { if (isNetworkError(e)) return needsConnection(); throw e; }
      };
      const cacheKey = () => (spec.table ? `r:${spec.table}:${stable(calls)}` : CACHEABLE_RPC.has(spec.rpc) ? `r:rpc:${spec.rpc}:${stable([], spec.args)}` : null);
      const fromCache = async (key, why) => {
        const hit = key ? await store.get(key) : undefined;
        if (hit) return { data: clone(hit.data), count: hit.count ?? null, error: null, status: 200, statusText: "OK (saved copy)", offline: true };
        return why || { data: null, count: null, status: 0, statusText: "offline", error: { message: "You are offline and this has not been downloaded yet.", code: OFFLINE_CODE } };
      };
      const read = async () => {
        const key = cacheKey();
        if (!online()) return fromCache(key);
        try {
          const res = await withTimeout(Promise.resolve(exec()), READ_TIMEOUT);
          if (res && res.error && isNetworkError(res.error)) return fromCache(key, res);
          if (res && !res.error && key) store.set(key, { data: res.data, count: res.count ?? null, at: now() }).catch?.(() => {});
          return res;
        } catch (e) { if (isNetworkError(e)) return fromCache(key); throw e; }
      };
      const queued = async () => {
        if (online() && queue.length === 0) {
          try { const res = await exec(); if (!(res && res.error && isNetworkError(res.error))) return res; } catch (e) { if (!isNetworkError(e)) throw e; }
        }
        if (queue.length >= maxQueue) return { data: null, count: null, status: 0, error: { message: "Too many changes are waiting to upload. Connect to the internet so they can be sent.", code: "QUEUE_FULL" } };
        const first = calls[0] && calls[0][0];
        const wantsId = !!spec.table && first === "insert" && calls.some(([m]) => m === "select");
        const tmp = wantsId ? `tmp_${uuid()}` : null;
        const effects = effect ? (Array.isArray(effect) ? effect : [effect]).map((e) => fillTmp(clone(e), tmp)) : [];
        const item = { id: uuid(), at: now(), table: spec.table || null, rpc: spec.rpc || null, args: spec.args === undefined ? null : clone(spec.args), opts: spec.opts || null, calls: clone(calls), tmp, effects };
        queue.push(item); await save(); notify(); kick();
        if (!wantsId) return { data: null, count: null, error: null, status: 201, statusText: "Queued", queued: true };
        const given = calls[0][1][0], row = { ...(Array.isArray(given) ? given[0] : given), id: tmp };
        return { data: calls.some(([m]) => m === "single" || m === "maybeSingle") ? row : [row], count: null, error: null, status: 201, statusText: "Queued", queued: true };
      };
      const proxy = new Proxy({}, {
        get(_, prop) {
          if (prop === "then") return (res, rej) => run().then(res, rej);
          if (prop === "catch") return (rej) => run().catch(rej);
          if (prop === "finally") return (f) => run().finally(f);
          if (prop === "queue") return (eff) => { marked = true; if (eff) effect = eff; return proxy; };
          if (typeof prop === "symbol") return undefined;
          return (...args) => { calls.push([prop, args]); return proxy; };
        },
      });
      return proxy;
    };
    return new Proxy(sb, {
      get(target, prop) {
        if (prop === "from") return (table) => recorder({ table });
        if (prop === "rpc") return (name, args, opts) => recorder({ rpc: name, args, opts });
        const v = Reflect.get(target, prop);
        return typeof v === "function" ? v.bind(target) : v;
      },
    });
  }

  // Sends the waiting changes one by one, in order. Stops at the first network failure and tries again later.
  // An entry made by the "had it" swipe has no id until the server makes it ("tmp_had_<wine id>"): find the real one before a later change that refers to it is sent.
  async function resolveHad(sb, item) {
    const found = new Set(), scan = (v) => { if (typeof v === "string") { if (v.startsWith("tmp_had_") && !idmap[v]) found.add(v); } else if (Array.isArray(v)) v.forEach(scan); else if (v && typeof v === "object") Object.values(v).forEach(scan); };
    scan(item.args); scan(item.calls);
    for (const key of found) {
      try {
        const r = await sb.from("consumptions").select("id").eq("wine_vintage_id", key.slice(8)).is("deleted_at", null).order("created_at", { ascending: false }).limit(1);
        if (r && !r.error && r.data && r.data[0]) idmap[key] = r.data[0].id;
      } catch (_) { /* the change that needs it will be refused and listed */ }
    }
  }
  async function replay(sb, item) {
    let q;
    try {
      await resolveHad(sb, item);
      if (item.rpc) q = sb.rpc(item.rpc, swapIds(item.args, idmap), item.opts || undefined);
      else { q = sb.from(item.table); for (const [m, a] of item.calls) q = q[m](...swapIds(a, idmap)); }
      const res = await withTimeout(Promise.resolve(q), READ_TIMEOUT * 2);
      if (res && res.error) {
        if (isNetworkError(res.error)) return "network";
        if (res.error.code === "23505") return "ok";   // already there: a repeat of something that did get through
        return { message: res.error.message || "The database refused it", code: res.error.code };
      }
      if (item.tmp && res && res.data) { const row = Array.isArray(res.data) ? res.data[0] : res.data; if (row && row.id) idmap[item.tmp] = row.id; }
      return "ok";
    } catch (e) { return isNetworkError(e) ? "network" : { message: String((e && e.message) || e) }; }
  }
  async function flush(sb = getClient && getClient()) {
    await load();
    if (syncing || !sb || !online() || !queue.length) return { sent: 0 };
    syncing = true; notify();
    let sent = 0;
    const run = async () => {
      while (queue.length && online()) {
        const item = queue[0], out = await replay(sb, item);
        if (out === "network") break;
        queue.shift(); sent++;
        if (out !== "ok") failed.push({ ...item, error: out.message, code: out.code, failedAt: now() });
        await save(); notify();
      }
    };
    try {
      if (useLocks && typeof navigator !== "undefined" && navigator.locks) await navigator.locks.request("wine-sync", { ifAvailable: true }, async (lock) => { if (lock) await run(); });
      else await run();
    } finally { syncing = false; notify(); }
    if (sent && onSynced) { try { await onSynced(sent); } catch (_) {} }
    return { sent };
  }
  let kickTimer = null;
  function kick(ms = 60) { if (!getClient) return; clearTimeout(kickTimer); kickTimer = setTimeout(() => { if (online()) flush(); }, ms); }
  // Starts syncing on its own: when the app opens, when the phone comes back online or the app comes back to the front, and every half minute while something waits.
  function start({ client, synced }) {
    getClient = client; onSynced = synced || null;
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => { notify(); kick(300); });
      window.addEventListener("offline", () => notify());
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") kick(300); });
      setInterval(() => { if (queue.length && online()) kick(0); }, 30000);
    }
    load().then(() => { notify(); kick(500); });
  }

  return {
    wrap, flush, start, load, status, online,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    effects: () => queue.flatMap((i) => i.effects || []),
    pendingItems: () => queue.slice(),
    failedItems: () => failed.map((f) => ({ id: f.id, what: describe(f), error: f.error, at: f.at })),
    async retry(id) { await load(); const i = failed.findIndex((f) => f.id === id); if (i < 0) return; const [it] = failed.splice(i, 1); delete it.error; queue.push(it); await save(); notify(); kick(0); },
    async retryAll() { await load(); while (failed.length) { const it = failed.shift(); delete it.error; queue.push(it); } await save(); notify(); kick(0); },
    async discard(id) { await load(); failed = failed.filter((f) => f.id !== id); await save(); notify(); },
    // Sign-out, deleting the account, or a different person signing in: nothing from the old copy may be shown or sent.
    async clearAll() { queue = []; failed = []; idmap = {}; loaded = Promise.resolve(); await store.clear(); notify(); },
    // Remembers who the copy belongs to. Returns true when it belonged to someone else (and has been cleared).
    async rememberUser(id) {
      await load();
      const was = await store.get("user");
      if (was && was !== id) { queue = []; failed = []; idmap = {}; await store.clear(); await store.set("user", id); notify(); return true; }
      if (was !== id) await store.set("user", id);
      return false;
    },
    // The signed-in person and their profile, so the app can open offline.
    async saveSession(v) { await store.set("session", v); },
    async savedSession() { return (await store.get("session")) || null; },
    // A small set of photo thumbnails (data addresses) for viewing offline. The budget is a few megabytes at most; the oldest go first.
    async thumbPut(path, dataUrl, budget = 2 * 1024 * 1024) {
      const idx = (await store.get("th:index")) || [];
      const next = idx.filter((x) => x.path !== path); next.push({ path, size: dataUrl.length, at: now() });
      let total = next.reduce((n, x) => n + x.size, 0);
      while (total > budget && next.length > 1) { const old = next.shift(); total -= old.size; await store.del("th:" + old.path); }
      await store.set("th:" + path, dataUrl); await store.set("th:index", next);
    },
    async thumbs() { const idx = (await store.get("th:index")) || [], out = new Map(); for (const x of idx) { const v = await store.get("th:" + x.path); if (v) out.set(x.path, v); } return out; },
  };
}

// A small picture (about 100 px, a few KB) of a photo, for the offline set of thumbnails. Browser only.
export async function makeThumb(url, size = 96) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => res(i); i.onerror = rej; i.src = url; });
  const k = Math.min(1, size / Math.max(img.width, img.height)), c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.6);
}

// A stand-in for the Supabase library: answers from memory after a fixed delay, and records every request.
const LAT = () => (window.__LAT ?? 150);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
window.__calls = window.__calls || [];
const cardsP = fetch("/__cards.json").then((r) => r.json());
const table = async (name) => {
  if (name === "v_catalog_cards") return await cardsP;
  if (name === "feature_access") return [...(window.__PROFEAT ? [{ feature: "importLarge", all_tiers: false, tiers: ["pro"] }] : []), ...(window.__PRO ? [{ feature: "proTasting", all_tiers: false, tiers: ["pro"] }] : [])];
  if (name === "note_legend" && window.__LEGEND) return window.__LEGEND;
  if (name === "quiz_questions" && window.__QUIZ) return window.__QUIZ;
  if (name === "venue_wines" && window.__VENUE_ROWS) return window.__VENUE_ROWS;
  if (name === "producers" && window.__PRODUCERS) return window.__PRODUCERS;
  if (name === "geo_areas" && window.__AREAS) return window.__AREAS;
  if (name === "grapes" && window.__GRAPES) return window.__GRAPES;
  if (name === "venue_wines") { if (window.__VENUE_MISSING) throw 0; const c = await cardsP; return (window.__VENUE_N ? c.slice(0, window.__VENUE_N) : []).map((r, i) => ({ id: "vw" + i, wine_vintage_id: r.wine_vintage_id, producer: "", wine_name: "", vintage: "", source: "file" })); }
  if (name === "quiz_tags" && window.__QTAGS) return window.__QTAGS;
  if (name === "quiz_question_tags" && window.__QLINKS) return window.__QLINKS;
  if (name === "profiles") return [{ id: "u1", role: (window.__ROLE || "player"), tier: (window.__TIER || "default"), age_attested_at: "2026-10-01", consent_version: "2026-10-e" }];
  if ((name === "v_journal_entries" || name === "v_user_wine_state") && window.__EMPTY) return [];
  if (name === "v_journal_entries") { const c = await cardsP; return c.slice(0, 25).map((r, i) => ({ id: "j" + i, user_id: "u1", consumed_on: "2026-09-" + String(1 + (i % 28)).padStart(2, "0"), verdict: ["buy", "drink", "none", "respect", "no"][i % 5], origin: "manual", wine_vintage_id: r.wine_vintage_id || r.id, user_wine_id: null, is_outside_wine: false, producer: r.producer_name || r.producer, wine_name: r.wine_name || r.cuvee, vintage_year: 2020, style: r.style, country: r.country, region: r.region, grape: null, first_photo_path: null, created_at: "2026-09-01" })); }
  if (name === "v_user_wine_state" && window.__STATES) { const c = await cardsP; return window.__STATES.map((x) => ({ wine_vintage_id: c[x.i].wine_vintage_id || c[x.i].id, familiarity: x.f ?? null, interest: x.n ?? null, reaction: x.r ?? null, last_swiped_at: "2026-10-01T10:00:" + String(x.i).padStart(2, "0") + "Z" })); }
  if (name === "v_user_wine_state") { const c = await cardsP; return c.slice(0, 40).map((r) => ({ wine_vintage_id: r.wine_vintage_id || r.id, familiarity: "recognize", interest: "try", last_swiped_at: "2026-09-01" })); }
  return [];
};
function builder(name, opts) {
  const st = { single: false, head: false, name, insert: null };
  const p = new Proxy(function () {}, {
    get(_, k) {
      if (k === "then") return (res, rej) => {
        window.__calls.push({ t: Math.round(performance.now()), q: name });
        sleep(LAT()).then(async () => {
          if (window.__NOLEGEND && /^note_legend/.test(name)) return { data: null, error: { message: 'relation "' + name + '" does not exist', code: "42P01" } };
          if (st.insert && window.__REFUSE && name === "consumptions") return { data: null, error: { message: "Limit reached: you can add up to 100 wines every 24 hours.", hint: "import_limit" } };
          if (st.update && name === "venue_wines" && window.__VENUE_ROWS && st.eq && st.eq.id) { window.__VENUE_ROWS = window.__VENUE_ROWS.map((r) => (r.id === st.eq.id ? { ...r, ...st.update } : r)); return { data: [{ id: st.eq.id }], error: null }; }
          let rows = st.insert ? st.insert.map((r, i) => ({ id: name + "-" + Math.random().toString(36).slice(2, 8) })) : await table(name);
          if (st.ilike && Array.isArray(rows)) rows = rows.filter((r) => String(r[st.ilike[0]] || "").toLowerCase() === String(st.ilike[1]).replace(/\\(.)/g, "$1").toLowerCase());
          if (st.gte && Array.isArray(rows)) rows = rows.filter((r) => st.gte.every(([c, v]) => String(r[c] ?? "") >= v));
          if (st.lt && Array.isArray(rows)) rows = rows.filter((r) => st.lt.every(([c, v]) => String(r[c] ?? "") < v));
          const total = Array.isArray(rows) ? rows.length : 0;   // like the real database: the count is of every matching row, not one page
          if (st.range && Array.isArray(rows)) rows = rows.slice(st.range[0], st.range[1] + 1);
          if (name === "v_catalog_cards" && window.__CARD_MS_PER_ROW && Array.isArray(rows)) { await sleep(rows.length * window.__CARD_MS_PER_ROW); (window.__pieces = window.__pieces || []).push({ t: Math.round(performance.now()), n: rows.length }); }
          const data = st.single ? (rows[0] ?? null) : rows;
          return { data: st.head ? null : data, error: null, count: total };
        }).then(res, rej);
      };
      if (k === "insert") return (rows) => { st.insert = Array.isArray(rows) ? rows : [rows]; window.__writes = window.__writes || []; window.__writes.push({ table: name, rows: st.insert }); return p; };
      if (k === "upsert") return (rows) => { st.insert = Array.isArray(rows) ? rows : [rows]; window.__writes = window.__writes || []; window.__writes.push({ table: name, rows: st.insert, upsert: true }); return p; };
      if (k === "update") return (row) => { st.update = row; window.__writes = window.__writes || []; window.__writes.push({ table: name, rows: [row], update: true }); return p; };
      if (k === "eq") return (col, val) => { st.eq = st.eq || {}; st.eq[col] = val; return p; };
      if (k === "gte" || k === "lt") return (col, val) => { (st[k] = st[k] || []).push([col, val]); return p; };
      if (k === "range") return (a, b) => { st.range = [a, b]; return p; };
      if (k === "ilike") return (col, val) => { st.ilike = [col, val]; return p; };
      if (k === "single" || k === "maybeSingle") return () => { st.single = true; return p; };
      if (k === "select") return (cols, o) => { if (o && o.head) st.head = true; return p; };
      return () => p;
    },
  });
  return p;
}
export function createClient() {
  const user = { id: "u1", is_anonymous: true };
  return {
    auth: { getSession: async () => { window.__calls.push({ t: Math.round(performance.now()), q: "auth.getSession" }); await sleep(LAT()); return { data: { session: { user } } }; }, signInAnonymously: async () => ({ data: { session: { user } }, error: null }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    from: (n) => builder(n),
    rpc: async (n, args) => { window.__rpc = window.__rpc || []; window.__rpc.push({ n, args }); if (n === "my_import_allowance" && window.__ALLOW) { await sleep(LAT()); return { data: window.__ALLOW, error: null }; } window.__calls.push({ t: Math.round(performance.now()), q: "rpc " + n }); await sleep(LAT()); return { data: null, error: null }; },
    storage: { from: () => ({ createSignedUrls: async () => { window.__calls.push({ t: Math.round(performance.now()), q: "storage.sign" }); await sleep(LAT()); return { data: [], error: null }; }, getPublicUrl: (p) => ({ data: { publicUrl: "https://example.invalid/" + p } }) }) },
  };
}

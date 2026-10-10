// The photo finder, for the Owner (permission found_online_photos). In Editor, Photos:
//   Find photos  -> the Edge Function find-photos looks for bottle photos of wines that have none and saves them as PENDING candidates in a private bucket.
//   Review       -> each candidate is shown one at a time. Approve (it becomes a "Found online" photo of that wine, shrunk to a deck-sized picture),
//                   Skip (look at it later), or Reject with a reason (it is never suggested again for that wine).
// Nothing reaches players until it is approved. The rules at the top are pure (no browser, no network); the functions below talk to Supabase.
import * as db from "./data.js?v=24";
import { esc } from "./logic.js?v=11";

export const CANDIDATES = "photo-candidates";   // the private holding bucket
export const PUBLIC = "wine-images";            // where approved photos go
export const SIDE = 900;                        // the longest side of an approved photo, in pixels
export const REASONS = ["Wrong bottle", "Poor quality", "Not a bottle shot", "Other"];

// An approved found photo belongs to the whole wine, in a file named found-...; this tells such a photo from one saved for a single vintage.
export const isWineLevelFound = (card) => !!card && card.imageKind === "found_online" && /\/found-/.test(card.image || "");
// The first candidate that has not been skipped in this visit.
export const nextCandidate = (items, skipped = []) => (items || []).find((c) => !skipped.includes(c.id)) || null;
export const matchPercent = (c) => Math.round(Math.max(0, Math.min(1, Number(c && c.match_score) || 0)) * 100);
// Where an approved candidate's picture is saved: the wine's folder, "found-" and the candidate's own file name, always as a jpg.
export const approvedPath = (c) => `${c.wine_id}/found-${String(c.storage_path || "").split("/").pop().replace(/\.[a-z0-9]+$/i, "")}.jpg`;
export const stillNeeding = (cards) => (cards || []).filter((c) => !c.image && c.wineStatus === "verified" && !c.archived).length;
// A readable line for the result of a search.
export function summaryText(summary) {
  const list = summary || [];
  if (!list.length) return "No wines are waiting for a search (they all have a photo, or were searched in the last 30 days).";
  const found = list.reduce((n, s) => n + s.found, 0);
  return `Searched ${list.length} ${list.length === 1 ? "wine" : "wines"} and found ${found} ${found === 1 ? "photo" : "photos"}. ${list.map((s) => `${s.wine}: ${s.found}`).join("; ")}.`;
}

// ---------------------------------------------------------------- the screen
// F: { loaded, error, items, skipped, busy, running, msg }; cards: the catalog cards (to say how many wines still have no photo).
export function finderHtml(F, cards) {
  const need = stillNeeding(cards);
  const head = `<div class="ptitle">Find photos online</div>
    <p class="muted small">Searches free sources for bottle photos of wines that have none. Nothing is shown to players until you approve it. An approved photo is marked <b>Found online</b>, and any licensed or community photo replaces it later.</p>`;
  if (F.error) return `<div class="pcard">${head}<div class="err">${esc(F.error)}</div><button class="btn outline slim" data-editor="fnd:retry">Try again</button></div>`;
  if (!F.loaded) return `<div class="pcard">${head}<p class="muted small">Loading\u2026</p></div>`;
  const c = nextCandidate(F.items, F.skipped);
  const waiting = F.items.length;
  let card = "";
  if (c) {
    const busy = F.busy === c.id;
    card = `<div class="fndcard"><div class="serif">${esc(c.wine_label || "Wine")}</div>
      ${c.url ? `<img class="fndimg" src="${esc(c.url)}" alt="Candidate bottle photo">` : `<div class="fndimg empty">No preview</div>`}
      <div class="muted small">Source: ${esc(c.provider)}, match ${matchPercent(c)}%<br>Licence: ${esc(c.license || "unknown")}${c.source_page_url ? `<br><a href="${esc(c.source_page_url)}" target="_blank" rel="noopener">Open the source page</a>` : ""}</div>
      <div class="fndbtns"><button class="btn primary slim" data-editor="fnd:ok:${esc(c.id)}"${F.busy ? " disabled" : ""}>${busy ? "Saving\u2026" : "Approve"}</button>
        <button class="btn outline slim" data-editor="fnd:skip:${esc(c.id)}"${F.busy ? " disabled" : ""}>Skip</button></div>
      <div class="fndbtns"><select class="field fndwhy" data-fnd-why aria-label="Why reject it">${REASONS.map((r) => `<option>${esc(r)}</option>`).join("")}</select>
        <button class="btn danger slim" data-editor="fnd:no:${esc(c.id)}"${F.busy ? " disabled" : ""}>Reject</button></div></div>`;
  } else card = `<p class="muted small">${waiting ? "You have skipped everything that is waiting." : "Nothing is waiting for approval."}</p>`;
  return `<div class="pcard">${head}
    <div class="muted small">${waiting} waiting for approval. ${need} ${need === 1 ? "wine has" : "wines have"} no photo at all.</div>
    ${F.msg ? `<div class="notice">${esc(F.msg)}</div>` : ""}
    <button class="btn primary slim" data-editor="fnd:find"${F.running || F.busy ? " disabled" : ""}>${F.running ? "Searching\u2026 about a minute" : "Find photos for 6 wines"}</button>
    ${card}</div>`;
}

// ---------------------------------------------------------------- the database and the function
// Pending candidates, each with a temporary link to look at it.
export async function loadCandidates(sb) {
  const { data, error } = await sb.from("photo_candidates").select("*").eq("status", "pending").order("found_at", { ascending: true }).limit(50);
  if (error) throw error;
  let urls = new Map();
  if (data.length) {
    const r = await sb.storage.from(CANDIDATES).createSignedUrls(data.map((x) => x.storage_path), 3600);
    if (!r.error) urls = new Map(r.data.filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
  }
  return data.map((x) => ({ ...x, url: urls.get(x.storage_path) || null }));
}
export async function loadFinderState(sb) {
  try { return { loaded: true, error: "", items: await loadCandidates(sb) }; }
  catch (e) {
    const m = String((e && e.message) || e);
    return { loaded: false, error: /photo_candidates|relation|schema cache/i.test(m) ? "Database update 25 has not been run yet." : "Could not load: " + m, items: [] };
  }
}
// Runs the search (about a minute for 6 wines). Returns the function's summary, or throws with a message the Owner can act on.
export async function findPhotos(sb, limit = 6) {
  const { data, error } = await sb.functions.invoke("find-photos", { body: { limit } });
  if (error) {
    const m = String((error && error.message) || error);
    throw new Error(/not found|404|failed to send|fetch/i.test(m) ? "The find-photos function is not deployed yet (see the guide, step 2)." : m);
  }
  if (!data || !data.ok) throw new Error((data && data.error) || "The search did not answer.");
  return data.summary || [];
}
// Shrinks a picture to a deck-sized jpg on a white background (a transparent png would otherwise turn black).
export async function toWhiteJpeg(blob, side = SIDE) {
  const src = await createImageBitmap(blob);
  const scale = Math.min(1, side / Math.max(src.width, src.height));
  const w = Math.max(1, Math.round(src.width * scale)), h = Math.max(1, Math.round(src.height * scale));
  const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
  const g = canvas.getContext("2d"); g.fillStyle = "#ffffff"; g.fillRect(0, 0, w, h); g.drawImage(src, 0, 0, w, h);
  if (src.close) src.close();
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Could not read that picture."))), "image/jpeg", 0.82));
}
// Approve: the picture is shrunk and saved in the public bucket, the database records it as a "Found online" photo, and the private copy is removed.
export async function approveCandidate(sb, c, shrink = toWhiteJpeg) {
  const dl = await sb.storage.from(CANDIDATES).download(c.storage_path);
  if (dl.error) throw dl.error;
  const jpg = await shrink(dl.data);
  const dest = approvedPath(c);
  const up = await sb.storage.from(PUBLIC).upload(dest, jpg, { contentType: "image/jpeg", upsert: true });
  if (up.error) throw up.error;
  const r = await sb.rpc("approve_photo_candidate", { p_id: c.id, p_storage_path: dest });
  if (r.error) { await sb.storage.from(PUBLIC).remove([dest]); throw r.error; }
  try { await sb.storage.from(CANDIDATES).remove([c.storage_path]); } catch (_) { /* the private copy is harmless; it can be cleared later */ }
  return dest;
}
// Reject: remembered (so it is never suggested again for this wine), and the private picture is removed.
export async function rejectCandidate(sb, c, reason) {
  const { error } = await sb.from("photo_candidates").update({ status: "rejected", reject_reason: reason || "Other", reviewed_at: new Date().toISOString() }).eq("id", c.id);
  if (error) throw error;
  try { await sb.storage.from(CANDIDATES).remove([c.storage_path]); } catch (_) { /* harmless */ }
}

// Removing a wine's photo. A found photo belongs to the whole wine (every vintage shows it), so removing it removes it for all of them;
// any other photo is removed for its own vintage, as before.
export async function removePhotoFor(sb, card) {
  if (!isWineLevelFound(card)) return db.removeWinePhoto(sb, card.id);
  const v = await sb.from("wine_vintages").select("wine_id").eq("id", card.id).single();
  if (v.error) throw v.error;
  const rows = await sb.from("wine_images").select("id, storage_path").eq("wine_id", v.data.wine_id).is("wine_vintage_id", null);
  if (rows.error) throw rows.error;
  if (!rows.data.length) return;
  const del = await sb.from("wine_images").delete().in("id", rows.data.map((r) => r.id));
  if (del.error) throw del.error;
  try { await sb.storage.from(PUBLIC).remove(rows.data.map((r) => r.storage_path)); } catch (_) { /* the records are gone; a stray file is harmless */ }
}

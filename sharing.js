// Sharing journal photos with the community.
//   Players: on the rating window, photos of CATALOG wines can be offered to the community. Nothing is shared unless the person chooses it,
//            and they can take a photo back at any time.
//   Editors: offered photos wait in Editor, Photos. An editor approves one (it becomes a Community photo on the wine's card) or rejects it.
// The rules at the top are pure (no browser, no network). The functions that talk to Supabase go through data.js.
import { esc, photoCount, wineName } from "./logic.js?v=10";
import * as db from "./data.js?v=18";
import { photoTag } from "./winephotos.js?v=3";
import { infoLine } from "./wineline.js?v=1";

// ---------------------------------------------------------------- the rules
// private = not shared, submitted = waiting for an editor, approved = on the wine's card, rejected = an editor said no, removed = an editor took it down.
export const isLive = (status) => status === "submitted" || status === "approved";
export const canToggle = (status) => status === "private" || isLive(status);
// What a photo should do when the person taps Save, from where it stands (status) and what they chose (want).
export function pendingShareChanges(existing) {
  const share = [], unshare = [];
  for (const p of existing || []) {
    if (p.removed) continue;                                   // a removed photo is withdrawn when it is deleted
    if (p.want && p.status === "private") share.push(p.id);
    else if (!p.want && isLive(p.status)) unshare.push(p.id);
  }
  return { share, unshare };
}
// The small label under a photo.
export function chipLabel(p) {
  const s = p.status || "private";
  if (s === "rejected") return "Not used";
  if (s === "removed") return "Taken down";
  if (p.want && s === "private") return "Will be shared when you save";
  if (!p.want && isLive(s)) return "Will stop sharing when you save";
  if (s === "submitted") return "Shared, waiting for review";
  if (s === "approved") return "Shared";
  return "Share this photo";
}
// An editor approves a photo for a vintage. A licensed photo already on the card is kept: the player's photo is approved but not shown.
export const approvalPlan = (currentKind) => ({ replaces: currentKind !== "official" });
// Sharing is part of the consent page everyone accepts before using the app (consent.js), so there is no tick box here any more.
// Photos added to a wine in the catalog are offered to the editors automatically; a person can take any photo back with one tap.

// ---------------------------------------------------------------- the rating window (players)
const chipHtml = (p) => {
  const s = p.status || "private";
  const label = esc(chipLabel(p));
  if (!canToggle(s)) return `<div class="sharechip off">${label}</div>`;
  const on = !!p.want;
  return `<button class="sharechip${on ? " on" : ""}" data-sheet="sharephoto:${esc(p.id)}" aria-pressed="${on}">${label}</button>`;
};
// Replaces the plain photos block. Sharing is offered for catalog wines only.
export function sheetPhotosHtml(sheet) {
  const catalog = !!(sheet.target && sheet.target.kind === "catalog");
  const existing = sheet.photos.existing.map((p) => `<div class="phwrap"><div class="ph${p.removed ? " gone" : ""}">${p.url ? `<img src="${esc(p.url)}" alt="Your photo">` : ""}<button class="phx" data-sheet="togglephoto:${p.id}" aria-label="${p.removed ? "Keep this photo" : "Remove this photo"}">${p.removed ? "↺" : "×"}</button></div>${catalog && !p.removed ? chipHtml(p) : ""}</div>`).join("");
  const queued = sheet.photos.queued.map((p) => `<div class="phwrap"><div class="ph"><img src="${esc(p.url)}" alt="New photo"><button class="phx" data-sheet="unqueue:${p.key}" aria-label="Remove this photo">×</button></div>${catalog ? `<div class="sharechip off">Shared after review</div>` : ""}</div>`).join("");
  const label = photoCount(sheet) ? "Add more photos" : "Add photos";
  return `<div class="phs">${existing}${queued}</div>
    <label class="pill addph">${label}<input type="file" accept="image/*" multiple hidden data-photo="sheet"></label>`;
}
// Carries out what the person chose for photos they already had. Returns the ones that failed, so Save can report them.
export async function applyShareChanges(sb, existing) {
  const { share, unshare } = pendingShareChanges(existing);
  const failed = [];
  for (const id of unshare) {
    const p = existing.find((x) => x.id === id);
    try { await db.unshareMyPhoto(sb, id); p.status = "private"; } catch (e) { failed.push({ photo: p, message: e.message || String(e) }); }
  }
  for (const id of share) {
    const p = existing.find((x) => x.id === id);
    try { await db.shareMyPhoto(sb, id); p.status = "submitted"; } catch (e) { failed.push({ photo: p, message: e.message || String(e) }); }
  }
  return failed;
}

// ---------------------------------------------------------------- the review queue (editors)
// S: { loaded, error, items: [{ id, wine_vintage_id, url }], busy, msg }. cards: the catalog cards.
export function communityHtml(S, cards) {
  const head = `<div class="ptitle">Community photos${S.loaded && S.items.length ? ` (${S.items.length})` : ""}</div>`;
  if (S.error) return `<div class="pcard">${head}<div class="err">${esc(S.error)}</div><button class="btn outline slim" data-editor="subretry">Try again</button></div>`;
  if (!S.loaded) return `<div class="pcard">${head}<p class="muted small">Loading…</p></div>`;
  const byId = new Map((cards || []).map((c) => [c.id, c]));
  const rows = S.items.map((it) => {
    const c = byId.get(it.wine_vintage_id);
    const plan = c ? approvalPlan(c.imageKind) : { replaces: true };
    const now = !c ? "" : c.image ? `Now on the card: ${esc(photoTag(c) || "a photo")}.` : "The card has no photo yet.";
    const what = plan.replaces ? "Approving puts it on the card." : "A licensed photo is on the card, so approving keeps that one and stores this.";
    const busy = S.busy === it.id;
    return `<div class="candrow subrow">${it.url ? `<img class="subthumb" src="${esc(it.url)}" alt="Offered photo">` : `<div class="subthumb empty"></div>`}
      <div class="candinfo"><div class="serif">${c ? esc(wineName(c)) : "A wine that is no longer listed"}</div>${c && infoLine(c) ? `<div class="meta">${esc(infoLine(c))}</div>` : ""}<div class="muted tiny">${now} ${what}</div></div>
      <div class="candbtns"><button class="btn primary slim" data-editor="subok:${esc(it.id)}"${S.busy ? " disabled" : ""}>${busy ? "Saving…" : "Approve"}</button><button class="btn outline slim" data-editor="subno:${esc(it.id)}"${S.busy ? " disabled" : ""}>Reject</button></div></div>`;
  }).join("");
  return `<div class="pcard">${head}${S.msg ? `<div class="notice">${esc(S.msg)}</div>` : ""}
    <p class="muted small">Photos players chose to share from their journal. You see the picture and the wine only: no name, email or notes. Reject anything that shows a person, a place, or something that is not the bottle.</p>
    ${rows || `<p class="muted small">No photos waiting.</p>`}</div>`;
}
export async function loadSubmissionState(sb) {
  try { return { loaded: true, error: "", items: await db.loadSubmissions(sb) }; }
  catch (e) {
    const m = String((e && e.message) || e);
    return { loaded: false, error: /list_photo_submissions|function|schema cache/i.test(m) ? "Database update 18 has not been run yet." : "Could not load: " + m, items: [] };
  }
}



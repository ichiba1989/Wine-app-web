// Bottle photos on the Discover cards: what an editor needs to add them quickly from a phone.
// The rules here (what counts as missing, what the choices are) are pure, so they can be tested on their own.
// The upload step shrinks the picture in the browser first, then saves it through data.js.
import { shrinkImage } from "./photos.js?v=5";
import * as db from "./data.js?v=22";
import { looseKey } from "./catalog.js?v=2";

// Bottle photos are saved at about 900 px on the longest side: sharp on a phone card, small to download.
export const DECK_PHOTO_SIDE = 900;
// Where the picture came from. The ids match the database's image kinds.
// "Community" is the database's verified_user kind: a photo a player chose to share from their journal and an editor approved.
// It cannot be picked by hand: it only arrives through the review queue (see sharing.js).
// "Found online" is for pictures taken from the web without a licence. Only the owner can use it (permission found_online_photos),
// and it is the lowest priority: a licensed or community photo replaces it everywhere.
export const FOUND_ONLINE_PERMISSION = "found_online_photos";
export const PHOTO_KINDS = [
  { id: "official", label: "Licensed or official", note: "Licensed or official image" },
  { id: "verified_user", label: "Community photo", auto: true, note: "Shared by a player and approved by an editor" },
  { id: "own_photography", label: "I took them", note: "Photographed by an editor" },
  { id: "producer", label: "Producer or distributor", note: "Provided by the producer or distributor, with permission" },
  { id: "found_online", label: "Found online", ownerOnly: true, note: "Found online and not licensed. Replace it when a licensed or community photo is available" },
];
// The kinds this person may choose from.
export const visibleKinds = (can) => PHOTO_KINDS.filter((k) => !k.auto && (!k.ownerOnly || (can && can(FOUND_ONLINE_PERMISSION))));
// Lower number = preferred. Licensed and community photos come first, found-online ones last.
export const KIND_RANK = { official: 0, verified_user: 0, own_photography: 1, producer: 2, found_online: 3 };
export const rankOf = (k) => (k in KIND_RANK ? KIND_RANK[k] : 9);
export const KIND_SHORT = { official: "Licensed", verified_user: "Community", own_photography: "Own photo", producer: "Producer", found_online: "Found online" };
export const kindNote = (id) => (PHOTO_KINDS.find((k) => k.id === id) || PHOTO_KINDS[0]).note;
export const isKind = (id) => PHOTO_KINDS.some((k) => k.id === id);

// Wines that can have a photo: not archived (an older vintage that a newer one replaced) and not retired.
export const photoCandidates = (cards) => (cards || []).filter((c) => !c.archived && c.wineStatus !== "retired");
export function photoSummary(cards) {
  const list = photoCandidates(cards);
  const withPhoto = list.filter((c) => !!c.image).length;
  return { total: list.length, withPhoto, without: list.length - withPhoto, found: list.filter((c) => c.imageKind === "found_online").length, pct: list.length ? Math.round((withPhoto / list.length) * 100) : 0 };
}
const fold = (s) => String(s == null ? "" : s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
// filter: 'needs' | 'has' | 'found' | 'all'. Needing a photo first, then by name; the search looks at producer, wine name, vintage and place.
export function photoList(cards, { filter = "needs", query = "" } = {}) {
  const q = fold(query).trim();
  const hay = (c) => fold([c.producer, c.cuvee, c.vintage, c.appellation, c.region, c.country].filter(Boolean).join(" "));
  return photoCandidates(cards)
    .filter((c) => (filter === "needs" ? !c.image : filter === "has" ? !!c.image : filter === "found" ? c.imageKind === "found_online" : true))
    .filter((c) => !q || q.split(/\s+/).every((w) => hay(c).includes(w)))
    .sort((a, b) => (a.image ? 1 : 0) - (b.image ? 1 : 0) || fold(a.producer).localeCompare(fold(b.producer)) || String(b.vintage).localeCompare(String(a.vintage)));
}

// Shrinks the picture and saves it as the wine's photo (replacing any photo it had). Returns the new storage path.
export async function uploadWinePhoto(sb, wineVintageId, file, kind = "own_photography") {
  if (!file) throw new Error("Choose a picture first.");
  if (file.type && !file.type.startsWith("image/")) throw new Error("That file is not a picture.");
  const shrunk = await shrinkImage(file, DECK_PHOTO_SIDE);   // throws "Could not read that picture." when it is not one
  try { return await db.saveWinePhoto(sb, wineVintageId, shrunk.blob, isKind(kind) ? kind : "own_photography", kindNote(kind)); }
  finally { try { URL.revokeObjectURL(shrunk.url); } catch (_) {} }
}
export const removeWinePhoto = (sb, wineVintageId) => db.removeWinePhoto(sb, wineVintageId);
// Borrows the photo of another vintage of the same wine. The file is copied, so each vintage can be changed on its own.
export const CARRIED = "Carried over";
export const reuseWinePhoto = (sb, fromVintageId, toVintageId, fromVintage, opts) =>
  db.reuseWinePhoto(sb, fromVintageId, toVintageId, `${CARRIED} from the ${fromVintage || "earlier"} vintage of this wine`, opts);

// ---------------------------------------------------------------- one photo for every vintage of a wine
// The rule: a photo saved for one vintage is copied to the other vintages of the same wine (same producer, wine name, type and grapes)
// unless they already have a photo of their own. A vintage's own photo is never replaced, with two exceptions that keep the best photo
// in front: a copy that was carried over is refreshed when a photo of the same or better rank is saved, and a "found online" photo is
// replaced by anything better. Replacing the photo of one vintage later never changes the others, because each holds its own file.
export const isCarried = (c) => !!c && !!c.imageNote && String(c.imageNote).startsWith(CARRIED);
const sameWine = (a, b) => looseKey({ producer: a.producer, cuvee: a.cuvee, style: a.style, grapes: a.grapes }) === looseKey({ producer: b.producer, cuvee: b.cuvee, style: b.style, grapes: b.grapes });
// Which other vintages should receive this photo. kind is the kind of the photo just saved.
export function shareTargets(cards, source, kind, canFound = false) {
  if (!source || (kind === "found_online" && !canFound)) return [];
  const newRank = rankOf(kind);
  return photoCandidates(cards).filter((t) => t.id !== source.id && sameWine(t, source)).filter((t) => {
    if (!t.image) return true;
    const cur = rankOf(t.imageKind);
    if (isCarried(t)) return newRank <= cur;
    if (t.imageKind === "found_online") return newRank < cur;
    return false;
  });
}
// Where a vintage with no photo can borrow one from: the best-ranked photo of the same wine, then the most recent vintage.
// Archived older vintages count. A found-online photo is only offered to the owner.
export function pullSource(cards, card, canFound = false) {
  if (!card || card.image) return null;
  const year = (c) => (/^\d{4}$/.test(String(c.vintage || "")) ? Number(c.vintage) : 0);
  const from = (cards || [])
    .filter((c) => c.id !== card.id && c.image && c.wineStatus !== "retired" && sameWine(c, card) && (c.imageKind !== "found_online" || canFound))
    .sort((a, b) => rankOf(a.imageKind) - rankOf(b.imageKind) || year(b) - year(a) || String(a.id).localeCompare(String(b.id)))[0];
  return from ? { id: from.id, vintage: from.vintage || "", kind: from.imageKind || null } : null;
}
// Copies the photo just saved on `sourceId` to the vintages that should have it. Never throws: it reports what was done and what failed.
export async function shareWinePhoto(sb, cards, sourceId, kind, { canFound = false } = {}) {
  const source = (cards || []).find((c) => c.id === sourceId);
  const out = { done: [], failed: [] };
  for (const t of shareTargets(cards, source, kind, canFound)) {
    try { await reuseWinePhoto(sb, sourceId, t.id, source.vintage, { replace: !!t.image }); out.done.push(t); }
    catch (e) { out.failed.push({ card: t, message: (e && e.message) || String(e) }); }
  }
  return out;
}
// "Also used for the 2021 and 2023 vintages." (empty when none)
export function shareNote(done) {
  const v = done.map((c) => c.vintage || "NV");
  if (!v.length) return "";
  return ` Also used for the ${v.length === 1 ? v[0] : v.slice(0, -1).join(", ") + " and " + v[v.length - 1]} ${v.length === 1 ? "vintage" : "vintages"}.`;
}
// The small line under a wine in the Photos list: where its photo came from.
export function photoTag(card) {
  if (!card || !card.image) return "";
  const kind = KIND_SHORT[card.imageKind] || "";
  if (!isCarried(card)) return kind;
  const m = /from the (\S+) vintage/.exec(card.imageNote || "");
  return (kind ? kind + ", " : "") + "carried over" + (m ? " from " + m[1] : "");
}

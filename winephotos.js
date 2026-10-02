// Bottle photos on the Discover cards: what an editor needs to add them quickly from a phone.
// The rules here (what counts as missing, what the choices are) are pure, so they can be tested on their own.
// The upload step shrinks the picture in the browser first, then saves it through data.js.
import { shrinkImage } from "./photos.js?v=5";
import * as db from "./data.js?v=13";

// Bottle photos are saved at about 900 px on the longest side: sharp on a phone card, small to download.
export const DECK_PHOTO_SIDE = 900;
// Where the picture came from. These match the database's image kinds.
export const PHOTO_KINDS = [
  { id: "own_photography", label: "I took them", note: "Photographed by an editor" },
  { id: "producer", label: "Producer or distributor", note: "Provided by the producer or distributor, with permission" },
  { id: "official", label: "Licensed or official", note: "Licensed or official image" },
];
export const kindNote = (id) => (PHOTO_KINDS.find((k) => k.id === id) || PHOTO_KINDS[0]).note;
export const isKind = (id) => PHOTO_KINDS.some((k) => k.id === id);

// Wines that can have a photo: not archived (an older vintage that a newer one replaced) and not retired.
export const photoCandidates = (cards) => (cards || []).filter((c) => !c.archived && c.wineStatus !== "retired");
export function photoSummary(cards) {
  const list = photoCandidates(cards);
  const withPhoto = list.filter((c) => !!c.image).length;
  return { total: list.length, withPhoto, without: list.length - withPhoto, pct: list.length ? Math.round((withPhoto / list.length) * 100) : 0 };
}
const fold = (s) => String(s == null ? "" : s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
// filter: 'needs' | 'has' | 'all'. Needing a photo first, then by name; the search looks at producer, wine name, vintage and place.
export function photoList(cards, { filter = "needs", query = "" } = {}) {
  const q = fold(query).trim();
  const hay = (c) => fold([c.producer, c.cuvee, c.vintage, c.appellation, c.region, c.country].filter(Boolean).join(" "));
  return photoCandidates(cards)
    .filter((c) => (filter === "needs" ? !c.image : filter === "has" ? !!c.image : true))
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

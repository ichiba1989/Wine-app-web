// Pictures: shrink a photo in the browser before uploading it. Photos are never stored at full size.
export const BUCKET = "journal-photos";   // the private Storage bucket
export const MAX_SIDE = 1280;             // longest side, in pixels
export const QUALITY = 0.82;

export function fitSize(w, h, max = MAX_SIDE) {
  const scale = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

async function decode(file) {
  try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch (_) { /* older browsers */ }
  const url = URL.createObjectURL(file);
  try { const img = new Image(); img.src = url; await img.decode(); return img; } finally { URL.revokeObjectURL(url); }
}

const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

// Returns { key, blob, url }: a JPEG no larger than MAX_SIDE on its longest side, plus a preview URL.
export async function shrinkImage(file, maxSide = MAX_SIDE) {
  let src;
  try { src = await decode(file); } catch (_) { throw new Error("Could not read that picture."); }
  const { w, h } = fitSize(src.width || src.naturalWidth, src.height || src.naturalHeight, maxSide);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  canvas.getContext("2d").drawImage(src, 0, 0, w, h);
  if (src.close) src.close();
  const blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Could not read that picture."))), "image/jpeg", QUALITY));
  return { key: newKey(), blob, url: URL.createObjectURL(blob) };
}

// Personal photos live under a folder named for the user id: <user id>/<file>.jpg
export const newPhotoPath = (userId) => `${userId}/${newKey()}.jpg`;

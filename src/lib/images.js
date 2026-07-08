// Card photos: downscale + compress before storing so the database stays small
// (important on iOS where browser storage is quota- and eviction-prone).
const MAX_SIDE = 1024;
const MAX_BYTES = 300 * 1024;

export async function fileToCompressedDataUrl(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  // Walk quality down until the image fits under the per-image byte cap.
  for (const quality of [0.82, 0.65, 0.5, 0.35, 0.2]) {
    const url = canvas.toDataURL('image/jpeg', quality);
    if (url.length * 0.75 <= MAX_BYTES) return url;
  }
  throw new Error('image too large even after compression');
}

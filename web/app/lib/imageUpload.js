// Shrinks a photo the owner picks to a small WebP data URL, so it fits in the
// device's storage until the backend's file store exists.

const MAX_SIDE = 600;
const QUALITY = 0.82;
const MAX_INPUT_BYTES = 12 * 1024 * 1024;
const ACCEPTED = /^image\/(jpeg|png|webp|avif)$/;

/** @param {File} file @returns {Promise<string>} */
export async function photoToDataUrl(file) {
  if (!ACCEPTED.test(file.type)) throw new Error("Use a JPEG, PNG or WebP photo.");
  if (file.size > MAX_INPUT_BYTES) throw new Error("That photo is too large. Use one under 12 MB.");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/webp", QUALITY);
}

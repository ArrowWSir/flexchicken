// Where the food actually is inside a dish image, so the table can size every
// dish to its plate the same way, whatever the photo's framing. Measured in
// the browser from the image's transparency, which also covers photos the
// owner uploads later.

/** Bounds as fractions of the image: { left, right, top, bottom }. */
export const DEFAULT_FIT = Object.freeze({ left: 0.07, right: 0.93, top: 0.12, bottom: 0.92 });

const SAMPLE = 128; // px: plenty to find the edges, cheap to scan
const SOLID = 24; // alpha above this counts as food, not a soft fringe
const cache = new Map();

/**
 * Bounding box of the non-transparent pixels in RGBA data, as fractions.
 * Returns null for a fully transparent image.
 */
export function alphaBounds(data, width, height, threshold = SOLID) {
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] <= threshold) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  if (right < 0) return null;
  return { left: left / width, right: (right + 1) / width, top: top / height, bottom: (bottom + 1) / height };
}

/** Measures once per image source; later calls share the same promise. */
export function measureDish(src) {
  if (!cache.has(src)) {
    cache.set(
      src,
      (async () => {
        try {
          const img = new Image();
          img.src = src;
          await img.decode();
          const canvas = document.createElement("canvas");
          canvas.width = SAMPLE;
          canvas.height = SAMPLE;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          ctx.drawImage(img, 0, 0, SAMPLE, SAMPLE);
          return alphaBounds(ctx.getImageData(0, 0, SAMPLE, SAMPLE).data, SAMPLE, SAMPLE) ?? DEFAULT_FIT;
        } catch {
          // Unreadable image: fall back to the spec framing rather than hide the dish.
          return DEFAULT_FIT;
        }
      })()
    );
  }
  return cache.get(src);
}

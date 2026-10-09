// The scroll backdrop on the customer pages: a plate of wings that empties as
// the visitor scrolls down and fills again as they scroll back. The frames are
// built by scripts/build-backdrop.py. Pure functions; the drawing lives in
// components/PlateBackdrop.js.

/** Which frame belongs to this scroll position: top = first, bottom = last. */
export function frameAt(scrollY, scrollMax, count) {
  if (count < 1 || scrollMax <= 0) return 0;
  const progress = Math.min(1, Math.max(0, scrollY / scrollMax));
  return Math.round(progress * (count - 1));
}

/**
 * The scroll position where the plate is empty: the moment the footer's top
 * edge enters the screen (`footerTop` in page coordinates, null if none).
 * A short page whose footer already shows uses its whole scroll instead.
 */
export function scrollEnd({ scrollHeight, viewHeight, footerTop }) {
  const bottom = Math.max(0, scrollHeight - viewHeight);
  if (footerTop == null) return bottom;
  const atFooter = footerTop - viewHeight;
  return atFooter > 0 ? Math.min(atFooter, bottom) : bottom;
}

/**
 * Fits a portrait frame to the screen height, centred. On a phone the sides
 * are cut a little so the plate stays big; on a wide screen it is a column.
 */
export function fitByHeight(viewWidth, viewHeight, frameWidth, frameHeight) {
  const width = frameWidth * (viewHeight / frameHeight);
  return { x: (viewWidth - width) / 2, y: 0, width, height: viewHeight, isNarrower: width < viewWidth };
}

/** Load order: the first frame, then every 8th, 4th, 2nd, then the rest. */
export function loadOrder(count) {
  const order = [];
  const seen = new Set();
  for (const step of [8, 4, 2, 1]) {
    for (let i = 0; i < count; i += step) {
      if (!seen.has(i)) {
        seen.add(i);
        order.push(i);
      }
    }
  }
  return order;
}

/** The closest frame to `target` that has loaded, or -1 if none has. */
export function nearestLoaded(target, loaded) {
  for (let d = 0; d < loaded.length; d += 1) {
    if (loaded[target - d]) return target - d;
    if (loaded[target + d]) return target + d;
  }
  return -1;
}

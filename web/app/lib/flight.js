// The "Add to Box" flight: a dish lifts off its plate and arcs into the Box
// button. Pure maths here (tested); FlyToBox plays it with the Web Animations
// API so nothing re-renders while it flies.

export const FLIGHT_MS = 720;
const STEPS = 16;
const LIFT_UNTIL = 0.15; // first 15%: the dish rises off the plate
const LIFT_SCALE = 1.08;
const FADE_FROM = 0.82; // last stretch: it drops into the Box
const TILT_DEG = -12;
const MIN_ARC_PX = 60;
const MIN_END_SCALE = 0.08;

const centre = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const round = (n) => Math.round(n * 100) / 100;

/** Point on a quadratic Bézier from p0 to p2, bent towards p1. */
export function bezier(p0, p1, p2, t) {
  const u = 1 - t;
  return { x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x, y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y };
}

/**
 * Keyframes that carry an element sitting at `from` (a DOMRect-like
 * { left, top, width, height }) into the middle of `to`, on an arc that
 * rises a little above the target before dropping in.
 * @returns {{ offset: number, transform: string, opacity: number }[]}
 */
export function flightKeyframes(from, to) {
  const start = centre(from);
  const end = centre(to);
  const arc = Math.max(MIN_ARC_PX, Math.abs(end.y - start.y) * 0.25);
  const bend = { x: lerp(start.x, end.x, 0.1), y: Math.max(4, Math.min(start.y, end.y) - arc) };
  const endScale = Math.min(1, Math.max(MIN_END_SCALE, (to.height * 0.9) / Math.max(1, from.height)));

  return Array.from({ length: STEPS + 1 }, (_, i) => {
    const t = i / STEPS;
    const point = bezier(start, bend, end, easeInOut(t));
    const scale =
      t <= LIFT_UNTIL ? lerp(1, LIFT_SCALE, t / LIFT_UNTIL) : lerp(LIFT_SCALE, endScale, ((t - LIFT_UNTIL) / (1 - LIFT_UNTIL)) ** 1.2);
    const opacity = t <= FADE_FROM ? 1 : lerp(1, 0, (t - FADE_FROM) / (1 - FADE_FROM));
    return {
      offset: round(t),
      transform: `translate(${round(point.x - start.x)}px, ${round(point.y - start.y)}px) rotate(${round(TILT_DEG * t)}deg) scale(${round(scale)})`,
      opacity: round(opacity),
    };
  });
}

/** The Box button's landing bounce. */
export const BOUNCE_KEYFRAMES = [
  { transform: "scale(1)" },
  { transform: "scale(1.16)", offset: 0.35 },
  { transform: "scale(0.94)", offset: 0.7 },
  { transform: "scale(1)" },
];

/** Is any of this rect on screen? */
export function isOnScreen(rect, viewport) {
  return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < viewport.height && rect.left < viewport.width;
}

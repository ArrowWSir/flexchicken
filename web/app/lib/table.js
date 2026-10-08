// Ring maths for the turning table (components/stage/TableStage.js).
//
// The table has SLOTS places round its edge. A category with fewer dishes
// spreads them evenly; one with more keeps the same spacing and lets the dishes
// furthest round wait, unseen, at the back of the table.

export const SLOTS = 7;
// How far past the last visible slot a dish takes to fade, in dishes.
const FADE_WIDTH = 0.6;

/** Degrees between neighbouring plates. */
export function slotStep(count) {
  return 360 / Math.min(Math.max(count, 1), SLOTS);
}

/**
 * Where dish `index` sits relative to the front, in dishes, the shorter way
 * round: 0 = at the front, +1 = next one round, -1 = the one before.
 * `position` may be fractional while the table turns.
 */
export function ringOffset(index, position, count) {
  if (count < 1) return 0;
  const raw = (index - position) % count;
  const wrapped = ((raw % count) + count) % count; // 0 .. count
  return wrapped >= count / 2 ? wrapped - count : wrapped;
}

/** 1 = fully shown, 0 = hidden at the back. */
export function ringVisibility(offset, count) {
  if (count <= SLOTS) return 1;
  const limit = SLOTS / 2;
  return Math.min(1, Math.max(0, (limit + FADE_WIDTH / 2 - Math.abs(offset)) / FADE_WIDTH));
}

/**
 * How much a dish is the selected one, from its ring offset: 1 at the front,
 * 0 from one dish away, eased (smoothstep) so focus passes smoothly from one
 * plate to the next as the table turns.
 */
export function ringFocus(offset) {
  const t = Math.max(0, 1 - Math.abs(offset));
  return t * t * (3 - 2 * t);
}

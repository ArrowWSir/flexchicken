import { describe, expect, test } from "vitest";
import { alphaBounds, isPlated } from "./dishFit";

// A width x height RGBA buffer with the given pixels opaque.
function image(width, height, solid = []) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (const [x, y, alpha = 255] of solid) data[(y * width + x) * 4 + 3] = alpha;
  return data;
}

describe("alphaBounds", () => {
  test("finds the box around the opaque pixels, as fractions", () => {
    const data = image(10, 10, [
      [2, 3],
      [7, 8],
    ]);
    expect(alphaBounds(data, 10, 10)).toEqual({ left: 0.2, right: 0.8, top: 0.3, bottom: 0.9 });
  });

  test("ignores a faint fringe below the threshold", () => {
    const data = image(10, 10, [
      [5, 5],
      [0, 0, 10],
    ]);
    expect(alphaBounds(data, 10, 10)).toEqual({ left: 0.5, right: 0.6, top: 0.5, bottom: 0.6 });
  });

  test("an opaque photo fills the whole frame", () => {
    const solid = [];
    for (let y = 0; y < 4; y += 1) for (let x = 0; x < 4; x += 1) solid.push([x, y]);
    expect(alphaBounds(image(4, 4, solid), 4, 4)).toEqual({ left: 0, right: 1, top: 0, bottom: 1 });
  });

  test("returns null when nothing is there", () => {
    expect(alphaBounds(image(4, 4), 4, 4)).toBeNull();
  });
});

describe("isPlated", () => {
  test("knows a picture drawn on the plate by its folder", () => {
    expect(isPlated("/menu/plated/4-spicy-wings.webp")).toBe(true);
  });

  test("a plain photo, an upload or no picture is not drawn on the plate", () => {
    expect(isPlated("/menu/chicken-fillet-burger.webp")).toBe(false);
    expect(isPlated("data:image/webp;base64,AAAA")).toBe(false);
    expect(isPlated(null)).toBe(false);
  });
});

import { describe, expect, test } from "vitest";
import { bezier, flightKeyframes, isOnScreen } from "./flight";

const dish = { left: 100, top: 400, width: 200, height: 200 }; // centre 200, 500
const box = { left: 300, top: 20, width: 80, height: 40 }; // centre 340, 40

const parse = (frame) => {
  const [, x, y, deg, scale] = frame.transform.match(/translate\((-?[\d.]+)px, (-?[\d.]+)px\) rotate\((-?[\d.]+)deg\) scale\(([\d.]+)\)/);
  return { x: Number(x), y: Number(y), deg: Number(deg), scale: Number(scale) };
};

describe("flightKeyframes", () => {
  const frames = flightKeyframes(dish, box);

  test("starts where the dish is and ends in the middle of the Box", () => {
    expect(parse(frames[0])).toEqual({ x: 0, y: 0, deg: 0, scale: 1 });
    const last = parse(frames.at(-1));
    expect(last.x).toBeCloseTo(140);
    expect(last.y).toBeCloseTo(-460);
    expect(frames[0].offset).toBe(0);
    expect(frames.at(-1).offset).toBe(1);
  });

  test("lifts first, then shrinks to the size of the Box", () => {
    expect(Math.max(...frames.map((f) => parse(f).scale))).toBeGreaterThan(1);
    expect(parse(frames.at(-1)).scale).toBeCloseTo(0.18); // 40 * 0.9 / 200
  });

  test("rises above the Box before dropping in", () => {
    const highest = Math.min(...frames.map((f) => parse(f).y));
    expect(highest).toBeLessThan(-460);
  });

  test("stays solid most of the way, then fades as it lands", () => {
    expect(frames.filter((f) => f.offset <= 0.8).every((f) => f.opacity === 1)).toBe(true);
    expect(frames.at(-1).opacity).toBe(0);
  });

  test("never shrinks to nothing, even from a huge dish to a tiny target", () => {
    const tiny = flightKeyframes({ left: 0, top: 0, width: 2000, height: 2000 }, { left: 0, top: 0, width: 4, height: 4 });
    expect(parse(tiny.at(-1)).scale).toBeCloseTo(0.08);
  });
});

test("bezier passes through both ends", () => {
  const a = { x: 0, y: 0 };
  const c = { x: 10, y: 10 };
  expect(bezier(a, { x: 5, y: -20 }, c, 0)).toEqual(a);
  expect(bezier(a, { x: 5, y: -20 }, c, 1)).toEqual(c);
});

test("isOnScreen", () => {
  const viewport = { width: 400, height: 800 };
  expect(isOnScreen({ left: 10, top: 10, right: 50, bottom: 50, width: 40, height: 40 }, viewport)).toBe(true);
  expect(isOnScreen({ left: 10, top: 900, right: 50, bottom: 940, width: 40, height: 40 }, viewport)).toBe(false);
  expect(isOnScreen({ left: 10, top: 10, right: 10, bottom: 10, width: 0, height: 0 }, viewport)).toBe(false);
});

import { describe, expect, test } from "vitest";
import { fitByHeight, frameAt, loadOrder, nearestLoaded, scrollEnd } from "./backdrop";

describe("frameAt", () => {
  test("the top of the page is the first frame, the bottom the last", () => {
    expect(frameAt(0, 2000, 120)).toBe(0);
    expect(frameAt(2000, 2000, 120)).toBe(119);
    expect(frameAt(1000, 2000, 120)).toBe(60);
  });

  test("scrolling back goes back through the same frames", () => {
    const down = [0, 500, 1000, 1500].map((y) => frameAt(y, 2000, 120));
    const up = [1500, 1000, 500, 0].map((y) => frameAt(y, 2000, 120));
    expect(up).toEqual([...down].reverse());
  });

  test("overscroll and a page that cannot scroll stay in range", () => {
    expect(frameAt(-80, 2000, 120)).toBe(0);
    expect(frameAt(2300, 2000, 120)).toBe(119);
    expect(frameAt(0, 0, 120)).toBe(0);
  });
});

describe("scrollEnd", () => {
  test("the plate is empty the moment the footer's top edge enters the screen", () => {
    expect(scrollEnd({ scrollHeight: 4000, viewHeight: 800, footerTop: 3300 })).toBe(2500);
  });

  test("without a footer, the bottom of the page", () => {
    expect(scrollEnd({ scrollHeight: 4000, viewHeight: 800, footerTop: null })).toBe(3200);
  });

  test("a short page whose footer shows at once still plays over its whole scroll", () => {
    expect(scrollEnd({ scrollHeight: 1200, viewHeight: 800, footerTop: 700 })).toBe(400);
  });

  test("never past the bottom, never negative", () => {
    expect(scrollEnd({ scrollHeight: 4000, viewHeight: 800, footerTop: 9000 })).toBe(3200);
    expect(scrollEnd({ scrollHeight: 600, viewHeight: 800, footerTop: null })).toBe(0);
  });
});

describe("fitByHeight", () => {
  test("on a phone the frame fills the height and is cut evenly at the sides", () => {
    const rect = fitByHeight(390, 844, 540, 960);
    expect(rect.height).toBe(844);
    expect(rect.width).toBeCloseTo(474.75);
    expect(rect.x).toBeCloseTo((390 - 474.75) / 2);
    expect(rect.isNarrower).toBe(false);
  });

  test("on a wide screen it is a centred column", () => {
    const rect = fitByHeight(1440, 900, 540, 960);
    expect(rect.x).toBeCloseTo((1440 - 506.25) / 2);
    expect(rect.isNarrower).toBe(true);
  });
});

describe("loadOrder", () => {
  test("starts with the first frame, then coarse to fine, each frame once", () => {
    const order = loadOrder(17);
    expect(order[0]).toBe(0);
    expect(order.slice(0, 3)).toEqual([0, 8, 16]);
    expect([...order].sort((a, b) => a - b)).toEqual(Array.from({ length: 17 }, (_, i) => i));
  });
});

describe("nearestLoaded", () => {
  test("shows the closest frame that has arrived", () => {
    const loaded = [true, false, false, false, true];
    expect(nearestLoaded(1, loaded)).toBe(0);
    expect(nearestLoaded(3, loaded)).toBe(4);
    expect(nearestLoaded(4, loaded)).toBe(4);
  });

  test("returns -1 while nothing has arrived", () => {
    expect(nearestLoaded(2, [false, false, false])).toBe(-1);
  });
});

import { describe, expect, test } from "vitest";
import { SLOTS, ringFocus, ringOffset, ringVisibility, slotStep } from "./table";

describe("slotStep", () => {
  test("spreads a small category evenly round the table", () => {
    expect(slotStep(1)).toBe(360);
    expect(slotStep(4)).toBe(90);
  });

  test("keeps plate spacing fixed once dishes outnumber the slots", () => {
    expect(slotStep(15)).toBe(360 / SLOTS);
    expect(slotStep(SLOTS)).toBe(360 / SLOTS);
  });
});

describe("ringOffset", () => {
  test("is zero for the dish at the front", () => {
    expect(ringOffset(3, 3, 10)).toBe(0);
  });

  test("counts round the shorter way", () => {
    expect(ringOffset(0, 9, 10)).toBe(1);
    expect(ringOffset(9, 0, 10)).toBe(-1);
  });

  test("works between dishes while the table turns", () => {
    expect(ringOffset(2, 1.5, 10)).toBeCloseTo(0.5);
  });

  test("stays within half the ring", () => {
    for (let i = 0; i < 9; i += 1) {
      const offset = ringOffset(i, 4.2, 9);
      expect(offset).toBeGreaterThanOrEqual(-4.5);
      expect(offset).toBeLessThan(4.5);
    }
  });
});

describe("ringVisibility", () => {
  test("every plate shows when there are no more dishes than slots", () => {
    expect(ringVisibility(1, 2)).toBe(1);
    expect(ringVisibility(3, 6)).toBe(1);
  });

  test("with more dishes than slots, the far ones wait unseen at the back", () => {
    expect(ringVisibility(0, 15)).toBe(1);
    expect(ringVisibility(3, 15)).toBe(1);
    expect(ringVisibility(6, 15)).toBe(0);
    const edge = ringVisibility(SLOTS / 2, 15);
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(1);
  });
});

describe("ringFocus", () => {
  test("is full for the dish at the front and none a whole dish away", () => {
    expect(ringFocus(0)).toBe(1);
    expect(ringFocus(1)).toBe(0);
    expect(ringFocus(-1)).toBe(0);
    expect(ringFocus(3)).toBe(0);
  });

  test("eases between, the same either way round", () => {
    expect(ringFocus(0.5)).toBeCloseTo(0.5);
    expect(ringFocus(-0.25)).toBe(ringFocus(0.25));
    expect(ringFocus(0.25)).toBeGreaterThan(0.75);
  });
});

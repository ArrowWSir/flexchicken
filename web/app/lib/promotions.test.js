import { describe, expect, test } from "vitest";
import { livePromotions, priceCart, promoBadge, promoSaving, promoStatus, readPromotions, validatePromo } from "./promotions";

const NOW = 1_760_000_000_000;
const HOUR = 3_600_000;
const line = (itemId, unitPence, qty, key = `${itemId}`) => ({ key, itemId, name: `#${itemId}`, unitPence, qty, choices: [] });
const cart = (...lines) => ({ lines });

const half = validatePromo({ id: "p1", kind: "percent", title: "Half price", percent: 50, scope: "order" });
const burgers = validatePromo({ id: "p2", kind: "bogof", title: "2 for 1 burgers", itemIds: [10, 11] });

describe("validatePromo", () => {
  test("needs a kind and a headline", () => {
    expect(() => validatePromo({ kind: "free money", title: "x" })).toThrow(/what kind/);
    expect(() => validatePromo({ kind: "announce", title: "  " })).toThrow(/headline/);
  });

  test("percent must be sensible", () => {
    expect(() => validatePromo({ kind: "percent", title: "x", percent: 100 })).toThrow(/between 5% and 90%/);
    expect(() => validatePromo({ kind: "percent", title: "x", percent: 2 })).toThrow(/between/);
  });

  test("dish offers need dishes; buy-one-get-one is always for dishes", () => {
    expect(() => validatePromo({ kind: "bogof", title: "x" })).toThrow(/Pick the dishes/);
    expect(() => validatePromo({ kind: "percent", title: "x", percent: 20, scope: "items" })).toThrow(/Pick the dishes/);
    expect(burgers.scope).toBe("items");
  });

  test("must end after it starts", () => {
    expect(() => validatePromo({ kind: "announce", title: "x", startsAt: NOW, endsAt: NOW })).toThrow(/end after/);
  });

  test("announcements carry no money", () => {
    const p = validatePromo({ kind: "announce", title: "New wings", percent: 50, minOrderPence: 900, itemIds: [1] });
    expect(p).toMatchObject({ percent: null, itemIds: [], minOrderPence: 0 });
  });
});

describe("status", () => {
  test("live, scheduled, ended, paused", () => {
    expect(promoStatus(half, NOW)).toBe("live");
    expect(promoStatus({ ...half, startsAt: NOW + HOUR }, NOW)).toBe("scheduled");
    expect(promoStatus({ ...half, endsAt: NOW }, NOW)).toBe("ended");
    expect(promoStatus({ ...half, isActive: false }, NOW)).toBe("paused");
    expect(livePromotions([half, { ...half, id: "x", isActive: false }], NOW).map((p) => p.id)).toEqual(["p1"]);
  });

  test("badges", () => {
    expect(promoBadge(half)).toBe("50% off");
    expect(promoBadge(burgers)).toBe("Buy 1 get 1 free");
  });
});

describe("savings", () => {
  test("percent off the order rounds down to the penny", () => {
    expect(promoSaving(half, cart(line(1, 499, 1)))).toBe(249);
  });

  test("percent off chosen dishes only touches those dishes", () => {
    const p = validatePromo({ id: "p", kind: "percent", title: "x", percent: 20, scope: "items", itemIds: [1] });
    expect(promoSaving(p, cart(line(1, 1000, 1), line(2, 1000, 1)))).toBe(200);
  });

  test("buy one get one: the cheaper half of the chosen dishes is free", () => {
    // 3 units: 600, 500, 400 -> one pair; the 400 is free.
    expect(promoSaving(burgers, cart(line(10, 600, 1), line(11, 500, 1, "b"), line(11, 400, 1, "c"), line(99, 900, 2)))).toBe(400);
    expect(promoSaving(burgers, cart(line(10, 500, 4)))).toBe(1000);
    expect(promoSaving(burgers, cart(line(10, 500, 1)))).toBe(0);
  });

  test("a minimum order must be met first", () => {
    const p = { ...half, minOrderPence: 2000 };
    expect(promoSaving(p, cart(line(1, 1999, 1)))).toBe(0);
    expect(promoSaving(p, cart(line(1, 2000, 1)))).toBe(1000);
  });
});

describe("priceCart", () => {
  test("no offers: the subtotal stands", () => {
    expect(priceCart(cart(line(1, 300, 2)), [], NOW)).toEqual({ count: 2, subtotalPence: 600, discountPence: 0, itemsPence: 600, promo: null });
  });

  test("the best live offer wins; only one applies", () => {
    const tenOff = validatePromo({ id: "p3", kind: "percent", title: "10% off", percent: 10 });
    const priced = priceCart(cart(line(10, 500, 2)), [tenOff, burgers], NOW);
    expect(priced).toMatchObject({ subtotalPence: 1000, discountPence: 500, itemsPence: 500, promo: { id: "p2", title: "2 for 1 burgers" } });
  });

  test("ended and paused offers are ignored", () => {
    const priced = priceCart(cart(line(1, 1000, 1)), [{ ...half, endsAt: NOW - 1 }, { ...half, id: "q", isActive: false }], NOW);
    expect(priced.discountPence).toBe(0);
  });
});

test("readPromotions keeps good offers and drops broken ones", () => {
  expect(readPromotions([half, { id: "bad", kind: "percent", title: "x", percent: 500 }, null]).map((p) => p.id)).toEqual(["p1"]);
  expect(readPromotions("x")).toEqual([]);
});

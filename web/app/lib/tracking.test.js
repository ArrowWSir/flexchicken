import { describe, expect, test } from "vitest";
import { STALE_LOCATION_MS, driverFix, ordersOf } from "./tracking";

const NOW = Date.UTC(2026, 9, 6, 19, 0);
const HOME = { postcode: "RM13 8AB", latitude: 51.5205, longitude: 0.2052 };
const onTheWay = { id: "o1", mode: "delivery", status: "out_for_delivery", address: HOME };

describe("driverFix", () => {
  test("a fresh location on an order out for delivery is live, with miles and minutes away", () => {
    const location = { latitude: 51.5195, longitude: 0.1985, at: NOW - 5_000 };
    const fix = driverFix(onTheWay, location, NOW);
    expect(fix.isLive).toBe(true);
    expect(fix.milesAway).toBeGreaterThan(0.2);
    expect(fix.milesAway).toBeLessThan(0.4);
    expect(fix.minutesAway).toBe(1);
  });

  test("a location older than a minute is not live", () => {
    const location = { latitude: 51.5195, longitude: 0.1985, at: NOW - STALE_LOCATION_MS - 1 };
    expect(driverFix(onTheWay, location, NOW).isLive).toBe(false);
  });

  test("further away means more minutes", () => {
    const location = { latitude: 51.555, longitude: 0.21, at: NOW };
    expect(driverFix(onTheWay, location, NOW).minutesAway).toBeGreaterThan(5);
  });

  test("no location, no driver yet", () => {
    expect(driverFix(onTheWay, null, NOW)).toEqual({ isLive: false, milesAway: null, minutesAway: null });
  });

  test("before the driver leaves, or on a collection, there is nothing to show", () => {
    const location = { latitude: 51.5195, longitude: 0.1985, at: NOW };
    expect(driverFix({ ...onTheWay, status: "ready" }, location, NOW).isLive).toBe(false);
    expect(driverFix({ ...onTheWay, mode: "collection", address: null }, location, NOW).isLive).toBe(false);
  });
});

describe("ordersOf", () => {
  const mk = (id, customerId, status, createdAt) => ({ id, customer: { id: customerId }, status, createdAt });
  const orders = [
    mk("a", "u1", "delivered", 1),
    mk("b", "u1", "preparing", 3),
    mk("c", "u2", "placed", 4),
    mk("d", "u1", "out_for_delivery", 2),
    mk("e", "u1", "cancelled", 5),
  ];

  test("splits one customer's orders into active (on the way first) and past (newest first)", () => {
    const { active, past } = ordersOf(orders, "u1");
    expect(active.map((o) => o.id)).toEqual(["d", "b"]);
    expect(past.map((o) => o.id)).toEqual(["e", "a"]);
  });

  test("an order on the way comes before one still cooking", () => {
    const { active } = ordersOf([mk("x", "u1", "preparing", 9), mk("y", "u1", "out_for_delivery", 1)], "u1");
    expect(active.map((o) => o.id)).toEqual(["y", "x"]);
  });

  test("never shows another customer's orders, and does not change the list", () => {
    const copy = structuredClone(orders);
    expect(ordersOf(orders, "u3")).toEqual({ active: [], past: [] });
    expect(orders).toEqual(copy);
  });
});

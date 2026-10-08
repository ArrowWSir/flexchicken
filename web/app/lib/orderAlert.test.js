import { describe, expect, test } from "vitest";
import { EMPTY_CART, addToCart } from "./cart";
import { DEFAULT_SETTINGS } from "./settings";
import { buildOrder } from "./orders";
import { notificationFor, spotFresh } from "./orderAlert";

describe("spotFresh", () => {
  test("the first look counts everything as seen", () => {
    const { seen, fresh } = spotFresh(null, ["a", "b"]);
    expect(fresh).toEqual([]);
    expect([...seen]).toEqual(["a", "b"]);
  });

  test("after that, only new ids are fresh, and each only once", () => {
    const first = spotFresh(null, ["a"]);
    const second = spotFresh(first.seen, ["a", "b"]);
    expect(second.fresh).toEqual(["b"]);
    expect(spotFresh(second.seen, ["a", "b"]).fresh).toEqual([]);
  });

  test("does not change the set it was given", () => {
    const first = spotFresh(null, ["a"]);
    spotFresh(first.seen, ["a", "b"]);
    expect([...first.seen]).toEqual(["a"]);
  });
});

describe("notificationFor", () => {
  const burger = { id: 1, name: "Cheese Burger", price: 2.49, options: [] };
  const customer = { id: "u1", name: "Sam", email: "sam@example.com" };
  const NOW = Date.UTC(2026, 9, 6, 18, 0);

  test("says the number, how it leaves, the item count, the total and who", () => {
    const cart = addToCart(EMPTY_CART, burger, {}, 3);
    const order = buildOrder({ cart, customer, mode: "collection", settings: DEFAULT_SETTINGS, sequence: 42, now: NOW });
    expect(notificationFor(order)).toEqual({
      title: "New order #0042",
      body: "Collection · 3 items · £7.47\nSam",
      tag: `order-${order.id}`,
    });
  });

  test("a delivery names the postcode", () => {
    const cart = addToCart(EMPTY_CART, burger, {}, 7);
    const address = { line1: "1 High St", postcode: "RM13 9AA", latitude: 51.5187, longitude: 0.1938 };
    const order = buildOrder({ cart, customer, mode: "delivery", address, settings: DEFAULT_SETTINGS, sequence: 1, now: NOW });
    expect(notificationFor(order).body).toMatch(/^Delivery to RM13 9AA · 7 items/);
  });
});

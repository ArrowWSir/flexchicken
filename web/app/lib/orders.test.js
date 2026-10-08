import { describe, expect, test } from "vitest";
import { EMPTY_CART, addToCart } from "./cart";
import { DEFAULT_SETTINGS } from "./settings";
import { ORDER_FLOW, advanceOrder, buildOrder, canAdvance, formatOrderNumber, ticketUrgency } from "./orders";

const burger = { id: 1, name: "Cheese Burger", price: 2.49, options: [] };
const cart = addToCart(EMPTY_CART, burger, {}, 2);
const customer = { id: "u1", name: "Sam", email: "sam@example.com" };
const NOW = Date.UTC(2026, 9, 5, 18, 0);

describe("buildOrder", () => {
  test("a collection order has no delivery fee", () => {
    const order = buildOrder({ cart, customer, mode: "collection", settings: DEFAULT_SETTINGS, sequence: 42, now: NOW });
    expect(order).toMatchObject({
      number: 42,
      status: "placed",
      mode: "collection",
      totals: { subtotalPence: 498, discountPence: 0, deliveryPence: 0, totalPence: 498 },
      customer: { name: "Sam" },
    });
    expect(order.lines).toHaveLength(1);
    expect(order.history).toEqual([{ status: "placed", at: NOW }]);
  });

  test("the best live offer comes off the total and is recorded on the order", () => {
    const promotions = [{ id: "bogof", kind: "bogof", title: "2 for 1", scope: "items", itemIds: [1], minOrderPence: 0, percent: null, startsAt: null, endsAt: null, isActive: true }];
    const order = buildOrder({ cart, customer, mode: "collection", settings: DEFAULT_SETTINGS, promotions, sequence: 1, now: NOW });
    expect(order.totals).toEqual({ subtotalPence: 498, discountPence: 249, deliveryPence: 0, totalPence: 249 });
    expect(order.promo).toEqual({ id: "bogof", title: "2 for 1" });
  });

  test("the delivery minimum counts the food after the offer", () => {
    const promotions = [{ id: "half", kind: "percent", title: "Half", percent: 50, scope: "order", itemIds: [], minOrderPence: 0, startsAt: null, endsAt: null, isActive: true }];
    const big = addToCart(EMPTY_CART, burger, {}, 7); // £17.43, £8.72 after the offer
    expect(() =>
      buildOrder({ cart: big, customer, mode: "delivery", address: { line1: "x", postcode: "RM13 9AA", latitude: 51.52, longitude: 0.2 }, settings: DEFAULT_SETTINGS, promotions, sequence: 1, now: NOW })
    ).toThrow(/minimum/);
  });

  const bigCart = addToCart(EMPTY_CART, burger, {}, 7); // £17.43
  const near = { line1: "1 Test Road", postcode: "RM13 9AA", latitude: 51.52, longitude: 0.2, miles: 0.4 };

  test("a delivery order over the minimum adds its zone's fee", () => {
    const order = buildOrder({
      cart: bigCart,
      customer,
      mode: "delivery",
      address: near,
      settings: DEFAULT_SETTINGS,
      sequence: 1,
      now: NOW,
    });
    expect(order.totals).toEqual({ subtotalPence: 1743, discountPence: 0, deliveryPence: 100, totalPence: 1843 }); // RM13 9AA: zone 1, £1
  });

  test("refuses delivery under the minimum order", () => {
    expect(() =>
      buildOrder({ cart, customer, mode: "delivery", address: near, settings: { ...DEFAULT_SETTINGS, minDeliveryOrderPence: 1500 }, sequence: 1, now: NOW })
    ).toThrow(/minimum/i);
  });

  test("collection has no minimum", () => {
    expect(() => buildOrder({ cart, customer, mode: "collection", settings: DEFAULT_SETTINGS, sequence: 1, now: NOW })).not.toThrow();
  });

  test("refuses delivery outside the area", () => {
    expect(() =>
      buildOrder({
        cart,
        customer,
        mode: "delivery",
        address: { line1: "Far away", postcode: "SW1A 1AA", latitude: 51.5, longitude: -0.14, miles: 14 },
        settings: DEFAULT_SETTINGS,
        sequence: 1,
        now: NOW,
      })
    ).toThrow(/outside/i);
  });

  test("refuses an empty cart and a missing customer", () => {
    expect(() => buildOrder({ cart: EMPTY_CART, customer, mode: "collection", settings: DEFAULT_SETTINGS, sequence: 1, now: NOW })).toThrow(/empty/i);
    expect(() => buildOrder({ cart, customer: null, mode: "collection", settings: DEFAULT_SETTINGS, sequence: 1, now: NOW })).toThrow(/sign in/i);
  });
});

describe("ready time", () => {
  test("an order carries when it should be ready, from the shop's prep time", () => {
    const order = buildOrder({ cart, customer, mode: "collection", settings: { ...DEFAULT_SETTINGS, prepMinutes: 25 }, sequence: 1, now: NOW });
    expect(order.readyBy).toBe(NOW + 25 * 60_000);
  });
});

describe("status flow", () => {
  const placed = buildOrder({ cart: addToCart(EMPTY_CART, burger, {}, 7), customer, mode: "delivery", address: { line1: "x", postcode: "RM13 9AA", latitude: 51.52, longitude: 0.2, miles: 0.4 }, settings: DEFAULT_SETTINGS, sequence: 1, now: NOW });

  test("delivery orders go placed -> accepted -> preparing -> ready -> out -> delivered", () => {
    expect(ORDER_FLOW.delivery).toEqual(["placed", "accepted", "preparing", "ready", "out_for_delivery", "delivered"]);
  });

  test("collection orders end at collected", () => {
    expect(ORDER_FLOW.collection.at(-1)).toBe("collected");
  });

  test("only the next step, or cancelling an open order, is allowed", () => {
    expect(canAdvance(placed, "accepted")).toBe(true);
    expect(canAdvance(placed, "ready")).toBe(false);
    expect(canAdvance(placed, "cancelled")).toBe(true);
  });

  test("advancing records the step and returns a new order", () => {
    const accepted = advanceOrder(placed, "accepted", NOW + 60_000);
    expect(accepted.status).toBe("accepted");
    expect(accepted.history.at(-1)).toEqual({ status: "accepted", at: NOW + 60_000 });
    expect(placed.status).toBe("placed");
  });

  test("a driver is recorded when an order goes out", () => {
    let order = placed;
    for (const status of ["accepted", "preparing", "ready"]) order = advanceOrder(order, status, NOW);
    const out = advanceOrder(order, "out_for_delivery", NOW, { driver: { id: "d1", name: "Ali" } });
    expect(out.driver).toEqual({ id: "d1", name: "Ali" });
  });

  test("an illegal step throws", () => {
    expect(() => advanceOrder(placed, "delivered", NOW)).toThrow();
  });
});

describe("tickets", () => {
  test("order numbers are four digits", () => {
    expect(formatOrderNumber(7)).toBe("#0007");
  });

  test("ticket urgency follows its age", () => {
    expect(ticketUrgency(NOW, NOW + 5 * 60_000)).toBe("fresh");
    expect(ticketUrgency(NOW, NOW + 12 * 60_000)).toBe("warm");
    expect(ticketUrgency(NOW, NOW + 25 * 60_000)).toBe("late");
  });
});

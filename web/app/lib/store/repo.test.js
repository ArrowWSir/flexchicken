import { describe, expect, test, vi } from "vitest";
import { EMPTY_CART, addToCart } from "../cart";
import { createLocalStore } from "./local";
import { createRepo } from "./repo";

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

// Two "tabs" sharing storage and a message channel, like BroadcastChannel.
function fakeBus() {
  const listeners = new Set();
  return {
    open() {
      const own = { onmessage: null };
      listeners.add(own);
      return {
        postMessage: (msg) => listeners.forEach((l) => l !== own && l.onmessage?.({ data: msg })),
        set onmessage(fn) {
          own.onmessage = fn;
        },
        close: () => listeners.delete(own),
      };
    },
  };
}

const burger = { id: 1, name: "Cheese Burger", price: 2.49, options: [] };
const cart = addToCart(EMPTY_CART, burger, {}, 1);
const customer = { id: "u1", name: "Sam", email: "sam@example.com" };

function setup() {
  const storage = memoryStorage();
  const bus = fakeBus();
  let clock = Date.UTC(2026, 9, 5, 18, 0);
  const now = () => clock;
  const kitchen = createRepo(createLocalStore({ storage, channel: bus.open() }), now);
  const phone = createRepo(createLocalStore({ storage, channel: bus.open() }), now);
  return { kitchen, phone, tick: (ms) => (clock += ms) };
}

describe("orders", () => {
  test("placing an order numbers it and the kitchen sees it", () => {
    const { kitchen, phone } = setup();
    const first = phone.placeOrder({ cart, customer, mode: "collection" });
    const second = phone.placeOrder({ cart, customer, mode: "collection" });
    expect(first.number).toBe(1);
    expect(second.number).toBe(2);
    expect(kitchen.listOrders().map((o) => o.number)).toEqual([1, 2]);
  });

  test("another tab hears about a new order", () => {
    const { kitchen, phone } = setup();
    const heard = vi.fn();
    kitchen.subscribe("orders", heard);
    phone.placeOrder({ cart, customer, mode: "collection" });
    expect(heard).toHaveBeenCalled();
  });

  test("the kitchen moves an order on and the customer sees it", () => {
    const { kitchen, phone, tick } = setup();
    const order = phone.placeOrder({ cart, customer, mode: "collection" });
    tick(60_000);
    kitchen.advance(order.id, "accepted");
    expect(phone.getOrder(order.id).status).toBe("accepted");
  });

  test("a customer only sees their own orders", () => {
    const { phone } = setup();
    phone.placeOrder({ cart, customer, mode: "collection" });
    phone.placeOrder({ cart, customer: { ...customer, id: "u2" }, mode: "collection" });
    expect(phone.ordersFor("u1")).toHaveLength(1);
  });

  test("a closed shop refuses orders", () => {
    const { kitchen, phone } = setup();
    kitchen.saveSettings({ isTakingOrders: false });
    expect(() => phone.placeOrder({ cart, customer, mode: "collection" })).toThrow(/not taking orders/i);
  });
});

describe("driver location", () => {
  test("a location is kept per order and readable from another tab", () => {
    const { kitchen, phone } = setup();
    kitchen.pushLocation("ord_1", { latitude: 51.52, longitude: 0.2, accuracy: 12 });
    expect(phone.getLocation("ord_1")).toMatchObject({ latitude: 51.52, longitude: 0.2, accuracy: 12 });
  });

  test("rejects a position that is not a coordinate", () => {
    const { kitchen } = setup();
    expect(() => kitchen.pushLocation("ord_1", { latitude: 200, longitude: 0 })).toThrow();
  });
});

describe("settings and menu edits", () => {
  test("settings merge over the defaults and ignore junk", () => {
    const { kitchen, phone } = setup();
    kitchen.saveSettings({ prepMinutes: 25, minDeliveryOrderPence: "lots", deliveryZones: "everywhere" });
    expect(phone.getSettings()).toMatchObject({ prepMinutes: 25, minDeliveryOrderPence: 1500 });
    expect(phone.getSettings().deliveryZones).toHaveLength(2);
  });

  test("opening hours are saved when valid and fall back to the defaults when not", () => {
    const { kitchen, phone } = setup();
    const week = { ...phone.getSettings().hours, sunday: null, friday: ["12:00", "01:00"] };
    kitchen.saveSettings({ hours: week });
    expect(phone.getSettings().hours).toEqual(week);
    kitchen.saveSettings({ hours: { monday: ["nope", "23:00"] } });
    expect(phone.getSettings().hours.monday).toEqual(["12:00", "23:00"]);
  });

  test("menu edits round-trip", () => {
    const { kitchen, phone } = setup();
    kitchen.saveMenuEdits({ updated: { 1: { price: 3 } }, removed: [], added: [], soldOut: [1] });
    expect(phone.getMenuEdits().soldOut).toEqual([1]);
  });
});

describe("customer sign-in (demo until the backend)", () => {
  test("signs in with a name and email and is seen by every tab", () => {
    const { kitchen, phone } = setup();
    const session = phone.signIn({ name: " Sam ", email: "SAM@Example.com", provider: "google" });
    expect(session).toMatchObject({ name: "Sam", email: "sam@example.com", provider: "google" });
    expect(session.id).toMatch(/^usr_/);
    expect(kitchen.getSession()).toEqual(session);
  });

  test("the same email signs back in as the same customer", () => {
    const { phone } = setup();
    const first = phone.signIn({ name: "Sam", email: "sam@example.com", provider: "google" });
    phone.signOut();
    expect(phone.getSession()).toBeNull();
    expect(phone.signIn({ name: "Sam", email: "sam@example.com", provider: "google" }).id).toBe(first.id);
  });

  test("rejects a missing name or a bad email", () => {
    const { phone } = setup();
    expect(() => phone.signIn({ name: "", email: "sam@example.com", provider: "google" })).toThrow(/name/i);
    expect(() => phone.signIn({ name: "Sam", email: "not-an-email", provider: "google" })).toThrow(/email/i);
  });

  test("keeps a phone number for delivery", () => {
    const { phone } = setup();
    phone.signIn({ name: "Sam", email: "sam@example.com", provider: "google" });
    expect(phone.updateProfile({ phone: "07700 900123" }).phone).toBe("07700 900123");
    expect(() => phone.updateProfile({ phone: "call me" })).toThrow(/phone/i);
  });
});

describe("staff clock", () => {
  test("the owner adds staff and the clock terminal knows them by Staff ID and PIN", () => {
    const { kitchen, phone } = setup();
    kitchen.addStaff({ name: "Ali", role: "kitchen", pin: "1234" });
    const { member, shift } = phone.identify("101", "1234");
    expect(member).toMatchObject({ name: "Ali", code: "101" });
    expect(shift).toBeNull();
    expect(() => phone.identify("101", "9999")).toThrow(/don't match/);
    expect(() => phone.identify("102", "1234")).toThrow(/don't match/);
  });

  test("each new member gets the next Staff ID", () => {
    const { kitchen } = setup();
    kitchen.addStaff({ name: "Ali", role: "kitchen", pin: "1234" });
    kitchen.addStaff({ name: "Jo", role: "counter", pin: "1234" });
    expect(kitchen.listStaff().map((s) => s.code)).toEqual(["101", "102"]);
  });

  test("clocks in and out, and every screen sees the shift", () => {
    const { kitchen, phone, tick } = setup();
    kitchen.addStaff({ name: "Ali", role: "kitchen", pin: "1234" });
    const heard = vi.fn();
    kitchen.subscribe("shifts", heard);
    const { member } = phone.identify("101", "1234");
    phone.clockIn(member.id);
    expect(phone.identify("101", "1234").shift).not.toBeNull();
    tick(3_600_000);
    phone.clockOut(member.id);
    expect(heard).toHaveBeenCalled();
    const [shift] = kitchen.listShifts();
    expect(shift.endAt - shift.startAt).toBe(3_600_000);
  });

  test("removing someone who is clocked in closes their shift for them", () => {
    const { kitchen } = setup();
    kitchen.addStaff({ name: "Ali", role: "kitchen", pin: "1234" });
    const [ali] = kitchen.listStaff();
    kitchen.clockIn(ali.id);
    kitchen.removeStaff(ali.id);
    expect(kitchen.listShifts()[0]).toMatchObject({ closedBy: "manager" });
    expect(kitchen.listShifts()[0].endAt).not.toBeNull();
    expect(() => kitchen.clockIn(ali.id)).toThrow(/not on the team list/);
  });
});

describe("loyalty cards", () => {
  test("a phone registers its card once; the counter stamps it and the phone sees it", () => {
    const { kitchen, phone, tick } = setup();
    const card = phone.registerCard({ id: "fc_usr_abc", name: "Amira" });
    expect(card.code).toMatch(/^\d{4}$/);
    expect(phone.registerCard({ id: "fc_usr_abc" }).code).toBe(card.code);

    const seen = vi.fn();
    phone.subscribe("cards", seen);
    tick(1000);
    kitchen.stampCard(card.id, "counter");
    expect(seen).toHaveBeenCalled();
    expect(phone.getCard(card.id)).toMatchObject({ stamps: 1, lifetimeStamps: 1 });
  });

  test("two tills stamping one after the other both count", () => {
    const { kitchen, phone } = setup();
    const { id } = phone.registerCard({ id: "fc_usr_abc" });
    kitchen.stampCard(id);
    phone.stampCard(id);
    expect(kitchen.getCard(id).stamps).toBe(2);
  });

  test("a full card is redeemed, then starts again", () => {
    const { kitchen, phone } = setup();
    const { id } = phone.registerCard({ id: "fc_usr_abc" });
    for (let i = 0; i < 8; i += 1) kitchen.stampCard(id);
    expect(() => kitchen.stampCard(id)).toThrow(/full/);
    kitchen.redeemCard(id);
    expect(phone.getCard(id)).toMatchObject({ stamps: 0, rewards: 1, lifetimeStamps: 8 });
  });
});

describe("receipt stamp codes", () => {
  test("scanning a receipt stamps the card once, and a reprint carries the same code", () => {
    const { kitchen, phone } = setup();
    const order = phone.placeOrder({ cart, customer, mode: "collection" });
    kitchen.advance(order.id, "accepted");
    const token = kitchen.issueStampToken(order.id);
    expect(kitchen.issueStampToken(order.id)).toBe(token);

    const { id } = phone.registerCard({ id: "fc_usr_abc" });
    const { card, orderNumber } = phone.redeemStampToken(token, id);
    expect(orderNumber).toBe("#0001");
    expect(card.stamps).toBe(1);
    expect(card.history.at(-1).by).toBe("receipt #0001");
    expect(() => phone.redeemStampToken(token, id)).toThrow(/already been collected/);
    expect(kitchen.getCard(id).stamps).toBe(1);
  });

  test("a full card keeps the code for after the surprise", () => {
    const { kitchen, phone } = setup();
    const order = phone.placeOrder({ cart, customer, mode: "collection" });
    const token = kitchen.issueStampToken(order.id);
    const { id } = phone.registerCard({ id: "fc_usr_abc" });
    for (let i = 0; i < 8; i += 1) kitchen.stampCard(id);
    expect(() => phone.redeemStampToken(token, id)).toThrow(/full/);
    kitchen.redeemCard(id);
    expect(phone.redeemStampToken(token, id).card.stamps).toBe(1);
  });

  test("a cancelled order's receipt gives no stamp", () => {
    const { kitchen, phone } = setup();
    const order = phone.placeOrder({ cart, customer, mode: "collection" });
    const token = kitchen.issueStampToken(order.id);
    kitchen.advance(order.id, "cancelled");
    const { id } = phone.registerCard({ id: "fc_usr_abc" });
    expect(() => phone.redeemStampToken(token, id)).toThrow(/cancelled/);
    expect(kitchen.getCard(id).stamps).toBe(0);
  });
});

describe("promotions", () => {
  test("the owner's offer is saved, priced into orders and removable", () => {
    const { kitchen, phone } = setup();
    const promo = kitchen.savePromotion({ kind: "percent", title: "Half price", percent: 50 });
    expect(phone.listPromotions().map((p) => p.title)).toEqual(["Half price"]);
    const order = phone.placeOrder({ cart, customer, mode: "collection" });
    expect(order.totals).toMatchObject({ subtotalPence: 249, discountPence: 124, totalPence: 125 });
    kitchen.savePromotion({ ...promo, isActive: false });
    expect(phone.listPromotions()[0].isActive).toBe(false);
    kitchen.removePromotion(promo.id);
    expect(phone.listPromotions()).toEqual([]);
  });

  test("a bad offer is refused with the reason", () => {
    const { kitchen } = setup();
    expect(() => kitchen.savePromotion({ kind: "percent", title: "x", percent: 99 })).toThrow(/between/);
    expect(kitchen.listPromotions()).toEqual([]);
  });
});

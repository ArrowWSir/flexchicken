import { describe, expect, test } from "vitest";
import { createShopCore, ShopError } from "./shopCore";
import { pinHash } from "../app/lib/timeclock";

function memoryStore() {
  const data = new Map();
  return {
    read: (key, fallback) => (data.has(key) ? structuredClone(data.get(key)) : fallback),
    write: (key, value) => data.set(key, structuredClone(value)),
    subscribe: () => () => {},
  };
}

// postcodes.io stand-in: every postcode sits a few hundred yards from the shop.
const NEAR = { latitude: 51.5205, longitude: 0.1905 };
function postcodes(found = NEAR) {
  const calls = [];
  const fetcher = async (url) => {
    calls.push(url);
    if (!found) return { ok: false, json: async () => ({}) };
    return { ok: true, json: async () => ({ result: { postcode: "RM13 9AA", ...found } }) };
  };
  return { fetcher, calls };
}

const PUBLIC = { role: "public", ip: "1.1.1.1" };
const CLOCK = { role: "clock", id: "clock", name: "Shop clock" };
const ADMIN = { role: "admin", id: "kitchen", name: "Kitchen" };
const DRIVER = { role: "driver", id: "drv_sam", name: "Sam" };
const OTHER_DRIVER = { role: "driver", id: "drv_alex", name: "Alex" };

const customer = { id: "usr_abc123", name: "Jo", email: "jo@example.com", phone: "07700 900123" };
// Chicken Fillet Burger, £4.49 on the generated menu.
const burgerLine = (over = {}) => ({ key: "x", itemId: 1155, name: "Chicken Fillet Burger", choices: [], unitPence: 1, qty: 1, ...over });

function setup({ found } = {}) {
  const store = memoryStore();
  let clock = Date.UTC(2026, 9, 8, 18, 0);
  let n = 0;
  const pc = postcodes(found);
  const photos = [];
  const core = createShopCore({
    store,
    now: () => clock,
    newId: (prefix) => `${prefix}_random${++n}`,
    fetcher: pc.fetcher,
    savePhoto: (dataUrl) => {
      photos.push(dataUrl);
      return `/api/photo/p${photos.length}.webp`;
    },
  });
  return { core, store, pc, photos, tick: (ms) => (clock += ms) };
}

const collect = (core, over = {}) =>
  core.call("placeOrder", [{ cart: { lines: [burgerLine()] }, customer, mode: "collection", ...over }], PUBLIC);

describe("permissions", () => {
  test("refuses an unknown action", async () => {
    const { core } = setup();
    await expect(core.call("wipeEverything", [], ADMIN)).rejects.toMatchObject({ status: 404 });
  });

  test("keeps staff actions from customers", async () => {
    const { core } = setup();
    for (const method of ["saveSettings", "advance", "stampCard", "addStaff", "issueStampToken", "pushLocation"]) {
      await expect(core.call(method, [{}], PUBLIC)).rejects.toMatchObject({ status: 403 });
    }
  });

  test("keeps the clock pad to the shop's clock tablet", async () => {
    const { core } = setup();
    for (const method of ["identify", "clockInWithPin", "clockOutWithPin"]) {
      await expect(core.call(method, ["4821"], PUBLIC)).rejects.toMatchObject({ status: 403 });
      await expect(core.call(method, ["4821"], DRIVER)).rejects.toMatchObject({ status: 403 });
    }
  });

  test("refuses a mode that only exists on Object.prototype", async () => {
    const { core } = setup();
    for (const mode of ["constructor", "__proto__", "toString"]) {
      await expect(collect(core, { mode })).rejects.toMatchObject({ status: 400 });
    }
  });

  test("keeps the owner's actions from drivers", async () => {
    const { core } = setup();
    await expect(core.call("saveSettings", [{}], DRIVER)).rejects.toMatchObject({ status: 403 });
  });

  test("turns a shop rule into a 400 with its message", async () => {
    const { core } = setup();
    const error = await core.call("placeOrder", [{ cart: { lines: [] }, customer, mode: "collection" }], PUBLIC).catch((e) => e);
    expect(error).toBeInstanceOf(ShopError);
    expect(error.status).toBe(400);
    expect(error.message).toMatch(/empty/);
  });

  test("needs arguments as a list", async () => {
    const { core } = setup();
    await expect(core.call("placeOrder", { cart: 1 }, PUBLIC)).rejects.toMatchObject({ status: 400 });
  });
});

describe("placing an order", () => {
  test("prices from the menu and gives the order a random id", async () => {
    const { core } = setup();
    const { result: order, changed } = await collect(core);
    expect(order.id).toBe("ord_random1");
    expect(order.totals.totalPence).toBe(449);
    expect(order.lines[0].unitPence).toBe(449);
    expect(changed).toContain("orders");
  });

  test("checks the customer's details", async () => {
    const { core } = setup();
    await expect(collect(core, { customer: { ...customer, email: "nope" } })).rejects.toThrow(/email/);
    await expect(collect(core, { customer: { ...customer, name: " " } })).rejects.toThrow(/name/);
    await expect(collect(core, { customer: { ...customer, phone: "12" } })).rejects.toThrow(/phone/);
  });

  test("works out the delivery distance itself", async () => {
    const { core, pc } = setup();
    const address = { line1: "1 High St", line2: "", postcode: "rm13 9aa", latitude: 0, longitude: 0, miles: 0.1 };
    const lines = [burgerLine({ qty: 4 })];
    const { result: order } = await core.call("placeOrder", [{ cart: { lines }, customer, mode: "delivery", address }], PUBLIC);
    expect(pc.calls[0]).toContain("RM13%209AA");
    // The claimed position was nowhere near the postcode, so the postcode's own is used.
    expect(order.address.latitude).toBe(NEAR.latitude);
    expect(order.address.miles).toBeGreaterThan(0.1);
    expect(order.address.postcode).toBe("RM13 9AA");
    expect(order.totals.deliveryPence).toBe(100);
  });

  test("prices delivery from the postcode even when the phone gives its GPS", async () => {
    const { core } = setup();
    const gps = { latitude: NEAR.latitude + 0.001, longitude: NEAR.longitude };
    const address = { line1: "1 High St", postcode: "RM13 9AA", ...gps };
    const { result: order } = await core.call("placeOrder", [{ cart: { lines: [burgerLine({ qty: 4 })] }, customer, mode: "delivery", address }], PUBLIC);
    expect(order.address.latitude).toBe(NEAR.latitude);
    expect(order.address.isChecked).toBe(true);
  });

  test("keeps the customer's point, unchecked, when postcodes.io is down", async () => {
    const store = memoryStore();
    const core = createShopCore({ store, now: () => Date.UTC(2026, 9, 8, 18, 0), newId: (p) => `${p}_1`, savePhoto: () => "", fetcher: async () => Promise.reject(new TypeError("offline")) });
    const address = { line1: "1 High St", postcode: "RM13 9AA", ...NEAR };
    const { result: order } = await core.call("placeOrder", [{ cart: { lines: [burgerLine({ qty: 4 })] }, customer, mode: "delivery", address }], PUBLIC);
    expect(order.address).toMatchObject({ latitude: NEAR.latitude, isChecked: false });
  });

  test("refuses orders while the shop is closed", async () => {
    const { core, tick } = setup();
    tick(9 * 3_600_000); // 4am in London
    await expect(collect(core)).rejects.toThrow(/closed/i);
  });

  test("refuses a delivery address without a first line", async () => {
    const { core } = setup();
    const address = { line1: "", postcode: "RM13 9AA" };
    await expect(core.call("placeOrder", [{ cart: { lines: [burgerLine({ qty: 4 })] }, customer, mode: "delivery", address }], PUBLIC)).rejects.toThrow(/address/);
  });
});

describe("what each screen may read", () => {
  test("a customer sees only the orders they hold", async () => {
    const { core } = setup();
    const { result: mine } = await collect(core);
    await collect(core);
    const view = core.snapshot(["orders"], PUBLIC, { orderIds: [mine.id] });
    expect(view.orders.map((o) => o.id)).toEqual([mine.id]);
    expect(core.snapshot(["orders"], PUBLIC, {}).orders).toEqual([]);
    expect(core.snapshot(["orders"], ADMIN, {}).orders).toHaveLength(2);
  });

  test("the clock sees names and open shifts; customers see no staff; nobody gets PINs", async () => {
    const { core } = setup();
    await core.call("addStaff", [{ name: "Ali", role: "kitchen", pin: "4821" }], ADMIN);
    const view = core.snapshot(["staff", "shifts"], CLOCK, {});
    expect(view.staff[0]).toEqual({ id: expect.any(String), name: "Ali", role: "kitchen", isActive: true });
    expect(core.snapshot(["staff", "shifts"], PUBLIC, {})).toEqual({ staff: [], shifts: [] });
    expect(JSON.stringify(core.snapshot(["staff"], ADMIN, {}))).not.toContain(pinHash("4821"));
    expect(core.snapshot(["staff"], ADMIN, {}).staff[0].name).toBe("Ali");
  });

  test("customers see live and coming offers, not paused ones", async () => {
    const { core } = setup();
    const base = { kind: "announce", title: "Hello", isActive: true };
    await core.call("savePromotion", [{ ...base, title: "On" }], ADMIN);
    await core.call("savePromotion", [{ ...base, title: "Off", isActive: false }], ADMIN);
    expect(core.snapshot(["promotions"], PUBLIC, {}).promotions.map((p) => p.title)).toEqual(["On"]);
    expect(core.snapshot(["promotions"], ADMIN, {}).promotions).toHaveLength(2);
  });

  test("asks for each topic once however often it is named", () => {
    const { core } = setup();
    expect(Object.keys(core.snapshot(["settings", "settings"], PUBLIC, {}))).toEqual(["settings"]);
  });

  test("a customer sees only their own loyalty card", async () => {
    const { core } = setup();
    await core.call("registerCard", [{ id: "fc_usr_aaaaaaaaaaaaaaaaaa" }], PUBLIC);
    await core.call("registerCard", [{ id: "fc_usr_bbbbbbbbbbbbbbbbbb" }], PUBLIC);
    await expect(core.call("registerCard", [{ id: "   x" }], PUBLIC)).rejects.toMatchObject({ status: 400 });
    await expect(core.call("registerCard", [{ id: "FC_USR_AAAAAAAAAAAAAAAAAA" }], PUBLIC)).rejects.toMatchObject({ status: 400 });
    const view = core.snapshot(["loyalty_cards"], PUBLIC, { cardId: "fc_usr_aaaaaaaaaaaaaaaaaa" });
    expect(view.loyalty_cards.map((c) => c.id)).toEqual(["fc_usr_aaaaaaaaaaaaaaaaaa"]);
    expect(core.snapshot(["loyalty_cards"], ADMIN, {}).loyalty_cards).toHaveLength(2);
  });

  test("receipt stamp codes stay with staff", async () => {
    const { core } = setup();
    const { result: order } = await collect(core);
    await core.call("issueStampToken", [order.id], ADMIN);
    expect(core.snapshot(["stamp_tokens"], PUBLIC, {}).stamp_tokens).toEqual([]);
    expect(core.snapshot(["stamp_tokens"], ADMIN, {}).stamp_tokens).toHaveLength(1);
  });

  test("everyone reads the menu, settings and offers", () => {
    const { core } = setup();
    const view = core.snapshot(["settings", "menu_edits", "promotions"], PUBLIC, {});
    expect(view.settings.isTakingOrders).toBe(true);
    expect(view.menu_edits.added).toEqual([]);
    expect(view.promotions).toEqual([]);
  });

  test("ignores topics it does not know", () => {
    const { core } = setup();
    expect(core.snapshot(["order_sequence", "nope"], ADMIN, {})).toEqual({});
  });
});

describe("staff clock", () => {
  test("identifies by Staff ID and PIN without giving the PIN back", async () => {
    const { core } = setup();
    await core.call("addStaff", [{ name: "Ali", role: "kitchen", pin: "4821" }], ADMIN);
    const { result } = await core.call("identify", ["101", "4821"], CLOCK);
    expect(result.member.name).toBe("Ali");
    expect(result.member.pinHash).toBeUndefined();
    expect(result.shift).toBeNull();
    await expect(core.call("identify", ["101", "0000"], CLOCK)).rejects.toMatchObject({ isWrongPin: true });
    await expect(core.call("identify", ["102", "4821"], CLOCK)).rejects.toMatchObject({ isWrongPin: true });
  });

  test("only the owner adds staff and gives out Staff IDs", async () => {
    const { core } = setup();
    for (const actor of [PUBLIC, CLOCK]) {
      await expect(core.call("addStaff", [{ name: "Me", role: "kitchen", pin: "1111" }], actor)).rejects.toMatchObject({ status: 403 });
    }
    await core.call("addStaff", [{ name: "Ali", role: "kitchen", pin: "4821", code: "250" }], ADMIN);
    const [member] = core.snapshot(["staff"], ADMIN, {}).staff;
    expect(member.code).toBe("250");
    await expect(core.call("updateStaff", [member.id, { code: "300" }], CLOCK)).rejects.toMatchObject({ status: 403 });
  });

  test("clocks in and out with the PIN", async () => {
    const { core, tick } = setup();
    await core.call("addStaff", [{ name: "Ali", role: "kitchen", pin: "4821" }], ADMIN);
    await core.call("clockInWithPin", ["101", "4821"], CLOCK);
    const twice = await core.call("clockInWithPin", ["101", "4821"], CLOCK).catch((e) => e);
    expect(twice.status).toBe(400);
    expect(twice.isWrongPin).toBeUndefined();
    tick(3_600_000);
    await core.call("clockOutWithPin", ["101", "4821"], CLOCK);
    const [shift] = core.snapshot(["shifts"], ADMIN, {}).shifts;
    expect(shift.endAt - shift.startAt).toBe(3_600_000);
    await expect(core.call("clockInWithPin", ["101", "9999"], CLOCK)).rejects.toThrow(/PIN/);
  });

  test("lets the manager clock someone out", async () => {
    const { core } = setup();
    await core.call("addStaff", [{ name: "Ali", role: "kitchen", pin: "4821" }], ADMIN);
    await core.call("clockInWithPin", ["101", "4821"], CLOCK);
    const [member] = core.snapshot(["staff"], ADMIN, {}).staff;
    await expect(core.call("clockOut", [member.id], PUBLIC)).rejects.toMatchObject({ status: 403 });
    await core.call("clockOut", [member.id], ADMIN);
    expect(core.snapshot(["shifts"], ADMIN, {}).shifts[0].closedBy).toBe("manager");
  });
});

describe("drivers", () => {
  async function readyDelivery(core) {
    const address = { line1: "1 High St", postcode: "RM13 9AA" };
    const { result } = await core.call("placeOrder", [{ cart: { lines: [burgerLine({ qty: 4 })] }, customer, mode: "delivery", address }], PUBLIC);
    for (const status of ["accepted", "preparing", "ready"]) await core.call("advance", [result.id, status], ADMIN);
    return result;
  }

  test("a driver takes a ready order under their own name", async () => {
    const { core } = setup();
    const order = await readyDelivery(core);
    const { result } = await core.call("advance", [order.id, "out_for_delivery", { driver: { id: "drv_fake", name: "Fake" } }], DRIVER);
    expect(result.driver).toEqual({ id: "drv_sam", name: "Sam" });
  });

  test("a driver sees waiting and carried deliveries, without emails", async () => {
    const { core } = setup();
    const order = await readyDelivery(core);
    await collect(core);
    const view = core.snapshot(["orders"], DRIVER, {}).orders;
    expect(view.map((o) => o.id)).toEqual([order.id]);
    expect(view[0].customer.email).toBe("");
    expect(view[0].customer.phone).toBe(customer.phone);
    await core.call("advance", [order.id, "out_for_delivery"], DRIVER);
    await core.call("advance", [order.id, "delivered"], DRIVER);
    expect(core.snapshot(["orders"], DRIVER, {}).orders).toHaveLength(1);
    expect(core.snapshot(["orders"], OTHER_DRIVER, {}).orders).toHaveLength(0);
  });

  test("a driver cannot run the kitchen's steps", async () => {
    const { core } = setup();
    const { result } = await collect(core);
    await expect(core.call("advance", [result.id, "accepted"], DRIVER)).rejects.toMatchObject({ status: 403 });
    await expect(core.call("advance", [result.id, "cancelled"], DRIVER)).rejects.toMatchObject({ status: 403 });
  });

  test("only the driver carrying it delivers it or shares its location", async () => {
    const { core } = setup();
    const order = await readyDelivery(core);
    await core.call("advance", [order.id, "out_for_delivery"], DRIVER);
    const point = { latitude: 51.52, longitude: 0.19 };
    await expect(core.call("pushLocation", [order.id, point], OTHER_DRIVER)).rejects.toMatchObject({ status: 403 });
    await expect(core.call("advance", [order.id, "delivered"], OTHER_DRIVER)).rejects.toMatchObject({ status: 403 });
    await core.call("pushLocation", [order.id, point], DRIVER);
    const view = core.snapshot(["driver_locations"], PUBLIC, { orderIds: [order.id] });
    expect(view.driver_locations[order.id].latitude).toBe(51.52);
    expect(core.snapshot(["driver_locations"], PUBLIC, {}).driver_locations).toEqual({});
    await core.call("advance", [order.id, "delivered"], DRIVER);
  });
});

describe("placing an order twice by mistake", () => {
  test("a retried request gets the order it already made", async () => {
    const { core } = setup();
    const { result: first } = await collect(core, { requestId: "req_abcdefgh" });
    const { result: again } = await collect(core, { requestId: "req_abcdefgh" });
    expect(again.id).toBe(first.id);
    expect(core.snapshot(["orders"], ADMIN, {}).orders).toHaveLength(1);
  });
});

describe("menu edits", () => {
  const edits = (over) => ({ updated: {}, added: [], removed: [], soldOut: [], ...over });

  test("checks prices and options like the editor does", async () => {
    const { core } = setup();
    await expect(core.call("saveMenuEdits", [edits({ updated: { 1155: { price: -1 } } })], ADMIN)).rejects.toThrow(/price/);
    await expect(core.call("saveMenuEdits", [edits({ updated: { 1155: { options: [{ label: "Size", choices: "big" }] } } })], ADMIN)).rejects.toThrow(/options/);
    await expect(core.call("saveMenuEdits", [edits({ added: [{ id: "x", name: "A", price: 1, categoryId: "sides" }] })], ADMIN)).rejects.toThrow(/new dish/);
    const { result } = await core.call("saveMenuEdits", [edits({ updated: { 1155: { price: 5, junk: "<script>" } } })], ADMIN);
    expect(result.updated[1155]).toEqual({ price: 5 });
  });
});

describe("menu photos", () => {
  test("moves an uploaded photo out of the menu edits", async () => {
    const { core, photos } = setup();
    const dataUrl = "data:image/webp;base64,UklGRg==";
    const edits = { updated: { 1155: { image: dataUrl } }, added: [{ id: "new-a1", name: "New", price: 3, categoryId: "sides", image: dataUrl }], removed: [], soldOut: [] };
    await core.call("saveMenuEdits", [edits], ADMIN);
    const saved = core.snapshot(["menu_edits"], PUBLIC, {}).menu_edits;
    expect(saved.updated[1155].image).toBe("/api/photo/p1.webp");
    expect(saved.added[0].image).toBe("/api/photo/p2.webp");
    expect(photos).toHaveLength(2);
  });

  test("refuses a photo from anywhere else", async () => {
    const { core } = setup();
    const edits = { updated: { 1155: { image: "javascript:alert(1)" } }, added: [], removed: [], soldOut: [] };
    await expect(core.call("saveMenuEdits", [edits], ADMIN)).rejects.toThrow(/photo/);
  });
});

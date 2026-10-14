import { describe, expect, test } from "vitest";
import { EMPTY_CART, addToCart } from "./cart";
import { DEFAULT_SETTINGS } from "./settings";
import { advanceOrder, buildOrder } from "./orders";
import { buildReceipt, escapeHtml, receiptHtml } from "./receipt";

const meal = {
  id: 7,
  name: "Wings Meal",
  price: 5.99,
  options: [{ label: "Drink", isRequired: true, choices: [{ label: "Coke", priceAdd: 0 }, { label: "Fanta", priceAdd: 0.5 }] }],
};
const burger = { id: 1, name: "Cheese Burger", price: 2.49, options: [] };
const cart = addToCart(addToCart(EMPTY_CART, meal, { Drink: "Fanta" }, 1), burger, {}, 2);
const customer = { id: "u1", name: "Sam", email: "sam@example.com", phone: "07700 900123" };
// 18:00 UTC in October is 19:00 in London.
const NOW = Date.UTC(2026, 9, 5, 18, 0);
const ACCEPTED = NOW + 3 * 60_000;

const collection = () => buildOrder({ cart, customer, mode: "collection", settings: DEFAULT_SETTINGS, sequence: 42, now: NOW });

describe("buildReceipt", () => {
  test("lists each line with its choices and line price", () => {
    const receipt = buildReceipt(collection(), ACCEPTED);
    expect(receipt.number).toBe("#0042");
    expect(receipt.mode).toBe("COLLECTION");
    expect(receipt.lines).toEqual([
      expect.objectContaining({ qty: 1, name: "Wings Meal", choices: ["Fanta"], price: "£6.49" }),
      expect.objectContaining({ qty: 2, name: "Cheese Burger", choices: [], price: "£4.98" }),
    ]);
    expect(receipt.total).toBe("£11.47");
    expect(receipt.payment).toBe("TO PAY AT PICKUP");
  });

  test("shows London times for when it was placed and accepted", () => {
    const receipt = buildReceipt(collection(), ACCEPTED);
    expect(receipt.placed).toBe("05 Oct 2026 19:00");
    expect(receipt.printed).toBe("19:03");
  });

  test("a delivery shows the address, the fee and pay on delivery", () => {
    const address = { line1: "1 High St", line2: "", postcode: "RM13 9AA", latitude: 51.5187, longitude: 0.1938, miles: 0.1 };
    const big = addToCart(cart, burger, {}, 2);
    const order = buildOrder({ cart: big, customer, mode: "delivery", address, settings: DEFAULT_SETTINGS, sequence: 3, now: NOW });
    const receipt = buildReceipt(order, ACCEPTED);
    expect(receipt.mode).toBe("DELIVERY");
    expect(receipt.customer.address).toBe("1 High St, RM13 9AA");
    expect(receipt.totals).toContainEqual(["Delivery", "£1.00"]);
    expect(receipt.payment).toBe("CASH ON DELIVERY");
  });

  test("an offer is shown by name as a discount line", () => {
    const promotions = [{ id: "bogof", kind: "bogof", title: "2 for 1", scope: "items", itemIds: [1], minOrderPence: 0, percent: null, startsAt: null, endsAt: null, isActive: true }];
    const order = buildOrder({ cart, customer, mode: "collection", settings: DEFAULT_SETTINGS, promotions, sequence: 1, now: NOW });
    expect(buildReceipt(order, ACCEPTED).totals).toContainEqual(["Offer: 2 for 1", "−£2.49"]);
  });

  test("a paid order says so", () => {
    const order = { ...advanceOrder(collection(), "accepted", ACCEPTED), payment: { provider: "teya", status: "paid" } };
    expect(buildReceipt(order, ACCEPTED).payment).toBe("PAID");
  });
});

describe("receiptHtml", () => {
  test("is a page sized for 80 mm till paper with the order on it", () => {
    const html = receiptHtml(buildReceipt(collection(), ACCEPTED));
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain("size: 80mm auto");
    expect(html).toContain("#0042");
    expect(html).toContain("2 x Cheese Burger");
    expect(html).toContain("- Fanta");
  });

  test("carries the stamp QR when there is one, and nothing when there is not", () => {
    const receipt = buildReceipt(collection(), ACCEPTED);
    const withQr = receiptHtml(receipt, { qrSvg: '<svg id="qr"></svg>' });
    expect(withQr).toContain('<svg id="qr"></svg>');
    expect(withQr).toContain("SCAN FOR YOUR FLEX STAMP");
    expect(receiptHtml(receipt)).not.toContain("SCAN FOR YOUR FLEX STAMP");
  });

  test("escapes what customers typed, so a note cannot inject markup", () => {
    const order = { ...collection(), note: '<img src=x onerror="alert(1)">', customer: { ...customer, name: "Sam & <b>Co</b>" } };
    const html = receiptHtml(buildReceipt(order, ACCEPTED));
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b>Co");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).toContain("Sam &amp; &lt;b&gt;Co&lt;/b&gt;");
  });

  test("escapeHtml handles empty values", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml("a'b")).toBe("a&#39;b");
  });
});

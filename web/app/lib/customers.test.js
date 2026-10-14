import { describe, expect, test } from "vitest";
import { customerList, customerSheet, customersFileName } from "./customers";

const card = (over) => ({ id: "c1", code: "4271", name: "", email: "", createdAt: 100, lastStampAt: null, ...over });
const order = (over) => ({ id: "o1", createdAt: 200, customer: { id: "u1", name: "Sam Ali", email: "sam@example.com", phone: "" }, ...over });

describe("customerList", () => {
  test("returns no one when there are no cards or orders", () => {
    expect(customerList([], [])).toEqual([]);
  });

  test("leaves out cards with no email, as they never signed in", () => {
    expect(customerList([card({ name: "Walk-in" })], [])).toEqual([]);
  });

  test("joins a customer's card and orders by email, ignoring case", () => {
    const cards = [card({ name: "Sam", email: "sam@example.com", createdAt: 50 })];
    const orders = [order({ createdAt: 200 }), order({ id: "o2", createdAt: 300, customer: { name: "Sam Ali", email: "SAM@example.com " } })];

    expect(customerList(cards, orders)).toEqual([
      { name: "Sam Ali", email: "sam@example.com", orders: 2, cardCode: "4271", firstSeen: 50, lastSeen: 300 },
    ]);
  });

  test("uses the name from the most recent order or card", () => {
    const orders = [order({ createdAt: 300, customer: { name: "Samuel Ali", email: "sam@example.com" } }), order({ createdAt: 200 })];
    expect(customerList([], orders)[0].name).toBe("Samuel Ali");
  });

  test("keeps a customer who has ordered but has no card", () => {
    expect(customerList([], [order()])).toEqual([
      { name: "Sam Ali", email: "sam@example.com", orders: 1, cardCode: "", firstSeen: 200, lastSeen: 200 },
    ]);
  });

  test("counts a stamp as the customer being seen", () => {
    const cards = [card({ email: "a@example.com", name: "A", createdAt: 100, lastStampAt: 900 })];
    expect(customerList(cards, [])[0].lastSeen).toBe(900);
  });

  test("sorts by name, A to Z", () => {
    const cards = [card({ id: "1", email: "z@example.com", name: "zara" }), card({ id: "2", email: "a@example.com", name: "Adam", code: "1111" })];
    expect(customerList(cards, []).map((c) => c.name)).toEqual(["Adam", "zara"]);
  });

  test("does not change the cards or orders it is given", () => {
    const cards = Object.freeze([Object.freeze(card({ email: "a@example.com", name: "A" }))]);
    const orders = Object.freeze([Object.freeze(order())]);
    expect(() => customerList(cards, orders)).not.toThrow();
  });
});

describe("customerSheet", () => {
  test("has a bold header row, then one row per customer", () => {
    const rows = customerSheet([{ name: "Sam Ali", email: "sam@example.com", orders: 2, cardCode: "4271", firstSeen: 50, lastSeen: 300 }]);

    expect(rows[0].map((c) => c.value)).toEqual(["Name", "Email", "Orders", "Loyalty card", "First seen", "Last seen"]);
    expect(rows[0].every((c) => c.fontWeight === "bold")).toBe(true);
    expect(rows[1].map((c) => c.value)).toEqual(["Sam Ali", "sam@example.com", 2, "4271", new Date(50), new Date(300)]);
  });

  test("writes names as plain text, so a name starting with = is never a formula", () => {
    const [, row] = customerSheet([{ name: "=HYPERLINK(1)", email: "x@example.com", orders: 0, cardCode: "", firstSeen: 1, lastSeen: 1 }]);
    expect(row[0]).toMatchObject({ type: String, value: "=HYPERLINK(1)" });
  });
});

test("customersFileName names the file by the day", () => {
  expect(customersFileName(new Date(2026, 9, 14, 9).getTime())).toBe("flex-chicken-customers-2026-10-14.xlsx");
});

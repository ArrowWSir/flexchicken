import { describe, expect, test } from "vitest";
import { customerList, customerSheet, customersFileName } from "./customers";

const card = (over) => ({ id: "c1", code: "4271", name: "", email: "", ...over });

describe("customerList", () => {
  test("returns no one when there are no cards", () => {
    expect(customerList([])).toEqual([]);
  });

  test("leaves out cards with no email, as they never signed in", () => {
    expect(customerList([card({ name: "Walk-in" })])).toEqual([]);
  });

  test("gives the name, email and card code of each signed-in card", () => {
    expect(customerList([card({ name: " Sam Ali ", email: "Sam@Example.com " })])).toEqual([
      { name: "Sam Ali", email: "sam@example.com", cardCode: "4271" },
    ]);
  });

  test("keeps both cards of a customer on two devices", () => {
    const cards = [card({ id: "1", email: "sam@example.com", name: "Sam" }), card({ id: "2", email: "sam@example.com", name: "Sam", code: "1234" })];
    expect(customerList(cards).map((c) => c.cardCode)).toEqual(["1234", "4271"]);
  });

  test("sorts by name, A to Z", () => {
    const cards = [card({ id: "1", email: "z@example.com", name: "zara" }), card({ id: "2", email: "a@example.com", name: "Adam", code: "1111" })];
    expect(customerList(cards).map((c) => c.name)).toEqual(["Adam", "zara"]);
  });

  test("does not change the cards it is given", () => {
    const cards = Object.freeze([Object.freeze(card({ email: "a@example.com", name: "A" }))]);
    expect(() => customerList(cards)).not.toThrow();
  });
});

describe("customerSheet", () => {
  test("has a bold header row, then one row per customer", () => {
    const rows = customerSheet([{ name: "Sam Ali", email: "sam@example.com", cardCode: "4271" }]);

    expect(rows[0].map((c) => c.value)).toEqual(["Name", "Email", "Card code"]);
    expect(rows[0].every((c) => c.fontWeight === "bold")).toBe(true);
    expect(rows[1].map((c) => c.value)).toEqual(["Sam Ali", "sam@example.com", "4271"]);
  });

  test("writes the card code as text, so 0042 keeps its zeros", () => {
    const [, row] = customerSheet([{ name: "A", email: "a@example.com", cardCode: "0042" }]);
    expect(row[2]).toMatchObject({ type: String, value: "0042" });
  });

  test("writes names as plain text, so a name starting with = is never a formula", () => {
    const [, row] = customerSheet([{ name: "=HYPERLINK(1)", email: "x@example.com", cardCode: "1000" }]);
    expect(row[0]).toMatchObject({ type: String, value: "=HYPERLINK(1)" });
  });
});

test("customersFileName names the file by the day", () => {
  expect(customersFileName(new Date(2026, 9, 14, 9).getTime())).toBe("flex-chicken-customers-2026-10-14.xlsx");
});

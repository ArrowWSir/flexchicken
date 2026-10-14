import { describe, expect, test } from "vitest";
import { pdfContent, readSheets, todayIso, validateSheet } from "./expenses";

const NOW = Date.UTC(2026, 9, 9, 10, 0);
const input = {
  title: " Weekly  stock ",
  date: "2026-10-09",
  note: "Deliver before 11",
  lines: [
    { id: "a", item: "Chicken wings", qty: "10 kg" },
    { id: "b", item: "Burger buns", qty: "4 packs" },
    { id: "c", item: "Fryer oil", qty: "20 L" },
    { id: "d", item: "Napkins", qty: "" },
    { item: "", qty: "" },
  ],
};
const sheet = () => validateSheet(input, { id: "exp_1", now: NOW });

describe("validateSheet", () => {
  test("tidies the text, drops empty lines and keeps lines without a quantity", () => {
    const s = sheet();
    expect(s.title).toBe("Weekly stock");
    expect(s.lines.map((l) => [l.item, l.qty])).toEqual([
      ["Chicken wings", "10 kg"],
      ["Burger buns", "4 packs"],
      ["Fryer oil", "20 L"],
      ["Napkins", ""],
    ]);
    expect(s).toMatchObject({ id: "exp_1", createdAt: NOW, updatedAt: NOW });
  });

  test("keeps only the item and quantity, never a price", () => {
    const s = validateSheet({ date: "2026-10-09", lines: [{ id: "a", item: "Salt", qty: "1", price: "2.50", source: "Brakes" }] }, { id: "x", now: NOW });
    expect(s.lines[0]).toEqual({ id: "a", item: "Salt", qty: "1" });
  });

  test("needs a date and at least one item", () => {
    expect(() => validateSheet({ ...input, date: "9/10/26" }, { id: "x", now: NOW })).toThrow(/date/);
    expect(() => validateSheet({ ...input, lines: [{ item: "" }] }, { id: "x", now: NOW })).toThrow(/at least one item/);
  });

  test("a quantity without an item is refused, naming the line", () => {
    expect(() => validateSheet({ ...input, lines: [{ item: "", qty: "3" }] }, { id: "x", now: NOW })).toThrow(/Line 1 needs the item/);
  });

  test("repeated line ids are made unique", () => {
    const s = validateSheet({ ...input, lines: [{ id: "a", item: "X" }, { id: "a", item: "Y" }] }, { id: "x", now: NOW });
    expect(new Set(s.lines.map((l) => l.id)).size).toBe(2);
  });

  test("does not change what it was given", () => {
    sheet();
    expect(input.title).toBe(" Weekly  stock ");
  });
});

describe("pdfContent", () => {
  test("lays out item and quantity only, with the file name", () => {
    const pdf = pdfContent(sheet());
    expect(pdf.heading).toBe("Weekly stock");
    expect(pdf.date).toBe("Fri, 9 Oct 2026");
    expect(pdf.columns).toEqual(["#", "Item", "Qty"]);
    expect(pdf.rows[0]).toEqual(["1", "Chicken wings", "10 kg"]);
    expect(pdf.rows[3]).toEqual(["4", "Napkins", "-"]);
    expect(pdf.itemCount).toBe(4);
    expect(pdf.note).toBe("Deliver before 11");
    expect(pdf.fileName).toBe("flex-chicken-order-list-2026-10-09-weekly-stock.pdf");
  });

  test("an untitled list is called Order list", () => {
    const pdf = pdfContent(validateSheet({ date: "2026-10-09", lines: [{ item: "Salt" }] }, { id: "x", now: NOW }));
    expect(pdf.heading).toBe("Order list");
    expect(pdf.fileName).toBe("flex-chicken-order-list-2026-10-09.pdf");
  });
});

describe("storage", () => {
  test("readSheets keeps well-formed lists, newest date first", () => {
    const older = { ...sheet(), id: "old", date: "2026-10-01" };
    expect(readSheets([older, sheet(), null, { id: "bad", date: "x", lines: [] }]).map((s) => s.id)).toEqual(["exp_1", "old"]);
    expect(readSheets("nope")).toEqual([]);
  });

  test("lists saved with prices read back as item and quantity", () => {
    const old = { id: "e", date: "2026-10-01", lines: [{ id: "a", item: "Wings", qty: "2", source: "Brakes", pricePence: 4500 }] };
    expect(readSheets([old])[0].lines).toEqual([{ id: "a", item: "Wings", qty: "2" }]);
  });

  test("todayIso is the London date", () => {
    expect(todayIso(Date.UTC(2026, 9, 9, 23, 30))).toBe("2026-10-10");
  });
});

import { describe, expect, test } from "vitest";
import { knownSources, parsePrice, pdfContent, priceInput, readSheets, sheetTotals, todayIso, validateSheet } from "./expenses";

const NOW = Date.UTC(2026, 9, 9, 10, 0);
const input = {
  title: " Weekly  stock ",
  date: "2026-10-09",
  note: "Paid by card",
  lines: [
    { id: "a", item: "Chicken wings", qty: "10 kg", source: "Brakes", price: "45.00" },
    { id: "b", item: "Burger buns", qty: "4 packs", source: "Booker", price: "£6.4" },
    { id: "c", item: "Fryer oil", qty: "20 L", source: "Brakes", price: "32.99" },
    { id: "d", item: "Napkins", qty: "", source: "", price: "" },
    { item: "", qty: "", source: "", price: "" },
  ],
};
const sheet = () => validateSheet(input, { id: "exp_1", now: NOW });

describe("parsePrice", () => {
  test("reads pounds and pence, with or without the £", () => {
    expect(parsePrice("12.50")).toBe(1250);
    expect(parsePrice("£12.5")).toBe(1250);
    expect(parsePrice("1,200")).toBe(120000);
    expect(parsePrice("0")).toBe(0);
    expect(parsePrice("")).toBeNull();
    expect(parsePrice(1250)).toBe(1250);
  });

  test("refuses what is not a price", () => {
    expect(() => parsePrice("ten")).toThrow(/not a price/);
    expect(() => parsePrice("-3")).toThrow(/not a price/);
    expect(() => parsePrice("1.234")).toThrow(/not a price/);
    expect(() => parsePrice("999999")).toThrow(/can't be right/);
  });

  test("priceInput shows pence back as the editor's text", () => {
    expect(priceInput(1250)).toBe("12.50");
    expect(priceInput(null)).toBe("");
  });
});

describe("validateSheet", () => {
  test("tidies the text, drops empty lines and keeps lines without a price", () => {
    const s = sheet();
    expect(s.title).toBe("Weekly stock");
    expect(s.lines.map((l) => [l.item, l.pricePence])).toEqual([
      ["Chicken wings", 4500],
      ["Burger buns", 640],
      ["Fryer oil", 3299],
      ["Napkins", null],
    ]);
    expect(s).toMatchObject({ id: "exp_1", createdAt: NOW, updatedAt: NOW });
  });

  test("needs a date and at least one item", () => {
    expect(() => validateSheet({ ...input, date: "9/10/26" }, { id: "x", now: NOW })).toThrow(/date/);
    expect(() => validateSheet({ ...input, lines: [{ item: "" }] }, { id: "x", now: NOW })).toThrow(/at least one item/);
  });

  test("a price or source without an item is refused, naming the line", () => {
    expect(() => validateSheet({ ...input, lines: [{ item: "", price: "3" }] }, { id: "x", now: NOW })).toThrow(/Line 1 needs the item/);
  });

  test("a bad price names its item", () => {
    expect(() => validateSheet({ ...input, lines: [{ item: "Salt", price: "abc" }] }, { id: "x", now: NOW })).toThrow(/^Salt: /);
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

describe("sheetTotals", () => {
  test("adds up the priced lines and splits the spend by source", () => {
    const totals = sheetTotals(sheet());
    expect(totals).toMatchObject({ totalPence: 8439, itemCount: 4, unpricedCount: 1 });
    expect(totals.bySource).toEqual([
      { source: "Brakes", pence: 7799, items: 2 },
      { source: "Booker", pence: 640, items: 1 },
      { source: "No source given", pence: 0, items: 1 },
    ]);
  });
});

describe("pdfContent", () => {
  test("lays out the rows, the breakdown, the total and the file name", () => {
    const pdf = pdfContent(sheet());
    expect(pdf.heading).toBe("Weekly stock");
    expect(pdf.date).toBe("Fri, 9 Oct 2026");
    expect(pdf.columns).toEqual(["#", "Item", "Qty", "Source", "Price"]);
    expect(pdf.rows[0]).toEqual(["1", "Chicken wings", "10 kg", "Brakes", "£45.00"]);
    expect(pdf.rows[3]).toEqual(["4", "Napkins", "-", "-", "-"]);
    expect(pdf.bySource[0]).toEqual(["Brakes", "2", "£77.99"]);
    expect(pdf.total).toBe("£84.39");
    expect(pdf.unpricedNote).toBe("1 item has no price and is not in the total.");
    expect(pdf.fileName).toBe("flex-chicken-expenses-2026-10-09-weekly-stock.pdf");
  });

  test("leaves out the source column and breakdown when there are no sources", () => {
    const s = validateSheet({ date: "2026-10-09", lines: [{ item: "Salt", price: "2" }, { item: "Pepper", price: "3" }] }, { id: "x", now: NOW });
    const pdf = pdfContent(s);
    expect(pdf.columns).toEqual(["#", "Item", "Qty", "Price"]);
    expect(pdf.bySource).toEqual([]);
    expect(pdf.heading).toBe("Expenses");
    expect(pdf.unpricedNote).toBe("");
    expect(pdf.fileName).toBe("flex-chicken-expenses-2026-10-09.pdf");
  });
});

describe("storage", () => {
  test("readSheets keeps well-formed sheets, newest date first", () => {
    const older = { ...sheet(), id: "old", date: "2026-10-01" };
    expect(readSheets([older, sheet(), null, { id: "bad", date: "x", lines: [] }]).map((s) => s.id)).toEqual(["exp_1", "old"]);
    expect(readSheets("nope")).toEqual([]);
  });

  test("knownSources lists each source once", () => {
    expect(knownSources([sheet(), sheet()])).toEqual(["Booker", "Brakes"]);
  });

  test("todayIso is the London date", () => {
    expect(todayIso(Date.UTC(2026, 9, 9, 23, 30))).toBe("2026-10-10");
  });
});

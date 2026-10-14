import { describe, expect, test } from "vitest";
import { EMPTY_CART, addToCart } from "./cart";
import { DEFAULT_SETTINGS } from "./settings";
import { buildOrder } from "./orders";
import { buildReceipt } from "./receipt";
import { LINE_CHARS, eposText, receiptEpos, rowText, testReceiptEpos, wrapText } from "./receiptEpos";

const burger = { id: 1, name: "Cheese Burger", price: 2.49, options: [] };
const meal = {
  id: 7,
  name: "Wings Meal",
  price: 5.99,
  options: [{ label: "Drink", isRequired: true, choices: [{ label: "Coke", priceAdd: 0 }, { label: "Fanta", priceAdd: 0.5 }] }],
};
const cart = addToCart(addToCart(EMPTY_CART, meal, { Drink: "Fanta" }, 1), burger, {}, 2);
const customer = { id: "u1", name: "Sam", email: "sam@example.com", phone: "07700 900123" };
const NOW = Date.UTC(2026, 9, 5, 18, 0);
const ACCEPTED = NOW + 3 * 60_000;
const order = (over = {}) => ({ ...buildOrder({ cart, customer, mode: "collection", settings: DEFAULT_SETTINGS, sequence: 42, now: NOW }), ...over });

// The lines of text the printer would print, without the markup.
const printedText = (xml) =>
  [...xml.matchAll(/<text[^>]*>([^<]*)<\/text>/g)]
    .map((m) => m[1])
    .join("")
    .replace(/&#10;/g, "\n")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");

describe("rowText", () => {
  test("puts the price at the right edge of the paper", () => {
    const line = rowText("2 x Cheese Burger", "£4.98");
    expect(line).toHaveLength(LINE_CHARS);
    expect(line.startsWith("2 x Cheese Burger ")).toBe(true);
    expect(line.endsWith("£4.98")).toBe(true);
  });

  test("wraps a long name under itself, the price staying on the first line", () => {
    const lines = rowText("1 x " + "Very Long Name ".repeat(5).trim(), "£12.00").split("\n");
    expect(lines.length).toBeGreaterThan(1);
    expect(lines[0].endsWith("£12.00")).toBe(true);
    lines.forEach((l) => expect(l.length).toBeLessThanOrEqual(LINE_CHARS));
  });
});

describe("wrapText", () => {
  test("breaks on spaces and never past the width", () => {
    expect(wrapText("one two three four", 9)).toEqual(["one two", "three", "four"]);
  });

  test("cuts a word longer than the line", () => {
    expect(wrapText("abcdefghij", 4)).toEqual(["abcd", "efgh", "ij"]);
  });

  test("an empty text is one empty line", () => {
    expect(wrapText("", 10)).toEqual([""]);
  });
});

describe("eposText", () => {
  test("escapes XML and swaps typographic marks for ones the printer has", () => {
    expect(eposText(`Sam & <Co> "x" 'y' − ‘z’ “w” …`)).toBe("Sam &amp; &lt;Co&gt; &quot;x&quot; &apos;y&apos; - &apos;z&apos; &quot;w&quot; ...");
  });

  test("drops control characters a customer could paste in", () => {
    expect(eposText("a\u0000b\u001bc\u007f")).toBe("abc");
  });
});

describe("receiptEpos", () => {
  test("is an ePOS-Print document ending in a cut", () => {
    const xml = receiptEpos(buildReceipt(order(), ACCEPTED));
    expect(xml).toMatch(/^<epos-print xmlns="http:\/\/www\.epson-pos\.com\/schemas\/2011\/03\/epos-print">/);
    expect(xml).toMatch(/<cut type="feed"\/><\/epos-print>$/);
  });

  test("prints the order number, its lines with choices, and the total", () => {
    const text = printedText(receiptEpos(buildReceipt(order(), ACCEPTED)));
    expect(text).toContain("#0042");
    expect(text).toContain("COLLECTION");
    expect(text).toMatch(/2 x Cheese Burger +£4\.98/);
    expect(text).toContain("  - Fanta");
    expect(text).toMatch(/TOTAL +£11\.47/);
    expect(text).toContain("TO PAY AT PICKUP");
  });

  test("every line fits the 80 mm paper", () => {
    const long = order({ note: "Please ring the bell twice and leave it by the door, the dog bites ".repeat(3) });
    const text = printedText(receiptEpos(buildReceipt(long, ACCEPTED), { stampUrl: "https://flexchicken.uk/stamp?t=ABC" }));
    text.split("\n").forEach((line) => expect(line.length).toBeLessThanOrEqual(LINE_CHARS));
  });

  test("carries the stamp QR only when there is a link", () => {
    const receipt = buildReceipt(order(), ACCEPTED);
    const withQr = receiptEpos(receipt, { stampUrl: "https://flexchicken.uk/stamp?t=ABC&x=1" });
    expect(withQr).toContain('<symbol type="qrcode_model_2" level="level_m" width="8" size="0">https://flexchicken.uk/stamp?t=ABC&amp;x=1</symbol>');
    expect(printedText(withQr)).toContain("SCAN FOR YOUR FLEX STAMP");
    expect(receiptEpos(receipt)).not.toContain("<symbol");
  });

  test("what customers typed cannot add printer markup", () => {
    const sneaky = order({ note: '</text><cut type="feed"/><text>', customer: { ...customer, name: "Sam & <b>" } });
    const xml = receiptEpos(buildReceipt(sneaky, ACCEPTED));
    expect(xml.match(/<cut /g)).toHaveLength(1);
    expect(xml).toContain("Sam &amp; &lt;b&gt;");
  });
});

describe("testReceiptEpos", () => {
  test("says it is a test and when it was printed", () => {
    const text = printedText(testReceiptEpos(ACCEPTED));
    expect(text).toContain("PRINTER TEST");
    expect(text).toContain("19:03");
  });
});

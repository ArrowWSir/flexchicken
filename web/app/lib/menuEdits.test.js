import { describe, expect, test } from "vitest";
import { EMPTY_EDITS, addItem, applyMenuEdits, removeItem, setSoldOut, updateItem } from "./menuEdits";

const BASE = [
  {
    id: "burgers",
    label: "Burgers",
    items: [
      { id: 1, slug: "cheese-burger", name: "Cheese Burger", price: 2.49, options: [] },
      { id: 2, slug: "hot-honey-burger", name: "Hot Honey Burger", price: 4.99, options: [] },
    ],
  },
  { id: "drinks", label: "Drinks", items: [{ id: 3, slug: "pepsi", name: "Pepsi", price: 1.29, options: [] }] },
];

describe("applyMenuEdits", () => {
  test("no edits leaves the menu as generated", () => {
    expect(applyMenuEdits(BASE, EMPTY_EDITS)).toEqual(
      BASE.map((c) => ({ ...c, items: c.items.map((i) => ({ ...i, categoryId: c.id, isSoldOut: false })) }))
    );
  });

  test("an update changes the fields given and re-splits the title when the name changes", () => {
    const edits = updateItem(EMPTY_EDITS, 1, { price: 2.99, name: "Big Cheese Burger" });
    const item = applyMenuEdits(BASE, edits)[0].items[0];
    expect(item).toMatchObject({ price: 2.99, name: "Big Cheese Burger", titleLight: "Big Cheese", titleBold: "Burger" });
  });

  test("a removed item disappears", () => {
    const edits = removeItem(EMPTY_EDITS, 2);
    expect(applyMenuEdits(BASE, edits)[0].items.map((i) => i.id)).toEqual([1]);
  });

  test("an added item lands in its category with a new id", () => {
    const edits = addItem(EMPTY_EDITS, { categoryId: "burgers", name: "Flex Tower", price: 6.5 }, () => "abc");
    const items = applyMenuEdits(BASE, edits)[0].items;
    expect(items.at(-1)).toMatchObject({ id: "new-abc", name: "Flex Tower", price: 6.5, categoryId: "burgers", options: [] });
  });

  test("an item can be moved to another category", () => {
    const edits = updateItem(EMPTY_EDITS, 3, { categoryId: "burgers" });
    const menu = applyMenuEdits(BASE, edits);
    expect(menu[0].items.map((i) => i.id)).toContain(3);
    expect(menu[1].items).toEqual([]);
  });

  test("sold out is a flag, not a removal", () => {
    const edits = setSoldOut(EMPTY_EDITS, 1, true);
    expect(applyMenuEdits(BASE, edits)[0].items[0].isSoldOut).toBe(true);
  });

  test("edits never change the menu they were given", () => {
    const edits = updateItem(EMPTY_EDITS, 1, { price: 9 });
    applyMenuEdits(BASE, edits);
    expect(BASE[0].items[0].price).toBe(2.49);
    expect(EMPTY_EDITS.updated).toEqual({});
  });

  test("rejects a negative or non-numeric price", () => {
    expect(() => updateItem(EMPTY_EDITS, 1, { price: -1 })).toThrow(/price/i);
    expect(() => addItem(EMPTY_EDITS, { categoryId: "burgers", name: "X", price: "free" })).toThrow(/price/i);
  });

  test("rejects an empty name", () => {
    expect(() => addItem(EMPTY_EDITS, { categoryId: "burgers", name: "  ", price: 1 })).toThrow(/name/i);
  });
});

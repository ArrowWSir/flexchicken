import { describe, expect, test } from "vitest";
import {
  EMPTY_CART,
  MAX_QTY,
  addToCart,
  cartSummary,
  defaultSelections,
  formatPrice,
  loadCart,
  missingRequired,
  removeLine,
  saveCart,
  setLineQty,
  toPence,
  unitPence,
} from "./cart";

const burgerMeal = {
  id: 10,
  name: "Hot Honey Burger Meal",
  price: 6.99,
  options: [
    { label: "Make It Cheesy", isRequired: false, choices: [{ label: "Add Cheese", priceAdd: 0.39 }] },
    { label: "Drink", isRequired: true, choices: [{ label: "Pepsi", priceAdd: 0 }, { label: "Water", priceAdd: 0 }] },
  ],
};
const pepsi = { id: 20, name: "Pepsi", price: 1.29, options: [] };

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

describe("money", () => {
  test("converts pounds to whole pence without float drift", () => {
    expect(toPence(6.99)).toBe(699);
    expect(toPence(0.39)).toBe(39);
    expect(toPence(1.005)).toBe(101);
  });

  test("formats pence as pounds", () => {
    expect(formatPrice(738)).toBe("£7.38");
    expect(formatPrice(0)).toBe("£0.00");
  });

  test("a unit price adds the chosen extras", () => {
    expect(unitPence(burgerMeal, { "Make It Cheesy": "Add Cheese", Drink: "Pepsi" })).toBe(738);
    expect(unitPence(burgerMeal, { Drink: "Pepsi" })).toBe(699);
  });
});

describe("options", () => {
  test("reports required options that have no choice yet", () => {
    expect(missingRequired(burgerMeal, {})).toEqual(["Drink"]);
    expect(missingRequired(burgerMeal, { Drink: "Water" })).toEqual([]);
  });

  test("a required option with a single choice is pre-selected", () => {
    const item = { ...pepsi, options: [{ label: "Fries", isRequired: true, choices: [{ label: "Regular Fries", priceAdd: 0 }] }] };
    expect(defaultSelections(item)).toEqual({ Fries: "Regular Fries" });
  });

  test("ignores a choice that the item does not offer", () => {
    expect(missingRequired(burgerMeal, { Drink: "Champagne" })).toEqual(["Drink"]);
    expect(unitPence(burgerMeal, { Drink: "Pepsi", "Make It Cheesy": "Gold Leaf" })).toBe(699);
  });
});

describe("addToCart", () => {
  test("adds a new line with its quantity and price", () => {
    const cart = addToCart(EMPTY_CART, pepsi, {}, 2);
    expect(cart.lines).toHaveLength(1);
    expect(cart.lines[0]).toMatchObject({ itemId: 20, name: "Pepsi", qty: 2, unitPence: 129 });
  });

  test("the same item with the same choices stacks onto one line", () => {
    const once = addToCart(EMPTY_CART, burgerMeal, { Drink: "Pepsi" }, 1);
    const twice = addToCart(once, burgerMeal, { Drink: "Pepsi" }, 2);
    expect(twice.lines).toHaveLength(1);
    expect(twice.lines[0].qty).toBe(3);
  });

  test("different choices make separate lines", () => {
    const a = addToCart(EMPTY_CART, burgerMeal, { Drink: "Pepsi" }, 1);
    const b = addToCart(a, burgerMeal, { Drink: "Water" }, 1);
    expect(b.lines).toHaveLength(2);
  });

  test("does not change the cart it was given", () => {
    const before = addToCart(EMPTY_CART, pepsi, {}, 1);
    addToCart(before, pepsi, {}, 1);
    expect(before.lines[0].qty).toBe(1);
    expect(EMPTY_CART.lines).toEqual([]);
  });

  test("refuses an item whose required options are missing", () => {
    expect(() => addToCart(EMPTY_CART, burgerMeal, {}, 1)).toThrow(/Drink/);
  });

  test("caps the quantity of a line", () => {
    const cart = addToCart(EMPTY_CART, pepsi, {}, MAX_QTY + 5);
    expect(cart.lines[0].qty).toBe(MAX_QTY);
  });

  test("ignores a quantity below one", () => {
    expect(addToCart(EMPTY_CART, pepsi, {}, 0)).toBe(EMPTY_CART);
  });
});

describe("editing lines", () => {
  test("sets a line's quantity, and zero removes it", () => {
    const cart = addToCart(EMPTY_CART, pepsi, {}, 1);
    const key = cart.lines[0].key;
    expect(setLineQty(cart, key, 4).lines[0].qty).toBe(4);
    expect(setLineQty(cart, key, 0).lines).toEqual([]);
  });

  test("removes a line", () => {
    const cart = addToCart(EMPTY_CART, pepsi, {}, 1);
    expect(removeLine(cart, cart.lines[0].key).lines).toEqual([]);
  });
});

describe("cartSummary", () => {
  test("counts items and totals the pence", () => {
    const cart = addToCart(addToCart(EMPTY_CART, pepsi, {}, 2), burgerMeal, { Drink: "Pepsi", "Make It Cheesy": "Add Cheese" }, 1);
    expect(cartSummary(cart)).toEqual({ count: 3, subtotalPence: 996 });
  });
});

describe("storage", () => {
  test("round-trips through storage", () => {
    const storage = memoryStorage();
    const cart = addToCart(EMPTY_CART, pepsi, {}, 2);
    saveCart(storage, cart);
    expect(loadCart(storage)).toEqual(cart);
  });

  test("drops corrupt or malformed data", () => {
    const storage = memoryStorage();
    storage.setItem("fc_cart", "{not json");
    expect(loadCart(storage)).toEqual(EMPTY_CART);
    storage.setItem("fc_cart", JSON.stringify({ lines: [{ key: "x", qty: -3 }] }));
    expect(loadCart(storage)).toEqual(EMPTY_CART);
  });

  test("never throws when storage is blocked", () => {
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(loadCart(blocked)).toEqual(EMPTY_CART);
    expect(() => saveCart(blocked, EMPTY_CART)).not.toThrow();
  });
});

describe("formatPriceShort", () => {
  test("drops .00 from whole pounds, keeps pence otherwise", async () => {
    const { formatPriceShort } = await import("./cart");
    expect(formatPriceShort(1500)).toBe("£15");
    expect(formatPriceShort(1250)).toBe("£12.50");
  });
});

describe("mergeCart (the full menu's picks into the Box)", () => {
  test("adds every picked line to the Box in one go", async () => {
    const { mergeCart } = await import("./cart");
    const picks = addToCart(addToCart(EMPTY_CART, pepsi, {}, 2), burgerMeal, { Drink: "Water" }, 1);
    const box = mergeCart(EMPTY_CART, picks);
    expect(box.lines.map((l) => [l.name, l.qty])).toEqual([
      ["Pepsi", 2],
      ["Hot Honey Burger Meal", 1],
    ]);
  });

  test("the same dish with the same choices adds to the line already in the Box", async () => {
    const { mergeCart } = await import("./cart");
    const box = addToCart(EMPTY_CART, burgerMeal, { Drink: "Water" }, 1);
    const picks = addToCart(addToCart(EMPTY_CART, burgerMeal, { Drink: "Water" }, 2), burgerMeal, { Drink: "Pepsi" }, 1);
    const merged = mergeCart(box, picks);
    expect(merged.lines.map((l) => [l.key, l.qty])).toEqual([
      ["10|Drink=Water", 3],
      ["10|Drink=Pepsi", 1],
    ]);
  });

  test("never goes past the most of one line the Box allows", async () => {
    const { mergeCart } = await import("./cart");
    const box = addToCart(EMPTY_CART, pepsi, {}, MAX_QTY - 1);
    const merged = mergeCart(box, addToCart(EMPTY_CART, pepsi, {}, 5));
    expect(cartSummary(merged).count).toBe(MAX_QTY);
  });

  test("leaves both carts as they were", async () => {
    const { mergeCart } = await import("./cart");
    const box = addToCart(EMPTY_CART, pepsi, {}, 1);
    const picks = addToCart(EMPTY_CART, pepsi, {}, 1);
    mergeCart(box, picks);
    expect(box.lines[0].qty).toBe(1);
    expect(picks.lines[0].qty).toBe(1);
  });
});

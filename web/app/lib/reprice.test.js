import { describe, expect, test } from "vitest";
import { MAX_LINES, repriceCart } from "./reprice";

const MENU = [
  {
    id: "wraps",
    items: [
      {
        id: 1627,
        name: "Chicken Wrap",
        price: 4.49,
        image: "/menu/chicken-wrap.webp",
        isSoldOut: false,
        options: [{ label: "Make It Cheesy", isRequired: false, choices: [{ label: "Add Cheese", priceAdd: 0.39 }] }],
      },
      {
        id: 1700,
        name: "Meal",
        price: 6,
        isSoldOut: false,
        options: [{ label: "Drink", isRequired: true, choices: [{ label: "Cola", priceAdd: 0 }, { label: "Pepsi", priceAdd: 0.2 }] }],
      },
      { id: "add_x1", name: "Owner Special", price: 3, isSoldOut: true, options: [] },
    ],
  },
];

const line = (over) => ({
  key: "k",
  itemId: 1627,
  name: "Chicken Wrap",
  image: null,
  choices: [],
  unitPence: 449,
  qty: 1,
  ...over,
});

describe("repriceCart", () => {
  test("uses the menu's price, not the one the browser sent", () => {
    const cart = repriceCart({ lines: [line({ unitPence: 1, name: "Cheap" })] }, MENU);
    expect(cart.lines[0].unitPence).toBe(449);
    expect(cart.lines[0].name).toBe("Chicken Wrap");
  });

  test("adds the menu's price for each chosen option", () => {
    const cart = repriceCart({ lines: [line({ choices: [{ option: "Make It Cheesy", choice: "Add Cheese", priceAdd: 0 }] })] }, MENU);
    expect(cart.lines[0].unitPence).toBe(488);
    expect(cart.lines[0].choices).toEqual([{ option: "Make It Cheesy", choice: "Add Cheese", priceAdd: 0.39 }]);
  });

  test("drops choices the item does not offer", () => {
    const cart = repriceCart({ lines: [line({ choices: [{ option: "Free Gold", choice: "Yes", priceAdd: -4 }] })] }, MENU);
    expect(cart.lines[0].choices).toEqual([]);
    expect(cart.lines[0].unitPence).toBe(449);
  });

  test("refuses an item that is no longer on the menu", () => {
    expect(() => repriceCart({ lines: [line({ itemId: 9999, name: "Old Thing" })] }, MENU)).toThrow(/Old Thing is no longer on the menu/);
  });

  test("refuses a sold-out item", () => {
    expect(() => repriceCart({ lines: [line({ itemId: "add_x1", name: "Owner Special" })] }, MENU)).toThrow(/Owner Special is sold out/);
  });

  test("refuses a meal with a required choice missing", () => {
    expect(() => repriceCart({ lines: [line({ itemId: 1700, name: "Meal" })] }, MENU)).toThrow(/Choose: Drink/);
  });

  test("refuses quantities outside 1 to 20", () => {
    expect(() => repriceCart({ lines: [line({ qty: 0 })] }, MENU)).toThrow(/quantity/);
    expect(() => repriceCart({ lines: [line({ qty: 21 })] }, MENU)).toThrow(/quantity/);
    expect(() => repriceCart({ lines: [line({ qty: 1.5 })] }, MENU)).toThrow(/quantity/);
  });

  test("refuses an empty or oversized Box", () => {
    expect(() => repriceCart({ lines: [] }, MENU)).toThrow(/empty/);
    expect(() => repriceCart(null, MENU)).toThrow(/empty/);
    const many = Array.from({ length: MAX_LINES + 1 }, (_, i) => line({ key: `k${i}` }));
    expect(() => repriceCart({ lines: many }, MENU)).toThrow(/too many/i);
  });
});

import { describe, expect, test } from "vitest";
import { buildMenu, cleanName, splitTitle } from "./menuBuild";
import { MENU_BOARD } from "./menuBoard";

const product = (over) => ({
  id: 1,
  name: "4 Spicy Wings",
  slug: "4-spicy-wings",
  price: 2.29,
  description: "",
  options: [],
  ...over,
});

const section = (anchor, ids) => ({ anchor, title: anchor, product_ids: ids });

describe("cleanName", () => {
  test("fixes the typos carried over from the live site", () => {
    expect(cleanName("Onion Ringas x 12")).toBe("Onion Rings x 12");
    expect(cleanName("Mozzarella Stick x 7")).toBe("Mozzarella Sticks x 7");
    expect(cleanName("Whole chicken")).toBe("Whole Chicken");
    expect(cleanName("Family Wings deals")).toBe("Family Wings Deal");
  });

  test("leaves good names alone", () => {
    expect(cleanName("Hot Honey Burger Meal")).toBe("Hot Honey Burger Meal");
  });
});

describe("splitTitle", () => {
  test("puts the last word in bold", () => {
    expect(splitTitle("4 Spicy Wings")).toEqual({ titleLight: "4 Spicy", titleBold: "Wings" });
  });

  test("keeps 'Meal' with the word before it", () => {
    expect(splitTitle("Hot Honey Burger Meal")).toEqual({ titleLight: "Hot Honey", titleBold: "Burger Meal" });
  });

  test("keeps 'Box Meal' with the word before it", () => {
    expect(splitTitle("1/2 Pounder Burger Box Meal")).toEqual({
      titleLight: "1/2 Pounder",
      titleBold: "Burger Box Meal",
    });
  });

  test("keeps a count with its noun", () => {
    expect(splitTitle("BBQ Wings x 12")).toEqual({ titleLight: "BBQ", titleBold: "Wings x 12" });
  });

  test("a one-word name is all bold", () => {
    expect(splitTitle("Pepsi")).toEqual({ titleLight: "", titleBold: "Pepsi" });
  });

  test("a two-word name stays together in bold", () => {
    expect(splitTitle("Coca Cola")).toEqual({ titleLight: "", titleBold: "Coca Cola" });
  });

  test("keeps a trailing number with the words before it", () => {
    expect(splitTitle("Flex Combo Meal 1")).toEqual({ titleLight: "Flex", titleBold: "Combo Meal 1" });
  });

  test("keeps a bracketed size with its noun", () => {
    expect(splitTitle("Onion Rings (12 Pcs)")).toEqual({ titleLight: "Onion", titleBold: "Rings (12 Pcs)" });
    expect(splitTitle("Fries (Large)")).toEqual({ titleLight: "", titleBold: "Fries (Large)" });
  });

  test("keeps a dashed size with its noun, and Meal with it", () => {
    expect(splitTitle("BBQ Ribs – 12 Piece")).toEqual({ titleLight: "BBQ", titleBold: "Ribs – 12 Piece" });
    expect(splitTitle("Peri Peri Wings Meal – Half")).toEqual({ titleLight: "Peri Peri", titleBold: "Wings Meal – Half" });
  });
});

describe("buildMenu", () => {
  const build = (board, over = {}) => buildMenu({ products: [], sections: [], hasImage: () => false, board, ...over });

  test("follows the board: its sections, its order, its names and prices", () => {
    const menu = build(
      [
        {
          id: "wings",
          label: "Wings",
          short: "Wings",
          icon: "drumstick",
          items: [
            { from: 2, name: "8 Spicy Wings", price: 3.99 },
            { from: 1, name: "4 Spicy Wings", price: 2.49 },
          ],
        },
      ],
      { products: [product({ id: 1 }), product({ id: 2, name: "8 wings", slug: "8-spicy-wings", price: 9 })] },
    );
    expect(menu.categories.map((c) => c.id)).toEqual(["wings"]);
    expect(menu.categories[0]).toMatchObject({ label: "Wings", short: "Wings", icon: "drumstick" });
    expect(menu.categories[0].items.map((i) => [i.id, i.name, i.price, i.categoryId])).toEqual([
      [2, "8 Spicy Wings", 3.99, "wings"],
      [1, "4 Spicy Wings", 2.49, "wings"],
    ]);
  });

  test("takes options without trailing colons, description and photo from the product", () => {
    const options = [
      { label: "Make It Cheesy:", required: false, choices: [{ label: "Add Cheese", price_add: 0.39 }] },
    ];
    const menu = build([{ id: "c", items: [{ from: 1, name: "2 Piece Chicken Meal", price: 5.99 }] }], {
      products: [product({ slug: "2-piece-chicken-meal", description: "Served hot.", options })],
      hasImage: (slug) => slug === "2-piece-chicken-meal",
    });
    expect(menu.categories[0].items[0]).toMatchObject({
      slug: "2-piece-chicken-meal",
      description: "Served hot.",
      isMeal: true,
      image: "/menu/2-piece-chicken-meal.webp",
      options: [{ label: "Make It Cheesy", isRequired: false, choices: [{ label: "Add Cheese", priceAdd: 0.39 }] }],
    });
  });

  test("a board photo or description replaces the product's own", () => {
    const menu = build(
      [{ id: "w", items: [{ from: 1, name: "Chicken Wrap", price: 4.49, photo: "chicken-wrap", description: "New." }] }],
      { products: [product({ slug: "chicken-wrap-3", description: "Old." })], hasImage: (slug) => slug === "chicken-wrap" },
    );
    expect(menu.categories[0].items[0]).toMatchObject({ image: "/menu/chicken-wrap.webp", description: "New." });
  });

  test("a dish drawn on the plate shows that picture rather than its photo", () => {
    const menu = build([{ id: "w", items: [{ id: "4-spicy-wings", name: "4 Spicy Wings", price: 2.49 }] }], {
      products: [],
      hasImage: () => true,
      isPlated: (slug) => slug === "4-spicy-wings",
    });
    expect(menu.categories[0].items[0].image).toBe("/menu/plated/4-spicy-wings.webp");
  });

  test("a new dish shows the picture saved under its own id", () => {
    const menu = build([{ id: "r", items: [{ id: "bbq-ribs-2", name: "BBQ Ribs – 2 Piece", price: 4.89 }] }], {
      products: [],
      hasImage: (slug) => slug === "bbq-ribs-2",
    });
    expect(menu.categories[0].items[0].image).toBe("/menu/bbq-ribs-2.webp");
  });

  test("a new dish gets its own id and copies options from the products it names", () => {
    const heat = { label: "Heat", required: true, choices: [{ label: "Hot", price_add: 0 }] };
    const drink = { label: "Drink", required: true, choices: [{ label: "Pepsi", price_add: 0 }] };
    const menu = build([{ id: "p", items: [{ id: "pp-meal", name: "Peri Meal", price: 9.99, optionsFrom: [1, 2] }] }], {
      products: [product({ id: 1, options: [heat] }), product({ id: 2, options: [{ ...heat, choices: [] }, drink] })],
    });
    const item = menu.categories[0].items[0];
    expect(item).toMatchObject({ id: "pp-meal", slug: "pp-meal", description: "", image: null, isMeal: true });
    expect(item.options.map((o) => [o.label, o.choices.length])).toEqual([
      ["Heat", 1],
      ["Drink", 1],
    ]);
  });

  test("a section can list a live-site section as it is, cheapest first", () => {
    const menu = build([{ id: "drinks", label: "Drinks", section: "drinks" }], {
      products: [product({ id: 7, name: "Pepsi", price: 1.29 }), product({ id: 8, name: "Water", price: 0.99 })],
      sections: [section("drinks", [7, 8, 99])],
    });
    expect(menu.categories[0].items.map((i) => i.name)).toEqual(["Water", "Pepsi"]);
  });

  test("fails loudly when the board names a product the site data does not have", () => {
    expect(() => build([{ id: "x", items: [{ from: 404, name: "Ghost", price: 1 }] }])).toThrow(/404/);
  });

  test("fails loudly when one item has two prices on the board", () => {
    const board = [
      { id: "a", items: [{ from: 1, name: "4 Spicy Wings", price: 2.29 }] },
      { id: "b", items: [{ from: 1, name: "4 Spicy Wings", price: 2.49 }] },
    ];
    expect(() => build(board, { products: [product()] })).toThrow(/two prices|differs/);
  });

  test("skips sections that end up empty", () => {
    expect(build([{ id: "drinks", section: "drinks" }]).categories).toEqual([]);
  });
});

describe("the printed board", () => {
  const ids = MENU_BOARD.flatMap((s) => s.items ?? []).map((i) => i.from ?? i.id);

  test("every item has a name, a price and exactly one of from or id", () => {
    for (const item of MENU_BOARD.flatMap((s) => s.items ?? [])) {
      expect(item.name).toBeTruthy();
      expect(item.price).toBeGreaterThan(0);
      expect(Boolean(item.from) !== Boolean(item.id)).toBe(true);
    }
  });

  test("has ten board sections plus drinks, so the badge grid fills two rows", () => {
    expect(MENU_BOARD.filter((s) => s.items).length).toBe(10);
    expect(MENU_BOARD.at(-1).id).toBe("drinks");
  });

  test("new dishes have ids no live product uses", () => {
    expect(ids.filter((id) => typeof id === "string").every((id) => !/^\d+$/.test(id))).toBe(true);
  });
});

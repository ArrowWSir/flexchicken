// Shared steps for the menu stage. Not a spec file, so Playwright does not run it.

// The cheapest burger on the board, with no options: one tap adds it.
export const SIMPLE_DISH = { category: "Burgers", name: "Cheeseburger", pence: 238 };

/** Puts one named dish on the stage, ready for "One more" and "Add to Box". */
export async function showDish(page, { category, name }) {
  await page.getByRole("button", { name: category, exact: true }).click();
  await page.getByRole("button", { name: /^All dishes/ }).click();
  await page.getByRole("list", { name: "Dishes" }).getByRole("button", { name, exact: true }).click();
}

import { expect, test } from "@playwright/test";

// The full menu (/order): pick several dishes, add them all to the Box at
// once, then go on to checkout.

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("several dishes, one with a choice, go into the Box together and on to checkout", async ({ page }) => {
  await page.getByRole("link", { name: "Explore full menu" }).click();
  await expect(page).toHaveURL(/\/order$/);
  await expect(page.getByRole("heading", { level: 1, name: /Full menu/i })).toBeVisible();
  // Every section of the turning table is here, in its order.
  await expect(page.getByRole("heading", { level: 2, name: "Burgers" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Drinks" })).toBeVisible();

  // A plain dish: Add, then one more.
  await page.getByRole("button", { name: "Add Cheeseburger", exact: true }).click();
  await page.getByRole("group", { name: "Cheeseburger quantity" }).getByRole("button", { name: "One more" }).click();

  // A meal needs its drink first.
  await page.getByRole("button", { name: "Choose Hot Honey Burger Meal" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("button", { name: /Choose drink/i })).toBeDisabled();
  await sheet.getByText("Coca Cola").click();
  await sheet.getByRole("button", { name: "Add to my picks" }).click();
  // The page behind a sheet is hidden from the accessibility tree until it has closed.
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("list", { name: "Hot Honey Burger Meal as you made it" }).getByText(/Coca Cola/)).toBeVisible();

  // Nothing is in the Box until the picks are added together.
  await expect(page.getByRole("button", { name: "Open your Flex Box, 0 items" })).toBeVisible();
  await page.getByRole("button", { name: /^Add 3 dishes to Box · £/ }).click();
  await expect(page.getByRole("button", { name: /Open your Flex Box, 3 items/ })).toBeVisible();
  await expect(page.getByText("Added 3 dishes")).toBeVisible();

  await page.getByRole("link", { name: "Go to Box" }).click();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByText("2 × Cheeseburger")).toBeVisible();
  await expect(page.getByText("1 × Hot Honey Burger Meal")).toBeVisible();
});

test("a pick taken back to nothing leaves the list, and Clear empties the picks", async ({ page }) => {
  await page.goto("/order");
  await page.getByRole("button", { name: "Add Cheeseburger", exact: true }).click();
  await page.getByRole("group", { name: "Cheeseburger quantity" }).getByRole("button", { name: "One fewer" }).click();
  await expect(page.getByRole("button", { name: "Add Cheeseburger", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Add Cheeseburger", exact: true }).click();
  await page.getByRole("button", { name: "Clear" }).click();
  await expect(page.getByRole("button", { name: /^Add \d+ dish/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add Cheeseburger", exact: true })).toBeVisible();
});

import { expect, test } from "@playwright/test";
import { SIMPLE_DISH, showDish } from "./menu.mjs";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("loyalty card shows 8 stamp places and the 9th-visit surprise", async ({ page }) => {
  await page.goto("/?stamps=3");
  await expect(page.getByText("3 / 8 stamps")).toBeVisible();
  await expect(page.getByText("5 stamps to your surprise")).toBeVisible();
});

test("a badge switches the table and the dish names", async ({ page }) => {
  await page.getByRole("button", { name: "Burgers", exact: true }).click();
  await expect(page.getByRole("button", { name: "Burgers", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { level: 3, name: "Burgers" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^All dishes/ })).toHaveAttribute("aria-expanded", "false");
  // Folded: out of reach for taps, keyboard and screen readers.
  await expect(page.getByRole("list", { name: "Dishes" }).locator("xpath=ancestor::*[@inert]")).toHaveCount(1);
  await page.getByRole("button", { name: /^All dishes/ }).click();
  await expect(page.getByRole("list", { name: "Dishes" }).getByRole("button").first()).toHaveText("Chicken Fillet Burger");
  await expect(page.getByRole("list", { name: "Dishes" }).locator("xpath=ancestor::*[@inert]")).toHaveCount(0);
});

test("a simple item goes straight into the Box with its quantity", async ({ page }) => {
  await showDish(page, SIMPLE_DISH);
  await page.getByRole("button", { name: "One more" }).first().click();
  await page.getByRole("button", { name: /^Add to Box: \d+ × / }).click();
  await expect(page.getByText(/Added 2 × Cheeseburger/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Open your Flex Box, 2 items/ })).toBeVisible();
});

test("adding sends the dish flying into the Box, and it lands", async ({ page }) => {
  await showDish(page, SIMPLE_DISH);
  await page.getByRole("button", { name: /^Add to Box: \d+ × / }).click();
  await expect(page.locator(".fly-to-box img")).toHaveCount(1);
  // Gone once it lands (the flight is under a second).
  await expect(page.locator(".fly-to-box")).toHaveCount(0);
});

test("a meal asks for its drink first, then adds with the extra price", async ({ page }) => {
  await page.getByRole("button", { name: "Burger Meals", exact: true }).click();
  await page.getByRole("button", { name: /^All dishes/ }).click();
  await page.getByRole("list", { name: "Dishes" }).getByRole("button", { name: "Hot Honey Burger Meal" }).click();
  await page.getByRole("button", { name: /^Add to Box: \d+ × / }).click();

  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name: "Hot Honey Burger Meal" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: /Choose drink/i })).toBeDisabled();
  await sheet.getByText("Coca Cola").click();
  await sheet.getByRole("button", { name: "Add to Box" }).click();

  await page.getByRole("button", { name: /Open your Flex Box, 1 item/ }).click();
  await expect(page.getByRole("dialog").getByText("Regular Fries · Coca Cola")).toBeVisible();
  await expect(page.getByRole("dialog").getByText("£6.99").first()).toBeVisible();
});

test("buy now takes the item to checkout", async ({ page }) => {
  await showDish(page, SIMPLE_DISH);
  await page.getByRole("button", { name: /^Buy now: \d+ × / }).click();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByText("1 × Cheeseburger")).toBeVisible();
  await expect(page.getByText(/Card payment by Teya is being connected/)).toBeVisible();
});

test("the cart survives a reload", async ({ page }) => {
  await showDish(page, SIMPLE_DISH);
  await page.getByRole("button", { name: /^Add to Box: \d+ × / }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: /Open your Flex Box, 1 item/ })).toBeVisible();
});

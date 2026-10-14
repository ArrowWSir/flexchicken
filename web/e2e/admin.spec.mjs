import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";
import { SIMPLE_DISH, showDish } from "./menu.mjs";

// The shop and the admin open side by side in one browser, as on a till that
// shares the local store. Each test starts from empty storage.
async function shopAndAdmin(browser, startAt) {
  const context = await browser.newContext(test.info().project.use);
  const shop = await context.newPage();
  await shop.goto("/");
  await shop.evaluate(() => localStorage.clear());
  await shop.reload();
  const admin = await context.newPage();
  await admin.goto(startAt);
  await admin.getByLabel("Shift code").fill("2580");
  await admin.getByRole("button", { name: "Unlock" }).click();
  return { shop, admin };
}

test("admin is two rooms: Service for orders and cards, Studio for editing", async ({ browser }) => {
  const { admin } = await shopAndAdmin(browser, "/admin");
  await expect(admin.getByRole("heading", { name: "Service" })).toBeVisible();
  await expect(admin.getByRole("heading", { name: "Studio" })).toBeVisible();
  await admin.getByRole("navigation", { name: "Admin rooms" }).getByRole("link", { name: "Studio" }).click();
  await expect(admin).toHaveURL(/\/admin\/menu$/);
  const pages = admin.getByRole("navigation", { name: "Studio pages" });
  for (const name of ["Menu", "Offers", "Shop", "Staff"]) await expect(pages.getByRole("link", { name: new RegExp(name) })).toBeVisible();
});

test("the counter finds a card by its 4-digit code and stamps it; the customer sees it at once", async ({ browser }) => {
  const { shop, admin } = await shopAndAdmin(browser, "/admin/cards");
  const codeText = await shop.getByText(/^#\d{4}$/).first().textContent();
  const code = codeText.replace("#", "");

  await admin.getByPlaceholder(/Card code/).fill(code);
  await admin.getByRole("button", { name: `Add a stamp to card ${code}` }).click();
  await admin.getByRole("button", { name: `Add a stamp to card ${code}` }).click();
  await expect(admin.getByText(`Stamp added to ${code}: 2 of 8.`)).toBeVisible();
  await expect(shop.getByText("2 / 8 stamps")).toBeVisible();

  admin.once("dialog", (dialog) => dialog.accept());
  await admin.getByRole("button", { name: `Take a stamp back from card ${code}` }).click();
  await expect(shop.getByText("1 / 8 stamps")).toBeVisible();
});

test("an offer made in Studio shows under the card and comes off the Box", async ({ browser }) => {
  const { shop, admin } = await shopAndAdmin(browser, "/admin/offers");
  await admin.getByRole("button", { name: "New offer" }).click();
  await admin.getByText("Buy one, get one free", { exact: true }).click();
  await admin.getByPlaceholder("e.g. Wing Wednesday").fill("2 for 1 Cheese Burgers");
  await admin.getByLabel("Filter dishes").fill("cheeseburger");
  await admin.getByRole("checkbox", { name: SIMPLE_DISH.name, exact: true }).check();
  await admin.getByRole("button", { name: "Save offer" }).click();
  await expect(admin.getByText("Live", { exact: true })).toBeVisible();

  const offers = shop.getByRole("region", { name: "Offers" });
  await expect(offers.getByText("2 for 1 Cheese Burgers")).toBeVisible();
  await expect(offers.getByText("Buy 1 get 1 free")).toBeVisible();

  await showDish(shop, SIMPLE_DISH);
  await shop.getByRole("button", { name: "One more" }).first().click();
  await shop.getByRole("button", { name: /^Add to Box: 2 × Cheeseburger/ }).click();
  await shop.getByRole("button", { name: /Open your Flex Box/ }).click();
  await expect(shop.getByText("Offer: 2 for 1 Cheese Burgers")).toBeVisible();
  await expect(shop.getByText("−£2.38")).toBeVisible();

  // Paused: gone from the site, and from the price.
  await admin.getByRole("button", { name: "Pause 2 for 1 Cheese Burgers" }).click();
  await expect(offers).toHaveCount(0);
  await expect(shop.getByText("Offer: 2 for 1 Cheese Burgers")).toHaveCount(0);
});

test("customers can download the menu", async ({ page }) => {
  await page.goto("/");
  await page.locator("#menu").getByRole("link", { name: "Menu" }).click();
  await expect(page).toHaveURL(/\/full-menu$/);
  await expect(page.getByRole("heading", { level: 2, name: "Burgers" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save as PDF or print" })).toBeVisible();
});

test("the owner changes the driver code, like a password, and the driver screen takes the new one", async ({ browser }) => {
  const { admin } = await shopAndAdmin(browser, "/admin/staff");
  const codes = admin.getByRole("region", { name: "Shift codes" });
  await codes.getByText("Driver code", { exact: true }).click();
  await codes.getByLabel("Your current owner's code").fill("0000");
  await codes.getByLabel("New code (4 to 8 digits)").fill("246813");
  await codes.getByLabel("New code again").fill("246813");
  await codes.getByRole("button", { name: "Change code" }).click();
  await expect(codes.getByRole("alert")).toHaveText("Your current owner's code is not right.");
  await codes.getByLabel("Your current owner's code").fill("2580");
  await codes.getByRole("button", { name: "Change code" }).click();
  await expect(codes.getByRole("status")).toContainText("Driver code changed");

  const driver = await admin.context().newPage();
  await driver.goto("/driver");
  await driver.getByLabel("Your name").fill("Ali");
  await driver.getByLabel("Shift code").fill("1111");
  await driver.getByRole("button", { name: "Unlock" }).click();
  await expect(driver.getByText("That code is not right.")).toBeVisible();
  await driver.getByLabel("Shift code").fill("246813");
  await driver.getByRole("button", { name: "Unlock" }).click();
  await expect(driver.getByRole("tablist", { name: "Deliveries" })).toBeVisible();
});

test("the owner downloads signed-in customers' names, emails and card codes as an Excel file", async ({ browser }) => {
  const { shop, admin } = await shopAndAdmin(browser, "/admin/cards");
  const code = (await shop.getByText(/^#\d{4}$/).first().textContent()).replace("#", "");
  await shop.goto("/account");
  await shop.getByRole("button", { name: "Sign in", exact: true }).click();
  await shop.getByRole("button", { name: "Continue with Google" }).click();
  await shop.getByLabel("Name").fill("Priya Shah");
  await shop.getByLabel("Email").fill("Priya@Example.com");
  await shop.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(admin.getByText("priya@example.com")).toBeVisible();

  const [download] = await Promise.all([admin.waitForEvent("download"), admin.getByRole("button", { name: "Download customers (Excel)" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^flex-chicken-customers-\d{4}-\d{2}-\d{2}\.xlsx$/);
  await expect(admin.getByText("Downloaded 1 customer as an Excel file.")).toBeVisible();

  const files = unzipSync(new Uint8Array(await readFile(await download.path())));
  const text = Object.entries(files)
    .filter(([name]) => name.startsWith("xl/") && name.endsWith(".xml"))
    .map(([, bytes]) => strFromU8(bytes))
    .join("");
  for (const value of ["Name", "Email", "Card code", "Priya Shah", "priya@example.com", code]) expect(text).toContain(value);
});

test("the owner deletes a card after confirming; cancelling keeps it", async ({ browser }) => {
  const { shop, admin } = await shopAndAdmin(browser, "/admin/cards");
  const code = (await shop.getByText(/^#\d{4}$/).first().textContent()).replace("#", "");
  const remove = admin.getByRole("button", { name: `Delete card ${code}` });

  admin.once("dialog", (dialog) => dialog.dismiss());
  await remove.click();
  await expect(admin.getByRole("button", { name: `Add a stamp to card ${code}` })).toBeVisible();

  admin.once("dialog", (dialog) => {
    expect(dialog.message()).toContain(`Delete card ${code}`);
    dialog.accept();
  });
  await remove.click();
  await expect(admin.getByText(`Card ${code} deleted.`)).toBeVisible();
  await expect(admin.getByRole("button", { name: `Add a stamp to card ${code}` })).toHaveCount(0);
});

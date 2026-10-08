// Screenshots of checkout, tracking, kitchen, menu editor and driver screens,
// with a real order placed through the UI first.
//   npm run dev   (in another terminal)
//   node scripts/shots-staff.mjs
import { mkdirSync } from "node:fs";
import { chromium, devices } from "@playwright/test";

const BASE = process.argv[2] ?? "http://localhost:3200";
const OUT = new URL("../.shots/", import.meta.url);
mkdirSync(OUT, { recursive: true });
const shot = (page, name, fullPage = false) =>
  page.screenshot({ path: new URL(`${name}.png`, OUT).pathname.slice(1), fullPage });

const browser = await chromium.launch();
const context = await browser.newContext({
  ...devices["Pixel 7"],
  permissions: ["geolocation"],
  geolocation: { latitude: 51.5195, longitude: 0.1985 },
});
await context.route("https://api.postcodes.io/postcodes/**", (route) =>
  route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ status: 200, result: { postcode: "RM13 8AB", latitude: 51.5205, longitude: 0.2052 } }),
  })
);

const page = await context.newPage();
await page.goto(`${BASE}/`);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.getByRole("button", { name: "Burger Meals", exact: true }).click();
await page.getByRole("button", { name: /^All dishes/ }).click();
await page.getByRole("list", { name: "Dishes" }).getByRole("button", { name: "Hot Honey Burger Meal" }).click();
await page.getByRole("button", { name: /^Add to Box: / }).click();
await page.getByRole("dialog").getByText("Coca Cola").click();
await page.getByRole("dialog").getByRole("button", { name: "Add to Box" }).click();
await page.getByRole("button", { name: "Burgers", exact: true }).click();
await page.getByRole("button", { name: "One more" }).first().click();
await page.getByRole("button", { name: /^Add to Box: / }).click();

await page.goto(`${BASE}/checkout`);
await page.getByRole("button", { name: "Sign in to order" }).click();
await page.getByRole("button", { name: "Continue with Google" }).click();
await shot(page, "co-1-signin");
await page.getByLabel("Name").fill("Sam Taylor");
await page.getByLabel("Email").fill("sam@example.com");
await page.getByRole("button", { name: "Continue", exact: true }).click();
await page.getByLabel("Postcode").fill("RM13 8AB");
await page.getByRole("button", { name: "Check", exact: true }).click();
await page.getByLabel("House number and street").fill("12 Test Road");
await page.getByLabel("Mobile number").fill("07700 900123");
await page.getByLabel("Note for the kitchen or driver").fill("Extra napkins please");
await page.waitForTimeout(800);
await shot(page, "co-2-checkout", true);
await page.getByRole("button", { name: /^Place order · £/ }).click();
await page.waitForTimeout(800);
await shot(page, "co-3-track-new");

const kitchen = await context.newPage();
await kitchen.goto(`${BASE}/admin/orders`);
await shot(kitchen, "admin-0-gate");
await kitchen.getByLabel("Shift code").fill("2580");
await kitchen.getByRole("button", { name: "Unlock" }).click();
await kitchen.waitForTimeout(500);
await shot(kitchen, "admin-1-orders-phone");
await kitchen.setViewportSize({ width: 1280, height: 800 });
await kitchen.waitForTimeout(300);
await shot(kitchen, "admin-2-orders-tablet");
await kitchen.getByRole("article", { name: /Order #0001/ }).getByRole("button", { name: "Accept" }).click();
await kitchen.getByRole("article", { name: /Order #0001/ }).getByRole("button", { name: "Start cooking" }).click();
await kitchen.getByRole("article", { name: /Order #0001/ }).getByRole("button", { name: "Mark ready" }).click();
await shot(kitchen, "admin-3-orders-ready");
await kitchen.setViewportSize({ width: 412, height: 915 });
await kitchen.goto(`${BASE}/admin/menu`);
await kitchen.waitForTimeout(500);
await shot(kitchen, "admin-4-menu", true);
await kitchen.getByRole("button", { name: /^Edit / }).first().click();
await kitchen.waitForTimeout(500);
await shot(kitchen, "admin-5-item-editor");

const driver = await context.newPage();
await driver.goto(`${BASE}/driver`);
await driver.getByLabel("Your name").fill("Ali");
await driver.getByLabel("Shift code").fill("1111");
await driver.getByRole("button", { name: "Unlock" }).click();
await driver.waitForTimeout(400);
await shot(driver, "driver-1-ready");
await driver.getByRole("button", { name: "Take this order" }).click();
await driver.waitForTimeout(1500);
await shot(driver, "driver-2-active", true);

await page.bringToFront();
await page.waitForTimeout(1500);
await shot(page, "co-4-track-live", true);

await browser.close();
console.log("done");

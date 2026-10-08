import { expect, test } from "@playwright/test";
import { SIMPLE_DISH, showDish } from "./menu.mjs";

// postcodes.io stand-ins: one in each delivery zone, one just past 2 miles,
// one far outside.
const POSTCODES = {
  "RM13%208AB": { postcode: "RM13 8AB", latitude: 51.5205, longitude: 0.2052 }, // zone 1, £1
  "RM12%205AB": { postcode: "RM12 5AB", latitude: 51.5398, longitude: 0.1989 }, // ~1.5 mi, zone 2, £2
  "RM12%206AB": { postcode: "RM12 6AB", latitude: 51.5552, longitude: 0.2107 }, // ~2.6 mi, collection
  "SW1A%201AA": { postcode: "SW1A 1AA", latitude: 51.501, longitude: -0.1416 }, // ~14 mi
};

async function mockPostcodes(page) {
  await page.route("https://api.postcodes.io/postcodes/**", (route) => {
    const key = route.request().url().split("/postcodes/")[1];
    const result = POSTCODES[key];
    return route.fulfill({
      status: result ? 200 : 404,
      contentType: "application/json",
      body: JSON.stringify(result ? { status: 200, result } : { status: 404 }),
    });
  });
  // Map tiles are not under test; keep the run offline-friendly.
  await page.route("https://*.tile.openstreetmap.org/**", (route) => route.abort());
}

// An OSRM stand-in: from the driver's test position, east, then left to the door.
const ROUTE = {
  code: "Ok",
  routes: [
    {
      distance: 600,
      duration: 90,
      geometry: { coordinates: [[0.1985, 51.5195], [0.2052, 51.5195], [0.2052, 51.5205]] },
      legs: [
        {
          steps: [
            { name: "Test Lane", maneuver: { type: "depart", modifier: "right", location: [0.1985, 51.5195] } },
            { name: "Test Road", maneuver: { type: "turn", modifier: "left", location: [0.2052, 51.5195] } },
            { name: "Test Road", maneuver: { type: "arrive", modifier: "right", location: [0.2052, 51.5205] } },
          ],
        },
      ],
    },
  ],
};

async function mockRouting(page) {
  await page.route("https://router.project-osrm.org/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ROUTE) })
  );
  await page.route("https://*.tile.openstreetmap.org/**", (route) => route.abort());
}

// 7 × Cheeseburger = £16.66: over the £15 delivery minimum unless `qty` says otherwise.
async function fillCart(page, qty = 7) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await showDish(page, SIMPLE_DISH);
  for (let i = 1; i < qty; i += 1) await page.getByRole("button", { name: "One more" }).first().click();
  await page.getByRole("button", { name: /^Add to Box: \d+ × / }).click();
  await page.goto("/checkout");
}

async function signIn(page) {
  await page.getByRole("button", { name: "Sign in to order" }).click();
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await page.getByLabel("Name").fill("Sam Taylor");
  await page.getByLabel("Email").fill("sam@example.com");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByText("sam@example.com")).toBeVisible();
}

test("outside the delivery area is flagged and offers collection", async ({ page }) => {
  await mockPostcodes(page);
  await fillCart(page);
  await page.getByLabel("Postcode").fill("sw1a1aa");
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await expect(page.getByText("Outside our delivery area.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Delivery not available here" })).toBeDisabled();
  await page.getByRole("button", { name: "Switch to collection" }).click();
  await expect(page.getByRole("radio", { name: "Collection" })).toHaveAttribute("aria-checked", "true");
});

test("each zone charges its own fee, and the owner can change it", async ({ browser }) => {
  const context = await browser.newContext(test.info().project.use);
  const page = await context.newPage();
  await mockPostcodes(page);
  await fillCart(page);
  await page.getByLabel("Postcode").fill("RM13 8AB");
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await expect(page.getByText("We deliver to RM13 8AB.")).toBeVisible();
  await expect(page.getByText("Within 1 mile: £1 delivery.")).toBeVisible();

  await page.getByLabel("Postcode").fill("RM12 5AB");
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await expect(page.getByText("Within 2 miles: £2 delivery.")).toBeVisible();

  // Same district, past 2 miles: collection only.
  await page.getByLabel("Postcode").fill("RM12 6AB");
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await expect(page.getByText(/We do not deliver to RM12 6AB/)).toBeVisible();
  await page.getByLabel("Postcode").fill("RM12 5AB");
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await expect(page.getByText("Within 2 miles: £2 delivery.")).toBeVisible();

  // The owner raises zone 2 to £2.50; checkout follows at once.
  const admin = await context.newPage();
  await admin.goto("/admin/shop");
  await admin.getByLabel("Shift code").fill("2580");
  await admin.getByRole("button", { name: "Unlock" }).click();
  await admin.getByLabel("Fee").nth(1).fill("2.50");
  await admin.getByRole("button", { name: "Save delivery zones" }).click();
  await expect(admin.getByText("Delivery zones saved.")).toBeVisible();
  await expect(page.getByText("Within 2 miles: £2.50 delivery.")).toBeVisible();

  // A typo in the postcode list is refused with the reason.
  await admin.getByLabel(/^Postcodes/).first().fill("RM13 9AA\nnot a postcode");
  await admin.getByRole("button", { name: "Save delivery zones" }).click();
  await expect(admin.getByText(/these are not postcodes: not a postcode/)).toBeVisible();
  await context.close();
});

test("under the £15 minimum, delivery inside the area asks for more or collection", async ({ page }) => {
  await mockPostcodes(page);
  await fillCart(page, 2);
  await page.getByLabel("Postcode").fill("RM13 8AB");
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await expect(page.getByText(/£15 minimum order\. Add £10\.24 more/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Delivery minimum is £15.00" })).toBeDisabled();
  await page.getByRole("button", { name: "Collect instead" }).click();
  await expect(page.getByRole("radio", { name: "Collection" })).toHaveAttribute("aria-checked", "true");
});

test("sub-pages always offer a way back to the menu", async ({ page }) => {
  await page.goto("/account");
  await page.getByRole("link", { name: "Back to menu" }).click();
  await expect(page.getByRole("heading", { name: /Pick your craving/i })).toBeVisible();
});

test("checkout needs a signed-in customer", async ({ page }) => {
  await mockPostcodes(page);
  await fillCart(page);
  await page.getByRole("radio", { name: "Collection" }).click();
  await page.getByRole("button", { name: "Sign in to place order" }).click();
  await expect(page.getByRole("dialog", { name: "Sign in" })).toBeVisible();
});

test("customer orders, kitchen cooks, driver delivers, customer watches live", async ({ browser }) => {
  const context = await browser.newContext({
    ...test.info().project.use,
    permissions: ["geolocation"],
    geolocation: { latitude: 51.5195, longitude: 0.1985 },
  });
  const customer = await context.newPage();
  await mockPostcodes(customer);

  // Customer: Box -> sign in -> delivery inside the area -> place order.
  await fillCart(customer);
  await signIn(customer);
  await customer.getByLabel("Postcode").fill("RM13 8AB");
  await customer.getByRole("button", { name: "Check", exact: true }).click();
  await expect(customer.getByText("We deliver to RM13 8AB.")).toBeVisible();
  await customer.getByLabel("House number and street").fill("12 Test Road");
  await customer.getByLabel("Mobile number").fill("07700 900123");
  await customer.getByRole("button", { name: /^Place order · £/ }).click();
  await expect(customer).toHaveURL(/\/track\?id=/);
  await expect(customer.getByRole("heading", { level: 1, name: "New" })).toBeVisible();

  // Kitchen, in another tab: unlock, then bump the ticket along.
  const kitchen = await context.newPage();
  await kitchen.goto("/admin/orders");
  await kitchen.getByLabel("Shift code").fill("2580");
  await kitchen.getByRole("button", { name: "Unlock" }).click();
  const ticket = kitchen.getByRole("article", { name: /Order #0001/ });
  await expect(ticket).toBeVisible();
  await ticket.getByRole("button", { name: "Accept" }).click();
  await expect(customer.getByRole("heading", { level: 1, name: "Accepted" })).toBeVisible();
  await kitchen.getByRole("article", { name: /Order #0001/ }).getByRole("button", { name: "Start cooking" }).click();
  await kitchen.getByRole("article", { name: /Order #0001/ }).getByRole("button", { name: "Mark ready" }).click();

  // Driver, in a third tab: sign in, take the order, share location.
  const driver = await context.newPage();
  await mockRouting(driver);
  await driver.goto("/driver");
  await driver.getByLabel("Your name").fill("Ali");
  await driver.getByLabel("Shift code").fill("1111");
  await driver.getByRole("button", { name: "Unlock" }).click();
  await driver.getByRole("article", { name: /Order #0001/ }).getByRole("button", { name: "Take this order" }).click();
  await expect(driver.getByText(/Sharing your location with 1 customer/)).toBeVisible();

  // Customer sees the driver on the way, live.
  await expect(customer.getByRole("heading", { level: 1, name: "On the way" })).toBeVisible();
  await expect(customer.getByText(/Live · about \d+ min away/)).toBeVisible();

  // Directions open inside the site, not in a maps app.
  await driver.getByRole("button", { name: "Navigate" }).click();
  const directions = driver.getByRole("dialog", { name: /Directions to Sam Taylor/ });
  await expect(directions.getByText("Turn left onto Test Road")).toBeVisible();
  await expect(directions.getByText(/\d+ min/).first()).toBeVisible();
  expect(driver.url()).toContain("/driver");
  await directions.getByRole("button", { name: "Back to orders" }).click();
  await expect(directions).toBeHidden();

  // Driver hands it over.
  driver.once("dialog", (dialog) => dialog.accept());
  await driver.getByRole("button", { name: "Delivered" }).click();
  await expect(customer.getByRole("heading", { level: 1, name: "Delivered" })).toBeVisible();

  await context.close();
});

test("owner edits on the admin menu show on the shop at once", async ({ browser }) => {
  const context = await browser.newContext(test.info().project.use);
  const admin = await context.newPage();
  await admin.goto("/admin/menu");
  await admin.evaluate(() => localStorage.clear());
  await admin.reload();
  await admin.getByLabel("Shift code").fill("2580");
  await admin.getByRole("button", { name: "Unlock" }).click();

  const shop = await context.newPage();
  await shop.goto("/");
  await shop.getByRole("button", { name: "Burgers", exact: true }).click();
  await shop.getByRole("button", { name: /^All dishes/ }).click();
  await expect(shop.getByRole("list", { name: "Dishes" }).getByRole("button").first()).toHaveText("Chicken Fillet Burger");

  await admin.getByRole("tab", { name: /^Burgers/ }).click();
  await admin.getByRole("switch", { name: /Sold out for Chicken Fillet Burger|On sale for Chicken Fillet Burger/ }).uncheck({ force: true });
  await expect(shop.getByText("Sold out for now. Back soon.")).toBeVisible();

  await context.close();
});

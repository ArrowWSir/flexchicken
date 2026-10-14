import { expect, test } from "@playwright/test";
import { SIMPLE_DISH, showDish } from "./menu.mjs";
import { watchForBlocks } from "./security.mjs";

// The database build: each browser context is a separate device, so nothing
// here can pass by sharing one browser's storage. Run against the preview
// (npm run preview) with the codes in .dev.vars.
const ADMIN_PIN = process.env.CLOUD_ADMIN_PIN || "135792";
const run = Date.now().toString(36);

// Anything the security headers block on any device fails the test.
let devices = [];
test.beforeEach(() => {
  devices = [];
});
test.afterEach(() => {
  expect(devices.flat()).toEqual([]);
});

async function newContext(browser, options = {}) {
  const context = await browser.newContext({ ...test.info().project.use, ...options });
  devices.push(await watchForBlocks(context));
  return context;
}

async function newDevice(browser) {
  const context = await newContext(browser);
  const page = await context.newPage();
  await page.route("https://*.tile.openstreetmap.org/**", (route) => route.abort());
  return { context, page };
}

async function unlockAdmin(page, path) {
  await page.goto(path);
  await page.getByLabel("Shift code").fill(ADMIN_PIN);
  await page.getByRole("button", { name: "Unlock" }).click();
}

test("an order placed on a phone reaches the kitchen on another device, live both ways", async ({ browser }) => {
  const phone = await newDevice(browser);
  const kitchen = await newDevice(browser);
  const customer = phone.page;

  await customer.goto("/");
  await showDish(customer, SIMPLE_DISH);
  await customer.getByRole("button", { name: /^Add to Box: \d+ × / }).click();
  await customer.goto("/checkout");
  await customer.getByRole("radio", { name: "Collection" }).click();
  await customer.getByRole("button", { name: "Sign in to order" }).click();
  await customer.getByRole("button", { name: "Continue with Google" }).click();
  await customer.getByLabel("Name").fill(`Cloud ${run}`);
  await customer.getByLabel("Email").fill(`cloud-${run}@example.com`);
  await customer.getByRole("button", { name: "Continue", exact: true }).click();
  await customer.getByLabel("Mobile number").fill("07700 900123");
  await customer.getByRole("button", { name: /^Place order · £/ }).click();
  await expect(customer).toHaveURL(/\/track\?id=ord_[0-9a-f]{24}/);
  await expect(customer.getByRole("heading", { level: 1, name: "New" })).toBeVisible();
  const number = (await customer.getByText(/^Order #\d+ · Collection$/).textContent()).match(/#\d+/)[0];

  await unlockAdmin(kitchen.page, "/admin/orders");
  const ticket = kitchen.page.getByRole("article", { name: new RegExp(`Order ${number}`) });
  await expect(ticket).toBeVisible();
  // The server priced it: one Cheeseburger, whatever the browser claimed.
  await expect(ticket.getByText("£2.38").first()).toBeVisible();
  await ticket.getByRole("button", { name: "Accept" }).click();
  await expect(customer.getByRole("heading", { level: 1, name: "Accepted" })).toBeVisible({ timeout: 15_000 });

  // A link opened on a third device still tracks it.
  const other = await newDevice(browser);
  await other.page.goto(customer.url());
  await expect(other.page.getByRole("heading", { level: 1, name: "Accepted" })).toBeVisible();

  await Promise.all([phone.context.close(), kitchen.context.close(), other.context.close()]);
});

test("a driver on their own phone takes a delivery and the customer watches", async ({ browser }) => {
  const phone = await newDevice(browser);
  const kitchen = await newDevice(browser);
  const driverContext = await newContext(browser, { permissions: ["geolocation"], geolocation: { latitude: 51.5195, longitude: 0.1985 } });
  const driver = await driverContext.newPage();
  await driver.route("https://*.tile.openstreetmap.org/**", (route) => route.abort());
  const customer = phone.page;
  // The browser's lookup is mocked; the server checks RM13 9AA with postcodes.io itself.
  await customer.route("https://api.postcodes.io/postcodes/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: 200, result: { postcode: "RM13 9AA", latitude: 51.518723, longitude: 0.193829 } }) })
  );

  await customer.goto("/");
  await showDish(customer, SIMPLE_DISH);
  for (let i = 1; i < 7; i += 1) await customer.getByRole("button", { name: "One more" }).first().click();
  await customer.getByRole("button", { name: /^Add to Box: \d+ × / }).click();
  await customer.goto("/checkout");
  await customer.getByRole("button", { name: "Sign in to order" }).click();
  await customer.getByRole("button", { name: "Continue with Google" }).click();
  await customer.getByLabel("Name").fill(`Drive ${run}`);
  await customer.getByLabel("Email").fill(`drive-${run}@example.com`);
  await customer.getByRole("button", { name: "Continue", exact: true }).click();
  await customer.getByLabel("Postcode").fill("RM13 9AA");
  await customer.getByRole("button", { name: "Check", exact: true }).click();
  await customer.getByLabel("House number and street").fill("12 Test Road");
  await customer.getByLabel("Mobile number").fill("07700 900123");
  await customer.getByRole("button", { name: /^Place order · £/ }).click();
  await expect(customer).toHaveURL(/\/track\?id=/);
  const number = (await customer.getByText(/^Order #\d+ · Delivery$/).textContent()).match(/#\d+/)[0];

  await unlockAdmin(kitchen.page, "/admin/orders");
  for (const step of ["Accept", "Start cooking", "Mark ready"]) {
    await kitchen.page.getByRole("article", { name: new RegExp(`Order ${number}`) }).getByRole("button", { name: step }).click();
  }

  await driver.goto("/driver");
  await driver.getByLabel("Your name").fill(`Ali ${run}`);
  await driver.getByLabel("Shift code").fill(process.env.CLOUD_DRIVER_PIN || "246801");
  await driver.getByRole("button", { name: "Unlock" }).click();
  await driver.getByRole("article", { name: new RegExp(`Order ${number}`) }).getByRole("button", { name: "Take this order" }).click();
  await expect(customer.getByRole("heading", { level: 1, name: "On the way" })).toBeVisible({ timeout: 15_000 });
  await expect(customer.getByText(/Live · about \d+ min away/)).toBeVisible({ timeout: 15_000 });

  driver.once("dialog", (dialog) => dialog.accept());
  await driver.getByRole("article", { name: new RegExp(`Order ${number}`) }).getByRole("button", { name: "Delivered" }).click();
  await expect(customer.getByRole("heading", { level: 1, name: "Delivered" })).toBeVisible({ timeout: 15_000 });

  await Promise.all([phone.context.close(), kitchen.context.close(), driverContext.close()]);
});

test("a stamp given at the counter shows on the customer's own phone", async ({ browser }) => {
  const phone = await newDevice(browser);
  const counter = await newDevice(browser);
  await phone.page.goto("/");
  const status = phone.page.getByText(/^Member \d{4}\. 0 of 8 stamps collected\./);
  await expect(status).toBeAttached({ timeout: 15_000 });
  const code = (await status.textContent()).match(/\d{4}/)[0];

  await unlockAdmin(counter.page, `/admin/cards?q=${code}`);
  await counter.page.getByRole("button", { name: `Add a stamp to card ${code}` }).click();
  await expect(phone.page.getByText(`Member ${code}. 1 of 8 stamps collected.`)).toBeAttached({ timeout: 15_000 });

  await Promise.all([phone.context.close(), counter.context.close()]);
});

test("staff clock in on the tablet and the owner sees it on their own device", async ({ browser }) => {
  const owner = await newDevice(browser);
  const tablet = await newDevice(browser);
  const pin = String(1000 + Math.floor(Math.random() * 9000));
  const name = `Clock ${run}`;

  await unlockAdmin(owner.page, "/admin/staff");
  await owner.page.getByLabel("Name").first().fill(name);
  await owner.page.getByLabel("Clock PIN (4 digits)").fill(pin);
  await owner.page.getByRole("button", { name: "Add", exact: true }).click();
  // Runs pile up on the shared database: read the Staff ID the new row was given.
  const row = owner.page.getByRole("listitem").filter({ hasText: name }).filter({ hasText: "Staff ID" });
  await expect(row).toBeVisible();
  const staffId = (await row.textContent()).match(/Staff ID\s*(\d{3})/)[1];

  // The tablet is unlocked once with the owner's code; a phone without it cannot use the pad.
  await tablet.page.goto("/clock");
  await expect(tablet.page.getByRole("heading", { name: "Set up the staff clock" })).toBeVisible();
  await tablet.page.getByLabel("Shift code").fill(ADMIN_PIN);
  await tablet.page.getByRole("button", { name: "Unlock" }).click();
  const tap = async (keypad, digits) => {
    for (const digit of digits) await tablet.page.getByRole("group", { name: keypad }).getByRole("button", { name: digit, exact: true }).click();
  };
  await tap("Staff ID keypad", staffId);
  await tap("PIN keypad", pin);
  await tablet.page.getByRole("button", { name: "Clock in" }).click();
  await expect(tablet.page.getByText(`${name} clocked in`)).toBeVisible();

  await expect(owner.page.getByText(/on shift since/).first()).toBeVisible({ timeout: 15_000 });

  // Clock out again, so the next run starts clean.
  await tap("Staff ID keypad", staffId);
  await tap("PIN keypad", pin);
  await tablet.page.getByRole("button", { name: "Clock out" }).click();
  await expect(tablet.page.getByText(`${name} clocked out`)).toBeVisible();

  await Promise.all([owner.context.close(), tablet.context.close()]);
});

test("the server refuses staff actions without a staff sign-in", async ({ request }) => {
  const headers = { "content-type": "application/json", "x-flexchicken": "1" };
  const settings = await request.post("/api/shop/call", { headers, data: { method: "saveSettings", args: [{ isTakingOrders: false }], as: "admin" } });
  expect(settings.status()).toBe(403);
  const login = await request.post("/api/staff/login", { headers, data: { role: "admin", pin: "000000" } });
  expect(login.status()).toBe(401);
  const orders = await (await request.get("/api/shop/state?topics=orders,staff,shifts")).json();
  expect(orders.data).toEqual({ orders: [], staff: [], shifts: [] });
  const pin = await request.post("/api/shop/call", { headers, data: { method: "identify", args: ["101", "1234"] } });
  expect(pin.status()).toBe(403);
});

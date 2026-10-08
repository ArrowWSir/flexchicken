import { expect, test } from "@playwright/test";

// Accepting prints the till receipt with a one-time stamp QR; scanning it
// stamps the card once and offers an optional rating. New orders notify the
// admin.

const order = (number, createdAt) => ({
  id: `ord_test_${number}`,
  number,
  status: "placed",
  mode: "collection",
  createdAt,
  customer: { id: "usr_t", name: "Sam Test", email: "sam@example.com", phone: "07700 900123" },
  address: null,
  note: "",
  lines: [{ key: "1", itemId: 1, name: "Cheese Burger", image: null, choices: [], unitPence: 249, qty: 2 }],
  totals: { subtotalPence: 498, discountPence: 0, deliveryPence: 0, totalPence: 498 },
  promo: null,
  payment: { provider: "teya", status: "not_connected" },
  driver: null,
  history: [{ status: "placed", at: createdAt }],
});

async function openAdmin(context, orders = []) {
  const admin = await context.newPage();
  // Every frame's print() is recorded instead of opening the dialog.
  await admin.addInitScript(() => {
    window.print = () => (window.top.__printed ||= []).push(document.documentElement.outerHTML);
  });
  await admin.goto("/admin/orders");
  await admin.evaluate((list) => {
    localStorage.clear();
    localStorage.setItem("fc_store_orders", JSON.stringify(list));
  }, orders);
  await admin.reload();
  await admin.getByLabel("Shift code").fill("2580");
  await admin.getByRole("button", { name: "Unlock" }).click();
  return admin;
}

async function acceptAndGetToken(admin) {
  await admin.getByRole("button", { name: "Accept" }).click();
  await expect.poll(() => admin.evaluate(() => window.__printed?.length ?? 0)).toBe(1);
  const receipt = await admin.evaluate(() => window.__printed[0]);
  expect(receipt).toContain("#0001");
  expect(receipt).toContain("SCAN FOR YOUR FLEX STAMP");
  expect(receipt).toContain("<svg");
  return admin.evaluate(() => JSON.parse(localStorage.getItem("fc_store_stamp_tokens"))[0].token);
}

test("accepting prints a receipt whose QR stamps the card once", async ({ context }) => {
  const admin = await openAdmin(context, [order(1, Date.now())]);
  const token = await acceptAndGetToken(admin);

  // A reprint carries the same code.
  await admin.getByRole("tab", { name: /Kitchen/ }).click();
  await admin.getByRole("button", { name: "Reprint receipt" }).click();
  await expect.poll(() => admin.evaluate(() => window.__printed.length)).toBe(2);
  expect(await admin.evaluate(() => JSON.parse(localStorage.getItem("fc_store_stamp_tokens")).length)).toBe(1);

  const phone = await context.newPage();
  await phone.goto(`/stamp?t=${token}`);
  await expect(phone.getByText("Stamp added from receipt #0001.")).toBeVisible();
  await expect(phone).toHaveURL(/\/stamp$/);
  await expect(phone.getByText("1 / 8 stamps")).toBeVisible();

  await phone.goto(`/stamp?t=${token}`);
  await expect(phone.getByText("This receipt's stamp has already been collected.")).toBeVisible();
  await expect(phone.getByText("1 / 8 stamps")).toBeVisible();
});

test("1 to 3 stars lead with private feedback; Google stays reachable", async ({ context }) => {
  const admin = await openAdmin(context, [order(1, Date.now())]);
  const token = await acceptAndGetToken(admin);
  const phone = await context.newPage();
  await phone.goto(`/stamp?t=${token}`);

  await expect(phone.getByRole("button", { name: "Submit" })).toBeDisabled();
  await phone.getByText("2 stars, Not great").click({ force: true });
  await phone.getByRole("button", { name: "Submit" }).click();
  await expect(phone.getByRole("heading", { name: "Sorry about that" })).toBeVisible();
  await phone.getByLabel(/What went wrong/).fill("Chips were cold");
  const email = phone.getByRole("region", { name: "Rate your food" }).getByRole("link", { name: /^Email / });
  await expect(email).toHaveAttribute("href", /^mailto:info@flexchicken\.co\.uk\?subject=Feedback%3A%202%20stars%2C%20order%20%230001&body=.*Chips%20were%20cold/);
  await expect(phone.getByRole("link", { name: "review us on Google" })).toBeVisible();

  for (const width of [320, 375]) {
    await phone.setViewportSize({ width, height: 900 });
    await phone.screenshot({ path: `test-results/stamp-sorry-${width}.png`, fullPage: true });
  }
});

test("4 or 5 stars go on to Google", async ({ context }) => {
  await context.route("https://www.google.com/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<h1>Google</h1>" }));
  const admin = await openAdmin(context, [order(1, Date.now())]);
  const token = await acceptAndGetToken(admin);
  const phone = await context.newPage();
  await phone.goto(`/stamp?t=${token}`);
  for (const width of [320, 375]) {
    await phone.setViewportSize({ width, height: 900 });
    await phone.screenshot({ path: `test-results/stamp-ask-${width}.png`, fullPage: true });
  }
  await phone.getByText("5 stars, Loved it").click({ force: true });
  await phone.getByRole("button", { name: "Submit" }).click();
  await expect(phone.getByText("Thank you!")).toBeVisible();
  await expect(phone).toHaveURL(/^https:\/\/www\.google\.com\/maps/);
});

test("the admin bell shows a notification for a new order, not for old ones", async ({ context }) => {
  // Test Chromium denies notifications whatever is granted, so the browser's
  // side is stood in for: permission is granted and shown notifications are
  // recorded.
  await context.addInitScript(() => {
    window.__notes = [];
    Object.defineProperty(Notification, "permission", { get: () => "granted" });
    Notification.requestPermission = async () => "granted";
    ServiceWorkerRegistration.prototype.showNotification = async function (title, options) {
      window.__notes.push(`${title} | ${options.body}`);
    };
  });
  const admin = await openAdmin(context, [order(1, Date.now())]);
  await admin.getByRole("button", { name: "Turn on new-order notifications" }).click();
  await expect(admin.getByRole("button", { name: /notifications on/i })).toHaveAttribute("aria-pressed", "true");
  expect(await admin.evaluate(() => window.__notes)).toEqual([]);

  await admin.evaluate((next) => {
    const list = JSON.parse(localStorage.getItem("fc_store_orders"));
    localStorage.setItem("fc_store_orders", JSON.stringify([...list, next]));
    new BroadcastChannel("flexchicken").postMessage({ key: "orders" });
  }, order(2, Date.now()));
  await expect.poll(() => admin.evaluate(() => window.__notes)).toEqual(["New order #0002 | Collection · 2 items · £4.98\nSam Test"]);

  // Still on after a reload, without ringing for the two orders already there.
  await admin.reload();
  await expect(admin.getByRole("button", { name: /notifications on/i })).toBeVisible();
  await expect(admin.getByRole("tab", { name: /New/ })).toContainText("2");
  expect(await admin.evaluate(() => window.__notes)).toEqual([]);
});

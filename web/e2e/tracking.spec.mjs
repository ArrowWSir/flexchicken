import { expect, test } from "@playwright/test";

// My orders: a signed-in customer sees the driver live on the account page.
// The store is seeded directly so this only tests the customer's view; the
// full kitchen-and-driver journey lives in flow.spec.mjs.
const SESSION = { id: "usr_test", name: "Sam Taylor", email: "sam@example.com", provider: "google", phone: "07700 900123" };
const HOME = { line1: "12 Test Road", line2: "", postcode: "RM13 8AB", latitude: 51.5205, longitude: 0.2052 };

function order(id, number, status, createdAt) {
  return {
    id,
    number,
    status,
    mode: "delivery",
    createdAt,
    customer: { id: SESSION.id, name: SESSION.name, email: SESSION.email, phone: SESSION.phone },
    address: HOME,
    note: "",
    lines: [{ key: "k1", id: 1, name: "Cheese Burger", qty: 7, unitPence: 249, choices: [] }],
    totals: { subtotalPence: 1743, discountPence: 0, deliveryPence: 100, totalPence: 1843 },
    promo: null,
    payment: { provider: "teya", status: "not_connected" },
    driver: status === "out_for_delivery" ? { id: "drv_1", name: "Ali" } : null,
    history: [{ status: "placed", at: createdAt }],
  };
}

async function seed(page, orders, locations = {}) {
  await page.route("https://*.tile.openstreetmap.org/**", (route) => route.abort());
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ({ session, orders, locations }) => {
      localStorage.clear();
      localStorage.setItem("fc_store_session", JSON.stringify(session));
      localStorage.setItem("fc_store_orders", JSON.stringify(orders));
      localStorage.setItem("fc_store_driver_locations", JSON.stringify(locations));
    },
    { session: SESSION, orders, locations },
  );
  await page.reload({ waitUntil: "domcontentloaded" });
}

test("My orders shows the driver live once the order is on the way", async ({ page }) => {
  const now = Date.now();
  await seed(page, [order("ord_old", 1, "delivered", now - 86_400_000), order("ord_live", 2, "out_for_delivery", now - 1_200_000)], {
    ord_live: { latitude: 51.5195, longitude: 0.1985, accuracy: 8, at: now },
  });

  // The header tells the customer where to look.
  await page.getByRole("link", { name: /My orders and account, Sam Taylor\. Your order is on the way/ }).click();
  await expect(page.getByRole("heading", { level: 2, name: "My orders" })).toBeVisible();

  const live = page.getByRole("article", { name: "Order #0002, On the way" });
  await expect(live.getByRole("heading", { level: 3, name: /Your driver/ })).toBeVisible();
  await expect(live.getByText(/Live · about \d+ min away/)).toBeVisible();
  await expect(live.getByRole("region", { name: /your driver is [\d.]+ miles away/ })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: "Past orders" })).toBeVisible();

  await live.getByRole("link", { name: "Track order" }).click();
  await expect(page).toHaveURL(/\/track\?id=ord_live/);
  await expect(page.getByText(/Live · about \d+ min away/)).toBeVisible();
});

test("before the driver sets off, My orders says where the location will appear", async ({ page }) => {
  await seed(page, [order("ord_cooking", 3, "preparing", Date.now())]);
  await page.goto("/account", { waitUntil: "domcontentloaded" });
  const card = page.getByRole("article", { name: "Order #0003, Cooking" });
  await expect(card.getByText(/live location shows here as soon as they set off/)).toBeVisible();
  await expect(card.getByRole("region")).toHaveCount(0);
});

test("a stale driver location is not shown as live", async ({ page }) => {
  const now = Date.now();
  await seed(page, [order("ord_stale", 4, "out_for_delivery", now - 1_200_000)], {
    ord_stale: { latitude: 51.5195, longitude: 0.1985, accuracy: 8, at: now - 5 * 60_000 },
  });
  await page.goto("/account", { waitUntil: "domcontentloaded" });
  const card = page.getByRole("article", { name: "Order #0004, On the way" });
  await expect(card.getByText(/Waiting for the driver/)).toBeVisible();
  await expect(card.getByText(/Live · about/)).toHaveCount(0);
});

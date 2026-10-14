import { expect, test } from "@playwright/test";

// /staff: the counter's own screen, behind the staff code. Orders and cards
// work as in the admin; the owner's pages and the customer download do not.

const placed = (createdAt) => ({
  id: "ord_staff_1",
  number: 1,
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

async function openStaff(page, path = "/staff") {
  // Accepting prints the till receipt; record it instead of opening the dialog.
  await page.addInitScript(() => {
    window.print = () => (window.top.__printed ||= []).push("receipt");
  });
  await page.goto(path);
  await page.evaluate((order) => {
    localStorage.clear();
    localStorage.setItem("fc_store_orders", JSON.stringify([order]));
  }, placed(Date.now()));
  await page.reload();
}

test("the staff code opens orders and cards, and the owner's code does not", async ({ page }) => {
  await openStaff(page);
  await page.getByLabel("Shift code").fill("2580");
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.getByText("That code is not right.")).toBeVisible();

  await page.getByLabel("Shift code").fill("3690");
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.getByRole("heading", { name: "Orders", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Accept" }).click();
  await expect.poll(() => page.evaluate(() => window.__printed?.length ?? 0)).toBe(1);
  await page.getByRole("button", { name: "Start cooking" }).click();
  await expect(page.getByRole("button", { name: "Mark ready" })).toBeVisible();

  const pages = page.getByRole("navigation", { name: "Staff pages" });
  await expect(pages.getByRole("link")).toHaveText(["Orders", "Cards"]);
  await pages.getByRole("link", { name: "Cards" }).click();
  await expect(page).toHaveURL(/\/staff\/cards$/);
  await expect(page.getByRole("heading", { name: "Loyalty cards" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download customers (Excel)" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Delete card/ })).toHaveCount(0);
  await expect(page.getByPlaceholder("Card code (e.g. 4271) or name")).toBeVisible();
});

test("signing in to /staff does not open the admin", async ({ page }) => {
  await openStaff(page);
  await page.getByLabel("Shift code").fill("3690");
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.getByRole("heading", { name: "Orders", exact: true })).toBeVisible();

  await page.goto("/admin");
  await expect(page.getByLabel("Shift code")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Service/ })).toHaveCount(0);
});

test("the owner sets the staff code in Staff & hours, and it cannot be the owner's", async ({ page }) => {
  await page.goto("/admin/staff");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByLabel("Shift code").fill("2580");
  await page.getByRole("button", { name: "Unlock" }).click();

  await page.getByText("Staff code", { exact: true }).click();
  const fill = async (next) => {
    await page.getByLabel("Your current owner's code").fill("2580");
    await page.getByLabel("New code (4 to 8 digits)").fill(next);
    await page.getByLabel("New code again").fill(next);
    await page.getByRole("button", { name: "Change code" }).click();
  };
  await fill("2580");
  await expect(page.getByText("That is the owner's code. Pick a different staff code.")).toBeVisible();
  await fill("4455");
  await expect(page.getByRole("status").filter({ hasText: "Staff code changed" })).toBeVisible();

  await page.goto("/staff");
  await page.getByLabel("Shift code").fill("3690");
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.getByText("That code is not right.")).toBeVisible();
  await page.getByLabel("Shift code").fill("4455");
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.getByRole("heading", { name: "Orders", exact: true })).toBeVisible();
});

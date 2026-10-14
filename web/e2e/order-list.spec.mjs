import { expect, test } from "@playwright/test";

// The owner opens the order list with its own PIN, lists what to buy (item
// and quantity, no prices), previews the PDF and downloads it.

async function openAdmin(page) {
  await page.goto("/admin/order-list");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByLabel("Shift code").fill("2580");
  await page.getByRole("button", { name: "Unlock" }).click();
}

async function openList(page, pin = "0000") {
  await page.getByLabel("Order list PIN").fill(pin);
  await page.getByRole("button", { name: "Open order list" }).click();
}

async function fillLine(page, n, item, qty = "") {
  await page.getByLabel(`Item ${n}`, { exact: true }).fill(item);
  if (qty) await page.getByLabel(`Quantity ${n}`, { exact: true }).fill(qty);
}

test("the order list needs its own PIN, previews, then downloads the PDF", async ({ page }, testInfo) => {
  await openAdmin(page);

  // A wrong PIN keeps it shut.
  await openList(page, "1234");
  await expect(page.getByText("That PIN is not right.")).toBeVisible();
  await openList(page);
  await expect(page.getByRole("heading", { name: "Order list", level: 1 })).toBeVisible();
  await expect(page.getByText("No lists yet.")).toBeVisible();

  await page.getByRole("button", { name: "New list" }).click();
  await expect(page.getByLabel(/Price/)).toHaveCount(0);
  await page.getByLabel("Title").fill("Weekly stock");
  await fillLine(page, 1, "Chicken wings", "10 kg");
  await fillLine(page, 2, "Burger buns", "4 packs");
  await fillLine(page, 3, "Napkins", "2 boxes");
  // Enter on the last quantity adds a line instead of saving.
  await page.getByLabel("Quantity 3", { exact: true }).press("Enter");
  await fillLine(page, 4, "Fryer oil");
  await expect(page.getByText("4 items on this list")).toBeVisible();

  // Preview first: the page as the PDF prints it.
  await page.getByRole("button", { name: "Preview & download PDF" }).click();
  const preview = page.getByRole("dialog", { name: "Preview: Weekly stock" });
  const paper = preview.getByRole("article", { name: "Order list preview" });
  await expect(paper.getByRole("row", { name: /Chicken wings 10 kg/ })).toBeVisible();
  await expect(paper.getByRole("row", { name: /Fryer oil -/ })).toBeVisible();
  await expect(paper).not.toContainText("£");
  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: 800 });
    await page.screenshot({ path: `test-results/order-list-preview-${width}.png` });
  }

  const downloadButton = preview.getByRole("button", { name: "Download PDF" });
  await expect(downloadButton).toBeEnabled();
  const [download] = await Promise.all([page.waitForEvent("download"), downloadButton.click()]);
  expect(download.suggestedFilename()).toMatch(/^flex-chicken-order-list-\d{4}-\d{2}-\d{2}-weekly-stock\.pdf$/);
  const file = testInfo.outputPath("list.pdf");
  await download.saveAs(file);
  const { readFile } = await import("node:fs/promises");
  const bytes = await readFile(file);
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  await expect(preview.getByText(/Downloading flex-chicken-order-list-/)).toBeVisible();
  await expect(preview.getByRole("link", { name: "Open PDF" })).toHaveAttribute("href", /^blob:/);
  await preview.getByRole("button", { name: "Close preview" }).first().click();
  await expect(preview).toBeHidden();

  // Kept; the PIN is asked for again on the next visit.
  await page.reload();
  await expect(page.getByLabel("Order list PIN")).toBeVisible();
  await openList(page);
  const saved = page.getByRole("region", { name: "Saved lists" });
  await expect(saved.getByText("Weekly stock")).toBeVisible();
  await saved.getByRole("button", { name: /^Weekly stock/ }).click();
  await expect(page.getByLabel("Item 4", { exact: true })).toHaveValue("Fryer oil");
  await expect(page.getByLabel("Quantity 1", { exact: true })).toHaveValue("10 kg");

  page.once("dialog", (dialog) => dialog.accept());
  await saved.getByRole("button", { name: /^Delete Weekly stock/ }).click();
  await expect(page.getByText("No lists yet.")).toBeVisible();
});

test("the order list PIN changes like a password", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await openAdmin(page);
  await openList(page);

  await page.getByText("Change order list PIN").click();
  const form = page.locator("details");
  await form.getByLabel("Current PIN").fill("9999");
  await form.getByLabel("New PIN (4 to 8 digits)").fill("2468");
  await form.getByLabel("Confirm new PIN").fill("2468");
  await form.getByRole("button", { name: "Change PIN" }).click();
  await expect(form.getByText("The current PIN is not right.")).toBeVisible();

  await form.getByLabel("Current PIN").fill("0000");
  await form.getByLabel("Confirm new PIN").fill("2469");
  await form.getByRole("button", { name: "Change PIN" }).click();
  await expect(form.getByText("The new PIN and its confirmation do not match.")).toBeVisible();

  await form.getByLabel("Confirm new PIN").fill("2468");
  await form.getByRole("button", { name: "Change PIN" }).click();
  await expect(form.getByText("PIN changed.")).toBeVisible();
  await page.screenshot({ path: "test-results/order-list-pin-375.png", fullPage: true });

  await page.getByRole("button", { name: "Lock", exact: true }).click();
  await openList(page, "0000");
  await expect(page.getByText("That PIN is not right.")).toBeVisible();
  await openList(page, "2468");
  await expect(page.getByRole("heading", { name: "Order list", level: 1 })).toBeVisible();
});

test("the old Expenses link lands on the order list", async ({ page }) => {
  await page.goto("/admin/expenses");
  await expect(page).toHaveURL(/\/admin\/order-list$/);
});

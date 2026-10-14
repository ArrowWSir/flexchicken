import { expect, test } from "@playwright/test";

// The owner lists what the shop bought and downloads it as a PDF that adds
// it up; the sheet is kept to open again.

async function openExpenses(page) {
  await page.goto("/admin/expenses");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByLabel("Shift code").fill("2580");
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.getByRole("heading", { name: "Expenses", level: 1 })).toBeVisible();
}

async function fillLine(page, n, { item, qty = "", source = "", price = "" }) {
  await page.getByLabel(`Item ${n}`, { exact: true }).fill(item);
  if (qty) await page.getByLabel(`Quantity ${n}`, { exact: true }).fill(qty);
  if (source) await page.getByLabel(`Source ${n}`, { exact: true }).fill(source);
  if (price) await page.getByLabel(`Price ${n} in pounds`).fill(price);
}

test("the owner lists purchases, sees the total, and downloads the PDF", async ({ page }, testInfo) => {
  await openExpenses(page);
  await expect(page.getByText("No sheets yet.")).toBeVisible();
  await page.getByRole("button", { name: "New sheet" }).click();

  await page.getByLabel("Title").fill("Weekly stock");
  await fillLine(page, 1, { item: "Chicken wings", qty: "10 kg", source: "Brakes", price: "45" });
  await fillLine(page, 2, { item: "Burger buns", qty: "4 packs", source: "Booker", price: "6.40" });
  await fillLine(page, 3, { item: "Napkins", qty: "2 boxes" });
  // Enter on the last price adds a line instead of making a PDF.
  await page.getByLabel("Price 3 in pounds").press("Enter");
  await fillLine(page, 4, { item: "Fryer oil", source: "Brakes", price: "abc" });
  await expect(page.getByLabel("Price 4 in pounds")).toHaveAttribute("aria-invalid", "true");

  const total = page.getByRole("region", { name: "Total" });
  await expect(total).toContainText("£51.40");
  await expect(total).toContainText("2 without a price");

  // A bad price is refused by name.
  await page.getByRole("button", { name: "Download PDF" }).click();
  await expect(page.getByText(/Fryer oil: "abc" is not a price/)).toBeVisible();
  await page.getByLabel("Price 4 in pounds").fill("32.99");
  await expect(total).toContainText("£84.39");

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download PDF" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^flex-chicken-expenses-\d{4}-\d{2}-\d{2}-weekly-stock\.pdf$/);
  const file = testInfo.outputPath("sheet.pdf");
  await download.saveAs(file);
  const { readFile } = await import("node:fs/promises");
  const bytes = await readFile(file);
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  await expect(page.getByText("Saved, and the PDF is downloading.")).toBeVisible();

  // Kept, and opens again with everything in it.
  // The admin stays unlocked on this device.
  await page.reload();
  const saved = page.getByRole("region", { name: "Saved sheets" });
  await expect(saved.getByText("Weekly stock")).toBeVisible();
  await expect(saved.getByText("£84.39", { exact: true })).toBeVisible();
  await saved.getByRole("button", { name: /Weekly stock/ }).first().click();
  await expect(page.getByLabel("Item 4", { exact: true })).toHaveValue("Fryer oil");
  await expect(page.getByLabel("Price 1 in pounds")).toHaveValue("45.00");

  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: `test-results/expenses-${width}.png`, fullPage: true });
  }

  page.once("dialog", (dialog) => dialog.accept());
  await saved.getByRole("button", { name: /^Delete Weekly stock/ }).click();
  await expect(page.getByText("No sheets yet.")).toBeVisible();
});

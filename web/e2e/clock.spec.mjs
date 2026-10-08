import { expect, test } from "@playwright/test";

async function tap(page, keypad, digits) {
  for (const digit of digits) {
    await page.getByRole("group", { name: keypad }).getByRole("button", { name: digit, exact: true }).click();
  }
}

// Staff ID first, then the PIN.
async function signInAt(page, staffId, pin) {
  await tap(page, "Staff ID keypad", staffId);
  await tap(page, "PIN keypad", pin);
}

test("owner adds staff; they clock in and out; the hours reach the timesheet", async ({ browser }) => {
  const context = await browser.newContext(test.info().project.use);
  const admin = await context.newPage();
  await admin.goto("/admin/staff");
  await admin.evaluate(() => localStorage.clear());
  await admin.reload();
  await admin.getByLabel("Shift code").fill("2580");
  await admin.getByRole("button", { name: "Unlock" }).click();

  const clock = await context.newPage();
  await clock.goto("/clock");
  await expect(clock.getByText("No staff on the list yet.")).toBeVisible();

  const team = admin.getByRole("region", { name: /^Team/ });
  // Owner adds Ali, who gets Staff ID 101; the clock tablet updates without a reload.
  await admin.getByLabel("Name").fill("Ali Khan");
  await admin.getByLabel("Role").selectOption("kitchen");
  await expect(admin.getByLabel("Staff ID (3 digits)")).toHaveValue("101");
  await admin.getByLabel("Clock PIN (4 digits)").fill("4826");
  await admin.getByRole("button", { name: "Add", exact: true }).click();
  await expect(team.getByRole("listitem").filter({ hasText: "Ali Khan" })).toContainText("101");

  // Someone else's Staff ID is refused; their PIN is fine, the ID tells them apart.
  await admin.getByLabel("Name").fill("Jo");
  await admin.getByLabel("Staff ID (3 digits)").fill("101");
  await admin.getByLabel("Clock PIN (4 digits)").fill("4826");
  await admin.getByRole("button", { name: "Add", exact: true }).click();
  await expect(admin.getByText("Staff ID 101 belongs to Ali Khan. Pick another.")).toBeVisible();
  await admin.getByLabel("Staff ID (3 digits)").fill("205");
  await admin.getByRole("button", { name: "Add", exact: true }).click();
  await expect(team.getByRole("listitem").filter({ hasText: "Jo" })).toContainText("205");

  // The right PIN under the wrong ID is turned away.
  await signInAt(clock, "102", "4826");
  await expect(clock.getByText("That Staff ID and PIN don't match. Try again.")).toBeVisible();

  // Ali clocks in with his own ID; Jo's shared PIN does not get in the way.
  await signInAt(clock, "101", "4826");
  await expect(clock.getByText("Hi Ali Khan")).toBeVisible();
  await clock.getByRole("button", { name: "Clock in" }).click();
  await expect(clock.getByRole("status")).toContainText("Ali Khan clocked in");
  await expect(clock.getByRole("region", { name: /^On shift now/ }).getByText("Ali Khan")).toBeVisible();
  await expect(admin.getByText(/on shift since/)).toBeVisible();

  // And out again.
  await expect(clock.getByText("Enter your Staff ID")).toBeVisible({ timeout: 8000 });
  await signInAt(clock, "101", "4826");
  await clock.getByRole("button", { name: "Clock out" }).click();
  await expect(clock.getByRole("status")).toContainText("Ali Khan clocked out");
  await expect(clock.getByText("Nobody is clocked in.")).toBeVisible();

  // The shift is on this week's timesheet.
  const hours = admin.getByRole("region", { name: "Hours" });
  await expect(hours.getByText("1 shift")).toBeVisible();
  await expect(hours.getByRole("button", { name: "Download CSV" })).toBeEnabled();

  await context.close();
});

test("five wrong tries lock the pad", async ({ page }) => {
  await page.goto("/clock");
  await page.evaluate(() => {
    localStorage.clear();
  });
  // One member so the pad shows.
  await page.goto("/admin/staff");
  await page.getByLabel("Shift code").fill("2580");
  await page.getByRole("button", { name: "Unlock" }).click();
  await page.getByLabel("Name").fill("Sam");
  await page.getByLabel("Clock PIN (4 digits)").fill("1357");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Sam").first()).toBeVisible();

  await page.goto("/clock");
  for (let i = 0; i < 5; i += 1) await signInAt(page, "101", "0000");
  await expect(page.getByText(/^Locked\. Try again in \d+s\.$/)).toBeVisible();
  await expect(page.getByRole("group", { name: "Staff ID keypad" }).getByRole("button", { name: "5", exact: true })).toBeDisabled();
});

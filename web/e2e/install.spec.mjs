import { expect, test } from "@playwright/test";

// "Add to Home Screen" at the top of every page, and the web app manifest
// each screen installs from.

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

// Chrome's install offer, as the page sees it: `choice` is what the person taps.
const offerInstall = (page, choice) =>
  page.evaluate((outcome) => {
    const offer = new Event("beforeinstallprompt", { cancelable: true });
    offer.prompt = () => {
      window.__prompted = (window.__prompted ?? 0) + 1;
    };
    offer.userChoice = Promise.resolve({ outcome });
    window.dispatchEvent(offer);
  }, choice);

test("each screen links its own app, which opens on that screen", async ({ page, request }) => {
  for (const [path, id, start] of [
    ["/", "customer", "/"],
    ["/staff", "staff", "/staff"],
    ["/admin", "admin", "/admin"],
    ["/driver", "driver", "/driver"],
    ["/clock", "clock", "/clock"],
  ]) {
    await page.goto(path);
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", `/apps/${id}.webmanifest`);
    const res = await request.get(`/apps/${id}.webmanifest`);
    expect(res.ok()).toBe(true);
    expect(await res.json()).toMatchObject({ start_url: start, display: "standalone" });
  }
});

test("on Android, the button opens Chrome's own install prompt", async ({ page }) => {
  await page.goto("/staff");
  const bar = page.getByRole("complementary", { name: "Add to Home Screen" });
  await expect(bar).toHaveCount(0);
  await offerInstall(page, "accepted");
  await expect(bar.getByText("Get the Orders app on your home screen")).toBeVisible();
  await bar.getByRole("button", { name: "Add to Home Screen" }).click();
  expect(await page.evaluate(() => window.__prompted)).toBe(1);
  await expect(bar).toHaveCount(0);
});

test.describe("on iPhone", () => {
  test.use({ userAgent: IPHONE_UA });

  test("the button shows the Share menu steps, and can be hidden for the visit", async ({ page }) => {
    await page.goto("/");
    const bar = page.getByRole("complementary", { name: "Add to Home Screen" });
    await expect(bar.getByText("Get Flex Chicken on your home screen")).toBeVisible();
    await bar.getByRole("button", { name: "Add to Home Screen" }).click();
    await expect(bar.getByText(/Scroll down, tap/)).toBeVisible();

    await bar.getByRole("button", { name: "Hide for now" }).click();
    await expect(bar).toHaveCount(0);
    await page.goto("/full-menu");
    await expect(page.getByRole("heading").first()).toBeVisible();
    await expect(bar).toHaveCount(0);
  });

  test("fits a 320 px phone without pushing the page sideways", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Add to Home Screen" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });
});

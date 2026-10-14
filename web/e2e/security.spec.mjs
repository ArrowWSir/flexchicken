import { expect, test } from "@playwright/test";
import { watchForBlocks } from "./security.mjs";

// The security headers (worker.js) on the database build: they are sent, and
// no page, scrolled top to bottom, has anything blocked by them. Run against
// the preview (npm run preview), or CLOUD_URL for the live site.
const ADMIN_PIN = process.env.CLOUD_ADMIN_PIN || "135792";

const CUSTOMER_PAGES = ["/", "/full-menu", "/checkout", "/account", "/track?id=ord_000000000000000000000000", "/stamp", "/allergens", "/privacy", "/terms"];
const STAFF_PAGES = ["/admin", "/admin/orders", "/admin/cards", "/admin/menu", "/admin/offers", "/admin/shop", "/admin/staff", "/admin/order-list", "/driver", "/clock"];

async function scrollThrough(page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(async () => {
    for (let y = 0; y <= document.documentElement.scrollHeight; y += 400) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
  });
  await page.waitForLoadState("networkidle");
}

test("every response carries the security headers, and none says what the site runs on", async ({ request }) => {
  for (const path of ["/", "/admin", "/api/staff/me"]) {
    const headers = (await request.get(path)).headers();
    const csp = headers["content-security-policy"] ?? headers["content-security-policy-report-only"];
    expect(csp, path).toContain("default-src 'self'");
    expect(csp, path).toContain("frame-ancestors 'none'");
    expect(csp, path).toContain("object-src 'none'");
    expect(headers["x-content-type-options"], path).toBe("nosniff");
    expect(headers["x-frame-options"], path).toBe("DENY");
    expect(headers["cross-origin-opener-policy"], path).toBe("same-origin");
    expect(headers["permissions-policy"], path).toContain("geolocation=(self)");
    expect(headers["x-powered-by"], path).toBeUndefined();
  }
});

test("customer pages load and scroll with nothing blocked", async ({ browser }) => {
  const context = await browser.newContext(test.info().project.use);
  const blocked = await watchForBlocks(context);
  const page = await context.newPage();
  await page.route("https://*.tile.openstreetmap.org/**", (route) => route.abort());
  for (const path of CUSTOMER_PAGES) {
    await page.goto(path);
    await scrollThrough(page);
  }
  // Not just "no errors": a dish photo really drew.
  await page.goto("/");
  const hasDish = await page.locator("img").evaluateAll((imgs) => imgs.some((i) => i.complete && i.naturalWidth > 0));
  expect(hasDish).toBe(true);
  // Fonts are self-hosted and must load under the policy.
  expect(await page.evaluate(() => document.fonts.check("16px Poppins") || [...document.fonts].some((f) => f.status === "loaded"))).toBe(true);
  expect(blocked).toEqual([]);
  await context.close();
});

test("staff pages load and scroll with nothing blocked", async ({ browser }) => {
  const context = await browser.newContext(test.info().project.use);
  const blocked = await watchForBlocks(context);
  const page = await context.newPage();
  await page.route("https://*.tile.openstreetmap.org/**", (route) => route.abort());
  await page.goto("/admin");
  await page.getByLabel("Shift code").fill(ADMIN_PIN);
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.getByRole("button", { name: "Unlock" })).toHaveCount(0);
  for (const path of STAFF_PAGES) {
    await page.goto(path);
    await scrollThrough(page);
  }
  expect(blocked).toEqual([]);
  await context.close();
});

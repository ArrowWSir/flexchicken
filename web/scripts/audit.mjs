// Walks every page of the running site, as customer, kitchen, driver and
// staff, and reports per page: console and page errors, failed requests,
// sideways scroll, and axe accessibility violations (WCAG 2.2 A/AA).
//   npm run dev   (in another terminal)
//   node scripts/audit.mjs [baseUrl]
// Output: .shots/audit/*.png and .shots/audit/report.json (git-ignored)
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const BASE = process.argv[2] ?? "http://localhost:3200";
const OUT = "./.shots/audit";
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: "small", width: 320, height: 640, isMobile: true, hasTouch: true },
  { name: "phone", width: 375, height: 812, isMobile: true, hasTouch: true },
  { name: "tablet", width: 768, height: 1024, isMobile: true, hasTouch: true },
  { name: "tabland", width: 1024, height: 768, isMobile: true, hasTouch: true },
  { name: "desktop", width: 1440, height: 900, isMobile: false, hasTouch: false },
];
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function seed(context) {
  const page = await context.newPage();
  await page.route("https://api.postcodes.io/postcodes/**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ status: 200, result: { postcode: "RM13 8AB", latitude: 51.5205, longitude: 0.2052 } }),
    })
  );
  await page.goto(`${BASE}/`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  // Customer: 7 burgers, delivery, signed in, order placed.
  await page.getByRole("button", { name: "Burgers", exact: true }).click();
  for (let i = 1; i < 7; i += 1) await page.getByRole("button", { name: "One more" }).first().click();
  await page.getByRole("button", { name: /^Add to Box: \d+ × / }).click();
  await page.goto(`${BASE}/checkout`);
  await page.getByRole("button", { name: "Sign in to order" }).click();
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await page.getByLabel("Name").fill("Sam Taylor");
  await page.getByLabel("Email").fill("sam@example.com");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Postcode").fill("RM13 8AB");
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await page.getByLabel("House number and street").fill("12 Test Road");
  await page.getByLabel("Mobile number").fill("07700 900123");
  await page.getByRole("button", { name: /^Place order · £/ }).click();
  await page.waitForURL(/\/track\?/);
  const trackUrl = page.url().replace(BASE, "");

  // Kitchen: unlock, cook it to ready; add two staff.
  await page.goto(`${BASE}/admin/orders`);
  await page.getByLabel("Shift code").fill("2580");
  await page.getByRole("button", { name: "Unlock" }).click();
  const ticket = page.getByRole("article", { name: /Order #0001/ });
  for (const step of ["Accept", "Start cooking", "Mark ready"]) await ticket.getByRole("button", { name: step }).click();
  await page.goto(`${BASE}/admin/staff`);
  for (const [name, pin] of [["Ali Khan", "4826"], ["Jo Smith", "7391"]]) {
    await page.getByLabel("Name").fill(name);
    await page.getByLabel("Clock PIN (4 digits)").fill(pin);
    await page.getByRole("button", { name: "Add", exact: true }).click();
  }

  // Driver: unlock. Staff: Ali clocks in.
  await page.goto(`${BASE}/driver`);
  await page.getByLabel("Your name").fill("Dan");
  await page.getByLabel("Shift code").fill("1111");
  await page.getByRole("button", { name: "Unlock" }).click();
  await page.goto(`${BASE}/clock`);
  for (const digit of "4826") await page.getByRole("group", { name: "PIN keypad" }).getByRole("button", { name: digit, exact: true }).click();
  await page.getByRole("button", { name: "Clock in" }).click();

  // Owner: one live offer, so the ticket under the card is audited too.
  await page.evaluate(() =>
    localStorage.setItem(
      "fc_store_promotions",
      JSON.stringify([{ id: "promo_audit", kind: "percent", title: "20% off tonight", detail: "On every order over £15.", percent: 20, scope: "order", itemIds: [], minOrderPence: 1500, startsAt: null, endsAt: null, isActive: true, createdAt: 0 }])
    )
  );
  await page.close();
  return trackUrl;
}

async function auditPage(context, vp, path) {
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  page.on("console", (msg) => msg.type() === "error" && errors.push(`console: ${msg.text()}`));
  page.on("response", (res) => res.status() >= 400 && errors.push(`HTTP ${res.status()}: ${res.url()}`));
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500); // card flip, table roll-in
  const sideScroll = await page.evaluate(() => {
    window.scrollTo(400, window.scrollY);
    const moved = window.scrollX;
    window.scrollTo(0, window.scrollY);
    return moved;
  });
  // The page clips sideways overflow (html { overflow-x: clip }), so also
  // catch content that is wider than the screen even though it cannot scroll.
  const clipped = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const axe = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  const route = path.split("?")[0];
  const name = `${vp.name}${route === "/" ? "-home" : route.replace(/\//g, "-")}`;
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  await page.close();
  return {
    page: path,
    viewport: vp.name,
    errors,
    sideScroll,
    clipped,
    violations: axe.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.slice(0, 4).map((n) => ({ target: n.target.join(" "), summary: n.failureSummary?.split("\n").slice(0, 3).join(" ") })),
      count: v.nodes.length,
    })),
  };
}

const browser = await chromium.launch();
const report = [];
for (const vp of VIEWPORTS) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch, deviceScaleFactor: 1 });
  const trackUrl = await seed(context);
  const pages = ["/", "/checkout", trackUrl, "/account", "/allergens", "/terms", "/privacy", "/full-menu", "/admin", "/admin/orders", "/admin/cards", "/admin/menu", "/admin/offers", "/admin/shop", "/admin/staff", "/driver", "/clock"];
  for (const path of pages) {
    const result = await auditPage(context, vp, path);
    report.push(result);
    const flag = result.errors.length || result.sideScroll || result.clipped > 0 || result.violations.length ? "!!" : "ok";
    console.log(`${flag} ${vp.name.padEnd(7)} ${path.split("?")[0].padEnd(14)} errors ${result.errors.length}  side-scroll ${result.sideScroll}px  too wide ${result.clipped}px  a11y ${result.violations.map((v) => `${v.id}(${v.count})`).join(", ") || "none"}`);
  }
  await context.close();
}
await browser.close();
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));

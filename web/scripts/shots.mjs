// Screenshots of the running dev server at the breakpoints we check.
//   npm run dev   (in another terminal)
//   node scripts/shots.mjs [baseUrl]
// Output: .shots/*.png (git-ignored)
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const BASE = process.argv[2] ?? "http://localhost:3200";
const OUT = new URL("../.shots/", import.meta.url);
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: "phone-375", width: 375, height: 812, isMobile: true },
  { name: "phone-320", width: 320, height: 640, isMobile: true },
  { name: "tablet-768", width: 768, height: 1024, isMobile: true },
  { name: "desktop-1440", width: 1440, height: 900, isMobile: false },
];

const browser = await chromium.launch();
for (const vp of VIEWPORTS) {
  const page = await browser.newPage({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2,
    isMobile: vp.isMobile,
    hasTouch: vp.isMobile,
  });
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (msg) => msg.type() === "error" && errors.push(msg.text()));

  await page.goto(`${BASE}/?stamps=5`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1800); // card flip + stamps
  await page.screenshot({ path: new URL(`${vp.name}-top.png`, OUT).pathname.slice(1) });

  await page.locator("#menu").scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);
  await page.screenshot({ path: new URL(`${vp.name}-menu.png`, OUT).pathname.slice(1) });

  await page.getByRole("button", { name: "Burgers", exact: true }).click();
  await page.waitForTimeout(1400);
  await page.screenshot({ path: new URL(`${vp.name}-burgers.png`, OUT).pathname.slice(1) });

  await page.screenshot({ path: new URL(`${vp.name}-full.png`, OUT).pathname.slice(1), fullPage: true });
  // scrollWidth still counts clipped content, so test whether the page can
  // actually be moved sideways.
  const sideScroll = await page.evaluate(() => {
    window.scrollTo(500, window.scrollY);
    const x = window.scrollX;
    window.scrollTo(0, window.scrollY);
    return x;
  });
  console.log(`${vp.name}: page side-scroll ${sideScroll}px, errors: ${errors.length ? errors.join(" | ") : "none"}`);
  await page.close();
}
await browser.close();

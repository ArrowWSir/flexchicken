// Renders an SVG drawing to a transparent PNG at 2x, for the asset scripts
// (assets-src/make_extras.py places the result like a dish photo).
// Usage: node scripts/render-svg.mjs <in.svg> <out.png>
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const [src, out] = process.argv.slice(2);
if (!src || !out) {
  console.error("Usage: node scripts/render-svg.mjs <in.svg> <out.png>");
  process.exit(1);
}
const svg = readFileSync(src, "utf8");
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });
await page.setContent(`<style>html,body{margin:0;background:transparent}</style>${svg}`);
await page.locator("svg").screenshot({ path: out, omitBackground: true });
await browser.close();

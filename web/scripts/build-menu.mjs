// Turns the data extracted from the live WordPress site (../site-data) into the
// menu module the app reads (app/lib/menu.generated.json).
//
//   npm run menu
//
// Never edit the generated file by hand: change the rules here, or add a
// per-item tweak in app/lib/menu-overrides.js.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildMenu } from "../app/lib/menuBuild.js";

const here = dirname(fileURLToPath(import.meta.url));
const siteData = join(here, "..", "..", "site-data", "data");
const publicMenu = join(here, "..", "public", "menu");
const out = join(here, "..", "app", "lib", "menu.generated.json");

const read = (name) => JSON.parse(readFileSync(join(siteData, name), "utf8"));

const menu = buildMenu({
  products: read("products.json"),
  sections: read("menu-sections.json").sections,
  hasImage: (slug) => existsSync(join(publicMenu, `${slug}.webp`)),
  isPlated: (slug) => existsSync(join(publicMenu, "plated", `${slug}.webp`)),
});

writeFileSync(out, `${JSON.stringify(menu, null, 2)}\n`);

const items = menu.categories.reduce((sum, c) => sum + c.items.length, 0);
const withImage = menu.categories.reduce((sum, c) => sum + c.items.filter((i) => i.image).length, 0);
console.log(`menu: ${menu.categories.length} categories, ${items} items, ${withImage} with images`);

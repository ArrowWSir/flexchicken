// Pure rules that turn the printed menu board (menuBoard.js) and the live
// site's product data into the app's menu. Used by scripts/build-menu.mjs;
// kept here so the rules are unit tested.
import { MENU_BOARD } from "./menuBoard.js";

// Never shown anywhere: a £0 test product.
const DROP_IDS = new Set([1216]);

const NAME_FIXES = [
  [/\bRingas\b/g, "Rings"],
  [/\bStick x\b/g, "Sticks x"],
  [/\bWhole chicken\b/g, "Whole Chicken"],
  [/\biTems\b/g, "Items"],
  [/\bdeals$/g, "Deal"],
];

// Words that belong with the word before them in a bold title line.
const TAIL_WORDS = new Set(["meal", "box"]);

// "Onion Rings (6 Pcs)", "BBQ Ribs – 5 Piece": the size travels with its noun.
function glueSize(words) {
  const at = words.findIndex((word, i) => i > 0 && (word.startsWith("(") || word === "–"));
  return at === -1 ? words : [...words.slice(0, at - 1), words.slice(at - 1).join(" ")];
}

/** @param {string} name */
export function cleanName(name) {
  return NAME_FIXES.reduce((text, [pattern, fix]) => text.replace(pattern, fix), name.trim());
}

/**
 * Splits a dish name into a light first line and a bold second line.
 * @param {string} name
 * @returns {{ titleLight: string, titleBold: string }}
 */
export function splitTitle(name) {
  // Short names read best as one bold line.
  if (name.split(/\s+/).length <= 2) return { titleLight: "", titleBold: name };
  const words = glueSize(name.split(/\s+/));
  let start = words.length - 1;

  // "Wings x 12": the count travels with its noun.
  if (start >= 2 && /^\d+$/.test(words[start]) && words[start - 1].toLowerCase() === "x") start -= 2;
  // "Flex Combo Meal 1": a bare number is not a line of its own.
  else if (/^\d+$/.test(words[start])) start -= 1;
  // "Burger Box Meal": keep the noun with its Meal/Box tail.
  while (start > 0 && TAIL_WORDS.has(words[start].split(" ")[0].toLowerCase())) start -= 1;

  return {
    titleLight: words.slice(0, start).join(" "),
    titleBold: words.slice(start).join(" "),
  };
}

function toOptions(options = []) {
  return options.map((option) => ({
    label: option.label.replace(/:+\s*$/, "").trim(),
    isRequired: Boolean(option.required),
    choices: option.choices.map((choice) => ({ label: choice.label, priceAdd: choice.price_add })),
  }));
}

// Options from several products, in order; the first with a label wins.
function mergeOptions(lists) {
  const seen = new Set();
  return lists.flat().filter((option) => (seen.has(option.label) ? false : seen.add(option.label)));
}

const isMealName = (name) => /\bmeal\b|\bbox\b/i.test(name);
const photoFor = (slug, hasImage) => (slug && hasImage(slug) ? `/menu/${slug}.webp` : null);

/** A live-site product exactly as the site lists it (drinks). */
function fromProduct(product, categoryId, hasImage) {
  const name = cleanName(product.name);
  return {
    id: product.id,
    slug: product.slug,
    categoryId,
    name,
    ...splitTitle(name),
    price: product.price,
    description: product.description || "",
    options: toOptions(product.options),
    isMeal: isMealName(name),
    image: photoFor(product.slug, hasImage),
  };
}

/** One line of the board, filled in from the product it points at. */
function fromBoard(entry, categoryId, byId, hasImage) {
  const need = (id) => {
    if (!byId.has(id)) throw new Error(`Menu board: "${entry.name}" points at product ${id}, which the site data does not have.`);
    return byId.get(id);
  };
  const product = entry.from ? need(entry.from) : null;
  const optionSources = product ? [product] : (entry.optionsFrom ?? []).map(need);
  const slug = product?.slug ?? entry.id;
  return {
    id: product?.id ?? entry.id,
    slug,
    categoryId,
    name: entry.name,
    ...splitTitle(entry.name),
    price: entry.price,
    description: entry.description ?? product?.description ?? "",
    options: toOptions(mergeOptions(optionSources.map((p) => p.options ?? []))),
    isMeal: isMealName(entry.name),
    image: photoFor(entry.photo ?? slug, hasImage),
  };
}

// The same dish can sit under two headings; it must cost the same in both.
function checkOnePricePerItem(categories) {
  const byId = new Map();
  for (const item of categories.flatMap((c) => c.items)) {
    const first = byId.get(item.id);
    if (first && (first.price !== item.price || first.name !== item.name)) {
      throw new Error(`Menu board: item ${item.id} has two prices or names (${first.name} £${first.price}, ${item.name} £${item.price}).`);
    }
    byId.set(item.id, item);
  }
}

/**
 * @param {{ products: object[], sections: object[], hasImage: (slug: string) => boolean, board?: object[] }} input
 */
export function buildMenu({ products, sections, hasImage, board = MENU_BOARD }) {
  const byId = new Map(products.map((p) => [p.id, p]));
  const bySection = new Map(sections.map((s) => [s.anchor, s.product_ids]));

  const categories = board
    .map(({ items, section, ...def }) => {
      if (!section) return { ...def, items: items.map((entry) => fromBoard(entry, def.id, byId, hasImage)) };
      const listed = (bySection.get(section) ?? [])
        .filter((id) => byId.has(id) && !DROP_IDS.has(id))
        .map((id) => fromProduct(byId.get(id), def.id, hasImage))
        .sort((a, b) => a.price - b.price || a.name.localeCompare(b.name));
      return { ...def, items: listed };
    })
    .filter((category) => category.items.length > 0);

  checkOnePricePerItem(categories);
  return { categories };
}

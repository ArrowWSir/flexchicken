// The menu as the shop sells it: the generated board, the hand copy tweaks,
// then the owner's edits from /admin/menu. The site shows it and the server
// prices orders from it, so both always agree.
import generated from "./menu.generated.json";
import { ITEM_OVERRIDES } from "./menu-overrides";
import { EMPTY_EDITS, applyMenuEdits } from "./menuEdits";

export const BASE_CATEGORIES = generated.categories.map((category) => ({
  ...category,
  items: category.items.map((item) => ({ ...item, ...(ITEM_OVERRIDES[item.slug] ?? {}) })),
}));

/** @param {object} [edits] the owner's menu edits */
export const liveMenu = (edits = EMPTY_EDITS) => applyMenuEdits(BASE_CATEGORIES, { ...EMPTY_EDITS, ...edits });

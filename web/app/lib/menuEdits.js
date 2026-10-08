// The owner's menu changes from /admin/menu, kept separate from the generated
// menu so the shop data can be refreshed without losing them. Pure functions:
// every change returns new edits.
import { splitTitle } from "./menuBuild";

export const EMPTY_EDITS = Object.freeze({
  updated: Object.freeze({}), // id -> fields that changed
  removed: Object.freeze([]), // ids
  added: Object.freeze([]), // whole new items
  soldOut: Object.freeze([]), // ids
});

const NAME_MAX = 60;
const DESCRIPTION_MAX = 240;

export function cleanFields(fields) {
  const out = {};
  if ("name" in fields) {
    const name = String(fields.name ?? "").trim().slice(0, NAME_MAX);
    if (!name) throw new Error("Give the item a name.");
    out.name = name;
  }
  if ("price" in fields) {
    const price = Number(fields.price);
    if (typeof fields.price === "boolean" || fields.price === "" || !Number.isFinite(price) || price < 0) {
      throw new Error("Enter a price of £0.00 or more.");
    }
    out.price = Math.round(price * 100) / 100;
  }
  if ("description" in fields) out.description = String(fields.description ?? "").trim().slice(0, DESCRIPTION_MAX);
  if ("categoryId" in fields) out.categoryId = String(fields.categoryId);
  if ("image" in fields) out.image = fields.image || null;
  if ("options" in fields) out.options = Array.isArray(fields.options) ? fields.options : [];
  return out;
}

export function updateItem(edits, id, fields) {
  const patch = cleanFields(fields);
  const isAdded = edits.added.some((item) => item.id === id);
  if (isAdded) {
    return { ...edits, added: edits.added.map((item) => (item.id === id ? { ...item, ...patch } : item)) };
  }
  return { ...edits, updated: { ...edits.updated, [id]: { ...(edits.updated[id] ?? {}), ...patch } } };
}

export function addItem(edits, fields, makeId = () => Math.random().toString(36).slice(2, 10)) {
  const clean = cleanFields({ description: "", options: [], image: null, ...fields });
  if (!("name" in clean)) throw new Error("Give the item a name.");
  if (!("price" in clean)) throw new Error("Enter a price of £0.00 or more.");
  const item = { id: `new-${makeId()}`, slug: `new-${makeId()}`, isMeal: false, ...clean };
  return { ...edits, added: [...edits.added, item] };
}

export function removeItem(edits, id) {
  if (edits.added.some((item) => item.id === id)) {
    return { ...edits, added: edits.added.filter((item) => item.id !== id) };
  }
  return { ...edits, removed: [...new Set([...edits.removed, id])] };
}

export function setSoldOut(edits, id, isSoldOut) {
  const rest = edits.soldOut.filter((x) => x !== id);
  return { ...edits, soldOut: isSoldOut ? [...rest, id] : rest };
}

const finish = (item, soldOut) => ({
  ...item,
  ...(item.name ? splitTitle(item.name) : {}),
  isSoldOut: soldOut.has(item.id),
});

/** The menu the shop shows: generated categories with the owner's edits on top. */
export function applyMenuEdits(categories, edits) {
  const removed = new Set(edits.removed);
  const soldOut = new Set(edits.soldOut);
  const all = categories.flatMap((category) =>
    category.items
      .filter((item) => !removed.has(item.id))
      .map((item) => {
        const patch = edits.updated[item.id];
        // Keep a generated item's own split title unless its name changed.
        const merged = { ...item, categoryId: category.id, ...(patch ?? {}) };
        return patch?.name ? finish(merged, soldOut) : { ...merged, isSoldOut: soldOut.has(item.id) };
      })
  );
  const added = edits.added.map((item) => finish(item, soldOut));

  const items = [...all, ...added];
  return categories.map((category) => ({
    ...category,
    items: items.filter((item) => item.categoryId === category.id),
  }));
}

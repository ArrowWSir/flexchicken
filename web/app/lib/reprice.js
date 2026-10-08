// The server prices every order itself. The Box arrives from the customer's
// browser, so its prices and names are only a claim: each line is rebuilt
// from the live menu (with the owner's edits) before the order is made.
import { MAX_QTY, lineKey, missingRequired, unitPence, validChoices } from "./cart";

export const MAX_LINES = 50;

function findItem(categories, id) {
  for (const category of categories) {
    const item = category.items.find((i) => i.id === id);
    if (item) return item;
  }
  return null;
}

function repriceLine(line, categories) {
  const label = String(line?.name ?? "An item").slice(0, 60);
  const item = findItem(categories, line?.itemId);
  if (!item) throw new Error(`${label} is no longer on the menu. Remove it from your Box.`);
  if (item.isSoldOut) throw new Error(`${item.name} is sold out today. Remove it from your Box.`);
  const qty = line.qty;
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) throw new Error(`Check the quantity of ${item.name}.`);
  const picked = Array.isArray(line.choices) ? line.choices : [];
  const selections = Object.fromEntries(picked.map((c) => [String(c?.option), String(c?.choice)]));
  const missing = missingRequired(item, selections);
  if (missing.length) throw new Error(`${item.name}: Choose: ${missing.join(", ")}`);
  const choices = validChoices(item, selections);
  return {
    key: lineKey(item.id, choices),
    itemId: item.id,
    name: item.name,
    image: item.image ?? null,
    choices,
    unitPence: unitPence(item, selections),
    qty,
  };
}

/** A new cart priced from `categories`; throws with what the customer must fix. */
export function repriceCart(cart, categories) {
  const lines = cart?.lines;
  if (!Array.isArray(lines) || lines.length === 0) throw new Error("Your Box is empty.");
  if (lines.length > MAX_LINES) throw new Error("Too many different items in one order. Call the shop for a large order.");
  return { lines: lines.map((line) => repriceLine(line, categories)) };
}

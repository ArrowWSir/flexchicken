// The "Flex Box" cart. Pure functions over plain objects: every change returns
// a new cart, and money is whole pence so totals never drift.
//
// Storage is passed in (see browserEnv), never read from a component.

export const CART_KEY = "fc_cart";
export const MAX_QTY = 20;
export const EMPTY_CART = Object.freeze({ lines: Object.freeze([]) });

/** @param {number} pounds */
export function toPence(pounds) {
  return Math.round(Number((Number(pounds) * 100).toFixed(2)));
}

/** @param {number} pence */
export function formatPrice(pence) {
  return `£${(pence / 100).toFixed(2)}`;
}

/** Round amounts without pence, for thresholds in copy: 1500 -> "£15", 1250 -> "£12.50". */
export function formatPriceShort(pence) {
  return pence % 100 === 0 ? `£${pence / 100}` : formatPrice(pence);
}

const clampQty = (qty) => Math.min(MAX_QTY, Math.max(0, Math.floor(Number(qty) || 0)));

// Only choices the item actually offers count; anything else is dropped.
export function validChoices(item, selections = {}) {
  return (item.options ?? []).flatMap((option) => {
    const picked = selections[option.label];
    const choice = option.choices.find((c) => c.label === picked);
    return choice ? [{ option: option.label, choice: choice.label, priceAdd: choice.priceAdd }] : [];
  });
}

/**
 * Required options with a single choice need no decision, so they start picked.
 * @returns {Record<string, string>}
 */
export function defaultSelections(item) {
  return Object.fromEntries(
    (item.options ?? [])
      .filter((option) => option.isRequired && option.choices.length === 1)
      .map((option) => [option.label, option.choices[0].label])
  );
}

/** @returns {string[]} labels of required options still unanswered */
export function missingRequired(item, selections = {}) {
  const answered = new Set(validChoices(item, selections).map((c) => c.option));
  return (item.options ?? []).filter((o) => o.isRequired && !answered.has(o.label)).map((o) => o.label);
}

export function unitPence(item, selections = {}) {
  return validChoices(item, selections).reduce((sum, c) => sum + toPence(c.priceAdd), toPence(item.price));
}

export function lineKey(itemId, choices) {
  return [itemId, ...choices.map((c) => `${c.option}=${c.choice}`)].join("|");
}

/**
 * Adds `qty` of an item with the given option choices. Throws if a required
 * option is missing, so a half-built meal can never reach checkout.
 */
export function addToCart(cart, item, selections, qty) {
  const amount = clampQty(qty);
  if (amount < 1) return cart;
  const missing = missingRequired(item, selections);
  if (missing.length) throw new Error(`Choose: ${missing.join(", ")}`);

  const choices = validChoices(item, selections);
  const key = lineKey(item.id, choices);
  const existing = cart.lines.find((line) => line.key === key);
  if (existing) {
    return setLineQty(cart, key, existing.qty + amount);
  }
  const line = {
    key,
    itemId: item.id,
    name: item.name,
    image: item.image ?? null,
    choices,
    unitPence: unitPence(item, selections),
    qty: amount,
  };
  return { lines: [...cart.lines, line] };
}

export function setLineQty(cart, key, qty) {
  const amount = clampQty(qty);
  if (amount < 1) return removeLine(cart, key);
  return { lines: cart.lines.map((line) => (line.key === key ? { ...line, qty: amount } : line)) };
}

export function removeLine(cart, key) {
  return { lines: cart.lines.filter((line) => line.key !== key) };
}

/**
 * Moves every line of `picks` (the full menu's selection, built with the same
 * functions) into `cart`. A dish with the same choices joins the line already
 * there, up to MAX_QTY.
 */
export function mergeCart(cart, picks) {
  return picks.lines.reduce((box, pick) => {
    const existing = box.lines.find((line) => line.key === pick.key);
    if (existing) return setLineQty(box, pick.key, existing.qty + pick.qty);
    return { lines: [...box.lines, { ...pick, qty: clampQty(pick.qty) }] };
  }, cart);
}

export function cartSummary(cart) {
  return cart.lines.reduce(
    (sum, line) => ({ count: sum.count + line.qty, subtotalPence: sum.subtotalPence + line.qty * line.unitPence }),
    { count: 0, subtotalPence: 0 }
  );
}

function isValidLine(line) {
  return (
    line &&
    typeof line.key === "string" &&
    Number.isInteger(line.itemId) &&
    typeof line.name === "string" &&
    Number.isInteger(line.unitPence) &&
    line.unitPence >= 0 &&
    Number.isInteger(line.qty) &&
    line.qty >= 1 &&
    line.qty <= MAX_QTY &&
    Array.isArray(line.choices)
  );
}

/** Never throws: blocked or corrupt storage gives an empty cart. */
export function loadCart(storage) {
  try {
    const data = JSON.parse(storage.getItem(CART_KEY));
    if (!data || !Array.isArray(data.lines) || !data.lines.every(isValidLine)) return EMPTY_CART;
    return { lines: data.lines };
  } catch {
    return EMPTY_CART;
  }
}

export function saveCart(storage, cart) {
  try {
    storage.setItem(CART_KEY, JSON.stringify({ lines: cart.lines }));
  } catch {
    // Blocked storage: the cart still works for this visit.
  }
}

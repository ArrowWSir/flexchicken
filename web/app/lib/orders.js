// Orders: how one is built from the Box, and the steps it moves through.
// Pure functions; every change returns a new order.
import { priceCart } from "./promotions";
import { deliveryQuote } from "./geo";

export const ORDER_FLOW = Object.freeze({
  delivery: ["placed", "accepted", "preparing", "ready", "out_for_delivery", "delivered"],
  collection: ["placed", "accepted", "preparing", "ready", "collected"],
});

export const STATUS_LABEL = Object.freeze({
  placed: "New",
  accepted: "Accepted",
  preparing: "Cooking",
  ready: "Ready",
  out_for_delivery: "On the way",
  delivered: "Delivered",
  collected: "Collected",
  cancelled: "Cancelled",
});

// What the customer reads on their tracking page.
export const STATUS_MESSAGE = Object.freeze({
  placed: "We have your order. The kitchen will accept it in a moment.",
  accepted: "Accepted. Your food is next in line.",
  preparing: "Cooking now, fresh for you.",
  ready: "Ready and packed.",
  out_for_delivery: "On the way to you.",
  delivered: "Delivered. Enjoy!",
  collected: "Collected. Enjoy!",
  cancelled: "This order was cancelled. Please call us if you need help.",
});

const FINISHED = new Set(["delivered", "collected", "cancelled"]);
const WARM_AFTER_MS = 10 * 60_000;
const LATE_AFTER_MS = 20 * 60_000;

export const isFinished = (order) => FINISHED.has(order.status);

export function formatOrderNumber(number) {
  return `#${String(number).padStart(4, "0")}`;
}

/**
 * `promotions` are the owner's offers; the best live one is applied, and the
 * delivery minimum counts what the food costs after it.
 * @param {{ cart, customer, mode: "delivery" | "collection", address?, note?, settings, promotions?, sequence: number, now: number }} input
 */
export function buildOrder({ cart, customer, mode, address = null, note = "", settings, promotions = [], sequence, now, id = null }) {
  if (!customer?.id) throw new Error("Please sign in to place an order.");
  if (!cart?.lines?.length) throw new Error("Your Box is empty.");
  if (!Object.hasOwn(ORDER_FLOW, mode)) throw new Error("Choose delivery or collection.");

  const { subtotalPence, discountPence, itemsPence, promo } = priceCart(cart, promotions, now);
  let deliveryPence = 0;
  if (mode === "delivery") {
    if (!address?.postcode) throw new Error("Add your delivery address.");
    const quote = deliveryQuote(settings, itemsPence, address);
    if (!quote.isAvailable) {
      throw new Error(quote.isInArea ? quote.reason : `This address is outside our delivery area. ${quote.reason ?? ""}`.trim());
    }
    deliveryPence = quote.feePence;
  }

  return {
    // The server passes a random id, so an order link cannot be guessed.
    id: id ?? `ord_${now.toString(36)}_${sequence}`,
    number: sequence,
    status: "placed",
    mode,
    createdAt: now,
    // The kitchen's promise at the time of ordering ("Ready in" in Admin → Shop).
    readyBy: now + settings.prepMinutes * 60_000,
    customer: { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone ?? "" },
    address: mode === "delivery" ? address : null,
    note: String(note).trim().slice(0, 280),
    lines: cart.lines.map((line) => ({ ...line, choices: line.choices.map((c) => ({ ...c })) })),
    totals: { subtotalPence, discountPence, deliveryPence, totalPence: itemsPence + deliveryPence },
    promo,
    // Cash only until card payment (Teya) is connected; the checkout shows card as coming soon.
    payment: { method: "cash", provider: null, status: "due" },
    driver: null,
    history: [{ status: "placed", at: now }],
  };
}

/** The step after this one, or null at the end. */
export function nextStatus(order) {
  const flow = ORDER_FLOW[order.mode];
  const at = flow.indexOf(order.status);
  return at >= 0 && at < flow.length - 1 ? flow[at + 1] : null;
}

export function canAdvance(order, status) {
  if (status === "cancelled") return !isFinished(order);
  return nextStatus(order) === status;
}

/**
 * Move an order on one step. `extra` carries what that step needs, such as
 * the driver taking it out.
 */
export function advanceOrder(order, status, now, extra = {}) {
  if (!canAdvance(order, status)) {
    throw new Error(`Order ${formatOrderNumber(order.number)} cannot go from ${order.status} to ${status}.`);
  }
  return {
    ...order,
    ...(status === "out_for_delivery" && extra.driver ? { driver: { id: extra.driver.id, name: extra.driver.name } } : {}),
    status,
    history: [...order.history, { status, at: now }],
  };
}

/** How long a ticket has waited: drives its colour on the kitchen screen. */
export function ticketUrgency(createdAt, now) {
  const age = now - createdAt;
  if (age >= LATE_AFTER_MS) return "late";
  if (age >= WARM_AFTER_MS) return "warm";
  return "fresh";
}

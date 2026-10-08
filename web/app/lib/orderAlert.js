// Spotting orders a screen has not seen yet, and what the kitchen's
// notification says about one. Pure; the hooks do the browser parts.
import { formatPrice } from "./cart";
import { formatOrderNumber } from "./orders";

/**
 * `seen` is null on a screen's first look: everything already there counts
 * as seen, so opening the admin does not ring for old orders.
 * @returns {{ seen: Set<string>, fresh: string[] }}
 */
export function spotFresh(seen, ids) {
  if (seen === null) return { seen: new Set(ids), fresh: [] };
  const fresh = ids.filter((id) => !seen.has(id));
  return { seen: fresh.length ? new Set([...seen, ...fresh]) : seen, fresh };
}

export function notificationFor(order) {
  const mode = order.mode === "delivery" ? `Delivery to ${order.address?.postcode ?? "customer"}` : "Collection";
  const items = order.lines.reduce((sum, line) => sum + line.qty, 0);
  return {
    title: `New order ${formatOrderNumber(order.number)}`,
    body: `${mode} · ${items} item${items === 1 ? "" : "s"} · ${formatPrice(order.totals.totalPence)}\n${order.customer.name}`,
    // One notification per order: a repeat replaces it rather than stacking.
    tag: `order-${order.id}`,
  };
}

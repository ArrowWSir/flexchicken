// Live delivery tracking: where the driver is, and which of a customer's
// orders are still moving. Pure functions; nothing here changes its input.
import { distanceMiles } from "./geo";
import { isFinished } from "./orders";

// A rough city speed for "about N minutes away"; honest enough for a hint.
const DRIVER_MPH = 15;
// The driver's phone sends a fix every few seconds; a minute of silence means
// the page was closed or the signal dropped.
export const STALE_LOCATION_MS = 60_000;

const NO_FIX = Object.freeze({ isLive: false, milesAway: null, minutesAway: null });

/**
 * How far the driver is from the delivery address, and whether that is live.
 * @param {{ mode: string, status: string, address: { latitude: number, longitude: number } | null }} order
 * @param {{ latitude: number, longitude: number, at: number } | null} location
 * @param {number} now
 * @returns {{ isLive: boolean, milesAway: number | null, minutesAway: number | null }}
 */
export function driverFix(order, location, now) {
  const home = order.address;
  if (order.mode !== "delivery" || order.status !== "out_for_delivery" || !home || !location) return NO_FIX;
  const milesAway = distanceMiles(location, home);
  return {
    isLive: now - location.at < STALE_LOCATION_MS,
    milesAway,
    minutesAway: Math.max(1, Math.round((milesAway / DRIVER_MPH) * 60)),
  };
}

/**
 * One customer's orders: those still moving (on the way first) and finished
 * ones, each newest first.
 * @returns {{ active: object[], past: object[] }}
 */
export function ordersOf(orders, customerId) {
  const mine = orders.filter((o) => o.customer.id === customerId).sort((a, b) => b.createdAt - a.createdAt);
  const onTheWay = (o) => (o.status === "out_for_delivery" ? 0 : 1);
  return {
    active: mine.filter((o) => !isFinished(o)).sort((a, b) => onTheWay(a) - onTheWay(b)),
    past: mine.filter(isFinished),
  };
}

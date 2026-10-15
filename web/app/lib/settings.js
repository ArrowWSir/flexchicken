// Shop settings the owner can change in /admin/shop. These are the defaults.
//
// Delivery is by postcode zone (lib/deliveryZones.js): £1 near the shop, £2 a
// little further, collection only beyond. Delivery needs an order of at least
// £15 (owner, 2026-10-05); collection has no minimum.
import { BRAND } from "./brand";
import { DEFAULT_ZONES, readZones } from "./deliveryZones";
import { readSchedule } from "./hours";

export const DEFAULT_SETTINGS = Object.freeze({
  deliveryZones: DEFAULT_ZONES,
  minDeliveryOrderPence: 1500,
  isDeliveryOn: true,
  isTakingOrders: true,
  prepMinutes: 20,
  // Opening hours, Europe/London; a day is ["12:00", "23:00"] or null (closed).
  hours: BRAND.hours.schedule,
  // How the receipt prints when an order is accepted: "screen" is the till
  // browser's own print (lib/printer.js); "till" is the Epson printer on the
  // shop's network, which the till's open staff screen sends receipts to
  // (lib/eposDirect.js); "network" is an Epson that collects them from the
  // website itself (Server Direct Print). Both queue on the server
  // (server/printQueue.js).
  receiptPrinter: "screen",
});

export const RECEIPT_PRINTERS = Object.freeze(["screen", "till", "network"]);
/** The modes where accepting queues the receipt on the server. */
export const QUEUED_PRINTERS = Object.freeze(["till", "network"]);

/** Merge saved settings over the defaults, dropping anything malformed. */
export function readSettings(saved) {
  const out = { ...DEFAULT_SETTINGS };
  if (!saved || typeof saved !== "object") return out;
  if (RECEIPT_PRINTERS.includes(saved.receiptPrinter)) out.receiptPrinter = saved.receiptPrinter;
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (key === "deliveryZones" || key === "hours" || key === "receiptPrinter") continue;
    const value = saved[key];
    if (typeof value === typeof DEFAULT_SETTINGS[key] && (typeof value !== "number" || (Number.isFinite(value) && value >= 0))) {
      out[key] = value;
    }
  }
  out.deliveryZones = readZones(saved.deliveryZones) ?? DEFAULT_ZONES;
  out.hours = readSchedule(saved.hours) ?? DEFAULT_SETTINGS.hours;
  return out;
}

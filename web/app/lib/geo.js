// Distances, and whether an order can be delivered: by postcode zone
// (lib/deliveryZones.js), with a minimum order for delivery.
import { BRAND } from "./brand";
import { matchZone } from "./deliveryZones";

const EARTH_RADIUS_MILES = 3958.8;
const toRad = (deg) => (deg * Math.PI) / 180;

/** Great-circle distance in miles between two { latitude, longitude } points. */
export function distanceMiles(a, b) {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

const pounds = (pence) => (pence % 100 === 0 ? `£${pence / 100}` : `£${(pence / 100).toFixed(2)}`);

/** Miles from the shop to a { latitude, longitude } place; null without both. */
export function milesFromShop(place) {
  if (!Number.isFinite(place?.latitude) || !Number.isFinite(place?.longitude)) return null;
  return distanceMiles(BRAND.geo, place);
}

/**
 * Whether this basket can be delivered to `place` ({ postcode, latitude?,
 * longitude? }), and what it costs. Delivery needs the place inside a zone
 * (by postcode, or by distance for unlisted postcodes) and the basket at or
 * over the minimum order; the zone's fee then always applies.
 * @returns {{ isInArea: boolean, isAvailable: boolean, feePence: number, shortfallPence: number, reason: string | null, zone: { id: string, label: string } | null }}
 */
export function deliveryQuote(settings, subtotalPence, place) {
  const postcode = place?.postcode ?? null;
  const no = (isInArea, reason, shortfallPence = 0, zone = null) => ({ isInArea, isAvailable: false, feePence: 0, shortfallPence, reason, zone });

  if (!settings.isDeliveryOn) return no(false, "Delivery is paused right now. Collection is open.");
  if (!postcode) return no(false, "Enter your postcode to check delivery.");
  const match = matchZone(settings.deliveryZones, postcode, milesFromShop(place));
  if (!match) return no(false, `We do not deliver to ${postcode} yet, so this order is collection only.`);
  const zone = { id: match.id, label: match.label };
  const shortfallPence = Math.max(0, settings.minDeliveryOrderPence - subtotalPence);
  if (shortfallPence > 0) {
    return no(
      true,
      `Delivery has a ${pounds(settings.minDeliveryOrderPence)} minimum order. Add ${pounds(shortfallPence)} more, or collect it.`,
      shortfallPence,
      zone
    );
  }
  return { isInArea: true, isAvailable: true, feePence: match.feePence, shortfallPence: 0, reason: null, zone };
}

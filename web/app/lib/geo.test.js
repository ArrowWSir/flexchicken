import { describe, expect, test } from "vitest";
import { deliveryQuote, distanceMiles } from "./geo";
import { DEFAULT_SETTINGS } from "./settings";

const SHOP = { latitude: 51.518732, longitude: 0.193829 };

describe("distanceMiles", () => {
  test("is zero at the shop", () => {
    expect(distanceMiles(SHOP, SHOP)).toBe(0);
  });

  test("measures a known distance (Rainham shop to Romford station, about 3.9 miles)", () => {
    const romford = { latitude: 51.5748, longitude: 0.1832 };
    expect(distanceMiles(SHOP, romford)).toBeGreaterThan(3.7);
    expect(distanceMiles(SHOP, romford)).toBeLessThan(4.0);
  });
});

describe("deliveryQuote", () => {
  const settings = DEFAULT_SETTINGS; // the owner's zones, £15 minimum

  test("zone 1 postcode, at or over the £15 minimum: delivery for £1", () => {
    expect(deliveryQuote(settings, 1500, { postcode: "RM13 9AA" })).toEqual({
      isInArea: true,
      isAvailable: true,
      feePence: 100,
      shortfallPence: 0,
      reason: null,
      zone: { id: "zone-1", label: "Within 1 mile" },
    });
  });

  test("unlisted RM12, RM10 or RM9 postcode up to 2 miles away: delivery for £2", () => {
    // Elm Park, about 1.5 miles from the shop.
    const place = { postcode: "RM12 5AB", latitude: 51.5398, longitude: 0.1989 };
    expect(deliveryQuote(settings, 2000, place)).toMatchObject({ isAvailable: true, feePence: 200, zone: { label: "Within 2 miles" } });
  });

  test("same districts beyond 2 miles: collection only", () => {
    // Hornchurch, about 2.6 miles from the shop.
    const place = { postcode: "RM12 6AB", latitude: 51.5552, longitude: 0.2107 };
    expect(deliveryQuote(settings, 2000, place)).toMatchObject({ isInArea: false, isAvailable: false, zone: null });
  });

  test("in a zone but under the minimum, delivery waits for a bigger order", () => {
    const quote = deliveryQuote(settings, 1200, { postcode: "RM13 9AB" });
    expect(quote).toMatchObject({ isInArea: true, isAvailable: false, shortfallPence: 300 });
    expect(quote.reason).toMatch(/£15 minimum/);
  });

  test("outside every zone, delivery is not available whatever the basket", () => {
    const quote = deliveryQuote(settings, 3000, { postcode: "RM14 2AA" });
    expect(quote).toMatchObject({ isInArea: false, isAvailable: false, zone: null });
    expect(quote.reason).toMatch(/do not deliver to RM14 2AA/);
  });

  test("no postcode cannot be quoted", () => {
    expect(deliveryQuote(settings, 3000, null)).toMatchObject({ isInArea: false, isAvailable: false });
  });

  test("delivery switched off by the shop", () => {
    expect(deliveryQuote({ ...settings, isDeliveryOn: false }, 3000, { postcode: "RM13 9AA" })).toMatchObject({ isAvailable: false });
  });

  // Real postcodes and their coordinates (postcodes.io, 2026-10-05).
  test("an unlisted Rainham postcode is priced by its distance from the shop", () => {
    expect(deliveryQuote(settings, 2000, { postcode: "RM13 9AD", latitude: 51.520275, longitude: 0.196887 })).toMatchObject({ isAvailable: true, feePence: 100 });
    expect(deliveryQuote(settings, 2000, { postcode: "RM13 7BW", latitude: 51.536876, longitude: 0.175176 })).toMatchObject({ isAvailable: true, feePence: 200 });
    expect(deliveryQuote(settings, 2000, { postcode: "RM13 9BJ", latitude: 51.489036, longitude: 0.193828 })).toMatchObject({ isInArea: false });
  });

  test("distance never reaches across the river into districts the zones do not name", () => {
    // Belvedere is 1.7 miles away as the crow flies, but not by road.
    expect(deliveryQuote(settings, 2000, { postcode: "DA17 6BS", latitude: 51.500655, longitude: 0.167255 })).toMatchObject({ isInArea: false });
  });

  test("without coordinates an unlisted postcode is not guessed at", () => {
    expect(deliveryQuote(settings, 2000, { postcode: "RM13 9AD" })).toMatchObject({ isInArea: false });
  });

  test("uses the owner's edited fee", () => {
    const zones = settings.deliveryZones.map((z) => (z.id === "zone-1" ? { ...z, feePence: 150 } : z));
    expect(deliveryQuote({ ...settings, deliveryZones: zones }, 2000, { postcode: "RM13 9AA" }).feePence).toBe(150);
  });
});

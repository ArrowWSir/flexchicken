// Delivery zones, by postcode, as the owner set them (2026-10-05):
//   within 1 mile: a list of full postcodes, £1 delivery
//   within 2 miles: £2, strictly by distance. Its list holds one postcode in
//   each of RM12, RM10 and RM9 (each 1.3 to 1.5 miles away) only so those
//   districts count for distance; whole sectors are not listed, since parts
//   of them lie beyond 2 miles.
// A postcode on no list is priced by straight-line distance from the shop
// (zone 1 within 1 mile, zone 2 within 2), but only in districts the lists
// already cover, so Belvedere, 1.7 miles away across the Thames, never
// qualifies. Anywhere else is collection only. The owner edits the zones in
// /admin/menu.
//
// An area is a full postcode ("RM13 9AA"), a sector or part-postcode
// ("RM12 5", "RM12 5A"), or a whole district ("RM12"). A trailing * in the
// owner's list means "starting with" and is accepted but not needed.

export const DEFAULT_ZONES = Object.freeze([
  Object.freeze({
    id: "zone-1",
    label: "Within 1 mile",
    feePence: 100,
    radiusMiles: 1,
    areas: Object.freeze([
      "RM13 9AA", "RM13 9AB", "RM13 9AG", "RM13 9AX", "RM13 9BB", "RM13 9BD", "RM13 9BE",
      "RM13 9BH", "RM13 9YS", "RM13 9YX", "RM13 9YT", "RM13 9YU", "RM13 9UD", "RM13 9UE",
      "RM13 9UF", "RM13 9UJ", "RM13 9UQ", "RM13 9TS", "RM13 8AA", "RM13 8AB", "RM13 7RJ",
    ]),
  }),
  Object.freeze({
    id: "zone-2",
    label: "Within 2 miles",
    feePence: 200,
    radiusMiles: 2,
    // Elm Park 1.29 mi, Dagenham (Beam) 1.44 mi, Beam Park 1.35 mi.
    areas: Object.freeze(["RM12 5AR", "RM10 9ED", "RM9 6DE"]),
  }),
]);

const DISTRICT = /^[A-Z]{1,2}\d[A-Z\d]?$/;
const WITH_INWARD = /^[A-Z]{1,2}\d[A-Z\d]? \d[A-Z]{0,2}$/;

/** "rm12 5*" -> "RM12 5"; null if it is not a postcode, sector or district. */
export function normalizeArea(value) {
  const clean = String(value ?? "").trim().toUpperCase().replace(/\*+$/, "").replace(/\s+/g, " ").trim();
  return DISTRICT.test(clean) || WITH_INWARD.test(clean) ? clean : null;
}

/**
 * Turns the owner's typed list (one per line, or comma separated) into areas.
 * @returns {{ areas: string[], invalid: string[] }}
 */
export function parseAreas(text) {
  const parts = String(text ?? "")
    .split(/[\n,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const areas = [];
  const invalid = [];
  for (const part of parts) {
    const area = normalizeArea(part);
    if (!area) invalid.push(part);
    else if (!areas.includes(area)) areas.push(area);
  }
  return { areas, invalid };
}

/** Does this full postcode ("RM12 5AB") fall in this area? */
export function inArea(postcode, area) {
  if (DISTRICT.test(area)) return postcode.split(" ")[0] === area;
  return postcode.startsWith(area);
}

export const MAX_RADIUS_MILES = 10;

/** Districts the zones' lists name ("RM13", "RM12" ...); distance only counts inside these. */
export function coveredDistricts(zones) {
  return new Set(zones.flatMap((zone) => zone.areas.map((area) => area.split(" ")[0])));
}

/**
 * The zone for this full postcode, or null. A listed postcode or area wins;
 * otherwise, inside a covered district, the nearest zone whose radius
 * reaches `miles` (straight-line distance from the shop).
 */
export function matchZone(zones, postcode, miles = null) {
  if (!postcode) return null;
  const listed = zones.find((zone) => zone.areas.some((area) => inArea(postcode, area)));
  if (listed) return listed;
  if (!Number.isFinite(miles) || !coveredDistricts(zones).has(postcode.split(" ")[0])) return null;
  const reaching = zones.filter((zone) => zone.radiusMiles != null && miles <= zone.radiusMiles);
  return reaching.sort((a, b) => a.radiusMiles - b.radiusMiles)[0] ?? null;
}

/** A radius the owner typed: a number of miles above 0, or null for none. */
export function readRadius(value) {
  if (value === null || value === undefined || value === "") return null;
  const miles = Number(value);
  return Number.isFinite(miles) && miles > 0 && miles <= MAX_RADIUS_MILES ? Math.round(miles * 100) / 100 : null;
}

/** Keeps only well-formed zones; null if none survive (callers fall back). */
export function readZones(saved) {
  if (!Array.isArray(saved)) return null;
  const zones = saved
    .filter(
      (zone) =>
        zone &&
        typeof zone.label === "string" &&
        zone.label.trim() &&
        Number.isFinite(zone.feePence) &&
        zone.feePence >= 0 &&
        Array.isArray(zone.areas)
    )
    .map((zone, i) => ({
      id: typeof zone.id === "string" && zone.id ? zone.id : `zone-${i + 1}`,
      label: zone.label.trim().slice(0, 40),
      feePence: Math.round(zone.feePence),
      // Zones saved before distances existed keep the default zone's distance.
      radiusMiles: "radiusMiles" in zone ? readRadius(zone.radiusMiles) : (DEFAULT_ZONES.find((d) => d.id === zone.id)?.radiusMiles ?? null),
      areas: zone.areas.map(normalizeArea).filter(Boolean),
    }));
  return zones.length ? zones : null;
}

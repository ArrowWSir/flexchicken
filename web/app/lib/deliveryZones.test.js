import { describe, expect, test } from "vitest";
import { DEFAULT_ZONES, coveredDistricts, inArea, matchZone, normalizeArea, parseAreas, readRadius, readZones } from "./deliveryZones";

describe("areas", () => {
  test("accepts full postcodes, sectors and districts; a trailing * is fine", () => {
    expect(normalizeArea(" rm13 9aa* ")).toBe("RM13 9AA");
    expect(normalizeArea("RM12  5*")).toBe("RM12 5");
    expect(normalizeArea("rm9 6")).toBe("RM9 6");
    expect(normalizeArea("RM12")).toBe("RM12");
    expect(normalizeArea("nonsense")).toBeNull();
    expect(normalizeArea("RM125")).toBeNull(); // ambiguous without the space
  });

  test("parses the owner's typed list, removing repeats and reporting junk", () => {
    expect(parseAreas("RM13 9AA*\nrm13 9ab, RM13 9AA\n\nhello")).toEqual({ areas: ["RM13 9AA", "RM13 9AB"], invalid: ["hello"] });
  });

  test("a sector covers every postcode in it; a district only its own outward code", () => {
    expect(inArea("RM12 5AB", "RM12 5")).toBe(true);
    expect(inArea("RM12 6AB", "RM12 5")).toBe(false);
    expect(inArea("RM13 9AA", "RM13 9AA")).toBe(true);
    expect(inArea("RM12 5AB", "RM12")).toBe(true);
    expect(inArea("RM1 2AB", "RM12")).toBe(false);
  });
});

describe("the owner's zones", () => {
  test("listed postcodes near the shop are zone 1 at £1", () => {
    expect(matchZone(DEFAULT_ZONES, "RM13 9AA")).toMatchObject({ label: "Within 1 mile", feePence: 100 });
    expect(matchZone(DEFAULT_ZONES, "RM13 7RJ")).toMatchObject({ feePence: 100 });
  });

  test("zone 2 lists one postcode in each of RM12, RM10 and RM9, all inside 2 miles", () => {
    expect(DEFAULT_ZONES[1].areas).toEqual(["RM12 5AR", "RM10 9ED", "RM9 6DE"]);
    for (const postcode of ["RM12 5AR", "RM10 9ED", "RM9 6DE"]) {
      expect(matchZone(DEFAULT_ZONES, postcode)).toMatchObject({ label: "Within 2 miles", feePence: 200 });
    }
  });

  test("the old 2-mile sectors are no longer listed: distance decides them", () => {
    for (const postcode of ["RM12 5XY", "RM12 6AB", "RM10 8QQ", "RM10 9AA", "RM9 6ZZ"]) {
      expect(matchZone(DEFAULT_ZONES, postcode)).toBeNull();
      expect(matchZone(DEFAULT_ZONES, postcode, 1.8)).toMatchObject({ id: "zone-2", feePence: 200 });
      expect(matchZone(DEFAULT_ZONES, postcode, 2.01)).toBeNull();
    }
  });

  test("anything else is outside", () => {
    expect(matchZone(DEFAULT_ZONES, "RM13 9AD")).toBeNull();
    expect(matchZone(DEFAULT_ZONES, "RM12 4AB")).toBeNull();
    expect(matchZone(DEFAULT_ZONES, "SW1A 1AA")).toBeNull();
    expect(matchZone(DEFAULT_ZONES, "")).toBeNull();
  });
});

describe("distance for unlisted postcodes", () => {
  test("only in the districts the lists name", () => {
    expect([...coveredDistricts(DEFAULT_ZONES)].sort()).toEqual(["RM10", "RM12", "RM13", "RM9"]);
  });

  test("the nearest zone whose radius reaches", () => {
    expect(matchZone(DEFAULT_ZONES, "RM13 9AD", 0.2)).toMatchObject({ id: "zone-1" });
    expect(matchZone(DEFAULT_ZONES, "RM13 7BW", 1.49)).toMatchObject({ id: "zone-2" });
    expect(matchZone(DEFAULT_ZONES, "RM13 9BJ", 2.05)).toBeNull();
    expect(matchZone(DEFAULT_ZONES, "DA17 6BS", 1.69)).toBeNull();
  });

  test("exactly 2 miles is still delivered; just past it is collection", () => {
    expect(matchZone(DEFAULT_ZONES, "RM12 6AB", 2)).toMatchObject({ id: "zone-2" });
    expect(matchZone(DEFAULT_ZONES, "RM12 6AB", 2.6)).toBeNull();
  });

  test("a listed postcode keeps its zone whatever the distance", () => {
    expect(matchZone(DEFAULT_ZONES, "RM12 5AR", 2.6)).toMatchObject({ id: "zone-2" });
  });

  test("a zone with no radius only covers its list", () => {
    const zones = DEFAULT_ZONES.map((z) => ({ ...z, radiusMiles: null }));
    expect(matchZone(zones, "RM13 9AD", 0.2)).toBeNull();
  });

  test("reads a typed radius", () => {
    expect(readRadius("1.5")).toBe(1.5);
    expect(readRadius("")).toBeNull();
    expect(readRadius(0)).toBeNull();
    expect(readRadius(50)).toBeNull();
    expect(readRadius("abc")).toBeNull();
  });
});

describe("readZones", () => {
  test("keeps good zones and cleans their areas", () => {
    expect(readZones([{ id: "a", label: " Near ", feePence: 150, radiusMiles: "", areas: ["rm13 9aa*", "bad"] }])).toEqual([
      { id: "a", label: "Near", feePence: 150, radiusMiles: null, areas: ["RM13 9AA"] },
    ]);
  });

  test("zones saved before distances existed keep the default distance", () => {
    expect(readZones([{ id: "zone-2", label: "Far", feePence: 200, areas: ["RM12 5"] }])[0].radiusMiles).toBe(2);
    expect(readZones([{ id: "zone-2", label: "Far", feePence: 200, radiusMiles: null, areas: ["RM12 5"] }])[0].radiusMiles).toBeNull();
  });

  test("drops malformed zones and returns null when none are left", () => {
    expect(readZones([{ label: "", feePence: 1, areas: [] }, { label: "X", feePence: -1, areas: [] }])).toBeNull();
    expect(readZones("lots")).toBeNull();
  });
});

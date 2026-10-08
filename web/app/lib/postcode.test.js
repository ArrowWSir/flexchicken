import { describe, expect, test, vi } from "vitest";
import { lookupPostcode, normalizePostcode, postcodeAt } from "./postcode";

describe("normalizePostcode", () => {
  test("tidies spacing and case", () => {
    expect(normalizePostcode(" rm139aa ")).toBe("RM13 9AA");
    expect(normalizePostcode("RM13   9AA")).toBe("RM13 9AA");
  });

  test("rejects things that are not UK postcodes", () => {
    expect(normalizePostcode("12345")).toBeNull();
    expect(normalizePostcode("<script>")).toBeNull();
  });
});

describe("lookupPostcode", () => {
  test("returns coordinates for a real postcode", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 200, result: { postcode: "RM13 9AA", latitude: 51.5187, longitude: 0.1938 } }),
    });
    await expect(lookupPostcode("rm139aa", fetcher)).resolves.toEqual({ postcode: "RM13 9AA", latitude: 51.5187, longitude: 0.1938 });
    expect(fetcher).toHaveBeenCalledWith("https://api.postcodes.io/postcodes/RM13%209AA");
  });

  test("never calls the network for a malformed postcode", async () => {
    const fetcher = vi.fn();
    await expect(lookupPostcode("nope", fetcher)).rejects.toThrow(/valid UK postcode/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  test("an unknown postcode gives a clear message", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({ status: 404 }) });
    await expect(lookupPostcode("ZZ99 9ZZ", fetcher)).rejects.toThrow(/could not find/i);
  });

  test("a network failure gives a clear message", async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(lookupPostcode("RM13 9AA", fetcher)).rejects.toThrow(/check your connection/i);
  });
});

describe("postcodeAt", () => {
  const here = { latitude: 51.5187, longitude: 0.1938 };

  test("finds the nearest postcode for a location", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result: [{ postcode: "RM13 9AA" }] }) });
    await expect(postcodeAt(here, fetcher)).resolves.toBe("RM13 9AA");
    expect(fetcher.mock.calls[0][0]).toContain("lon=0.1938&lat=51.5187");
  });

  test("explains when there is no postcode nearby or the network fails", async () => {
    const empty = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result: null }) });
    await expect(postcodeAt(here, empty)).rejects.toThrow(/enter it instead/);
    const offline = vi.fn().mockRejectedValue(new Error("offline"));
    await expect(postcodeAt(here, offline)).rejects.toThrow(/enter your postcode instead/);
    await expect(postcodeAt({ latitude: NaN, longitude: 0 })).rejects.toThrow(/read your location/);
  });
});

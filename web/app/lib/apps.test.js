import { describe, expect, test } from "vitest";
import { APPS, appFor, manifestFor, manifestUrl } from "./apps";

describe("appFor", () => {
  test("each staff screen is its own app; everything else is the shop's", () => {
    expect(appFor("/staff/cards")).toBe("staff");
    expect(appFor("/admin/orders")).toBe("admin");
    expect(appFor("/driver")).toBe("driver");
    expect(appFor("/clock")).toBe("clock");
    expect(appFor("/")).toBe("customer");
    expect(appFor("/checkout")).toBe("customer");
    expect(appFor("/customer")).toBe("customer");
    expect(appFor(undefined)).toBe("customer");
  });
});

describe("manifestFor", () => {
  test("the till's Orders app opens full screen on /staff", () => {
    expect(manifestFor("staff")).toMatchObject({ id: "/staff", name: "Flex Chicken Orders", short_name: "Orders", start_url: "/staff", scope: "/staff", display: "standalone" });
  });

  test("every app has the 192 and 512 icons Chrome needs to offer an install", () => {
    for (const id of Object.keys(APPS)) {
      expect(manifestFor(id).icons.map((i) => i.sizes)).toEqual(["192x192", "512x512"]);
    }
  });
});

test("manifestUrl", () => {
  expect(manifestUrl("clock")).toBe("/apps/clock.webmanifest");
});

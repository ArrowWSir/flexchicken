import { describe, expect, it } from "vitest";
import { describeStep, formatDistance, parseRoute, routeProgress } from "./navigation";

// A straight road east along a line of latitude, then a left turn north.
const OSRM = {
  code: "Ok",
  routes: [
    {
      distance: 300,
      duration: 60,
      geometry: { coordinates: [[0, 51.5], [0.002, 51.5], [0.002, 51.501]] },
      legs: [
        {
          steps: [
            { distance: 139, duration: 28, name: "High Street", maneuver: { type: "depart", modifier: "right", location: [0, 51.5] } },
            { distance: 111, duration: 22, name: "Mill Lane", maneuver: { type: "turn", modifier: "left", location: [0.002, 51.5] } },
            { distance: 0, duration: 0, name: "Mill Lane", maneuver: { type: "arrive", modifier: "left", location: [0.002, 51.501] } },
          ],
        },
      ],
    },
  ],
};

describe("parseRoute", () => {
  it("turns an OSRM response into points and steps", () => {
    const route = parseRoute(OSRM);
    expect(route.points).toHaveLength(3);
    expect(route.points[0]).toEqual({ latitude: 51.5, longitude: 0 });
    expect(route.steps.map((s) => s.type)).toEqual(["depart", "turn", "arrive"]);
    expect(route.steps[1].location).toEqual({ latitude: 51.5, longitude: 0.002 });
    expect(route.durationSeconds).toBe(60);
  });

  it("throws a readable error when no route comes back", () => {
    expect(() => parseRoute({ code: "NoRoute", routes: [] })).toThrow(/No driving route/);
  });
});

describe("describeStep", () => {
  it("reads turns, roundabouts and arrival in plain words", () => {
    expect(describeStep({ type: "turn", modifier: "left", name: "Mill Lane" })).toBe("Turn left onto Mill Lane");
    expect(describeStep({ type: "roundabout", exit: 2, name: "A125" })).toBe("At the roundabout, take exit 2 onto A125");
    expect(describeStep({ type: "arrive", modifier: "left" })).toBe("Arrive: the address is on your left");
    expect(describeStep({ type: "depart", modifier: "right", name: "" })).toBe("Head off");
    expect(describeStep({ type: "new name", modifier: "straight", name: "Upminster Road" })).toBe("Continue onto Upminster Road");
  });
});

describe("formatDistance", () => {
  it("uses yards close up and miles further out", () => {
    expect(formatDistance(30)).toBe("30 yd");
    expect(formatDistance(152)).toBe("170 yd");
    expect(formatDistance(1609)).toBe("1.0 mi");
  });
});

describe("routeProgress", () => {
  const route = parseRoute(OSRM);

  it("points at the next turn and counts the distance left", () => {
    const p = routeProgress(route, { latitude: 51.5, longitude: 0.001 });
    expect(p.isOffRoute).toBe(false);
    expect(p.next.type).toBe("turn");
    expect(p.metresToNext).toBeGreaterThan(60);
    expect(p.metresToNext).toBeLessThan(80);
    expect(p.metresLeft).toBeGreaterThan(170);
    expect(p.metresLeft).toBeLessThan(190);
  });

  it("moves on to arrival once past the turn", () => {
    const p = routeProgress(route, { latitude: 51.5005, longitude: 0.002 });
    expect(p.next.type).toBe("arrive");
    expect(p.metresLeft).toBeLessThan(60);
  });

  it("flags the driver as off route when far from the line", () => {
    const p = routeProgress(route, { latitude: 51.502, longitude: 0.001 });
    expect(p.isOffRoute).toBe(true);
  });
});

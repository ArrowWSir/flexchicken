// Turn-by-turn directions for the driver, inside the site. Routes come from
// OSRM (OpenStreetMap data, no key). The public demo server is fine for one
// shop's drivers; swap OSRM_URL for a hosted or self-run server if it grows.

export const OSRM_URL = "https://router.project-osrm.org/route/v1/driving";

const EARTH_RADIUS_M = 6371008.8;
const METRES_PER_MILE = 1609.344;
const METRES_PER_YARD = 0.9144;
const YARDS_UNTIL_MILES = 400; // under ~a quarter mile, distances read in yards
const OFF_ROUTE_METRES = 50; // further than this from the line counts as off route
const STEP_PASSED_METRES = 8; // a turn this close behind is done with

const toRad = (deg) => (deg * Math.PI) / 180;
const toPoint = ([longitude, latitude]) => ({ latitude, longitude });

/** Flat x/y metres around `origin`: exact enough over a few miles. */
function project(origin, p) {
  const x = toRad(p.longitude - origin.longitude) * Math.cos(toRad(origin.latitude)) * EARTH_RADIUS_M;
  const y = toRad(p.latitude - origin.latitude) * EARTH_RADIUS_M;
  return { x, y };
}

function metresBetween(a, b) {
  const { x, y } = project(a, b);
  return Math.hypot(x, y);
}

/** Running distance in metres to each point along the line. */
function cumulative(points) {
  let total = 0;
  return points.map((p, i) => (total += i === 0 ? 0 : metresBetween(points[i - 1], p)));
}

/** Nearest place on the line to `p`: how far along it is, and how far off. */
function snap(points, along, p) {
  let best = { along: 0, offBy: Infinity };
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = project(p, points[i]);
    const b = project(p, points[i + 1]);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq === 0 ? 0 : Math.min(1, Math.max(0, -(a.x * dx + a.y * dy) / lengthSq));
    const offBy = Math.hypot(a.x + t * dx, a.y + t * dy);
    if (offBy < best.offBy) best = { along: along[i] + t * (along[i + 1] - along[i]), offBy };
  }
  return best;
}

/**
 * An OSRM /route response (steps=true, geometries=geojson) as points to draw
 * and steps to speak, each step knowing how far along the line it sits.
 * @returns {{ points: {latitude:number,longitude:number}[], along: number[], steps: object[], metres: number, durationSeconds: number }}
 */
export function parseRoute(response) {
  const route = response?.code === "Ok" ? response.routes?.[0] : null;
  if (!route) throw new Error("No driving route found to this address.");
  const points = route.geometry.coordinates.map(toPoint);
  const along = cumulative(points);
  const steps = route.legs
    .flatMap((leg) => leg.steps)
    .map((step) => {
      const location = toPoint(step.maneuver.location);
      return {
        type: step.maneuver.type,
        modifier: step.maneuver.modifier ?? null,
        exit: step.maneuver.exit ?? null,
        name: step.name || step.ref || "",
        location,
        along: snap(points, along, location).along,
      };
    });
  return { points, along, steps, metres: along.at(-1), durationSeconds: route.duration };
}

/** Fetches a driving route between two { latitude, longitude } places. */
export async function fetchRoute(from, to, signal) {
  const url = `${OSRM_URL}/${from.longitude},${from.latitude};${to.longitude},${to.latitude}?overview=full&steps=true&geometries=geojson`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error("Could not load directions. Check your signal and try again.");
  return parseRoute(await res.json());
}

const TURN_WORDS = {
  left: "Turn left",
  right: "Turn right",
  "slight left": "Bear left",
  "slight right": "Bear right",
  "sharp left": "Turn sharp left",
  "sharp right": "Turn sharp right",
  straight: "Go straight on",
  uturn: "Make a U-turn",
};

const side = (modifier) => (modifier?.includes("left") ? "left" : "right");

function verb({ type, modifier, exit }) {
  switch (type) {
    case "depart":
      return "Head off";
    case "arrive":
      return null;
    case "new name":
    case "continue":
      return modifier === "uturn" ? TURN_WORDS.uturn : "Continue";
    case "roundabout":
    case "rotary":
      return exit ? `At the roundabout, take exit ${exit}` : "Go round the roundabout";
    case "exit roundabout":
    case "exit rotary":
      return "Leave the roundabout";
    case "merge":
      return "Merge";
    case "on ramp":
      return "Take the slip road";
    case "off ramp":
      return `Take the exit on the ${side(modifier)}`;
    case "fork":
      return `Keep ${side(modifier)} at the fork`;
    case "end of road":
      return `At the end of the road, turn ${side(modifier)}`;
    default:
      return TURN_WORDS[modifier] ?? "Continue";
  }
}

/** One step in plain words, e.g. "Turn left onto Mill Lane". */
export function describeStep(step) {
  if (step.type === "arrive") {
    return step.modifier === "left" || step.modifier === "right"
      ? `Arrive: the address is on your ${step.modifier}`
      : "Arrive at the address";
  }
  const words = verb(step);
  if (step.type === "depart") return step.name ? `${words} on ${step.name}` : words;
  return step.name ? `${words} onto ${step.name}` : words;
}

/** Road distances the UK way: yards close up, miles further out. */
export function formatDistance(metres) {
  const yards = metres / METRES_PER_YARD;
  if (yards < YARDS_UNTIL_MILES) return `${Math.max(10, Math.round(yards / 10) * 10)} yd`;
  return `${(metres / METRES_PER_MILE).toFixed(1)} mi`;
}

/**
 * Where the driver is on the route: the next step, how far to it, how far to
 * the door, and whether they have left the line (time to reroute).
 */
export function routeProgress(route, fix) {
  const { along, offBy } = snap(route.points, route.along, fix);
  const nextIndex = route.steps.findIndex((s) => s.along > along + STEP_PASSED_METRES);
  const index = nextIndex === -1 ? route.steps.length - 1 : nextIndex;
  const next = route.steps[index];
  return {
    next,
    after: route.steps[index + 1] ?? null,
    metresToNext: Math.max(0, next.along - along),
    metresLeft: Math.max(0, route.metres - along),
    along,
    isOffRoute: offBy > OFF_ROUTE_METRES,
  };
}

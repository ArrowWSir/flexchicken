// The shop's rules on the server. Every screen's change arrives here as an
// action name and its arguments; this checks who may do it and what they
// sent, then runs the same repo the browser store runs (app/lib/store/repo),
// so the tested shop logic is the logic in charge.
//
// Actions run in two parts. `prepare` may wait on the network (the postcode
// check); `run` never waits, so inside the Durable Object nothing else can
// happen between reading the data and writing it back. Stamps, redeems and
// order numbers stay atomic without locks.
import { openStatus } from "../app/lib/hours.js";
import { liveMenu } from "../app/lib/liveMenu.js";
import { promoStatus } from "../app/lib/promotions.js";
import { repriceCart } from "../app/lib/reprice.js";
import { TOPICS, createRepo } from "../app/lib/store/repo.js";
import { readTokens } from "../app/lib/stampTokens.js";
import { ADDRESS, JOBS, KEY, PRINTER_TOPIC, STATUS, createPrintQueue } from "./printQueue.js";
import {
  ShopError,
  cleanCardId,
  cleanCustomer,
  cleanMenuEdits,
  cleanPoint,
  isObject,
  photoIdsIn,
  requireId,
  requireObject,
  text,
  verifyAddress,
} from "./checks.js";

export { ShopError };

// Who may call: customers, the shop's clock tablet, drivers, the counter and
// kitchen staff (orders and cards only), the owner.
export const ROLES = Object.freeze(["public", "clock", "driver", "staff", "admin"]);
const EVERYONE = ROLES;
const CLOCK = ["clock", "admin"];
const DRIVERS = ["driver", "admin"];
const SERVICE = ["staff", "admin"];
const ON_ORDERS = ["driver", "staff", "admin"];
const OWNER = ["admin"];

// A printer's answer is a few hundred bytes; anything longer is not one.
const MAX_PRINTER_ANSWER = 4096;
const TILL_OUTCOMES = new Set(["answered", "unreached", "unsure"]);

// Orders the database keeps; staff screens get the latest of them.
const MAX_ORDERS = 5000;
const STAFF_VIEW_ORDERS = 300;
const MAX_WATCHED = 50;
const MODES = new Set(["delivery", "collection"]);
const DRIVER_RECENT_MS = 12 * 3_600_000; // a driver's own delivered orders stay this long
const LOCATION_KEEP_MS = 24 * 3_600_000;
const REQUEST_IDS_KEPT = 300; // placeOrder retries recognised
const REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;

const clockMember = ({ id, name, role, isActive }) => ({ id, name, role, isActive });
const withoutPin = ({ pinHash, ...member }) => member;
const lastChange = (order) => order.history?.at(-1)?.at ?? order.createdAt;

/** An error the API counts towards the wrong-PIN lockout. */
function wrongPin(message) {
  const error = new ShopError(400, message);
  error.isWrongPin = true;
  return error;
}

/**
 * @param {{ store: { read: Function, write: Function, transaction?: Function }, now?: () => number,
 *   newId: (prefix: string) => string, fetcher?: typeof fetch,
 *   savePhoto: (dataUrl: string) => string, prunePhotos?: (keepIds: string[]) => void }} deps
 */
export function createShopCore({ store, now = Date.now, newId, fetcher = fetch, savePhoto, prunePhotos = () => {} }) {
  // All of an action's writes land together, or none do.
  const transact = store.transaction ?? ((fn) => fn());
  let changed = null; // topics written by the action running now
  const tracked = {
    read: store.read,
    write(key, value) {
      store.write(key, value);
      changed?.add(key);
    },
    subscribe: () => () => {},
  };
  const repo = createRepo(tracked, now, { newOrderId: () => newId("ord"), maxOrders: MAX_ORDERS });
  const printQueue = createPrintQueue({ store: tracked, repo, now, newId });

  const orderFor = (id) => {
    const order = repo.getOrder(requireId(id));
    if (!order) throw new Error("That order no longer exists.");
    return order;
  };

  const driverMay = (actor, order) => {
    if (actor.role === "admin") return;
    if (order.driver?.id !== actor.id || order.status !== "out_for_delivery") {
      throw new ShopError(403, "That order is with another driver.");
    }
  };

  // Accepting prints the kitchen's ticket on the network printer, when the
  // owner has chosen it; otherwise the till's screen prints it (lib/printer.js).
  const advance = (args, actor) => {
    const updated = advanceAs(args, actor);
    if (updated.status === "accepted" && args[1] === "accepted" && printQueue.isOn()) printQueue.enqueue(updated, "accepted");
    return updated;
  };

  const advanceAs = ([id, status, extra], actor) => {
    const order = orderFor(id);
    if (typeof status !== "string") throw new Error("Choose what happens next.");
    if (actor.role === "admin" || actor.role === "staff") {
      const driver = isObject(extra?.driver) ? { id: text(extra.driver.id, 60), name: text(extra.driver.name, 30) } : null;
      return repo.advance(order.id, status, driver ? { driver } : {});
    }
    if (status === "out_for_delivery") return repo.advance(order.id, status, { driver: { id: actor.id, name: actor.name } });
    if (status === "delivered") {
      driverMay(actor, order);
      return repo.advance(order.id, status);
    }
    throw new ShopError(403, "Drivers can only take and deliver orders.");
  };

  // The member and their open shift for a Staff ID and PIN.
  const byPin = (code, pin) => {
    let found;
    try {
      found = repo.identify(String(code ?? ""), String(pin ?? ""));
    } catch (err) {
      throw wrongPin(err.message);
    }
    return { member: clockMember(found.member), shift: found.shift };
  };

  const by = (value) => text(value, 40) || "staff";

  // A retried placeOrder (the answer was lost) gets the order it already made.
  const REQUESTS = "order_requests";
  const placedFor = (requestId) => {
    const orderId = REQUEST_ID.test(requestId ?? "") ? store.read(REQUESTS, {})[requestId] : null;
    return orderId ? repo.getOrder(orderId) : null;
  };
  const rememberRequest = (requestId, orderId) => {
    if (!REQUEST_ID.test(requestId ?? "")) return;
    const kept = Object.entries(store.read(REQUESTS, {})).slice(-(REQUEST_IDS_KEPT - 1));
    tracked.write(REQUESTS, Object.fromEntries([...kept, [requestId, orderId]]));
  };

  const prunedLocations = () => {
    const all = store.read(TOPICS.locations, {});
    const keep = Object.entries(all).filter(([, point]) => point.at > now() - LOCATION_KEEP_MS);
    if (keep.length < Object.keys(all).length) tracked.write(TOPICS.locations, Object.fromEntries(keep));
  };

  /** allow: the roles that may call; usesPin: rate limited by the caller; rateLimit: per caller, by the API. */
  const ACTIONS = {
    placeOrder: {
      allow: EVERYONE,
      rateLimit: "order",
      prepare: async ([input]) => {
        const i = requireObject(input, "Your order could not be read. Please try again.");
        if (!MODES.has(i.mode)) throw new Error("Choose delivery or collection.");
        return { address: i.mode === "delivery" && !placedFor(i.requestId) ? await verifyAddress(i.address, fetcher) : null };
      },
      run: ([input], _actor, { address }) => {
        const earlier = placedFor(input.requestId);
        if (earlier) return earlier;
        const hours = openStatus(new Date(now()), repo.getSettings().hours);
        if (!hours.isOpen) throw new Error(`Sorry, we are closed right now (${hours.label}).`);
        const order = repo.placeOrder({
          cart: repriceCart(input.cart, liveMenu(repo.getMenuEdits())),
          customer: cleanCustomer(input.customer),
          mode: input.mode,
          address,
          note: text(input.note, 280),
        });
        rememberRequest(input.requestId, order.id);
        return order;
      },
    },
    registerCard: {
      allow: EVERYONE,
      // Only a brand-new card counts: phones re-register theirs on every visit.
      rateLimit: ([input]) => (typeof input?.id === "string" && repo.getCard(input.id) ? null : "card"),
      run: ([input]) => {
        const i = requireObject(input, "That card could not be read.");
        return repo.registerCard({ id: cleanCardId(i.id), name: text(i.name, 60), email: text(i.email, 120) });
      },
    },
    redeemStampToken: {
      allow: EVERYONE,
      run: ([token, cardId]) => repo.redeemStampToken(String(token ?? ""), cleanCardId(cardId, "Open your card first, then scan again.")),
    },
    identify: { allow: CLOCK, usesPin: true, run: ([code, pin]) => byPin(code, pin) },
    clockInWithPin: {
      allow: CLOCK,
      usesPin: true,
      run: ([code, pin]) => {
        const { member } = byPin(code, pin);
        repo.clockIn(member.id);
        return { member, shift: byPin(code, pin).shift };
      },
    },
    clockOutWithPin: {
      allow: CLOCK,
      usesPin: true,
      run: ([code, pin]) => {
        const { member, shift } = byPin(code, pin);
        if (!shift) throw new Error("Not clocked in.");
        repo.clockOut(member.id);
        return { member, shift: repo.listShifts().find((s) => s.id === shift.id) };
      },
    },

    advance: { allow: ON_ORDERS, run: advance },
    pushLocation: {
      allow: DRIVERS,
      run: ([orderId, point], actor) => {
        const order = orderFor(orderId);
        driverMay(actor, order);
        prunedLocations();
        repo.pushLocation(order.id, cleanPoint(point));
      },
    },

    saveSettings: { allow: OWNER, run: ([patch]) => repo.saveSettings(requireObject(patch, "Those settings could not be read.")) },
    saveMenuEdits: {
      allow: OWNER,
      run: ([edits]) => {
        const clean = cleanMenuEdits(edits, savePhoto);
        repo.saveMenuEdits(clean);
        prunePhotos(photoIdsIn(clean));
        return clean;
      },
    },
    addStaff: { allow: OWNER, run: ([input]) => repo.addStaff(requireObject(input, "Fill in the new staff member.")) },
    updateStaff: { allow: OWNER, run: ([id, patch]) => repo.updateStaff(requireId(id), requireObject(patch, "Nothing to change.")) },
    removeStaff: { allow: OWNER, run: ([id]) => repo.removeStaff(requireId(id)) },
    clockOut: { allow: OWNER, run: ([staffId]) => repo.clockOut(requireId(staffId), "manager") },
    correctShift: { allow: OWNER, run: ([shiftId, times]) => repo.correctShift(requireId(shiftId), requireObject(times, "Enter the times.")) },
    stampCard: { allow: SERVICE, run: ([id, who]) => repo.stampCard(requireId(id), by(who)) },
    unstampCard: { allow: SERVICE, run: ([id, who]) => repo.unstampCard(requireId(id), by(who)) },
    redeemCard: { allow: SERVICE, run: ([id, who]) => repo.redeemCard(requireId(id), by(who)) },
    renameCard: { allow: SERVICE, run: ([id, name]) => repo.renameCard(requireId(id), text(name, 60)) },
    removeCard: { allow: OWNER, run: ([id]) => repo.removeCard(requireId(id)) },
    issueStampToken: { allow: SERVICE, run: ([orderId]) => repo.issueStampToken(orderFor(orderId).id) },
    savePromotion: {
      allow: OWNER,
      // A new offer gets a random id, so two saved in the same instant stay apart.
      run: ([input]) => repo.savePromotion({ ...requireObject(input, "That offer could not be read."), newId: newId("promo") }),
    },
    removePromotion: { allow: OWNER, run: ([id]) => repo.removePromotion(requireId(id)) },
    // The order list sits behind its own PIN as well as the owner's sign-in.
    saveExpenseSheet: {
      allow: OWNER,
      needsListKey: true,
      run: ([input]) => repo.saveExpenseSheet({ ...requireObject(input, "That sheet could not be read."), newId: newId("exp") }),
    },
    removeExpenseSheet: { allow: OWNER, needsListKey: true, run: ([id]) => repo.removeExpenseSheet(requireId(id)) },

    // The network receipt printer (server/printQueue.js).
    printReceipt: {
      allow: SERVICE,
      run: ([orderId]) => {
        if (!printQueue.isOn()) throw new Error("The receipt printer is not set up. The owner chooses it in Admin → Shop.");
        return printQueue.enqueue(orderFor(orderId), "reprint");
      },
    },
    printTestReceipt: { allow: OWNER, run: () => printQueue.enqueue(null, "test") },
    printerLink: { allow: OWNER, run: () => ({ key: printQueue.ensureKey() }) },
    resetPrinterLink: { allow: OWNER, run: () => ({ key: printQueue.resetKey() }) },
    setPrinterAddress: { allow: OWNER, run: ([address]) => printQueue.setAddress(address) },
    // The till sending receipts to the printer on the shop's network
    // (lib/eposDirect.js). `actor.origin` is this site, for the stamp link.
    tillPrinterCheckIn: { allow: SERVICE, run: () => printQueue.tillCheckIn() },
    claimReceipt: { allow: SERVICE, run: (_args, actor) => printQueue.claim(actor.origin) },
    reportReceipt: {
      allow: SERVICE,
      run: ([jobId, sent]) => {
        const o = isObject(sent) ? sent : {};
        const responseFile = typeof o.responseFile === "string" ? o.responseFile.slice(0, MAX_PRINTER_ANSWER) : "";
        const outcome = TILL_OUTCOMES.has(o.outcome) ? o.outcome : "unsure";
        return printQueue.report(requireId(jobId), { outcome, responseFile });
      },
    },
  };

  // The topics screens know: the printer's two stores are one topic to them,
  // and some stores are never sent at all.
  const HIDDEN = new Set([REQUESTS, KEY]);
  const PRINTER_STORES = new Set([JOBS, STATUS, ADDRESS]);
  const screenTopics = (written) => [...new Set([...written].filter((t) => !HIDDEN.has(t)).map((t) => (PRINTER_STORES.has(t) ? PRINTER_TOPIC : t)))];

  /** Runs `fn` as one transaction; the screen topics it changed come back with its result. */
  function tracking(fn) {
    changed = new Set();
    try {
      const result = transact(fn);
      return { result: result ?? null, changed: screenTopics(changed) };
    } finally {
      changed = null;
    }
  }

  const actionFor = (name) => (typeof name === "string" && Object.hasOwn(ACTIONS, name) ? ACTIONS[name] : null);

  /**
   * Runs one action for `actor` ({ role, id?, name? }).
   * @returns {Promise<{ result: unknown, changed: string[] }>}
   */
  async function call(name, args, actor) {
    const action = actionFor(name);
    if (!action) throw new ShopError(404, "Unknown action.");
    if (!action.allow.includes(actor?.role)) {
      const why =
        CLOCK === action.allow
          ? "This screen is for the shop's clock tablet. Unlock it with the owner's code."
          : actor?.role === "staff"
            ? "Only the owner can do that, from the admin."
            : "Staff only. Sign in again.";
      throw new ShopError(403, why);
    }
    if (action.needsListKey && !actor.hasListKey) throw new ShopError(403, "Enter the order list PIN first.");
    if (!Array.isArray(args)) throw new ShopError(400, "That request could not be read.");
    try {
      const prepared = action.prepare ? await action.prepare(args, actor) : {};
      return tracking(() => action.run(args, actor, prepared));
    } catch (err) {
      // The shop's own rules throw plain Errors written for the person using
      // the screen; anything else is a fault and keeps its details server-side.
      if (err instanceof ShopError) throw err;
      if (err?.constructor === Error) throw new ShopError(400, err.message);
      throw err;
    }
  }

  const watched = (ids) => new Set((Array.isArray(ids) ? ids : []).filter((id) => typeof id === "string").slice(0, MAX_WATCHED));

  // Drivers and staff see who ordered and how to reach them, but not customers' emails.
  const withoutEmail = (o) => ({ ...o, customer: { ...o.customer, email: "" } });

  // A driver sees what is waiting or on the road, and their own recent drops;
  // the customer's email is not theirs to see.
  const driverOrders = (actor) =>
    repo
      .listOrders()
      .filter(
        (o) =>
          o.mode === "delivery" &&
          (o.status === "ready" ||
            o.status === "out_for_delivery" ||
            (o.status === "delivered" && o.driver?.id === actor.id && lastChange(o) > now() - DRIVER_RECENT_MS))
      )
      .map(withoutEmail);

  // What each role may read of each topic.
  const VIEWS = {
    [TOPICS.orders]: (actor, scope) => {
      if (actor.role === "admin") return repo.listOrders().slice(-STAFF_VIEW_ORDERS);
      if (actor.role === "staff") return repo.listOrders().slice(-STAFF_VIEW_ORDERS).map(withoutEmail);
      if (actor.role === "driver") return driverOrders(actor);
      const ids = watched(scope.orderIds);
      return repo.listOrders().filter((o) => ids.has(o.id));
    },
    [TOPICS.locations]: (actor, scope) => {
      const all = store.read(TOPICS.locations, {});
      if (actor.role === "admin") return all;
      const ids = actor.role === "driver" ? new Set(driverOrders(actor).map((o) => o.id)) : watched(scope.orderIds);
      return Object.fromEntries(Object.entries(all).filter(([id]) => ids.has(id)));
    },
    [TOPICS.settings]: () => repo.getSettings(),
    [TOPICS.menu]: () => repo.getMenuEdits(),
    // Customers see offers that are live or coming, never paused or ended ones.
    [TOPICS.promotions]: (actor) =>
      actor.role === "admin" ? repo.listPromotions() : repo.listPromotions().filter((p) => ["live", "scheduled"].includes(promoStatus(p, now()))),
    [TOPICS.cards]: (actor, scope) => {
      if (actor.role === "admin") return repo.listCards();
      if (actor.role === "staff") return repo.listCards().map((c) => ({ ...c, email: "" }));
      const card = typeof scope.cardId === "string" ? repo.getCard(scope.cardId) : null;
      return card ? [card] : [];
    },
    // PIN hashes never leave the server, even for the owner.
    [TOPICS.staff]: (actor) => {
      if (actor.role === "admin") return repo.listStaff().map(withoutPin);
      return actor.role === "clock" ? repo.listStaff().filter((s) => s.isActive).map(clockMember) : [];
    },
    [TOPICS.shifts]: (actor) => {
      if (actor.role === "admin") return repo.listShifts();
      if (actor.role !== "clock") return [];
      return repo.listShifts().filter((s) => s.endAt === null).map(({ id, staffId, startAt }) => ({ id, staffId, startAt, endAt: null, closedBy: null }));
    },
    // The order list: the owner's sign-in and the order list PIN.
    [TOPICS.expenses]: (actor) => (actor.role === "admin" && actor.hasListKey ? repo.listExpenseSheets() : []),
    [TOPICS.stampTokens]: (actor) => (actor.role === "admin" ? readTokens(store.read(TOPICS.stampTokens, [])) : []),
    [TOPICS.printer]: (actor) => (SERVICE.includes(actor.role) ? printQueue.view() : null),
  };

  /**
   * The topics `actor` asked for, as that role may see them.
   * @param {string[]} topics
   * @param {{ orderIds?: string[], cardId?: string }} scope what a customer's device holds
   */
  function snapshot(topics, actor, scope = {}) {
    const out = {};
    for (const topic of new Set(topics)) {
      if (Object.hasOwn(VIEWS, topic)) out[topic] = VIEWS[topic](actor, scope);
    }
    return out;
  }

  return {
    call,
    snapshot,
    /** The network printer's own calls (api.js, /api/printer); each returns { result, changed }. */
    printer: {
      keyMatches: (given) => printQueue.keyMatches(given),
      poll: (origin) => tracking(() => printQueue.poll(origin)),
      result: (responseFile) => tracking(() => printQueue.result(responseFile)),
      /** Where staff pages may connect to reach the printer (worker.js, their CSP). */
      connectOrigins: () => printQueue.connectOrigins(),
    },
    usesPin: (name) => Boolean(actionFor(name)?.usesPin),
    /** Which per-caller limit this call counts against, if any. */
    rateLimitOf(name, args) {
      const limit = actionFor(name)?.rateLimit ?? null;
      return typeof limit === "function" ? limit(Array.isArray(args) ? args : []) : limit;
    },
  };
}

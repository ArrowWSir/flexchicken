// The shop's data, in the shapes the screens use. Built on any store with
// read / write / subscribe, so the local adapter can be swapped for the
// database without touching a component.
import { EMPTY_EDITS } from "../menuEdits";
import { advanceOrder, buildOrder, formatOrderNumber } from "../orders";
import { readSettings } from "../settings";
import * as clock from "../timeclock";
import * as loyalty from "../loyalty";
import * as stampTokens from "../stampTokens";
import * as expenses from "../expenses";
import { MAX_PROMOS, readPromotions, validatePromo } from "../promotions";
import { readPrinter } from "../receiptPrinter";

// Topics a screen can subscribe to.
export const TOPICS = Object.freeze({
  orders: "orders",
  settings: "settings",
  menu: "menu_edits",
  locations: "driver_locations",
  session: "session",
  staff: "staff",
  shifts: "shifts",
  cards: "loyalty_cards",
  promotions: "promotions",
  stampTokens: "stamp_tokens",
  expenses: "expense_sheets",
  // The network receipt printer: its queue and when it last checked in
  // (server/printQueue.js). Only the server writes it.
  printer: "printer",
});

const MAX_KEPT_ORDERS = 300;
// About two years of shifts for a small team; the database keeps everything.
const MAX_KEPT_SHIFTS = 8000;

function isCoordinate(point) {
  return (
    point &&
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    Math.abs(point.latitude) <= 90 &&
    Math.abs(point.longitude) <= 180
  );
}

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const UK_PHONE = /^\+?[\d\s()-]{10,16}$/;

// Same email -> same customer id, so orders follow the account, not the device.
// FNV-1a: stable and dependency-free; not a secret, only an identifier.
function customerIdFor(email) {
  let hash = 0x811c9dc5;
  for (const char of email) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `usr_${hash.toString(36)}`;
}

/**
 * @param {{ newOrderId?: () => string, maxOrders?: number }} [options]
 */
export function createRepo(store, now = Date.now, { newOrderId = null, maxOrders = MAX_KEPT_ORDERS } = {}) {
  const listOrders = () => store.read(TOPICS.orders, []);
  const saveOrders = (orders) => store.write(TOPICS.orders, orders.slice(-maxOrders));
  const getSettings = () => readSettings(store.read(TOPICS.settings, null));
  // Staff saved before Staff IDs existed get theirs here (lib/timeclock.js).
  const listStaff = () => clock.withStaffIds(store.read(TOPICS.staff, []));
  const saveStaff = (staff) => store.write(TOPICS.staff, staff);
  const listShifts = () => store.read(TOPICS.shifts, []);
  const saveShifts = (shifts) => store.write(TOPICS.shifts, shifts.slice(-MAX_KEPT_SHIFTS));
  const listCards = () => loyalty.readCards(store.read(TOPICS.cards, []));
  const saveCards = (cards) => store.write(TOPICS.cards, cards);
  // Each card change is applied to the list as it is right now, never to a
  // copy a screen read earlier, so two tills stamping at once both count.
  const changeCard = (fn) => {
    const current = listCards();
    const next = fn(current);
    // Nothing changed (a phone re-registering its card): nothing to save.
    if (next !== current) saveCards(next);
    return next;
  };
  const listTokens = () => stampTokens.readTokens(store.read(TOPICS.stampTokens, []));
  const saveTokens = (tokens) => store.write(TOPICS.stampTokens, tokens);
  const listExpenseSheets = () => expenses.readSheets(store.read(TOPICS.expenses, []));
  const listPromotions = () => readPromotions(store.read(TOPICS.promotions, []));
  const savePromotions = (promos) => store.write(TOPICS.promotions, promos);

  return {
    subscribe: (topic, fn) => store.subscribe(TOPICS[topic] ?? topic, fn),

    listOrders,
    getOrder: (id) => listOrders().find((o) => o.id === id) ?? null,
    ordersFor: (customerId) => listOrders().filter((o) => o.customer.id === customerId),

    placeOrder({ cart, customer, mode, address, note }) {
      const settings = getSettings();
      if (!settings.isTakingOrders) throw new Error("Sorry, we are not taking orders right now.");
      const sequence = store.read("order_sequence", 0) + 1;
      const promotions = listPromotions();
      const order = buildOrder({ cart, customer, mode, address, note, settings, promotions, sequence, now: now(), id: newOrderId?.() ?? null });
      store.write("order_sequence", sequence);
      saveOrders([...listOrders(), order]);
      return order;
    },

    advance(id, status, extra = {}) {
      let updated = null;
      const orders = listOrders().map((order) => {
        if (order.id !== id) return order;
        updated = advanceOrder(order, status, now(), extra);
        return updated;
      });
      if (!updated) throw new Error("That order no longer exists.");
      saveOrders(orders);
      return updated;
    },

    getSettings,
    getPrinter: () => readPrinter(store.read(TOPICS.printer, null)),
    saveSettings: (patch) => store.write(TOPICS.settings, readSettings({ ...getSettings(), ...patch })),

    getMenuEdits: () => ({ ...EMPTY_EDITS, ...store.read(TOPICS.menu, {}) }),
    saveMenuEdits: (edits) => store.write(TOPICS.menu, edits),

    // Customer sign-in. Until the backend exists this is a demo: the "Continue
    // with Google" sheet asks for the name and email Google would provide.
    // The Supabase adapter replaces it with real Google OAuth.
    getSession: () => store.read("session", null),
    signIn({ name, email, provider }) {
      const cleanName = String(name ?? "").trim().slice(0, 60);
      const cleanEmail = String(email ?? "").trim().toLowerCase();
      if (!cleanName) throw new Error("Please enter your name.");
      if (!EMAIL.test(cleanEmail)) throw new Error("Please enter a valid email address.");
      const profiles = store.read("profiles", {});
      const id = customerIdFor(cleanEmail);
      const session = { id, name: cleanName, email: cleanEmail, provider, phone: profiles[id]?.phone ?? "" };
      store.write("session", session);
      return session;
    },
    signOut: () => store.write("session", null),
    updateProfile({ phone }) {
      const session = store.read("session", null);
      if (!session) throw new Error("Please sign in first.");
      const clean = String(phone ?? "").trim();
      if (!UK_PHONE.test(clean)) throw new Error("Please enter a valid phone number.");
      const next = { ...session, phone: clean };
      store.write("profiles", { ...store.read("profiles", {}), [session.id]: { phone: clean } });
      store.write("session", next);
      return next;
    },

    // Staff clock. Only the owner adds staff and gives out Staff IDs, in
    // /admin/staff; staff clock in and out at /clock with their ID and PIN.
    listStaff,
    listShifts,
    addStaff: (input) => saveStaff(clock.addStaff(listStaff(), input, now())),
    updateStaff: (id, patch) => saveStaff(clock.updateStaff(listStaff(), id, patch)),
    removeStaff(id) {
      // Nobody stays clocked in after leaving the team.
      if (clock.openShift(listShifts(), id)) saveShifts(clock.clockOut(listShifts(), id, now(), "manager"));
      saveStaff(clock.removeStaff(listStaff(), id));
    },
    /** Who this Staff ID and PIN belong to, and their open shift if any. */
    identify(code, pin) {
      const member = clock.findByIdAndPin(listStaff(), code, pin);
      // One message for both, so the pad never tells which ID exists.
      if (!member) throw new Error("That Staff ID and PIN don't match. Try again.");
      return { member, shift: clock.openShift(listShifts(), member.id) };
    },
    clockIn(staffId) {
      const member = listStaff().find((s) => s.id === staffId && s.isActive);
      if (!member) throw new Error("That staff member is not on the team list.");
      saveShifts(clock.clockIn(listShifts(), staffId, now()));
    },
    clockOut: (staffId, closedBy = null) => saveShifts(clock.clockOut(listShifts(), staffId, now(), closedBy)),
    /** The manager fixes a shift's times (a forgotten clock-out, say). */
    correctShift: (shiftId, times) => saveShifts(clock.correctShift(listShifts(), shiftId, times, now())),

    // Loyalty cards. A phone registers its own card (and gets its 4-digit
    // code); stamps come from staff at /admin/cards or a receipt's QR.
    listCards,
    getCard: (id) => listCards().find((c) => c.id === id) ?? null,
    registerCard(input) {
      let card = null;
      changeCard((cards) => {
        const result = loyalty.registerCard(cards, input, now());
        card = result.card;
        return result.cards;
      });
      return card;
    },
    stampCard: (id, by) => changeCard((cards) => loyalty.addStamp(cards, id, now(), by)),
    unstampCard: (id, by) => changeCard((cards) => loyalty.removeStamp(cards, id, now(), by)),
    redeemCard: (id, by) => changeCard((cards) => loyalty.redeemReward(cards, id, now(), by)),
    renameCard: (id, name) => changeCard((cards) => loyalty.renameCard(cards, id, name)),
    // The customer's phone keeps its card id, so their next visit makes a fresh card with a new code.
    removeCard: (id) => changeCard((cards) => loyalty.removeCard(cards, id)),

    // The one-time stamp QR on a till receipt (lib/stampTokens.js).
    issueStampToken(orderId) {
      const result = stampTokens.issueToken(listTokens(), orderId, now());
      saveTokens(result.tokens);
      return result.token;
    },
    /**
     * Scanning the receipt: checks the code, stamps the card, then uses the
     * code up. The stamp goes first, so a full card keeps its code for after
     * the surprise. The database does all three in one SQL function.
     * @returns {{ card: object, orderNumber: string | null }}
     */
    redeemStampToken(token, cardId) {
      const at = now();
      const tokens = listTokens();
      const problem = stampTokens.tokenProblem(tokens, token, at);
      if (problem) throw new Error(problem);
      const { orderId } = tokens.find((t) => t.token === stampTokens.normalizeToken(token));
      const order = listOrders().find((o) => o.id === orderId);
      if (order?.status === "cancelled") throw new Error("This order was cancelled, so its receipt has no stamp.");
      const by = order ? `receipt ${formatOrderNumber(order.number)}` : "receipt";
      const cards = changeCard((list) => loyalty.addStamp(list, cardId, at, by));
      saveTokens(stampTokens.redeemToken(tokens, token, cardId, at).tokens);
      return { card: cards.find((c) => c.id === cardId), orderNumber: order ? formatOrderNumber(order.number) : null };
    },

    // Offers on the website (/admin/offers). Saved offers are always valid.
    listPromotions,
    savePromotion(input) {
      const promos = listPromotions();
      const isNew = !input.id || !promos.some((p) => p.id === input.id);
      if (isNew && promos.length >= MAX_PROMOS) throw new Error(`Up to ${MAX_PROMOS} offers. Delete an old one first.`);
      const promo = validatePromo({ ...input, id: isNew ? input.newId ?? `promo_${now().toString(36)}` : input.id, createdAt: input.createdAt ?? now() });
      savePromotions(isNew ? [promo, ...promos] : promos.map((p) => (p.id === promo.id ? promo : p)));
      return promo;
    },
    // The owner's order lists (/admin/order-list, lib/expenses.js).
    listExpenseSheets,
    /** Saves a new sheet, or replaces the one with `input.id`. `newId` comes from the server. */
    saveExpenseSheet(input) {
      const sheets = listExpenseSheets();
      const existing = sheets.find((s) => s.id === input?.id);
      if (!existing && sheets.length >= expenses.MAX_SHEETS) throw new Error(`Up to ${expenses.MAX_SHEETS} sheets. Delete old ones first.`);
      const id = existing ? existing.id : input?.newId || `exp_${now().toString(36)}`;
      const sheet = expenses.validateSheet(input, { id, now: now(), createdAt: existing?.createdAt ?? now() });
      store.write(TOPICS.expenses, existing ? sheets.map((s) => (s.id === id ? sheet : s)) : [sheet, ...sheets]);
      return sheet;
    },
    removeExpenseSheet: (id) => store.write(TOPICS.expenses, listExpenseSheets().filter((s) => s.id !== id)),

    removePromotion: (id) => savePromotions(listPromotions().filter((p) => p.id !== id)),

    getLocation: (orderId) => store.read(TOPICS.locations, {})[orderId] ?? null,
    pushLocation(orderId, point) {
      if (!isCoordinate(point)) throw new Error("That is not a location.");
      const all = store.read(TOPICS.locations, {});
      store.write(TOPICS.locations, {
        ...all,
        [orderId]: { latitude: point.latitude, longitude: point.longitude, accuracy: point.accuracy ?? null, at: now() },
      });
    },
  };
}

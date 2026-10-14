// The owner's list of signed-in customers: everyone with an email on a
// loyalty card or an order, one row each, for downloading as a spreadsheet.

const cleanEmail = (email) => String(email ?? "").trim().toLowerCase();
const isoDay = (at) => new Date(at).toLocaleDateString("en-CA"); // 2026-10-14

// Each card and order is a sighting of a customer at a moment.
function sightings(cards, orders) {
  const fromCards = cards.map((c) => ({
    email: cleanEmail(c.email),
    name: c.name,
    at: c.createdAt,
    lastAt: Math.max(c.createdAt, c.lastStampAt ?? 0),
    cardCode: c.code,
    orders: 0,
  }));
  const fromOrders = orders.map((o) => ({
    email: cleanEmail(o.customer?.email),
    name: o.customer?.name,
    at: o.createdAt,
    lastAt: o.createdAt,
    cardCode: "",
    orders: 1,
  }));
  return [...fromCards, ...fromOrders].filter((s) => s.email).sort((a, b) => a.at - b.at);
}

/**
 * One row per email, oldest sighting first so a later name wins.
 * @returns {{ name: string, email: string, orders: number, cardCode: string, firstSeen: number, lastSeen: number }[]}
 */
export function customerList(cards, orders) {
  const byEmail = new Map();
  for (const s of sightings(cards, orders)) {
    const known = byEmail.get(s.email);
    byEmail.set(s.email, {
      name: String(s.name ?? "").trim() || known?.name || "",
      email: s.email,
      orders: (known?.orders ?? 0) + s.orders,
      cardCode: s.cardCode || known?.cardCode || "",
      firstSeen: known?.firstSeen ?? s.at,
      lastSeen: Math.max(known?.lastSeen ?? 0, s.lastAt),
    });
  }
  return [...byEmail.values()].sort((a, b) => a.name.localeCompare(b.name, "en-GB", { sensitivity: "base" }) || a.email.localeCompare(b.email));
}

const HEADER = ["Name", "Email", "Orders", "Loyalty card", "First seen", "Last seen"];
const DATE_FORMAT = "dd/mm/yyyy";

/** Rows for write-excel-file. Text goes in as String cells, never formulas. */
export function customerSheet(customers) {
  const header = HEADER.map((value) => ({ value, fontWeight: "bold" }));
  const rows = customers.map((c) => [
    { type: String, value: c.name },
    { type: String, value: c.email },
    { type: Number, value: c.orders },
    { type: String, value: c.cardCode },
    { type: Date, value: new Date(c.firstSeen), format: DATE_FORMAT },
    { type: Date, value: new Date(c.lastSeen), format: DATE_FORMAT },
  ]);
  return [header, ...rows];
}

export const CUSTOMER_COLUMNS = [{ width: 24 }, { width: 32 }, { width: 8 }, { width: 12 }, { width: 12 }, { width: 12 }];

export const customersFileName = (now) => `flex-chicken-customers-${isoDay(now)}.xlsx`;

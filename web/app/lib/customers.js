// The owner's list of signed-in customers, for downloading as a spreadsheet:
// every loyalty card with an email on it, as name, email and card code.

const isoDay = (at) => new Date(at).toLocaleDateString("en-CA"); // 2026-10-14

/**
 * One row per card that has an email, A to Z by name, then email, then code.
 * A customer on two devices has two cards, so two rows with different codes.
 * @returns {{ name: string, email: string, cardCode: string }[]}
 */
export function customerList(cards) {
  return cards
    .map((c) => ({ name: String(c.name ?? "").trim(), email: String(c.email ?? "").trim().toLowerCase(), cardCode: c.code }))
    .filter((c) => c.email)
    .sort((a, b) => a.name.localeCompare(b.name, "en-GB", { sensitivity: "base" }) || a.email.localeCompare(b.email) || a.cardCode.localeCompare(b.cardCode));
}

const HEADER = ["Name", "Email", "Card code"];

/** Rows for write-excel-file. Text goes in as String cells, never formulas. */
export function customerSheet(customers) {
  const header = HEADER.map((value) => ({ value, fontWeight: "bold" }));
  const rows = customers.map((c) => [
    { type: String, value: c.name },
    { type: String, value: c.email },
    { type: String, value: c.cardCode },
  ]);
  return [header, ...rows];
}

export const CUSTOMER_COLUMNS = [{ width: 24 }, { width: 32 }, { width: 11 }];

export const customersFileName = (now) => `flex-chicken-customers-${isoDay(now)}.xlsx`;

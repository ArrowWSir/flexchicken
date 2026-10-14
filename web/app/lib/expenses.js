// The owner's order lists (/admin/order-list): what the shop needs to buy,
// as item and quantity, ready to preview and download as a PDF. Pure
// functions; every change returns a new object. (Stored under the old
// "expense sheets" name, so lists saved before keep working.)
//
//   sheet: { id, title, date: "YYYY-MM-DD", note, lines, createdAt, updatedAt }
//   line:  { id, item, qty }
//
// The quantity is free text ("10 kg", "2 boxes"), written as the supplier
// expects it. Lists saved with prices or sources lose them on the next save.

export const MAX_LINES = 200;
export const MAX_SHEETS = 500;
const MAX_ITEM = 80;
const MAX_QTY = 30;
const MAX_TITLE = 80;
const MAX_NOTE = 500;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const DEFAULT_TITLE = "Order list";

const clean = (value, max) => String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);

/** Today as YYYY-MM-DD in the shop's time zone. */
export function todayIso(now = Date.now()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

const isValidDate = (value) => DATE.test(value) && !Number.isNaN(new Date(`${value}T12:00:00Z`).getTime());

/**
 * A list as the owner sent it, made safe to save. Empty lines are dropped;
 * a quantity without an item is refused.
 */
export function validateSheet(input, { id, now, createdAt = now }) {
  if (!input || typeof input !== "object") throw new Error("That list could not be read.");
  const date = String(input.date ?? "");
  if (!isValidDate(date)) throw new Error("Choose the date of the order.");
  const raw = Array.isArray(input.lines) ? input.lines : [];
  const lines = raw.flatMap((line, i) => {
    const item = clean(line?.item, MAX_ITEM);
    const qty = clean(line?.qty, MAX_QTY);
    if (!item && !qty) return [];
    if (!item) throw new Error(`Line ${i + 1} needs the item's name.`);
    return [{ id: clean(line?.id, 40) || `ln_${i}`, item, qty }];
  });
  if (!lines.length) throw new Error("Add at least one item.");
  if (lines.length > MAX_LINES) throw new Error(`Up to ${MAX_LINES} items on one list. Start a second list.`);
  return {
    id,
    title: clean(input.title, MAX_TITLE),
    date,
    note: String(input.note ?? "").trim().slice(0, MAX_NOTE),
    lines: lines.map((line, i) => ({ ...line, id: lines.findIndex((l) => l.id === line.id) === i ? line.id : `ln_${i}` })),
    createdAt,
    updatedAt: now,
  };
}

/** "Fri 9 Oct 2026" for a YYYY-MM-DD date. */
export function formatSheetDate(date) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(new Date(`${date}T12:00:00Z`));
}

// The PDF's built-in fonts have no en dash: a plain hyphen marks a blank.
const BLANK = "-";

const slug = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

/**
 * Everything the PDF prints, worked out ahead so the preview shows the same
 * thing and it can be tested without a PDF.
 */
export function pdfContent(sheet) {
  const title = sheet.title && slug(sheet.title) !== "order-list" ? `-${slug(sheet.title)}` : "";
  return {
    heading: sheet.title || DEFAULT_TITLE,
    date: formatSheetDate(sheet.date),
    columns: ["#", "Item", "Qty"],
    rows: sheet.lines.map((line, i) => [String(i + 1), line.item, line.qty || BLANK]),
    itemCount: sheet.lines.length,
    note: sheet.note,
    fileName: `flex-chicken-order-list-${sheet.date}${title}.pdf`,
  };
}

/** Keeps only well-formed lists from storage, newest date first. */
export function readSheets(saved) {
  if (!Array.isArray(saved)) return [];
  return saved
    .filter((s) => s && typeof s.id === "string" && isValidDate(String(s.date)) && Array.isArray(s.lines))
    .map((s) => ({
      id: s.id,
      title: clean(s.title, MAX_TITLE),
      date: s.date,
      note: String(s.note ?? "").slice(0, MAX_NOTE),
      lines: s.lines
        .filter((l) => l && typeof l.item === "string" && l.item)
        .map((l) => ({ id: String(l.id ?? ""), item: l.item, qty: String(l.qty ?? "") })),
      createdAt: Number.isFinite(s.createdAt) ? s.createdAt : 0,
      updatedAt: Number.isFinite(s.updatedAt) ? s.updatedAt : 0,
    }))
    .sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt);
}

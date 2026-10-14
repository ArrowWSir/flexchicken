// The owner's expense sheets (/admin/expenses): what the shop bought, where
// from and what it cost, ready to download as a PDF. Pure functions; every
// change returns a new object.
//
//   sheet: { id, title, date: "YYYY-MM-DD", note, lines, createdAt, updatedAt }
//   line:  { id, item, qty, source, pricePence | null }
//
// The quantity is free text ("10 kg", "2 boxes") and the price is what that
// line cost, so the owner copies an invoice line as it is. Source and price
// are optional; the total counts the lines that have a price.
import { formatPrice } from "./cart";

export const MAX_LINES = 200;
export const MAX_SHEETS = 500;
const MAX_ITEM = 80;
const MAX_QTY = 30;
const MAX_SOURCE = 60;
const MAX_TITLE = 80;
const MAX_NOTE = 500;
const MAX_PRICE_PENCE = 10_000_000; // £100,000: anything above is a typo
const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const NO_SOURCE = "No source given";

const clean = (value, max) => String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);

/** Today as YYYY-MM-DD in the shop's time zone. */
export function todayIso(now = Date.now()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** "12.50", "£12.5", "12" -> pence; empty -> null. Throws on anything else. */
export function parsePrice(value) {
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 0 || value > MAX_PRICE_PENCE) throw new Error("That price can't be right.");
    return value;
  }
  const text = String(value ?? "").trim().replace(/^£/, "").replace(/,/g, "");
  if (!text) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new Error(`"${String(value).trim()}" is not a price. Use pounds and pence, like 12.50.`);
  const pence = Math.round(Number(text) * 100);
  if (pence > MAX_PRICE_PENCE) throw new Error("That price can't be right.");
  return pence;
}

/** Pence as the editor shows it: 1250 -> "12.50", null -> "". */
export const priceInput = (pence) => (pence === null || pence === undefined ? "" : (pence / 100).toFixed(2));

const isValidDate = (value) => DATE.test(value) && !Number.isNaN(new Date(`${value}T12:00:00Z`).getTime());

/**
 * A sheet as the owner sent it, made safe to save. Empty lines are dropped;
 * a line with a price or source but no item is refused.
 * `lines[].price` may be typed text ("12.50") or `pricePence`.
 */
export function validateSheet(input, { id, now, createdAt = now }) {
  if (!input || typeof input !== "object") throw new Error("That sheet could not be read.");
  const date = String(input.date ?? "");
  if (!isValidDate(date)) throw new Error("Choose the date of the order.");
  const raw = Array.isArray(input.lines) ? input.lines : [];
  const lines = raw.flatMap((line, i) => {
    const item = clean(line?.item, MAX_ITEM);
    const qty = clean(line?.qty, MAX_QTY);
    const source = clean(line?.source, MAX_SOURCE);
    const priceValue = line?.pricePence ?? line?.price;
    if (!item && !qty && !source && (priceValue === undefined || priceValue === null || String(priceValue).trim() === "")) return [];
    if (!item) throw new Error(`Line ${i + 1} needs the item's name.`);
    let pricePence;
    try {
      pricePence = parsePrice(priceValue);
    } catch (err) {
      throw new Error(`${item}: ${err.message}`);
    }
    return [{ id: clean(line?.id, 40) || `ln_${i}`, item, qty, source, pricePence }];
  });
  if (!lines.length) throw new Error("Add at least one item.");
  if (lines.length > MAX_LINES) throw new Error(`Up to ${MAX_LINES} items on one sheet. Start a second sheet.`);
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

/**
 * What the sheet adds up to: the total of priced lines, how many lines have
 * no price, and the spend per source (largest first).
 */
export function sheetTotals(sheet) {
  const priced = sheet.lines.filter((l) => Number.isInteger(l.pricePence));
  const bySource = new Map();
  for (const line of sheet.lines) {
    const key = line.source || NO_SOURCE;
    const entry = bySource.get(key) ?? { source: key, pence: 0, items: 0 };
    bySource.set(key, { ...entry, pence: entry.pence + (line.pricePence ?? 0), items: entry.items + 1 });
  }
  return {
    totalPence: priced.reduce((sum, l) => sum + l.pricePence, 0),
    itemCount: sheet.lines.length,
    unpricedCount: sheet.lines.length - priced.length,
    bySource: [...bySource.values()].sort((a, b) => b.pence - a.pence || a.source.localeCompare(b.source)),
  };
}

/** "Fri 9 Oct 2026" for a YYYY-MM-DD date. */
export function formatSheetDate(date) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(new Date(`${date}T12:00:00Z`));
}

// The PDF's built-in fonts have no en dash: a plain hyphen marks a blank.
const BLANK = "-";

/** Everything the PDF prints, worked out ahead so it can be tested without a PDF. */
export function pdfContent(sheet) {
  const totals = sheetTotals(sheet);
  const hasSources = sheet.lines.some((l) => l.source);
  return {
    heading: sheet.title || "Expenses",
    date: formatSheetDate(sheet.date),
    columns: hasSources ? ["#", "Item", "Qty", "Source", "Price"] : ["#", "Item", "Qty", "Price"],
    rows: sheet.lines.map((line, i) => [
      String(i + 1),
      line.item,
      line.qty || BLANK,
      ...(hasSources ? [line.source || BLANK] : []),
      line.pricePence === null ? BLANK : formatPrice(line.pricePence),
    ]),
    // A breakdown only helps with more than one source.
    bySource: totals.bySource.length > 1 ? totals.bySource.map((s) => [s.source, String(s.items), formatPrice(s.pence)]) : [],
    total: formatPrice(totals.totalPence),
    itemCount: totals.itemCount,
    unpricedNote: totals.unpricedCount
      ? `${totals.unpricedCount} item${totals.unpricedCount === 1 ? " has" : "s have"} no price and ${totals.unpricedCount === 1 ? "is" : "are"} not in the total.`
      : "",
    note: sheet.note,
    fileName: `flex-chicken-expenses-${sheet.date}${sheet.title ? `-${sheet.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40)}` : ""}.pdf`,
  };
}

/** Keeps only well-formed sheets from storage, newest date first. */
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
        .map((l) => ({ id: String(l.id ?? ""), item: l.item, qty: String(l.qty ?? ""), source: String(l.source ?? ""), pricePence: Number.isInteger(l.pricePence) && l.pricePence >= 0 ? l.pricePence : null })),
      createdAt: Number.isFinite(s.createdAt) ? s.createdAt : 0,
      updatedAt: Number.isFinite(s.updatedAt) ? s.updatedAt : 0,
    }))
    .sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt);
}

/** Every source used before, for the editor's suggestions. */
export const knownSources = (sheets) => [...new Set(sheets.flatMap((s) => s.lines.map((l) => l.source)).filter(Boolean))].sort();

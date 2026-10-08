// Offers the owner pushes to the website: shown under the loyalty card and,
// when they are about money, applied to the Box. An offer the site shows is an
// offer the site honours, so "50% off" is never just a picture.
//
// Kinds:
//   percent   N% off the whole order, or off chosen dishes
//   bogof     buy one, get one free on chosen dishes (the cheaper of each pair)
//   announce  words only (an event, a new dish); no price change
//
// One offer per order: the one that saves the customer the most. Offers can
// require a minimum order and run between two times.

import { toPence } from "./cart";

export const PROMO_KINDS = Object.freeze({
  percent: "Percent off",
  bogof: "Buy one, get one free",
  announce: "Announcement",
});
export const MAX_PROMOS = 12;
const TITLE_MAX = 40;
const DETAIL_MAX = 140;
const PERCENT_MIN = 5;
const PERCENT_MAX = 90;

const clean = (value, max) => String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
const time = (value) => (Number.isFinite(value) ? value : null);

/**
 * Checks an offer typed in the admin. Throws with what to fix.
 * @returns a clean offer
 */
export function validatePromo(input) {
  const kind = PROMO_KINDS[input.kind] ? input.kind : null;
  if (!kind) throw new Error("Choose what kind of offer this is.");
  const title = clean(input.title, TITLE_MAX);
  if (!title) throw new Error("Give the offer a headline, like “2 for 1 Tuesdays”.");
  const itemIds = [...new Set((input.itemIds ?? []).filter(Number.isInteger))];
  const scope = kind === "bogof" ? "items" : input.scope === "items" ? "items" : "order";
  if (kind !== "announce" && scope === "items" && itemIds.length === 0) throw new Error("Pick the dishes this offer is for.");
  const percent = kind === "percent" ? Math.round(Number(input.percent)) : null;
  if (kind === "percent" && !(percent >= PERCENT_MIN && percent <= PERCENT_MAX)) {
    throw new Error(`The discount must be between ${PERCENT_MIN}% and ${PERCENT_MAX}%.`);
  }
  const startsAt = time(input.startsAt);
  const endsAt = time(input.endsAt);
  if (startsAt && endsAt && endsAt <= startsAt) throw new Error("The offer must end after it starts.");
  const minOrderPence = Number.isInteger(input.minOrderPence) && input.minOrderPence > 0 ? input.minOrderPence : 0;
  return {
    id: String(input.id || ""),
    kind,
    title,
    detail: clean(input.detail, DETAIL_MAX),
    percent,
    scope: kind === "announce" ? "order" : scope,
    itemIds: kind === "announce" ? [] : scope === "items" ? itemIds : [],
    minOrderPence: kind === "announce" ? 0 : minOrderPence,
    startsAt,
    endsAt,
    isActive: input.isActive !== false,
    createdAt: Number.isFinite(input.createdAt) ? input.createdAt : 0,
  };
}

/** Keeps the offers that are still valid, dropping anything malformed. */
export function readPromotions(saved) {
  if (!Array.isArray(saved)) return [];
  return saved.flatMap((p) => {
    try {
      return p && p.id ? [validatePromo(p)] : [];
    } catch {
      return [];
    }
  });
}

/** "live" | "scheduled" | "ended" | "paused" */
export function promoStatus(promo, now) {
  if (!promo.isActive) return "paused";
  if (promo.endsAt && now >= promo.endsAt) return "ended";
  if (promo.startsAt && now < promo.startsAt) return "scheduled";
  return "live";
}

export const livePromotions = (promos, now) => promos.filter((p) => promoStatus(p, now) === "live");

/** The big words on the banner: "50% OFF", "BUY 1 GET 1 FREE". */
export function promoBadge(promo) {
  if (promo.kind === "percent") return `${promo.percent}% off`;
  if (promo.kind === "bogof") return "Buy 1 get 1 free";
  return "New";
}

const lineTotal = (line) => line.qty * line.unitPence;

/** What this one offer takes off this cart, in pence (0 if it does not apply). */
export function promoSaving(promo, cart) {
  if (promo.kind === "announce") return 0;
  const subtotal = cart.lines.reduce((sum, line) => sum + lineTotal(line), 0);
  if (subtotal < promo.minOrderPence) return 0;
  const lines = promo.scope === "items" ? cart.lines.filter((line) => promo.itemIds.includes(line.itemId)) : cart.lines;

  if (promo.kind === "percent") {
    const base = lines.reduce((sum, line) => sum + lineTotal(line), 0);
    return Math.floor((base * promo.percent) / 100);
  }
  // bogof: across every unit of the chosen dishes, the cheaper half is free.
  const units = lines.flatMap((line) => Array.from({ length: line.qty }, () => line.unitPence)).sort((a, b) => a - b);
  return units.slice(0, Math.floor(units.length / 2)).reduce((sum, pence) => sum + pence, 0);
}

/**
 * The Box's money: subtotal, the best live offer and what it saves.
 * @returns {{ count: number, subtotalPence: number, discountPence: number, itemsPence: number, promo: { id: string, title: string } | null }}
 */
export function priceCart(cart, promos = [], now = Date.now()) {
  const count = cart.lines.reduce((n, line) => n + line.qty, 0);
  const subtotalPence = cart.lines.reduce((sum, line) => sum + lineTotal(line), 0);
  let best = null;
  for (const promo of livePromotions(promos, now)) {
    const saving = promoSaving(promo, cart);
    if (saving > 0 && (!best || saving > best.saving)) best = { promo, saving };
  }
  const discountPence = best ? Math.min(best.saving, subtotalPence) : 0;
  return {
    count,
    subtotalPence,
    discountPence,
    itemsPence: subtotalPence - discountPence,
    promo: best ? { id: best.promo.id, title: best.promo.title } : null,
  };
}

/** £ typed in the admin -> pence, or 0 when blank. */
export const minOrderFromPounds = (text) => (String(text ?? "").trim() === "" ? 0 : toPence(Number(text)) || 0);

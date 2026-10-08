// "How was your food?" after a receipt stamp. 4 and 5 stars go on to the
// shop's Google reviews; 1 to 3 stars lead with WhatsApp and email so the
// shop hears about the problem and can put it right. Google stays reachable
// from every rating (a small link on the low-star screen): hiding it from
// unhappy customers is review gating, which Google's policy and UK consumer
// law (DMCC Act 2024) forbid. Owner agreed, 2026-10-06.
import { BRAND } from "./brand";

export const STARS = 5;
export const GOOD_FROM = 4;
const MAX_NOTE = 1000;

export const isGoodRating = (stars) => Number.isInteger(stars) && stars >= GOOD_FROM && stars <= STARS;

export const googleReviewUrl = (reviews = BRAND.reviews) => reviews.googleReviewUrl || reviews.googleFallbackUrl;

/** The message the customer sends privately, ready to edit in WhatsApp or email. */
export function feedbackMessage({ stars, orderNumber = null, note = "" }) {
  const head = `Flex Chicken feedback: ${stars} of ${STARS} stars${orderNumber ? `, order ${orderNumber}` : ""}.`;
  const body = String(note ?? "").trim().slice(0, MAX_NOTE);
  return body ? `${head}\n\n${body}` : `${head}\n\nWhat went wrong: `;
}

/** wa.me link for the shop's number, or null when there is none. */
export function whatsappUrl(text, number = BRAND.reviews.whatsapp) {
  const digits = String(number ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function emailUrl(text, { stars, orderNumber = null }, address = BRAND.reviews.feedbackEmail) {
  const subject = `Feedback: ${stars} star${stars === 1 ? "" : "s"}${orderNumber ? `, order ${orderNumber}` : ""}`;
  return `mailto:${address}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
}

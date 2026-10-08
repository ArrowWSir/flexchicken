// One-time stamp codes, printed as a QR on the till receipt. Scanning one adds
// a stamp to the customer's card, once. Pure functions over a plain array;
// every change returns a new array.
//
// - The token is long and random: it is the only thing proving the customer
//   holds that receipt, so it cannot be guessable like the 4-digit card code.
// - One token per order. A reprint prints the same QR, so a second copy of
//   the receipt cannot earn a second stamp.
// - The stamp comes from scanning, never from leaving a review.
//
// In the database the redeem step becomes one SQL function that checks the
// token, marks it used and stamps the card together (see PLAN.md, P7).

export const TOKEN_LENGTH = 20;
export const TOKEN_TTL_MS = 14 * 24 * 60 * 60_000;
// Used tokens are kept a while so a second scan says "already used" rather
// than "not recognised"; the register never grows past this.
const MAX_KEPT_TOKENS = 600;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function cryptoBytes(length) {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

/** A fresh secret token. `bytes` is injectable for tests. */
export function mintToken(bytes = cryptoBytes) {
  // 256 is a multiple of 32, so taking the byte modulo 32 stays unbiased.
  return Array.from(bytes(TOKEN_LENGTH), (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export const normalizeToken = (value) => String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
export const isTokenShaped = (value) => new RegExp(`^[${ALPHABET}]{${TOKEN_LENGTH}}$`).test(normalizeToken(value));

/**
 * The order's stamp token, minting one the first time.
 * @returns {{ tokens: object[], token: string }}
 */
export function issueToken(tokens, orderId, now, bytes = cryptoBytes) {
  if (!orderId) throw new Error("A stamp code needs an order.");
  const existing = tokens.find((t) => t.orderId === orderId);
  if (existing) return { tokens, token: existing.token };
  const record = { token: mintToken(bytes), orderId, createdAt: now, usedAt: null, cardId: null };
  return { tokens: [...tokens, record].slice(-MAX_KEPT_TOKENS), token: record.token };
}

/** Why a token cannot be used right now, or null when it can. */
export function tokenProblem(tokens, token, now) {
  const record = tokens.find((t) => t.token === normalizeToken(token));
  if (!record) return "We don't recognise this code. Ask at the counter and we'll stamp your card.";
  if (record.usedAt) return "This receipt's stamp has already been collected.";
  if (now - record.createdAt > TOKEN_TTL_MS) return "This receipt's stamp code has expired. Ask at the counter and we'll stamp your card.";
  return null;
}

/**
 * Marks the token used by this card. Throws with a message for the customer
 * when it cannot be used.
 * @returns {{ tokens: object[], record: object }}
 */
export function redeemToken(tokens, token, cardId, now) {
  if (!cardId) throw new Error("Open your Flex card first.");
  const problem = tokenProblem(tokens, token, now);
  if (problem) throw new Error(problem);
  const key = normalizeToken(token);
  const record = { ...tokens.find((t) => t.token === key), usedAt: now, cardId };
  return { tokens: tokens.map((t) => (t.token === key ? record : t)), record };
}

/** Keeps only well-formed tokens from storage. */
export function readTokens(saved) {
  if (!Array.isArray(saved)) return [];
  return saved
    .filter((t) => t && isTokenShaped(t.token) && typeof t.orderId === "string" && Number.isFinite(t.createdAt))
    .map((t) => ({
      token: t.token,
      orderId: t.orderId,
      createdAt: t.createdAt,
      usedAt: Number.isFinite(t.usedAt) ? t.usedAt : null,
      cardId: typeof t.cardId === "string" ? t.cardId : null,
    }))
    .slice(-MAX_KEPT_TOKENS);
}

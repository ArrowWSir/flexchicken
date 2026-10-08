// Loyalty card identity for this device.
//
// The id is long, random and secret. It is kept in localStorage and mirrored
// to a 10-year cookie because iOS evicts script storage, and it is the only
// thing that proves this card belongs to this phone.
//
// The four-character code shown on the card and in the QR is a LABEL, minted
// by the database, that staff use to find the card. It is deliberately NOT
// part of the id: when it was the id's last four characters, typing four
// characters handed you somebody else's card. Losing a phone is handled by a
// one-time restore code issued at the counter instead.

// Eight stamps fill the card; the visit after that (the 9th) earns a surprise
// reward that staff choose at the counter.
export const STAMPS_PER_CARD = 8;
export const CUSTOMER_ID_KEY = "fc_customer_id";
export const CUSTOMER_CACHE_KEY = "fc_customer_cache";
export const CARD_DELETED_KEY = "fc_card_deleted";
// The marker the counter's QR carries. Scanning it at the shop is what lets a
// phone whose card was deleted start a new one.
export const FRESH_SCAN_PARAM = "new";

const ID_PREFIX = "fc_usr_";
const ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 4;
// 18 characters of a 32-character alphabet: enough that the card table cannot
// be walked by guessing, which is what the old four-character id allowed.
const ID_LENGTH = 18;
const COOKIE_DAYS = 3650;
export const RESTORE_TOKEN_LENGTH = 6;

// Values that have ended up in storage as stringified accidents rather than
// real ids. Accepting one would pin the card to an id that never resolves.
const INVALID_ID_VALUES = new Set(["undefined", "null", "nan", "card", "false", "0"]);

export function clampStamps(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(STAMPS_PER_CARD, Math.max(0, Math.floor(value)));
}

// A card id is a bearer secret, so it comes from the crypto generator.
const cryptoRandom = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;

/** The exact shape generateCustomerId makes; the server accepts only this. */
export const CARD_ID = /^fc_usr_[a-hj-np-z2-9]{18}$/;

export function generateCustomerId(random = cryptoRandom) {
  const secret = Array.from(
    { length: ID_LENGTH },
    () => ID_ALPHABET[Math.floor(random() * ID_ALPHABET.length)]
  ).join("");
  return `${ID_PREFIX}${secret.toLowerCase()}`;
}

// What a restore code looks like before it is sent anywhere. The database has
// the last word on whether it is live; this only spares a pointless round trip.
export function normalizeRestoreToken(value) {
  return String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isValidRestoreToken(value) {
  return new RegExp(`^[A-Z0-9]{${RESTORE_TOKEN_LENGTH}}$`).test(normalizeRestoreToken(value));
}

export function isValidCustomerId(id) {
  if (!id) return false;
  const clean = String(id).trim().toLowerCase().replace(/^#/, "").replace(ID_PREFIX, "");
  if (!clean || INVALID_ID_VALUES.has(clean)) return false;
  return /^[a-z0-9_-]{1,64}$/.test(clean);
}

// Only for cards the database has not named yet: the local demo, which has no
// database to mint a code, and cards made before codes existed.
export function shortCodeFromId(id) {
  return String(id).replace(ID_PREFIX, "").slice(-CODE_LENGTH).toUpperCase();
}

function safely(fn, fallback = null) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function readStoredCustomerId({ storage, cookie }) {
  const stored = safely(() => storage.getItem(CUSTOMER_ID_KEY));
  if (isValidCustomerId(stored)) return stored;
  // Poisoned entry: drop it so the next load can provision cleanly.
  if (stored) safely(() => storage.removeItem(CUSTOMER_ID_KEY));

  const fromCookie = safely(() => cookie.get(CUSTOMER_ID_KEY));
  if (isValidCustomerId(fromCookie)) {
    safely(() => storage.setItem(CUSTOMER_ID_KEY, fromCookie));
    return fromCookie;
  }
  if (fromCookie) safely(() => cookie.set(CUSTOMER_ID_KEY, "", -1));
  return null;
}

export function storeCustomerId({ storage, cookie }, id) {
  if (!isValidCustomerId(id)) return;
  safely(() => storage.setItem(CUSTOMER_ID_KEY, id));
  safely(() => cookie.set(CUSTOMER_ID_KEY, id, COOKIE_DAYS));
}

const cleanName = (value) => String(value ?? "").trim().slice(0, 40);
const cleanCode = (value) =>
  String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, CODE_LENGTH);

function readCachedCustomer(storage, id) {
  const raw = safely(() => storage.getItem(CUSTOMER_CACHE_KEY));
  const data = safely(() => JSON.parse(raw));
  if (!data || data.id !== id) return null;
  return {
    id,
    code: cleanCode(data.code),
    name: cleanName(data.name),
    stamps: clampStamps(data.stamps),
    createdAt: Number.isFinite(data.createdAt) ? data.createdAt : 0,
  };
}

// The database mints the code, so until it answers the card shows the tail of
// its own id. That is what the local demo keeps showing, and it is what cards
// made before codes existed already had printed on them.
const withCode = (record) => ({
  ...record,
  shortCode: record.code || shortCodeFromId(record.id),
});

function persist(storage, record) {
  safely(() =>
    storage.setItem(
      CUSTOMER_CACHE_KEY,
      JSON.stringify({
        id: record.id,
        code: record.code ?? "",
        name: record.name,
        stamps: record.stamps,
        createdAt: record.createdAt,
      })
    )
  );
  return withCode(record);
}

// Never throws: with storage blocked the visitor still gets a card, it just
// will not survive a reload.
export function loadCustomer(env, random = Math.random, now = Date.now()) {
  let id = readStoredCustomerId(env);
  if (!id) {
    id = generateCustomerId(random);
    storeCustomerId(env, id);
  }
  const record =
    readCachedCustomer(env.storage, id) ?? { id, code: "", name: "", stamps: 0, createdAt: now };
  return persist(env.storage, record);
}

// Keeps the on-device copy in step with the database, so the card still shows
// the right stamps when the phone is offline or the project is not configured.
export function cacheCustomer(env, customer) {
  if (!customer?.id) return customer;
  const record = {
    id: customer.id,
    code: cleanCode(customer.code ?? customer.shortCode),
    name: cleanName(customer.name),
    stamps: clampStamps(customer.stamps),
    createdAt: Number.isFinite(customer.createdAt) ? customer.createdAt : 0,
  };
  return persist(env.storage, record);
}

// The name the customer types on their own card. The counter sees it when it
// scans their QR, which is how staff can search for "Luca" instead of a code.
export function setCustomerName(env, name, now = Date.now()) {
  const current = loadCustomer(env, Math.random, now);
  return persist(env.storage, { ...current, name: cleanName(name) });
}

// "Restore my card": iOS keeps a home-screen app's storage apart from Safari,
// so one person can end up with two cards, and phones get lost or replaced.
//
// Typing the four-character code used to be enough, which meant anybody who
// read a code off a card — or off a photo of one — took it over. Now staff
// issue a one-time code at the till, the database swaps it for the card, and
// this points the device at what came back.
export function adoptRestoredCard(env, card, now = Date.now()) {
  if (!card?.id || !isValidCustomerId(card.id)) return null;
  storeCustomerId(env, card.id);
  return persist(env.storage, {
    id: card.id,
    code: cleanCode(card.code ?? card.shortCode),
    name: cleanName(card.name),
    stamps: clampStamps(card.stamps),
    createdAt: Number.isFinite(card.createdAt) ? card.createdAt : now,
  });
}

// ── A card staff threw away ──────────────────────────────────────────────
// Deleting a card has to stick to the device, or the next load would simply
// mint a new one and the delete would mean nothing. The flag is written to
// both localStorage and the cookie for the same reason the id is: iOS clears
// script storage on a home-screen card that has not been opened in a while.
export function markCardDeleted(env) {
  safely(() => env.storage.setItem(CARD_DELETED_KEY, "true"));
  safely(() => env.cookie.set(CARD_DELETED_KEY, "true", COOKIE_DAYS));
  // The card itself goes: nothing should be able to read stamps off it again.
  safely(() => env.storage.removeItem(CUSTOMER_ID_KEY));
  safely(() => env.storage.removeItem(CUSTOMER_CACHE_KEY));
  safely(() => env.cookie.set(CUSTOMER_ID_KEY, "", -1));
}

export function isCardDeleted(env) {
  const stored = safely(() => env.storage.getItem(CARD_DELETED_KEY));
  if (stored === "true") return true;
  return safely(() => env.cookie.get(CARD_DELETED_KEY)) === "true";
}

// Only the counter's QR calls this, which is what makes "come and see us" the
// way back rather than a reinstall.
export function clearCardDeleted(env) {
  safely(() => env.storage.removeItem(CARD_DELETED_KEY));
  safely(() => env.cookie.set(CARD_DELETED_KEY, "", -1));
}

// Drops the id so the next load mints a new card. Used when a device whose
// card was deleted scans the counter, because the old id is headstoned in the
// database: handing it back would leave the phone asking for a card that can
// never answer. A healthy card must never be put through this — the counter's
// QR is scanned by everybody, and forgetting their id would cost them their
// stamps.
export function forgetCard(env) {
  safely(() => env.storage.removeItem(CUSTOMER_ID_KEY));
  safely(() => env.storage.removeItem(CUSTOMER_CACHE_KEY));
  safely(() => env.cookie.set(CUSTOMER_ID_KEY, "", -1));
}

// Was this page opened by scanning the sign on the counter?
export function isFreshCounterScan(search) {
  return new URLSearchParams(search).has(FRESH_SCAN_PARAM);
}

// True at the moment the surprise reward is claimed: the counter empties a full
// card, so the customer's card goes from full to fewer stamps. That is when
// the app thanks them and asks for their name.
export function justRedeemed(previousStamps, stamps) {
  return previousStamps === STAMPS_PER_CARD && clampStamps(stamps) < previousStamps;
}

export function stampProgress(stamps) {
  const filled = clampStamps(stamps);
  return {
    filled,
    remaining: STAMPS_PER_CARD - filled,
    isComplete: filled === STAMPS_PER_CARD,
  };
}

// Design previews only: `?stamps=5` shows a part-filled card without saving it.
export function previewStampsFromSearch(search) {
  const value = new URLSearchParams(search).get("stamps");
  if (value === null || !/^\d+$/.test(value)) return null;
  return clampStamps(Number(value));
}

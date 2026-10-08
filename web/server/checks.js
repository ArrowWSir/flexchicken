// Input checks for the server. Everything a browser sends is a claim, so each
// value is rebuilt here from what the shop accepts before the repo sees it.
import { CARD_ID } from "../app/lib/card.js";
import { milesFromShop } from "../app/lib/geo.js";
import { cleanFields } from "../app/lib/menuEdits.js";
import { lookupPostcode, normalizePostcode } from "../app/lib/postcode.js";
import { EMAIL, UK_PHONE } from "../app/lib/store/repo.js";

export class ShopError extends Error {
  /** @param {number} status @param {string} message */
  constructor(status, message) {
    super(message);
    this.name = "ShopError";
    this.status = status;
  }
}

const CUSTOMER_ID = /^usr_[a-z0-9]{1,16}$/;
const PHOTO_DATA = /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/]+=*$/;
const PHOTO_PATH = /^\/(menu|api\/photo)\/[A-Za-z0-9_.-]{1,120}$/;
// A 600 px WebP from lib/imageUpload is well under this.
export const MAX_PHOTO_CHARS = 1_400_000;
const MAX_UPDATED = 500;
const MAX_ADDED = 200;
const MAX_OPTIONS = 12;
const MAX_CHOICES = 30;
const MAX_PRICE_ADD = 100;
const ADDED_ID = /^new-[a-z0-9]{1,12}$/;

export const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

/** Trimmed text up to `max` characters; "" for anything that is not text. */
export const text = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");

export function requireObject(value, message) {
  if (!isObject(value)) throw new Error(message);
  return value;
}

export function requireId(value) {
  if (typeof value !== "string" || !value || value.length > 80) throw new Error("That item no longer exists.");
  return value;
}

/** A loyalty card id exactly as the phone makes it, or an error. */
export function cleanCardId(id, message = "That card could not be read.") {
  if (typeof id !== "string" || !CARD_ID.test(id)) throw new Error(message);
  return id;
}

export function cleanCustomer(customer) {
  const c = requireObject(customer, "Please sign in to place an order.");
  const id = text(c.id, 40);
  const name = text(c.name, 60);
  const email = text(c.email, 120).toLowerCase();
  const phone = text(c.phone, 20);
  if (!CUSTOMER_ID.test(id)) throw new Error("Please sign in again to place an order.");
  if (!name) throw new Error("Please enter your name.");
  if (!EMAIL.test(email)) throw new Error("Please enter a valid email address.");
  if (!UK_PHONE.test(phone)) throw new Error("Please enter a valid phone number.");
  return { id, name, email, phone };
}

const isPoint = (p) =>
  Number.isFinite(p?.latitude) && Number.isFinite(p?.longitude) && Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180;

/**
 * The delivery address with a position the server trusts: the postcode is
 * looked up again and its own position sets the fee (the checkout prices
 * from the same position). If postcodes.io cannot be reached the customer's
 * point stands, marked unchecked, so an outage there does not stop orders.
 */
export async function verifyAddress(address, fetcher) {
  const a = requireObject(address, "Add your delivery address.");
  const line1 = text(a.line1, 120);
  if (!line1) throw new Error("Add the first line of your delivery address.");
  const postcode = normalizePostcode(a.postcode);
  if (!postcode) throw new Error("Please enter a valid UK postcode, like RM13 9AA.");

  let isUnreachable = false;
  const guarded = async (url) => {
    try {
      return await fetcher(url);
    } catch (err) {
      isUnreachable = true;
      throw err;
    }
  };
  let found = null;
  try {
    found = await lookupPostcode(postcode, guarded);
  } catch (err) {
    if (!isUnreachable) throw err;
  }
  const claimed = isPoint(a) ? { latitude: a.latitude, longitude: a.longitude } : null;
  const point = found ?? claimed;
  const miles = point ? Math.round(milesFromShop(point) * 10) / 10 : null;
  return {
    line1,
    line2: text(a.line2, 120),
    postcode: found?.postcode ?? postcode,
    latitude: point?.latitude ?? null,
    longitude: point?.longitude ?? null,
    miles,
    isChecked: Boolean(found),
  };
}

/** A driver's GPS fix with only the fields the map uses. */
export function cleanPoint(point) {
  const p = requireObject(point, "That is not a location.");
  return { latitude: p.latitude, longitude: p.longitude, accuracy: Number.isFinite(p.accuracy) ? p.accuracy : null };
}

function cleanOptions(options) {
  if (!Array.isArray(options) || options.length > MAX_OPTIONS) throw new Error("Check the item's options.");
  return options.map((option) => {
    const label = text(option?.label, 60);
    const choices = option?.choices;
    if (!label || !Array.isArray(choices) || choices.length === 0 || choices.length > MAX_CHOICES) throw new Error("Check the item's options.");
    return {
      label,
      isRequired: option.isRequired === true,
      choices: choices.map((choice) => {
        const name = text(choice?.label, 60);
        const priceAdd = Number(choice?.priceAdd ?? 0);
        if (!name || !Number.isFinite(priceAdd) || priceAdd < 0 || priceAdd > MAX_PRICE_ADD) throw new Error(`Check the option "${label}".`);
        return { label: name, priceAdd: Math.round(priceAdd * 100) / 100 };
      }),
    };
  });
}

/**
 * Menu edits checked field by field (the same rules as the menu editor), with
 * every uploaded photo moved to the photo store (`savePhoto` gives back its
 * address). Only the shop's own image paths are kept.
 */
export function cleanMenuEdits(edits, savePhoto) {
  const e = requireObject(edits, "Those menu changes could not be read.");
  const photo = (image) => {
    if (image === null || image === undefined || image === "") return null;
    if (typeof image === "string" && PHOTO_PATH.test(image)) return image;
    if (typeof image === "string" && image.length <= MAX_PHOTO_CHARS && PHOTO_DATA.test(image)) return savePhoto(image);
    throw new Error("That photo could not be used. Pick a JPEG, PNG or WebP photo.");
  };
  const clean = (fields) => {
    const out = cleanFields(fields);
    if ("options" in out) out.options = cleanOptions(out.options);
    if ("image" in out) out.image = photo(out.image);
    return out;
  };
  const ids = (list) => (Array.isArray(list) ? list.filter((x) => (typeof x === "number" && Number.isInteger(x)) || (typeof x === "string" && x.length <= 40)).slice(0, MAX_UPDATED) : []);
  const updated = Object.entries(isObject(e.updated) ? e.updated : {});
  const added = Array.isArray(e.added) ? e.added : [];
  if (updated.length > MAX_UPDATED || added.length > MAX_ADDED) throw new Error("Too many menu changes at once.");
  return {
    updated: Object.fromEntries(updated.filter(([id, p]) => id.length <= 40 && isObject(p)).map(([id, p]) => [id, clean(p)])),
    added: added.map((item) => {
      if (!isObject(item) || !ADDED_ID.test(item.id ?? "")) throw new Error("That new dish could not be read.");
      const fields = clean({ description: "", options: [], image: null, ...item });
      if (!fields.name || !("price" in fields) || !fields.categoryId) throw new Error("Give the new dish a name, a price and a section.");
      return { id: item.id, slug: ADDED_ID.test(item.slug ?? "") ? item.slug : item.id, isMeal: item.isMeal === true, ...fields };
    }),
    removed: ids(e.removed),
    soldOut: ids(e.soldOut),
  };
}

/** Photo ids the menu still uses, so the rest can be deleted. */
export function photoIdsIn(edits) {
  const images = [...Object.values(edits.updated).map((p) => p.image), ...edits.added.map((i) => i.image)];
  return images.flatMap((image) => {
    const match = typeof image === "string" ? /^\/api\/photo\/([A-Za-z0-9_-]+)\./.exec(image) : null;
    return match ? [match[1]] : [];
  });
}

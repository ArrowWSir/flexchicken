// The shop's register of loyalty cards: who holds one, their 4-digit member
// code and their stamps. Pure functions over a plain array; every change
// returns a new array. The repo stores it; the database replaces it later.
//
// Lessons kept from the VaffanCoffee card (see PLAN.md):
//  - A stamp is one step on the stored record, never "read, add one, write
//    the whole card back" from two places at once. Here the repo applies each
//    change to the latest list; in the database it becomes one SQL statement.
//  - Lifetime stamps, rewards, last stamp and last reward are kept as their
//    own fields, so history is honest and "last visit" is a real stamp, not
//    a page view.
//  - Undoing a stamp floors at zero and leaves lastStampAt alone, so fixing a
//    mistake does not make the customer look like they just visited.
//  - Redeeming only works on a full card: a double tap cannot give two.
//  - Every change is logged on the card (who, what, when), capped.
//
// The 4-digit code is a LABEL for the counter, not a secret and not the card
// id: knowing someone's code lets staff find the card, nothing more.

import { STAMPS_PER_CARD, clampStamps } from "./card";

export const CODE_DIGITS = 4;
const CODE_MIN = 1000; // no leading zero: "0427" reads back as "427"
const CODE_MAX = 9999;
const RANDOM_TRIES = 40;
const MAX_HISTORY = 40;
const NAME_MAX = 40;

const cleanName = (value) => String(value ?? "").trim().replace(/\s+/g, " ").slice(0, NAME_MAX);
const cleanEmail = (value) => String(value ?? "").trim().toLowerCase().slice(0, 120);

/** A free 4-digit code. Random, so codes do not reveal how many cards exist. */
export function mintCode(taken, random = Math.random) {
  const used = new Set(taken);
  for (let i = 0; i < RANDOM_TRIES; i += 1) {
    const code = String(CODE_MIN + Math.floor(random() * (CODE_MAX - CODE_MIN + 1)));
    if (!used.has(code)) return code;
  }
  for (let n = CODE_MIN; n <= CODE_MAX; n += 1) {
    if (!used.has(String(n))) return String(n);
  }
  throw new Error("Every 4-digit member code is in use.");
}

export const isMemberCode = (value) => /^\d{4}$/.test(String(value ?? "").trim());

function newCard({ id, name, email }, code, now) {
  return {
    id,
    code,
    name: cleanName(name),
    email: cleanEmail(email),
    stamps: 0,
    lifetimeStamps: 0,
    rewards: 0,
    lastStampAt: null,
    lastRewardAt: null,
    createdAt: now,
    history: [],
  };
}

/**
 * Makes sure this device's card is on the register, filling in a name or
 * email it did not have. Never overwrites a name the card already has.
 * @returns {{ cards: object[], card: object }}
 */
export function registerCard(cards, { id, name = "", email = "" }, now, random = Math.random) {
  if (!id) throw new Error("A card needs an id.");
  const existing = cards.find((c) => c.id === id);
  if (existing) {
    const patch = {};
    if (!existing.name && cleanName(name)) patch.name = cleanName(name);
    if (!existing.email && cleanEmail(email)) patch.email = cleanEmail(email);
    if (!Object.keys(patch).length) return { cards, card: existing };
    const card = { ...existing, ...patch };
    return { cards: cards.map((c) => (c.id === id ? card : c)), card };
  }
  const card = newCard({ id, name, email }, mintCode(cards.map((c) => c.code), random), now);
  return { cards: [...cards, card], card };
}

const log = (card, type, at, by) => [...card.history, { type, at, by: by || "staff" }].slice(-MAX_HISTORY);

function change(cards, id, fn) {
  const card = cards.find((c) => c.id === id);
  if (!card) throw new Error("That card is not on the register.");
  const next = fn(card);
  return cards.map((c) => (c.id === id ? next : c));
}

/** One stamp. A full card stays full; it is redeemed, not over-filled. */
export function addStamp(cards, id, now, by) {
  return change(cards, id, (card) => {
    if (card.stamps >= STAMPS_PER_CARD) throw new Error("This card is full. Give the surprise first.");
    return {
      ...card,
      stamps: clampStamps(card.stamps + 1),
      lifetimeStamps: card.lifetimeStamps + 1,
      lastStampAt: now,
      history: log(card, "stamp", now, by),
    };
  });
}

/** Takes back a stamp given by mistake. */
export function removeStamp(cards, id, now, by) {
  return change(cards, id, (card) => {
    if (card.stamps <= 0) throw new Error("This card has no stamps to take back.");
    return {
      ...card,
      stamps: card.stamps - 1,
      lifetimeStamps: Math.max(0, card.lifetimeStamps - 1),
      history: log(card, "unstamp", now, by),
    };
  });
}

/** The 9th-visit surprise: only from a full card, which then starts again. */
export function redeemReward(cards, id, now, by) {
  return change(cards, id, (card) => {
    if (card.stamps < STAMPS_PER_CARD) throw new Error(`The surprise comes after ${STAMPS_PER_CARD} stamps.`);
    return { ...card, stamps: 0, rewards: card.rewards + 1, lastRewardAt: now, history: log(card, "reward", now, by) };
  });
}

export function renameCard(cards, id, name) {
  return change(cards, id, (card) => ({ ...card, name: cleanName(name) }));
}

/**
 * Search for the counter: digits match the code from the start ("42" finds
 * 4271), anything else the name or email. Most recently stamped first.
 */
export function findCards(cards, query) {
  const q = String(query ?? "").trim().toLowerCase();
  const matches = !q
    ? cards
    : /^\d+$/.test(q)
      ? cards.filter((c) => c.code.startsWith(q))
      : cards.filter((c) => c.name.toLowerCase().includes(q) || c.email.includes(q));
  return [...matches].sort((a, b) => (b.lastStampAt ?? b.createdAt) - (a.lastStampAt ?? a.createdAt));
}

/** Keeps only well-formed cards from storage. */
export function readCards(saved) {
  if (!Array.isArray(saved)) return [];
  return saved
    .filter((c) => c && typeof c.id === "string" && isMemberCode(c.code))
    .map((c) => ({
      ...newCard(c, c.code, Number.isFinite(c.createdAt) ? c.createdAt : 0),
      stamps: clampStamps(c.stamps),
      lifetimeStamps: Number.isInteger(c.lifetimeStamps) && c.lifetimeStamps >= 0 ? c.lifetimeStamps : 0,
      rewards: Number.isInteger(c.rewards) && c.rewards >= 0 ? c.rewards : 0,
      lastStampAt: Number.isFinite(c.lastStampAt) ? c.lastStampAt : null,
      lastRewardAt: Number.isFinite(c.lastRewardAt) ? c.lastRewardAt : null,
      history: Array.isArray(c.history) ? c.history.slice(-MAX_HISTORY) : [],
    }));
}

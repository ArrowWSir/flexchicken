"use client";
import { useEffect, useMemo, useState } from "react";
import { EMPTY_EDITS } from "../lib/menuEdits";
import { BASE_CATEGORIES, liveMenu } from "../lib/liveMenu";
import { DEFAULT_SETTINGS } from "../lib/settings";
import { getRepo } from "../lib/store";

/**
 * Re-reads `read(repo)` whenever `topic` changes in any tab. Server render and
 * the first client render use `initial`, so markup always matches.
 */
export function useRepoValue(topic, read, initial) {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    const repo = getRepo();
    const refresh = () => setValue(read(repo));
    // From the database, `initial` stands until the first answer, so a
    // loading list is never mistaken for an empty one.
    const unsubscribe = repo.subscribe(topic, refresh);
    if (repo.isReady(topic)) refresh();
    return unsubscribe;
    // `read` is expected to be a stable function per call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic]);
  return value;
}

const readEdits = (repo) => repo.getMenuEdits();
const readSettings = (repo) => repo.getSettings();
const readOrders = (repo) => repo.listOrders();
const readStaff = (repo) => repo.listStaff();
const readShifts = (repo) => repo.listShifts();
const readCards = (repo) => repo.listCards();
const readPromotions = (repo) => repo.listPromotions();
const readExpenseSheets = (repo) => repo.listExpenseSheets();

/** The live menu: generated data with the owner's edits from /admin/menu. */
export function useMenu() {
  const edits = useRepoValue("menu", readEdits, EMPTY_EDITS);
  return useMemo(() => {
    const all = liveMenu(edits);
    return {
      all,
      categories: all.filter((c) => c.id !== "drinks" && c.items.length > 0),
      drinks: all.find((c) => c.id === "drinks") ?? null,
      edits,
    };
  }, [edits]);
}

export const BASE_MENU = BASE_CATEGORIES;

export function useSettings() {
  return useRepoValue("settings", readSettings, DEFAULT_SETTINGS);
}

// What useOrders returns before the store has been read: kept apart from a
// real empty list so alerts do not take the first read as a flood of new orders.
export const ORDERS_LOADING = Object.freeze([]);
export const isOrdersLoaded = (orders) => orders !== ORDERS_LOADING;

export function useOrders() {
  return useRepoValue("orders", readOrders, ORDERS_LOADING);
}

export function useOrder(id) {
  const orders = useOrders();
  // Asking the repo for it lets a tracking link opened on another phone
  // follow that order too.
  useEffect(() => {
    if (id) getRepo().getOrder(id);
  }, [id]);
  return orders.find((o) => o.id === id) ?? null;
}

/** The owner's expense sheets, newest date first. */
export function useExpenseSheets() {
  return useRepoValue("expenses", readExpenseSheets, []);
}

/** The team, including people who have left (isActive false). */
export function useStaff() {
  return useRepoValue("staff", readStaff, []);
}

export function useShifts() {
  return useRepoValue("shifts", readShifts, []);
}

/** Every loyalty card on the register (admin). */
export function useCards() {
  return useRepoValue("cards", readCards, []);
}

/** The owner's offers, live or not; filter with livePromotions. */
export function usePromotions() {
  return useRepoValue("promotions", readPromotions, []);
}

export function useDriverLocation(orderId) {
  const [location, setLocation] = useState(null);
  useEffect(() => {
    if (!orderId) return undefined;
    const repo = getRepo();
    const refresh = () => setLocation(repo.getLocation(orderId));
    refresh();
    return repo.subscribe("locations", refresh);
  }, [orderId]);
  return location;
}
